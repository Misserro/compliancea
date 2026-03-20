"use client";

import { signOut } from "next-auth/react";

export default function NoOrgPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          No Organization Found
        </h1>
        <p className="text-muted-foreground">
          Your account is not a member of any organization. Please contact your
          administrator to be added to an organization.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
