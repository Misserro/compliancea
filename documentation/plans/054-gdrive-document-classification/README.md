# Plan: GDrive Document Classification — Annexes, Invoices, Non-Contracts

> **Execute:** `/uc:plan-execution 054`
> Created: 2026-04-09
> Status: Draft
> Source: Feature Mode

## Objective

When processing documents imported from Google Drive, automatically classify each document as a **contract**, **annex**, **invoice**, or **other**. Annexes are linked to their parent contract. Invoices are matched to a contract and their financial data extracted and stored. Non-contracts are stored but excluded from the Contracts tab. Unmatched annexes and invoices surface in the Documents tab with a clear label.

## Context

- **Architecture:** `documentation/technology/architecture/database-schema.md` (contract_invoices, contract_documents, documents tables), `documentation/technology/architecture/data-flow.md` (GDrive sync + contract processing pipeline)
- **Requirements:** `documentation/product/requirements/features.md` (Google Drive Sync section)
- **Prior plan:** `documentation/plans/053-gdrive-per-org/README.md` (GDrive per-org foundation — all GDrive functions now accept orgId)
- **Context:** `.claude/app-context-for-research.md`

### Background

Plan 053 made GDrive multi-tenant and introduced `processGDriveDocument` which hard-codes every GDrive file as `doc_type = 'contract'`. This plan replaces that hard-coding with AI-powered classification. Two existing tables already support the linking model:

- **`contract_documents`** — junction table for annexes/amendments/exhibits linked to contracts (`document_type` enum: `amendment`, `addendum`, `exhibit`, `other` — we add `annex`)
- **`contract_invoices`** — financial invoice records linked to contracts (`contract_id`, `amount`, `currency`, `date_of_issue`, `date_of_payment`, `invoice_file_path`)

The only schema addition needed is a nullable `document_id` FK on `contract_invoices` to link a GDrive-sourced invoice document to its financial record.

### Key Design Decisions

- **One Claude call for classification + data extraction:** A single `classifyGDriveDocument(text)` call returns `{ classification, annexParentReference, invoiceData }`. No separate extraction call for annexes or invoices.
- **Invoice matching ambiguity rule:** If a vendor has multiple active contracts, the invoice goes unmatched (safer than silently picking the wrong contract). Admin resolves manually.
- **Unmatched retry:** Each maintenance cycle runs a re-match pass for all unmatched annexes and invoices in the org — newly imported contracts may be the parent we were waiting for.
- **`doc_type = 'other'`** already exists in the enum and is naturally excluded from `getContractsWithSummaries` (which filters `doc_type IN ('contract', 'agreement')`). No query changes needed.

## Tech Stack

- Anthropic Claude SDK (classification + extraction — already in use)
- SQLite via better-sqlite3 (already in use)
- Next.js 14 App Router (already in use)
- next-intl (i18n — bilingual EN/PL required)

## Scope

### In Scope

- `classifyGDriveDocument(text)` function in `lib/contracts.js`: one Claude call returning `{ classification: 'contract'|'annex'|'invoice'|'other', annexParentReference, invoiceData }`
- `findMatchingContract(orgId, { parties, contractRef, vendorName })` in `lib/db.js`: fuzzy search by party name + contract reference against `contracting_company`, `contracting_vendor`, `suggested_name`
- `document_id INTEGER REFERENCES documents(id)` migration on `contract_invoices`
- DB helpers: `insertContractDocument(contractId, documentId, documentType, label)`, `getUnmatchedAnnexes(orgId)`, `getUnmatchedInvoices(orgId)`, `insertContractInvoiceFromGDrive(contractId, documentId, invoiceData)`
- `processGDriveDocument` in `lib/maintenance.js` — replaces hard-coded contract path with classification branch:
  - `contract` → existing flow (extractContractTerms + obligations + historical check)
  - `annex` → extract parent ref → fuzzy match → insert `contract_documents` row (or mark unmatched)
  - `invoice` → fuzzy match by vendor → insert `contract_invoices` row with financial data + document_id (or mark unmatched)
  - `other` → set `doc_type = 'other'`, mark processed, skip further analysis
