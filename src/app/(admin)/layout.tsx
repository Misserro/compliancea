import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">Admin Panel</h1>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to App
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
