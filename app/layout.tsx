import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "우연한 식탁",
  description: "처음 보는 4~6명이 결이 맞는 사람들과 한 테이블에서 저녁을 먹는 소셜다이닝",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-stone-100 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
