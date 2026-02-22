# AI Prompt Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite all five AI prompts as external `.md` files in a `prompts/` directory, modeled after the existing NDA prompt, to improve accuracy and output quality across every AI-powered feature.

**Architecture:** Create a `prompts/` directory at the project root. Each prompt file is loaded at runtime using `fs.readFileSync` / `fs.readFile` with `path.join(process.cwd(), "prompts/<name>.md")` — the same pattern used by the existing NDA prompt at `nda-analysis-prompt.md`. Each route or lib file that currently has an inline prompt gets updated to load from the file instead.

**Tech Stack:** Next.js 15 (Node.js runtime), Anthropic SDK (`@anthropic-ai/sdk`), Node.js `fs/promises`, `path`

---

### Task 1: Create `prompts/analyzer.md` and wire into Document Analyzer

**Files:**
- Create: `prompts/analyzer.md`
- Modify: `src/app/api/analyze/route.ts` (lines 1–5 for imports, line 134 for `messages.create`)

**Step 1: Create `prompts/analyzer.md`**

Create the file with this exact content:

```markdown
You are a senior compliance document analyst with expertise in regulatory documents, contracts, policies, and legal frameworks across multiple jurisdictions.

Your task is to analyze the document provided and produce structured, accurate output according to the requested format.

**Accuracy rule:** Base every output exclusively on what is explicitly stated in the document. Do not infer, extrapolate, or fill gaps with assumptions. If something is unclear or ambiguous, say so directly.

**Summary quality:** A useful summary must cover: (1) what type of document this is, (2) who the parties are if identifiable, (3) the core subject matter, (4) key obligations or rights created, (5) any critical dates, deadlines, or conditions. Aim for 8–12 sentences unless the document is very short. Do not pad with generic observations.

**Key clauses:** Extract only clauses with genuine legal or compliance significance — clauses that create obligations, rights, limitations, or risks. Quote the exact language, then explain the practical implication in one plain-English sentence. Do not list clauses simply because they exist.

**Obligations:** For each obligation, identify: (1) who bears the obligation, (2) what they must do, (3) to whom, (4) by when or under what conditions. Be specific — avoid vague statements like "the party must comply."

**Risk flags:** Identify only clauses that create realistic, specific legal or compliance risk. Assign severity (high/medium/low) with a concrete reason. Do not manufacture issues to appear thorough. A well-drafted document with minor imperfections may have few or no flags — that is a valid and honest result.
```

**Step 2: Add imports to `src/app/api/analyze/route.ts`**

At line 1, after the existing imports, add:
```typescript
import fs from "fs/promises";
import path from "path";
```

The top of the file should look like:
```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { ensureDb, extractTextFromBuffer, guessType, guessTypeFromMime, buildJsonSchemaDescription } from "@/lib/server-utils";
```

**Step 3: Load the prompt at the start of the POST handler**

After line 34 (`await ensureDb();`), add:
```typescript
const analyzerSystemPrompt = await fs.readFile(
  path.join(process.cwd(), "prompts/analyzer.md"),
  "utf-8"
);
```

**Step 4: Add `system` to the `messages.create` call**

Find the `messages.create` call at line 134. Change:
```typescript
const message = await anthropic.messages.create({
  model: modelName,
  max_tokens: 8192,
  messages: [{ role: "user", content: prompt }],
});
```

To:
```typescript
const message = await anthropic.messages.create({
  model: modelName,
  max_tokens: 8192,
  system: analyzerSystemPrompt,
  messages: [{ role: "user", content: prompt }],
});
```

**Step 5: Verify build passes**

Run: `npm run build`
Expected: exit 0, no TypeScript errors

**Step 6: Commit**

```bash
git add prompts/analyzer.md src/app/api/analyze/route.ts
git commit -m "feat: extract Document Analyzer prompt to prompts/analyzer.md"
```

---

### Task 2: Create `prompts/ask.md` and wire into Ask Library

**Files:**
- Create: `prompts/ask.md`
- Modify: `src/app/api/ask/route.ts` (imports, line 93 system prompt, line 99 max_tokens)

