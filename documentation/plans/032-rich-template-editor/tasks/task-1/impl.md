# Task 1 — Implementation Notes

## Packages Installed
```
@tiptap/extension-underline
@tiptap/extension-text-align
@tiptap/extension-text-style
@tiptap/extension-font-family
@tiptap/extension-table
```

Note: In Tiptap v3, `TableRow`, `TableHeader`, `TableCell` are named exports from `@tiptap/extension-table` — no separate packages needed. `TextStyle` also uses named export (not default).

## Files Changed

### `src/components/ui/rich-text-editor.tsx` (NEW)
- Custom `FontSize` extension (~25 lines) extending TextStyle with `font-size` inline style attribute
- `RichTextEditor` component with props: `content`, `onChange`, `placeholder`, `className`, `minHeight`
- Toolbar with all specified sections: font family dropdown, font size dropdown, bold/italic/underline, H1/H2/H3/P, alignment (left/center/right/justify), lists (bullet/ordered), table controls (insert + contextual row/col/delete)
- Native `<select>` elements for font family and size (avoids Radix focus-stealing from editor)
- Toolbar buttons use Lucide icons where appropriate, text labels for headings
- Table row/col/delete controls only appear when cursor is inside a table

### `src/components/legal-hub/template-form.tsx` (MODIFIED)
- Removed: `useEditor`, `EditorContent` imports, `StarterKit` import, `editor` instance, `useEffect` for content sync
- Added: `RichTextEditor` import from `@/components/ui/rich-text-editor`
- Replaced `<EditorContent>` with `<RichTextEditor ref={editorRef} content={...} onChange={setTemplateBody} />`
- Variable reference panel: fully functional — clipboard copy primary, `editorRef.current.insertText(token)` fallback when clipboard unavailable
- Added `useRef<RichTextEditorHandle>` for editor access

### `package.json` (MODIFIED)
- 5 new Tiptap extension dependencies added (4 net new packages installed, text-style was a transitive dep)

## Design Decisions
1. **Native `<select>` over Radix Select** — Radix Select steals focus from the Tiptap editor on open, which is disruptive. Native select works reliably.
2. **`forwardRef` + `useImperativeHandle`** — Exposes `insertText` via ref handle so template-form.tsx can insert variable tokens as clipboard fallback. Minimal API surface (only `insertText` exposed, not the full editor).
3. **Content sync via `useEffect`** — The RichTextEditor syncs content prop changes to handle external updates (e.g., loading a different template).

## Build Verification
- TypeScript: `tsc --noEmit` passes with zero errors
- Next.js: `next build` succeeds, all pages compile
