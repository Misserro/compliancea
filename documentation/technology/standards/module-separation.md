# Module Separation Standard

> Established: 2026-03-17
> Applies to: Vaulta (ComplianceA) / Next.js 15 App Router, TypeScript, lib/ CJS backend
> Related: [rest-api.md](./rest-api.md), [authentication-authorization.md](./authentication-authorization.md), [database.md](./database.md), [error-handling.md](./error-handling.md), [design-system.md](./design-system.md)

## Principle

A compliance platform must enforce strict separation between its data layer, API layer, and presentation layer so that each can be audited, tested, and replaced independently. In Vaulta, unidirectional dependencies -- from UI to API to bridge to backend -- guarantee that no component can accidentally bypass validation, skip audit logging, or couple itself to implementation details of another layer. Every import path is a trust boundary: crossing one without going through the designated bridge is a violation.

## FORBIDDEN

| Forbidden | Use instead |
|---|---|
| Importing directly from `lib/*.js` (CJS backend) in API routes or components -- bypasses the TypeScript bridge, breaks type safety | Always import from `@/lib/*-imports.ts` bridge files (e.g., `@/lib/db-imports`, `@/lib/audit-imports`) |
| Duplicating constants that already exist in `@/lib/constants.ts` -- creates maintenance burden when values change | Import from `@/lib/constants.ts`: `import { DEPARTMENTS } from "@/lib/constants"` |
| Components importing from `@/app/api/*` -- creates circular dependency between UI and API layers | Components fetch data via `fetch()` calls to API routes; they never import route handlers directly |
| API routes importing from `@/components/*` -- server code must not depend on React components | Keep all shared logic in `@/lib/*`; move any shared type or utility out of components into `src/lib/` |
| Relative imports that escape `src/` (e.g., `../../lib/db.js`) in TypeScript files -- bypasses the path alias system | Use the `@/*` path alias for all imports within `src/`: `@/lib/db-imports`, `@/components/ui/button` |

## Architecture Layers

Vaulta follows a strict 4-layer architecture. Dependencies flow in one direction only: right to left in the diagram below.

```
UI Components  -->  API Routes  -->  Import Bridges  -->  CJS Backend
src/components/     src/app/api/     src/lib/*-imports.ts  lib/*.js
```

### Layer 1: CJS Backend (`lib/`)

- CommonJS compiled output (`.js` files)
- Contains database operations, file system access, external API clients
- Never imported directly from TypeScript code
- Entry point: `lib/db.js`, `lib/paths.js`

### Layer 2: Import Bridges (`src/lib/*-imports.ts`)

- TypeScript re-export files that wrap CJS backend functions
- Provide the only sanctioned entry points from TypeScript into the backend
- One bridge file per backend module

```typescript
// src/lib/db-imports.ts -- re-exports 60+ functions from lib/db.js
export {
  initDb,
  saveDb,
  getAllDocuments,
  getDocumentById,
  addDocument,
  // ... all exported functions
} from "../../lib/db.js";
```

Rules:

1. Every function used from `lib/db.js` must be listed in `src/lib/db-imports.ts`.
2. When adding a new backend function, add it to the bridge file in the same commit.
3. Bridge files contain only `export { ... } from` statements -- no logic, no transformations.

### Layer 3: API Routes (`src/app/api/`)

- Next.js App Router route handlers
- Import backend logic exclusively through bridge files
- Import types from `@/lib/types.ts` and constants from `@/lib/constants.ts`
- Never import from `@/components/`

```typescript
// Correct: API route imports
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getObligationById, updateObligation, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import type { Obligation } from "@/lib/types";
```

### Layer 4: UI Components (`src/components/`)

- React components with `"use client"` directive for interactive components
- Import UI primitives from `@/components/ui/*`
- Import types from `@/lib/types.ts` and constants from `@/lib/constants.ts`
- Import utilities from `@/lib/utils.ts`
- Never import from `@/app/api/` or `@/lib/*-imports.ts`

```typescript
// Correct: component imports
"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS, STATUS_COLORS } from "@/lib/constants";
import type { Obligation } from "@/lib/types";
```

## Shared Modules

Three files form the shared foundation imported across all layers (except CJS backend):

