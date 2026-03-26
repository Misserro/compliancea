"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("Auth");

  // Store invite token in sessionStorage when present
  useEffect(() => {
    if (inviteToken) {
      try {
        sessionStorage.setItem("pendingInviteToken", inviteToken);
      } catch {
        // sessionStorage may not be available
      }
    }
  }, [inviteToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("invalidCredentials"));
    } else {
      // Check for pending invite token — redirect to invite page instead of dashboard
      let pendingToken: string | null = null;
      try {
        pendingToken = sessionStorage.getItem("pendingInviteToken");
      } catch {
        // sessionStorage may not be available
      }

      if (pendingToken) {
        router.push(`/invite/${pendingToken}`);
      } else {
        router.push("/dashboard");
      }
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("signIn")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("enterCredentials")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {inviteToken && (
          <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            {t("inviteLoginPrompt")}
          </p>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label className="text-sm font-medium">{t("email")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t("password")}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? t("signingIn") : t("signIn")}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <a
          href={inviteToken ? `/register?invite=${inviteToken}` : "/register"}
          className="text-primary hover:underline"
        >
          {t("register")}
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");

  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t("signIn")}</h1>
            <p className="text-sm text-muted-foreground">{tc("loading")}</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
