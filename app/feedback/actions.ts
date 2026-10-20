"use server";

import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getLatestApplication } from "@/lib/applications";
import { notify } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyTable } from "@/lib/table";

export type FeedbackState = { error?: string; ok?: string } | undefined;

async function myTable() {
  const { supabase, profile } = await requireParticipant();
  const app = await getLatestApplication(supabase, profile.id);
  if (!app || app.match_status !== "CONFIRMED" || app.attendance_status !== "ATTENDED") return null;
  const table = await getMyTable(app.id, profile.id);
  return table ? { profile, table } : null;
}

const score = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return n >= 1 && n <= 5 ? n : null;
};

// FDB-02·03·04: 만족도(분위기·대화·식당), 재참여·추천 의향, 사람별 선호(비공개)
export async function submitFeedback(_: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const ctx = await myTable();
  if (!ctx) return { error: "체크인한 모임에만 피드백을 남길 수 있어요." };
  const { profile, table } = ctx;
  const values = {
    mood: score(formData.get("mood")), conversation: score(formData.get("conversation")), venue: score(formData.get("venue")),
    rejoin_intent: score(formData.get("rejoin_intent")), recommend_intent: score(formData.get("recommend_intent")),
  };
  if (Object.values(values).some((v) => v === null)) return { error: "다섯 가지 질문에 모두 답해 주세요." };

  const db = createAdminClient();
  const { error } = await db.from("feedbacks").insert({ table_id: table.tableId, profile_id: profile.id, ...values });
  if (error) {
    if (error.code === "23505") redirect("/table");
    return { error: "피드백을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  // 사람별 선호: 같은 테이블 사람에게만, 상대에게는 공개되지 않는다
  for (const m of table.members.filter((x) => !x.me)) {
    const pick = String(formData.get(`pref-${m.profileId}`) ?? "");
    if (pick !== "WANT_AGAIN" && pick !== "AVOID") continue;
    await db.from("person_preferences").delete().eq("from_profile", profile.id).eq("to_profile", m.profileId);
    await db.from("person_preferences").insert({ from_profile: profile.id, to_profile: m.profileId, kind: pick, table_id: table.tableId });
  }
  await notify(db, { profileId: profile.id, key: "FEEDBACK_DONE", title: "피드백을 남겨 주셔서 고마워요", body: "남겨 주신 평가와 선호는 다음 매칭에 반영돼요. 상대에게는 공개되지 않아요.", link: "/history" });
  redirect("/history?feedback=1");
}

// SAF-01 신고·차단: 신고 내용은 상대에게 공개되지 않고, 신고한 사람과 신고된 사람은 다음 매칭부터 같은 테이블에 배정되지 않는다
export async function reportUser(_: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const { supabase, profile } = await requireParticipant();
  const app = await getLatestApplication(supabase, profile.id);
  const table = app && app.match_status === "CONFIRMED" ? await getMyTable(app.id, profile.id) : null;
  const to = String(formData.get("to") ?? "");
  const target = table?.members.find((m) => m.profileId === to && !m.me);
  if (!table || !target) return { error: "같은 테이블 참가자만 신고할 수 있어요." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { error: "어떤 일이 있었는지 5자 이상 적어 주세요." };
  if (reason.length > 1000) return { error: "1000자까지 적을 수 있어요." };

  const db = createAdminClient();
  await db.from("safety_reports").insert({ reporter: profile.id, reported: to, table_id: table.tableId, reason });
  if (formData.get("block") === "on") await db.from("user_blocks").upsert({ blocker: profile.id, blocked: to }, { onConflict: "blocker,blocked", ignoreDuplicates: true });
  await notify(db, { profileId: profile.id, key: "REPORT_RECEIVED", title: "신고가 접수됐어요",
    body: `운영팀이 검토할게요. ${target.name}님과는 다음 매칭부터 같은 테이블에 배정되지 않아요. 신고 내용은 상대에게 공개되지 않아요.`, link: "/notifications" });
  return { ok: `${target.name}님 신고를 접수했어요.${formData.get("block") === "on" ? " 차단도 했어요." : ""} 다음 매칭부터 같은 테이블에 배정되지 않아요.` };
}
