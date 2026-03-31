# Task 1 — Citation density: prompt tuning

## Goal
Reduce over-citation by adding a selectivity constraint to the system prompt so Claude cites only key factual claims (max 3-5 per answer) instead of every sentence.

## File to modify
- `prompts/case-chat-grounded.md` — the "Zasady cytowania" (citation rules) section

## Changes

In the "Zasady cytowania" section (lines 43-48), append three new rules after the existing five bullet points:

1. **Selectivity rule**: "Cytuj tylko kluczowe twierdzenia faktyczne (konkretne daty, kwoty, zobowiazania, ustalenia). Nie cytuj ogolnych wnioskow, podsumowan ani parafraz."
2. **Density cap**: "Maksymalnie 3-5 znacznikow [cit:X] na odpowiedz. Jesli odpowiedz dotyczy jednego faktu, wystarczy 1-2 cytowania."
3. **Consolidation rule**: "Jesli jedno zdanie opiera sie na kilku fragmentach, wstaw tylko 1-2 najbardziej trafne znaczniki (nie wszystkie)."

Additionally, reinforce the no-citation rule for [DANE SPRAWY] metadata by adding emphasis to the existing bullet point (line 46).

## How this satisfies success criteria

1. **Max 3-5 underlined segments**: The density cap ("Maksymalnie 3-5") directly instructs Claude to limit citations.
2. **No citations for case metadata**: The existing rule on line 46 already says this; we reinforce it with stronger language.
3. **Existing tests pass**: This is a prompt-only change. The tests exercise `parseCitationResponse` (JS code), not the prompt. No code changes means no test regressions.

## Risks
- Claude may under-cite (0 citations). Mitigated by the instruction saying "3-5" not "0" and "key factual claims" implying some citations are expected.
- No risk to existing tests since only the prompt file changes.
