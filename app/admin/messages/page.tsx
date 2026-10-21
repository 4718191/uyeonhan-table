import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";
import { Badge, Panel, btnCls, tableCls } from "@/components/admin";
import { resendFailed } from "./actions";

// 알림 종류 (PRD 14장 알림 시나리오)
const TEMPLATES: Record<string, string> = {
  APPLICATION_SUBMITTED: "신청 완료", PAYMENT_DONE: "결제 완료", MATCH_UNPAID: "결제 미완료·결제 기한", MATCH_REALLOCATING: "자동 재배치 중",
  MATCH_CONFIRMED: "매칭 확정", MATCH_FAILED: "매칭 실패·대체 일정", MATCH_EXCEPTION: "운영 확인 중", RESOLVE_TRANSFER: "일정 이동 완료",
  RESOLVE_STORE: "이용권 보관", RESOLVE_REFUND: "환불 요청·완료", RESOLVE_EXTEND: "멤버십 기한 연장", REFUND_DONE: "마감 전 취소 환불",
  APPLICATION_CANCELED: "신청 취소", EVENT_REMINDER: "행사 1일 전 리마인드", EVENT_CONTENT: "대화 콘텐츠 게시", ATTENDANCE_CANCELED: "확정 후 취소",
  TABLE_CHANGED: "테이블 인원 변경", TABLE_MOVED: "다른 테이블로 이동", CHECKED_IN: "체크인", FEEDBACK_REQUEST: "행사 종료 후 피드백 요청",
  FEEDBACK_REMINDER: "피드백 미응답 리마인드", FEEDBACK_DONE: "피드백 감사", NEXT_EVENT: "다음 모집 추천", REPORT_RECEIVED: "신고 접수",
  REPORT_REVIEWED: "신고 검토 완료", NO_SHOW: "노쇼 기록", RESTRICTION_WARNING: "이용 제한: 경고", RESTRICTION_SUSPEND: "이용 제한: 4주", RESTRICTION_BAN: "이용 제한: 영구",
};

// 자동 메시지 템플릿: 언제, 무엇을 보내는지 (PRD 11장 자동 메시지 관리, 14장 알림 시나리오)
const MESSAGE_TEMPLATES: { kind: string; name: string; when: string; contains: string }[] = [
  { kind: "NOTICE", name: "확정 공지 · 큐레이션", when: "테이블 자동 확정 즉시 (단체방)", contains: "날짜·시간·지역·식당·주소·지도·가격대·예약명, 공통 관심사 기반 테이블 소개, 취소 정책" },
  { kind: "REMINDER", name: "행사 1일 전 리마인드", when: "행사 전날 10:00 (단체방 + 앱 알림)", contains: "시간·장소·지도·예약명·인원, 취소·노쇼 정책" },
  { kind: "CONTENT", name: "대화 콘텐츠", when: "행사 시작 시각 (단체방 + 앱 알림)", contains: "공통 관심사·대화 성향 기반 대화 주제 3개, 아이스브레이킹 게임" },
  { kind: "MATCH_FAILED", name: "매칭 실패 · 대체 일정", when: "자동 매칭 직후 (앱 알림)", contains: "실패 사유, 추천 날짜·지역, 일정 이동·보관·환불(멤버십은 기한 연장) 선택" },
  { kind: "MATCH_REALLOCATING", name: "자동 재배치 중", when: "자동 매칭 직후 (앱 알림)", contains: "다음 신청 회차에서 다시 찾는다는 안내" },
  { kind: "FEEDBACK_REQUEST", name: "행사 종료 후 피드백 요청", when: "행사 종료 처리 (매일 23:00)", contains: "만족도·사람별 선호 요청, 안전 신고 안내" },
  { kind: "FEEDBACK_REMINDER", name: "피드백 미응답 리마인드", when: "종료 다음 날 1회", contains: "피드백 요청 재안내 (다음 신청은 막지 않음)" },
  { kind: "NEXT_EVENT", name: "다음 모집 추천", when: "행사 종료 처리", contains: "참석 지역 우선 다음 모집 일정 3개와 신청 마감" },
];

