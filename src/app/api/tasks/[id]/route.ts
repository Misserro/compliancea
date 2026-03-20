import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getTaskById, updateTaskStatus } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  const { id } = await params;
  const taskId = parseInt(id, 10);

  try {
    const task = getTaskById(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body;

    if (!["open", "resolved", "dismissed"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: open, resolved, dismissed" },
        { status: 400 }
      );
    }

    updateTaskStatus(taskId, status);
    logAction("task", taskId, "updated", { status }, { userId: Number(session.user.id), orgId });

    const updated = getTaskById(taskId);
    return NextResponse.json({ message: "Task updated", task: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
