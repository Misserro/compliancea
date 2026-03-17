# Full-Document Tagging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Read and tag the entire document (not just first 2000 words) so that Ask Library can reliably match any question to the right document, even for content buried deep in a 40-page policy.

**Architecture:** Three surgical changes: (1) upgrade the auto-tagger prompt to request more tags since the full document is now read, (2) rewrite `lib/autoTagger.js` to remove the 2000-word truncation, upgrade the model to Haiku 4.5, and add a safe chunked path for extreme documents (>140K words), (3) upgrade the query-tag extractor in `lib/search.js` to the same new model and expand the tag range. No schema changes, no UI changes.

**Tech Stack:** Node.js, Anthropic SDK, Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), SQLite, Next.js API routes

---

## Context for the implementer

**Working directory:** `/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea`

**No test framework is set up** — verification is done by running `npm run build` (catches TS/JS import errors) and manual smoke-testing via the UI.

**Key files:**
- `lib/autoTagger.js` — the document metadata + tag extractor called during processing
- `prompts/auto-tagger.md` — system prompt loaded by autoTagger at runtime
- `lib/search.js` — contains `extractQueryTags()` used by Ask Library stage 1

**How autoTagger is called:** `src/app/api/documents/[id]/process/route.ts` calls `extractMetadata(text)` with the full document text already extracted. The truncation happens *inside* `extractMetadata` — that's what we're removing.

**The chunked safety net:** For documents >140,000 words (~450+ pages), running a single API call risks exceeding even Haiku 4.5's 200K context window. The fix is to split into 3 large sections, tag each independently, and merge the tags. Primary metadata (doc_type, category, etc.) comes from the first section (document beginning usually has titles, scope, parties). Tags are unioned across all three sections.

---

### Task 1: Update the auto-tagger prompt

**Files:**
- Modify: `prompts/auto-tagger.md`

**Step 1: Read the current prompt**

Read `prompts/auto-tagger.md` to confirm current content.

**Step 2: Replace the tags quantity guidelines**

The `"tags"` object description currently has these counts — replace them exactly:

```
// BEFORE (lines 16-25 of the prompt):
      "topics": array of 3-5 main subjects/themes covered in the document,
      "subtopics": array of 3-5 more specific sub-themes or details,
      "legal_concepts": array of 2-4 legal principles, doctrines, or frameworks referenced (e.g. "fiduciary-duty", "force-majeure", "data-minimization"),
      "regulations": array of 1-5 specific regulations, directives, or laws cited (e.g. "gdpr", "amld5", "mifid-ii", "fatca", "ccpa"),
      "entity_types": array of 1-3 entity types discussed (e.g. "pep", "corporate", "natural-person", "trust", "foundation"),
      "procedures": array of 1-4 procedures or processes described (e.g. "onboarding", "kyc", "due-diligence", "risk-assessment", "reporting"),
      "compliance_areas": array of 1-4 compliance domains (e.g. "aml", "sanctions", "data-protection", "tax-compliance", "consumer-protection"),
      "geographic": array of 1-4 countries, regions, or markets referenced (e.g. "latvia", "european-union", "united-states"),
      "temporal": array of 0-2 time references (e.g. "2024", "q1-2024", "annual", "multi-year"),
      "industry": array of 1-2 industry sectors (e.g. "banking", "insurance", "fintech", "real-estate", "payments")

// AFTER:
      "topics": array of 5-10 main subjects/themes covered in the document,
      "subtopics": array of 5-10 more specific sub-themes or details,
      "legal_concepts": array of 3-8 legal principles, doctrines, or frameworks referenced (e.g. "fiduciary-duty", "force-majeure", "data-minimization"),
      "regulations": array of 2-10 specific regulations, directives, or laws cited (e.g. "gdpr", "amld5", "mifid-ii", "fatca", "ccpa"),
      "entity_types": array of 1-5 entity types discussed (e.g. "pep", "corporate", "natural-person", "trust", "foundation"),
      "procedures": array of 2-8 procedures or processes described (e.g. "onboarding", "kyc", "due-diligence", "risk-assessment", "reporting"),
      "compliance_areas": array of 2-8 compliance domains (e.g. "aml", "sanctions", "data-protection", "tax-compliance", "consumer-protection"),
      "geographic": array of 1-6 countries, regions, or markets referenced (e.g. "latvia", "european-union", "united-states"),
      "temporal": array of 0-4 time references (e.g. "2024", "q1-2024", "annual", "multi-year"),
      "industry": array of 1-3 industry sectors (e.g. "banking", "insurance", "fintech", "real-estate", "payments")
```

Also update the closing instruction line. Replace:
```
    Use lowercase, hyphen-separated terms. Be specific and precise — these tags will be used to match documents to user queries. Include every relevant concept, regulation, entity, and procedure mentioned in the document.
```
With:
```
    Use lowercase, hyphen-separated terms. Be specific and precise — these tags will be used to match documents to user queries. You are reading the ENTIRE document — extract every relevant concept, regulation, entity, and procedure mentioned anywhere in the document, not just the introduction.
```

