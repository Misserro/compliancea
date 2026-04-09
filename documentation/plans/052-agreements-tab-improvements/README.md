# Plan 052 — Agreements Tab Improvements

## Summary

Three coordinated improvements to the Agreements (Contracts) tab:

1. **AI contract naming** — Claude names contracts from their content ("CompanyA — CompanyB") instead of using the uploaded filename. Also populates `contracting_company`/`contracting_vendor` flat columns automatically during AI processing.
2. **Contract type classification** — New `contract_type` field (Vendor, B2B, Employment, NDA, etc.) auto-assigned by Claude during processing; manually editable afterwards.
3. **UI visual fix** — Contract name truncates cleanly in the card header; contract type shown as a badge.

A retroactive admin endpoint allows bulk re-naming and re-classifying of existing contracts on demand.

---

## Context

| Item | Detail |
|------|--------|
| Working directory | `src/components/contracts/`, `lib/contracts.js`, `lib/db.js`, `src/app/api/` |
| Existing data entry | `contracting_company` / `contracting_vendor` columns exist but are **never populated during AI processing today** — only set by manual editing |
| Migration pattern | `try { db.run('ALTER TABLE ... ADD COLUMN ...') } catch(e) {}` in `lib/db.js` init |
| Both DB update fns | `updateDocumentMetadata` (processing pipeline) and `updateContractMetadata` (contracts API) have explicit allowlists — both need `contract_type` + `name` added |

---

## Contract Type Enum

```
vendor      — Vendor / Supplier Agreement
b2b         — B2B / Service Agreement
employment  — Employment / HR Contract
nda         — NDA / Confidentiality Agreement
lease       — Lease / Rental Agreement
licensing   — Licensing / IP Agreement
partnership — Partnership / Joint Venture
framework   — Framework / Master Agreement
other       — Other
```

---

## Documentation Gaps

No pre-existing docs needed updating for this feature — the three topics (AI naming, contract type sub-classification, card UI overflow) have no prior specs. Architecture doc `database-schema.md` should be updated post-execution to reflect the new `contract_type` column.

---

## Tasks

- [ ] **Task 1 — DB migration + types + constants**
- [ ] **Task 2 — Extend Claude extraction (contract_type + suggested_name)**
- [ ] **Task 3 — Processing pipeline: write name, contract_type, contracting parties**
- [ ] **Task 4 — PATCH API + metadata display + new contract form (manual editing)**
- [ ] **Task 5 — Card UI fixes: truncation + contract_type badge**
- [ ] **Task 6 — Retroactive admin endpoint + trigger UI**

---

## Task 1 — DB migration + types + constants

**Description**
Add the `contract_type TEXT` column to the `documents` table via the established `try/catch ALTER TABLE ADD COLUMN` migration pattern in `lib/db.js`. Update both allowlists and the `getContractsWithSummaries` SELECT. Add the TypeScript type field and the `CONTRACT_TYPES` constant for use in dropdowns.

**Files**

| File | Change |
|------|--------|
| `lib/db.js` | Add migration for `contract_type TEXT`; add `"contract_type"` to both `updateDocumentMetadata` and `updateContractMetadata` allowlists; add `"name"` to `updateDocumentMetadata` allowlist; add `d.contract_type` to `getContractsWithSummaries` SELECT (both org and non-org variants) |
| `src/lib/types.ts` | Add `contract_type: string \| null` to `Contract` and `Document` interfaces |
| `src/lib/constants.ts` | Add `CONTRACT_TYPES` constant array with the 9 values defined above |

**Success criteria**
- TypeScript compiles without errors after changes
- `contract_type` column exists in the SQLite `documents` table after `ensureDb()` runs
- `CONTRACT_TYPES` is importable from constants
- `getContractsWithSummaries` returns `contract_type` in each row

**Dependencies**
None — must be completed before Tasks 2–6.

---

## Task 2 — Extend Claude extraction (contract_type + suggested_name)

**Description**
Extend the `extractContractTerms` function in `lib/contracts.js` to extract two new fields:
- `contract_type`: one of the 9 enum values (Claude selects the best fit)
- `suggested_name`: a clean human-readable contract name in the format `"CompanyA — CompanyB"` where Claude uses full context to identify the two main contracting parties

