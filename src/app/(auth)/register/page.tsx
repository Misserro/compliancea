"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteOrgName, setInviteOrgName] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("Auth");

  // Store invite token and pre-fill email from invite data
  useEffect(() => {
    if (!inviteToken) return;

    try {
      sessionStorage.setItem("pendingInviteToken", inviteToken);
    } catch {
      // sessionStorage may not be available
    }

    // Fetch invite details to pre-fill email
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/invites/${inviteToken}`);
        if (res.ok) {
          const data = await res.json();
          if (data.valid && data.email) {
            setEmail(data.email);
          }
          if (data.orgName) {
            setInviteOrgName(data.orgName);
          }
        }
      } catch {
        // Non-critical — user can still type email manually
      }
    }

    fetchInvite();
  }, [inviteToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t("registrationFailed"));
        setLoading(false);
        return;
      }

      // Auto sign-in after successful registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      setLoading(false);

      if (result?.error) {
        router.push("/login");
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
    } catch {
      setError(t("somethingWentWrong"));
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("createAccount")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("signUpSubtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {inviteToken && (
          <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            {inviteOrgName
              ? t("inviteRegisterPrompt", { orgName: inviteOrgName })
              : t("inviteRegisterPromptGeneric")}
          </p>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label className="text-sm font-medium">{t("nameLabel")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

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
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">{t("minCharacters")}</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? t("creatingAccount") : t("createAccount")}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("alreadyHaveAccount")}{" "}
        <a
          href={inviteToken ? `/login?invite=${inviteToken}` : "/login"}
          className="text-primary hover:underline"
        >
          {t("signIn")}
        </a>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");

  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t("createAccount")}</h1>
            <p className="text-sm text-muted-foreground">{tc("loading")}</p>
          </div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
