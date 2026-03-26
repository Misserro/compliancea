"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

export default function NoOrgPage() {
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("noOrgFound")}
        </h1>
        <p className="text-muted-foreground">
          {t("noOrgDescription")}
        </p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          {tc("signOut")}
        </button>
      </div>
    </div>
  );
}
