# Full-Document Tagging Design

**Date:** 2026-02-26

---

## Goal

Read and tag the **entire** document — not just the first 6 pages — so that Ask Library can reliably surface the right document for any question, including questions about content buried deep in a 40-page policy.

---

## Root Causes

| Problem | Current value | Impact |
|---------|--------------|--------|
| Text truncated to first 2000 words | `words.slice(0, 2000)` in `lib/autoTagger.js` | Pages 7+ are invisible to tagger |
| Old Haiku 3 model | `claude-3-haiku-20240307` | Less capable extraction of nuanced legal/regulatory concepts |
| Output token limit too low | `max_tokens: 1200` | Forces sparse, incomplete tag lists |
| Tag cap too low | 50 tags | 40+ page documents need 80–100 tags to be fully described |
| Query tag extractor also on old Haiku 3 | `claude-3-haiku-20240307` in `lib/search.js` | Weak first-stage matching in Ask Library |

---

## Design

### 1. `lib/autoTagger.js`

**Remove the 2000-word truncation.** Send the full document text.

**Safety net for extreme documents (>140,000 words, ~450+ pages):** Rather than truncating, split into three large sections (first 45K words / middle 45K words / last 50K words), run `extractMetadata` on each section independently, then merge and deduplicate all tags. This ensures no document is ever truncated.

**Model upgrade:** `claude-3-haiku-20240307` → `claude-haiku-4-5-20251001`
- 200K token context window — handles even 400-page documents in one pass
- Significantly more capable at extracting precise legal/regulatory concepts

**Output tokens:** 1200 → 2000 (room for complete tag lists across all 10 categories)

**Tag cap:** 50 → 100

### 2. `prompts/auto-tagger.md`

Increase quantity guidelines since the full document is now read:

| Category | Old | New |
|----------|-----|-----|
| topics | 3–5 | 5–10 |
| subtopics | 3–5 | 5–10 |
| legal_concepts | 2–4 | 3–8 |
| regulations | 1–5 | 2–10 |
| entity_types | 1–3 | 1–5 |
| procedures | 1–4 | 2–8 |
| compliance_areas | 1–4 | 2–8 |
| geographic | 1–4 | 1–6 |
| temporal | 0–2 | 0–4 |
| industry | 1–2 | 1–3 |

No structural changes — same 10 categories, same JSON format.

### 3. `lib/search.js` — `extractQueryTags`

Single model upgrade: `claude-3-haiku-20240307` → `claude-haiku-4-5-20251001`

Expand query tag range from 5–15 to **5–20** to match the richer document tag sets.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/autoTagger.js` | Remove truncation, add safety-net chunked path, upgrade model, increase max_tokens, raise tag cap |
| `prompts/auto-tagger.md` | Increase quantity guidelines per category |
| `lib/search.js` | Upgrade model in `extractQueryTags`, expand tag range to 5–20 |

---

## Non-goals

- No changes to the chunking/embedding pipeline (Voyage AI, semantic search)
- No changes to the tag schema (same 10 categories)
- No changes to how tags are stored (flat array for search, structured in metadata_json)
- No summarization step
- No UI changes
