# Task 2 Implementation Plan: Category System

## Overview
Replace the current 4-category system (payments/termination/legal/others) with a new 4-category system (payment/reporting/compliance/operational), each with typed DB columns. Redesign the obligation creation form with category-first flow showing category-specific fields.

## Files to Modify (7 files)

### 1. `lib/db.js` — DB migrations + insertObligation + updateObligation

**Migration block** (after line 332, after existing `obMigrationCols` loop):
- Add new migration array `obCategorySpecificCols` with 8 columns:
  - `payment_amount REAL`
  - `payment_currency TEXT DEFAULT 'EUR'`
  - `reporting_frequency TEXT`
  - `reporting_recipient TEXT`
  - `compliance_regulatory_body TEXT`
  - `compliance_jurisdiction TEXT`
  - `operational_service_type TEXT`
  - `operational_sla_metric TEXT`
- Use same try/catch ALTER TABLE pattern as existing migrations

**`insertObligation` (~line 1025):**
- Add 8 new parameters to destructuring: `paymentAmount`, `paymentCurrency`, `reportingFrequency`, `reportingRecipient`, `complianceRegulatoryBody`, `complianceJurisdiction`, `operationalServiceType`, `operationalSlaMetric`
- Add 8 new columns to INSERT statement and 8 new placeholders
- Add 8 new values to params array (using `|| null` pattern, except `paymentCurrency` which defaults to `'EUR'` if amount is set)

**`updateObligation` (~line 1103):**
- Add 8 new field names to `allowedFields` array

**`spawnDueObligations` (~line 1063):**
- Pass 8 new fields through when spawning child obligations (read from `ob.*` columns)

### 2. `lib/db.d.ts` — Type declarations
- No signature changes needed (all functions use `...args: any[]`) — existing pattern handles this

### 3. `src/lib/types.ts` — Obligation interface
- Add 8 new optional fields after `parent_obligation_id`:
  - `payment_amount?: number | null`
  - `payment_currency?: string | null`
  - `reporting_frequency?: string | null`
  - `reporting_recipient?: string | null`
  - `compliance_regulatory_body?: string | null`
  - `compliance_jurisdiction?: string | null`
  - `operational_service_type?: string | null`
  - `operational_sla_metric?: string | null`

### 4. `src/lib/constants.ts` — Categories, colors, migration map
- Replace `OBLIGATION_CATEGORIES = ["payments", "termination", "legal", "others"]` with `["payment", "reporting", "compliance", "operational"]`
- Update `CATEGORY_MIGRATION_MAP`:
  - New direction: legacy -> new (was new -> old)
  - Add: `payments -> payment`, `termination -> operational`, `legal -> compliance`, `others -> operational`
  - Keep existing legacy entries but remap to new targets: `renewal -> operational`, `reporting -> reporting`, `compliance -> compliance`, `confidentiality -> compliance`, `insurance -> compliance`, `indemnification -> compliance`, `delivery -> operational`, `other -> operational`, `payment -> payment`
- Update `CATEGORY_COLORS`: new primary keys are `payment`, `reporting`, `compliance`, `operational`
  - payment: purple (reuse payments color)
  - reporting: amber
  - compliance: cyan (reuse legal color)
  - operational: green
  - Keep all legacy keys for backward compat
- Update `CATEGORY_BORDER_COLORS` similarly
- Add: `export const REPORTING_FREQUENCIES = ['monthly', 'quarterly', 'annually', 'ad-hoc'] as const`

### 5. `src/app/api/obligations/[id]/route.ts` — PATCH allowlist
- Add 8 new fields to `allowed` array: `payment_amount`, `payment_currency`, `reporting_frequency`, `reporting_recipient`, `compliance_regulatory_body`, `compliance_jurisdiction`, `operational_service_type`, `operational_sla_metric`

### 6. `src/app/api/documents/[id]/obligations/route.ts` — POST handler
- Extract 8 new fields from `body` and pass to `insertObligation` call

### 7. `src/app/(app)/contracts/new/ContractsNewForm.tsx` — Creation form
- Update `ObligationDraft` interface: add 8 new optional fields (camelCase)
- Update `makeObligation()`: initialize new fields as empty strings/defaults
- Redesign `ObligationFormCard`:
  - Category select is FIRST field (required, no blank option — or prompt with "Choose a category")
  - Core fields: Title*, Due Date, Start Date, Owner, Description
  - Category-specific fields rendered conditionally based on selected category:
    - payment: Amount (number) + Currency (select from INVOICE_CURRENCIES)
    - reporting: Frequency (select from REPORTING_FREQUENCIES) + Recipient (text)
    - compliance: Regulatory Body (text) + Jurisdiction (text)
    - operational: Service Type (text) + SLA Metric (text)
  - Repeating section unchanged
- Update form submission to include new fields in POST payload
- Import `INVOICE_CURRENCIES`, `REPORTING_FREQUENCIES` from constants

## Success Criteria Verification
1. Creating obligation with category "payment" -> shows amount+currency fields -> saves to `payment_amount`/`payment_currency` columns
2. Creating with "reporting" -> shows frequency+recipient -> saves to columns
3. Creating with "compliance" -> shows regulatory_body+jurisdiction -> saves to columns
4. Creating with "operational" -> shows service_type+sla_metric -> saves to columns
5. Existing obligations with old categories render correctly via migration map
6. PATCH with `{ payment_amount: 5000 }` updates the field
7. `npm run build` passes

## Risks
- spawnDueObligations must propagate new fields to child obligations — will add all 8 fields
- CATEGORY_MIGRATION_MAP direction is reversed (old code mapped new->old, now must map old->new) — need to ensure all consumers handle this correctly
