# Task 4 Implementation Notes — Strings: Auth + Invite Pages

## Changes Summary

### Modified Files

- **`messages/en.json`** (Auth namespace) — Expanded from 5 keys to 40 keys. Added all strings for login, register, invite, and no-org pages. Uses ICU `{count, plural, ...}` for `daysLeft` and `{orgName}` interpolation for invite prompts.

- **`messages/pl.json`** (Auth namespace) — Expanded to match en.json with Polish translations. Polish pluralization uses `one/few/many/other` forms for `daysLeft`.

- **`src/app/(auth)/login/page.tsx`** — Added `useTranslations("Auth")` to both `LoginForm` and `LoginPage` components. Replaced 8 hardcoded strings: heading, subtitle, invite prompt, error message, form labels (Email, Password), button text (Sign in / Signing in...), and "Don't have an account?" / "Register" link text. Fallback loading text uses `useTranslations("Common")` for "Loading...".

- **`src/app/(auth)/register/page.tsx`** — Added `useTranslations("Auth")` to both `RegisterForm` and `RegisterPage` components. Replaced 12 hardcoded strings: heading, subtitle, invite prompt (with `{orgName}` interpolation and generic fallback), error messages (registration failed, something went wrong), form labels (Name, Email, Password), minimum characters hint, button text (Create account / Creating account...), and "Already have an account?" / "Sign in" link text.

- **`src/app/invite/[token]/page.tsx`** (server component) — Added `getTranslations("Auth")` from `next-intl/server`. Replaced 6 hardcoded strings across three error states: Invalid Invite, Invite Already Used, Invite Expired (heading + description for each).

- **`src/app/invite/[token]/invite-accept-client.tsx`** (client component) — Added `useTranslations("Auth")` and `useTranslations("Common")`. Added `useLocale()` for date formatting. Replaced 14 hardcoded strings: loading state, joining org state (with `{orgName}` interpolation), error state heading, invite details card (Organization, Role, Expires labels), `daysLeft` with ICU plural, CTA buttons (Log in to accept, Create account), heading/subtitle. Changed `toLocaleDateString(undefined, ...)` to `toLocaleDateString(locale, ...)` for proper locale-aware date formatting.

- **`src/app/no-org/page.tsx`** (client component) — Added `useTranslations("Auth")` and `useTranslations("Common")`. Replaced 3 hardcoded strings: heading, description, sign-out button (reuses `Common.signOut`).

## Key Decisions

- **Reused existing keys** where applicable: `signIn`, `email`, `password`, `register` from the Task 1 skeleton.
- **`Common.signOut`** reused in no-org page (already exists from Task 1) rather than duplicating in Auth namespace.
- **`Common.loading`** reused for suspense fallbacks and the invite loading state.
- **ICU plural format** for `daysLeft` to handle English (one/other) and Polish (one/few/many/other) pluralization correctly.
- **Two invite register prompt keys** (`inviteRegisterPrompt` with `{orgName}` param, `inviteRegisterPromptGeneric` without) to handle both cases cleanly — the component conditionally picks the right one based on whether orgName is available.

## Integration Points

- INTEGRATION: All keys live in the `Auth` namespace — no conflicts with other task namespaces.
- INTEGRATION: The invite page server component uses `getTranslations` from `next-intl/server`, while all client components use `useTranslations` from `next-intl` — consistent with patterns established in Task 1.

## Verification

- TypeScript compiles clean (`npx tsc --noEmit` — zero errors)
