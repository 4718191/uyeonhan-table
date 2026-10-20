// 시연 모드: 행사 날짜 전이라도 체크인할 수 있게 한다 (해커톤 시연용). 실제 운영에서는 DEMO_MODE=0으로 끈다.
export const DEMO_MODE = process.env.DEMO_MODE !== "0";