**Step 3: Verify the file looks correct**

Re-read `prompts/auto-tagger.md` and confirm all 10 category lines have been updated.

**Step 4: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add prompts/auto-tagger.md
git commit -m "feat: increase tag quantity guidelines for full-document tagging"
```

---

### Task 2: Rewrite `lib/autoTagger.js`

**Files:**
- Modify: `lib/autoTagger.js`

**Step 1: Read the current file**

Read `lib/autoTagger.js` to confirm the current structure (lines 1-161).

**Step 2: Replace the entire file**

Replace the full contents of `lib/autoTagger.js` with the following. Read carefully — the key changes are:
- `extractMetadata` now checks word count and routes to `extractMetadataChunked` if >140K words
- A new private `extractMetadataSinglePass(text, apiKey)` contains the single-call logic (no truncation)
- Model: `claude-3-haiku-20240307` → `claude-haiku-4-5-20251001`
- `max_tokens`: 1200 → 2000
- Tag cap: 50 → 100

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";

const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

const VALID_DOC_TYPES = [
  "contract", "invoice", "letter", "report", "application",
  "policy", "memo", "minutes", "form", "regulation",
  "certificate", "agreement", "notice", "statement", "other",
];

const VALID_JURISDICTIONS = [
  "EU", "US", "UK", "DE", "PL", "FR", "ES", "NL", "IT", "CH",
  "international", null,
];

const VALID_SENSITIVITIES = ["public", "internal", "confidential", "restricted"];

const VALID_STATUSES = ["draft", "in_review", "approved"];

const VALID_IN_FORCE = ["in_force", "archival", "unknown"];

const TAG_CATEGORIES = [
  "topics", "subtopics", "legal_concepts", "regulations",
  "entity_types", "procedures", "compliance_areas",
  "geographic", "temporal", "industry",
];

// Safety threshold: documents longer than this are tagged in 3 sections.
// 140,000 words ≈ 185,000 tokens — safely within Haiku 4.5's 200K context.
const SINGLE_PASS_WORD_LIMIT = 140000;

/**
 * Extract rich metadata from document text using Claude Haiku 4.5.
 * Reads the ENTIRE document. For very long documents (>140K words),
 * tags three sections independently and merges the results.
 *
 * @param {string} text - Full extracted document text
 * @param {string} [apiKey] - Anthropic API key (defaults to env)
 * @returns {Promise<Object>} - Extracted metadata with tokenUsage
 */
export async function extractMetadata(text, apiKey = null) {
  const words = text.split(/\s+/);

  if (words.length > SINGLE_PASS_WORD_LIMIT) {
    return extractMetadataChunked(words, apiKey);
  }

  return extractMetadataSinglePass(text, apiKey);
}

/**
 * For very long documents: tag beginning, middle, and end separately,
 * then merge tags. Primary metadata (doc_type, category, etc.) comes
 * from the first section since titles and scope appear at the start.
 */
async function extractMetadataChunked(words, apiKey) {
  const total = words.length;
  const mid = Math.floor(total / 2);

  const sections = [
    words.slice(0, 45000).join(" "),
    words.slice(Math.max(0, mid - 22500), mid + 22500).join(" "),
    words.slice(Math.max(0, total - 50000)).join(" "),
  ];

  const results = await Promise.all(
    sections.map((s) => extractMetadataSinglePass(s, apiKey))
  );

  // Primary metadata from first section (document beginning has title, parties, scope)
  const primary = results[0];

  // Merge tags across all sections
  const allFlatTags = [...new Set(results.flatMap((r) => r.tags))].slice(0, 100);

  const mergedStructured = {};
  for (const category of TAG_CATEGORIES) {
    const merged = new Set(results.flatMap((r) => r.structured_tags?.[category] ?? []));
    mergedStructured[category] = [...merged];
  }

  return {
    ...primary,
    tags: allFlatTags,
    structured_tags: mergedStructured,
    tokenUsage: {
      input: results.reduce((sum, r) => sum + r.tokenUsage.input, 0),
      output: results.reduce((sum, r) => sum + r.tokenUsage.output, 0),
    },
  };
}

/**
 * Single-pass metadata extraction — sends the full text to the model.
 */
async function extractMetadataSinglePass(text, apiKey) {
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  try {
    const systemPrompt = await readFile(
      join(process.cwd(), "prompts/auto-tagger.md"),
      "utf-8"
    );

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: text,
        },
      ],
    });

    const responseText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse JSON from response (strip markdown fences if present)
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const metadata = JSON.parse(jsonText);

    // Process structured tags: flatten into a single deduplicated array
    let flatTags = [];
    let structuredTags = null;

    if (metadata.tags && typeof metadata.tags === "object" && !Array.isArray(metadata.tags)) {
      // Structured format
      structuredTags = {};
      for (const category of TAG_CATEGORIES) {
        if (Array.isArray(metadata.tags[category])) {
          const normalized = metadata.tags[category]
            .map((t) => String(t).toLowerCase().trim())
            .filter(Boolean);
          structuredTags[category] = normalized;
          flatTags.push(...normalized);
        } else {
          structuredTags[category] = [];
        }
      }
      flatTags = [...new Set(flatTags)]; // deduplicate
    } else if (Array.isArray(metadata.tags)) {
      // Fallback: old flat format
      flatTags = metadata.tags
        .map((t) => String(t).toLowerCase().trim())
        .filter(Boolean);
    }

    // Cap at 100 tags
    flatTags = flatTags.slice(0, 100);

    // Validate and normalize all fields
    return {
      doc_type: VALID_DOC_TYPES.includes(metadata.doc_type)
        ? metadata.doc_type
        : "other",
      category: DEPARTMENTS.includes(metadata.category)
        ? metadata.category
        : null,
      client: metadata.client || null,
      jurisdiction: VALID_JURISDICTIONS.includes(metadata.jurisdiction)
        ? metadata.jurisdiction
        : null,
      tags: flatTags,
      structured_tags: structuredTags,
      language: metadata.language || "other",
      sensitivity: VALID_SENSITIVITIES.includes(metadata.sensitivity)
        ? metadata.sensitivity
        : "internal",
      in_force: VALID_IN_FORCE.includes(metadata.in_force)
        ? metadata.in_force
        : "unknown",
      suggested_status: VALID_STATUSES.includes(metadata.suggested_status)
        ? metadata.suggested_status
        : "draft",
      summary: typeof metadata.summary === "string"
        ? metadata.summary.slice(0, 350)
        : null,
      tokenUsage: {
        input: message.usage?.input_tokens || 0,
        output: message.usage?.output_tokens || 0,
      },
    };
  } catch (err) {
    console.error("Auto-tagger error:", err.message);
    return {
      doc_type: "other",
      category: null,
      client: null,
      jurisdiction: null,
      tags: [],
      structured_tags: null,
      language: "other",
      sensitivity: "internal",
      in_force: "unknown",
      suggested_status: "draft",
      summary: null,
      tokenUsage: { input: 0, output: 0 },
      error: err.message,
    };
  }
}
```

