# Task 5 Plan — Card UI fixes: truncation + contract_type badge

## Scope

Two changes in `src/components/contracts/contract-card.tsx`:

### 1. Truncation fix

**Problem:** Long contract names overflow the card header and overlap the status badge. The vendor/expiry subtitle can also overflow.

**Fix — 3 targeted class additions:**

| Line | Current classes | Add |
|------|----------------|-----|
| 129 | `flex items-start gap-3 flex-1` | `min-w-0` |
| 140 | `flex-1` | `min-w-0` |
| 142 | `font-semibold text-base` on `<h3>` | `truncate` |
| 148 | `text-sm text-muted-foreground` on vendor div | `truncate` |

**Why `min-w-0`:** Flex children default to `min-width: auto`, which prevents them from shrinking below their content width. Adding `min-w-0` to both flex ancestors allows the `truncate` (which applies `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) to take effect.

**Note on line 141 wrapper div:** The div at line 141 (`flex items-center gap-2 mb-1 flex-wrap`) currently has `flex-wrap`. With truncation on the `<h3>`, the name will truncate instead of wrapping. I will remove `flex-wrap` and add `min-w-0` so the h3 truncates properly while badges stay on the same line.

### 2. Contract type badge

**Location:** After the status badge `<span>` at line 143-145, inside the same flex container (line 141).

**Implementation:**

```tsx
{contract.contract_type && (
  <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap">
    {CONTRACT_TYPES.find(ct => ct.value === contract.contract_type)?.label ?? contract.contract_type}
  </span>
)}
```

- Import `CONTRACT_TYPES` from `@/lib/constants` (already imports `STATUS_COLORS` from there)
- Neutral styling (`bg-muted text-muted-foreground`) to visually distinguish from the colored status badge
- `whitespace-nowrap` on badges to prevent them from breaking across lines
- Lookup human-readable label; fallback to raw value if not found
- Only rendered when `contract.contract_type` is non-null

### 3. Import change

Add `CONTRACT_TYPES` to the existing import from `@/lib/constants`:

```tsx
import { STATUS_COLORS, CONTRACT_TYPES } from "@/lib/constants";
```

## Files changed

- `src/components/contracts/contract-card.tsx` (only file)

## No risks

- Pure CSS class additions for truncation — no logic changes
- Badge is conditionally rendered — contracts without `contract_type` are unaffected
- No new dependencies