Both fields should be added to the system prompt JSON schema and parsed in the response normalization block. Provide safe fallbacks: `contract_type` defaults to `"other"`, `suggested_name` defaults to `null` (so the pipeline can fall back to the original filename).

**Files**

| File | Change |
|------|--------|
| `lib/contracts.js` | Add `contract_type` and `suggested_name` to the Claude system prompt JSON schema; add them to the `parsed` normalization block with defaults; include them in the returned object |

**System prompt additions**

Add to the top-level JSON schema:
```json
"contract_type": "vendor|b2b|employment|nda|lease|licensing|partnership|framework|other",
"suggested_name": "Short descriptive name: 'CompanyA — CompanyB' using the two main contracting parties. Use legal entity names (not abbreviations). Max 60 characters."
```

Add to the CRITICAL RULES section:
```
- contract_type: classify the contract into exactly one of: vendor, b2b, employment, nda, lease, licensing, partnership, framework, other.
- suggested_name: format as "Party1 — Party2" using the two main contracting parties' full names. If only one party is identifiable, use just that party's name.
```

**Success criteria**
- `extractContractTerms` returns `{ ..., contract_type: string, suggested_name: string | null }`
- `contract_type` is always a non-null string
- `suggested_name` follows the "CompanyA — CompanyB" format for contracts with two clearly identifiable parties
- Fallback to `"other"` / `null` when Claude response is missing or malformed

**Dependencies**
Task 1 (constants, to know the valid enum values).

---

## Task 3 — Processing pipeline: write name, contract_type, contracting parties

**Description**
Update `src/app/api/documents/[id]/process/route.ts` to write the new fields extracted in Task 2 into the database after `contractResult = await extractContractTerms(text)` returns.

Specifically, inside the `if (isContract)` block, after the existing `updateDocumentMetadata` call for `metadata_json` (parties/dates), add another call that writes:
- `name`: `contractResult.suggested_name` if non-null, otherwise keep the original filename
- `contract_type`: `contractResult.contract_type`
- `contracting_company`: first party from `contractResult.parties[0]` if available and `contracting_company` not already set manually
- `contracting_vendor`: second party from `contractResult.parties[1]` if available and `contracting_vendor` not already set manually

