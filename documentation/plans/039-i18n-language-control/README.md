# Plan 039 — i18n: English / Polish Language Control

## Overview

Introduces full internationalisation (i18n) to the application using `next-intl`. Users can switch between **English** (default) and **Polish** via a language toggle in the sidebar footer. The language preference is stored as a cookie and applies to all UI text across the entire app.

This plan is structured in two phases:
1. **Infrastructure + Language Switcher** (Task 1) — installs next-intl, creates the message file skeleton, wires up the provider, and ships the toggle button.
2. **String extraction** (Tasks 2–7) — one task per feature area, each independently extracting hardcoded strings into translation keys in both `messages/en.json` and `messages/pl.json`.

Tasks 2–7 depend on Task 1 but are independent of each other and can be executed in any order (or in parallel with concurrency > 1).

## Architecture

See `documentation/technology/architecture/i18n.md` for the full architecture specification, including the bilingual requirement for all future features.

**Key decisions:**
- `next-intl` without URL routing — cookie-based locale (`locale=en|pl`), no route restructuring
- English is the default language for unauthenticated users and users without a locale cookie
- Hard reload (`window.location.reload()`) on language toggle — required because server components render locale at request time
- `Common` namespace centralises shared labels (Save, Cancel, Delete, Edit, …) used across all features
- Dynamic status/type labels (e.g. `LEGAL_CASE_STATUS_DISPLAY`) move from constants to translation keys, called as `t('CaseStatuses.new')` at usage sites

## Scope

### In scope
- `next-intl` installation and configuration
- `messages/en.json` and `messages/pl.json` — all user-visible UI strings across the entire app
- `POST /api/locale` — cookie-setting endpoint
- Language toggle button in `AppSidebar` footer
- `<html lang>` set dynamically from active locale
- All string namespaces: Common, CaseStatuses, CaseTypes, DocCategories, Sidebar, Auth, LegalHub, Contracts, Documents, Settings, Admin
- `documentation/technology/architecture/i18n.md` — bilingual requirement for all future features (written in Stage 4 Step 1, before tasks run)

### Out of scope
- URL-based locale routing (`/en/…`, `/pl/…`)
- Translation of user-entered content (case titles, document names, contract text)
- Translation of AI-generated output (chat, template suggestions)
- Translation of backend API error messages
- Languages beyond English and Polish

## Architecture Notes

### next-intl without URL routing

```
i18n/request.ts
  └─ reads cookies().get('locale') ?? 'en'
  └─ loads messages/${locale}.json

next.config.mjs
  └─ withNextIntl('./i18n/request.ts')

src/app/layout.tsx  (async server component)
  └─ locale = await getLocale()
  └─ messages = await getMessages()
  └─ <html lang={locale}>
  └─ <NextIntlClientProvider messages={messages}>

src/app/api/locale/route.ts
  └─ POST { locale: 'en'|'pl' }
  └─ sets cookie: locale=... path=/ maxAge=1yr
  └─ returns { locale }

src/components/layout/language-switcher.tsx  (client component)
  └─ useLocale() → current locale
  └─ onClick → POST /api/locale → window.location.reload()
```

### Message file layout

```jsonc
// messages/en.json (abbreviated)
{
  "Common": { "save": "Save", "cancel": "Cancel", "delete": "Delete", ... },
  "CaseStatuses": { "new": "New", "intake": "Intake", "analysis": "Analysis", ... },
  "CaseTypes": { "civil": "Civil", "criminal": "Criminal", ... },
  "DocCategories": { "pleadings": "Pleadings", "evidence": "Evidence", ... },
  "Sidebar": { "dashboard": "Dashboard", "contracts": "Contracts", ... },
  "Auth": { "signIn": "Sign in", "email": "Email", "password": "Password", ... },
  "LegalHub": { "cases": "Cases", "newCase": "New case", ... },
  "Contracts": { ... },
  "Documents": { ... },
  "Settings": { ... },
  "Admin": { ... }
}
```

