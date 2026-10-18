import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-stone-400 bg-white p-4 md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <AdminNav />
        <form action={signOut} className="mt-4 flex items-center justify-between px-3 text-sm text-stone-600">
          <span>{profile?.name}</span>
          <button className="underline">로그아웃</button>
        </form>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-6">{children}</main>
    </div>
  );
}
