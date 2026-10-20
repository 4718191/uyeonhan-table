// 대화 콘텐츠 (PRD 9장 CON-01~03): 공통 관심사와 대화 성향으로 스몰토크 주제 3개 이상 + 아이스브레이킹 게임 1개.
// DB를 모르는 순수 함수라 같은 테이블이면 항상 같은 콘텐츠가 나온다.

const BY_INTEREST: Record<string, string[]> = {
  "운동": ["요즘 꾸준히 하는 운동이 있다면, 처음 시작하게 된 계기는?", "같이 해 보고 싶은 운동이나 도전해 보고 싶은 대회가 있나요?"],
  "맛집·카페 탐방": ["최근에 찾은 '나만 알고 싶은' 맛집이나 카페를 하나씩 소개해 주세요.", "인생 메뉴 하나만 먹을 수 있다면 무엇을 고를까요?"],
  "여행": ["가장 기억에 남는 여행지와 그 이유는?", "당장 내일 떠날 수 있다면 어디로, 누구와 가고 싶나요?"],
  "영화·드라마": ["최근에 정주행한 작품과 추천 포인트를 말해 주세요.", "내 인생을 영화로 만든다면 장르와 제목은?"],
  "음악": ["요즘 가장 많이 듣는 노래 한 곡을 소개해 주세요.", "가 본 공연 중 가장 좋았던 순간은 언제였나요?"],
  "독서·글쓰기": ["최근 읽은 책 중 한 문장을 소개한다면?", "누군가에게 꼭 선물하고 싶은 책이 있나요?"],
  "자기계발·공부": ["요즘 새로 배우고 있는 것이 있다면?", "올해 꼭 이루고 싶은 작은 목표 하나는?"],
  "전시·공연·아트": ["최근에 본 전시나 공연 중 기억에 남는 장면은?", "작가나 아티스트 한 명과 밥을 먹을 수 있다면 누구?"],
  "패션·뷰티": ["요즘 가장 자주 손이 가는 아이템은?", "나만의 스타일을 한 단어로 표현한다면?"],
  "사진·영상": ["휴대폰 앨범에서 가장 아끼는 사진 한 장의 사연은?", "요즘 찍고 싶은 장소나 장면이 있나요?"],
};

const DEEP = ["최근에 생각이 바뀐 일이 있다면 무엇인가요?", "10년 전의 나에게 해 주고 싶은 말은?"];
const LIGHT = ["오늘 여기 오기 전까지 있었던 가장 웃긴 일은?", "아무도 모르는 나의 쓸데없는 특기는?"];
const GENERAL = ["이번 주에 가장 좋았던 순간 하나를 나눠 주세요.", "요즘 나를 가장 설레게 하는 일은?", "주말을 완벽하게 보내는 나만의 방법은?"];

const GAMES = [
  { name: "두 개의 진실, 하나의 거짓", how: "자기소개 문장 세 개 중 거짓 하나를 섞어 말하고, 나머지 사람들이 거짓을 맞혀요." },
  { name: "공통점 찾기", how: "5분 안에 테이블 모두에게 해당하는 공통점 3가지를 찾아보세요. (관심사 말고!)" },
  { name: "밸런스 게임", how: "'평생 여름 vs 평생 겨울'처럼 둘 중 하나를 고르고 이유를 한 문장으로 말해요." },
  { name: "오늘의 첫인상 키워드", how: "식사가 끝날 즈음 서로의 첫인상을 키워드 하나로 말해 주세요." },
];

export type ContentMember = { interests: string[]; selfTraits: string[] };

export function tableContent(members: ContentMember[], seed: number) {
  const count = new Map<string, number>();
  members.forEach((m) => m.interests.forEach((i) => count.set(i, (count.get(i) ?? 0) + 1)));
  const common = [...count.entries()].filter(([k, n]) => n >= 2 && BY_INTEREST[k]).sort((a, b) => b[1] - a[1]).map(([k]) => k);

  const topics: { topic: string; why: string }[] = [];
  common.slice(0, 2).forEach((k, i) => topics.push({ topic: BY_INTEREST[k][(seed + i) % BY_INTEREST[k].length], why: `${k}을(를) 좋아하는 분 ${count.get(k)}명` }));

  // 대화 성향: 깊은 대화를 좋아하는 사람이 많으면 깊은 주제, 아니면 가벼운 주제
  const deep = members.filter((m) => m.selfTraits.includes("깊은 대화를 좋아함")).length;
  const light = members.filter((m) => m.selfTraits.includes("가볍고 유머 있는 대화를 좋아함")).length;
  const style = deep > light ? { list: DEEP, why: "깊은 대화를 좋아하는 분이 많은 테이블" } : { list: LIGHT, why: "가볍고 유쾌한 대화를 좋아하는 테이블" };
  topics.push({ topic: style.list[seed % style.list.length], why: style.why });

  for (let i = 0; topics.length < 3; i++) topics.push({ topic: GENERAL[(seed + i) % GENERAL.length], why: "모두 함께" });
  return { topics, game: GAMES[seed % GAMES.length] };
}

export function contentText(c: ReturnType<typeof tableContent>) {
  return [
    ...c.topics.map((t, i) => `${i + 1}. ${t.topic} (${t.why})`),
    "",
    `아이스브레이킹: ${c.game.name}`,
    c.game.how,
  ].join("\n");
}
