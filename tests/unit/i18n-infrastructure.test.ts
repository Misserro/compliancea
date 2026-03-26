/**
 * Unit tests for Task 1: i18n Infrastructure — next-intl setup + language switcher
 * Plan 039 — i18n: English / Polish Language Control
 *
 * Tests are written against the plan's success criteria (primary source of truth):
 * 1. i18n/request.ts exists with cookie-based locale reading
 * 2. messages/en.json and messages/pl.json exist with all required namespaces
 * 3. Common namespace is fully populated in both files
 * 4. POST /api/locale/route.ts exists with validation and httpOnly cookie logic
 * 5. src/app/layout.tsx is async with NextIntlClientProvider
 * 6. src/components/layout/language-switcher.tsx exists as client component
 * 7. app-sidebar.tsx includes LanguageSwitcher
 * 8. pl.json contains Polish diacritics (proper Polish, not ASCII approximations)
 *
 * Strategy:
 * - Code inspection tests: read and parse the actual source files to verify
 *   structure, content, and compliance with the plan spec.
 * - No mocking of Next.js runtime (next/server / next-intl server APIs cannot
 *   be imported into Vitest).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

function readFile(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return existsSync(resolve(ROOT, relPath));
}

// ---------------------------------------------------------------------------
// 1. File existence
// ---------------------------------------------------------------------------
describe("File existence — required files for Task 1", () => {
  const required = [
    "i18n/request.ts",
    "messages/en.json",
    "messages/pl.json",
    "src/app/api/locale/route.ts",
    "src/components/layout/language-switcher.tsx",
  ];

  for (const f of required) {
    it(`${f} exists`, () => {
      expect(fileExists(f), `Expected file to exist: ${f}`).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. next.config.mjs — wrapped with withNextIntl
// ---------------------------------------------------------------------------
describe("next.config.mjs — withNextIntl plugin", () => {
  it("imports createNextIntlPlugin from next-intl/plugin", () => {
    const src = readFile("next.config.mjs");
    expect(src).toMatch(/from ['"]next-intl\/plugin['"]/);
  });

  it("wraps the default export with withNextIntl", () => {
    const src = readFile("next.config.mjs");
    expect(src).toMatch(/export default withNextIntl\(/);
  });

  it("points withNextIntl to ./i18n/request.ts", () => {
    const src = readFile("next.config.mjs");
    expect(src).toMatch(/['"]\.\/i18n\/request\.ts['"]/);
  });
});

// ---------------------------------------------------------------------------
// 3. i18n/request.ts — cookie-based locale resolver
// ---------------------------------------------------------------------------
describe("i18n/request.ts — cookie-based locale resolver", () => {
  it("imports getRequestConfig from next-intl/server", () => {
    const src = readFile("i18n/request.ts");
    expect(src).toMatch(/from ['"]next-intl\/server['"]/);
    expect(src).toMatch(/getRequestConfig/);
  });

  it("imports cookies from next/headers", () => {
    const src = readFile("i18n/request.ts");
    expect(src).toMatch(/from ['"]next\/headers['"]/);
  });

  it("reads locale from cookie named 'locale'", () => {
    const src = readFile("i18n/request.ts");
    expect(src).toMatch(/get\(['"]locale['"]\)/);
  });

  it("falls back to 'en' when cookie is absent", () => {
    const src = readFile("i18n/request.ts");
    expect(src).toMatch(/\?\?.*['"]en['"]/);
  });

  it("loads messages dynamically from messages/${locale}.json", () => {
    const src = readFile("i18n/request.ts");
    expect(src).toMatch(/messages\//);
    expect(src).toMatch(/\$\{locale\}/);
  });
});

// ---------------------------------------------------------------------------
// 4. src/app/layout.tsx — async server component with NextIntlClientProvider
// ---------------------------------------------------------------------------
describe("src/app/layout.tsx — async server component + NextIntlClientProvider", () => {
  it("imports getLocale and getMessages from next-intl/server", () => {
    const src = readFile("src/app/layout.tsx");
    expect(src).toMatch(/from ['"]next-intl\/server['"]/);
    expect(src).toMatch(/getLocale/);
    expect(src).toMatch(/getMessages/);
  });

  it("imports NextIntlClientProvider from next-intl", () => {
    const src = readFile("src/app/layout.tsx");
    expect(src).toMatch(/from ['"]next-intl['"]/);
    expect(src).toMatch(/NextIntlClientProvider/);
  });

  it("is an async function (async server component)", () => {
    const src = readFile("src/app/layout.tsx");
    expect(src).toMatch(/export default async function/);
  });

  it("calls await getLocale()", () => {
    const src = readFile("src/app/layout.tsx");
    expect(src).toMatch(/await getLocale\(\)/);
  });

  it("calls await getMessages()", () => {
    const src = readFile("src/app/layout.tsx");
    expect(src).toMatch(/await getMessages\(\)/);
  });

  it("sets html lang attribute dynamically from locale", () => {
    const src = readFile("src/app/layout.tsx");
    expect(src).toMatch(/lang=\{locale\}/);
  });

  it("wraps children in NextIntlClientProvider with messages prop", () => {
    const src = readFile("src/app/layout.tsx");
    expect(src).toMatch(/<NextIntlClientProvider/);
    expect(src).toMatch(/messages=\{messages\}/);
  });
});

// ---------------------------------------------------------------------------
// 5. src/app/api/locale/route.ts — POST endpoint
// ---------------------------------------------------------------------------
describe("src/app/api/locale/route.ts — POST locale-setting endpoint", () => {
  it("exports a POST handler", () => {
    const src = readFile("src/app/api/locale/route.ts");
    expect(src).toMatch(/export.*async function POST/);
  });

  it("validates locale is in {en, pl} and returns 400 for invalid values", () => {
    const src = readFile("src/app/api/locale/route.ts");
    expect(src).toMatch(/en/);
    expect(src).toMatch(/pl/);
    expect(src).toMatch(/400/);
  });

  it("sets cookie with httpOnly flag", () => {
    const src = readFile("src/app/api/locale/route.ts");
    expect(src).toMatch(/httpOnly.*true/);
  });

  it("sets cookie with 1-year maxAge (31536000 seconds)", () => {
    const src = readFile("src/app/api/locale/route.ts");
    expect(src).toMatch(/31536000/);
  });

  it("sets cookie path to /", () => {
    const src = readFile("src/app/api/locale/route.ts");
    expect(src).toMatch(/path.*['"]\/['"]/);
  });
});

// ---------------------------------------------------------------------------
// 6. src/components/layout/language-switcher.tsx — client component
// ---------------------------------------------------------------------------
describe("src/components/layout/language-switcher.tsx — client toggle component", () => {
  it("has 'use client' directive", () => {
    const src = readFile("src/components/layout/language-switcher.tsx");
    expect(src.trimStart()).toMatch(/^['"]use client['"]/);
  });

  it("imports useLocale from next-intl", () => {
    const src = readFile("src/components/layout/language-switcher.tsx");
    expect(src).toMatch(/useLocale/);
    expect(src).toMatch(/from ['"]next-intl['"]/);
  });

  it("shows alternate locale label (PL or EN)", () => {
    const src = readFile("src/components/layout/language-switcher.tsx");
    expect(src).toMatch(/PL/);
    expect(src).toMatch(/EN/);
  });

  it("POSTs to /api/locale on click", () => {
    const src = readFile("src/components/layout/language-switcher.tsx");
    expect(src).toMatch(/\/api\/locale/);
    expect(src).toMatch(/POST/);
  });

  it("calls window.location.reload() after POST", () => {
    const src = readFile("src/components/layout/language-switcher.tsx");
    expect(src).toMatch(/window\.location\.reload/);
  });
});

// ---------------------------------------------------------------------------
// 7. src/components/layout/app-sidebar.tsx — LanguageSwitcher in footer
// ---------------------------------------------------------------------------
describe("src/components/layout/app-sidebar.tsx — LanguageSwitcher in sidebar footer", () => {
  it("imports LanguageSwitcher", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    expect(src).toMatch(/LanguageSwitcher/);
  });

  it("renders <LanguageSwitcher /> in SidebarFooter", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    // Both the SidebarFooter and LanguageSwitcher must be in the file
    expect(src).toMatch(/SidebarFooter/);
    expect(src).toMatch(/<LanguageSwitcher/);
  });

  it("uses t('signOut') for Sign out button (translated via next-intl)", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    expect(src).toMatch(/t\(['"]signOut['"]\)/);
    expect(src).toMatch(/useTranslations/);
  });
});

// ---------------------------------------------------------------------------
// 8. messages/en.json — all namespaces present and Common fully populated
// ---------------------------------------------------------------------------
describe("messages/en.json — namespace structure and Common completeness", () => {
  const REQUIRED_NAMESPACES = [
    "Common", "CaseStatuses", "CaseTypes", "DocCategories",
    "Sidebar", "Auth", "LegalHub", "Contracts", "Documents", "Settings", "Admin",
  ];

  // Minimum required Common keys from the plan architecture
  const REQUIRED_COMMON_KEYS = [
    "save", "cancel", "delete", "edit", "back", "loading",
    "signOut", "search", "actions", "name", "date", "status", "type",
    "confirm", "close", "create", "update", "submit",
  ];

  let enData: Record<string, unknown>;

  it("is valid JSON", () => {
    const raw = readFile("messages/en.json");
    expect(() => { enData = JSON.parse(raw); }).not.toThrow();
    enData = JSON.parse(raw);
  });

  for (const ns of REQUIRED_NAMESPACES) {
    it(`has namespace: ${ns}`, () => {
      const data = JSON.parse(readFile("messages/en.json"));
      expect(data, `Namespace '${ns}' missing from en.json`).toHaveProperty(ns);
      expect(Object.keys(data[ns]).length, `Namespace '${ns}' is empty`).toBeGreaterThan(0);
    });
  }

  for (const key of REQUIRED_COMMON_KEYS) {
    it(`Common.${key} is present and non-empty`, () => {
      const data = JSON.parse(readFile("messages/en.json"));
      expect(data.Common, `Common.${key} missing`).toHaveProperty(key);
      expect(data.Common[key], `Common.${key} is empty`).toBeTruthy();
    });
  }

  it("Common.signOut is 'Sign out'", () => {
    const data = JSON.parse(readFile("messages/en.json"));
    expect(data.Common.signOut).toBe("Sign out");
  });
});

// ---------------------------------------------------------------------------
// 9. messages/pl.json — all namespaces + Polish diacritics requirement
// ---------------------------------------------------------------------------
describe("messages/pl.json — namespace structure, Polish translations, and diacritics", () => {
  const REQUIRED_NAMESPACES = [
    "Common", "CaseStatuses", "CaseTypes", "DocCategories",
    "Sidebar", "Auth", "LegalHub", "Contracts", "Documents", "Settings", "Admin",
  ];

  for (const ns of REQUIRED_NAMESPACES) {
    it(`has namespace: ${ns}`, () => {
      const data = JSON.parse(readFile("messages/pl.json"));
      expect(data, `Namespace '${ns}' missing from pl.json`).toHaveProperty(ns);
      expect(Object.keys(data[ns]).length, `Namespace '${ns}' is empty`).toBeGreaterThan(0);
    });
  }

  it("Common.signOut is 'Wyloguj się' (with Polish diacritics — plan success criterion)", () => {
    const data = JSON.parse(readFile("messages/pl.json"));
    // The plan explicitly specifies "Wyloguj się" as the switching label
    expect(data.Common.signOut).toBe("Wyloguj się");
  });

  it("at least one string in pl.json contains Polish diacritics (ą,ć,ę,ł,ń,ó,ś,ź,ż)", () => {
    const raw = readFile("messages/pl.json");
    const hasPolishChars = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(raw);
    expect(
      hasPolishChars,
      "pl.json contains no Polish diacritics — all translations are ASCII approximations. " +
      "The plan requires correct Polish text (e.g. 'Wyloguj się' not 'Wyloguj sie')."
    ).toBe(true);
  });

  it("Common.save is 'Zapisz' (with correct Polish)", () => {
    const data = JSON.parse(readFile("messages/pl.json"));
    // "Zapisz" has no diacritics, but verifying it's a real Polish word
    expect(data.Common.save).toBe("Zapisz");
  });
});