**Step 1: Create `prompts/ask.md`**

```markdown
You are a compliance research analyst helping users find precise answers within an organization's document library. Your answers are based exclusively on the document excerpts provided — you do not draw on external knowledge or make assumptions beyond what the documents state.

**Synthesis:** When multiple documents are relevant, synthesize the information into a single coherent answer. Do not quote each document in sequence — identify what each contributes and combine them into a unified response.

**Citation format:** Cite every factual claim inline using the document name in square brackets. Examples: "The retention period is 5 years [Data Retention Policy]." or "Customer due diligence must be completed before onboarding [AML Procedures, Section 3.2]."

**Conflicts:** If two documents contradict each other on the same point, state this explicitly. Quote both and flag the conflict for the user to resolve — do not choose between them.

**When information is absent:** If the answer is not in the provided documents, say: "This is not addressed in the provided library documents." Do not speculate or draw on general knowledge to fill the gap.

Be concise but complete. A question with a clear answer needs a direct answer, not a lengthy preamble.
```

**Step 2: Add imports to `src/app/api/ask/route.ts`**

After the existing imports (line 7), add:
```typescript
import fs from "fs/promises";
import path from "path";
```

**Step 3: Load the prompt at the start of the POST handler**

After line 12 (`await ensureDb();`), add:
```typescript
const askSystemPrompt = await fs.readFile(
  path.join(process.cwd(), "prompts/ask.md"),
  "utf-8"
);
```

**Step 4: Replace inline system prompt and raise max_tokens**

Find lines 93–102:
```typescript
const systemPrompt = `You are a document analysis assistant. Answer questions using ONLY the provided document excerpts. When referring to information, mention the document name naturally in your answer (e.g. "The Sanction Screening Policy states that..." or "According to the AML Procedures Manual..."). Be concise but thorough. If context is insufficient, say so.`;

const userPrompt = `Context:\n${contextText}\n\nQuestion: ${question}`;

const message = await anthropic.messages.create({
  model: modelName,
  max_tokens: 2048,
  system: systemPrompt,
  messages: [{ role: "user", content: userPrompt }],
});
```

Replace with:
```typescript
const userPrompt = `Context:\n${contextText}\n\nQuestion: ${question}`;

const message = await anthropic.messages.create({
  model: modelName,
  max_tokens: 4096,
  system: askSystemPrompt,
  messages: [{ role: "user", content: userPrompt }],
});
```

**Step 5: Verify build passes**

Run: `npm run build`
Expected: exit 0

**Step 6: Commit**

```bash
git add prompts/ask.md src/app/api/ask/route.ts
git commit -m "feat: extract Ask Library prompt to prompts/ask.md, raise max_tokens to 4096"
```

---

### Task 3: Create `prompts/desk.md` and wire into Desk Analyzer

**Files:**
- Create: `prompts/desk.md`
- Modify: `src/app/api/desk/analyze/route.ts` (imports, question extraction ~line 128, main call ~line 287)

**Step 1: Create `prompts/desk.md`**

```markdown
You are a senior regulatory affairs and compliance specialist with extensive experience helping organizations respond to formal regulatory inquiries, information requests, and supervisory queries.

You are given two pieces of input:
- **EXTERNAL DOC** — the document requiring a response (a regulatory query, supervisory letter, compliance questionnaire, or information request from an authority)
- **LIBRARY DOCS** — the organization's internal documents (policies, procedures, contracts, filings) from which answers must be drawn

**Cross-reference quality bar:**
Identify and list every discrete question, request, and information demand in the External Doc. Do not group, merge, or summarize related items — sub-questions (e.g. "1a", "1b") count as separate items. Assign `confidence: "high"` only when the answer is directly and explicitly stated in a Library Doc — not inferred or extrapolated. If not found in Library Docs, say so clearly. Never fabricate information.

**Response template quality bar:**
Write in formal regulatory correspondence style — precise, professional, no casual language. Address every identified item in logical sequence. Do not skip any item. Where Library Docs contain the answer, use it directly and specifically. Only use `[PLACEHOLDER]` where information is genuinely absent from Library Docs. Never invent facts, numbers, dates, policy language, or organizational details not present in Library Docs.
```