### constants.ts migration

`LEGAL_CASE_STATUS_DISPLAY`, `LEGAL_CASE_TYPE_LABELS`, and `CASE_DOCUMENT_CATEGORIES` label maps are **removed** from `src/lib/constants.ts`. Components that previously did:

```ts
LEGAL_CASE_STATUS_DISPLAY[status]   // → "Nowa"
```

now do:
```ts
const t = useTranslations('CaseStatuses');
t(status)  // → "New" or "Nowa" depending on locale
```

The raw value arrays (`LEGAL_CASE_STATUSES`, `LEGAL_CASE_TYPES`) and colour maps (`LEGAL_CASE_STATUS_COLORS`) remain in `constants.ts` — they are not display strings.

## Tasks

<!-- TASK_LIST_START -->
- [ ] **Task 1 — Infrastructure: next-intl setup + language switcher**
  Install `next-intl`. Create `i18n/request.ts` (cookie-based locale resolver). Wrap `next.config.mjs` with `withNextIntl`. Update `src/app/layout.tsx` to be an async server component: call `getLocale()` / `getMessages()`, set `<html lang={locale}>`, and wrap children in `NextIntlClientProvider`. Create `messages/en.json` and `messages/pl.json` with the full namespace skeleton — all namespaces present, `Common` fully populated, other namespaces with a representative stub (3–5 keys each so the provider has real strings to test). Create `POST /api/locale/route.ts` (validates locale ∈ {en, pl}, sets httpOnly cookie, 1-year expiry). Create `src/components/layout/language-switcher.tsx` (client component: `useLocale()`, button labelled with the alternate language e.g. "PL" when current is EN, on click POSTs and reloads). Add `LanguageSwitcher` to `AppSidebar` footer alongside the existing theme toggle.

  **Files:**
  - `package.json` (modify — add `next-intl` dependency via npm install)
  - `next.config.mjs` (modify — wrap export with `withNextIntl`)
  - `i18n/request.ts` (new — cookie-based locale resolver)
  - `messages/en.json` (new — full namespace skeleton, Common fully populated)
  - `messages/pl.json` (new — full namespace skeleton, Common fully populated in Polish)
  - `src/app/layout.tsx` (modify — async, getLocale/getMessages, NextIntlClientProvider, dynamic lang)
  - `src/app/api/locale/route.ts` (new — POST endpoint to set locale cookie)
  - `src/components/layout/language-switcher.tsx` (new — client toggle button)
  - `src/components/layout/app-sidebar.tsx` (modify — add LanguageSwitcher to footer)

  **Depends on:** none

  **Success criteria:** Language toggle button visible in sidebar footer showing the alternate language ("PL" or "EN"). Clicking it sets the cookie and reloads the page. The `<html lang>` attribute switches between `en` and `pl`. Common strings (e.g. a "Save" / "Zapisz" label rendered from `messages/en.json` or `messages/pl.json`) display correctly in both languages. "Sign out" / "Wyloguj się" in the sidebar footer switches. TypeScript compiles clean.

- [ ] **Task 2 — Strings: App constants + sidebar navigation**
  Populate `CaseStatuses`, `CaseTypes`, `DocCategories`, and `Sidebar` namespaces in both message files. Remove `LEGAL_CASE_STATUS_DISPLAY` and `LEGAL_CASE_TYPE_LABELS` display-string maps from `src/lib/constants.ts`; update all components that reference them to use `useTranslations` / `getTranslations` instead. Update `CASE_DOCUMENT_CATEGORIES` label values to use translation keys (or replace with a hook). Replace all hardcoded sidebar navigation labels in `app-sidebar.tsx` with `t()` calls (Dashboard, Contracts, Obligations, Documents, Policies, Analyze & Process, Ask Library, Settings, Members, Admin, Sprawy → Cases, Szablony → Templates, Moja kancelaria → My law firm).

  **Files:**
  - `messages/en.json` (modify — CaseStatuses, CaseTypes, DocCategories, Sidebar namespaces)
  - `messages/pl.json` (modify — same namespaces in Polish)
  - `src/lib/constants.ts` (modify — remove display-string maps; keep raw value arrays and colour maps)
  - `src/components/layout/app-sidebar.tsx` (modify — all nav labels via t())
  - Any component that imported `LEGAL_CASE_STATUS_DISPLAY` or `LEGAL_CASE_TYPE_LABELS` (modify — switch to `useTranslations('CaseStatuses')` / `useTranslations('CaseTypes')`)

  **Depends on:** Task 1

  **Success criteria:** Sidebar navigation labels switch between English and Polish. Status badges on case cards (New/Nowa, Closed/Zamknięta, …) switch language. Case type labels switch language. Document category filter chips switch language. TypeScript compiles clean (no references to removed constant maps).

