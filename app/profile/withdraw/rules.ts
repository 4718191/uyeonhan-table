import type { getApplications } from "@/lib/applications";

// 탈퇴 가능 여부 (서버 액션 파일은 async 함수만 내보낼 수 있어 따로 둔다)
/** 탈퇴를 막는 진행 중인 신청 (결제 대기·매칭 진행·대체 일정 선택 대기·참석 예정) */
export function blockingReason(apps: Awaited<ReturnType<typeof getApplications>>) {
  for (const a of apps) {
    if (a.application_status !== "SUBMITTED") continue;
    if (a.payment_status === "PENDING") return "결제를 기다리는 신청이 있어요. 홈에서 신청을 취소한 뒤 탈퇴해 주세요.";
    if (["WAITING", "MATCHING", "REALLOCATING", "TRANSFERRED"].includes(a.match_status)) return "매칭을 기다리는 신청이 있어요. 마감 전이면 홈에서 신청을 취소한 뒤 탈퇴해 주세요.";
    if (a.match_status === "ALTERNATIVE_OFFERED") return "매칭 실패 해결(일정 이동·보관·환불)을 아직 고르지 않았어요. 먼저 선택해 주세요.";
    const slot = a.slots.find((s) => s.id === a.confirmed_slot_id);
    if (a.match_status === "CONFIRMED" && a.attendance_status === "SCHEDULED" && slot?.status !== "CLOSED")
      return "참석 예정인 모임이 있어요. 모임이 끝난 뒤 탈퇴하거나, 참석을 취소한 뒤 탈퇴해 주세요.";
  }
  return null;
}

