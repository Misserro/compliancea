/**
 * Unit tests for Task 2: App constants + sidebar navigation strings
 * Plan 039 — i18n: English / Polish Language Control
 *
 * Tests are written against the plan's success criteria (primary source of truth):
 *
 * 1. LEGAL_CASE_STATUS_DISPLAY and LEGAL_CASE_TYPE_LABELS are REMOVED from constants.ts
 * 2. LEGAL_CASE_STATUSES, LEGAL_CASE_TYPES, LEGAL_CASE_STATUS_COLORS still exist in constants.ts
 * 3. CaseStatuses namespace fully populated in both message files (all 11 statuses from LEGAL_CASE_STATUSES)
 * 4. CaseTypes namespace fully populated in both message files (all 6 types from LEGAL_CASE_TYPES)
 * 5. DocCategories namespace fully populated (all 9 categories from CASE_DOCUMENT_CATEGORIES)
 * 6. Sidebar namespace fully populated with all nav labels (all items from app-sidebar.tsx)
 * 7. app-sidebar.tsx uses useTranslations('Sidebar') — no hardcoded nav labels
 * 8. Components previously using LEGAL_CASE_STATUS_DISPLAY now use useTranslations('CaseStatuses')
 * 9. Components previously using LEGAL_CASE_TYPE_LABELS now use useTranslations('CaseTypes')
 * 10. CASE_DOCUMENT_CATEGORIES labels replaced with translation keys or hook approach
 * 11. TypeScript compiles clean (no references to removed constant maps)
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
// 1. constants.ts — removed display-string maps
// ---------------------------------------------------------------------------
describe("src/lib/constants.ts — removed display-string maps", () => {
  it("does NOT export LEGAL_CASE_STATUS_DISPLAY (plan says to remove it)", () => {
    const src = readFile("src/lib/constants.ts");
    expect(
      src,
      "LEGAL_CASE_STATUS_DISPLAY still exists in constants.ts — it should be removed per Task 2"
    ).not.toMatch(/LEGAL_CASE_STATUS_DISPLAY/);
  });

  it("does NOT export LEGAL_CASE_TYPE_LABELS (plan says to remove it)", () => {
    const src = readFile("src/lib/constants.ts");
    expect(
      src,
      "LEGAL_CASE_TYPE_LABELS still exists in constants.ts — it should be removed per Task 2"
    ).not.toMatch(/LEGAL_CASE_TYPE_LABELS/);
  });

  it("still exports LEGAL_CASE_STATUSES (raw value array — must be preserved)", () => {
    const src = readFile("src/lib/constants.ts");
    expect(
      src,
      "LEGAL_CASE_STATUSES was accidentally removed — it is a raw value array and must be kept"
    ).toMatch(/export const LEGAL_CASE_STATUSES/);
  });

  it("still exports LEGAL_CASE_TYPES (raw value array — must be preserved)", () => {
    const src = readFile("src/lib/constants.ts");
    expect(
      src,
      "LEGAL_CASE_TYPES was accidentally removed — it is a raw value array and must be kept"
    ).toMatch(/export const LEGAL_CASE_TYPES/);
  });

  it("still exports LEGAL_CASE_STATUS_COLORS (colour map — must be preserved)", () => {
    const src = readFile("src/lib/constants.ts");
    expect(
      src,
      "LEGAL_CASE_STATUS_COLORS was accidentally removed — it is a colour map and must be kept"
    ).toMatch(/export const LEGAL_CASE_STATUS_COLORS/);
  });
});

// ---------------------------------------------------------------------------
// 2. messages/en.json — CaseStatuses: all 11 status keys
// ---------------------------------------------------------------------------
describe("messages/en.json — CaseStatuses namespace completeness", () => {
  // All keys from LEGAL_CASE_STATUSES in constants.ts
  const CASE_STATUS_KEYS = [
    "new", "intake", "analysis", "draft_prepared", "filed",
    "awaiting_response", "hearing_scheduled", "judgment_received",
    "appeal", "active", "closed",
  ];

  for (const key of CASE_STATUS_KEYS) {
    it(`CaseStatuses.${key} exists in en.json`, () => {
      const data = JSON.parse(readFile("messages/en.json"));
      expect(
        data.CaseStatuses,
        `CaseStatuses.${key} missing from en.json — all 11 statuses from LEGAL_CASE_STATUSES must be present`
      ).toHaveProperty(key);
      expect(data.CaseStatuses[key], `CaseStatuses.${key} is empty in en.json`).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// 3. messages/pl.json — CaseStatuses: all 11 status keys with Polish
// ---------------------------------------------------------------------------
describe("messages/pl.json — CaseStatuses namespace completeness", () => {
  const CASE_STATUS_KEYS = [
    "new", "intake", "analysis", "draft_prepared", "filed",
    "awaiting_response", "hearing_scheduled", "judgment_received",
    "appeal", "active", "closed",
  ];

  for (const key of CASE_STATUS_KEYS) {
    it(`CaseStatuses.${key} exists in pl.json`, () => {
      const data = JSON.parse(readFile("messages/pl.json"));
      expect(
        data.CaseStatuses,
        `CaseStatuses.${key} missing from pl.json — all 11 statuses must have Polish translations`
      ).toHaveProperty(key);
      expect(data.CaseStatuses[key], `CaseStatuses.${key} is empty in pl.json`).toBeTruthy();
    });
  }

  it("CaseStatuses.new is 'Nowa' in pl.json (plan example)", () => {
    const data = JSON.parse(readFile("messages/pl.json"));
    expect(data.CaseStatuses.new).toBe("Nowa");
  });

  it("CaseStatuses.closed is 'Zamknięta' in pl.json (plan example)", () => {
    const data = JSON.parse(readFile("messages/pl.json"));
    expect(data.CaseStatuses.closed).toBe("Zamknięta");
  });
});

// ---------------------------------------------------------------------------
// 4. messages/en.json — CaseTypes: all 6 types
// ---------------------------------------------------------------------------
describe("messages/en.json — CaseTypes namespace completeness", () => {
  // All keys from LEGAL_CASE_TYPES in constants.ts
  const CASE_TYPE_KEYS = [
    "civil", "criminal", "administrative", "labor", "family", "commercial",
  ];

  for (const key of CASE_TYPE_KEYS) {
    it(`CaseTypes.${key} exists in en.json`, () => {
      const data = JSON.parse(readFile("messages/en.json"));
      expect(
        data.CaseTypes,
        `CaseTypes.${key} missing from en.json — all 6 types from LEGAL_CASE_TYPES must be present`
      ).toHaveProperty(key);
      expect(data.CaseTypes[key], `CaseTypes.${key} is empty in en.json`).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// 5. messages/pl.json — CaseTypes: all 6 types with Polish
// ---------------------------------------------------------------------------
describe("messages/pl.json — CaseTypes namespace completeness", () => {
  const CASE_TYPE_KEYS = [
    "civil", "criminal", "administrative", "labor", "family", "commercial",
  ];

  for (const key of CASE_TYPE_KEYS) {
    it(`CaseTypes.${key} exists in pl.json`, () => {
      const data = JSON.parse(readFile("messages/pl.json"));
      expect(
        data.CaseTypes,
        `CaseTypes.${key} missing from pl.json — all 6 types must have Polish translations`
      ).toHaveProperty(key);
      expect(data.CaseTypes[key], `CaseTypes.${key} is empty in pl.json`).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// 6. messages/en.json — DocCategories: all 9 categories from CASE_DOCUMENT_CATEGORIES
// ---------------------------------------------------------------------------
describe("messages/en.json — DocCategories namespace completeness", () => {
  // All keys from CASE_DOCUMENT_CATEGORIES value array in constants.ts
  const DOC_CATEGORY_KEYS = [
    "pleadings", "evidence", "correspondence", "court_decisions",
    "powers_of_attorney", "contracts_annexes", "invoices_costs",
    "internal_notes", "other",
  ];

  for (const key of DOC_CATEGORY_KEYS) {
    it(`DocCategories.${key} exists in en.json`, () => {
      const data = JSON.parse(readFile("messages/en.json"));
      expect(
        data.DocCategories,
        `DocCategories.${key} missing from en.json — all 9 categories from CASE_DOCUMENT_CATEGORIES must be present`
      ).toHaveProperty(key);
      expect(data.DocCategories[key], `DocCategories.${key} is empty in en.json`).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// 7. messages/pl.json — DocCategories: all 9 categories with Polish
// ---------------------------------------------------------------------------
describe("messages/pl.json — DocCategories namespace completeness", () => {
  const DOC_CATEGORY_KEYS = [
    "pleadings", "evidence", "correspondence", "court_decisions",
    "powers_of_attorney", "contracts_annexes", "invoices_costs",
    "internal_notes", "other",
  ];

  for (const key of DOC_CATEGORY_KEYS) {
    it(`DocCategories.${key} exists in pl.json`, () => {
      const data = JSON.parse(readFile("messages/pl.json"));
      expect(
        data.DocCategories,
        `DocCategories.${key} missing from pl.json — all 9 categories must have Polish translations`
      ).toHaveProperty(key);
      expect(data.DocCategories[key], `DocCategories.${key} is empty in pl.json`).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// 8. messages/en.json — Sidebar: all nav labels from app-sidebar.tsx
// ---------------------------------------------------------------------------
describe("messages/en.json — Sidebar namespace completeness", () => {
  // All nav items visible in app-sidebar.tsx that need t() substitution
  // Key names as they exist in the actual Sidebar namespace (admin vs adminPanel)
  const SIDEBAR_KEYS = [
    "dashboard",
    "contracts", "obligations",
    "cases", "templates", "myLawFirm",
    "documents", "policies", "analyzeProcess", "askLibrary",
    "settings", "organization", "members", "admin",
  ];

  for (const key of SIDEBAR_KEYS) {
    it(`Sidebar.${key} exists in en.json`, () => {
      const data = JSON.parse(readFile("messages/en.json"));
      expect(
        data.Sidebar,
        `Sidebar.${key} missing from en.json — all nav labels from app-sidebar.tsx must have translation keys`
      ).toHaveProperty(key);
      expect(data.Sidebar[key], `Sidebar.${key} is empty in en.json`).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// 9. messages/pl.json — Sidebar: all nav labels in Polish
// ---------------------------------------------------------------------------
describe("messages/pl.json — Sidebar namespace completeness", () => {
  const SIDEBAR_KEYS = [
    "dashboard",
    "contracts", "obligations",
    "cases", "templates", "myLawFirm",
    "documents", "policies", "analyzeProcess", "askLibrary",
    "settings", "organization", "members", "admin",
  ];

  for (const key of SIDEBAR_KEYS) {
    it(`Sidebar.${key} exists in pl.json`, () => {
      const data = JSON.parse(readFile("messages/pl.json"));
      expect(
        data.Sidebar,
        `Sidebar.${key} missing from pl.json — all sidebar nav labels must have Polish translations`
      ).toHaveProperty(key);
      expect(data.Sidebar[key], `Sidebar.${key} is empty in pl.json`).toBeTruthy();
    });
  }

  it("Sidebar.cases is 'Sprawy' in pl.json (was hardcoded in sidebar)", () => {
    const data = JSON.parse(readFile("messages/pl.json"));
    expect(data.Sidebar.cases).toBe("Sprawy");
  });

  it("Sidebar.templates is 'Szablony' in pl.json (was hardcoded in sidebar)", () => {
    const data = JSON.parse(readFile("messages/pl.json"));
    expect(data.Sidebar.templates).toBe("Szablony");
  });

  it("Sidebar.myLawFirm is 'Moja kancelaria' in pl.json (was hardcoded in sidebar)", () => {
    const data = JSON.parse(readFile("messages/pl.json"));
    expect(data.Sidebar.myLawFirm).toBe("Moja kancelaria");
  });
});

// ---------------------------------------------------------------------------
// 10. app-sidebar.tsx — uses useTranslations('Sidebar') for nav labels
// ---------------------------------------------------------------------------
describe("src/components/layout/app-sidebar.tsx — translated sidebar navigation", () => {
  it("imports useTranslations for Sidebar namespace", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    expect(
      src,
      "app-sidebar.tsx must import useTranslations from next-intl for sidebar nav labels"
    ).toMatch(/useTranslations/);
    // Must have a tSidebar or t for 'Sidebar' namespace
    expect(
      src,
      "app-sidebar.tsx must call useTranslations('Sidebar') to translate nav labels"
    ).toMatch(/useTranslations\(['"](Sidebar)['"]\)/);
  });

  it("does NOT have hardcoded 'Sprawy' (must use t('cases') instead)", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    // The string 'Sprawy' should not appear as a hardcoded literal in JSX spans
    expect(
      src,
      "Found hardcoded 'Sprawy' in app-sidebar.tsx — this must use t('cases') from Sidebar namespace"
    ).not.toMatch(/>Sprawy</);
  });

  it("does NOT have hardcoded 'Szablony' (must use t('templates') instead)", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    expect(
      src,
      "Found hardcoded 'Szablony' in app-sidebar.tsx — this must use t('templates') from Sidebar namespace"
    ).not.toMatch(/>Szablony</);
  });

  it("does NOT have hardcoded 'Moja kancelaria' (must use t('myLawFirm') instead)", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    expect(
      src,
      "Found hardcoded 'Moja kancelaria' in app-sidebar.tsx — this must use a Sidebar translation key"
    ).not.toMatch(/>Moja kancelaria</);
  });

  it("does NOT have hardcoded 'Dashboard' as a plain span text (must use t('dashboard'))", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    expect(
      src,
      "Found hardcoded 'Dashboard' span text in app-sidebar.tsx — must use t('dashboard') from Sidebar namespace"
    ).not.toMatch(/<span>Dashboard<\/span>/);
  });

  it("does NOT have hardcoded 'Contracts' as a plain span text (must use t())", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    expect(
      src,
      "Found hardcoded 'Contracts' span text in app-sidebar.tsx — must use t('contracts') from Sidebar namespace"
    ).not.toMatch(/<span>Contracts<\/span>/);
  });

  it("does NOT have hardcoded 'Obligations' as a plain span text (must use t())", () => {
    const src = readFile("src/components/layout/app-sidebar.tsx");
    expect(
      src,
      "Found hardcoded 'Obligations' span text in app-sidebar.tsx — must use t('obligations') from Sidebar namespace"
    ).not.toMatch(/<span>Obligations<\/span>/);
  });
});

// ---------------------------------------------------------------------------
// 11. Components — no longer import LEGAL_CASE_STATUS_DISPLAY
// ---------------------------------------------------------------------------
describe("Components — LEGAL_CASE_STATUS_DISPLAY removed from all imports", () => {
  // Verified from grep output that these are the files still referencing LEGAL_CASE_STATUS_DISPLAY
  const FILES_THAT_USED_STATUS_DISPLAY = [
    "src/components/legal-hub/firm-stats-panel.tsx",
  ];

  for (const filePath of FILES_THAT_USED_STATUS_DISPLAY) {
    if (existsSync(resolve(ROOT, filePath))) {
      it(`${filePath} does not import LEGAL_CASE_STATUS_DISPLAY`, () => {
        const src = readFile(filePath);
        expect(
          src,
          `${filePath} still imports LEGAL_CASE_STATUS_DISPLAY — must switch to useTranslations('CaseStatuses')`
        ).not.toMatch(/LEGAL_CASE_STATUS_DISPLAY/);
      });

      it(`${filePath} uses useTranslations for CaseStatuses`, () => {
        const src = readFile(filePath);
        expect(
          src,
          `${filePath} must use useTranslations('CaseStatuses') or getTranslations('CaseStatuses') instead of LEGAL_CASE_STATUS_DISPLAY`
        ).toMatch(/useTranslations\(['"]CaseStatuses['"]\)|getTranslations\(['"]CaseStatuses['"]\)/);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 12. Components — no longer import LEGAL_CASE_TYPE_LABELS
// ---------------------------------------------------------------------------
describe("Components — LEGAL_CASE_TYPE_LABELS removed from all imports", () => {
  // Verified from grep output that these are the files still referencing LEGAL_CASE_TYPE_LABELS
  const FILES_THAT_USED_TYPE_LABELS = [
    "src/components/legal-hub/case-metadata-form.tsx",
    "src/components/legal-hub/new-case-dialog.tsx",
  ];

  for (const filePath of FILES_THAT_USED_TYPE_LABELS) {
    if (existsSync(resolve(ROOT, filePath))) {
      it(`${filePath} does not import LEGAL_CASE_TYPE_LABELS`, () => {
        const src = readFile(filePath);
        expect(
          src,
          `${filePath} still imports LEGAL_CASE_TYPE_LABELS — must switch to useTranslations('CaseTypes')`
        ).not.toMatch(/LEGAL_CASE_TYPE_LABELS/);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 13. Document category components — CASE_DOCUMENT_CATEGORIES labels translated
// ---------------------------------------------------------------------------
describe("Components — CASE_DOCUMENT_CATEGORIES labels use translations", () => {
  it("case-documents-tab.tsx uses DocCategories translations (not raw hardcoded labels)", () => {
    const src = readFile("src/components/legal-hub/case-documents-tab.tsx");
    expect(
      src,
      "case-documents-tab.tsx must use useTranslations('DocCategories') for document category filter chips"
    ).toMatch(/useTranslations\(['"]DocCategories['"]\)|getTranslations\(['"]DocCategories['"]\)/);
  });
});
