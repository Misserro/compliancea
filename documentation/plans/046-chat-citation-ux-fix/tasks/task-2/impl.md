# Task 2 Implementation -- Sources footer + limitedEvidence UI rework

## Changes Made

### 1. `src/components/legal-hub/case-chat-panel.tsx` (modified, lines 272-282)
- Added sources footer: when `msg.structuredAnswer.usedDocuments.length > 0`, renders a `<p>` with `text-xs text-muted-foreground mt-2` showing `t('chat.sources')` followed by comma-joined document names
- Kept limited-evidence note: when `confidence === "low"`, renders the existing `t('chat.limitedEvidence')` message with `mt-1` (reduced from `mt-2` since the sources line may precede it)
- Both blocks are independent conditionals, so they render correctly in all combinations:
  - Documents + high confidence: only sources line
  - Documents + low confidence: sources line + limited evidence note
  - No documents + low confidence: only limited evidence note
  - No documents + high confidence: nothing shown

### 2. `messages/en.json` (modified)
- Added `"sources": "Sources:"` inside `LegalHub.chat` object (after `examplePrompt4`)

### 3. `messages/pl.json` (modified)
- Added `"sources": "Zrodla:"` (with proper Polish diacritics) inside `LegalHub.chat` object (after `examplePrompt4`)

## Notes
- `chatParseError` (flat key under `LegalHub`) was not touched
- No new dependencies or imports needed
- The `usedDocuments` array is already populated by the citation assembler and included in every `StructuredAnswer` response