**Step 3: Verify the build passes**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npm run build
```

Expected: Build succeeds, no errors.

**Step 4: Self-review checklist**

- [ ] `extractMetadata` checks `words.length > SINGLE_PASS_WORD_LIMIT` and routes to chunked
- [ ] `extractMetadataSinglePass` has NO truncation (no `slice(0, 2000)`)
- [ ] Model is `claude-haiku-4-5-20251001` (not the old one)
- [ ] `max_tokens` is 2000
- [ ] Tag cap is 100
- [ ] `extractMetadataChunked` merges tags from all 3 sections, takes primary metadata from first
- [ ] Error fallback still present in `extractMetadataSinglePass`

**Step 5: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add lib/autoTagger.js
git commit -m "feat: read full document for tagging, upgrade to Haiku 4.5, add chunked safety net"
```

---

### Task 3: Upgrade `extractQueryTags` in `lib/search.js`

**Files:**
- Modify: `lib/search.js` (lines 262-266)

**Step 1: Read the current `extractQueryTags` function**

Read `lib/search.js` lines 257-293 to confirm the exact current content.

**Step 2: Apply two changes**

**Change 1** — Model upgrade (line ~263):
```javascript
// BEFORE:
    model: "claude-3-haiku-20240307",

// AFTER:
    model: "claude-haiku-4-5-20251001",
```

**Change 2** — Expand tag range in the system prompt (line ~265). Replace:
```javascript
    system: `Extract search tags from the user query to match against a document tag database. Return ONLY a JSON array of 5-15 lowercase keyword tags. Include: specific topics, legal concepts, entity types, procedures, jurisdictions, regulations, compliance areas, industries. Use hyphen-separated terms (e.g. "due-diligence", "anti-money-laundering"). Be specific, not generic.`,
```
With:
```javascript
    system: `Extract search tags from the user query to match against a document tag database. Return ONLY a JSON array of 5-20 lowercase keyword tags. Include: specific topics, legal concepts, entity types, procedures, jurisdictions, regulations, compliance areas, industries. Use hyphen-separated terms (e.g. "due-diligence", "anti-money-laundering"). Be specific, not generic.`,
```

Also update the slice limit on the return to match (line ~287):
```javascript
// BEFORE:
    tags: tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 15),

// AFTER:
    tags: tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 20),
```

**Step 3: Verify the build passes**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npm run build
```

Expected: Build succeeds, no errors.

**Step 4: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add lib/search.js
git commit -m "feat: upgrade query tag extractor to Haiku 4.5, expand to 5-20 tags"
```
