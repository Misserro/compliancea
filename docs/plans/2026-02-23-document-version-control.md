# Document Version Control & Audit Trail Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add version control, diff viewing, and a Policies tab for policy/procedure documents.

**Architecture:** Extend `lib/db.js` with two new tables (`pending_replacements`, `document_diffs`), plug a version-detection step into the existing process route, and add a `/policies` page with version history + diff UI. No external npm packages needed.

**Tech Stack:** Next.js 15 (App Router), sql.js (SQLite in-memory), TypeScript, Tailwind CSS, shadcn/ui (Radix primitives), lucide-react icons.

---

## Key Patterns to Follow

- **DB functions** live in `lib/db.js`, exported via `src/lib/db-imports.ts`
- **API routes** use `export const runtime = "nodejs"`, `ensureDb()` first, `NextResponse.json()`
- **Route params** are `Promise<{ id: string }>` — always `await params`
- **`run(sql, params)`** — write ops; auto-calls `saveDb()`; returns `{ changes, lastInsertRowId }`
- **`query(sql, params)`** — returns array of objects; **`get(sql, params)`** — returns first or null
- **`in_force`** is stored as TEXT: `'true'`, `'false'`, `'unknown'` (not boolean)
- **Settings** live in `lib/settings.js` (in-memory, server-side)
- **`logAction(entityType, entityId, action, details)`** — imported from `@/lib/audit-imports`

---

## Task 1: Add DB Tables

**Files:**
- Modify: `lib/db.js` (inside `initDb()`, after the `document_lineage` table block, ~line 109)

**Step 1: Add `pending_replacements` table creation inside `initDb()`**

Find the block that creates `document_lineage` (ends around line 108). Add directly after its closing `)`):

```js
  // Version control: pending replacement candidates
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_replacements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      new_document_id INTEGER NOT NULL,
      candidate_id INTEGER NOT NULL,
      confidence REAL NOT NULL,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (new_document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (candidate_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pending_replacements_new ON pending_replacements(new_document_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pending_replacements_status ON pending_replacements(status)`);

  // Version control: precomputed line diffs
  db.run(`
    CREATE TABLE IF NOT EXISTS document_diffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_document_id INTEGER NOT NULL,
      new_document_id INTEGER NOT NULL,
      diff_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (old_document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (new_document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_document_diffs_new ON document_diffs(new_document_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_document_diffs_old ON document_diffs(old_document_id)`);
```

**Step 2: Verify — start the dev server and check it doesn't throw**

```bash
npm run dev
```

Expected: Server starts, no DB init errors in terminal.

**Step 3: Commit**

```bash
git add lib/db.js
git commit -m "feat: add pending_replacements and document_diffs tables to DB"
```

---

## Task 2: Add Diff Utility

**Files:**
- Create: `lib/diff.js`

**Step 1: Create the file**

```js
/**
 * Line-level diff between two texts.
 * Returns an array of hunks: { type: 'added'|'removed'|'unchanged', lines: string[] }
 * Unchanged hunks with many lines are included so the UI can collapse them.
 * Guard: if either side exceeds 3000 lines, returns a single 'changed' hunk.
 */

export function computeLineDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');

  // Safety guard for very large documents
  if (oldLines.length > 3000 || newLines.length > 3000) {
    return [
      { type: 'removed', lines: oldLines },
      { type: 'added', lines: newLines },
    ];
  }

  const m = oldLines.length;
  const n = newLines.length;

  // LCS dynamic programming table
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1).fill(0);
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build flat ops list
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'unchanged', line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'added', line: newLines[j - 1] });
      j--;
    } else {
      ops.unshift({ type: 'removed', line: oldLines[i - 1] });
      i--;
    }
  }

  // Group consecutive ops of the same type into hunks
  const hunks = [];
  for (const op of ops) {
    if (hunks.length > 0 && hunks[hunks.length - 1].type === op.type) {
      hunks[hunks.length - 1].lines.push(op.line);
    } else {
      hunks.push({ type: op.type, lines: [op.line] });
    }
  }

  return hunks;
}

/**
 * Normalize a document name for similarity comparison.
 * Strips version indicators and normalizes whitespace.
 */
