# Task 2 — Implementation Notes

## File Changed

### `src/components/legal-hub/case-generate-tab.tsx` (MODIFIED)

**Removed:**
- `import { useEditor, EditorContent } from "@tiptap/react"`
- `import StarterKit from "@tiptap/starter-kit"`
- `const editor = useEditor({ ... })` instance (was lines 54-60)
- Three `editor.commands.setContent()` calls in `handleGenerate`, `handleOpenDoc`, and `handleCloseEditor`

**Added:**
- `import { RichTextEditor } from "@/components/ui/rich-text-editor"`
- `<RichTextEditor content={editorContent} onChange={setEditorContent} minHeight="400px" className="border-0 rounded-none" />`

**Unchanged:**
- `handleSave` — still reads `editorContent` state and PATCHes to API
- `handleExport` — still GETs from export endpoint and triggers blob download
- `handleDeleteDoc` — still DELETEs via API
- All state variables (`editorContent`, `activeDoc`, `saving`, `exporting`, etc.)

## Design Decisions

1. **`className="border-0 rounded-none"`** — The `RichTextEditor` renders its own `border rounded-lg overflow-hidden` wrapper. Since the parent container already provides `border rounded-lg overflow-hidden`, the inner border is suppressed to avoid double borders. The toolbar's `border-b` still renders correctly as it's an inner element.

2. **No `editor.commands.setContent()` calls needed** — The `RichTextEditor` component has an internal `useEffect` that syncs the `content` prop to the editor when it changes. Setting `editorContent` state is sufficient; the component handles the rest.

3. **No ref/imperative handle needed** — Unlike `template-form.tsx` which uses the ref for clipboard copy, `case-generate-tab.tsx` has no need to imperatively control the editor.

## Build Verification
- TypeScript: `tsc --noEmit` passes with zero errors
