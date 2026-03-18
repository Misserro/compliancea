# Task 4 Implementation Plan — Template-based Document Generation

## Overview

This plan implements the Generate tab in the case detail view and a standalone template management
page at `/legal-hub/templates`. Templates store HTML bodies with `{{variable}}` placeholders.
The generation flow resolves those placeholders from live case data server-side, opens the filled
document in TipTap for editing, saves to `case_generated_docs`, and exports to DOCX.

Dependencies confirmed: Tasks 1 and 2 are complete — `case_templates` and `case_generated_docs`
tables exist, `CaseTemplate` / `CaseGeneratedDoc` TypeScript interfaces exist in `src/lib/types.ts`,
Legal Hub helpers up to deadline CRUD are in `lib/db.js` and exported from `src/lib/db-imports.ts`,
and `case-detail-page.tsx` has a "Coming soon" placeholder for the Generate tab.

---

## Files to Create or Modify

### 1. `lib/db.js` — new helpers (append after `getCaseDeadlineById`)

Section header: `// ---- Case Templates ----`

New helpers:
- `getCaseTemplates({ search, documentType, isActive } = {})` — SELECT with optional filters, ORDER BY name ASC
- `getCaseTemplateById(id)` — SELECT single row, null if not found
- `createCaseTemplate({ name, description, documentType, applicableCaseTypes, templateBody, variablesJson })` — INSERT, returns lastInsertRowId
- `updateCaseTemplate(id, fields)` — UPDATE with allowlist: `[name, description, document_type, applicable_case_types, template_body, variables_json, is_active]`; includes `updated_at = CURRENT_TIMESTAMP`
- `deleteCaseTemplate(id)` — DELETE

Section header: `// ---- Case Generated Docs ----`

New helpers:
- `getCaseGeneratedDocs(caseId)` — SELECT all for case, ORDER BY created_at DESC
- `getCaseGeneratedDocById(id)` — SELECT single row, null if not found
- `createCaseGeneratedDoc({ caseId, templateId, templateName, documentName, generatedContent, filledVariablesJson })` — INSERT, returns lastInsertRowId
- `updateCaseGeneratedDoc(id, fields)` — UPDATE with allowlist: `[document_name, generated_content, filled_variables_json, file_path]`; includes `updated_at = CURRENT_TIMESTAMP`
- `deleteCaseGeneratedDoc(id)` — DELETE

### 2. `lib/db.d.ts` — append TypeScript declarations for 10 new helpers

```ts
export function getCaseTemplates(...args: any[]): any;
export function getCaseTemplateById(...args: any[]): any;
export function createCaseTemplate(...args: any[]): any;
export function updateCaseTemplate(...args: any[]): any;
export function deleteCaseTemplate(...args: any[]): any;
export function getCaseGeneratedDocs(...args: any[]): any;
export function getCaseGeneratedDocById(...args: any[]): any;
export function createCaseGeneratedDoc(...args: any[]): any;
export function updateCaseGeneratedDoc(...args: any[]): any;
export function deleteCaseGeneratedDoc(...args: any[]): any;
```

### 3. `src/lib/db-imports.ts` — append 10 new exports

Add to the existing export block before the closing `} from "../../lib/db.js"`:
```ts
getCaseTemplates,
getCaseTemplateById,
createCaseTemplate,
updateCaseTemplate,
deleteCaseTemplate,
getCaseGeneratedDocs,
getCaseGeneratedDocById,
createCaseGeneratedDoc,
updateCaseGeneratedDoc,
deleteCaseGeneratedDoc,
```

### 4. `lib/templateEngine.js` — new CJS file

Pure function that resolves `{{variable}}` placeholders. This is a new lib file following the CJS
module pattern used by other lib files (`lib/policies.js`, `lib/chunker.js`, etc.).

**Exports:** `fillTemplate(templateBody, caseData, parties, deadlines)`

