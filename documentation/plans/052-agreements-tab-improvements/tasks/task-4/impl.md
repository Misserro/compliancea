# Task 4 — Implementation Report

## Status: Complete

## Changes Made

### 1. PATCH route — `src/app/api/contracts/[id]/route.ts`
- Added `contract_type` to destructured body fields (line 98)
- Added `if (contract_type !== undefined) metadata.contract_type = contract_type;` (line 113)

### 2. ContractMetadataDisplay — `src/components/contracts/contract-metadata-display.tsx`
- Imported `CONTRACT_TYPES` from `@/lib/constants`
- Added `contract_type` to form state initialization and cancel reset
- Added `contract_type` to `handleSave` payload
- **Edit mode**: Added `<select>` dropdown using `CONTRACT_TYPES` with "-- select --" default, placed before signature date
- **View mode**: Added "Contract Type" row with human-readable label lookup via `CONTRACT_TYPES.find()`, falls back to em-dash when null

### 3. ContractsNewForm — `src/app/(app)/contracts/list/new/ContractsNewForm.tsx`
- Imported `CONTRACT_TYPES` from `@/lib/constants`
- Added `contractType` state (`useState("")`)
- Added `<select>` dropdown in Contract Details card, placed after vendor field
- Included `contract_type: contractType || undefined` in PATCH payload

### 4. i18n — `messages/en.json` and `messages/pl.json`
- Added `Contracts.metadata.contractType`: "Contract Type" (en) / "Typ umowy" (pl)

## Verification
- TypeScript compiles without new errors (only pre-existing `.next/types/validator.ts` cache issues)
- All changes follow existing patterns exactly
- Human-readable labels used in view mode (e.g. "NDA / Confidentiality Agreement" not "nda")
