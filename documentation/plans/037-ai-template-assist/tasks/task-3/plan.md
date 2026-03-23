# Task 3 — Document Polish API: Implementation Plan

## Files to Create

### 1. `src/app/api/legal-hub/wizard/ai-polish/route.ts` (new)

POST handler following the exact pattern of `src/app/api/legal-hub/wizard/blueprints/route.ts` for auth/org checks and `src/app/api/ask/route.ts` for AI invocation.

**Structure:**
- `export const runtime = "nodejs";`
- Import `auth` from `@/auth`, `NextRequest`/`NextResponse` from `next/server`
- Import `Anthropic` from `@anthropic-ai/sdk`
- Import `fs` from `fs/promises`, `path` from `path`
- Import `hasPermission` from `@/lib/permissions`
- Import `combineWizardSections` from `@/lib/wizard-blueprints`
- No `ensureDb()` call needed — this route does not touch the database

**Auth pattern (matching blueprints/route.ts exactly):**
```ts
const session = await auth();
if (!session?.user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
const orgId = Number(session.user.orgId);
if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
  const perm = (session.user.permissions as Record<string, string> | null)?.['legal_hub'] ?? 'full';
  if (!hasPermission(perm as any, 'edit')) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
```

**Input validation:**
- Parse `request.json()` for `{ sections, blueprintName, documentType }`
- Validate `sections` is a non-empty array, each entry has `title` (string) and `content` (string)
- Validate `blueprintName` is a non-empty string

**AI invocation (matching ask/route.ts pattern):**
- Check `process.env.ANTHROPIC_API_KEY` exists, return 500 if not
- Read system prompt: `fs.readFile(path.join(process.cwd(), "prompts/wizard-document-polish.md"), "utf-8")`
- Assemble draft HTML via `combineWizardSections(sections)`
- Build user message with blueprintName, documentType context, and the draft HTML
- `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`
- `process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514"`
- `await anthropic.messages.create({ model, max_tokens: 4096, system: systemPrompt, messages: [{ role: "user", content: userMessage }] })`
- Extract text from response content blocks
- Return `{ polishedHtml: string }`

**Error handling:** try/catch wrapping the entire body, returning `{ error: message }` with status 500.

### 2. `prompts/wizard-document-polish.md` (new)

System prompt file following format of `prompts/ask.md` — plain markdown with instructions.

**Content outline:**
- Role: Senior Polish advocate (adwokat) rewriting a client's draft into a cohesive legal document
- Task: Full rewrite of the provided HTML draft into a single flowing Polish legal document
- Hard constraint on `{{...}}` token preservation — must appear verbatim, never substituted/expanded/removed
- Output format: valid HTML with `<h2>` headings for sections, `<p>` for paragraphs, no `<script>` or event attributes
- Language: formal Polish legal register (Kancelaria prawna)
- Must preserve document structure (sections remain identifiable)

## Success Criteria Coverage

1. **POST with valid session and 3+ sections returns polishedHtml as valid HTML** — the route assembles sections via `combineWizardSections()`, sends to Claude with HTML-output instructions, extracts text response
2. **{{...}} tokens preserved verbatim** — system prompt encodes hard constraint; user message lists all tokens found in input for verification
3. **Unauthenticated requests return 401** — auth check at top of handler, matching existing pattern

## Risks / Trade-offs

- Claude could still drop `{{...}}` tokens despite prompt instructions. The plan README notes this risk; for now we rely on the system prompt constraint (matching the approach for Task 1). Server-side validation of token preservation is noted as out of scope per the plan.
- No `ensureDb()` needed since we don't touch the database. This is a deliberate deviation from the blueprints route which does DB operations.
