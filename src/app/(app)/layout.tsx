import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ensureDb } from "@/lib/server-utils";
import { getSessionById, touchSession } from "@/lib/db-imports";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Validate the session has not been revoked by an admin.
  // Users whose JWT has no sessionId (issued before this feature deployed) also
  // hit this redirect — this is intentional, forcing a one-time re-login.
  await ensureDb();
  const dbSession = session.user.sessionId
    ? getSessionById(session.user.sessionId)
    : null;
  if (!dbSession || dbSession.revoked) {
    redirect("/login");
  }

  // Update last_seen_at (no saveDb call — touchSession bypasses run() helper by design)
  touchSession(session.user.sessionId!);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
