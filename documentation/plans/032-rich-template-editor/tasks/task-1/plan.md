# Task 1 — Implementation Plan

## Overview
Create a shared `RichTextEditor` component with full formatting toolbar and wire it into `template-form.tsx`.

## Steps

### Step 1: Install Tiptap extension packages
```bash
npm install @tiptap/extension-underline @tiptap/extension-text-align @tiptap/extension-text-style @tiptap/extension-font-family @tiptap/extension-table
```
Note: Already installed: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`.
Per lead notes, TableRow/TableHeader/TableCell are named exports from `@tiptap/extension-table` in v3.

### Step 2: Create `src/components/ui/rich-text-editor.tsx`

**Architecture:**
- Single file containing:
  - Custom `FontSize` extension (~20 lines, extending TextStyle)
  - `RichTextEditor` component with embedded toolbar

**Props interface:**
```typescript
interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string; // default "300px"
}
```

**Extensions loaded:**
- StarterKit (bold, italic, headings, lists, blockquote, hr)
- Underline
- TextAlign configured for heading + paragraph
- TextStyle (base for font-family/font-size)
- FontFamily
- Custom FontSize (extend TextStyle with font-size attribute)
- Table.configure({ resizable: true }), TableRow, TableHeader, TableCell

**Toolbar layout (left to right):**
1. Font family dropdown (native `<select>`) — Times New Roman, Arial, Calibri, Georgia, Verdana, Default
2. Font size dropdown (native `<select>`) — 8,9,10,11,12,14,16,18,20,24
3. Separator
4. Bold (B), Italic (I), Underline (U) — toggle buttons using `Button` variant="ghost" size="sm"
5. Separator
6. H1, H2, H3, P — text label buttons
7. Separator
8. Alignment — AlignLeft, AlignCenter, AlignRight, AlignJustify Lucide icons
9. Separator
10. List, ListOrdered Lucide icons
11. Separator
12. Table insert button; conditional row/col/delete controls when cursor is in table

**Styling approach:**
- Toolbar: `border-b bg-muted/30 px-2 py-1 flex flex-wrap gap-1 items-center`
- Active buttons: `bg-muted` class toggled
- Native `<select>` elements for font/size (simpler than Radix Select, avoids focus issues with editor)
- Separators: thin vertical divider `w-px h-6 bg-border mx-1`
- Editor canvas: prose styles via `@tailwindcss/typography`

### Step 3: Update `src/components/legal-hub/template-form.tsx`

Changes:
- Remove `useEditor`, `EditorContent` imports from @tiptap/react
- Remove `StarterKit` import
- Remove `editor` instance and its `useEffect`
- Import `RichTextEditor` from `@/components/ui/rich-text-editor`
- Replace the `<EditorContent>` block with `<RichTextEditor content={...} onChange={setTemplateBody} />`
- Keep all other logic (name, description, documentType, submit, variable reference panel) unchanged

### Step 4: Verify variable reference panel still works
- The `handleCopy` function uses `editor.commands.insertContent(token)` as fallback
- Since we no longer expose the editor instance directly, the fallback path changes
- The primary flow (clipboard copy + manual paste) remains unchanged
- We can add an optional `editorRef` or simply let clipboard be the mechanism (current primary behavior)

## Files Changed
1. `package.json` — 5 new dependencies
2. `src/components/ui/rich-text-editor.tsx` — NEW
3. `src/components/legal-hub/template-form.tsx` — MODIFIED

## Risks
- Native `<select>` for font/size may look slightly different across browsers — acceptable trade-off for simplicity and no focus-stealing from editor
- FontSize custom extension follows the exact pattern from the plan README
