## Task 4 Complete — Template-based Document Generation

### Files Created

- `lib/templateEngine.js` — `fillTemplate(templateBody, caseData, parties, deadlines)` pure function returning `{ html, snapshot }`. Regex replaces `{{variable}}` with case data; missing values become `[brak danych: token]`.
- `lib/templateEngine.d.ts` — TypeScript declarations
- `lib/docxExport.js` — `htmlToDocx(html, title)` using docx v9 (Document, Paragraph, TextRun, Packer). Strips HTML to paragraphs, returns Buffer.
- `lib/docxExport.d.ts` — TypeScript declarations
- `src/lib/template-engine-imports.ts` — re-export wrapper for `fillTemplate` (follows paths-imports pattern)
- `src/lib/docx-export-imports.ts` — re-export wrapper for `htmlToDocx`
- `src/app/api/legal-hub/templates/route.ts` — GET (list) + POST (create, returns 201)
- `src/app/api/legal-hub/templates/[id]/route.ts` — GET + PATCH + DELETE
- `src/app/api/legal-hub/cases/[id]/generate/route.ts` — POST: resolves template variables, creates generated doc
- `src/app/api/legal-hub/cases/[id]/generated-documents/route.ts` — GET (list for case)
- `src/app/api/legal-hub/cases/[id]/generated-documents/[gid]/route.ts` — GET + PATCH + DELETE
- `src/app/api/legal-hub/cases/[id]/generated-documents/[gid]/export/route.ts` — GET: exports DOCX, saves to `DOCUMENTS_DIR/case-generated/[caseId]/`, streams download
- `src/app/(app)/legal-hub/templates/page.tsx` — server thin wrapper for template management
- `src/components/legal-hub/template-management-page.tsx` — "use client" container: list/form toggle
- `src/components/legal-hub/template-list.tsx` — table of templates with edit/delete
- `src/components/legal-hub/template-form.tsx` — create/edit template with TipTap editor + variable reference panel
- `src/components/legal-hub/case-generate-tab.tsx` — Generate tab: template selector, TipTap editor, save, export DOCX, document history list

### Files Modified

- `lib/db.js` — added 10 helpers: `getCaseTemplates`, `getCaseTemplateById`, `createCaseTemplate`, `updateCaseTemplate`, `deleteCaseTemplate`, `getCaseGeneratedDocs`, `getCaseGeneratedDocById`, `createCaseGeneratedDoc`, `updateCaseGeneratedDoc`, `deleteCaseGeneratedDoc`
- `lib/db.d.ts` — appended 10 declarations
- `src/lib/db-imports.ts` — appended 10 exports
- `src/components/legal-hub/case-detail-page.tsx` — added `CaseGenerateTab` import, replaced "Coming soon" placeholder for generate tab
- `src/components/layout/app-sidebar.tsx` — added "Templates" nav item in Legal Hub group, refined "Cases" isActive check to exclude `/legal-hub/templates`

### Key Decisions

- **Response envelope keys follow Lead directive**: `{ templates }`, `{ template }`, `{ generated_documents }`, `{ generated_document }` — resource-named envelopes
- **`logAction` entity_type**: `'case_template'` for template CRUD; `'legal_case'` for generate/generated-doc operations
- **Re-export wrappers** (`src/lib/template-engine-imports.ts`, `src/lib/docx-export-imports.ts`): follows the established `paths-imports.ts`, `audit-imports.ts`, `db-imports.ts` pattern — avoids deep relative paths in API routes
- **TipTap usage**: `useEditor` with `StarterKit`, `editor.commands.setContent(html)` to load content, `editor.getHTML()` via onUpdate callback. First TipTap usage in the codebase.
- **DOCX export**: plain text paragraphs only (strips HTML). Rich formatting not preserved in v1 — noted as limitation.
- **fillTemplate returns `{ html, snapshot }`**: snapshot is stored as `filled_variables_json` for traceability

### INTEGRATION

- Task 5 (Chat): will modify `case-detail-page.tsx` to replace the Chat tab placeholder — no conflict since it's a different `activeTab` branch
- `getCaseParties` and `getCaseDeadlines` (from Task 2) are consumed by the generate endpoint
- DOCX files are written to `DOCUMENTS_DIR/case-generated/[caseId]/`

### Review Fix Cycle 1

Three fixes applied from reviewer-4:

1. **Template body sanitization** — Added `sanitizeTemplateHtml()` in both `templates/route.ts` (POST) and `templates/[id]/route.ts` (PATCH). Strips `<script>` tags and inline `on*` event handlers before DB storage.
2. **logAction in export route** — Added `logAction("legal_case", caseId, "document_exported", ...)` in `export/route.ts` after updating `file_path`.
3. **Template not found status code** — Changed from 400 to 404 in `generate/route.ts` when `getCaseTemplateById(templateId)` returns null.

### Build Verification

- `tsc --noEmit` passes clean (verified after all fixes)
- `next build` passes — `/legal-hub/templates` (234 kB) and `/legal-hub/[id]` (292 kB) both compile