**Variable registry** (path → value source):
```
case.<field>          → caseData[field]
parties.plaintiff.*   → first party where party_type === 'plaintiff'
parties.defendant.*   → first party where party_type === 'defendant'
parties.representative.* → first party that has representative_name set
deadlines.next.*      → first deadline ordered by due_date ASC where status === 'pending'
today                 → new Date().toLocaleDateString('pl-PL')
```

**Resolution algorithm:**
1. Replace all `{{token}}` occurrences using a single global regex: `/\{\{([^}]+)\}\}/g`
2. For each token:
   - Split on `.` to get `[source, ...pathParts]`
   - Resolve value from the registry above
   - If value is undefined or null → substitute `[brak danych: <original-token>]`
   - Otherwise substitute the string value (numbers converted via `String()`)
3. Return the resulting HTML string

**Implementation note:** No imports needed — pure JS function operating on plain objects.

```js
// lib/templateEngine.js
"use strict";

/**
 * Resolve a dot-path on a plain object.
 * e.g. resolveDeep({ name: 'Jan' }, ['name']) → 'Jan'
 */
function resolveDeep(obj, pathParts) {
  let current = obj;
  for (const part of pathParts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Fill {{variable}} placeholders in templateBody with values from case context.
 *
 * @param {string} templateBody - HTML string with {{variable}} placeholders
 * @param {Object} caseData - legal_cases row
 * @param {Object[]} parties - case_parties rows
 * @param {Object[]} deadlines - case_deadlines rows, sorted by due_date ASC
 * @returns {string} Filled HTML string
 */
export function fillTemplate(templateBody, caseData, parties, deadlines) {
  const plaintiff = parties.find(p => p.party_type === 'plaintiff');
  const defendant = parties.find(p => p.party_type === 'defendant');
  const representative = parties.find(p => p.representative_name);
  const nextDeadline = (deadlines || [])
    .filter(d => d.status === 'pending')
    .sort((a, b) => (a.due_date > b.due_date ? 1 : -1))[0];

  const today = new Date().toLocaleDateString('pl-PL');

  return templateBody.replace(/\{\{([^}]+)\}\}/g, (match, token) => {
    const trimmed = token.trim();
    const parts = trimmed.split('.');
    const [source, ...rest] = parts;

    let value;

    if (trimmed === 'today') {
      value = today;
    } else if (source === 'case') {
      value = resolveDeep(caseData, rest);
    } else if (source === 'parties' && rest[0] === 'plaintiff') {
      value = resolveDeep(plaintiff, rest.slice(1));
    } else if (source === 'parties' && rest[0] === 'defendant') {
      value = resolveDeep(defendant, rest.slice(1));
    } else if (source === 'parties' && rest[0] === 'representative') {
      value = resolveDeep(representative, rest.slice(1));
    } else if (source === 'deadlines' && rest[0] === 'next') {
      value = resolveDeep(nextDeadline, rest.slice(1));
    }

    if (value === undefined || value === null) {
      return `[brak danych: ${trimmed}]`;
    }
    return String(value);
  });
}
```

### 5. `lib/templateEngine.d.ts` — TypeScript declaration

```ts
export function fillTemplate(
  templateBody: string,
  caseData: Record<string, unknown>,
  parties: Record<string, unknown>[],
  deadlines: Record<string, unknown>[]
): string;
```

### 6. `lib/docxExport.js` — new CJS file

Converts an HTML string to a DOCX Buffer using the `docx` npm library (v9.6.0).
Returns a `Buffer` — the caller (API route) handles writing it to disk.

**Exports:** `async htmlToDocx(html, title)`

**Strategy:** The `docx` library does not parse arbitrary HTML. Instead we:
1. Strip HTML tags to get plain text (using a simple regex strip — no DOM needed server-side)
2. Split on `</p>`, `<br>`, `\n` to produce an array of text runs
3. Create a `docx.Document` with `docx.Paragraph` nodes
4. Call `docx.Packer.toBuffer(doc)` and return the Buffer

This covers the core requirement (a downloadable `.docx` with the document content). Rich formatting
from the TipTap editor is intentionally not preserved in v1 — noted as a limitation.

