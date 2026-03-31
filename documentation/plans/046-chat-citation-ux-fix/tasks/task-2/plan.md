# Task 2 Plan -- Sources footer + limitedEvidence UI rework

## Goal
Render `usedDocuments` as a "Sources:" / "Zrodla:" line at the bottom of each structured answer in `case-chat-panel.tsx`. Keep the `limitedEvidence` note when `confidence === "low"`. Add i18n keys.

## Files to Modify

### 1. `src/components/legal-hub/case-chat-panel.tsx`
- **Location:** Lines 271-278, inside the `msg.structuredAnswer` branch of the message rendering
- **Change:** Replace the single `confidence === "low"` block with two blocks:
  1. Sources list: conditionally rendered when `usedDocuments.length > 0`, showing `t('chat.sources')` followed by comma-joined document names
  2. Limited evidence note: conditionally rendered when `confidence === "low"` (same as before, but `mt-1` instead of `mt-2` since sources line may precede it)

### 2. `messages/en.json`
- **Location:** Inside `LegalHub.chat` object (line ~204, after `examplePrompt4`)
- **Change:** Add `"sources": "Sources:"` key

### 3. `messages/pl.json`
- **Location:** Inside `LegalHub.chat` object (line ~204, after `examplePrompt4`)
- **Change:** Add `"sources": "Zrodla:"` key (with proper Polish characters)

## Success Criteria Mapping
1. Document-grounded answers show "Zrodla: document-name.pdf" as small muted text -- satisfied by the `usedDocuments.length > 0` conditional rendering
2. Low confidence shows both sources + limited evidence -- satisfied by two independent conditional blocks
3. Metadata-only answers (no documents) show no sources line -- satisfied by the `length > 0` guard
4. i18n key `LegalHub.chat.sources` in both en.json and pl.json -- direct addition

## Risks
- None significant. The `usedDocuments` array is already populated in every `StructuredAnswer` response per the type definition. The change is purely presentational.
- `chatParseError` is a flat key under `LegalHub` (not nested under `chat`) -- we will not touch it.
