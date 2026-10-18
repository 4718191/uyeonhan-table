import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// 상태 변경 이력 (PRD 16장: 누가, 언제, 무엇을, 왜 바꿨는지 남긴다)
export type StatusChange = {
  entity: "application" | "payment" | "event_slot" | "table" | "venue" | "venue_availability" | "matching_settings";
  entityId: string;
  field: string;
  from: string | null;
  to: string | null;
  actor: "SYSTEM" | "ADMIN" | "PARTICIPANT";
  actorProfileId?: string | null;
  reason?: string;
};

export async function logStatus(db: SupabaseClient, changes: StatusChange | StatusChange[]) {
  const list = Array.isArray(changes) ? changes : [changes];
  if (list.length === 0) return;
  const { error } = await db.from("status_history").insert(
    list.map((c) => ({
      entity: c.entity,
      entity_id: c.entityId,
      field: c.field,
      from_value: c.from,
      to_value: c.to,
      actor: c.actor,
      actor_profile_id: c.actorProfileId ?? null,
      reason: c.reason ?? null,
    })),
  );
  if (error) console.error("상태 이력 저장 실패:", error.message);
}
