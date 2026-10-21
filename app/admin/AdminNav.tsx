"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 운영자 메뉴 (MVP 9장 화면 목록). 아직 만들지 않은 화면은 "준비 중"으로 보여 준다.
const MENU: { label: string; href?: string }[] = [
  { label: "운영 대시보드", href: "/admin" },
  { label: "회차 관리", href: "/admin/slots" },
  { label: "식당 재고·자동화 규칙", href: "/admin/venues" },
  { label: "신청자·결제·환불", href: "/admin/applicants" },
  { label: "자동 매칭 모니터", href: "/admin/monitor" },
  { label: "예외 처리함", href: "/admin/exceptions" },
  { label: "테이블·식당·단체방", href: "/admin/tables" },
  { label: "안내·리마인드 이력", href: "/admin/messages" },
  { label: "참석·취소·노쇼", href: "/admin/attendance" },
  { label: "피드백·신고", href: "/admin/safety" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="운영자 메뉴" className="flex flex-col gap-1">
      <p className="px-3 pb-3 text-[15px] font-bold">우연한 식탁 운영자</p>
      {MENU.map((m) =>
        m.href ? (
          <Link key={m.label} href={m.href} aria-current={path === m.href ? "page" : undefined}
            className={`flex min-h-10 items-center rounded-lg px-3 text-sm ${path === m.href ? "bg-stone-900 font-semibold text-white" : "hover:bg-stone-200"}`}>
            {m.label}
          </Link>
        ) : (
          <span key={m.label} aria-disabled="true" className="flex min-h-10 items-center px-3 text-sm text-stone-400">
            {m.label} · 준비 중
          </span>
        ),
      )}
    </nav>
  );
}
