## Task 1 Complete — Section AI Assist API

### Files Created
- **`src/app/api/legal-hub/wizard/ai-assist/route.ts`** (new) — POST handler for AI section content generation
- **`prompts/wizard-section-assist.md`** (new) — System prompt for Polish legal assistant with mode-aware instructions

### Implementation Details

**Route (`route.ts`):**
- Auth: `auth()` from `@/auth` — returns 401 if no session
- Permission: `legal_hub` / `edit` permission check for member role (matches `wizard/blueprints/route.ts` pattern)
- Input validation: `blueprintName`, `sectionTitle` required strings; `mode` must be `"template"` or `"real"`
- No `ensureDb()` — route does not access the database
- Anthropic client: inline `new Anthropic({ apiKey })` per codebase convention
- Model: `process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514"`
- max_tokens: 1024
- File-based prompt: `fs.readFile(path.join(process.cwd(), "prompts/wizard-section-assist.md"))`
- User message includes: blueprint name, document type, section title, mode, available variables (formatted as `{{var}}`), previous sections, user hint
- Response: `{ content: string }` — extracted text from Claude response blocks
- Error handling: try/catch with 500 response, JSON parse error returns 400

**Prompt (`wizard-section-assist.md`):**
- Polish legal assistant persona (kancelaria prawna register)
- Mode-aware: template mode requires `{{variable}}` usage from availableVariables; real mode forbids all `{{...}}`
- Variable preservation: HARD CONSTRAINT — `{{...}}` tokens in previousSections are sacred, never modified
- Output: plain text only, no HTML/markdown, no section headers, paragraphs as separate lines

### Exports / Integration Points
- INTEGRATION: Task 2 (Section AI Assist UI) will call `POST /api/legal-hub/wizard/ai-assist` with the request body shape defined in the plan README
- Request body: `{ blueprintName, documentType, sectionTitle, sectionKey, mode, previousSections, userHint, availableVariables }`
- Response: `{ content: string }`

### GOTCHA
- The `orgId` is extracted from session but not used in any DB query — it's only used for the permission check. This is correct since the route only calls Claude, not the database.
