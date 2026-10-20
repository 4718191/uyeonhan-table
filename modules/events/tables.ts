import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// 행사 날짜별 확정 테이블 조회 (리마인드·대화 콘텐츠·확정 후 취소에서 함께 쓴다)

const one = <T,>(x: unknown): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null)) as T | null;

export type EventTable = {
  id: string;
  no: number | null;
  slot: { id: string; event_date: string; start_time: string; region: string };
  venue: { name: string; address: string | null; map_url: string | null; price_range: string | null } | null;
  availId: string | null;
  roomId: string | null;
  members: { appId: string; profileId: string; name: string; birthYear: number | null; interests: string[]; selfTraits: string[] }[];
};

const SELECT = `id, table_no, slot_id, venue_availability_id,
  event_slots!inner(id, event_date, start_time, region),
  venue_availability(venues(name, address, map_url, price_range)),
  chat_rooms(id),
  table_members(active, application_id, applications(profile_id, profiles(name, birth_year, interests, self_traits)))`;

function toTable(r: Record<string, unknown>): EventTable {
  const members = ((r.table_members as { active: boolean; application_id: string; applications: unknown }[]) ?? [])
    .filter((m) => m.active)
    .map((m) => {
      const a = one<{ profile_id: string; profiles: unknown }>(m.applications);
      const p = one<{ name: string; birth_year: number | null; interests: string[] | null; self_traits: string[] | null }>(a?.profiles);
      return { appId: m.application_id, profileId: a?.profile_id ?? "", name: p?.name ?? "", birthYear: p?.birth_year ?? null, interests: p?.interests ?? [], selfTraits: p?.self_traits ?? [] };
    });
  return {
    id: r.id as string,
    no: (r.table_no as number | null) ?? null,
    slot: one<EventTable["slot"]>(r.event_slots)!,
    venue: one<EventTable["venue"]>(one<{ venues: unknown }>(r.venue_availability)?.venues),
    availId: (r.venue_availability_id as string | null) ?? null,
    roomId: one<{ id: string }>(r.chat_rooms)?.id ?? null,
    members,
  };
}

/** 특정 날짜(들)의 확정 테이블 */
export async function tablesOnDates(db: SupabaseClient, dates: string[]) {
  const { data, error } = await db.from("dining_tables").select(SELECT).eq("status", "CONFIRMED").in("event_slots.event_date", dates);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toTable(r as Record<string, unknown>));
}

/** 같은 회차의 확정 테이블 */
export async function tablesInSlot(db: SupabaseClient, slotId: string) {
  const { data, error } = await db.from("dining_tables").select(SELECT).eq("status", "CONFIRMED").eq("slot_id", slotId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toTable(r as Record<string, unknown>));
}

/** 확정 테이블이 있는 행사 날짜들 (오늘 포함, 가까운 순, 시연용 "지금 실행"에서 쓴다) */
export async function upcomingEventDates(db: SupabaseClient, from: string) {
  const { data } = await db.from("dining_tables").select("event_slots!inner(event_date)").eq("status", "CONFIRMED")
    .gte("event_slots.event_date", from).limit(500);
  const dates = (data ?? []).map((r) => one<{ event_date: string }>((r as { event_slots: unknown }).event_slots)?.event_date).filter(Boolean) as string[];
  return [...new Set(dates)].sort();
}