- Re-match loop at end of each per-org maintenance pass: retry unmatched annexes and invoices against org's contracts
- Contract detail view: **Annexes** section (linked documents from `contract_documents WHERE document_type = 'annex'`) and **Invoices** section (linked records from `contract_invoices WHERE document_id IS NOT NULL`) — both sourced from GDrive auto-import
- Documents tab: unmatched annexes and invoices show a label ("Unmatched annex" / "Unmatched invoice") so admins can identify them
- i18n (EN/PL) for all new UI labels

### Out of Scope

- Classification for manually uploaded documents (GDrive-only; manual uploads keep their current user-triggered flow)
- `is_paid` toggling or payment confirmation upload for GDrive-sourced invoices (those remain admin-managed via the existing invoice UI)
- Displaying linked annexes/invoices on the contract card (detail view only, not the list card)
- Manual reclassification UI (no override toggle in this plan)
- Encryption of extracted financial data

## Success Criteria

- [ ] A GDrive PDF containing a contract is processed as a contract with obligations extracted, unchanged from current behaviour
- [ ] A GDrive PDF containing an annex is stored with `doc_type = 'annex'`, linked to its parent via `contract_documents` (when matched), and visible in the "Annexes" section of the parent contract's detail view
- [ ] A GDrive PDF containing an invoice is stored with `doc_type = 'invoice'`, a `contract_invoices` row is created with the extracted amount/currency/dates, and the invoice appears in the "Invoices" section of the matched contract's detail view
- [ ] Unmatched annexes and unmatched invoices appear in the Documents tab with an "Unmatched annex" / "Unmatched invoice" label
- [ ] Non-contract documents (letters, policies, reports, etc.) are stored with `doc_type = 'other'` and are NOT visible in the Contracts tab
- [ ] Re-match loop: after a parent contract is imported in a later maintenance cycle, its previously unmatched annexes/invoices are automatically linked
- [ ] `npm run build` passes with no TypeScript errors

## Task List

> Every task gets the full pipeline: planning → impl → review → test.

---

### Task 1: Classification engine and DB infrastructure

**Description:**
Add the AI classification function, fuzzy contract matcher, DB migration, and all DB helpers needed by the maintenance cycle.

1. **`lib/contracts.js`** — Add `classifyGDriveDocument(text, apiKey?)`:
   - Calls Claude Sonnet with a classification prompt
   - Returns:
     ```js
     {
       classification: 'contract' | 'annex' | 'invoice' | 'other',
       annexParentReference: {
         contractTitle: string | null,
         parties: string[],
         contractNumber: string | null
       } | null,
       invoiceData: {
         vendorName: string | null,
         contractReference: string | null,
         invoiceNumber: string | null,
         amount: number | null,
         currency: string | null,
         issueDate: string | null,   // ISO date
         dueDate: string | null      // ISO date
       } | null,
       tokenUsage: { input, output, total, model }
     }
     ```
   - Classification prompt logic:
     - Annex indicators: "Annex", "Załącznik", "Addendum", "Amendment", "Exhibit", "Schedule", references to a parent contract
     - Invoice indicators: "Invoice", "Faktura", "VAT", invoice number patterns, total amount, payment due date
     - Contract indicators: parties, effective/expiry dates, obligation language, governing law
     - `other`: everything else (letters, policies, reports, memos)

2. **`lib/db.js`** — DB migration: add `document_id INTEGER REFERENCES documents(id)` to `contract_invoices` table (nullable — only set for GDrive-sourced invoices).