Only overwrite `contracting_company`/`contracting_vendor` if they are currently null (don't clobber manually entered values on reprocessing).

**Files**

| File | Change |
|------|--------|
| `src/app/api/documents/[id]/process/route.ts` | After `contractResult` returned, call `updateDocumentMetadata` with `name`, `contract_type`, `contracting_company` (if null), `contracting_vendor` (if null) |

**Success criteria**
- Uploading a new contract via AI path results in: name set to "CompanyA — CompanyB" format, `contract_type` set correctly, `contracting_company`/`contracting_vendor` populated from parties
- Reprocessing a contract with manually-entered `contracting_company` does not overwrite it
- If `suggested_name` is null (Claude didn't return one), the original filename is preserved

**Dependencies**
Tasks 1 and 2.

---

## Task 4 — PATCH API + metadata display + new contract form (manual editing)

**Description**
Wire `contract_type` through the manual editing path so users can view and change it:

1. **PATCH route** (`/api/contracts/[id]/route.ts`): destructure `contract_type` from the request body and pass it to `updateContractMetadata`.
2. **ContractMetadataDisplay** (`contract-metadata-display.tsx`): add `contract_type` to the `form` state; add a `<select>` using `CONTRACT_TYPES` in edit mode; display the human-readable label (not raw key) in view mode.
3. **ContractsNewForm** (`ContractsNewForm.tsx`): add a `contractType` state field and a `<select>` in the contract details section; include it in the PATCH payload.

**Files**

| File | Change |
|------|--------|
| `src/app/api/contracts/[id]/route.ts` | Destructure `contract_type` from body; add to metadata object passed to `updateContractMetadata` |
| `src/components/contracts/contract-metadata-display.tsx` | Add `contract_type` to form state + edit `<select>` + view label |
| `src/app/(app)/contracts/list/new/ContractsNewForm.tsx` | Add `contractType` state + `<select>` in form + include in PATCH payload |

**Success criteria**
- Opening the metadata edit panel on a contract shows the current `contract_type` in a dropdown
- Saving updates the value in the database
- The new-contract manual form includes a contract type dropdown
- View mode shows the human-readable label (e.g. "NDA / Confidentiality Agreement", not "nda")

**Dependencies**
Task 1.

---

## Task 5 — Card UI fixes: truncation + contract_type badge

**Description**
Fix the overflowing contract name in the collapsed card header and add the contract type as a small badge.

**Changes in `contract-card.tsx`:**

1. **Truncation fix**: the name `<h3>` at line 142 needs `truncate` (single-line ellipsis). The flex ancestor chain (`div.flex items-start gap-3 flex-1` at line 129 and `div.flex-1` at line 140) needs `min-w-0` to allow flex children to shrink properly. The vendor subtitle at line 148 also needs `truncate`.

2. **Contract type badge**: add a small secondary badge next to the status badge showing the contract type (human-readable label). Use a neutral style (e.g. `bg-muted text-muted-foreground`) to distinguish it from the status badge. Only show if `contract.contract_type` is non-null.

**Files**

| File | Change |
|------|--------|
| `src/components/contracts/contract-card.tsx` | Add `min-w-0` to flex parents (lines 129, 140); add `truncate` to `<h3>` (line 142) and vendor subtitle (line 148); add contract type badge after status badge |

**Success criteria**
- A contract with a long name shows truncated with ellipsis in the card header without overlapping the status badge
- The vendor/expiry subtitle line also truncates cleanly
- Contracts with a `contract_type` show a small type badge in the collapsed header
- Contracts without a type show no badge (graceful absence)

**Dependencies**
Task 1 (for `contract_type` on the `Contract` type).

---

## Task 6 — Retroactive admin endpoint + trigger UI

**Description**
Allow existing contracts to be retroactively named and classified without re-running the full processing pipeline.

**Endpoint** `POST /api/admin/backfill-contract-types`:
- Auth: superAdmin or orgAdmin only
- Org-scoped: processes only contracts belonging to the caller's org
- For each contract in the org:
  - **Name**: if `contracting_company` and `contracting_vendor` are already set, derive name from them (no LLM call). If only one is set, use that. If neither, use `metadata_json.parties` if present.
  - **contract_type**: run a lightweight Claude call with a short classification-only prompt using the stored `full_text` (skip if no `full_text`)
  - Write updated `name` and `contract_type` via `updateContractMetadata`
- Returns a summary: `{ processed: N, named: N, classified: N, skipped: N }`

**Lightweight classification prompt** (no obligation extraction):
```
Classify this contract. Return only JSON: {"contract_type": "vendor|b2b|employment|nda|lease|licensing|partnership|framework|other", "suggested_name": "CompanyA — CompanyB"}
```

**UI trigger**: add a "Backfill contract names & types" button in the existing admin/settings area (wherever org admin actions live). Show a loading state and display the result summary on completion.

**Files**

| File | Change |
|------|--------|
| `src/app/api/admin/backfill-contract-types/route.ts` | New file — POST handler with the logic above |
| Admin UI file (check existing admin area location) | Add trigger button + result display |

**Success criteria**
- POST to the endpoint returns a summary object
- Contracts with known party data get names derived from existing DB fields (no LLM cost)
- Contracts with `full_text` get a `contract_type` assigned via the lightweight prompt
- Contracts already named in the new format (containing "—") are skipped to avoid double-processing
- Only superAdmin or orgAdmin can trigger the endpoint

**Dependencies**
Tasks 1 and 2 (for the classification prompt and allowlist).

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Claude misidentifies "our company" vs counterparty in naming | Name is always manually editable; retroactive endpoint can re-run |
| Long party names exceed 60 char limit in suggested_name | Claude instructed to use max 60 chars; UI truncates the rest |
| Retroactive endpoint LLM cost for large orgs | Endpoint skips contracts without `full_text`; skips already-named contracts; returns cost-visible summary |
| `updateDocumentMetadata` `name` field not in current allowlist | Task 1 adds it explicitly |
| Reprocessing overwrites manually set party names | Task 3 only writes `contracting_company`/`contracting_vendor` when currently null |