// A-8 자동 안내·리마인드 이력 (PRD 11장 자동 메시지 관리, 16장 발송 이력)
export default async function MessagesPage() {
  const { supabase } = await requireAdmin();
  const notes: { template_key: string; delivery_status: string; retry_count: number; sent_at: string | null; title: string; profiles: unknown }[] = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from("notifications").select("template_key, delivery_status, retry_count, sent_at, title, profiles(name)").order("created_at", { ascending: false }).range(f, f + 999);
    notes.push(...((data ?? []) as typeof notes));
    if (!data || data.length < 1000) break;
  }
  const { data: sys } = await supabase.from("chat_messages").select("kind, delivery_status, retry_count").neq("kind", "USER").limit(5000);
  const { count: openEx } = await supabase.from("exception_cases").select("*", { count: "exact", head: true }).eq("type", "DELIVERY_FAILED").neq("status", "RESOLVED");
  const all = [...notes, ...(sys ?? [])];
  const retried = all.filter((m) => (m.retry_count ?? 0) > 0 && m.delivery_status === "SENT").length;
  const failedNow = all.filter((m) => m.delivery_status === "FAILED").length;

  const byKey = new Map<string, { sent: number; failed: number; last: string | null }>();
  for (const n of notes) {
    const c = byKey.get(n.template_key) ?? { sent: 0, failed: 0, last: null };
    if (n.delivery_status === "FAILED") c.failed++; else c.sent++;
    if (!c.last || (n.sent_at && n.sent_at > c.last)) c.last = n.sent_at;
    byKey.set(n.template_key, c);
  }
  const room = (k: string) => (sys ?? []).filter((m) => m.kind === k);
  // 템플릿마다 가장 최근 실제 발송 내용을 예시로 보여 준다
  const examples = new Map<string, string>();
  await Promise.all(MESSAGE_TEMPLATES.map(async (t) => {
    const q = ["NOTICE", "REMINDER", "CONTENT"].includes(t.kind)
      ? supabase.from("chat_messages").select("body").eq("kind", t.kind).like("body", t.kind === "NOTICE" ? "%예약명%" : "%")
      : supabase.from("notifications").select("body").eq("template_key", t.kind);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.body) examples.set(t.kind, data.body);
  }));

  return (
    <>
      <h1 className="text-2xl font-bold">자동 안내·리마인드 이력</h1>
      <Panel title="자동 메시지 템플릿" aside={<span className="text-xs text-stone-600">문구는 코드로 관리 (운영자 편집은 P1, CON-04)</span>}>
        <div className="flex flex-col gap-2">
          {MESSAGE_TEMPLATES.map((t) => (
            <details key={t.kind} className="rounded-lg border border-stone-300 p-3 text-sm">
              <summary className="cursor-pointer"><b>{t.name}</b> <span className="text-stone-600">· {t.when}</span></summary>
              <p className="mt-2 text-stone-700">담는 내용: {t.contains}</p>
              <p className="mt-1 whitespace-pre-line rounded bg-stone-100 p-2 text-xs [overflow-wrap:anywhere]">{examples.get(t.kind) ?? "아직 발송된 예가 없어요."}</p>
            </details>
          ))}
        </div>
      </Panel>

      <Panel title="발송 재시도 (INF-08)">
        <p className="text-sm text-stone-700">
          자동 발송이 실패하면 잠깐 쉬었다가 최대 3번까지 다시 보내요. 재시도 끝에 성공한 발송 <b>{retried}건</b> ·
          3번 모두 실패한 발송 <b>{failedNow}건</b> · 처리할 발송 실패 예외 <b>{openEx ?? 0}건</b>
        </p>
        {failedNow > 0 && (
          <form action={resendFailed}><button className={btnCls}>실패 건 다시 보내기</button></form>
        )}
      </Panel>
      <Panel title="단체방 시스템 메시지">
        <div className="grid grid-cols-3 gap-3">
          {[["확정 공지", "NOTICE"], ["1일 전 리마인드", "REMINDER"], ["대화 콘텐츠", "CONTENT"]].map(([l, k]) => (
            <div key={k} className="rounded-lg border border-stone-300 p-3">
              <p className="text-xs text-stone-600">{l}</p>
              <p className="text-lg font-bold">{room(k).filter((m) => m.delivery_status === "SENT").length}건</p>
              <p className="text-xs text-stone-600">실패 {room(k).filter((m) => m.delivery_status === "FAILED").length}건</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="앱 알림 (종류별)" aside={<span className="text-xs text-stone-600">전체 {notes.length}건 · 앱 푸시 대신 앱 내 알림</span>}>
        <table className={tableCls}>
          <thead><tr><th>알림</th><th>발송</th><th>실패</th><th>마지막 발송</th></tr></thead>
          <tbody>
            {[...byKey.entries()].sort((a, b) => (b[1].last ?? "").localeCompare(a[1].last ?? "")).map(([k, c]) => (
              <tr key={k}>
                <td className="whitespace-nowrap font-semibold">{TEMPLATES[k] ?? k}<div className="text-xs font-normal text-stone-500">{k}</div></td>
                <td>{c.sent}건</td>
                <td>{c.failed ? <Badge tone="solid">{c.failed}건</Badge> : "0건"}</td>
                <td className="whitespace-nowrap text-xs">{c.last ? fmtDateTime(c.last) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="최근 발송 50건">
        <table className={tableCls}>
          <thead><tr><th>시각</th><th>받는 사람</th><th>알림</th><th>상태</th></tr></thead>
          <tbody>
            {notes.slice(0, 50).map((n, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap text-xs">{n.sent_at ? fmtDateTime(n.sent_at) : "-"}</td>
                <td className="whitespace-nowrap">{(Array.isArray(n.profiles) ? n.profiles[0] : n.profiles as { name: string } | null)?.name}</td>
                <td className="text-xs">{n.title}</td>
                <td><Badge tone={n.delivery_status === "FAILED" ? "solid" : "muted"}>{n.delivery_status === "FAILED" ? "실패" : "발송"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