| File | Contents | Imported by |
|---|---|---|
| `src/lib/types.ts` | All domain interfaces (`Document`, `Obligation`, `Contract`, `TokenUsage`, etc.) | API routes, components, utilities |
| `src/lib/constants.ts` | All domain constants (`DEPARTMENTS`, `DOC_TYPES`, `JURISDICTIONS`, `STATUS_COLORS`, etc.) | API routes, components, utilities |
| `src/lib/utils.ts` | `cn()` className merger, `formatNumber()`, `formatCost()`, `escapeHtml()` | Components, occasionally API routes |

Rules:

1. Domain types go in `types.ts` -- never define interfaces inline in components or routes.
2. Domain constants go in `constants.ts` -- never redefine arrays like `DEPARTMENTS` locally.
3. `utils.ts` contains only pure, side-effect-free utility functions. Server-only utilities belong in `server-utils.ts`.

## Server Utilities (`src/lib/server-utils.ts`)

Server-side utilities that depend on Node.js APIs (fs, path, pdf-parse, mammoth) live in `server-utils.ts`. This file is imported only by API routes, never by components.

```typescript
// src/lib/server-utils.ts exports
export { ensureDb }           // Database initialization guard
export { getDocumentsDir }    // Resolved documents directory path
export { guessType }          // File extension to type mapping
export { extractTextFromBuffer } // PDF/DOCX text extraction
export { saveUploadedFile }   // File upload handler
export { writeTempFile }      // Temporary file creation
export { cleanupTempFile }    // Temporary file cleanup
```

Rules:

1. `ensureDb()` is the first call in every API route handler -- it guarantees database initialization.
2. `server-utils.ts` may import from `lib/*.js` directly (it is itself a bridge-layer file).
3. Never import `server-utils.ts` from a component -- it will fail at build time due to Node.js dependencies.

## Import Ordering

Within any file, imports follow this order, separated by blank lines between groups:

```typescript
// 1. External packages (next/server, react, third-party)
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// 2. Internal utilities and bridges (@/lib/*)
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

// 3. Types (always import type for type-only imports)
import type { Document, TokenUsage } from "@/lib/types";

// 4. Constants
import { DEPARTMENTS, DOC_TYPES } from "@/lib/constants";

// 5. Components (UI layer only)
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
```

Rules:

1. Use `import type` for type-only imports -- this ensures they are erased at compile time and do not create runtime dependencies.
2. Group and separate import blocks with a blank line between groups.
3. Within a group, order alphabetically by module path.

## Path Alias

All imports within `src/` use the `@/*` path alias configured in `tsconfig.json`. Never use relative paths that traverse out of the current directory tree.

```typescript
// Correct
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Wrong -- relative path escaping src/
import { cn } from "../../lib/utils";
```

The single exception is bridge files (`src/lib/*-imports.ts`), which must use relative paths to reach `lib/*.js` because the CJS backend is outside the `src/` directory:

```typescript
// Exception: bridge file reaching CJS backend
export { initDb, saveDb } from "../../lib/db.js";
```

## Dependency Validation Checklist

- [ ] No `import ... from "../../lib/*.js"` in any file except `src/lib/*-imports.ts` and `src/lib/server-utils.ts`
- [ ] No `import ... from "@/app/api/"` in any component file
- [ ] No `import ... from "@/components/"` in any API route file
- [ ] All domain types imported from `@/lib/types.ts` -- no inline interface definitions in routes or components
- [ ] All domain constants imported from `@/lib/constants.ts` -- no local redefinitions of shared arrays
- [ ] `import type` used for type-only imports
- [ ] All `@/*` paths resolve correctly (no relative imports within `src/` except in bridge files)
- [ ] New backend functions added to both `lib/db.js` (or equivalent) and the corresponding `*-imports.ts` bridge file

## Related

- [rest-api.md](./rest-api.md) -- API route structure, handler signatures, import conventions
- [authentication-authorization.md](./authentication-authorization.md) -- auth middleware placement in the layer stack
- [database.md](./database.md) -- `ensureDb()`, `saveDb()`, query layer that the bridge files expose
- [error-handling.md](./error-handling.md) -- error utilities shared across layers via `@/lib/server-utils`
- [design-system.md](./design-system.md) -- component import conventions, `cn()` usage
