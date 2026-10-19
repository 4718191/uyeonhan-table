import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// 확정된 내 테이블 정보 (매칭 확정 상세·단체방에서 함께 쓴다).
// 식당 수용 인원 정보는 운영자만 읽을 수 있어, 본인 신청임을 확인한 뒤 서버에서만 조회한다.

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export type MyTable = {
  tableId: string;
  tableNo: number | null;
  size: number;
  slot: { event_date: string; start_time: string; region: string };
  venue: { name: string; address: string | null; map_url: string | null; price_range: string | null; rating: number | null } | null;
  roomId: string | null;
  members: { profileId: string; name: string; interests: string[]; selfTraits: string[]; me: boolean }[];
};

export async function getMyTable(applicationId: string, myProfileId: string): Promise<MyTable | null> {
  const db = createAdminClient();
  const { data: tm } = await db
    .from("table_members")
    .select("table_id, dining_tables(id, table_no, size, status, event_slots(event_date, start_time, region), venue_availability(venues(name, address, map_url, price_range, rating)), chat_rooms(id))")
    .eq("application_id", applicationId)
    .eq("active", true)
    .maybeSingle();
  const t = one(tm?.dining_tables as unknown as Record<string, unknown> | null) as Record<string, unknown> | null;
  if (!tm || !t || t.status !== "CONFIRMED") return null;

  const { data: rows } = await db
    .from("table_members")
    .select("applications(profile_id, profiles(id, name, interests, self_traits))")
    .eq("table_id", tm.table_id)
    .eq("active", true);
  const members = (rows ?? []).map((r) => {
    const a = one(r.applications as unknown as { profiles: unknown } | null);
    const p = one(a?.profiles as { id: string; name: string; interests: string[] | null; self_traits: string[] | null } | null);
    return p ? { profileId: p.id, name: p.name, interests: p.interests ?? [], selfTraits: p.self_traits ?? [], me: p.id === myProfileId } : null;
  }).filter((m): m is NonNullable<typeof m> => !!m);

  const avail = one(t.venue_availability as { venues: unknown } | null);
  return {
    tableId: tm.table_id,
    tableNo: (t.table_no as number | null) ?? null,
    size: t.size as number,
    slot: one(t.event_slots as MyTable["slot"] | null)!,
    venue: one(avail?.venues as MyTable["venue"] | null),
    roomId: one(t.chat_rooms as { id: string } | null)?.id ?? null,
    members: members.sort((a, b) => Number(b.me) - Number(a.me)),
  };
}
