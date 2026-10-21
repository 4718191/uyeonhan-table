import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { deliver } from "@/lib/delivery";
import { logStatus, type StatusChange } from "@/lib/history";
import { notify, type NotifyInput } from "@/lib/notify";
import { fmtEventDate, fmtTime, todayKST } from "@/lib/time";
import { MAX_AGE_GAP, MAX_SIZE, MIN_SIZE, pairKey } from "@/modules/matching/score";
import { tablesInSlot, type EventTable } from "./tables";

// 확정 후 취소 (MVP 6장 운영 정책, PRD 15장)
// - 매칭 마감 이후 취소는 모두 CANCELED_LATE, 환불 없음. 당일 취소는 이용 제한 검토 대상.
// - 당일 취소: 단체방을 나갈 수 없으므로 테이블 구성은 그대로 두고 참석 상태만 바꾼다.
// - 전날까지 취소: 테이블에서 빠진다. 4명 이상 남으면 유지, 4명 미만이면 테이블을 해제하고
//   남은 사람을 같은 회차의 다른 확정 테이블(6명 미만·나이 차·차단 조건·식당 좌석 충족)로 자동 재배치한다.
//   들어갈 테이블이 없으면 대체 일정·보관·환불(멤버십은 기한 연장)을 고르도록 안내한다. 이 경우 환불 마감 이후에도 환불 가능.

type Db = ReturnType<typeof createAdminClient>;
export type CancelResult = { ok: boolean; message: string };

const slotLabel = (s: EventTable["slot"]) => `${fmtEventDate(s.event_date)} ${fmtTime(s.start_time)} ${REGIONS[s.region as RegionCode]}`;

export async function cancelConfirmed(applicationId: string, profileId: string): Promise<CancelResult> {
  const db = createAdminClient();
  const { data: app } = await db.from("applications")
    .select("id, profile_id, application_status, match_status, attendance_status, confirmed_slot_id")
    .eq("id", applicationId).maybeSingle();
  if (!app || app.profile_id !== profileId || app.application_status !== "SUBMITTED" || app.match_status !== "CONFIRMED" || app.attendance_status !== "SCHEDULED")
    return { ok: false, message: "지금은 참석을 취소할 수 없는 상태예요." };

  const { data: tm } = await db.from("table_members").select("table_id").eq("application_id", app.id).eq("active", true).maybeSingle();
  if (!tm) return { ok: false, message: "확정된 테이블을 찾지 못했어요." };
  const table = (await tablesInSlot(db, app.confirmed_slot_id!)).find((t) => t.id === tm.table_id);
  if (!table) return { ok: false, message: "확정된 테이블을 찾지 못했어요." };
  const today = todayKST();
  if (table.slot.event_date < today) return { ok: false, message: "이미 지난 모임이에요." };
  const sameDay = table.slot.event_date === today;

  // 선점: SCHEDULED일 때만 바꾼다 (두 번 눌러도 한 번만 처리)
  const { data: changed } = await db.from("applications")
    .update({ application_status: "CANCELED", attendance_status: "CANCELED_LATE" })
    .eq("id", app.id).eq("attendance_status", "SCHEDULED").select("id");
  if (!changed?.length) return { ok: true, message: "이미 취소된 참석이에요." };

  const me = table.members.find((m) => m.appId === app.id);
  const changes: StatusChange[] = [
    { entity: "application", entityId: app.id, field: "attendance_status", from: "SCHEDULED", to: "CANCELED_LATE", actor: "PARTICIPANT", actorProfileId: profileId,
      reason: sameDay ? "당일 취소 (이용 제한 검토 대상, 환불 없음)" : "확정 후 취소 (환불 없음)" },
    { entity: "application", entityId: app.id, field: "application_status", from: "SUBMITTED", to: "CANCELED", actor: "PARTICIPANT", actorProfileId: profileId, reason: "확정 후 취소" },
  ];
  const notes: NotifyInput[] = [{
    profileId, key: "ATTENDANCE_CANCELED", title: "참석을 취소했어요",
    body: sameDay ? "당일 취소는 환불되지 않고 이용 제한 검토 대상이에요." : "매칭 마감 이후 취소라 환불되지 않아요.", link: "/home",
  }];

  if (sameDay) {
    if (table.roomId) await deliver(db, "chat_messages", [{ room_id: table.roomId, kind: "NOTICE",
      body: `${me?.name ?? "참가자"}님이 오늘 참석을 취소했어요. 남은 분들은 예정대로 만나요.` }], "단체방 인원 변경 안내");
    await logStatus(db, changes);
    await notify(db, notes);
    return { ok: true, message: "참석을 취소했어요. 당일 취소는 환불되지 않고 이용 제한 검토 대상이에요." };
  }

  // 테이블에서 빠진다
  await db.from("table_members").update({ active: false, left_at: new Date().toISOString() }).eq("application_id", app.id).eq("active", true);
  const remaining = table.members.filter((m) => m.appId !== app.id);

  if (remaining.length >= MIN_SIZE) {
    await db.from("dining_tables").update({ size: remaining.length }).eq("id", table.id);
    if (table.roomId) await deliver(db, "chat_messages", [{ room_id: table.roomId, kind: "NOTICE",
      body: `참가자 1명이 참석을 취소했어요. ${remaining.length}명으로 예정대로 진행해요. 예약명은 그대로예요.` }], "단체방 인원 변경 안내");
    remaining.forEach((m) => notes.push({ profileId: m.profileId, key: "TABLE_CHANGED", title: "테이블 인원이 바뀌었어요", body: `${slotLabel(table.slot)} 모임은 ${remaining.length}명으로 예정대로 진행해요.`, link: "/chat" }));
    await logStatus(db, [...changes, { entity: "table", entityId: table.id, field: "size", from: String(table.members.length), to: String(remaining.length), actor: "SYSTEM", reason: "확정 후 취소, 4명 이상이라 유지" }]);
    await notify(db, notes);
    return { ok: true, message: "참석을 취소했어요. 매칭 마감 이후 취소라 환불되지 않아요." };
  }

  // 4명 미만 → 테이블 해제 후 남은 사람 자동 재배치
  await db.from("dining_tables").update({ status: "DISSOLVED", size: remaining.length }).eq("id", table.id);
  changes.push({ entity: "table", entityId: table.id, field: "status", from: "CONFIRMED", to: "DISSOLVED", actor: "SYSTEM", reason: `확정 후 취소로 ${remaining.length}명 남음 (4명 미만)` });
  if (table.roomId) await deliver(db, "chat_messages", [{ room_id: table.roomId, kind: "NOTICE",
    body: `참가자가 취소해 ${remaining.length}명이 남아 이 테이블은 해제됐어요. 남은 분들은 같은 날 다른 테이블로 자동으로 옮기거나, 옮길 테이블이 없으면 다른 일정·환불을 고를 수 있게 안내해 드릴게요.` }], "단체방 인원 변경 안내");
  await db.from("table_members").update({ active: false, left_at: new Date().toISOString() }).eq("table_id", table.id).eq("active", true);

  const result = await reallocate(db, table, remaining, changes, notes);
  await logStatus(db, changes);
  await notify(db, notes);
  return { ok: true, message: `참석을 취소했어요. 매칭 마감 이후 취소라 환불되지 않아요.${result}` };
}

