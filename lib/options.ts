// 프로필·매칭 선호 선택지 (가상 데이터 설문 문항과 같은 값을 써야 매칭 점수 계산이 맞는다)

export const INTERESTS = [
  "운동", "맛집·카페 탐방", "여행", "영화·드라마", "음악",
  "독서·글쓰기", "자기계발·공부", "전시·공연·아트", "패션·뷰티", "사진·영상",
] as const;

export const SELF_TRAITS = [
  "활기차고 에너지 있는 편", "깊은 대화를 좋아함", "가볍고 유머 있는 대화를 좋아함",
  "경청을 잘 함", "이야기를 이끄는 편", "잔잔하고 조용한 편",
] as const;

export const WANTED_TRAITS = [
  "나와 비슷한 사람", "나와 다른 자극을 주는 사람", "깊은 대화가 되는 사람",
  "편하고 유머 있는 사람", "열정 있는 사람", "잔잔하고 안정적인 사람",
] as const;

export const PRICE_RANGES = ["1~2만 원", "2~3만 원", "3만 원 이상"] as const;

export const MBTI_AXES = [
  ["E", "I"],
  ["N", "S"],
  ["F", "T"],
  ["P", "J"],
] as const;

// 참가 가능 나이: 만 19세 이상 (출생연도 기준)
export const MIN_BIRTH_YEAR = 1940;
export const MAX_BIRTH_YEAR = 2007;