3. **`lib/db.js`** — Add `findMatchingContract(orgId, { parties, contractRef, vendorName })`:
   - Queries `SELECT id, suggested_name, contracting_company, contracting_vendor FROM documents WHERE doc_type IN ('contract', 'agreement') AND org_id = ? AND (status IS NULL OR status != 'terminated')`
   - Scores each result: party name overlap (case-insensitive includes) + contract reference substring match
   - Returns: `{ contractId, confidence }` if best match exceeds threshold (0.5), or `null` if no confident match
   - If multiple contracts share the same top score → returns `null` (ambiguous, leave unmatched)

4. **`lib/db.js`** — Add DB helpers:
   - `insertContractDocument(contractId, documentId, documentType, label)` — inserts into `contract_documents` with `document_id` set (GDrive source)
   - `getUnmatchedAnnexes(orgId)` — `SELECT d.id FROM documents d WHERE d.doc_type = 'annex' AND d.org_id = ? AND NOT EXISTS (SELECT 1 FROM contract_documents cd WHERE cd.document_id = d.id)`
   - `getUnmatchedInvoices(orgId)` — `SELECT d.id, d.path FROM documents d WHERE d.doc_type = 'invoice' AND d.org_id = ? AND NOT EXISTS (SELECT 1 FROM contract_invoices ci WHERE ci.document_id = d.id)`
   - `insertContractInvoiceFromGDrive(contractId, documentId, invoiceData)` — inserts into `contract_invoices` with `document_id`, `invoice_file_path = document.path`, and all financial fields from `invoiceData`
   - `getDocumentClassificationData(docId)` — reads `doc_type` + any unmatched metadata needed for re-match

5. **`src/lib/db-imports.ts`** — Re-export new DB helpers.

6. **`src/lib/gdrive-imports.ts`** — Re-export `classifyGDriveDocument` if needed by TypeScript callers.

**Files:**
- `lib/contracts.js` (add classifyGDriveDocument)
- `lib/db.js` (migration, findMatchingContract, 4 new helpers)
- `src/lib/db-imports.ts` (re-exports)
- `src/lib/gdrive-imports.ts` (re-exports, if needed)

**Patterns:**
- `documentation/technology/architecture/database-schema.md` (contract_invoices, contract_documents schemas)
- Existing `extractContractTerms` function in `lib/contracts.js` as the pattern for Claude call structure

**Success criteria:**
- `classifyGDriveDocument` returns correct classification for a sample contract text, annex text, invoice text, and letter text (unit tests with mock Claude responses)
- `findMatchingContract` returns correct match when vendor name overlaps, returns `null` when ambiguous (multiple matches), and returns `null` when no match
- `contract_invoices` table has `document_id` column (no migration error on startup)
- All new DB helpers execute without error against test DB
- `npm run build` passes

**Dependencies:** None

---

### Task 2: Maintenance cycle — classification branch + re-match loop

**Description:**
Replace the hard-coded `doc_type = 'contract'` path in `processGDriveDocument` with a classification branch, and add a re-match loop for unmatched annexes and invoices.

1. **`lib/maintenance.js`** — Update `processGDriveDocument(docId, localPath, orgId)`:
   - After text extraction, call `classifyGDriveDocument(text)` to get `{ classification, annexParentReference, invoiceData }`
   - Branch on `classification`:

   **`'contract'`** (existing path, unchanged):
   - Call `extractContractTerms(text)`
   - `updateDocumentMetadata(docId, { doc_type: 'contract', ...contractFields, processed: 1 })`
   - Historical check and obligation insertion (unchanged from Plan 053)

   **`'annex'`**:
   - `updateDocumentMetadata(docId, { doc_type: 'annex', processed: 1 })`
   - Call `findMatchingContract(orgId, annexParentReference)` → if matched: `insertContractDocument(contractId, docId, 'annex', annexParentReference.contractTitle)`
   - If unmatched: leave as `doc_type = 'annex'` with no `contract_documents` row (surfaced by `getUnmatchedAnnexes`)

   **`'invoice'`**:
   - `updateDocumentMetadata(docId, { doc_type: 'invoice', processed: 1 })`
   - Call `findMatchingContract(orgId, { parties: [invoiceData.vendorName], contractRef: invoiceData.contractReference, vendorName: invoiceData.vendorName })` → if matched: `insertContractInvoiceFromGDrive(contractId, docId, invoiceData)`
   - If unmatched: leave as `doc_type = 'invoice'` with no `contract_invoices` row

   **`'other'`**:
   - `updateDocumentMetadata(docId, { doc_type: 'other', processed: 1 })`
   - No further processing