```js
// lib/docxExport.js
"use strict";

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

/**
 * Convert an HTML string to a DOCX Buffer.
 *
 * @param {string} html - HTML content (from TipTap editor)
 * @param {string} title - Document title (used as the first heading)
 * @returns {Promise<Buffer>} DOCX file as a Buffer
 */
export async function htmlToDocx(html, title) {
  // Strip HTML tags to plain text segments, preserving paragraph breaks
  const withBreaks = html
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');

  const lines = withBreaks
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const paragraphs = [];

  if (title) {
    paragraphs.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
      })
    );
  }

  for (const line of lines) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: line })],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
```

### 7. `lib/docxExport.d.ts` — TypeScript declaration

```ts
export function htmlToDocx(html: string, title: string): Promise<Buffer>;
```

### 8. `src/app/api/legal-hub/templates/route.ts` — GET, POST

Pattern: matches `src/app/api/legal-hub/cases/route.ts`

**GET:**
- Auth → 401
- `ensureDb()`
- Read query params: `search`, `documentType`, `isActive`
- `getCaseTemplates({ search, documentType, isActive: isActive ? Number(isActive) : undefined })`
- Return `{ data: templates }`
- catch (err: unknown) → 500

**POST:**
- Auth → 401
- `ensureDb()`
- Parse JSON body
- Validate: `name` (required, non-empty), `template_body` (required, non-empty)
- `createCaseTemplate({ name, description, documentType, applicableCaseTypes, templateBody, variablesJson })`
- `logAction('legal_case', newId, 'template_created', { name })`
- Return `{ data: newTemplate }` with status 201

### 9. `src/app/api/legal-hub/templates/[id]/route.ts` — GET, PATCH, DELETE

**GET:**
- Auth → 401 → ensureDb → parse id → `getCaseTemplateById(id)` → 404 if null
- Return `{ data: template }`

**PATCH:**
- Auth → 401 → ensureDb → parse id → get existing → 404 if null
- Build `fields` from body with allowlist
- `updateCaseTemplate(id, fields)`
- `logAction('legal_case', id, 'template_updated', { name: fields.name })`
- Return `{ data: updatedTemplate }`

**DELETE:**
- Auth → 401 → ensureDb → parse id → get existing → 404 if null
- `deleteCaseTemplate(id)`
- `logAction('legal_case', id, 'template_deleted', { name: existing.name })`
- Return `{ data: { id } }`

### 10. `src/app/api/legal-hub/cases/[id]/generate/route.ts` — POST

This is the core generation endpoint. Accepts `{ templateId, documentName }`.

**POST:**
- Auth → 401
- `ensureDb()`
- Parse `params.id` (caseId) → 400 if NaN
- Parse body: `templateId` (required), `documentName` (optional, default to template.name)
- `getLegalCaseById(caseId)` → 404 if null
- `getCaseTemplateById(templateId)` → 400 if null
- `getCaseParties(caseId)`
- `getCaseDeadlines(caseId)`
- Import `fillTemplate` from `lib/templateEngine.js`
- Call `fillTemplate(template.template_body, legalCase, parties, deadlines)`
- Build `filledVariablesJson`: extract `{{token}}` values before filling for traceability snapshot
- `createCaseGeneratedDoc({ caseId, templateId, templateName: template.name, documentName, generatedContent: filledHtml, filledVariablesJson })`
- `logAction('legal_case', caseId, 'document_generated', { templateId, templateName: template.name, documentName })`
- Return `{ data: newDoc }` with status 201

**filledVariablesJson snapshot:** After calling fillTemplate, build an object `{ [token]: resolvedValue }` by re-running the resolution logic on the same context. Store as `JSON.stringify(snapshot)`.

### 11. `src/app/api/legal-hub/cases/[id]/generated-documents/route.ts` — GET

- Auth → 401 → ensureDb → parse caseId → `getCaseGeneratedDocs(caseId)` → `{ data: docs }`