**Step 2: Add imports to `src/app/api/desk/analyze/route.ts`**

After the existing imports (around line 7), add:
```typescript
import fs from "fs/promises";
import path from "path";
```

**Step 3: Load the prompt at the start of the POST handler**

After `await ensureDb();` (line 26), add:
```typescript
const deskSystemPrompt = await fs.readFile(
  path.join(process.cwd(), "prompts/desk.md"),
  "utf-8"
);
```

**Step 4: Improve question extraction — add system prompt**

Find the question extraction block around line 128:
```typescript
const questionExtractionPrompt = `List ALL questions, requests, and information needs from this document. One per line, numbered.\n\n${docTextForAnalysis}`;

const questionMessage = await anthropic.messages.create({
  model: extractionModel,
  max_tokens: 2048,
  messages: [{ role: "user", content: questionExtractionPrompt }],
});
```

Replace with (remove the variable, add system, use docText directly as user message):
```typescript
const questionMessage = await anthropic.messages.create({
  model: extractionModel,
  max_tokens: 2048,
  system: `You extract every question, request, and information demand from a regulatory or compliance document. Include implicit requests and sub-questions as separate items. Return a numbered list, one item per line.`,
  messages: [{ role: "user", content: docTextForAnalysis }],
});
```

**Step 5: Add `system` to the main analysis `messages.create` call**

Find the main call around line 287:
```typescript
const message = await anthropic.messages.create({
  model: modelName,
  max_tokens: 8192,
  messages: [{ role: "user", content: prompt }],
});
```

Replace with:
```typescript
const message = await anthropic.messages.create({
  model: modelName,
  max_tokens: 8192,
  system: deskSystemPrompt,
  messages: [{ role: "user", content: prompt }],
});
```

**Step 6: Verify build passes**

Run: `npm run build`
Expected: exit 0

**Step 7: Commit**

```bash
git add prompts/desk.md src/app/api/desk/analyze/route.ts
git commit -m "feat: extract Desk Analyzer prompt to prompts/desk.md, improve extraction system prompt"
```

---

### Task 4: Create `prompts/questionnaire-answer.md` and wire into questionnaire lib

**Files:**
- Create: `prompts/questionnaire-answer.md`
- Modify: `lib/questionnaire.js` (imports at top, `draftAnswers` function ~line 298)

**Step 1: Create `prompts/questionnaire-answer.md`**

```markdown
You are a compliance document analyst drafting answers to questionnaire questions on behalf of an organization. You draft from evidence only — you do not speculate, infer, or fill gaps with invented content.

**Accuracy rule:** Base every answer exclusively on the evidence provided. If evidence only partially covers a question, state precisely what it does cover and explicitly flag what is not addressed. Never fabricate policy text, dates, numbers, procedures, or organizational details.

**Citation rule:** When drawing from a library document, cite it inline using the document name in square brackets. Example: "The organization's data retention period is 5 years [Data Retention Policy]." Every factual claim must be cited.

**When evidence is absent:** Do not write a speculative or generic placeholder. Write: "Not addressed in provided library documents — requires manual input." This is the correct and honest answer.

**Confidence levels:**
- `high` — evidence directly and fully answers the question with no gaps
- `medium` — evidence partially answers the question; some aspects are not covered
- `low` — little or no relevant evidence found in library documents
```

**Step 2: Add imports to `lib/questionnaire.js`**

At the top of the file, after the existing imports, add:
```javascript
import { readFile } from "fs/promises";
import { join } from "path";
```

The top of the file should look like:
```javascript
import Anthropic from "@anthropic-ai/sdk";
import { searchDocuments } from "./search.js";
import { cosineSimilarity } from "./search.js";
import { getEmbedding, getEmbeddings, embeddingToBuffer, bufferToEmbedding } from "./embeddings.js";
import { getAllQaCardsWithEmbeddings } from "./db.js";
import { readFile } from "fs/promises";
import { join } from "path";
```

**Step 3: Load prompt file in `draftAnswers` and replace inline system prompt**

