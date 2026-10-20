import { redirect } from "next/navigation";
import { requireParticipant } from "@/lib/auth";
import { getLatestApplication, membershipEnd } from "@/lib/applications";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, type RegionCode } from "@/lib/constants";
import { PASS_LABELS, won } from "@/lib/labels";
import { addDays, fmtDeadline, fmtEventDate, fmtTime } from "@/lib/time";
import { Card, Screen, TopBar } from "@/components/mobile";
import { ResolveForm } from "./ResolveForm";

// P-6 매칭 실패 해결: 실패 이유·추천 일정을 보여 주고 일정 이동·이용권 보관·환불(멤버십은 기한 연장) 중 하나를 고른다
export default async function ResolvePage() {
  const { supabase, profile } = await requireParticipant();
  const app = await getLatestApplication(supabase, profile.id);
  if (!app || !["ALTERNATIVE_OFFERED", "NO_MATCH"].includes(app.match_status)) redirect("/home");
  const { data: res } = await supabase.from("match_resolutions").select("recommended_slot_ids, status").eq("application_id", app.id).maybeSingle();
  if (!res || res.status !== "PENDING") redirect("/home");

  const ids = (res.recommended_slot_ids as string[]) ?? [];
  const { data: slots } = ids.length
    ? await createAdminClient().from("event_slots").select("id, event_date, start_time, region, match_at, status").in("id", ids).order("match_at")
    : { data: [] };
  const now = Date.now();
  const open = app.match_status === "ALTERNATIVE_OFFERED"
    ? (slots ?? []).filter((s) => s.status === "OPEN" && new Date(s.match_at).getTime() > now)
    : [];
  const single = app.pass?.type === "SINGLE";
  const end = app.pass && !single ? membershipEnd(app.pass) : null;

  return (
    <Screen>
      <TopBar title="매칭 실패 해결" back="/home" />
      <div className="flex flex-col gap-4 px-4 py-5">
        <Card strong>
          <h2 className="text-lg font-bold">이번 회차는 매칭되지 않았어요</h2>
          <p className="text-sm">
            {app.placement_reason ? `사유: ${app.placement_reason}` : "조건에 맞는 테이블을 찾지 못했어요."}
          </p>
          <p className="text-sm text-stone-600">
            연령·차단 같은 필수 조건은 낮추지 않고, 고르신 날짜·지역 안에서 자동 재배치까지 시도했어요. 어떻게 할지는 직접 골라 주세요.
          </p>
        </Card>

        <ResolveForm
          applicationId={app.id}
          slots={open.map((s) => ({
            id: s.id,
            label: `${fmtEventDate(s.event_date)} ${fmtTime(s.start_time)} · ${REGIONS[s.region as RegionCode]}`,
            note: `${fmtDeadline(s.match_at)} 자동 매칭`,
          }))}
          single={single}
          passLabel={app.pass ? PASS_LABELS[app.pass.type] : "이용권"}
          refundText={single ? won(app.payment?.amount ?? 0) : null}
          extendText={end ? `${fmtEventDate(end)} → ${fmtEventDate(addDays(end, 7))}` : null}
        />
      </div>
    </Screen>
  );
}