### 12. `src/app/api/legal-hub/cases/[id]/generated-documents/[gid]/route.ts` — GET, PATCH, DELETE

**GET:** `getCaseGeneratedDocById(gid)` → 404 if null → `{ data: doc }`

**PATCH:**
- Parse body, build `fields` with allowlist `[document_name, generated_content, filled_variables_json]`
- `updateCaseGeneratedDoc(gid, fields)`
- `logAction('legal_case', caseId, 'generated_doc_updated', { docId: gid })`
- Return `{ data: updatedDoc }`

**DELETE:**
- `deleteCaseGeneratedDoc(gid)`
- `logAction('legal_case', caseId, 'generated_doc_deleted', { docId: gid })`
- Return `{ data: { id: gid } }`

### 13. `src/app/api/legal-hub/cases/[id]/generated-documents/[gid]/export/route.ts` — GET

Exports a generated doc as DOCX and streams it as a file download.

**GET:**
- Auth → 401 → ensureDb → parse caseId + gid
- `getCaseGeneratedDocById(gid)` → 404 if null
- Import `htmlToDocx` from `lib/docxExport.js`
- `const buffer = await htmlToDocx(doc.generated_content, doc.document_name)`
- Write file to `DOCUMENTS_DIR/case-generated/[caseId]/[doc.document_name].docx`
  (create directory if needed, using `fs.mkdirSync(..., { recursive: true })`)
- Update `file_path` on the generated doc: `updateCaseGeneratedDoc(gid, { file_path: savedPath })`
- Return the buffer as a `Response` with headers:
  - `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `Content-Disposition: attachment; filename="<document_name>.docx"`

### 14. `src/app/(app)/legal-hub/templates/page.tsx` — Template management page (server thin wrapper)

Follows the pattern of `src/app/(app)/legal-hub/page.tsx`:

```tsx
import { TemplateManagementPage } from "@/components/legal-hub/template-management-page";

export default function TemplatesPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <TemplateManagementPage />
    </div>
  );
}
```

### 15. `src/components/legal-hub/template-management-page.tsx` — "use client" top-level container

State:
- `templates: CaseTemplate[]`
- `loading: boolean`
- `showForm: boolean` — toggle between list and create/edit form
- `editingTemplate: CaseTemplate | null`
- `refreshTrigger: number`

Renders:
- Header row: "Document Templates" title + "New Template" button (Plus icon)
- When `showForm === false`: `<TemplateList>` with edit/delete per row
- When `showForm === true`: `<TemplateForm>` with cancel button

### 16. `src/components/legal-hub/template-list.tsx` — Template list table

**"use client"** component.

Props: `{ refreshTrigger: number; onEdit: (t: CaseTemplate) => void; onDeleted: () => void }`

Fetches from `GET /api/legal-hub/templates`.

Renders a table with columns: Name, Type, Active, Variables count, Created, Actions (Edit/Delete).

Delete: DELETE `/api/legal-hub/templates/[id]` → confirm with `window.confirm` → on 200 call `onDeleted()`.

### 17. `src/components/legal-hub/template-form.tsx` — Create/edit template form

**"use client"** component.

Props: `{ template?: CaseTemplate | null; onSaved: () => void; onCancel: () => void }`

Fields:
- `name` (required, text input)
- `description` (textarea)
- `document_type` (text input, optional)
- `template_body` — TipTap rich text editor (HTML in, HTML out)
- Variable reference panel (side panel or below form): lists all supported variable tokens
  with copy-to-clipboard buttons — e.g. `{{case.reference_number}}`, `{{parties.plaintiff.name}}`

**TipTap integration:**
```tsx
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const editor = useEditor({
  extensions: [StarterKit],
  content: template?.template_body || "",
  onUpdate: ({ editor }) => {
    setTemplateBody(editor.getHTML());
  },
});

