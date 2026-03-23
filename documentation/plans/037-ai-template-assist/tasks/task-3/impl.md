## Task 3 Complete — Document Polish API

- Created: `src/app/api/legal-hub/wizard/ai-polish/route.ts` (new file)
- Created: `prompts/wizard-document-polish.md` (new file)

### Route (`route.ts`)
- Auth: NextAuth session via `auth()` from `@/auth` — 401 if no session
- Org permission: matches `blueprints/route.ts` pattern exactly — member role checks `legal_hub` permission for `edit`
- No `ensureDb()` — route has no database operations
- Input validation: sections must be non-empty array with title+content strings; blueprintName required
- Uses `combineWizardSections()` from `@/lib/wizard-blueprints` to assemble draft HTML
- System prompt loaded via `fs.readFile(path.join(process.cwd(), "prompts/wizard-document-polish.md"))`
- AI: `new Anthropic({ apiKey })` inline, model `process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514"`, `max_tokens: 4096`
- Non-streaming: `await anthropic.messages.create(...)`, text blocks extracted and joined
- Returns `{ polishedHtml: string }`

### System Prompt (`wizard-document-polish.md`)
- Role: Senior Polish advocate with 20+ years experience
- Full rewrite instruction: unify independently-written sections into cohesive legal document
- Hard constraint: `{{...}}` tokens are sacred — reproduce verbatim, never substitute/remove/invent
- Output format: HTML with `<h2>` headings, `<p>` paragraphs, optional `<ol>`/`<ul>`/`<li>`/`<strong>`/`<em>`
- Forbidden: `<script>`, `<style>`, `<iframe>`, event handlers
- Language: formal Polish legal register (rejestr kancelaryjny)

### INTEGRATION Notes
- Task 4 (Document Polish Wizard Step) will call `POST /api/legal-hub/wizard/ai-polish` with sections from wizard state
- The response `polishedHtml` is ready for insertion into the RichTextEditor
- Exports: none (API route only)
