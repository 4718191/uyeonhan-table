import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";
import { Badge, Panel, tableCls } from "@/components/admin";

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

// A-8 자동 안내·리마인드 이력 (PRD 11장 자동 메시지 관리, 16장 발송 이력)
export default async function MessagesPage() {
  const { supabase } = await requireAdmin();
  const notes: { template_key: string; delivery_status: string; sent_at: string | null; title: string; profiles: unknown }[] = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from("notifications").select("template_key, delivery_status, sent_at, title, profiles(name)").order("created_at", { ascending: false }).range(f, f + 999);
    notes.push(...((data ?? []) as typeof notes));
    if (!data || data.length < 1000) break;
  }
  const { data: sys } = await supabase.from("chat_messages").select("kind, delivery_status").neq("kind", "USER").limit(5000);

  const byKey = new Map<string, { sent: number; failed: number; last: string | null }>();
  for (const n of notes) {
    const c = byKey.get(n.template_key) ?? { sent: 0, failed: 0, last: null };
    if (n.delivery_status === "FAILED") c.failed++; else c.sent++;
    if (!c.last || (n.sent_at && n.sent_at > c.last)) c.last = n.sent_at;
    byKey.set(n.template_key, c);
  }
  const room = (k: string) => (sys ?? []).filter((m) => m.kind === k);

  return (
    <>
      <h1 className="text-2xl font-bold">자동 안내·리마인드 이력</h1>
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
