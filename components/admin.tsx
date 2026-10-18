// 운영자 웹 공통 스타일 (와이어프레임 A-1~A-6 흑백 톤)

export function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border-[1.5px] border-stone-400 bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-base font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export const tableCls = "w-full border-collapse text-left text-sm [&_td]:border-t [&_td]:border-stone-300 [&_td]:px-2 [&_td]:py-2.5 [&_td]:align-top [&_th]:whitespace-nowrap [&_th]:px-2 [&_th]:pb-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-stone-600";
export const inputCls = "min-h-10 w-full rounded-lg border-[1.5px] border-stone-400 bg-white px-3 text-sm";
export const labelCls = "flex flex-col gap-1 text-sm font-semibold";
export const btnCls = "min-h-10 rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-50";
export const btnLineCls = "min-h-9 rounded-lg border-[1.5px] border-stone-900 bg-white px-3 text-xs font-semibold disabled:opacity-50";

export function Badge({ children, tone = "line" }: { children: React.ReactNode; tone?: "solid" | "line" | "muted" }) {
  const cls = tone === "solid" ? "bg-stone-900 text-white" : tone === "muted" ? "border border-dashed border-stone-400 text-stone-500" : "border border-stone-900";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export function Notice({ state }: { state?: { error?: string; ok?: string } }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-sm font-semibold">{state.ok}</p>;
  return null;
}
