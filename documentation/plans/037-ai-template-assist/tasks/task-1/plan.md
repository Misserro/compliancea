# Task 1 — Section AI Assist API — Implementation Plan

## Files to Create

### 1. `src/app/api/legal-hub/wizard/ai-assist/route.ts` (new)

**Pattern source:** `src/app/api/legal-hub/wizard/blueprints/route.ts` for auth/org structure, `src/app/api/ask/route.ts` for Anthropic client + file-based prompt pattern.

**Structure:**
- `export const runtime = "nodejs";`
- Import: `NextRequest`, `NextResponse` from `next/server`
- Import: `auth` from `@/auth`
- Import: `Anthropic` from `@anthropic-ai/sdk`
- Import: `fs` from `fs/promises`, `path` from `path`
- Import: `hasPermission` from `@/lib/permissions`
- No `ensureDb()` call needed — this route does not touch the database

**POST handler flow:**
1. `auth()` check — 401 if no session
2. Org membership: `const orgId = Number(session.user.orgId)` — permission check for `legal_hub` (same as blueprints route: member role needs `edit` permission)
3. Parse request body, validate required fields:
   - `blueprintName` — string, required
   - `sectionTitle` — string, required
   - `mode` — must be `"template"` or `"real"`, required
   - `previousSections` — array, defaults to `[]`
   - `availableVariables` — array, defaults to `[]`
   - `documentType` — string | null, optional
   - `sectionKey` — string | null, optional
   - `userHint` — string | null, optional
4. Check `process.env.ANTHROPIC_API_KEY` — 500 if missing
5. Read system prompt: `fs.readFile(path.join(process.cwd(), "prompts/wizard-section-assist.md"), "utf-8")`
6. Build user message with structured context:
   - Blueprint name and document type
   - Section title (and sectionKey if present)
   - Mode (template / real)
   - Available variables list (for template mode)
   - Previous sections (title + content pairs)
   - User hint (if provided)
7. `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`
8. `await anthropic.messages.create({ model, max_tokens: 1024, system: systemPrompt, messages: [{ role: "user", content: userMessage }] })`
9. Extract text from response content blocks
10. Return `{ content: string }`
11. Wrap in try/catch — 500 on error

### 2. `prompts/wizard-section-assist.md` (new)

**Pattern source:** `prompts/case-chat-grounded.md` (Polish legal persona), `prompts/ask.md` (concise instruction style).

**Content structure:**
- Persona: Polish legal assistant (kancelaria prawna register)
- Task: Generate content for a specific section of a legal document template
- Mode instructions:
  - `template` mode: Use `{{variable}}` tokens from the provided availableVariables list where appropriate. These are placeholder tokens for document reuse.
  - `real` mode: Write actual prose with concrete content. Do NOT use any `{{...}}` tokens.
- Variable preservation rule (HARD CONSTRAINT): Any `{{...}}` tokens appearing in previousSections content must be reproduced exactly as-is — never substitute, translate, expand, or remove them.
- Output format: Plain text (not HTML). Each logical paragraph as a separate line.
- Language: Formal Polish legal language throughout
- Context awareness: Use previousSections for consistency in tone, terminology, and content references

## Success Criteria Satisfaction

1. **POST with valid session returns non-empty content in Polish** — System prompt instructs Polish output; route returns `{ content }` from Claude response
2. **Template mode includes `{{variable}}` tokens** — System prompt explicitly instructs use of availableVariables in template mode; user message lists them
3. **Real mode has no `{{...}}` tokens** — System prompt explicitly forbids placeholders in real mode
4. **Unauthenticated requests return 401** — First check in handler, matching all existing routes

## Risks / Trade-offs

- No server-side validation that template-mode response actually contains variables (relying on prompt engineering). The success criteria says the response "includes at least one {{variable}} token" — if Claude fails to include one, the route still returns 200. This matches the plan's design (no post-processing validation mentioned).
- No `ensureDb()` needed since we don't access the database, keeping the route lightweight.
