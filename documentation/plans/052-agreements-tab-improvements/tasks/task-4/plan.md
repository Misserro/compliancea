# Task 4 — PATCH API + metadata display + new contract form

## Overview

Wire `contract_type` through the manual editing path: PATCH API, metadata display component, and new contract form.

## Changes

### 1. PATCH route — `src/app/api/contracts/[id]/route.ts`

- Add `contract_type` to the destructured fields from `body` (line 94-104)
- Add `if (contract_type !== undefined) metadata.contract_type = contract_type;` alongside the existing fields (after line 110)

No other changes needed — `updateContractMetadata` allowlist already includes `contract_type` (added by Task 1).

### 2. ContractMetadataDisplay — `src/components/contracts/contract-metadata-display.tsx`

- Import `CONTRACT_TYPES` from `@/lib/constants`
- Add `contract_type: contract.contract_type || ""` to initial `form` state (line 19-25)
- Add `contract_type` to the `handleCancel` reset (line 59-65)
- Include `contract_type: form.contract_type || null` in `handleSave` payload (line 45-51)
- **Edit mode**: Add a `<select>` field using `CONTRACT_TYPES.map()` with an empty "-- select --" option, placed after the vendor field (follows existing grid layout)
- **View mode**: Add a row showing "Contract Type" label with the human-readable label looked up from `CONTRACT_TYPES`, falling back to em-dash if null
- Add i18n keys: `metadata.contractType` (en: "Contract Type", pl: "Typ umowy")

### 3. ContractsNewForm — `src/app/(app)/contracts/list/new/ContractsNewForm.tsx`

- Import `CONTRACT_TYPES` from `@/lib/constants` (already imports other constants)
- Add `const [contractType, setContractType] = useState("")` state
- Add a `<select>` dropdown in the Contract Details card grid, using `CONTRACT_TYPES.map()` with "-- select --" default
- Include `contract_type: contractType || undefined` in the PATCH payload body (line 264-275)

### 4. i18n — `messages/en.json` and `messages/pl.json`

Add to `Contracts.metadata`:
- en: `"contractType": "Contract Type"`
- pl: `"contractType": "Typ umowy"`

## Helper: label lookup

Both display components need to convert `"nda"` -> `"NDA / Confidentiality Agreement"`. Use inline lookup:
```ts
CONTRACT_TYPES.find(t => t.value === contract.contract_type)?.label ?? contract.contract_type ?? "—"
```

## Risk

- None significant. `CONTRACT_TYPES` constant and `contract_type` DB column already exist from Task 1.
- The PATCH handler already has the pattern for optional fields — we follow it exactly.