export function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\.(pdf|docx)$/i, '')
    .replace(/\b(v\d+|version\s*\d+|\d{4}|final|revised|draft|new|updated|old|copy|backup)\b/gi, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Name similarity score (0-1) between two normalized names.
 */
export function nameSimilarity(nameA, nameB) {
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}
```

**Step 2: Verify syntax**

```bash
node -e "import('./lib/diff.js').then(m => { console.log(m.nameSimilarity('Data Protection Policy v2', 'Data Protection Policy')); })"
```

Expected output: a number close to 1 (e.g. `0.88` or higher).

**Step 3: Commit**

```bash
git add lib/diff.js
git commit -m "feat: add line diff and name similarity utilities"
```

---

## Task 3: Add DB Functions for Version Control

**Files:**
- Modify: `lib/db.js` (append new functions at the end of the file)

**Step 1: Append the following functions to the end of `lib/db.js`**

```js
// ============================================
// Version control operations
// ============================================

/**
 * Insert a pending replacement candidate detected during processing.
 */
export function addPendingReplacement(newDocumentId, candidateId, confidence) {
  const result = run(
    `INSERT INTO pending_replacements (new_document_id, candidate_id, confidence) VALUES (?, ?, ?)`,
    [newDocumentId, candidateId, confidence]
  );
  return result.lastInsertRowId;
}

/**
 * Get all pending replacements (status = 'pending'), joined with document names.
 */
export function getPendingReplacements() {
  return query(`
    SELECT pr.*,
      nd.name AS new_doc_name, nd.doc_type AS new_doc_type,
      cd.name AS candidate_name, cd.doc_type AS candidate_doc_type,
      cd.version AS candidate_version
    FROM pending_replacements pr
    JOIN documents nd ON pr.new_document_id = nd.id
    JOIN documents cd ON pr.candidate_id = cd.id
    WHERE pr.status = 'pending'
    ORDER BY pr.detected_at DESC
  `);
}

/**
 * Get pending replacement for a specific new document (status = 'pending').
 */
export function getPendingReplacementForDoc(newDocumentId) {
  return get(`
    SELECT pr.*,
      cd.name AS candidate_name, cd.version AS candidate_version
    FROM pending_replacements pr
    JOIN documents cd ON pr.candidate_id = cd.id
    WHERE pr.new_document_id = ? AND pr.status = 'pending'
    LIMIT 1
  `, [newDocumentId]);
}

/**
 * Update pending replacement status.
 */
export function updatePendingReplacementStatus(id, status) {
  run(`UPDATE pending_replacements SET status = ? WHERE id = ?`, [status, id]);
}

/**
 * Store a precomputed diff between two document versions.
 */
export function addDocumentDiff(oldDocumentId, newDocumentId, diffJson) {
  const result = run(
    `INSERT INTO document_diffs (old_document_id, new_document_id, diff_json) VALUES (?, ?, ?)`,
    [oldDocumentId, newDocumentId, JSON.stringify(diffJson)]
  );
  return result.lastInsertRowId;
}

/**
 * Get stored diff between two documents.
 */
export function getDocumentDiff(oldDocumentId, newDocumentId) {
  return get(
    `SELECT * FROM document_diffs WHERE old_document_id = ? AND new_document_id = ?`,
    [oldDocumentId, newDocumentId]
  );
}

/**
 * Get the full version chain for a document (all versions sharing the same canonical_id).
 * Returns newest-first.
 */
export function getDocumentVersionChain(documentId) {
  // First resolve canonical_id
  const doc = get(`SELECT id, canonical_id FROM documents WHERE id = ?`, [documentId]);
  if (!doc) return [];
  const rootId = doc.canonical_id ?? doc.id;
  return query(`
    SELECT id, name, version, status, in_force, added_at, superseded_by, canonical_id
    FROM documents
    WHERE id = ? OR canonical_id = ?
    ORDER BY version DESC
  `, [rootId, rootId]);
}

/**
 * Apply version link: old doc gets archived, new doc becomes current version.
 * Returns { oldDoc, newDoc }.
 */
export function applyVersionLink(oldDocumentId, newDocumentId) {
  const oldDoc = get(`SELECT * FROM documents WHERE id = ?`, [oldDocumentId]);
  if (!oldDoc) throw new Error(`Old document ${oldDocumentId} not found`);
  const newDoc = get(`SELECT * FROM documents WHERE id = ?`, [newDocumentId]);
  if (!newDoc) throw new Error(`New document ${newDocumentId} not found`);

  const canonicalId = oldDoc.canonical_id ?? oldDoc.id;
  const newVersion = (oldDoc.version ?? 1) + 1;

  // Archive old document
  run(
    `UPDATE documents SET in_force = 'false', status = 'archived', superseded_by = ? WHERE id = ?`,
    [newDocumentId, oldDocumentId]
  );

  // Promote new document
  run(
    `UPDATE documents SET in_force = 'true', version = ?, canonical_id = ? WHERE id = ?`,
    [newVersion, canonicalId, newDocumentId]
  );

  return {
    oldDoc: get(`SELECT * FROM documents WHERE id = ?`, [oldDocumentId]),
    newDoc: get(`SELECT * FROM documents WHERE id = ?`, [newDocumentId]),
  };
}
```

**Step 2: Commit**

```bash
git add lib/db.js
git commit -m "feat: add version control DB functions (pending replacements, diffs, version chain)"
```

---

## Task 4: Export New DB Functions

**Files:**
- Modify: `src/lib/db-imports.ts`

**Step 1: Add new exports to `src/lib/db-imports.ts`**

Append to the existing export list:

```ts
export {
  addPendingReplacement,
  getPendingReplacements,
  getPendingReplacementForDoc,
  updatePendingReplacementStatus,
  addDocumentDiff,
  getDocumentDiff,
  getDocumentVersionChain,
  applyVersionLink,
} from "../../lib/db.js";
```

**Step 2: Commit**

```bash
git add src/lib/db-imports.ts
git commit -m "feat: export version control DB functions"
```

---

## Task 5: Add Constants, Types, and Settings

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/types.ts`
- Modify: `lib/settings.js`

**Step 1: Add constant to `src/lib/constants.ts`**

Append at the end:

```ts
export const POLICIES_TAB_DEFAULT_DOC_TYPES = ["policy", "procedure"] as const;
```

**Step 2: Add `DocumentVersion` interface and `policiesTabDocTypes` to Settings in `src/lib/types.ts`**

Add after the `AuditEntry` interface:

```ts
export interface DocumentVersion {
  id: number;
  name: string;
  version: number;
  status: string | null;
  in_force: string | null;
  added_at: string;
  superseded_by: number | null;
  canonical_id: number | null;
}
```

Add `policiesTabDocTypes` to the `Settings` interface:

```ts
  policiesTabDocTypes: string[];
```

**Step 3: Add `policiesTabDocTypes` to `lib/settings.js` defaultSettings**

```js
  policiesTabDocTypes: ["policy", "procedure"],
```

**Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/lib/constants.ts src/lib/types.ts lib/settings.js
git commit -m "feat: add version control constants, DocumentVersion type, policiesTabDocTypes setting"
```

---

## Task 6: Update Processing Pipeline

**Files:**
- Modify: `src/app/api/documents/[id]/process/route.ts`

**Step 1: Add new imports at the top of the process route**

After the existing imports, add:

```ts
import { addPendingReplacement, getPendingReplacements } from "@/lib/db-imports";
import { nameSimilarity } from "@/lib/diff-imports";
import { getAppSetting } from "@/lib/db-imports";
```

**Step 2: Create `src/lib/diff-imports.ts`**

```ts
export { computeLineDiff, nameSimilarity } from "../../lib/diff.js";
```

**Step 3: Store `full_text` for policy doc types**

In the `process/route.ts`, in the `// ---- STANDARD DOCUMENT PIPELINE ----` section, after `updateDocumentProcessed(documentId, wordCount)`, add:

```ts
    // Store full_text for policy doc types (needed for version diff)
    const policiesSettingRaw = getAppSetting('policies_tab_doc_types');
    const policiesDocTypes: string[] = policiesSettingRaw
      ? JSON.parse(policiesSettingRaw)
      : ['policy', 'procedure'];
    const finalDoc = getDocumentById(documentId);
    if (finalDoc.doc_type && policiesDocTypes.includes(finalDoc.doc_type)) {
      updateDocumentMetadata(documentId, { full_text: text });
    }
```

**Step 4: Add version detection step in the standard document pipeline**

After the `full_text` storage block above, and before the near-duplicate check, add:

```ts
    // Version detection: find likely predecessor document
    try {
      if (finalDoc.doc_type && policiesDocTypes.includes(finalDoc.doc_type)) {
        const existingDocs = getAllDocuments().filter(
          (d) =>
            d.id !== documentId &&
            d.doc_type === finalDoc.doc_type &&
            d.superseded_by === null // only current/latest versions
        );

        let bestCandidate: { id: number; score: number } | null = null;
        for (const candidate of existingDocs) {
          const score = nameSimilarity(finalDoc.name, candidate.name);
          if (score > 0.6 && (!bestCandidate || score > bestCandidate.score)) {
            bestCandidate = { id: candidate.id, score };
          }
        }

        if (bestCandidate) {
          addPendingReplacement(documentId, bestCandidate.id, bestCandidate.score);
          logAction('document', documentId, 'version_candidate_detected', {
            candidateId: bestCandidate.id,
            confidence: bestCandidate.score,
          });
        }
      }
    } catch (versionErr) {
      const msg = versionErr instanceof Error ? versionErr.message : 'Unknown error';
      console.warn('Version detection failed:', msg);
    }
```

**Step 5: Add `getAllDocuments` to the imports in `process/route.ts`** (it's already exported from db-imports, just add it to the import line).

**Step 6: Verify server starts without errors**

```bash
npm run dev
```

Expected: No errors. Process an existing policy document and check terminal for "Version detection" log output.

**Step 7: Commit**

```bash
git add src/app/api/documents/[id]/process/route.ts src/lib/diff-imports.ts
git commit -m "feat: store full_text for policy docs and run version detection on process"
```

---

## Task 7: API — Pending Replacements

**Files:**
- Create: `src/app/api/documents/pending-replacements/route.ts`

**Step 1: Create the file**

```ts
import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getPendingReplacements } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const pending = getPendingReplacements();
    return NextResponse.json({ pending });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Verify**

```bash
curl http://localhost:3000/api/documents/pending-replacements
```

Expected: `{ "pending": [] }` (empty array if no processing done yet).

**Step 3: Commit**

```bash
git add src/app/api/documents/pending-replacements/route.ts
git commit -m "feat: add GET /api/documents/pending-replacements endpoint"
```

---

## Task 8: API — Confirm & Dismiss Replacement

**Files:**
- Create: `src/app/api/documents/[id]/confirm-replacement/route.ts`
- Create: `src/app/api/documents/[id]/dismiss-replacement/route.ts`

**Step 1: Create `confirm-replacement/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getPendingReplacementForDoc,
  updatePendingReplacementStatus,
  applyVersionLink,
  addLineageEntry,
  addDocumentDiff,
  getDocumentById,
} from "@/lib/db-imports";
import { computeLineDiff } from "@/lib/diff-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const newDocumentId = parseInt(id, 10);

  try {
    const pending = getPendingReplacementForDoc(newDocumentId);
    if (!pending) {
      return NextResponse.json({ error: "No pending replacement found for this document" }, { status: 404 });
    }

    const oldDocumentId = pending.candidate_id as number;

    // Apply version link (archive old, promote new)
    const { oldDoc, newDoc } = applyVersionLink(oldDocumentId, newDocumentId);

    // Add lineage entry
    addLineageEntry(newDocumentId, oldDocumentId, "version_of", 1.0);

    // Compute and store diff if both have full_text
    const oldFull = getDocumentById(oldDocumentId);
    const newFull = getDocumentById(newDocumentId);
    if (oldFull?.full_text && newFull?.full_text) {
      const hunks = computeLineDiff(oldFull.full_text, newFull.full_text);
      addDocumentDiff(oldDocumentId, newDocumentId, hunks);
    }

    // Mark pending as confirmed
    updatePendingReplacementStatus(pending.id as number, "confirmed");

    logAction("document", newDocumentId, "version_confirmed", {
      source: "auto-confirmed",
      oldDocumentId,
      oldVersion: oldDoc.version,
      newVersion: newDoc.version,
    });

    return NextResponse.json({
      message: `Document confirmed as v${newDoc.version}, previous version archived`,
      oldDocument: oldDoc,
      newDocument: newDoc,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Create `dismiss-replacement/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getPendingReplacementForDoc, updatePendingReplacementStatus } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const newDocumentId = parseInt(id, 10);

  try {
    const pending = getPendingReplacementForDoc(newDocumentId);
    if (!pending) {
      return NextResponse.json({ error: "No pending replacement found" }, { status: 404 });
    }

    updatePendingReplacementStatus(pending.id as number, "dismissed");

    logAction("document", newDocumentId, "version_dismissed", {
      candidateId: pending.candidate_id,
    });

    return NextResponse.json({ message: "Replacement suggestion dismissed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add src/app/api/documents/[id]/confirm-replacement/route.ts src/app/api/documents/[id]/dismiss-replacement/route.ts
git commit -m "feat: add confirm-replacement and dismiss-replacement API endpoints"
```

---

## Task 9: API — Manual Set Replacement

**Files:**
- Create: `src/app/api/documents/[id]/set-replacement/route.ts`

**Step 1: Create the file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getDocumentById,
  applyVersionLink,
  addLineageEntry,
  addDocumentDiff,
} from "@/lib/db-imports";
import { computeLineDiff } from "@/lib/diff-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const newDocumentId = parseInt(id, 10);

  try {
    const body = await request.json();
    const { oldDocumentId } = body as { oldDocumentId: number };

    if (!oldDocumentId || typeof oldDocumentId !== "number") {
      return NextResponse.json({ error: "oldDocumentId is required" }, { status: 400 });
    }

    if (oldDocumentId === newDocumentId) {
      return NextResponse.json({ error: "A document cannot replace itself" }, { status: 400 });
    }

    const oldDoc = getDocumentById(oldDocumentId);
    if (!oldDoc) {
      return NextResponse.json({ error: "Old document not found" }, { status: 404 });
    }

    const newDoc = getDocumentById(newDocumentId);
    if (!newDoc) {
      return NextResponse.json({ error: "New document not found" }, { status: 404 });
    }

    const { oldDoc: archivedDoc, newDoc: promotedDoc } = applyVersionLink(oldDocumentId, newDocumentId);

    addLineageEntry(newDocumentId, oldDocumentId, "version_of", 1.0);

    // Compute and store diff if both have full_text
    if (oldDoc.full_text && newDoc.full_text) {
      const hunks = computeLineDiff(oldDoc.full_text, newDoc.full_text);
      addDocumentDiff(oldDocumentId, newDocumentId, hunks);
    }

    logAction("document", newDocumentId, "version_confirmed", {
      source: "manual",
      oldDocumentId,
      oldVersion: archivedDoc.version,
      newVersion: promotedDoc.version,
    });

    return NextResponse.json({
      message: `Document set as v${promotedDoc.version}, previous version archived`,
      oldDocument: archivedDoc,
      newDocument: promotedDoc,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/documents/[id]/set-replacement/route.ts
git commit -m "feat: add manual set-replacement API endpoint"
```

---

## Task 10: API — Version History & Diff

**Files:**
- Create: `src/app/api/documents/[id]/versions/route.ts`
- Create: `src/app/api/documents/[id]/diff/[oldId]/route.ts`

**Step 1: Create `versions/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentVersionChain } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const documentId = parseInt(id, 10);

  try {
    const versions = getDocumentVersionChain(documentId);
    return NextResponse.json({ versions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Create `diff/[oldId]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentDiff, getDocumentById, addDocumentDiff } from "@/lib/db-imports";
import { computeLineDiff } from "@/lib/diff-imports";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; oldId: string }> }
) {
  await ensureDb();
  const { id, oldId } = await params;
  const newDocumentId = parseInt(id, 10);
  const oldDocumentId = parseInt(oldId, 10);

  try {
    // Try to get stored diff first
    let stored = getDocumentDiff(oldDocumentId, newDocumentId);

    if (!stored) {
      // Compute on-the-fly and cache
      const oldDoc = getDocumentById(oldDocumentId);
      const newDoc = getDocumentById(newDocumentId);
      if (!oldDoc?.full_text || !newDoc?.full_text) {
        return NextResponse.json({ error: "Full text not available for diff" }, { status: 422 });
      }
      const hunks = computeLineDiff(oldDoc.full_text, newDoc.full_text);
      addDocumentDiff(oldDocumentId, newDocumentId, hunks);
      stored = getDocumentDiff(oldDocumentId, newDocumentId);
    }

    return NextResponse.json({
      hunks: JSON.parse(stored!.diff_json as string),
      created_at: stored!.created_at,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add src/app/api/documents/[id]/versions/route.ts src/app/api/documents/[id]/diff/[oldId]/route.ts
git commit -m "feat: add version history and diff API endpoints"
```

---

## Task 11: Sidebar Entry

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

**Step 1: Add `Shield` to lucide-react import and add Policies nav item**

In the import line, add `Shield`:
```ts
import { FileText, Search, ClipboardCheck, Settings, MessageSquare, Layers, Shield } from "lucide-react";
```

Add to `navItems` after the Documents entry:
```ts
  { title: "Policies", href: "/policies", icon: Shield },
```

**Step 2: Verify sidebar renders with new item**

```bash
npm run dev
```

Expected: "Policies" link with Shield icon appears in sidebar between Documents and Analyze.

**Step 3: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: add Policies sidebar entry"
```

---

## Task 12: PendingReplacementBanner Component

**Files:**
- Create: `src/components/policies/pending-replacement-banner.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PendingReplacementBannerProps {
  documentId: number;
  candidateName: string;
  candidateVersion: number;
  confidence: number;
  onResolved: () => void;
}

export function PendingReplacementBanner({
  documentId,
  candidateName,
  candidateVersion,
  confidence,
  onResolved,
}: PendingReplacementBannerProps) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/confirm-replacement`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        onResolved();
      } else {
        toast.error(data.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDismiss() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/dismiss-replacement`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.info("Suggestion dismissed");
        onResolved();
      } else {
        toast.error(data.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="flex-1 text-amber-800 dark:text-amber-300">
        May replace <strong>{candidateName}</strong> (v{candidateVersion}){" "}
        <span className="text-amber-600 dark:text-amber-500 text-xs">
          {Math.round(confidence * 100)}% match
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs border-amber-300 hover:bg-amber-100"
        onClick={handleConfirm}
        disabled={loading}
      >
        <Check className="h-3 w-3 mr-1" />
        Confirm
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-amber-700"
        onClick={handleDismiss}
        disabled={loading}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/policies/pending-replacement-banner.tsx
git commit -m "feat: add PendingReplacementBanner component"
```

---

## Task 13: SetReplacementModal Component

**Files:**
- Create: `src/components/policies/set-replacement-modal.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { Document } from "@/lib/types";

interface SetReplacementModalProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}

export function SetReplacementModal({
  document,
  open,
  onOpenChange,
  onResolved,
}: SetReplacementModalProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/documents")
      .then((r) => r.json())
      .then((data) => setDocuments(data.documents || []));
  }, [open]);

  const filtered = documents.filter(
    (d) =>
      d.id !== document?.id &&
      d.doc_type === document?.doc_type &&
      d.superseded_by === null &&
      d.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleConfirm() {
    if (!selected || !document) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${document.id}/set-replacement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldDocumentId: selected }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        onOpenChange(false);
        onResolved();
      } else {
        toast.error(data.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set as replacement for…</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select the document that <strong>{document?.name}</strong> replaces. The selected document will be archived.
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-2">No documents found.</p>
          )}
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-muted transition-colors ${
                selected === d.id ? "bg-muted font-medium" : ""
              }`}
            >
              <span>{d.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">v{d.version ?? 1}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || loading}>
            Confirm replacement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/policies/set-replacement-modal.tsx
git commit -m "feat: add SetReplacementModal component"
```

---

## Task 14: DiffModal Component

**Files:**
- Create: `src/components/policies/diff-modal.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface Hunk {
  type: "added" | "removed" | "unchanged";
  lines: string[];
}

interface DiffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newDocumentId: number;
  oldDocumentId: number;
  newDocumentName: string;
  oldVersion: number;
  newVersion: number;
}

const CONTEXT_LINES = 3; // unchanged lines to show around changes

export function DiffModal({
  open,
  onOpenChange,
  newDocumentId,
  oldDocumentId,
  newDocumentName,
  oldVersion,
  newVersion,
}: DiffModalProps) {
  const [hunks, setHunks] = useState<Hunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedHunks, setExpandedHunks] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch(`/api/documents/${newDocumentId}/diff/${oldDocumentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setHunks(data.hunks || []);
      })
      .catch(() => setError("Failed to load diff"))
      .finally(() => setLoading(false));
  }, [open, newDocumentId, oldDocumentId]);

  // Build display hunks: show context lines around changes, collapse large unchanged blocks
  function buildDisplaySections() {
    const sections: Array<{ hunkIndex: number; slice?: [number, number]; collapsed?: boolean; count?: number }> = [];

    for (let i = 0; i < hunks.length; i++) {
      const hunk = hunks[i];
      if (hunk.type !== "unchanged") {
        sections.push({ hunkIndex: i });
      } else {
        const isExpanded = expandedHunks.has(i);
        if (isExpanded || hunk.lines.length <= CONTEXT_LINES * 2 + 1) {
          sections.push({ hunkIndex: i });
        } else {
          // Show first CONTEXT_LINES, collapse middle, show last CONTEXT_LINES
          sections.push({ hunkIndex: i, slice: [0, CONTEXT_LINES] });
          sections.push({ hunkIndex: i, collapsed: true, count: hunk.lines.length - CONTEXT_LINES * 2 });
          sections.push({ hunkIndex: i, slice: [hunk.lines.length - CONTEXT_LINES, hunk.lines.length] });
        }
      }
    }
    return sections;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {newDocumentName} — v{oldVersion} → v{newVersion}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive p-4">{error}</p>
        )}

        {!loading && !error && hunks.length === 0 && (
          <p className="text-sm text-muted-foreground p-4">No differences found.</p>
        )}

        {!loading && !error && hunks.length > 0 && (
          <div className="overflow-y-auto flex-1 font-mono text-xs border rounded-md">
            {buildDisplaySections().map((section, idx) => {
              const hunk = hunks[section.hunkIndex];
              const lines = section.slice
                ? hunk.lines.slice(section.slice[0], section.slice[1])
                : hunk.lines;

              if (section.collapsed) {
                return (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1 bg-muted/30 text-muted-foreground border-y">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-xs"
                      onClick={() => setExpandedHunks((prev) => new Set(prev).add(section.hunkIndex))}
                    >
                      Show {section.count} unchanged lines
                    </Button>
                  </div>
                );
              }

              return lines.map((line, lineIdx) => {
                const bg =
                  hunk.type === "added"
                    ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
                    : hunk.type === "removed"
                    ? "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300"
                    : "text-muted-foreground";
                const prefix =
                  hunk.type === "added" ? "+" : hunk.type === "removed" ? "-" : " ";

                return (
                  <div key={`${idx}-${lineIdx}`} className={`flex px-3 py-0.5 ${bg}`}>
                    <span className="w-4 shrink-0 select-none opacity-50">{prefix}</span>
                    <span className="whitespace-pre-wrap break-all">{line}</span>
                  </div>
                );
              });
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/policies/diff-modal.tsx
git commit -m "feat: add DiffModal component with collapsible unchanged sections"
```

---

## Task 15: VersionHistoryPanel Component

**Files:**
- Create: `src/components/policies/version-history-panel.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState, useEffect } from "react";
import { GitBranch, CheckCircle, Archive, Diff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DiffModal } from "./diff-modal";
import type { DocumentVersion } from "@/lib/types";

interface VersionHistoryPanelProps {
  documentId: number;
  documentName: string;
}

export function VersionHistoryPanel({ documentId, documentName }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffPair, setDiffPair] = useState<{ newId: number; oldId: number; newV: number; oldV: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/documents/${documentId}/versions`)
      .then((r) => r.json())
      .then((data) => setVersions(data.versions || []))
      .finally(() => setLoading(false));
  }, [documentId]);

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (versions.length <= 1) {
    return (
      <p className="text-xs text-muted-foreground p-3">No previous versions.</p>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <GitBranch className="h-3.5 w-3.5" />
        Version history
      </div>

      {versions.map((v, idx) => {
        const isCurrent = v.in_force === "true";
        const next = versions[idx - 1]; // versions are newest-first

        return (
          <div key={v.id} className="flex items-center gap-2 py-1.5 text-sm">
            {isCurrent ? (
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            ) : (
              <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium w-6 text-xs shrink-0">v{v.version}</span>
            <span className="flex-1 text-xs text-muted-foreground truncate">
              {new Date(v.added_at).toLocaleDateString()}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${isCurrent ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"}`}>
              {isCurrent ? "Active" : "Archived"}
            </span>
            {next && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setDiffPair({ newId: v.id, oldId: next.id, newV: v.version, oldV: next.version });
                  setDiffOpen(true);
                }}
              >
                <Diff className="h-3 w-3 mr-1" />
                Diff
              </Button>
            )}
          </div>
        );
      })}

      {diffPair && (
        <DiffModal
          open={diffOpen}
          onOpenChange={setDiffOpen}
          newDocumentId={diffPair.newId}
          oldDocumentId={diffPair.oldId}
          newDocumentName={documentName}
          oldVersion={diffPair.oldV}
          newVersion={diffPair.newV}
        />
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/policies/version-history-panel.tsx
git commit -m "feat: add VersionHistoryPanel component"
```

---

## Task 16: Policies Page

**Files:**
- Create: `src/app/policies/page.tsx`
- Create: `src/components/policies/policies-list.tsx`

**Step 1: Create `policies-list.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PendingReplacementBanner } from "./pending-replacement-banner";
import { VersionHistoryPanel } from "./version-history-panel";
import { SetReplacementModal } from "./set-replacement-modal";
import type { Document } from "@/lib/types";

interface PendingReplacement {
  id: number;
  new_document_id: number;
  candidate_id: number;
  confidence: number;
  candidate_name: string;
  candidate_version: number;
}

interface PoliciesListProps {
  documents: Document[];
  pendingReplacements: PendingReplacement[];
  onRefresh: () => void;
}

function PolicyRow({
  doc,
  pending,
  onRefresh,
}: {
  doc: Document;
  pending: PendingReplacement | undefined;
  onRefresh: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);

  const isActive = doc.in_force === "true";

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
        {/* Expand history */}
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{doc.name}</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              v{doc.version ?? 1}
            </Badge>
            <Badge
              className={`text-xs px-1.5 py-0 ${
                isActive
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {isActive ? "Active" : "Archived"}
            </Badge>
            {doc.category && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {doc.category}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(doc.added_at).toLocaleDateString()}
          </p>
        </div>

        {/* Actions */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setReplaceModalOpen(true)}
          title="Set as replacement for another document"
        >
          <GitMerge className="h-3.5 w-3.5 mr-1" />
          Replace
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setHistoryOpen((v) => !v)}
        >
          <GitBranch className="h-3.5 w-3.5 mr-1" />
          History
        </Button>
      </div>

      {/* Pending replacement banner */}
      {pending && (
        <div className="px-4 pb-2">
          <PendingReplacementBanner
            documentId={doc.id}
            candidateName={pending.candidate_name}
            candidateVersion={pending.candidate_version}
            confidence={pending.confidence}
            onResolved={onRefresh}
          />
        </div>
      )}

      {/* Version history */}
      {historyOpen && (
        <div className="border-t bg-muted/10">
          <VersionHistoryPanel documentId={doc.id} documentName={doc.name} />
        </div>
      )}

      <SetReplacementModal
        document={doc}
        open={replaceModalOpen}
        onOpenChange={setReplaceModalOpen}
        onResolved={onRefresh}
      />
    </div>
  );
}

export function PoliciesList({ documents, pendingReplacements, onRefresh }: PoliciesListProps) {
  const pendingMap = new Map(pendingReplacements.map((p) => [p.new_document_id, p]));

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No policy documents found.</p>
        <p className="text-sm mt-1">Upload a policy or procedure, or adjust the document types in Settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <PolicyRow
          key={doc.id}
          doc={doc}
          pending={pendingMap.get(doc.id)}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
```

**Step 2: Create `src/app/policies/page.tsx`**

```tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PoliciesList } from "@/components/policies/policies-list";
import type { Document } from "@/lib/types";

interface PendingReplacement {
  id: number;
  new_document_id: number;
  candidate_id: number;
  confidence: number;
  candidate_name: string;
  candidate_version: number;
}

export default function PoliciesPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pendingReplacements, setPendingReplacements] = useState<PendingReplacement[]>([]);
  const [docTypes, setDocTypes] = useState<string[]>(["policy", "procedure"]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [docsRes, pendingRes, settingsRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/documents/pending-replacements"),
        fetch("/api/settings"),
      ]);

      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.documents || []);
      }
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingReplacements(data.pending || []);
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.policiesTabDocTypes) setDocTypes(data.policiesTabDocTypes);
      }
    } catch (err) {
      toast.error(`Failed to load: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    let result = documents.filter((d) => d.doc_type && docTypes.includes(d.doc_type));

    if (activeOnly) {
      result = result.filter((d) => d.in_force === "true");
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((d) => d.name.toLowerCase().includes(q));
    }

    // Sort: active first, then archived, then alphabetical
    result.sort((a, b) => {
      if (a.in_force === "true" && b.in_force !== "true") return -1;
      if (a.in_force !== "true" && b.in_force === "true") return 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [documents, docTypes, activeOnly, search]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Policies</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Policies, procedures, and other controlled documents with version history.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="active-only" checked={activeOnly} onCheckedChange={setActiveOnly} />
          <Label htmlFor="active-only" className="text-sm cursor-pointer">
            Active only
          </Label>
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} document{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <PoliciesList
          documents={filtered}
          pendingReplacements={pendingReplacements}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
```

**Step 3: Verify the page renders**

```bash
npm run dev
```

Navigate to `http://localhost:3000/policies`. Expected: Policies page loads, shows filtered documents.

**Step 4: Commit**

```bash
git add src/app/policies/page.tsx src/components/policies/policies-list.tsx
git commit -m "feat: add Policies page with list, pending banners, and version history"
```

---

## Task 17: Settings Page — Policies Doc Type Selector

**Files:**
- Create: `src/components/settings/policies-section.tsx`
- Modify: `src/app/settings/page.tsx`

**Step 1: Create `policies-section.tsx`**

```tsx
"use client";

import { DOC_TYPES } from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface PoliciesSectionProps {
  selectedTypes: string[];
  onChange: (types: string[]) => void;
}

export function PoliciesSection({ selectedTypes, onChange }: PoliciesSectionProps) {
  function toggle(type: string) {
    if (selectedTypes.includes(type)) {
      onChange(selectedTypes.filter((t) => t !== type));
    } else {
      onChange([...selectedTypes, type]);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Policies Tab — Document Types</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Select which document types appear in the Policies tab.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {DOC_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <Checkbox
              id={`policy-type-${type}`}
              checked={selectedTypes.includes(type)}
              onCheckedChange={() => toggle(type)}
            />
            <Label htmlFor={`policy-type-${type}`} className="text-sm capitalize cursor-pointer">
              {type}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Integrate into settings page**

In `src/app/settings/page.tsx`, add import:

```tsx
import { PoliciesSection } from "@/components/settings/policies-section";
```

In the JSX (after the last settings section, before the save button area), add:

```tsx
<PoliciesSection
  selectedTypes={settings?.policiesTabDocTypes ?? ["policy", "procedure"]}
  onChange={(types) => handleSettingsChange({ policiesTabDocTypes: types })}
/>
```

**Step 3: Verify**

Navigate to `http://localhost:3000/settings`. Expected: "Policies Tab — Document Types" section with checkboxes appears. Saving persists the selection and the Policies page reflects the change.

**Step 4: Commit**

```bash
git add src/components/settings/policies-section.tsx src/app/settings/page.tsx
git commit -m "feat: add policies doc type selector to Settings page"
```

---

## Task 18: End-to-end Verification

**Step 1: Full build check**

```bash
npm run build
```

Expected: Build completes with no TypeScript errors.

**Step 2: Manual end-to-end test**

1. Upload a policy document (PDF/DOCX) via the Documents page
2. Process it — observe terminal for version detection log
3. Upload a second document with a similar name and same doc_type
4. Process it — a pending replacement banner should appear on the Policies page
5. Click "Confirm" — verify the first document shows as Archived, second shows as Active with v2
6. Open version history — both versions listed
7. Click "Diff" — diff modal opens with changed/added/removed lines
8. Try the "Replace" button on any policy document — SetReplacementModal opens with searchable list

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: document version control and Policies tab complete"
```