// When editing an existing template, load content after mount:
useEffect(() => {
  if (editor && template?.template_body) {
    editor.commands.setContent(template.template_body);
  }
}, [editor, template]);
```

On submit:
- If `template` prop is set: PATCH `/api/legal-hub/templates/[id]`
- Else: POST `/api/legal-hub/templates`
- On success: call `onSaved()`

**Variable reference panel** (static list for v1):
```
{{today}}
{{case.reference_number}}
{{case.title}}
{{case.court}}
{{case.court_division}}
{{case.judge}}
{{case.status}}
{{case.summary}}
{{case.claim_value}}
{{case.claim_currency}}
{{parties.plaintiff.name}}
{{parties.plaintiff.address}}
{{parties.defendant.name}}
{{parties.defendant.address}}
{{parties.representative.representative_name}}
{{deadlines.next.title}}
{{deadlines.next.due_date}}
```

### 18. `src/components/legal-hub/case-generate-tab.tsx` — Generate tab component

**"use client"** component.

Props: `{ caseId: number; legalCase: LegalCase; parties: CaseParty[]; deadlines: CaseDeadline[] }`

State:
- `templates: CaseTemplate[]` — loaded from `GET /api/legal-hub/templates`
- `selectedTemplateId: number | null`
- `generatedDocs: CaseGeneratedDoc[]` — loaded from `GET /api/legal-hub/cases/[id]/generated-documents`
- `generating: boolean`
- `documentName: string`
- `activeDocId: number | null` — ID of the doc currently open in TipTap
- `editorContent: string` — current HTML in TipTap
- `saving: boolean`
- `exporting: boolean`
- `refreshGenDocs: number`

**Layout (two columns on lg):**
- **Left column** — Template selector + generate:
  - "Select Template" section: `<select>` populated from `templates`
  - Document name input (pre-filled from template.name)
  - "Generate Document" button → POST `/api/legal-hub/cases/[id]/generate`
  - On success: add new doc to `generatedDocs`, open in editor (set `activeDocId`, load `editorContent`)

- **Right column** — Editor + history:
  - If `activeDocId !== null`:
    - TipTap editor with the generated content loaded
    - "Save" button → PATCH `/api/legal-hub/cases/[id]/generated-documents/[gid]` with current HTML
    - "Export DOCX" button → GET `/api/legal-hub/cases/[id]/generated-documents/[gid]/export`
      (triggers browser download via `window.open(url)` or a hidden `<a>` click with `download` attr)
    - "Close" link to deselect and return to list view
  - Generated documents history list:
    - Shows all `generatedDocs` ordered by `created_at DESC`
    - Each row: document name, template name, timestamp, "Open" button to load in editor

**TipTap integration:**
```tsx
const editor = useEditor({
  extensions: [StarterKit],
  content: editorContent,
  onUpdate: ({ editor }) => {
    setEditorContent(editor.getHTML());
  },
});

