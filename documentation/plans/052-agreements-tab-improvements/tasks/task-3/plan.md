# Task 3 — Processing Pipeline: write name, contract_type, contracting parties

## Summary

After `extractContractTerms(text)` returns `contractResult`, add a single `updateDocumentMetadata` call inside the `if (isContract)` block that persists the new AI-extracted fields to the database.

## Location

File: `src/app/api/documents/[id]/process/route.ts`
Insert point: line 204, immediately after the existing `updateDocumentMetadata(documentId, { metadata_json: ... })` call.

## Change

Add the following block after line 204:

```typescript
        // Write AI-extracted contract fields: name, type, parties
        const contractFieldsUpdate: Record<string, unknown> = {
          contract_type: contractResult.contract_type,
        };

        // Only set name if AI suggested one
        if (contractResult.suggested_name) {
          contractFieldsUpdate.name = contractResult.suggested_name;
        }

        // Only populate contracting_company/vendor if currently null in DB
        if (contractResult.parties && contractResult.parties.length > 0 && !taggedDoc.contracting_company) {
          contractFieldsUpdate.contracting_company = contractResult.parties[0];
        }
        if (contractResult.parties && contractResult.parties.length > 1 && !taggedDoc.contracting_vendor) {
          contractFieldsUpdate.contracting_vendor = contractResult.parties[1];
        }

        updateDocumentMetadata(documentId, contractFieldsUpdate);
```

## Key Design Decisions

1. **Single `updateDocumentMetadata` call** — builds up the update object conditionally, then calls once (efficient, atomic).
2. **`taggedDoc` is the source of truth for null checks** — fetched at line 176 before the contract block, reflects current DB state including any manual edits.
3. **`contract_type` always written** — AI classification is always set/overwritten (it's an AI-derived field, not manually guarded).
4. **`name` only written when `suggested_name` is non-null** — preserves original filename as fallback.
5. **`contracting_company`/`contracting_vendor` guarded by null check** — never overwrites manually-entered values on reprocessing.

## Verification

- `updateDocumentMetadata` allowlist at lib/db.js:1365 already includes `name`, `contract_type`, `contracting_company`, `contracting_vendor` (confirmed by reading the file).
- `taggedDoc` is available in scope (fetched at line 176).
- `contractResult` is available in scope (assigned at line 195).
