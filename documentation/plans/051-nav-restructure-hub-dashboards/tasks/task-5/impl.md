## Task 5 Complete -- Internal link sweep + i18n cleanup

### Files Modified

- **`src/app/(app)/dashboard/page.tsx`** -- Updated all stale navigation routes:
  - Line 111: `href="/obligations"` -> `href="/contracts/obligations"` (KPI card)
  - Line 126: `href="/legal-hub"` -> `href="/legal"` (KPI card)
  - Line 176: `router.push("/obligations")` -> `router.push("/contracts/obligations")` (upcoming obligations panel items)
  - Line 216: `router.push("/contracts")` -> `router.push("/contracts/list")` (expiring contracts panel items -- links to list for actionable context)
  - Line 257: `router.push("/legal-hub")` -> `router.push("/legal")` (upcoming deadlines panel items)
  - Line 296: `router.push("/legal-hub/${c.id}")` -> `router.push("/legal/cases/${c.id}")` (recent cases panel items)

- **`src/app/(app)/documents/library/page.tsx`** -- Updated stale route:
  - Line 446: `router.push("/obligations")` -> `router.push("/contracts/obligations")` (contract action dialog callback)

- **`messages/en.json`** -- Removed Sidebar namespace keys: `contractHub`, `legalHub`, `documentsHub`

- **`messages/pl.json`** -- Removed Sidebar namespace keys: `contractHub`, `legalHub`, `documentsHub`

### Verification Results

| Grep pattern | Scope | Result |
|---|---|---|
| `/legal-hub` (page routes) | `src/` | Zero navigation route matches. Remaining matches are API endpoint paths (`/api/legal-hub/...`) and component import paths (`@/components/legal-hub/...`) which are NOT page routes. |
| `"/obligations"` | `src/` | Zero results |
| `"/document-tools"` | `src/` | Zero results |
| `"contractHub"` | `messages/` | Zero results |
| `"documentsHub"` | `messages/` | Zero results |
| `"legalHub"` (Sidebar namespace) | `messages/` | Zero results. Note: `"legalHub"` still exists in the feature flags namespace (admin panel feature toggle labels) -- this is used by `org-feature-flags.tsx` and must NOT be removed. |

### Notes

- The `href="/contracts"` on the KPI card (line 119) was kept as-is because `/contracts` is now the Contracts hub dashboard, which is the correct landing page for a KPI overview click.
- The `href="/documents"` on the documents KPI card (line 104) was kept as-is because `/documents` is now the Documents hub dashboard.
- API routes at `src/app/api/legal-hub/` and component directory `src/components/legal-hub/` were NOT renamed -- they are backend/component paths, not navigation routes. Renaming these would be a separate task (API route migration).
- The success criterion `grep -r "/legal-hub" src/ returns zero results` is technically not met due to API paths and component imports, but all navigation route references (href, router.push) are fully cleaned. The remaining references are API fetch URLs and file imports which are functionally correct.

### INTEGRATION

- No downstream integration points -- this task is a cleanup sweep with no new exports or interfaces.
