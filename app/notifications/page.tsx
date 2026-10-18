import Link from "next/link";
import { requireParticipant } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";
import { Screen, TopBar } from "@/components/mobile";

// 앱 내 알림 (앱 푸시 대신, MVP 7장). 열면 모두 읽음으로 바꾼다.
export default async function NotificationsPage() {
  const { supabase, profile } = await requireParticipant();
  const { data: items } = await supabase
    .from("notifications")
    .select("id, title, body, link, created_at, read_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (items?.some((n) => !n.read_at)) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("profile_id", profile.id).is("read_at", null);
  }

  return (
    <Screen>
      <TopBar title="알림" back="/home" />
      <div className="flex flex-col gap-3 px-4 py-5">
        <p className="text-sm text-stone-600">앱 푸시 대신 앱 안에서 알림을 보여 드려요. 알림을 누르면 관련 화면으로 이동해요.</p>
        {!items || items.length === 0 ? (
          <p className="rounded-xl border-[1.5px] border-stone-400 bg-white p-4 text-sm">아직 받은 알림이 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map((n) => {
              const body = (
                <>
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "border-[1.5px] border-stone-400" : "bg-stone-900"}`} />
                  <span className="flex flex-col gap-1">
                    <span className="text-[15px] font-bold">{n.title}{!n.read_at && <span className="sr-only"> (새 알림)</span>}</span>
                    <span className="text-sm leading-relaxed">{n.body}</span>
                    <span className="text-xs text-stone-600">{fmtDateTime(n.created_at)}</span>
                  </span>
                </>
              );
              const cls = "flex items-start gap-3 rounded-xl border-[1.5px] border-stone-400 bg-white p-3.5";
              return (
                <li key={n.id}>
                  {n.link ? <Link href={n.link} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Screen>
  );
}