2. **`lib/maintenance.js`** — Add re-match loop after per-org GDrive sync completes (new function `rematchUnlinkedDocuments(orgId)`):
   - Fetch `getUnmatchedAnnexes(orgId)` — for each, read stored `annexParentReference` from `full_text` extraction context or re-classify if full_text available; attempt `findMatchingContract`; insert `contract_documents` if matched
   - Fetch `getUnmatchedInvoices(orgId)` — for each, attempt `findMatchingContract` using stored doc name / contracting info; insert `contract_invoices` if matched
   - **Note:** For the re-match, avoid re-calling Claude — use the document's `full_text` if available, or skip if `full_text` is null. Re-classification is expensive; the re-match loop should rely on stored text and re-run the DB matching logic only.

   **Implementation note:** To avoid re-running Claude on every maintenance cycle for unmatched docs, store the extracted `annexParentReference` and `invoiceData` JSON in a lightweight way. Simplest: store them in the `documents` table's `name` field is wrong — instead, store in a new `classification_metadata TEXT` column OR re-extract from `full_text` using the same matching heuristics. The executor should evaluate whether to add a `classification_metadata TEXT` column to `documents` (nullable, JSON) or use a simpler approach.

**Files:**
- `lib/maintenance.js` (processGDriveDocument branch, rematchUnlinkedDocuments)
- Possibly `lib/db.js` if `classification_metadata` column is added

**Patterns:**
- `documentation/technology/architecture/data-flow.md` (GDrive sync flow, contract processing pipeline)
- Plan 053 `lib/maintenance.js` implementation (existing processGDriveDocument structure)

**Success criteria:**
- A GDrive document classified as `'contract'` follows the existing processing path (obligations extracted, is_historical checked) — no regression
- A GDrive document classified as `'annex'` is stored with `doc_type = 'annex'` and (when matched) a `contract_documents` row exists linking it to the parent
- A GDrive document classified as `'invoice'` is stored with `doc_type = 'invoice'` and (when matched) a `contract_invoices` row exists with financial data and `document_id` set
- A GDrive document classified as `'other'` is stored with `doc_type = 'other'` and has no `contract_obligations` rows
- Re-match loop: if an annex was previously unmatched and a matching contract is now in the DB, running the maintenance cycle creates the `contract_documents` link
- `npm run build` passes

**Dependencies:** Task 1

---

### Task 3: UI — Annexes and Invoices in contract detail, unmatched labels in Documents tab

**Description:**
Surface linked annexes and invoices in the contract detail view, and show unmatched labels in the Documents tab.

1. **`src/app/api/contracts/[id]/route.ts` (or equivalent contract detail API)** — Add linked data to contract detail response:
   - Query `contract_documents WHERE contract_id = ? AND document_type = 'annex'` → return as `annexes: [{ id, documentId, fileName, label, addedAt }]`
   - Query `contract_invoices WHERE contract_id = ? AND document_id IS NOT NULL` → return as `gdriveinvoices: [{ id, documentId, invoiceNumber, amount, currency, issueDate, dueDate, filePath }]`
   - Executor should identify the correct contract detail API endpoint by reading the existing routes.

