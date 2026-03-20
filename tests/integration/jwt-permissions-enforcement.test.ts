/**
 * Integration tests for Task 2: JWT Integration and API Enforcement
 * Plan 031 — User Permission System
 *
 * Success criteria (PRIMARY source of truth: plan README.md task 2):
 * 1. member with permissions.documents='none' → GET /api/documents returns 403
 * 2. member with permissions.documents='view' → GET returns 200; DELETE returns 403
 * 3. member with permissions.documents='edit' → POST /api/documents/upload returns 200; DELETE returns 403
 * 4. member with permissions.documents='full' → all document operations succeed
 * 5. Owner/admin bypass: all operations succeed regardless of member_permissions
 * 6. isSuperAdmin bypass: all operations succeed
 * 7. session.user.permissions populated for member; null for owner/admin
 * 8. npm test: 0 regressions
 *
 * Strategy:
 * Next.js route handlers cannot be imported into Vitest (no next/server runtime).
 * Tests use two complementary layers:
 *   a) src/lib/permissions.ts — pure TS module, fully importable and testable
 *   b) Code inspection (readFileSync) — verify route files contain the permission
 *      check pattern with correct resource, level, and guard conditions
 *   c) src/auth.ts code inspection — verify JWT callback populates permissions correctly
 *
 * This approach matches the pattern established in admin-api-routes.test.ts and
 * permission-db-layer.test.ts in this test suite.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const ROOT = resolve(__dirname, "../..");

// ─────────────────────────────────────────────────────────────────────────────
// Section A: src/lib/permissions.ts — pure module, fully testable
// ─────────────────────────────────────────────────────────────────────────────

// We can import this directly because it's a pure TS module with no Next.js deps.
import {
  RESOURCES,
  PERMISSION_LEVELS,
  hasPermission,
  RESOURCE_LABELS,
  type Resource,
  type PermissionLevel,
} from "../../src/lib/permissions";

describe("src/lib/permissions.ts — RESOURCES constant", () => {
  it("exports RESOURCES array with exactly 5 items", () => {
    expect(RESOURCES).toHaveLength(5);
  });

  it("RESOURCES contains all 5 required resource names", () => {
    expect(RESOURCES).toContain("documents");
    expect(RESOURCES).toContain("contracts");
    expect(RESOURCES).toContain("legal_hub");
    expect(RESOURCES).toContain("policies");
    expect(RESOURCES).toContain("qa_cards");
  });
});

describe("src/lib/permissions.ts — PERMISSION_LEVELS mapping", () => {
  it("none maps to 0", () => {
    expect(PERMISSION_LEVELS.none).toBe(0);
  });

  it("view maps to 1", () => {
    expect(PERMISSION_LEVELS.view).toBe(1);
  });

  it("edit maps to 2", () => {
    expect(PERMISSION_LEVELS.edit).toBe(2);
  });

  it("full maps to 3", () => {
    expect(PERMISSION_LEVELS.full).toBe(3);
  });

  it("levels are strictly ordered: none < view < edit < full", () => {
    expect(PERMISSION_LEVELS.none).toBeLessThan(PERMISSION_LEVELS.view);
    expect(PERMISSION_LEVELS.view).toBeLessThan(PERMISSION_LEVELS.edit);
    expect(PERMISSION_LEVELS.edit).toBeLessThan(PERMISSION_LEVELS.full);
  });
});

describe("src/lib/permissions.ts — hasPermission(userLevel, required)", () => {
  // Null/undefined bypass (owner/admin)
  it("null userLevel returns true (owner/admin full access bypass)", () => {
    expect(hasPermission(null, "view")).toBe(true);
    expect(hasPermission(null, "edit")).toBe(true);
    expect(hasPermission(null, "full")).toBe(true);
  });

  it("undefined userLevel returns true (full access bypass)", () => {
    expect(hasPermission(undefined, "view")).toBe(true);
    expect(hasPermission(undefined, "edit")).toBe(true);
    expect(hasPermission(undefined, "full")).toBe(true);
  });

  // none level
  it("none fails all required levels", () => {
    expect(hasPermission("none", "view")).toBe(false);
    expect(hasPermission("none", "edit")).toBe(false);
    expect(hasPermission("none", "full")).toBe(false);
  });

  it("none passes required=none", () => {
    expect(hasPermission("none", "none")).toBe(true);
  });

  // view level
  it("view passes required=view", () => {
    expect(hasPermission("view", "view")).toBe(true);
  });

  it("view fails required=edit", () => {
    expect(hasPermission("view", "edit")).toBe(false);
  });

  it("view fails required=full", () => {
    expect(hasPermission("view", "full")).toBe(false);
  });

  // edit level
  it("edit passes required=view", () => {
    expect(hasPermission("edit", "view")).toBe(true);
  });

  it("edit passes required=edit", () => {
    expect(hasPermission("edit", "edit")).toBe(true);
  });

  it("edit fails required=full", () => {
    expect(hasPermission("edit", "full")).toBe(false);
  });

  // full level
  it("full passes all required levels", () => {
    expect(hasPermission("full", "none")).toBe(true);
    expect(hasPermission("full", "view")).toBe(true);
    expect(hasPermission("full", "edit")).toBe(true);
    expect(hasPermission("full", "full")).toBe(true);
  });
});

describe("src/lib/permissions.ts — RESOURCE_LABELS", () => {
  it("exports RESOURCE_LABELS with a label for all 5 resources", () => {
    for (const resource of RESOURCES) {
      expect(RESOURCE_LABELS[resource]).toBeTruthy();
      expect(typeof RESOURCE_LABELS[resource]).toBe("string");
    }
  });

  it("documents label is 'Documents'", () => {
    expect(RESOURCE_LABELS.documents).toBe("Documents");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section B: src/auth.ts — JWT callback populates permissions correctly
// Criterion 7: session.user.permissions populated for member; null for owner/admin
// ─────────────────────────────────────────────────────────────────────────────

describe("src/auth.ts — permissions field in type augmentation", () => {
  const authPath = resolve(ROOT, "src/auth.ts");

  it("auth.ts file exists", () => {
    expect(existsSync(authPath)).toBe(true);
  });

  it("Session.user has permissions field with correct type signature", () => {
    const content = readFileSync(authPath, "utf-8");
    expect(content).toContain("permissions?:");
    expect(content).toMatch(/permissions\?.*Record.*string.*'none'.*'view'.*'edit'.*'full'.*\|.*null/);
  });

  it("JWT interface has permissions field", () => {
    const content = readFileSync(authPath, "utf-8");
    // Should appear in both Session.user and JWT augmentation blocks
    const permMatches = (content.match(/permissions\?:/g) || []).length;
    expect(permMatches).toBeGreaterThanOrEqual(2);
  });
});

describe("src/auth.ts — JWT callback loads permissions for member role", () => {
  const authPath = resolve(ROOT, "src/auth.ts");

  it("imports getMemberPermissions from db-imports", () => {
    const content = readFileSync(authPath, "utf-8");
    expect(content).toContain("getMemberPermissions");
    expect(content).toMatch(/from.*@\/lib\/db-imports/);
  });

  it("sets token.permissions to null for non-member roles (owner/admin bypass)", () => {
    const content = readFileSync(authPath, "utf-8");
    expect(content).toContain("token.permissions = null");
  });

  it("sets token.permissions from getMemberPermissions for member role", () => {
    const content = readFileSync(authPath, "utf-8");
    // Should call getMemberPermissions and transform to Record
    expect(content).toContain("getMemberPermissions");
    expect(content).toMatch(/token\.permissions\s*=\s*Object\.fromEntries/);
  });

  it("checks membership.role === 'member' before loading permissions", () => {
    const content = readFileSync(authPath, "utf-8");
    expect(content).toMatch(/role\s*===\s*'member'/);
  });

  it("session callback copies permissions to session.user.permissions", () => {
    const content = readFileSync(authPath, "utf-8");
    expect(content).toMatch(/session\.user\.permissions\s*=\s*token\.permissions/);
  });

  it("loads permissions in both first-sign-in AND subsequent-requests branches", () => {
    const content = readFileSync(authPath, "utf-8");
    // getMemberPermissions should appear twice (once in each branch)
    const callCount = (content.match(/getMemberPermissions/g) || []).length;
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section C: Permission guard pattern in API route files
// Criteria 1-6: correct enforcement across all document routes
//
// The guard pattern (per plan task 2 description):
//   if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
//     const perm = (session.user.permissions as Record<string, string> | null)?.['{RESOURCE}'] ?? 'full';
//     if (!hasPermission(perm as any, '{REQUIRED_LEVEL}')) {
//       return NextResponse.json({ error: "Forbidden" }, { status: 403 });
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────

// Helper: read a route file and verify it contains the permission enforcement pattern
function readRoute(relPath: string): string {
  const fullPath = resolve(ROOT, relPath);
  expect(existsSync(fullPath), `Route file missing: ${relPath}`).toBe(true);
  return readFileSync(fullPath, "utf-8");
}

function hasGuard(content: string): boolean {
  return (
    content.includes("isSuperAdmin") &&
    content.includes("orgRole") &&
    content.includes("'member'") &&
    content.includes("hasPermission") &&
    content.includes("status: 403")
  );
}

function hasResourceCheck(content: string, resource: string): boolean {
  return content.includes(`'${resource}'`) || content.includes(`"${resource}"`);
}

function hasLevelCheck(content: string, level: string): boolean {
  return content.includes(`'${level}'`) || content.includes(`"${level}"`);
}

// ── Criterion 1+2+3+4: GET /api/documents → view; DELETE → full ──────────────

describe("documents/route.ts (GET) — requires documents:view for member", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/api/documents/route.ts"))).toBe(true);
  });

  it("contains isSuperAdmin + orgRole member guard (Criteria 1-6)", () => {
    const content = readRoute("src/app/api/documents/route.ts");
    expect(hasGuard(content), "Missing permission guard block").toBe(true);
  });

  it("checks 'documents' resource", () => {
    const content = readRoute("src/app/api/documents/route.ts");
    expect(hasResourceCheck(content, "documents")).toBe(true);
  });

  it("requires 'view' level for GET", () => {
    const content = readRoute("src/app/api/documents/route.ts");
    expect(hasLevelCheck(content, "view")).toBe(true);
  });

  it("imports hasPermission from @/lib/permissions", () => {
    const content = readRoute("src/app/api/documents/route.ts");
    expect(content).toContain("hasPermission");
    expect(content).toMatch(/from.*@\/lib\/permissions|from.*permissions/);
  });
});

describe("documents/[id]/route.ts (GET/DELETE) — view for GET, full for DELETE", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/api/documents/[id]/route.ts"))).toBe(true);
  });

  it("contains permission guard (Criteria 2+4)", () => {
    const content = readRoute("src/app/api/documents/[id]/route.ts");
    expect(hasGuard(content), "Missing permission guard block").toBe(true);
  });

  it("checks 'documents' resource", () => {
    const content = readRoute("src/app/api/documents/[id]/route.ts");
    expect(hasResourceCheck(content, "documents")).toBe(true);
  });

  it("requires 'view' level for GET", () => {
    const content = readRoute("src/app/api/documents/[id]/route.ts");
    expect(hasLevelCheck(content, "view")).toBe(true);
  });

  it("requires 'full' level for DELETE", () => {
    const content = readRoute("src/app/api/documents/[id]/route.ts");
    expect(hasLevelCheck(content, "full")).toBe(true);
  });
});

describe("documents/upload/route.ts (POST) — requires documents:edit for member", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/api/documents/upload/route.ts"))).toBe(true);
  });

  it("contains permission guard (Criterion 3)", () => {
    const content = readRoute("src/app/api/documents/upload/route.ts");
    expect(hasGuard(content), "Missing permission guard block").toBe(true);
  });

  it("checks 'documents' resource", () => {
    const content = readRoute("src/app/api/documents/upload/route.ts");
    expect(hasResourceCheck(content, "documents")).toBe(true);
  });

  it("requires 'edit' level for POST", () => {
    const content = readRoute("src/app/api/documents/upload/route.ts");
    expect(hasLevelCheck(content, "edit")).toBe(true);
  });
});

// ── Spot checks for other resource groups ────────────────────────────────────

describe("contracts/route.ts (GET) — requires contracts:view for member", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/api/contracts/route.ts"))).toBe(true);
  });

  it("contains permission guard", () => {
    const content = readRoute("src/app/api/contracts/route.ts");
    expect(hasGuard(content), "Missing permission guard in contracts/route.ts").toBe(true);
  });

  it("checks 'contracts' resource", () => {
    const content = readRoute("src/app/api/contracts/route.ts");
    expect(hasResourceCheck(content, "contracts")).toBe(true);
  });

  it("requires 'view' level for GET", () => {
    const content = readRoute("src/app/api/contracts/route.ts");
    expect(hasLevelCheck(content, "view")).toBe(true);
  });
});

describe("contracts/[id]/route.ts — view for GET, edit for PATCH, full for DELETE", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/api/contracts/[id]/route.ts"))).toBe(true);
  });

  it("contains permission guard", () => {
    const content = readRoute("src/app/api/contracts/[id]/route.ts");
    expect(hasGuard(content)).toBe(true);
  });

  it("checks 'contracts' resource", () => {
    const content = readRoute("src/app/api/contracts/[id]/route.ts");
    expect(hasResourceCheck(content, "contracts")).toBe(true);
  });
});

describe("legal-hub/cases/route.ts — view for GET, edit for POST", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/api/legal-hub/cases/route.ts"))).toBe(true);
  });

  it("contains permission guard", () => {
    const content = readRoute("src/app/api/legal-hub/cases/route.ts");
    expect(hasGuard(content), "Missing permission guard in legal-hub/cases/route.ts").toBe(true);
  });

  it("checks 'legal_hub' resource", () => {
    const content = readRoute("src/app/api/legal-hub/cases/route.ts");
    expect(hasResourceCheck(content, "legal_hub")).toBe(true);
  });
});

describe("policies/route.ts — view for GET, edit for POST", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/api/policies/route.ts"))).toBe(true);
  });

  it("contains permission guard", () => {
    const content = readRoute("src/app/api/policies/route.ts");
    expect(hasGuard(content), "Missing permission guard in policies/route.ts").toBe(true);
  });

  it("checks 'policies' resource", () => {
    const content = readRoute("src/app/api/policies/route.ts");
    expect(hasResourceCheck(content, "policies")).toBe(true);
  });
});

describe("qa-cards/route.ts — view for GET, edit for POST", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/api/qa-cards/route.ts"))).toBe(true);
  });

  it("contains permission guard", () => {
    const content = readRoute("src/app/api/qa-cards/route.ts");
    expect(hasGuard(content), "Missing permission guard in qa-cards/route.ts").toBe(true);
  });

  it("checks 'qa_cards' resource", () => {
    const content = readRoute("src/app/api/qa-cards/route.ts");
    expect(hasResourceCheck(content, "qa_cards")).toBe(true);
  });
});

// ── Criterion 5: Owner/admin bypass — guard checks orgRole === 'member' ────────

describe("Guard pattern — Criterion 5: owner/admin bypass via orgRole check", () => {
  const keyRoutes = [
    "src/app/api/documents/route.ts",
    "src/app/api/documents/upload/route.ts",
    "src/app/api/documents/[id]/route.ts",
    "src/app/api/contracts/route.ts",
    "src/app/api/legal-hub/cases/route.ts",
    "src/app/api/policies/route.ts",
    "src/app/api/qa-cards/route.ts",
  ];

  for (const routeRelPath of keyRoutes) {
    it(`${routeRelPath} only enforces permissions when orgRole === 'member'`, () => {
      const content = readRoute(routeRelPath);
      // Must check orgRole === 'member' (so non-members bypass)
      expect(content).toMatch(/orgRole\s*===\s*'member'/);
    });
  }
});

// ── Criterion 6: isSuperAdmin bypass ─────────────────────────────────────────

describe("Guard pattern — Criterion 6: isSuperAdmin bypass", () => {
  const keyRoutes = [
    "src/app/api/documents/route.ts",
    "src/app/api/documents/upload/route.ts",
    "src/app/api/documents/[id]/route.ts",
    "src/app/api/contracts/route.ts",
    "src/app/api/legal-hub/cases/route.ts",
  ];

  for (const routeRelPath of keyRoutes) {
    it(`${routeRelPath} has isSuperAdmin guard bypass`, () => {
      const content = readRoute(routeRelPath);
      expect(content).toContain("isSuperAdmin");
    });
  }
});

// ── Criterion 7: session.user.permissions — verified via auth.ts inspection ─
// (covered in Section B above)

// ── 403 response shape ────────────────────────────────────────────────────────

describe("403 Forbidden response — correct error body", () => {
  it("documents/route.ts returns { error: 'Forbidden' } with status 403", () => {
    const content = readRoute("src/app/api/documents/route.ts");
    expect(content).toContain("status: 403");
    expect(content).toMatch(/error.*Forbidden|Forbidden.*error/);
  });

  it("documents/upload/route.ts returns { error: 'Forbidden' } with status 403", () => {
    const content = readRoute("src/app/api/documents/upload/route.ts");
    expect(content).toContain("status: 403");
    expect(content).toMatch(/error.*Forbidden|Forbidden.*error/);
  });

  it("contracts/route.ts returns { error: 'Forbidden' } with status 403", () => {
    const content = readRoute("src/app/api/contracts/route.ts");
    expect(content).toContain("status: 403");
    expect(content).toMatch(/error.*Forbidden|Forbidden.*error/);
  });
});

// ── Fallback to 'full' when permissions field is missing (backward compat) ──

describe("Guard pattern — backward compat: fallback to 'full' when permissions undefined", () => {
  const keyRoutes = [
    "src/app/api/documents/route.ts",
    "src/app/api/documents/[id]/route.ts",
    "src/app/api/contracts/route.ts",
  ];

  for (const routeRelPath of keyRoutes) {
    it(`${routeRelPath} uses ?? 'full' fallback when permissions entry is missing`, () => {
      const content = readRoute(routeRelPath);
      // The pattern is: ?.['{resource}'] ?? 'full'
      expect(content).toMatch(/\?\.\[.*\]\s*\?\?\s*'full'|\?\?\s*'full'/);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Section D: Completeness check — all 5 resources have at least one guarded route
// ─────────────────────────────────────────────────────────────────────────────

describe("Completeness — all 5 resources have guarded routes", () => {
  const resourceToRoutes: Record<string, string[]> = {
    documents: [
      "src/app/api/documents/route.ts",
      "src/app/api/documents/upload/route.ts",
      "src/app/api/documents/[id]/route.ts",
    ],
    contracts: [
      "src/app/api/contracts/route.ts",
      "src/app/api/contracts/[id]/route.ts",
    ],
    legal_hub: [
      "src/app/api/legal-hub/cases/route.ts",
      "src/app/api/legal-hub/cases/[id]/route.ts",
    ],
    policies: [
      "src/app/api/policies/route.ts",
      "src/app/api/policies/[id]/route.ts",
    ],
    qa_cards: [
      "src/app/api/qa-cards/route.ts",
      "src/app/api/qa-cards/[id]/route.ts",
    ],
  };

  for (const [resource, routes] of Object.entries(resourceToRoutes)) {
    describe(`Resource: ${resource}`, () => {
      for (const routeRelPath of routes) {
        it(`${routeRelPath} is guarded and checks '${resource}'`, () => {
          const content = readRoute(routeRelPath);
          expect(hasGuard(content), `No permission guard in ${routeRelPath}`).toBe(true);
          expect(hasResourceCheck(content, resource), `No '${resource}' resource check in ${routeRelPath}`).toBe(true);
        });
      }
    });
  }
});
