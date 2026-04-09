# Task 6 — Retroactive Admin Endpoint + Trigger UI

## Overview

New `POST /api/admin/backfill-contract-types` endpoint that retroactively names and classifies existing contracts. A trigger button is added to the org settings page (`/settings/org`).

---

## Part A: API Endpoint

### File: `src/app/api/admin/backfill-contract-types/route.ts` (new)

**Auth pattern** (from `migrate-contract-hub/route.ts` + org-scoped auth from `contracts/[id]/route.ts`):
```ts
const session = await auth();
if (!session?.user) return 401;
const isSuperAdmin = session.user.isSuperAdmin;
const isOrgAdmin = session.user.orgRole === "owner" || session.user.orgRole === "admin";
if (!isSuperAdmin && !isOrgAdmin) return 403;
const orgId = Number(session.user.orgId);
```

**Logic:**
1. Fetch all contracts for the org via `getContractsWithSummaries(orgId)` — returns `id, name, contracting_company, contracting_vendor, contract_type` (no `full_text` or `metadata_json`).
2. For each contract, need `full_text` and `metadata_json` — fetch individually via `getDocumentById(id, orgId)` which uses `DOC_COLUMNS` (includes both fields).
3. **Skip check**: if name contains " — " (em dash) AND `contract_type` is already set, skip.
4. **Naming** (no LLM):
   - If `contracting_company` AND `contracting_vendor` set: `"${company} — ${vendor}"`
   - If only one set: use that as name
   - If neither: parse `metadata_json.parties` array (if present), use first two parties
   - If no parties available: leave name unchanged
5. **Classification** (lightweight Claude call):
   - Skip if no `full_text`
   - Truncate `full_text` to first 3000 words
   - Single Claude call: `"Classify this contract. Return only JSON: {\"contract_type\": \"vendor|b2b|employment|nda|lease|licensing|partnership|framework|other\", \"suggested_name\": \"CompanyA — CompanyB\"}"`
   - If Claude also returns `suggested_name` and we couldn't derive a name from DB fields, use it
   - Validate `contract_type` against `CONTRACT_TYPES` values; default to "other"
6. Write via `updateContractMetadata(id, { name, contract_type })` — only include fields that changed.
7. Return `{ processed, named, classified, skipped }`.

**Anthropic SDK usage** (follows `lib/contracts.js` pattern):
```ts
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```
Use `claude-sonnet-4-20250514` with `max_tokens: 200` for the lightweight call.

**Imports from `@/lib/db-imports`:**
- `getContractsWithSummaries` — list all contracts in org
- `getDocumentById` — get full_text + metadata_json per contract
- `updateContractMetadata` — write back name + contract_type

---

## Part B: UI Trigger

### File: `src/app/(app)/settings/org/page.tsx` (modify)

Add a new Card section (visible to `canEdit` users — owners/admins) after the Default Permissions card:

- Title: "Contract Data" with a Database icon
- "Backfill contract names & types" button
- Loading state while request is in flight
- On success: show result summary as a toast or inline text (`"Processed X contracts: Y named, Z classified, W skipped"`)
- On error: show error toast

No i18n keys needed — follow the pattern of other admin UI (hardcoded English is acceptable for admin-only features, matching the migrate-contract-hub pattern).

---

## Dependencies

- Task 1 (done): `contract_type` column, `CONTRACT_TYPES` constant, allowlists
- Task 2 (done): Claude extraction pattern reference
- `getDocumentById` and `getContractsWithSummaries` already exist and include needed fields

## Risks

- Large orgs: many sequential Claude calls. Mitigated by skipping contracts without `full_text` and already-processed ones.
- Claude rate limits: process sequentially (not parallel) to avoid rate limit errors.