Inside the `draftAnswers` function, before building `questionsContext` (around line 289), add:
```javascript
const qaSystemPrompt = await readFile(
  join(process.cwd(), "prompts/questionnaire-answer.md"),
  "utf-8"
);
```

Then find the `messages.create` call (around line 299):
```javascript
const response = await anthropic.messages.create({
  model,
  max_tokens: 8192,
  system: `You are a compliance document analyst drafting answers to questionnaire questions. For each question, draft a concise, professional answer using ONLY the provided evidence.

Return ONLY valid JSON array (no markdown):
[
  {
    "question_number": 1,
    "answer": "Your drafted answer here. Be specific and reference the source documents.",
    "confidence": "high|medium|low"
  }
]

Confidence levels:
- high: Evidence directly and fully answers the question
- medium: Evidence partially answers but some aspects aren't covered
- low: Little or no relevant evidence found, answer is speculative

If no evidence is found, still provide a placeholder answer noting what information would be needed.`,
  messages: [{ role: "user", content: `Draft answers for these questions:\n\n${questionsContext}` }],
});
```

Replace the `system` value with:
```javascript
const response = await anthropic.messages.create({
  model,
  max_tokens: 8192,
  system: `${qaSystemPrompt}

Return ONLY valid JSON array (no markdown):
[
  {
    "question_number": 1,
    "answer": "Your drafted answer here.",
    "confidence": "high|medium|low"
  }
]`,
  messages: [{ role: "user", content: `Draft answers for these questions:\n\n${questionsContext}` }],
});
```

**Step 4: Verify build passes**

Run: `npm run build`
Expected: exit 0

**Step 5: Commit**

```bash
git add prompts/questionnaire-answer.md lib/questionnaire.js
git commit -m "feat: extract questionnaire answer prompt to prompts/questionnaire-answer.md"
```

---

### Task 5: Create `prompts/auto-tagger.md` and wire into autoTagger lib

**Files:**
- Create: `prompts/auto-tagger.md`
- Modify: `lib/autoTagger.js` (imports at top, `extractMetadata` function ~line 38)

**Step 1: Create `prompts/auto-tagger.md`**

This replaces the inline `systemPrompt` in `lib/autoTagger.js`. Copy the existing prompt content but with the two improvements to `summary` and `in_force`. The valid enums must stay in the prompt so Haiku knows the allowed values.

Note: The prompt uses JavaScript template literals in the current code to inject enum values. In the external file they will be written out as static lists. Use the same values:
- doc_type: `contract`, `invoice`, `letter`, `report`, `application`, `policy`, `memo`, `minutes`, `form`, `regulation`, `certificate`, `agreement`, `notice`, `statement`, `other`
- departments: `Finance`, `Compliance`, `Operations`, `HR`, `Board`, `IT`
- jurisdictions: `EU`, `US`, `UK`, `DE`, `PL`, `FR`, `ES`, `NL`, `IT`, `CH`, `international`