async function reallocate(db: Db, from: EventTable, people: EventTable["members"], changes: StatusChange[], notes: NotifyInput[]) {
  const others = (await tablesInSlot(db, from.slot.id)).filter((t) => t.id !== from.id);
  const ids = [...people, ...others.flatMap((t) => t.members)].map((m) => m.profileId);
  const [blocks, avoids, reports] = await Promise.all([
    db.from("user_blocks").select("blocker, blocked").or(`blocker.in.(${ids}),blocked.in.(${ids})`),
    db.from("person_preferences").select("from_profile, to_profile").eq("kind", "AVOID").in("from_profile", ids),
    db.from("safety_reports").select("reporter, reported").or(`reporter.in.(${ids}),reported.in.(${ids})`),
  ]);
  const blocked = new Set<string>();
  (blocks.data ?? []).forEach((r) => blocked.add(pairKey(r.blocker, r.blocked)));
  (avoids.data ?? []).forEach((r) => blocked.add(pairKey(r.from_profile, r.to_profile)));
  (reports.data ?? []).forEach((r) => blocked.add(pairKey(r.reporter, r.reported)));

  // 식당 남은 좌석
  const availIds = [...new Set(others.map((t) => t.availId).filter(Boolean))] as string[];
  const seats = new Map<string, number>();
  if (availIds.length) {
    const [{ data: cap }, { data: used }] = await Promise.all([
      db.from("venue_availability").select("id, capacity").in("id", availIds),
      db.from("dining_tables").select("venue_availability_id, size").in("venue_availability_id", availIds).eq("status", "CONFIRMED"),
    ]);
    (cap ?? []).forEach((c) => seats.set(c.id, c.capacity));
    (used ?? []).forEach((u) => seats.set(u.venue_availability_id, (seats.get(u.venue_availability_id) ?? 0) - u.size));
  }

  // 나중 회차 (대체 일정 추천용)
  const { data: later } = await db.from("event_slots").select("id, region").eq("status", "OPEN").gt("event_date", from.slot.event_date).order("match_at").limit(20);

  let moved = 0;
  for (const p of people) {
    const target = others
      .filter((t) => t.members.length < MAX_SIZE && t.availId && (seats.get(t.availId) ?? 0) >= 1)
      .filter((t) => {
        const ys = [...t.members.map((m) => m.birthYear ?? 0), p.birthYear ?? 0];
        return Math.max(...ys) - Math.min(...ys) <= MAX_AGE_GAP && t.members.every((m) => !blocked.has(pairKey(m.profileId, p.profileId)));
      })
      .sort((a, b) => a.members.length - b.members.length)[0];

    if (target) {
      moved++;
      await db.from("table_members").insert({ table_id: target.id, application_id: p.appId });
      target.members.push(p);
      seats.set(target.availId!, (seats.get(target.availId!) ?? 0) - 1);
      await db.from("dining_tables").update({ size: target.members.length }).eq("id", target.id);
      const reason = `확정 테이블(${from.no}번) 인원 부족으로 해제 → 같은 회차 ${target.no}번 테이블로 자동 재배치`;
      await db.from("applications").update({ placement_reason: reason }).eq("id", p.appId);
      changes.push({ entity: "application", entityId: p.appId, field: "table", from: String(from.no), to: String(target.no), actor: "SYSTEM", reason });
      if (target.roomId) await deliver(db, "chat_messages", [{ room_id: target.roomId, kind: "NOTICE",
        body: `${p.name}님이 함께하게 됐어요. 이제 ${target.members.length}명이에요. 장소·시간·예약명은 그대로예요.` }], "단체방 인원 변경 안내");
      notes.push({ profileId: p.profileId, key: "TABLE_MOVED", title: "같은 날 다른 테이블로 옮겼어요",
        body: `${slotLabel(from.slot)} · ${target.venue?.name ?? ""} · 예약명 우연한 식탁 ${target.no}번 테이블. 단체방에서 새로운 분들과 인사해 보세요.`, link: "/table" });
      target.members.forEach((m) => m.appId !== p.appId && notes.push({ profileId: m.profileId, key: "TABLE_CHANGED", title: "새로운 분이 함께해요", body: `${p.name}님이 테이블에 합류했어요.`, link: "/chat" }));
    } else {
      // 들어갈 테이블이 없으면 실패 해결로 (MVP 6장: 매칭 불가로 인한 환불이라 환불 마감 이후에도 허용)
      const { data: a } = await db.from("applications").select("payment_status, passes(type)").eq("id", p.appId).single();
      const single = ((Array.isArray(a?.passes) ? a?.passes[0] : a?.passes) as { type: string } | null)?.type === "SINGLE";
      const rec = (later ?? []).filter((s) => s.region === from.slot.region).concat((later ?? []).filter((s) => s.region !== from.slot.region)).slice(0, 3);
      const status = rec.length ? "ALTERNATIVE_OFFERED" : "NO_MATCH";
      const reason = `확정 테이블(${from.no}번)이 취소로 4명 미만이 되어 해제, 같은 회차에 들어갈 테이블 없음`;
      await db.from("applications").update({ match_status: status, confirmed_slot_id: null, attendance_status: null, placement_reason: reason, ...(single ? { payment_status: "REFUND_AVAILABLE" } : {}) }).eq("id", p.appId);
      if (single) await db.from("payments").update({ status: "REFUND_AVAILABLE" }).eq("application_id", p.appId).eq("status", "PAID");
      await db.from("match_resolutions").upsert({ application_id: p.appId, recommended_slot_ids: rec.map((s) => s.id), status: "PENDING", choice: null, resolved_at: null }, { onConflict: "application_id" });
      changes.push({ entity: "application", entityId: p.appId, field: "match_status", from: "CONFIRMED", to: status, actor: "SYSTEM", reason });
      notes.push({ profileId: p.profileId, key: "MATCH_FAILED", title: "테이블이 해제됐어요",
        body: `다른 참가자 취소로 ${slotLabel(from.slot)} 테이블이 4명 미만이 됐어요. ${single ? "다른 일정 이동, 1회권 보관, 환불" : "다른 일정 이동, 멤버십 기한 연장"} 중에서 고를 수 있어요.`, link: "/resolve" });
    }
  }
  const failed = people.length - moved;
  return ` 남은 ${people.length}명 중 ${moved}명은 다른 테이블로 옮겼고${failed ? `, ${failed}명에게는 다른 일정·환불 선택을 안내했어요` : ""}.`;
}
