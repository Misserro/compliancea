# Lead Notes — Plan 032: Rich Template Editor

## Plan Overview
Deliver law-firm-grade template authoring by fixing two root failures:
1. No toolbar in Tiptap editor (both template-form.tsx and case-generate-tab.tsx)
2. DOCX export strips all HTML to plain text

## Concurrency Decision
- Max 3 concurrent task-teams
- Tasks 1 and 3 start in parallel (independent)
- Task 2 pipeline-spawned when Task 1 enters review/test
- Task 4 blocked by both Task 1 AND Task 3

## Task Dependency Graph
- Task 1: no dependencies — Rich editor + template-form.tsx
- Task 2: depends on Task 1 — Wire editor into case-generate-tab.tsx
- Task 3: no dependencies — Rewrite DOCX export (htmlparser2)
- Task 4: depends on Task 1 AND Task 3 — Upgrade system templates

## Key Architectural Constraints
1. Shared `RichTextEditor` component at `src/components/ui/rich-text-editor.tsx` — used by BOTH template-form.tsx and case-generate-tab.tsx
2. DOCX export: custom htmlparser2 + docx library (NOT html-to-docx package). A4 page (11906×16838 twips), left margin 1985, others 1418.
3. Font size via custom FontSize extension extending TextStyle — NOT a separate npm package
4. NO text color / text highlight (out of scope)
5. Polish legal standards: Times New Roman 12pt default, 1.15 line spacing
6. System templates use UPDATE (not skip) when re-seeding to replace bare HTML with rich HTML

## Critical Decisions
- Custom htmlparser2 approach chosen over html-to-docx npm package (user preference, full control)
- Text color excluded (not appropriate for court filings)
- AI drafting excluded (separate future plan)
- Font size: custom extension, not npm package

## New npm Packages
Tiptap: @tiptap/extension-underline, @tiptap/extension-text-align, @tiptap/extension-text-style, @tiptap/extension-font-family, @tiptap/extension-table, @tiptap/extension-table-row, @tiptap/extension-table-header, @tiptap/extension-table-cell
DOCX: htmlparser2, domhandler

## Files Primarily Affected
- src/components/ui/rich-text-editor.tsx (NEW)
- src/components/legal-hub/template-form.tsx
- src/components/legal-hub/case-generate-tab.tsx
- lib/docxExport.js (complete rewrite)
- lib/db.js (initSystemTemplates() rewrite)
- package.json

## Execution Log
