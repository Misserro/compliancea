## Task 2 Complete -- Category system with 4 typed categories, DB columns, creation form

### Files Modified (6 files)

- **`lib/db.js`** -- Added 8 new ALTER TABLE migrations for category-specific columns (payment_amount, payment_currency, reporting_frequency, reporting_recipient, compliance_regulatory_body, compliance_jurisdiction, operational_service_type, operational_sla_metric). Updated `insertObligation` to accept and insert 8 new parameters. Updated `updateObligation` allowedFields with 8 new column names. Updated `spawnDueObligations` to propagate all 8 category-specific fields to child obligations.

- **`src/lib/types.ts`** -- Added 8 new fields to the `Obligation` interface: `payment_amount`, `payment_currency`, `reporting_frequency`, `reporting_recipient`, `compliance_regulatory_body`, `compliance_jurisdiction`, `operational_service_type`, `operational_sla_metric` (all `type | null`).

- **`src/lib/constants.ts`** -- Replaced `OBLIGATION_CATEGORIES` values from `["payments", "termination", "legal", "others"]` to `["payment", "reporting", "compliance", "operational"]`. Reversed `CATEGORY_MIGRATION_MAP` direction to map legacy categories to new ones (e.g., `payments -> payment`, `termination -> operational`). Updated `CATEGORY_COLORS` and `CATEGORY_BORDER_COLORS` with new primary keys (payment=purple, reporting=amber, compliance=cyan, operational=green) while keeping all legacy keys. Added `REPORTING_FREQUENCIES = ['monthly', 'quarterly', 'annually', 'ad-hoc']`.

- **`src/app/api/obligations/[id]/route.ts`** -- Added 8 new fields to the PATCH allowlist.

- **`src/app/api/documents/[id]/obligations/route.ts`** -- Added 8 new fields from request body to `insertObligation` call in POST handler.

- **`src/app/(app)/contracts/new/ContractsNewForm.tsx`** -- Added 8 new fields to `ObligationDraft` interface and `makeObligation()`. Redesigned `ObligationFormCard`: Category select is now the first field (required). Category-specific fields render conditionally below core fields (payment: Amount+Currency, reporting: Frequency+Recipient, compliance: RegulatoryBody+Jurisdiction, operational: ServiceType+SLAMetric). Core fields: Title, Due Date, Start Date, Owner, Description. Updated form submission to parse `paymentAmount` as float. Imported `INVOICE_CURRENCIES` and `REPORTING_FREQUENCIES`.

### No changes needed

- **`lib/db.d.ts`** -- All functions use `...args: any[]` signatures, so no changes needed for the 8 new params.
- **`src/lib/db-imports.ts`** -- Already re-exports `insertObligation` and `updateObligation`, no changes needed.

### INTEGRATION notes for Task 3

- The `Obligation` type now has 8 new category-specific fields -- Task 3 card redesign should display them in the expanded section based on the `category` value.
- `CATEGORY_MIGRATION_MAP` now maps old -> new (direction reversed from previous). Any UI code using this map for display should apply it as: `const displayCategory = CATEGORY_MIGRATION_MAP[ob.category] || ob.category`.
- `REPORTING_FREQUENCIES` is exported from constants for any UI that needs to display frequency labels.

### Build verification

`npm run build` passes with no TypeScript errors.
