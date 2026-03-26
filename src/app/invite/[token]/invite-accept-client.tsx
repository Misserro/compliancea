"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";

interface InviteAcceptClientProps {
  token: string;
  orgName: string;
  role: string;
  expiresAt: string;
  daysLeft: number;
}

export function InviteAcceptClient({
  token,
  orgName,
  role,
  expiresAt,
  daysLeft,
}: InviteAcceptClientProps) {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const acceptAttempted = useRef(false);
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");
  const locale = useLocale();

  // Auto-accept for logged-in users
  useEffect(() => {
    if (status !== "authenticated" || !session?.user || acceptAttempted.current) {
      return;
    }

    acceptAttempted.current = true;
    setAccepting(true);

    async function acceptInvite() {
      try {
        const res = await fetch(`/api/invites/${token}/accept`, {
          method: "POST",
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409 && data.error === "Already a member of this organization") {
            // Already a member -- just redirect to dashboard
            router.push("/dashboard");
            return;
          }
          setError(data.error ?? t("failedToAccept"));
          setAccepting(false);
          return;
        }

        const result = await res.json();

        // Switch session to the new org
        await update({ switchToOrgId: result.orgId });

        // Clear pending invite token from sessionStorage
        try {
          sessionStorage.removeItem("pendingInviteToken");
        } catch {
          // sessionStorage may not be available
        }

        router.push("/dashboard");
      } catch {
        setError(t("somethingWentWrong"));
        setAccepting(false);
      }
    }

    acceptInvite();
  }, [status, session, token, update, router, t]);

  // Loading state while checking session
  if (status === "loading") {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  // Auto-accepting state for logged-in users
  if (accepting) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t("joiningOrg", { orgName })}</h1>
        <p className="text-muted-foreground">
          {t("settingUpMembership")}
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <svg className="size-6 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t("errorTitle")}</h1>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  // Logged-out user: show invite details with CTA buttons
  const formattedExpiry = new Date(expiresAt).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8 shadow-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("youreInvited")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("invitedToJoinOrg")}
        </p>
      </div>

      <div className="space-y-3 rounded-md border bg-muted/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("organizationLabel")}</span>
          <span className="font-medium">{orgName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("roleLabel")}</span>
          <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium">
            {role}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("expiresLabel")}</span>
          <span className="text-sm">
            {formattedExpiry} ({t("daysLeft", { count: daysLeft })})
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <a
          href={`/login?invite=${token}`}
          className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("logInToAccept")}
        </a>
        <a
          href={`/register?invite=${token}`}
          className="flex w-full items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          {t("createAccount")}
        </a>
      </div>
    </div>
  );
}
