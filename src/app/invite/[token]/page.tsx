import { ensureDb } from "@/lib/server-utils";
import { getOrgInviteByToken } from "@/lib/db-imports";
import { InviteAcceptClient } from "./invite-accept-client";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  await ensureDb();
  const invite = getOrgInviteByToken(token);

  // Not found / revoked
  if (!invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <svg className="size-6 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Invalid Invite</h1>
          <p className="text-muted-foreground">
            This invite link is invalid or has been revoked.
          </p>
        </div>
      </div>
    );
  }

  // Already accepted
  if (invite.acceptedAt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <svg className="size-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Invite Already Used</h1>
          <p className="text-muted-foreground">
            This invite has already been used.
          </p>
        </div>
      </div>
    );
  }

  // Expired
  if (new Date(invite.expiresAt) < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <svg className="size-6 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Invite Expired</h1>
          <p className="text-muted-foreground">
            This invite has expired. Ask your admin to resend the invite.
          </p>
        </div>
      </div>
    );
  }

  // Valid invite -- render client component for auto-acceptance (logged-in users)
  // and CTA buttons for logged-out users
  const expiresDate = new Date(invite.expiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <InviteAcceptClient
        token={token}
        orgName={invite.orgName}
        role={invite.role}
        expiresAt={invite.expiresAt}
        daysLeft={daysLeft}
      />
    </div>
  );
}
