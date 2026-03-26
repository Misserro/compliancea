# Task 1 Implementation Notes — Infrastructure: next-intl setup + language switcher

## Changes Summary

### New Files
- **`i18n/request.ts`** — Cookie-based locale resolver using `getRequestConfig` from `next-intl/server`. Reads `cookies().get('locale')?.value ?? 'en'`, dynamically imports matching messages file.
- **`messages/en.json`** — Full namespace skeleton with 11 namespaces. `Common` has 28 keys fully populated in English. Other namespaces have 3-5 representative stub keys each.
- **`messages/pl.json`** — Mirror of en.json with Polish translations. `Common.signOut` = "Wyloguj sie". All namespaces present with identical key structure.
- **`src/app/api/locale/route.ts`** — POST endpoint. Validates `locale` is 'en' or 'pl'. Sets httpOnly cookie with path=/, maxAge=31536000 (1 year), sameSite=lax. Returns `{ locale }`.
- **`src/components/layout/language-switcher.tsx`** — Client component using `useLocale()` from next-intl. Shows Globe icon + alternate language label ("PL" or "EN"). On click, POSTs to `/api/locale` then calls `window.location.reload()`.

### Modified Files
- **`next.config.mjs`** (lines 1-3, 24) — Added `import createNextIntlPlugin from 'next-intl/plugin'` and `const withNextIntl = createNextIntlPlugin('./i18n/request.ts')`. Wrapped export: `export default withNextIntl(nextConfig)`.
- **`src/app/layout.tsx`** (lines 7-8, 20-22, 25, 27, 34) — Added imports for `getLocale`/`getMessages` from `next-intl/server` and `NextIntlClientProvider` from `next-intl`. Made RootLayout async. Added `await getLocale()` and `await getMessages()` calls. Set `<html lang={locale}>` dynamically. Wrapped content in `<NextIntlClientProvider messages={messages}>`.
- **`src/components/layout/app-sidebar.tsx`** (lines 21-22, 55, 371, 385) — Added imports for `useTranslations` and `LanguageSwitcher`. Added `const t = useTranslations("Common")`. Replaced hardcoded "Sign out" with `{t("signOut")}`. Added `<LanguageSwitcher />` in footer after theme toggle.
- **`package.json`** — `next-intl` added as dependency (via npm install).

## Integration Points
- **INTEGRATION:** Tasks 2-7 should add their namespace keys to `messages/en.json` and `messages/pl.json`. Each task owns distinct top-level namespaces — no cross-task conflicts.
- **INTEGRATION:** Tasks 2-7 use `useTranslations('Namespace')` in client components and `getTranslations('Namespace')` in server components.
- **INTEGRATION:** The `NextIntlClientProvider` in layout.tsx passes all messages to client components — no additional provider setup needed in child routes.

## Verification
- TypeScript compiles clean (`npx tsc --noEmit` — zero errors)
- All success criteria addressed:
  - Language toggle button visible in sidebar footer (LanguageSwitcher component)
  - Clicking sets cookie via POST /api/locale and reloads page
  - `<html lang>` switches dynamically via `await getLocale()` in layout.tsx
  - "Sign out" / "Wyloguj sie" switches via `t("signOut")` in app-sidebar.tsx
