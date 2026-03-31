## Task 3 — Implementation Plan: Per-item list citations in system prompt

### Goal
Add one rule to the "Zasady cytowania" section of `prompts/case-chat-grounded.md` instructing Claude to cite each enumerated list item with its specific chunk rather than defaulting to the section header chunk.

### Files to modify
- `prompts/case-chat-grounded.md` (line 45–46 area, after the "Maksymalnie 1 znacznik na zdanie" rule)

### What changes
Insert the following line after line 45 ("- Maksymalnie 1 znacznik na zdanie..."):

```markdown
- W listach enumerowanych każdy element cytuj fragmentem bezpośrednio go zawierającym — jeśli element A pochodzi z [CHUNK:11] a element B z [CHUNK:12], wstaw [cit:11] po A i [cit:12] po B. Nie cytuj nagłówka sekcji jeśli dostępny jest fragment z treścią konkretnego elementu.
```

### How success criteria are satisfied
1. The new rule explicitly instructs per-item chunk citation in lists — satisfies "each item carries its own [cit:X]"
2. The rule is conditional ("if item A comes from CHUNK:11 and item B from CHUNK:12") — when all items share one chunk, same citation is fine
3. No code changes to citation-assembler — `citation-assembler.test.ts` is unaffected
4. No changes to citation marker handling for metadata-only answers — the existing "NIE wstawiaj znacznikow dla informacji z [DANE SPRAWY]" rule is untouched

### Risks
- None. This is a single-line addition to a markdown prompt file. No code logic changes.
