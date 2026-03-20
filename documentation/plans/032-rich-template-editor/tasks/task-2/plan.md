# Task 2 — Wire Rich Editor into Generated Document Editor

## Summary

Replace the bare `useEditor` + `EditorContent` + `StarterKit` in `case-generate-tab.tsx` with the shared `RichTextEditor` component from Task 1.

## File Changed

`src/components/legal-hub/case-generate-tab.tsx`

## Changes

### 1. Remove old editor imports and setup

Remove:
- `import { useEditor, EditorContent } from "@tiptap/react"`
- `import StarterKit from "@tiptap/starter-kit"`
- The `editor` instance created via `useEditor` (lines 54-60)

### 2. Add RichTextEditor import

```tsx
import { RichTextEditor } from "@/components/ui/rich-text-editor";
```

### 3. Replace `editorContent` state management

Currently, `editorContent` is updated by `useEditor`'s `onUpdate` callback. With `RichTextEditor`, the `onChange` prop will be passed `setEditorContent` directly — identical behavior.

The `editorContent` state variable remains (used by `handleSave`), but its source changes from `useEditor.onUpdate` to `RichTextEditor.onChange`.

### 4. Remove direct `editor.commands.setContent()` calls

Three places call `editor.commands.setContent()`:
- `handleGenerate` (line 146-147) — after generating, sets content in editor
- `handleOpenDoc` (line 162-163) — when opening a saved doc
- `handleCloseEditor` (line 173-174) — clears editor

With `RichTextEditor`, content sync happens via the `content` prop and the component's internal `useEffect`. So we just need to update the `editorContent` state variable and the `RichTextEditor` will sync automatically.

This means we can remove the `editor` variable entirely and all three `editor.commands.setContent()` calls. The `editorContent` state is already being set in all three locations, which feeds into `RichTextEditor`'s `content` prop.

### 5. Replace JSX

Replace:
```tsx
<EditorContent
  editor={editor}
  className="prose prose-sm dark:prose-invert max-w-none p-4 min-h-[400px]"
/>
```

With:
```tsx
<RichTextEditor
  content={editorContent}
  onChange={setEditorContent}
  minHeight="400px"
/>
```

Note: `RichTextEditor` includes its own border/rounded-lg wrapper, but here it's nested inside an existing `border rounded-lg overflow-hidden` container. We should either:
- Pass `className="border-0 rounded-none"` to remove the inner border, OR
- Remove the component's default border by not wrapping it

Looking at the current layout, the editor is inside a bordered container with a header bar. The `RichTextEditor` adds its own `border rounded-lg overflow-hidden`. To avoid double borders, pass `className="border-0 rounded-none"` to suppress the inner border.

### 6. Unchanged flows

- **Save** (`handleSave`): reads `editorContent` state, PATCHes to API — no change needed
- **Export** (`handleExport`): fetches from API export endpoint — no change needed
- **Delete** (`handleDeleteDoc`): API call + close editor — no change needed

## Risk Assessment

- Low risk: straightforward component swap
- The `RichTextEditor`'s `useEffect` content sync handles all the `setContent` calls we're removing
- Save/export flows don't touch the editor directly, only read `editorContent` state
