# Task 4 Implementation Plan — Strings: Auth + Invite Pages

## Files to Modify

1. **`messages/en.json`** — expand `Auth` namespace with all keys needed by auth pages
2. **`messages/pl.json`** — expand `Auth` namespace with Polish translations
3. **`src/app/(auth)/login/page.tsx`** — replace all hardcoded strings with `useTranslations('Auth')` calls
4. **`src/app/(auth)/register/page.tsx`** — replace all hardcoded strings with `useTranslations('Auth')` calls
5. **`src/app/invite/[token]/page.tsx`** — replace hardcoded strings with `await getTranslations('Auth')` (server component)
6. **`src/app/invite/[token]/invite-accept-client.tsx`** — replace hardcoded strings with `useTranslations('Auth')` calls
7. **`src/app/no-org/page.tsx`** — replace hardcoded strings with `useTranslations('Auth')` calls

## Auth Namespace Keys (New)

Adding to the existing skeleton (`signIn`, `email`, `password`, `register`, `forgotPassword`):

### Login page
- `signInTitle` — "Sign in"
- `enterCredentials` — "Enter your credentials to continue"
- `signingIn` — "Signing in..."
- `invalidCredentials` — "Invalid email or password"
- `inviteLoginPrompt` — "You've been invited to join an organization. Log in to accept."
- `noAccount` — "Don't have an account?"

### Register page
- `createAccount` — "Create account"
- `signUpSubtitle` — "Sign up to get started"
- `creatingAccount` — "Creating account..."
- `registrationFailed` — "Registration failed"
- `somethingWentWrong` — "Something went wrong. Please try again."
- `inviteRegisterPrompt` — "You've been invited to join {orgName}. Create an account to accept."
- `inviteRegisterPromptGeneric` — "You've been invited to join an organization. Create an account to accept."
- `nameLabel` — "Name"
- `minCharacters` — "Minimum 8 characters"
- `alreadyHaveAccount` — "Already have an account?"

### Invite page (server + client)
- `invalidInvite` — "Invalid Invite"
- `invalidInviteDesc` — "This invite link is invalid or has been revoked."
- `inviteAlreadyUsed` — "Invite Already Used"
- `inviteAlreadyUsedDesc` — "This invite has already been used."
- `inviteExpired` — "Invite Expired"
- `inviteExpiredDesc` — "This invite has expired. Ask your admin to resend the invite."
- `youreInvited` — "You're invited"
- `invitedToJoinOrg` — "You've been invited to join an organization"
- `organizationLabel` — "Organization"
- `roleLabel` — "Role"
- `expiresLabel` — "Expires"
- `daysLeft` — "{count} days left" / "{count} day left"
- `logInToAccept` — "Log in to accept"
- `joiningOrg` — "Joining {orgName}..."
- `settingUpMembership` — "Setting up your membership. This will just take a moment."
- `failedToAccept` — "Failed to accept invite"
- `errorTitle` — "Error"

### No-org page
- `noOrgFound` — "No Organization Found"
- `noOrgDescription` — "Your account is not a member of any organization. Please contact your administrator to be added to an organization."

## Approach

- **Login/Register pages**: Both are `"use client"` components. Use `useTranslations('Auth')`.
- **Invite page (page.tsx)**: Server component. Use `await getTranslations('Auth')` from `next-intl/server`.
- **Invite accept client**: Client component. Use `useTranslations('Auth')`.
- **No-org page**: Client component (`"use client"`). Use `useTranslations('Auth')`.
- For the `inviteRegisterPrompt` with `{orgName}`, use next-intl's ICU message format: `"You've been invited to join {orgName}. Create an account to accept."` — works with both named org and fallback.
- For `daysLeft` pluralization, use ICU `{count, plural, one {# day left} other {# days left}}`.
- Existing keys (`signIn`, `email`, `password`, `register`, `forgotPassword`) will be reused where applicable.

## Success Criteria Mapping

1. Login page fully switches EN/PL — all 8+ hardcoded strings replaced
2. Register page fully switches EN/PL — all 10+ hardcoded strings replaced
3. Invite acceptance page switches language — all error states + valid invite view
4. No-org error page switches language — heading, description, button
5. TypeScript compiles clean

## Risks

- The invite page mixes server and client components. The server component (`page.tsx`) uses `getTranslations`, while `invite-accept-client.tsx` uses `useTranslations`. Both read from the same `Auth` namespace — no conflict.
- The `daysLeft` pluralization uses ICU format which next-intl supports natively.
