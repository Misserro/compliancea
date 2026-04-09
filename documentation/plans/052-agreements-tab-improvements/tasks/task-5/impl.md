# Task 5 Implementation — Card UI fixes: truncation + contract_type badge

## File changed

`src/components/contracts/contract-card.tsx`

## Changes

### 1. Import (line 8)
Added `CONTRACT_TYPES` to the existing constants import.

### 2. Truncation fix (lines 129, 140, 141, 142, 152)
- Line 129: Added `min-w-0` to outer flex container (`flex items-start gap-3 flex-1 min-w-0`)
- Line 140: Added `min-w-0` to inner flex-1 div (`flex-1 min-w-0`)
- Line 141: Replaced `flex-wrap` with `min-w-0` on the name/badge row so the h3 truncates instead of wrapping
- Line 142: Added `truncate` to `<h3>` for ellipsis on long names
- Line 152: Added `truncate` to vendor/expiry subtitle div

### 3. Contract type badge (lines 146-150)
- Conditionally rendered after the status badge when `contract.contract_type` is non-null
- Uses `bg-muted text-muted-foreground` neutral styling
- Looks up human-readable label from `CONTRACT_TYPES`; falls back to raw value
- `whitespace-nowrap` prevents badge text from breaking

### 4. Status badge (line 143)
- Added `whitespace-nowrap` to status badge to prevent it from breaking when space is tight

## Success criteria verification
- Long contract names truncate with ellipsis — `truncate` class on h3 with `min-w-0` chain
- Vendor/expiry subtitle truncates — `truncate` class on subtitle div
- Contract type badge shown when `contract_type` is non-null — conditional render
- No badge when `contract_type` is null — conditional render handles this