// Load content when activeDocId changes:
useEffect(() => {
  if (editor && editorContent) {
    editor.commands.setContent(editorContent);
  }
}, [editor, activeDocId]);
```

**Export DOCX:** The export endpoint returns the binary DOCX. To trigger a browser download, create a temporary link:
```tsx
const handleExport = async () => {
  setExporting(true);
  const res = await fetch(`/api/legal-hub/cases/${caseId}/generated-documents/${activeDocId}/export`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${documentName || 'document'}.docx`;
  a.click();
  URL.revokeObjectURL(url);
  setExporting(false);
};
```

### 19. `src/components/legal-hub/case-detail-page.tsx` — Wire in Generate tab

**Change:** Replace the "Coming soon" placeholder in the `generate` tab branch with:

```tsx
{activeTab === "generate" && (
  <CaseGenerateTab
    caseId={caseId}
    legalCase={legalCase}
    parties={parties}
    deadlines={deadlines}
  />
)}
```

Add import at top: `import { CaseGenerateTab } from "./case-generate-tab";`

### 20. App sidebar — add Templates link

**File:** `src/components/layout/app-sidebar.tsx`

**Change:** Add a second menu item inside the existing "Legal Hub" `SidebarGroup`, after the "Cases"
`SidebarMenuItem`. New item: link to `/legal-hub/templates` with a `FileText` icon and label
"Templates".

```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    asChild
    isActive={pathname === "/legal-hub/templates"}
    tooltip="Templates"
  >
    <Link href="/legal-hub/templates">
      <FileText />
      <span>Templates</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

`FileText` is already imported in the sidebar (if not, add to the lucide-react import line).

---

## Success Criteria Verification

| Criterion | Implementation |
|---|---|
| Create template with `{{case.reference_number}}`, `{{parties.plaintiff.name}}`, `{{case.court}}` | `TemplateForm` → TipTap editor → POST `/api/legal-hub/templates` → `createCaseTemplate` |
| Save, edit, delete templates | `TemplateList` edit → PATCH; delete → DELETE |
| Generate tab: select template, preview shows resolved values | `CaseGenerateTab` → POST `/api/legal-hub/cases/[id]/generate` → `fillTemplate` resolves vars |
| Missing variable shows `[brak danych: ...]` not blank | `fillTemplate` fallback branch |
| Edit in TipTap | `CaseGenerateTab` TipTap editor with `setContent` on generation |
| Save to `case_generated_docs` with `filled_variables_json` snapshot | `createCaseGeneratedDoc` in generate route |
| Export DOCX downloads `.docx` | `/export` route → `htmlToDocx` → blob download |
| Generated documents history with timestamps | `generatedDocs` list in `CaseGenerateTab` |

---

## Risks and Trade-offs

1. **TipTap v3 in package.json** (`@tiptap/react: ^3.20.0`): The `useEditor` + `EditorContent` API exists in both v2 and v3. `editor.commands.setContent(html)` is the correct method for loading HTML in both versions. The knowledge agent query will confirm v3 specifics.

2. **DOCX export is plain text only in v1**: The `docx` library does not have a native HTML parser. Stripping HTML to paragraphs covers the requirement. Rich formatting (bold, tables) is not preserved. This is documented as a known limitation.

3. **Template body sanitization**: The plan renders template body HTML using TipTap (which sanitizes on parse) in the editor, and on preview sends to server for `fillTemplate` then stores result. The render in TipTap serves as sanitization on the edit side. Server-side, the filled content is stored as-is and re-loaded into TipTap for editing — sanitization happens at TipTap parse time. No additional DOMPurify needed for editor flows.

4. **lib/templateEngine.js is ESM, not CJS**: The existing lib files use ESM syntax (`import/export`) not CommonJS. Looking at `lib/db.js` line 1 (`import initSqlJs from "sql.js"`), `lib/policies.js` line 1 (`import { run, query, get } from "./db.js"`), the project uses ESM in lib files. Therefore `lib/templateEngine.js` and `lib/docxExport.js` should use ESM `export` syntax, not `module.exports`. The task description says "CJS" but the actual pattern in lib/ is ESM — will follow existing code pattern.

5. **`logAction` import**: In the existing API routes, `logAction` is imported from `@/lib/audit-imports` (not from `@/lib/db-imports`). All new API routes must follow this pattern.

6. **Concurrent T3/T4 execution — db.js conflict**: Task 3 adds `getCaseDocuments`, `addCaseDocument`, `removeCaseDocument`. Task 4 adds 10 new helpers in separate named sections. No function name collisions. Both tasks can safely append to the end of db.js in sequence.

7. **DOCUMENTS_DIR for export**: `DOCUMENTS_DIR` is exported from `lib/paths.js` (not a constant in server-utils). API routes must import it from `../../lib/paths.js` or use `getDocumentsDir()` from `@/lib/server-utils`.

---

## Dependency Notes for Task 5

- `getCaseParties` and `getCaseDeadlines` (from Task 2) are consumed directly in the generate endpoint — no new party/deadline helpers needed.
- Task 5 (chat) depends on Tasks 2+3, not Task 4 — no blocking dependency.
- The `case-detail-page.tsx` change here (adding CaseGenerateTab import) does not conflict with Task 5's Chat tab change because they modify different `activeTab` branches.
