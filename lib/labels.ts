// 상태값을 화면에 보여 줄 한국어 표기 (PRD 12장)

export const PASS_LABELS: Record<string, string> = {
  SINGLE: "1회권",
  MEMBERSHIP_1M: "멤버십 1개월",
  MEMBERSHIP_3M: "멤버십 3개월",
  MEMBERSHIP_6M: "멤버십 6개월",
};

export const PAYMENT_LABELS: Record<string, string> = {
  PENDING: "결제 대기",
  PAID: "결제 완료",
  FAILED: "결제 실패",
  REFUND_AVAILABLE: "환불 가능",
  REFUND_REQUESTED: "환불 요청",
  REFUND_PROCESSING: "환불 처리 중",
  REFUNDED: "환불 완료",
  REFUND_FAILED: "환불 실패",
};

export const MATCH_LABELS: Record<string, string> = {
  WAITING: "매칭 대기",
  MATCHING: "매칭 중",
  REALLOCATING: "재배치 중",
  CONFIRMED: "매칭 확정",
  ALTERNATIVE_OFFERED: "대체 일정 제안",
  TRANSFERRED: "일정 이동",
  NO_MATCH: "매칭 실패",
  EXCEPTION: "운영 확인 중",
};

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
