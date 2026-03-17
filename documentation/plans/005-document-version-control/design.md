# Document Version Control & Audit Trail — Design

**Date:** 2026-02-23
**Status:** Approved

---

## Overview

Introduce version control and audit trail for policy/procedure documents. When a new document replaces an existing one, the relationship is recorded, the old version is archived, and a line-level diff is stored. A dedicated Policies tab surfaces only the configured document types in a professional register view with version history and diff access.

---

## Data Model

### New table: `pending_replacements`

Holds auto-detected replacement candidates awaiting user confirmation.

```sql
CREATE TABLE pending_replacements (
  id              INTEGER PRIMARY KEY,
  new_document_id INTEGER NOT NULL REFERENCES documents(id),
  candidate_id    INTEGER NOT NULL REFERENCES documents(id),
  confidence      REAL NOT NULL,
  detected_at     DATETIME NOT NULL DEFAULT (datetime('now')),
  status          TEXT NOT NULL DEFAULT 'pending'
  -- status values: pending | confirmed | dismissed
);
CREATE INDEX idx_pending_replacements_new ON pending_replacements(new_document_id);
CREATE INDEX idx_pending_replacements_status ON pending_replacements(status);
```

### New table: `document_diffs`

Stores precomputed diff between two document versions. Computed once at link-time.

```sql
CREATE TABLE document_diffs (
  id              INTEGER PRIMARY KEY,
  old_document_id INTEGER NOT NULL REFERENCES documents(id),
  new_document_id INTEGER NOT NULL REFERENCES documents(id),
  diff_json       TEXT NOT NULL,
  -- JSON array of hunks: [{type: "added"|"removed"|"unchanged", lines: string[]}]
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_document_diffs_new ON document_diffs(new_document_id);
CREATE INDEX idx_document_diffs_old ON document_diffs(old_document_id);
```

### Existing fields used as-is

No migration required. These fields already exist on `documents`:

| Field | Role |
|---|---|
| `version` | Integer, incremented on each new version (starts at 1) |
| `canonical_id` | All versions in a chain point to the first document's `id` |
| `superseded_by` | Points forward to the next (newer) version's `id` |
| `in_force` | `true` on the current version only |
| `status` | Set to `archived` on superseded versions |

`document_lineage` gets a row with `relationship = version_of` when versions are linked.

`audit_log` records every version-link action with `entity_type = document` and details JSON including old/new version numbers and action source (`auto-confirmed` or `manual`).

---

## Processing Pipeline — Auto-detection

Runs after text extraction and embedding are complete for a newly processed document.

1. **Name similarity**: Fuzzy-match the new document's name against existing documents of the same `doc_type`. Strip version indicators (`v2`, `2024`, `final`, `revised`, etc.) before comparing. Score with normalized edit distance.

2. **Content similarity**: Cosine similarity between the new document's embedding and existing documents of the same `doc_type` (embeddings already computed at this stage).

3. **Scoring**: Combine both signals. If the top candidate exceeds confidence threshold (0.75), insert a row into `pending_replacements`.

4. **Notification**: A yellow banner appears on the document card in the main Documents tab and in the Policies tab: _"This document may replace [Name] — confirm or dismiss."_ Persists until actioned.

5. **Manual path**: Any document in the Policies tab has a "Set as replacement for…" action button. Opens a modal with a searchable list of existing documents of the same `doc_type`. User selects the predecessor — the same linking flow executes.

### On confirmation (either path)

- Old document: `in_force = false`, `status = archived`, `superseded_by = new_doc_id`
- New document: `in_force = true`, `version = old.version + 1`, `canonical_id = old.canonical_id ?? old.id`
- `document_lineage` row inserted: `source = new_doc_id`, `target = old_doc_id`, `relationship = version_of`
- Diff computed between `old.full_text` and `new.full_text` (changed lines only), stored in `document_diffs`
- `audit_log` entry written

---

## Policies Tab UI

**Route:** `/policies`
**Sidebar position:** Between Documents and Analyze
**Sidebar icon:** `Shield` (lucide-react)

### What it shows

All documents whose `doc_type` is in the configured set (see Settings). Default: `policy`, `procedure`.

### List view — per row

- Document name
- Version badge (`v3`)
- Department badge
- Status badge: green "Active" (`in_force = true`) or grey "Archived"
- Date of current version (`added_at`)
- Pending replacement banner if applicable
- History button → opens version history panel

### Filtering / sorting

- Default sort: Active first, then Archived, then alphabetical by name
- Filter toggle: "Active only" / "All"
- Search by name

### Version history panel

Slides in as a side sheet. Shows a timeline of all versions in the chain (newest at top). Each entry: version number, date uploaded, status badge. "View diff" button between adjacent versions.

### Diff modal

- Header: document name, version range (e.g. `v2 → v3`), date, action source (`auto-confirmed` / `manual`)
- Body: unified diff view — added lines in green, removed in red
- Only changed hunks rendered; unchanged sections collapsed with "show N unchanged lines" expander
- Source data: `diff_json` hunks from `document_diffs`

---

## Settings

New "Policies Tab" section on the Settings page. Multi-select of all `DOC_TYPES` constants. Saved to `app_settings` under key `policies_tab_doc_types` (JSON array). Default value: `["policy", "procedure"]`. Takes effect immediately.

---

## "Uploaded by" tracking

The app has no multi-user authentication. The diff modal header shows the `added_at` timestamp of the new version. The `audit_log` details field records `"source": "auto-confirmed"` or `"source": "manual"`. The `audit_log.details` JSON field is already structured to accept a future `user` key if auth is added — no schema change needed at that point.

---

## New & Changed Files

| Area | Files |
|---|---|
| DB schema | Migration to add `pending_replacements`, `document_diffs` tables |
| DB queries | `db-imports.ts` — add version/diff/pending CRUD functions |
| Processing pipeline | Add version-detection step after embedding in process route |
| API routes | `POST /api/documents/[id]/confirm-replacement` |
| | `POST /api/documents/[id]/dismiss-replacement` |
| | `POST /api/documents/[id]/set-replacement` (manual) |
| | `GET /api/documents/[id]/versions` |
| | `GET /api/documents/[id]/diff/[oldId]` |
| | `GET /api/documents/pending-replacements` |
| Settings API | `GET/PATCH /api/settings` — add `policies_tab_doc_types` key |
| New page | `src/app/policies/page.tsx` |
| New components | `src/components/policies/policies-list.tsx` |
| | `src/components/policies/version-history-panel.tsx` |
| | `src/components/policies/diff-modal.tsx` |
| | `src/components/policies/pending-replacement-banner.tsx` |
| | `src/components/policies/set-replacement-modal.tsx` |
| Sidebar | Add Policies entry to `app-sidebar.tsx` |
| Settings page | Add doc-type selector section |
| Constants | Add `POLICIES_TAB_DEFAULT_DOC_TYPES` |