- [ ] **Task 3 — Strings: Legal Hub (all components)**
  Populate the `LegalHub` namespace in both message files. Replace every hardcoded Polish string in `src/components/legal-hub/` with `t('LegalHub.key')` calls. This covers: `blueprint-management.tsx`, `case-card.tsx`, `case-deadlines-section.tsx`, `case-detail-page.tsx`, `case-documents-tab.tsx`, `case-generate-tab.tsx`, `case-header.tsx`, `case-list.tsx`, `case-metadata-form.tsx`, `case-overview-tab.tsx`, `case-chat-panel.tsx`, `firm-stats-panel.tsx`, `member-roster.tsx`, `new-case-dialog.tsx`, `template-form.tsx`, `template-list.tsx`, `template-management-page.tsx`, `template-wizard.tsx`, `legal-hub-dashboard.tsx`, `firm-dashboard.tsx`. Update date locale calls: `toLocaleDateString("pl-PL", …)` → `toLocaleDateString(locale, …)` using `useLocale()`.

  **Files:**
  - `messages/en.json` (modify — LegalHub namespace, comprehensive)
  - `messages/pl.json` (modify — LegalHub namespace in Polish)
  - `src/components/legal-hub/*.tsx` (modify — all files, replace hardcoded strings)

  **Depends on:** Task 1

  **Success criteria:** All Legal Hub pages (case list, case detail, templates, blueprints, firm dashboard, member roster) fully switch between English and Polish. Date formats follow the active locale. No hardcoded Polish or English strings remain in `src/components/legal-hub/`. TypeScript compiles clean.

