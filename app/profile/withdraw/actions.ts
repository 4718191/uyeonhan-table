"use server";

import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getApplications } from "@/lib/applications";
import { blockingReason } from "./rules";
import { logStatus } from "@/lib/history";
import { createAdminClient } from "@/lib/supabase/admin";

export type WithdrawState = { error?: string } | undefined;

// 회원 탈퇴 (PRD 16장 개인정보 삭제 요청·탈퇴 후 보관 정책)
// - 이름·연락처·직업·식사 조건 등 개인을 알아볼 수 있는 정보는 지우고, 로그인 계정을 삭제한다.
// - 결제·환불·신청·참석 기록과 상태 이력은 정산·분쟁 대응을 위해 익명으로 남긴다.
// - 다른 사람이 나를 차단·신고·비선호한 기록은 그 사람의 안전을 위해 남긴다.
export async function withdraw(_: WithdrawState, formData: FormData): Promise<WithdrawState> {
  const { supabase, user, profile } = await requireParticipant();
  if (formData.get("confirm") !== "on") return { error: "안내를 확인했다고 체크해 주세요." };
  const reason = blockingReason(await getApplications(supabase, profile.id));
  if (reason) return { error: reason };

  const db = createAdminClient();
  const { error } = await db.from("profiles").update({
    name: "탈퇴한 회원", phone: null, job: null, food_restrictions: null, mbti: null,
    interests: [], self_traits: [], wanted_traits: [], price_ranges: [], consented_at: null,
  }).eq("id", profile.id);
  if (error) return { error: "탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요." };
  await db.from("passes").update({ stored: false }).eq("profile_id", profile.id); // 보관한 1회권은 소멸
  await logStatus(db, { entity: "profile", entityId: profile.id, field: "account", from: "ACTIVE", to: "WITHDRAWN", actor: "PARTICIPANT", actorProfileId: profile.id, reason: "회원 탈퇴 (개인정보 삭제, 기록은 익명 보관)" });

  await supabase.auth.signOut();
  await db.auth.admin.deleteUser(user.id); // 프로필의 user_id는 자동으로 비워진다 (on delete set null)
  redirect("/login?withdrawn=1");
}
