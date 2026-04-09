# Task 2 — Implementation Plan

## Goal
Extend `extractContractTerms` in `lib/contracts.js` to return `contract_type` (9-value enum) and `suggested_name` ("CompanyA — CompanyB" format, max 60 chars).

## File: `lib/contracts.js`

### Change 1: System prompt JSON schema (line ~28)
Add two new top-level fields to the JSON schema shown in the system prompt, right after `"expiry_date"`:
```json
"contract_type": "vendor|b2b|employment|nda|lease|licensing|partnership|framework|other",
"suggested_name": "Short descriptive name: 'CompanyA — CompanyB' using the two main contracting parties. Use legal entity names (not abbreviations). Max 60 characters."
```

### Change 2: CRITICAL RULES section (line ~71)
Add two new rules after existing CRITICAL RULES entries:
```
- contract_type: classify the contract into exactly one of: vendor, b2b, employment, nda, lease, licensing, partnership, framework, other.
- suggested_name: format as "Party1 — Party2" using the two main contracting parties' full names. If only one party is identifiable, use just that party's name. Max 60 characters.
```

### Change 3: Error return fallback (line ~146)
Add to the error return object:
```js
contract_type: "other",
suggested_name: null,
```

### Change 4: Result normalization block (line ~156)
Add to the `result` object:
```js
contract_type: validContractTypes.includes(parsed.contract_type) ? parsed.contract_type : "other",
suggested_name: typeof parsed.suggested_name === "string" && parsed.suggested_name.trim().length > 0
  ? parsed.suggested_name.trim().slice(0, 60)
  : null,
```

Where `validContractTypes` is a local array: `["vendor", "b2b", "employment", "nda", "lease", "licensing", "partnership", "framework", "other"]` defined before the normalization block.

### Validation logic
- `contract_type`: Validated against the 9-value enum. Unrecognized values default to `"other"`. Always a non-null string.
- `suggested_name`: Must be a non-empty string after trimming. Truncated to 60 chars. Defaults to `null` if missing/empty/malformed.

### No other files changed
This task is scoped to `lib/contracts.js` only.