- [ ] **Task 4 — Strings: Auth + invite pages**
  Populate the `Auth` namespace in both message files. Replace all hardcoded strings in auth-related pages and components: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/invite/[token]/page.tsx`, `src/app/no-org/page.tsx`, and any sub-components they render. Covers: form labels (Email, Password, Name), button text (Sign in, Register, Continue), error messages, invite acceptance copy, no-org error state.

  **Files:**
  - `messages/en.json` (modify — Auth namespace)
  - `messages/pl.json` (modify — Auth namespace in Polish)
  - `src/app/(auth)/login/page.tsx` (modify)
  - `src/app/(auth)/register/page.tsx` (modify)
  - `src/app/invite/[token]/page.tsx` (modify)
  - `src/app/no-org/page.tsx` (modify)

  **Depends on:** Task 1

  **Success criteria:** Login and register pages fully switch between English and Polish. Invite acceptance page copy switches language. No-org error page switches language. TypeScript compiles clean.

- [ ] **Task 5 — Strings: Contracts + Obligations + Dashboard**
  Populate `Contracts` and `Dashboard` namespaces in both message files. Replace hardcoded strings in: `src/components/contracts/` (all files — ContractsTab, ContractList, ObligationsTab, any contract card/form components), `src/app/(app)/dashboard/page.tsx` and its sub-components. Covers: contract list headings, empty states, status labels, obligation labels, dashboard stats copy.

  **Files:**
  - `messages/en.json` (modify — Contracts, Dashboard namespaces)
  - `messages/pl.json` (modify — same namespaces in Polish)
  - `src/components/contracts/*.tsx` (modify — all files)
  - `src/app/(app)/dashboard/page.tsx` (modify — and any dashboard sub-components)

  **Depends on:** Task 1

  **Success criteria:** Contracts list and obligation list pages fully switch language. Dashboard page switches language. TypeScript compiles clean.

- [ ] **Task 6 — Strings: Documents Hub (Documents, Analyze, Ask, Policies)**
  Populate the `Documents` namespace in both message files. Replace hardcoded strings in components serving: `src/app/(app)/documents/`, `src/app/(app)/document-tools/` (AnalyzerSection, DeskSection), `src/app/(app)/ask/`, `src/app/(app)/policies/`. Covers: upload prompts, processing state labels, search placeholders, policy viewer copy, ask-library interface.

  **Files:**
  - `messages/en.json` (modify — Documents namespace)
  - `messages/pl.json` (modify — Documents namespace in Polish)
  - Components under `src/components/analyze/`, `src/components/documents/` (if exists), and any page-level components for the listed routes (modify — all files)

  **Depends on:** Task 1

  **Success criteria:** Documents, Analyze & Process, Ask Library, and Policies pages fully switch language. TypeScript compiles clean.

- [ ] **Task 7 — Strings: Settings + Org management + Admin panel**
  Populate `Settings` and `Admin` namespaces in both message files. Replace hardcoded strings in: `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/org/page.tsx`, `src/app/(app)/org/members/page.tsx`, and all components in `src/components/admin/` (admin org list, create org dialog, org migration panel, feature flags, etc.). Covers: settings form labels, org management UI, super admin panel headings and actions.

  **Files:**
  - `messages/en.json` (modify — Settings, Admin namespaces)
  - `messages/pl.json` (modify — same namespaces in Polish)
  - `src/app/(app)/settings/page.tsx` (modify)
  - `src/app/(app)/settings/org/page.tsx` (modify)
  - `src/app/(app)/org/members/page.tsx` (modify)
  - `src/components/admin/*.tsx` (modify — all files)

  **Depends on:** Task 1

  **Success criteria:** User settings, org settings, member management, and admin panel pages fully switch language. TypeScript compiles clean. No user-visible hardcoded English or Polish strings remain anywhere in the app.
<!-- TASK_LIST_END -->

## Documentation Gaps

| Gap | Priority | Location |
|-----|----------|----------|
| `documentation/technology/architecture/tech-stack.md` — add `next-intl` entry under Frontend libraries | Low | `documentation/technology/architecture/tech-stack.md` |
| `documentation/product/requirements/features.md` — add i18n / language control as a shipped feature | Low | `documentation/product/requirements/features.md` |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| next-intl version incompatibility with Next.js 15 / React 19 | Low | High | Install latest next-intl (v3+); check peer deps before install; next-intl is actively maintained for Next.js 15 App Router |
| Missing translation keys cause runtime errors or blank UI | Medium | Medium | next-intl logs a warning in dev for missing keys and falls back to the key name in production — never crashes. Add a CI lint step or translation completeness check in tests. |
| `LEGAL_CASE_STATUS_DISPLAY` removal breaks components not caught in Task 2 | Medium | Medium | TypeScript will error at compile time on missing imports — the build itself is the safety net. Task 2 success criteria requires TypeScript clean. |
| Hard reload on language switch is jarring if triggered accidentally | Low | Low | Add a confirmation state or debounce if UX feedback reveals it as a problem post-ship. |
| Server components calling `getTranslations` before `NextIntlClientProvider` is initialized | Low | High | next-intl's server functions (`getTranslations`, `getLocale`) read directly from the request config — they do not depend on the client provider. No risk if `i18n/request.ts` is set up correctly in Task 1. |
| Tasks 2–7 executed in parallel introduce merge conflicts on `messages/en.json` / `messages/pl.json` | Medium | Low | Each task owns a distinct top-level namespace key — JSON merge conflicts are limited to a single line per namespace boundary and are trivially resolved. |
