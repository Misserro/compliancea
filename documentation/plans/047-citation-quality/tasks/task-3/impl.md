## Task 3 Complete — Per-item list citations in system prompt

- Modified: `prompts/case-chat-grounded.md` (line 46, new rule inserted in "Zasady cytowania" section)
- Added rule: "W listach enumerowanych kazdy element cytuj fragmentem bezposrednio go zawierajacym..." — instructs Claude to cite each enumerated list item with its specific chunk rather than defaulting to the section header chunk
- Insertion point: after the "Maksymalnie 1 znacznik na zdanie" rule (line 45), before the "NIE wstawiaj znacznikow" rule (now line 47)
- Tests: `tests/unit/citation-assembler.test.ts` — all 22 tests pass (no code changes, prompt-only change)
- No other files modified
