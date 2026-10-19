// 식당 지도 링크 (PRD INF-03): 등록된 지도 주소가 없으면 식당 이름·주소로 지도 검색 링크를 만든다.
export function mapLink(v: { name: string; address: string | null; map_url: string | null }): string | null {
  if (v.map_url) return v.map_url;
  if (!v.address) return null;
  return `https://map.naver.com/p/search/${encodeURIComponent(`${v.address} ${v.name}`)}`;
}
