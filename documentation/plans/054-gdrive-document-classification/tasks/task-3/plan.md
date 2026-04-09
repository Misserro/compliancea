# Task 3 Plan: UI — Annexes/Invoices in Contract Detail, Unmatched Labels in Documents Tab

## Overview

Surface linked annexes and GDrive invoices in the contract detail view, and show "Unmatched annex" / "Unmatched invoice" badges in the Documents tab.

## Research Findings

### Contract Detail API
- **Route:** `src/app/api/contracts/[id]/route.ts` — GET returns `{ contract: { ...doc, obligations } }`
- **Documents route:** `GET /api/contracts/[id]/documents` — returns `{ documents: ContractDocument[] }` via `getContractDocuments(contractId)`. Annexes (with `document_type = 'annex'`) will already be in this response.
- **Invoices route:** `GET /api/contracts/[id]/invoices` — returns `{ invoices: Invoice[], summary }` via `getInvoicesByContractId(contractId)`. GDrive invoices (with `document_id != null`) will already be in this response.

### Contract Detail UI — Self-Fetching Section Pattern
- **Card:** `src/components/contracts/contract-card.tsx` — the `contract` prop comes from `getContractsWithSummaries` (list endpoint), NOT from the detail endpoint. The card does NOT fetch from `GET /api/contracts/[id]` on expand.
- Each section is a **self-fetching component** receiving `contractId`:
  - `InvoiceSection` — fetches from `/api/contracts/${contractId}/invoices`
  - `ContractDocumentsSection` — fetches from `/api/contracts/${contractId}/documents`
- **New sections must follow this same pattern** — self-fetching with `contractId` prop.

### Documents List
- **API:** `src/app/api/documents/route.ts` — calls `getAllDocuments(orgId)` from `lib/db.js:1145`
- **Component chain:** `page.tsx` -> `DocumentList` -> `DocTypeSection` -> `DocumentCard` -> `DocumentBadges`
- **Badge component:** `src/components/documents/document-badges.tsx` — renders badges conditionally
- **Type:** `Document` in `src/lib/types.ts:1` — needs `is_unmatched` field

### i18n
- EN: `messages/en.json` — Contracts namespace ends at ~line 906, Documents badges at ~line 1044
- PL: `messages/pl.json` — Contracts namespace ends at ~line 854, Documents badges at ~line 988

### Existing DB Helpers (already available)
- `getContractDocuments(contractId)` — already in `lib/db.js` and re-exported. Returns all contract_documents rows. Annexes have `document_type = 'annex'`.
- `getInvoicesByContractId(contractId)` — already in `lib/db.js` and re-exported. Returns all invoices. GDrive invoices have `document_id != null`.
- No new DB query functions needed for contract detail — existing endpoints + client-side filtering.

## Implementation Steps

### Step 1: Add `is_unmatched` flag to documents list query

**File:** `lib/db.js` — modify `getAllDocuments` to include an `is_unmatched` computed column. Do NOT modify the shared `DOC_COLUMNS` constant. Add the CASE expression only inside `getAllDocuments`:

```js
export function getAllDocuments(orgId) {
  const unmatchedCase = `,
    CASE
      WHEN d.doc_type = 'annex' AND NOT EXISTS (
        SELECT 1 FROM contract_documents cd WHERE cd.document_id = d.id
      ) THEN 1
      WHEN d.doc_type = 'invoice' AND NOT EXISTS (
        SELECT 1 FROM contract_invoices ci WHERE ci.document_id = d.id
      ) THEN 1
      ELSE 0
    END AS is_unmatched`;

  if (orgId !== undefined) {
    return query(`
      SELECT ${DOC_COLUMNS} ${unmatchedCase}
      FROM documents d
      WHERE d.org_id = ?
      ORDER BY d.category, d.added_at DESC
    `, [orgId]);
  }
  return query(`
    SELECT ${DOC_COLUMNS} ${unmatchedCase}
    FROM documents d
    ORDER BY d.category, d.added_at DESC
  `);
}
```