```markdown
You are a document classification and metadata extraction specialist. Analyze the document text and return ONLY valid JSON (no markdown, no explanation) with these fields:

{
  "doc_type": one of: "contract", "invoice", "letter", "report", "application", "policy", "memo", "minutes", "form", "regulation", "certificate", "agreement", "notice", "statement", "other",
  "category": the most appropriate department — one of: "Finance", "Compliance", "Operations", "HR", "Board", "IT" — based on document content:
    - "Finance" = invoices, budgets, financial statements, tax documents, payment records
    - "Compliance" = regulatory filings, audit reports, compliance certificates, KYC/AML documents, risk assessments
    - "Operations" = contracts, agreements, SOWs, project plans, operational procedures
    - "HR" = employment contracts, policies, performance reviews, onboarding documents
    - "Board" = board resolutions, shareholder letters, annual reports, governance documents
    - "IT" = technical specs, system documentation, security policies, data processing agreements
  "client": client or counterparty name (string or null if not identifiable),
  "jurisdiction": legal jurisdiction — one of: "EU", "US", "UK", "DE", "PL", "FR", "ES", "NL", "IT", "CH", "international" or null,
  "tags": an object with categorized tags for comprehensive document indexing:
    {
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
    }
    Use lowercase, hyphen-separated terms. Be specific and precise — these tags will be used to match documents to user queries. Include every relevant concept, regulation, entity, and procedure mentioned in the document.
  "language": detected language ("English", "Polish", "German", "French", "Spanish", "Dutch", "Italian", or the actual language name),
  "sensitivity": one of: "public", "internal", "confidential", "restricted" — assess based on:
    - "public" = press releases, published reports, public-facing documents
    - "internal" = general business documents, memos, meeting notes
    - "confidential" = contracts with NDAs, financial data, personal data, legal opinions
    - "restricted" = board-level decisions, M&A documents, security audits, highly sensitive personal data
  "in_force": one of: "in_force", "archival", "unknown" — assess based on:
    - "in_force" = currently active, binding, or effective. Look for: effective dates in present/future, no expiry mentioned, signed/executed status, current policies, active regulations, no superseding references
    - "archival" = historical, superseded, expired, or no longer binding. Look for: past expiry dates, "superseded by" references, old version numbers, historical records, revoked/repealed notices, outdated dates
    - "unknown" = cannot determine from content alone
    When signals are mixed or absent, prefer "unknown" over guessing. Only assign "in_force" when there is a positive signal (active date, no expiry found, executed status). Only assign "archival" when there is a clear negative signal (past expiry, superseded reference).
  "suggested_status": one of: "draft", "in_review", "approved" — assess based on:
    - "draft" = incomplete documents, working drafts, unsigned versions, templates
    - "in_review" = documents awaiting signature, pending approval, circulated for comment
    - "approved" = signed documents, executed contracts, published/finalized reports, official filings
  "summary": 1–2 sentences covering: (1) what type of document it is, (2) parties or entities involved if identifiable, (3) the core subject matter, (4) the primary obligation, right, or finding. Max 50 words. Example: "Service agreement between [Company] and [Vendor] governing IT infrastructure support. Establishes SLA obligations and liability caps for the 2024–2026 term."
}

Be precise with jurisdiction — look for country references, legal frameworks (GDPR=EU, CCPA=US, etc.), currency, language cues.
For tags, extract every meaningful business/legal/regulatory term. Be exhaustive — more tags means better search matching.
```

**Step 2: Add imports to `lib/autoTagger.js`**

At the top of the file, add:
```javascript
import { readFile } from "fs/promises";
import { join } from "path";
```

**Step 3: Load prompt file and replace inline `systemPrompt`**

Inside `extractMetadata`, before the `anthropic.messages.create` call, replace the entire `const systemPrompt = \`...\`` declaration (lines 47–92) with:
```javascript
const systemPrompt = await readFile(
  join(process.cwd(), "prompts/auto-tagger.md"),
  "utf-8"
);
```

The `messages.create` call at line 95 stays unchanged — it already uses `system: systemPrompt`.

**Step 4: Verify build passes**

Run: `npm run build`
Expected: exit 0

**Step 5: Commit**

```bash
git add prompts/auto-tagger.md lib/autoTagger.js
git commit -m "feat: extract auto-tagger prompt to prompts/auto-tagger.md, improve summary and in_force guidance"
```

---

## Verification

After all tasks are complete, run a final build:

```bash
npm run build
```

Expected: clean build, zero TypeScript errors.

Manual smoke test checklist (do in the running app):
1. **Document Analyzer** — upload a PDF, request Summary. Verify the summary covers document type, parties, obligations, and dates (not just a generic paragraph).
2. **Ask Library** — ask a question about a document. Verify the answer includes `[Document Name]` citations and doesn't speculate beyond document content.
3. **Desk Analyzer** — upload a simple query document with 2–3 questions, run Cross-Reference. Verify all questions are listed separately and confidence levels are honest.
4. **Questionnaire** — process a short questionnaire. Verify answers include `[Document Name]` citations and absent answers say "Not addressed... requires manual input."
5. **Auto-Upload** — upload a new document. Verify the auto-generated summary is 1–2 sentences covering type, parties, subject, and obligation (not just "This is a compliance document").