2. **`src/components/contracts/contract-metadata-display.tsx`** — Add two new sections in view mode (below existing metadata):

   **Annexes section** (only when `contract.annexes?.length > 0`):
   ```tsx
   <div>
     <h4>{t('annexes')}</h4>
     {contract.annexes.map(a => (
       <div key={a.id}>
         <span>{a.label || a.fileName}</span>
         {/* link to view/download if documentId available */}
       </div>
     ))}
   </div>
   ```

   **Invoices section** (only when `contract.gdriveinvoices?.length > 0`):
   ```tsx
   <div>
     <h4>{t('linkedInvoices')}</h4>
     {contract.gdriveinvoices.map(inv => (
       <div key={inv.id}>
         <span>{inv.invoiceNumber}</span>
         <span>{inv.amount} {inv.currency}</span>
         <span>{t('due')}: {inv.dueDate}</span>
       </div>
     ))}
   </div>
   ```

3. **Documents tab — unmatched labels:**
   The Documents tab lists all documents. For `doc_type = 'annex'` with no `contract_documents` row and `doc_type = 'invoice'` with no `contract_invoices` row, add a badge.

   - In the documents list API (executor should identify the route), add a flag `isUnmatched` to documents where `doc_type IN ('annex', 'invoice')` and no corresponding link row exists.
   - In the document list component, render an amber badge: `{t('unmatchedAnnex')}` or `{t('unmatchedInvoice')}` when `isUnmatched` is true.

4. **i18n** (`messages/en.json`, `messages/pl.json`):
   - Add to Contracts namespace: `"annexes": "Annexes"`, `"linkedInvoices": "Linked Invoices"`, `"due": "Due"`
   - Add to Documents namespace: `"unmatchedAnnex": "Unmatched annex"`, `"unmatchedInvoice": "Unmatched invoice"`
   - Polish translations for all 5 keys

**Files:**
- Contract detail API route (executor to identify correct file)
- `src/components/contracts/contract-metadata-display.tsx`
- Documents list API route (executor to identify correct file)
- Documents list component (executor to identify correct file)
- `messages/en.json`
- `messages/pl.json`

**Patterns:**
- `documentation/technology/architecture/api-endpoints.md` (contract detail endpoint)
- `documentation/technology/architecture/i18n.md`
- Existing `is_historical` badge as a pattern for conditional badge rendering

**Success criteria:**
- Contract detail view shows an "Annexes" section listing linked annexes (by name/label) when any exist
- Contract detail view shows a "Linked Invoices" section with invoice number, amount, currency, due date when any GDrive invoices are linked
- Documents tab shows an amber "Unmatched annex" badge on annex documents with no parent link
- Documents tab shows an amber "Unmatched invoice" badge on invoice documents with no contract link
- All 5 new i18n keys present in both EN and PL locale files
- `npm run build` passes

**Dependencies:** Task 1, Task 2

---

## Documentation Changes

| File | Action | Summary |
|------|--------|---------|
| `documentation/technology/architecture/database-schema.md` | Update | Add `document_id` column to `contract_invoices`; add `'annex'` to `contract_documents.document_type` enum; note new `doc_type` values `'annex'` and `'invoice'` in use |
| `documentation/technology/architecture/data-flow.md` | Update | Replace hard-coded GDrive→contract path with classification branch diagram (contract / annex / invoice / other) |
| `documentation/product/requirements/features.md` | Update | Google Drive Sync section: add document classification, annex linking, invoice extraction, unmatched document handling |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Classification prompt misidentifies contracts as annexes or vice versa | Medium | Medium | Classification prompt uses strong positive indicators for each type; defaults to `'contract'` when uncertain (fail-safe) |
| Invoice vendor name doesn't match `contracting_vendor` exactly | Medium | Low | Case-insensitive substring matching; unmatched invoices surface in Documents for admin review |
| Multiple active contracts from same vendor cause invoice to go unmatched | Medium | Low | Correct behaviour per spec — ambiguous match → unmatched; admin resolves manually |
| Re-match loop attempts to re-classify docs without stored parent reference data | Medium | Medium | Executor to evaluate `classification_metadata` column vs. re-extracting from `full_text`; plan notes this explicitly |
| `classifyGDriveDocument` Claude call adds cost per GDrive document | Low | Low | One extra call per doc; acceptable given GDrive sync is already making one `extractContractTerms` call per doc |