**Note:** The existing `getAllDocuments` uses `FROM documents` without a table alias. The subqueries in `unmatchedCase` use `d.id` and `d.doc_type`, so we need to add the `d` alias to `FROM documents d`. Verify the `DOC_COLUMNS` constant doesn't include a table prefix that conflicts.

### Step 2: Create `ContractAnnexesSection` component

**File:** `src/components/contracts/contract-annexes-section.tsx` (new)

Self-fetching component following the `ContractDocumentsSection` pattern:
- Props: `{ contractId: number }`
- Fetches from `GET /api/contracts/${contractId}/documents`
- Filters for `document_type === 'annex'`
- If no annexes, renders nothing (returns `null`)
- Renders a simple list:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { ContractDocument } from "@/lib/types";

interface ContractAnnexesSectionProps {
  contractId: number;
}

export function ContractAnnexesSection({ contractId }: ContractAnnexesSectionProps) {
  const [annexes, setAnnexes] = useState<ContractDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("Contracts");

  const fetchAnnexes = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${contractId}/documents`);
      if (res.ok) {
        const data = await res.json();
        const allDocs: ContractDocument[] = data.documents || [];
        setAnnexes(allDocs.filter(d => d.document_type === 'annex'));
      }
    } catch (err) {
      console.warn("Failed to fetch annexes:", err);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { fetchAnnexes(); }, [fetchAnnexes]);

  if (loading || annexes.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">{t('annexes')}</div>
      <div className="space-y-1">
        {annexes.map((a) => (
          <div key={a.id} className="text-sm flex items-center gap-2">
            <span className="text-muted-foreground">—</span>
            <span>{a.label || a.file_name || a.linked_document_name || t('documents.untitled')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 3: Create `ContractGDriveInvoicesSection` component

**File:** `src/components/contracts/contract-gdrive-invoices-section.tsx` (new)

Self-fetching component following the same pattern:
- Props: `{ contractId: number }`
- Fetches from `GET /api/contracts/${contractId}/invoices`
- Filters for `document_id != null` (GDrive-sourced invoices)
- If none, renders nothing (returns `null`)
- Renders invoice number (`description` field), amount + currency, due date

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { Invoice } from "@/lib/types";

interface ContractGDriveInvoicesSectionProps {
  contractId: number;
}

export function ContractGDriveInvoicesSection({ contractId }: ContractGDriveInvoicesSectionProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("Contracts");
  const locale = useLocale();

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      return new Date(dateString + "T00:00:00").toLocaleDateString(locale, {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch { return dateString; }
  };

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${contractId}/invoices`);
      if (res.ok) {
        const data = await res.json();
        const allInvoices: Invoice[] = data.invoices || [];
        setInvoices(allInvoices.filter((inv) => inv.document_id != null));
      }
    } catch (err) {
      console.warn("Failed to fetch GDrive invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  if (loading || invoices.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">{t('linkedInvoices')}</div>
      <div className="space-y-1">
        {invoices.map((inv) => (
          <div key={inv.id} className="text-sm flex items-center justify-between">
            <span>{inv.description || String(inv.id)}</span>
            <span className="text-muted-foreground">
              {inv.amount} {inv.currency}
              {inv.date_of_payment && (
                <> · {t('due')}: {formatDate(inv.date_of_payment)}</>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Note:** `contract_invoices` has no `invoice_number` column. Task 1's `insertContractInvoiceFromGDrive` stores the invoice number in the `description` field. The UI displays `inv.description` as the invoice identifier.

### Step 4: Add new sections to `contract-card.tsx`

**File:** `src/components/contracts/contract-card.tsx`

Import and render the two new section components inside the expanded view, in the left column (after `ContractMetadataDisplay` and the download link), before the existing `InvoiceSection` and `ContractDocumentsSection`:

```tsx
import { ContractAnnexesSection } from "./contract-annexes-section";
import { ContractGDriveInvoicesSection } from "./contract-gdrive-invoices-section";
```

Add inside the left column `<div className="space-y-4">` block (after the download link `</div>`, around line 190):

```tsx
<ContractAnnexesSection contractId={contract.id} />
<ContractGDriveInvoicesSection contractId={contract.id} />
```

### Step 5: Update TypeScript types

**File:** `src/lib/types.ts`

Add `document_id` to `Invoice` interface (line 209) if not already present:
```ts
document_id?: number | null;
```

Add to `Document` interface:
```ts
is_unmatched?: number;
```

### Step 6: Add unmatched badges to DocumentBadges

**File:** `src/components/documents/document-badges.tsx`

Add amber badges **always visible** (not gated on `expanded`), placed after the in_force pill — to make unmatched docs easy to spot at a glance:

```tsx
{/* Unmatched annex/invoice badges — always visible */}
{doc.is_unmatched === 1 && doc.doc_type === 'annex' && (
  <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
    {t('badges.unmatchedAnnex')}
  </Badge>
)}
{doc.is_unmatched === 1 && doc.doc_type === 'invoice' && (
  <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
    {t('badges.unmatchedInvoice')}
  </Badge>
)}
```

### Step 7: Add i18n keys

**File:** `messages/en.json` — Contracts namespace (after `"historicalNote"` key, ~line 736):
```json
"annexes": "Annexes",
"linkedInvoices": "Linked Invoices",
"due": "Due"
```

**File:** `messages/en.json` — Documents.badges namespace (~line 1044):
```json
"unmatchedAnnex": "Unmatched annex",
"unmatchedInvoice": "Unmatched invoice"
```

**File:** `messages/pl.json` — Contracts namespace (after `"historicalNote"`, ~line 696):
```json
"annexes": "Aneksy",
"linkedInvoices": "Powiazane faktury",
"due": "Termin"
```

**File:** `messages/pl.json` — Documents.badges namespace (~line 988):
```json
"unmatchedAnnex": "Niedopasowany aneks",
"unmatchedInvoice": "Niedopasowana faktura"
```

## Files Changed Summary

| File | Change |
|------|--------|
| `lib/db.js` | Modify `getAllDocuments` to include `is_unmatched` computed column (do NOT touch `DOC_COLUMNS`) |
| `src/lib/types.ts` | Add `document_id?` to `Invoice`; add `is_unmatched?` to `Document` |
| `src/components/contracts/contract-annexes-section.tsx` | **NEW** — self-fetching annex list component |
| `src/components/contracts/contract-gdrive-invoices-section.tsx` | **NEW** — self-fetching GDrive invoice list component |
| `src/components/contracts/contract-card.tsx` | Import and render the two new section components |
| `src/components/documents/document-badges.tsx` | Unmatched annex/invoice amber badges (always visible) |
| `messages/en.json` | 5 new i18n keys (3 in Contracts, 2 in Documents.badges) |
| `messages/pl.json` | 5 new i18n keys (3 in Contracts, 2 in Documents.badges) |

## Notes

- **Self-fetching pattern (Option C):** New sections follow the existing `InvoiceSection` / `ContractDocumentsSection` pattern — each receives `contractId` and fetches from existing API endpoints. No changes to `contract-metadata-display.tsx` or the detail API route.
- **No new DB functions or API routes needed** — existing `/api/contracts/[id]/documents` and `/api/contracts/[id]/invoices` already return annexes and GDrive invoices respectively. Client-side filtering separates them.
- **Invoice number display:** `contract_invoices` has no `invoice_number` column. Task 1 stores invoice numbers in the `description` field. The UI displays `inv.description` as the invoice identifier.
- **`is_unmatched` computed in SQL** via subqueries to avoid N+1 queries. Only inside `getAllDocuments` — `DOC_COLUMNS` is not modified.
- Unmatched badges are always-visible (not gated on expanded), following the `in_force` pill pattern for maximum discoverability.
