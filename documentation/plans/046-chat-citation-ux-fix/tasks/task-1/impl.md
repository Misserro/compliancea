# Task 1 — Implementation Notes

## Changes Made

- Modified: `prompts/case-chat-grounded.md` (lines 43-50, "Zasady cytowania" section)

## What Changed

Replaced the 5-rule citation section with a 7-rule version that adds selectivity constraints:

1. **Kept**: Base rule — insert [cit:chunkId] after document-sourced sentences
2. **NEW**: Selectivity rule — cite ONLY key factual claims (dates, amounts, obligations, findings); do NOT cite general conclusions, summaries, or paraphrases
3. **NEW**: Density cap — max 3-5 [cit:X] markers per entire answer; 1-2 for single-fact answers
4. **REPLACED**: Old rule said "insert multiple markers [cit:X][cit:Y]" for multi-source sentences; new rule says insert only 1-2 most relevant markers (not all)
5. **REINFORCED**: No-citation rule for [DANE SPRAWY] data — changed from "NIE wstawiaj" to "BEZWZGLEDNIE NIE wstawiaj" with explicit list of metadata fields (court, case number, parties, deadlines, claim value)
6. **Kept**: No fabricated chunk markers
7. **Kept**: No fabricated facts

## Test Results

All 22 tests in `tests/unit/citation-assembler.test.ts` pass. This is expected since the change is prompt-only and does not touch any code.

## Integration Notes

- The prompt file is read at runtime by the chat API route, so changes take effect immediately on next request (no build/deploy needed beyond file deployment).
- No other tasks depend on this change.
