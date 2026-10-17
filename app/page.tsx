import Link from "next/link";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold">우연한 식탁</h1>
      <p className="text-stone-600">처음 보는 4~6명이 결이 맞는 사람들과 한 테이블에서 저녁을 먹어요.</p>
      <Link href="/login" className="rounded-xl bg-stone-900 px-4 py-3 text-center font-semibold text-white">
        로그인
      </Link>
    </main>
  );
}
