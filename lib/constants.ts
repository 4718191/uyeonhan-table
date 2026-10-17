// 서울 4개 운영 지역 (MVP 6장)
export const REGIONS = {
  hongdae: "홍대/합정",
  jamsil: "잠실",
  gangnam: "강남/신논현",
  euljiro: "을지로/종로",
} as const;
export type RegionCode = keyof typeof REGIONS;

// 이용권 가격 (주최 측 확정)
export const PASS_PRICES = {
  SINGLE: 9900,
  MEMBERSHIP_1M: 35000,
  MEMBERSHIP_3M: 75000,
  MEMBERSHIP_6M: 120000,
} as const;
