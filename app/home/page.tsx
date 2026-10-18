import Link from "next/link";
import { requireParticipant } from "@/lib/auth";
import { getLatestApplication, membershipEnd, nextDeadline, type ApplicationView } from "@/lib/applications";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { PASS_LABELS, PAYMENT_LABELS, won } from "@/lib/labels";
import { fmtDeadline, fmtEventDate, fmtTime } from "@/lib/time";
import { BottomNav, Card, Screen, btnPrimary } from "@/components/mobile";
import { CancelButton } from "./CancelButton";

// P-5 홈·신청 상태: 신청·결제·매칭 상태와 다음 행동을 한 화면에서 보여 준다 (MVP 8장 사용성)
export default async function HomePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { supabase, profile } = await requireParticipant();
  const [app, { count: unread }] = await Promise.all([
    getLatestApplication(supabase, profile.id),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", profile.id).is("read_at", null),
  ]);
  const view = app ? describe(app) : null;

  return (
    <Screen>
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-stone-400 bg-white px-4">
        <span className="flex-1 text-[17px] font-bold">우연한 식탁</span>
        <Link href="/notifications" aria-label={`알림${unread ? ` ${unread}개 안 읽음` : ""}`}
          className="relative flex h-11 w-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21h4" />
          </svg>
          {!!unread && (
            <span className="absolute right-1 top-1 min-w-5 rounded-full bg-stone-900 px-1 text-center text-[11px] font-bold leading-5 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
      </header>

      <div className="flex flex-col gap-4 px-4 py-5">
        <h1 className="text-xl font-bold">{profile.name}님의 신청 현황</h1>
        {saved === "profile" && <p role="status" className="text-sm font-semibold">프로필을 저장했어요.</p>}

        {!app || !view ? (
          <Card strong>
            <h2 className="text-lg font-bold">아직 신청 내역이 없어요</h2>
            <p className="text-sm text-stone-600">
              날짜와 지역만 고르면 결이 맞는 4~6명을 자동으로 묶어 드려요. 운영자 검토 없이 마감 후 바로 확정돼요.
            </p>
            <Link href="/apply" className={btnPrimary}>모임 신청하기</Link>
          </Card>
        ) : (
          <>
            <Card>
              <ol aria-label="진행 단계" className="grid grid-cols-4 gap-1.5">
                {view.steps.map((s, i) => (
                  <li key={s.name} className="flex flex-col items-center gap-1.5 text-center">
                    <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      s.state === "done" ? "bg-stone-900 text-white"
                        : s.state === "now" ? "border-[2.5px] border-stone-900 bg-white"
                        : "border-[1.5px] border-dashed border-stone-400 bg-white text-stone-500"}`}>
                      {s.state === "done" ? "✓" : i + 1}
                    </span>
                    <span className={`text-xs ${s.state === "now" ? "font-bold" : s.state === "todo" ? "text-stone-500" : ""}`}>
                      {s.name}<span className="sr-only">{s.state === "done" ? " 완료" : s.state === "now" ? " 진행 중" : " 예정"}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>

            <Card strong>
              <p className="text-sm font-semibold text-stone-600">현재 상태</p>
              <h2 className="text-[22px] font-bold">{view.title}</h2>
              <p className="text-sm">{view.desc}</p>
              {view.note && <p className="text-sm text-stone-600">{view.note}</p>}
              {view.action && <Link href={view.action.href} className={btnPrimary}>{view.action.label}</Link>}
            </Card>

            <Card>
              <h3 className="text-[15px] font-bold">신청 내용</h3>
              <dl className="grid grid-cols-[64px_1fr] gap-y-2 text-sm">
                <dt className="text-stone-600">날짜</dt>
                <dd>{[...new Set(app.slots.map((s) => `${fmtEventDate(s.event_date)} ${fmtTime(s.start_time)}`))].join(", ")}</dd>
                <dt className="text-stone-600">지역</dt>
                <dd>{[...new Set(app.slots.map((s) => REGIONS[s.region as RegionCode]))].join(", ")}</dd>
                <dt className="text-stone-600">이용권</dt>
                <dd>{view.passText}</dd>
              </dl>
              {view.cancel && <CancelButton applicationId={app.id} refundNote={view.cancel} />}
              {view.cancelClosed && <p className="text-sm text-stone-600">{view.cancelClosed}</p>}
            </Card>

            {view.reapply && <Link href="/apply" className={btnPrimary}>다시 신청하기</Link>}
          </>
        )}

        <Card>
          <h3 className="text-[15px] font-bold">환불 규정·노쇼 정책</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed">
            <li>행사 직전 화요일 24:00까지 취소하면 환불돼요. (1회권 기준)</li>
            <li>화요일 24:00 이후와 당일 취소는 환불되지 않아요.</li>
            <li>당일 취소와 노쇼는 이용 제한 대상이에요.</li>
          </ul>
        </Card>
      </div>
      <BottomNav current="home" />
    </Screen>
  );
}

type StepState = "done" | "now" | "todo";

// 신청 하나의 네 가지 상태(신청·결제·매칭·참석)를 화면 문구로 바꾼다
function describe(app: ApplicationView) {
  const deadline = nextDeadline(app);
  const firstDeadline = app.slots.map((s) => s.apply_deadline).sort()[0];
  const beforeDeadline = !!firstDeadline && new Date(firstDeadline) > new Date();
  const paid = app.payment_status === "PAID";
  const m = app.match_status;
  const canceled = app.application_status === "CANCELED";

  const passText = app.pass
    ? `${PASS_LABELS[app.pass.type]}${app.pass.valid_until ? ` (${membershipEnd(app.pass)}까지)` : ""} · ${PAYMENT_LABELS[app.payment_status]}`
    : PAYMENT_LABELS[app.payment_status];

  const matchStep = m === "REALLOCATING" ? "재배치 중" : m === "MATCHING" ? "매칭 중" : "매칭 대기";
  const resultDone = ["CONFIRMED", "NO_MATCH", "ALTERNATIVE_OFFERED", "TRANSFERRED", "EXCEPTION"].includes(m);
  const steps: { name: string; state: StepState }[] = [
    { name: "신청 완료", state: "done" },
    { name: "결제 완료", state: paid || resultDone ? "done" : canceled ? "todo" : "now" },
    { name: matchStep, state: resultDone ? "done" : paid && !canceled ? "now" : "todo" },
    { name: "매칭 결과", state: resultDone ? "now" : "todo" },
  ];

  let title = "";
  let desc = "";
  let note: string | undefined;
  let action: { href: string; label: string } | undefined;
  let cancel: string | undefined;
  let cancelClosed: string | undefined;
  let reapply = false;

  if (canceled) {
    title = "신청이 취소됐어요";
    desc = app.payment_status === "REFUNDED" && app.payment?.refunded_amount
      ? `${won(app.payment.refunded_amount)}을 모의 환불했어요.`
      : app.pass && app.pass.type !== "SINGLE" ? "멤버십은 그대로 다시 쓸 수 있어요." : "결제 전에 취소한 신청이에요.";
    reapply = true;
  } else if (app.payment_status === "PENDING") {
    title = "결제를 기다리고 있어요";
    desc = deadline ? `${fmtDeadline(deadline)}까지 결제해야 매칭 대상이 돼요.` : "신청한 회차의 마감이 지났어요.";
    if (deadline) action = { href: `/apply/${app.id}/pay`, label: "결제하기" };
  } else if (m === "WAITING") {
    title = "매칭 대기 중";
    desc = deadline ? `자동 매칭: ${fmtDeadline(deadline)} 이후 자동 진행` : "곧 자동 매칭이 진행돼요.";
    note = "결과가 나오면 앱 알림으로 알려 드려요.";
  } else if (m === "MATCHING") {
    title = "매칭을 진행하고 있어요";
    desc = "조건이 맞는 4~6명을 묶고 식당을 배정하는 중이에요.";
  } else if (m === "REALLOCATING") {
    title = "다른 테이블을 찾고 있어요";
    desc = "처음 배정된 테이블이 조건을 채우지 못해, 신청한 날짜·지역 안에서 다른 테이블을 자동으로 찾는 중이에요.";
  } else if (m === "CONFIRMED") {
    title = "매칭이 확정됐어요";
    desc = "확정된 날짜와 식당, 단체방을 확인해 주세요.";
    note = "매칭 확정 상세 화면은 곧 열려요.";
  } else if (m === "NO_MATCH" || m === "ALTERNATIVE_OFFERED") {
    title = "이번 회차는 매칭되지 않았어요";
    desc = "대체 일정 이동, 이용권 보관, 환불 중에서 고를 수 있어요. (멤버십은 일정 이동 또는 기한 연장)";
  } else if (m === "TRANSFERRED") {
    title = "일정이 이동됐어요";
    desc = "옮긴 회차에서 다시 자동 매칭이 진행돼요.";
  } else {
    title = "운영팀이 확인하고 있어요";
    desc = "자동으로 해결되지 않은 문제가 있어 운영팀이 확인 중이에요. 처리되면 알려 드릴게요.";
  }

  if (!canceled && m === "WAITING") {
    if (beforeDeadline) {
      cancel = !paid
        ? "결제 전이라 신청만 취소돼요."
        : app.pass?.type === "SINGLE"
          ? `마감 전이라 ${won(app.payment?.amount ?? 0)}이 모의 환불돼요.`
          : "멤버십은 환불되지 않고 신청만 취소돼요. 기간 안에 다시 신청할 수 있어요.";
    } else if (paid) {
      cancelClosed = "매칭 마감 이후라 지금은 신청을 취소해도 환불되지 않아요.";
    }
  }

  return { steps, title, desc, note, action, cancel, cancelClosed, reapply, passText };
}
