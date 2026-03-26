# Task 1 Implementation Plan — Infrastructure: next-intl setup + language switcher

## Files to Create

1. **`i18n/request.ts`** (new) — cookie-based locale resolver using `getRequestConfig` from `next-intl/server`. Reads `cookies().get('locale')?.value ?? 'en'`, dynamically imports `messages/${locale}.json`.

2. **`messages/en.json`** (new) — Full namespace skeleton. `Common` fully populated (save, cancel, delete, edit, back, loading, signOut, search, actions, name, date, status, type + more). Other namespaces (CaseStatuses, CaseTypes, DocCategories, Sidebar, Auth, LegalHub, Contracts, Documents, Settings, Admin) with 3-5 representative stub keys each.

3. **`messages/pl.json`** (new) — Mirror of en.json with Polish translations. `Common.signOut` = "Wyloguj sie".

4. **`src/app/api/locale/route.ts`** (new) — POST handler. Validates `locale` in {en, pl}. Sets httpOnly cookie `locale` with path=/, maxAge=31536000 (1 year). Returns JSON `{ locale }`.

5. **`src/components/layout/language-switcher.tsx`** (new) — Client component. Uses `useLocale()` from `next-intl`. Shows button with alternate language label ("PL" when current=en, "EN" when current=pl). On click, POSTs to `/api/locale` with the alternate locale, then calls `window.location.reload()`.

## Files to Modify

6. **`next.config.mjs`** — Add `import createNextIntlPlugin from 'next-intl/plugin'` at top. Create `withNextIntl = createNextIntlPlugin('./i18n/request.ts')`. Wrap the exported config: `export default withNextIntl(nextConfig)`.

7. **`src/app/layout.tsx`** — Make async. Import `getLocale`, `getMessages` from `next-intl/server` and `NextIntlClientProvider` from `next-intl`. Call `const locale = await getLocale()` and `const messages = await getMessages()`. Set `<html lang={locale}>`. Wrap children in `<NextIntlClientProvider messages={messages}>`.

8. **`src/components/layout/app-sidebar.tsx`** — Import `LanguageSwitcher` from `./language-switcher`. Add `<LanguageSwitcher />` in the `SidebarFooter` after the theme toggle button (after line ~383). Also import `useTranslations` from `next-intl` and use `t('Common.signOut')` for the "Sign out" text to demonstrate language switching.

## Changes Detail

### i18n/request.ts
```ts
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value ?? 'en';
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

### next.config.mjs
- Line 1: `import createNextIntlPlugin from 'next-intl/plugin';`
- Line 2: `const withNextIntl = createNextIntlPlugin('./i18n/request.ts');`
- Last line: change `export default nextConfig;` to `export default withNextIntl(nextConfig);`

### src/app/layout.tsx
- Add imports: `getLocale`, `getMessages` from `next-intl/server`, `NextIntlClientProvider` from `next-intl`
- Change `export default function RootLayout(...)` to `export default async function RootLayout(...)`
- Before return: `const locale = await getLocale(); const messages = await getMessages();`
- `<html lang={locale}>` (dynamic instead of hardcoded "en")
- Wrap `<ThemeProvider>` inside `<NextIntlClientProvider messages={messages}>`

### src/components/layout/app-sidebar.tsx
- Import `LanguageSwitcher` and `useTranslations`
- Add `const t = useTranslations('Common');` at top of AppSidebar
- Replace hardcoded "Sign out" with `{t('signOut')}`
- Add `<LanguageSwitcher />` after theme button in footer

### POST /api/locale/route.ts
- Validate body.locale is 'en' or 'pl'
- Return 400 if invalid
- Set cookie and return 200 with `{ locale }`

## Success Criteria Mapping
- Language toggle visible in sidebar footer: LanguageSwitcher component added to AppSidebar footer
- Clicking sets cookie and reloads: POST /api/locale + window.location.reload()
- `<html lang>` switches: layout.tsx uses `await getLocale()` for dynamic lang attribute
- Common strings switch: "Sign out" / "Wyloguj sie" demonstrated via `t('signOut')` in sidebar
- TypeScript compiles clean: all types properly handled, next-intl provides types

## Risks
- next-intl version compatibility with Next.js 15 / React 19 — mitigated by installing latest version
- `cookies()` in Next.js 15 is async (returns Promise) — must use `await cookies()`
