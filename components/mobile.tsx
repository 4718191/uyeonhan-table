import Link from "next/link";

// 참가자 모바일 화면 공통 요소 (와이어프레임 P-2~P-8의 흑백 톤을 따른다)

export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-stone-100">{children}</div>;
}

export function TopBar({ title, back, step }: { title: string; back?: string; step?: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-stone-400 bg-white px-3">
      {back ? (
        <Link href={back} aria-label="뒤로" className="flex h-11 w-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      ) : (
        <span className="w-1" />
      )}
      <h1 className="flex-1 text-[17px] font-bold">{title}</h1>
      {step && <span className="pr-2 text-sm text-stone-600">{step}</span>}
    </header>
  );
}

export function Card({ children, strong, className = "" }: { children: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-xl bg-white p-4 ${strong ? "border-[2.5px] border-stone-900" : "border-[1.5px] border-stone-400"} ${className}`}
    >
      {children}
    </section>
  );
}

export const btnPrimary =
  "flex min-h-[52px] w-full items-center justify-center rounded-xl bg-stone-900 px-4 text-base font-semibold text-white disabled:opacity-50";
export const btnSecondary =
  "flex min-h-12 w-full items-center justify-center rounded-xl border-[1.5px] border-stone-900 bg-white px-4 text-[15px] font-semibold disabled:opacity-50";

// 칩형 선택지: 실제 체크박스·라디오를 숨기고 라벨로 누른다 (JS 없이 동작)
export function Chip({
  name, value, label, type = "checkbox", defaultChecked,
}: { name: string; value: string; label?: string; type?: "checkbox" | "radio"; defaultChecked?: boolean }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer select-none items-center justify-center rounded-full border-[1.5px] border-stone-400 bg-white px-3.5 text-sm has-checked:border-stone-900 has-checked:bg-stone-900 has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-stone-900">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="sr-only" />
      {label ?? value}
    </label>
  );
}

// 큰 선택 상자 (일정·지역·이용권)
export function OptionBox({
  name, value, type = "checkbox", defaultChecked, children,
}: { name: string; value: string; type?: "checkbox" | "radio"; defaultChecked?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-stone-400 bg-white px-3.5 text-[15px] has-checked:border-[2.5px] has-checked:border-stone-900">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="h-5 w-5 accent-stone-900" />
      {children}
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

const icons = {
  home: <path d="M3 11l9-7 9 7v9H3z" />,
  chat: <path d="M4 5h16v11H8l-4 4z" />,
  history: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
};

export function BottomNav({ current, chatHref }: { current: "home" | "chat" | "history" | "me"; chatHref?: string }) {
  const items: { key: keyof typeof icons; label: string; href?: string; hint?: string }[] = [
    { key: "home", label: "홈", href: "/home" },
    { key: "chat", label: "단체방", href: chatHref, hint: "매칭이 확정되면 열려요" },
    { key: "history", label: "참가 이력", hint: "준비 중이에요" },
    { key: "me", label: "내 정보", href: "/profile" },
  ];
  return (
    <nav aria-label="하단 메뉴" className="sticky bottom-0 mt-auto grid grid-cols-4 border-t border-stone-400 bg-white">
      {items.map((it) => {
        const inner = (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {icons[it.key]}
            </svg>
            {it.label}
          </>
        );
        const cls = "flex min-h-14 flex-col items-center justify-center gap-1 text-center text-xs";
        if (!it.href) {
          return (
            <span key={it.key} aria-disabled="true" title={it.hint} className={`${cls} text-stone-400`}>
              {inner}
              {it.hint && <span className="sr-only"> ({it.hint})</span>}
            </span>
          );
        }
        const active = it.key === current;
        return (
          <Link key={it.key} href={it.href} aria-current={active ? "page" : undefined}
            className={`${cls} ${active ? "font-bold text-stone-900" : "text-stone-600"}`}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
