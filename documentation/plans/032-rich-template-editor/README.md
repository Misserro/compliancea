# Plan 032 — Rich Template Editor (Law-Firm Grade)

**Status:** Awaiting approval
**Created:** 2026-03-20

## Problem

The legal template system (Plans 022 + 027) is functionally correct but produces unprofessional output. Two root causes:

1. **No editor toolbar** — Tiptap's StarterKit is installed but there is zero toolbar UI. Users write in an unstyled blank div and cannot apply bold, headings, tables, or alignment.
2. **DOCX export destroys formatting** — `lib/docxExport.js` deliberately strips all HTML to plain text ("not preserved in v1"). Every heading, bold, table, and alignment choice is lost in the downloaded `.docx` file.

## Goal

Deliver a professional template authoring experience where:
- Users can format templates using a toolbar (bold/italic/underline, heading levels, font family, font size, text alignment, tables)
- Exported DOCX files preserve all formatting with A4 layout and page numbering
- System templates are rewritten with proper Polish legal document structure

## Out of Scope

- AI-assisted template drafting (separate future plan)
- Text color / text highlight (not appropriate for court filings)
- PDF export (separate future consideration)

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DOCX parser | Custom `htmlparser2` + `docx` library | Full control over A4 margins, font defaults, page number footer; Polish-specific formatting requirements |
| Font color | Not included | Polish court filings are black on white; would encourage non-compliant documents |
| Shared editor | Single `RichTextEditor` component | Both `template-form.tsx` and `case-generate-tab.tsx` need the same toolbar; shared component avoids drift |
| Font size | Custom `FontSize` Tiptap extension (~20 lines) | Tiptap v3 has no first-party font-size extension; extending `TextStyle` is the canonical pattern |

## New Packages Required

### npm install (Tiptap extensions)
```
@tiptap/extension-underline
@tiptap/extension-text-align
@tiptap/extension-text-style
@tiptap/extension-font-family
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-header
@tiptap/extension-table-cell
```

### npm install (DOCX export)
```
htmlparser2
domhandler
```

## DOCX Page Layout (Polish Court Standard)

| Property | Value | Unit |
|----------|-------|------|
| Page size | A4 (11906 × 16838 twips) | twips |
| Top margin | 1418 twips | ≈ 2.5 cm |
| Bottom margin | 1418 twips | ≈ 2.5 cm |
| Left margin | 1985 twips | ≈ 3.5 cm |
| Right margin | 1418 twips | ≈ 2.5 cm |
| Default font | Times New Roman | — |
| Default size | 12pt | — |
| Line spacing | 1.15 | — |
| Footer | Page number (right-aligned) | — |

## Tasks

- [ ] **Task 1** — Rich editor component + template authoring upgrade
- [ ] **Task 2** — Wire rich editor into generated document editor
- [ ] **Task 3** — Rewrite DOCX export with full HTML fidelity
- [ ] **Task 4** — Upgrade system templates with professional Polish legal structure

---

## Task 1 — Rich Editor Component + Template Authoring Upgrade

**Description:**
Install the required Tiptap extension packages. Create a shared `RichTextEditor` component (`src/components/ui/rich-text-editor.tsx`) with a full formatting toolbar. Replace the bare `EditorContent` in `template-form.tsx` with this new component.

**Files affected:**
- `package.json` — add 8 Tiptap extension packages
- `src/components/ui/rich-text-editor.tsx` — new shared component (create)
- `src/components/legal-hub/template-form.tsx` — replace `EditorContent` + `useEditor` with `RichTextEditor`

**Component specification (`RichTextEditor`):**

Props:
```typescript
interface RichTextEditorProps {
  content: string;          // initial HTML content
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;       // default: "300px"
}
```

Extensions to load:
- `StarterKit` (existing — bold, italic, headings H1-H3, bullet list, ordered list, blockquote, horizontal rule)
- `Underline`
- `TextAlign.configure({ types: ['heading', 'paragraph'] })`
- `TextStyle` (required base for font-family and font-size)
- `FontFamily`
- custom `FontSize` extension (extend TextStyle with `font-size` attribute)
- `Table.configure({ resizable: true })`
- `TableRow`, `TableHeader`, `TableCell`

Toolbar sections (left to right):
1. **Font family** — Select dropdown: Times New Roman, Arial, Calibri, Georgia, Verdana; "Default" option resets to inherited
2. **Font size** — Select dropdown: 8, 9, 10, 11, 12 (default), 14, 16, 18, 20, 24 pt
3. Divider
4. **Bold** (Ctrl+B), **Italic** (Ctrl+I), **Underline** (Ctrl+U)
5. Divider
6. **Heading level** — Buttons: H1, H2, H3, paragraph (P)
7. Divider
8. **Alignment** — Left, Center, Right, Justify icons
9. Divider
10. **Lists** — Bullet list, ordered list
11. Divider
12. **Table** — "Insert table" button (opens simple 3×3 default), "Add row", "Delete row", "Add column", "Delete column", "Delete table" (shown only when cursor is inside a table)

Toolbar styling: `border-b bg-muted/30 px-2 py-1 flex flex-wrap gap-1` — compact, fits on one row for 1024px+; wraps on smaller viewports.

**Custom FontSize extension:**
```javascript
// Extend TextStyle to carry font-size as an inline style attribute
import { Extension } from '@tiptap/core'
import '@tiptap/extension-text-style'

export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: {
      fontSize: {
        default: null,
        parseHTML: el => el.style.fontSize?.replace('pt', '') || null,
        renderHTML: attrs => attrs.fontSize
          ? { style: `font-size: ${attrs.fontSize}pt` } : {},
      }
    }}]
  },
  addCommands() {
    return {
      setFontSize: size => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: null })
               .removeEmptyTextStyle().run(),
    }
  }
})
```

**Success criteria:**
- Opening the template form shows a toolbar with font, size, bold/italic/underline, headings, alignment, lists, and table controls
- Applying bold to text renders it bold in the editor
- Inserting a table creates a visible table in the editor canvas
- Changing font family to "Times New Roman" changes the visible text font
- Saving the template preserves all formatting (HTML is stored with inline styles and semantic tags)
- Variable reference panel in `template-form.tsx` remains fully functional alongside the new editor

**Dependencies:** none

---

## Task 2 — Wire Rich Editor into Generated Document Editor

**Description:**
Replace the bare `EditorContent` + `useEditor` in `case-generate-tab.tsx` with the shared `RichTextEditor` component from Task 1. The generated document editor must have the same formatting capabilities as the template editor.

**Files affected:**
- `src/components/legal-hub/case-generate-tab.tsx` — replace editor implementation with `RichTextEditor`

**Notes:**
- The generated document editor is used for post-generation editing; it does NOT need the variable reference panel
- Save (PATCH to API) and export (GET export route) flows remain unchanged
- The `RichTextEditor` `onChange` callback must update the local `editedContent` state identically to the previous `onUpdate` handler

**Success criteria:**
- Generating a document and clicking into the editor shows the same formatting toolbar as the template editor
- A user can apply bold/italic/heading/table formatting to a generated document
- Saving edited content via "Save" button works as before
- Exporting still triggers DOCX download (DOCX output quality is covered in Task 3)

**Dependencies:** Task 1 (shared `RichTextEditor` component must exist)

---

## Task 3 — Rewrite DOCX Export with Full HTML Fidelity

**Description:**
Completely rewrite `lib/docxExport.js`. Replace the HTML-stripping approach with a proper HTML-to-docx converter using `htmlparser2` to traverse Tiptap's HTML output and map it to `docx` library structures. Set A4 page layout with Polish court margins and a page number footer.

**Files affected:**
- `lib/docxExport.js` — complete rewrite
- `package.json` — add `htmlparser2`, `domhandler`

**HTML → docx mapping specification:**

| HTML element / attribute | docx output |
|--------------------------|-------------|
| `<p>` | `Paragraph` with inherited style |
| `<h1>` | `Paragraph` with `HeadingLevel.HEADING_1` |
| `<h2>` | `Paragraph` with `HeadingLevel.HEADING_2` |
| `<h3>` | `Paragraph` with `HeadingLevel.HEADING_3` |
| `<strong>` / `<b>` | `TextRun` with `bold: true` |
| `<em>` / `<i>` | `TextRun` with `italics: true` |
| `<u>` | `TextRun` with `underline: {}` |
| `<s>` / `<del>` | `TextRun` with `strike: true` |
| `style="text-align: center"` | `AlignmentType.CENTER` on paragraph |
| `style="text-align: right"` | `AlignmentType.RIGHT` on paragraph |
| `style="text-align: justify"` | `AlignmentType.BOTH` on paragraph |
| `style="font-family: ..."` | `TextRun` `font: { name }` |
| `style="font-size: Npt"` | `TextRun` `size: N*2` (half-points) |
| `<ul>` + `<li>` | `Paragraph` with `BulletLevel 0` |
| `<ol>` + `<li>` | `Paragraph` with numbered list |
| `<table>` | `Table` with `TableRow` + `TableCell` |
| `<td>` / `<th>` | `TableCell`; `<th>` adds bold to text |
| `<br>` | Empty `TextRun` with `break: 1` |
| `<hr>` | `Paragraph` with bottom border |
| HTML entities | Decoded: `&nbsp;` → space, `&amp;` → `&`, etc. |
| Nested inline elements | Accumulated style merging (bold + italic = both) |

**Page layout (Document-level properties):**
```javascript
sections: [{
  properties: {
    page: {
      size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
      margin: { top: 1418, bottom: 1418, left: 1985, right: 1418 }
    }
  },
  footers: {
    default: new Footer({
      children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT] })]
      })]
    })
  },
  children: parsedParagraphs
}]
```

**Document defaults:**
```javascript
new Document({
  styles: {
    default: {
      document: {
        run: { font: 'Times New Roman', size: 24 },  // 24 half-points = 12pt
        paragraph: { spacing: { line: 276 } }        // ~1.15 line spacing
      }
    }
  }
})
```

**Success criteria:**
- Export a document with bold text → the .docx file opens in Word with bold text preserved
- Export a document with a heading → the .docx file shows the heading in correct heading style
- Export a document with a table → the .docx file contains a properly structured table
- Export a document with centered text → alignment is preserved in .docx
- Export a document with font-family "Times New Roman" applied → font is correct in .docx
- Exported .docx has A4 page size when checked in Word page layout settings
- Page number appears in the footer of the exported .docx
- Polish characters (ą, ę, ź, ż) render correctly in the exported .docx

**Dependencies:** none (independent of Task 1 and 2)

---

## Task 4 — Upgrade System Templates with Professional Polish Legal Structure

**Description:**
Rewrite `initSystemTemplates()` in `lib/db.js` to seed 3 professionally structured Polish legal templates. Templates use rich HTML that takes advantage of all new editor capabilities (headings, bold labels, alignment, tables where appropriate). Templates follow standard Polish court document conventions.

**Files affected:**
- `lib/db.js` — rewrite the 3 template HTML bodies inside `initSystemTemplates()`

**Template specifications:**

### Wezwanie do zapłaty (Payment Demand Letter)

Structure:
1. **Header block** (right-aligned): City + `{{today}}` date
2. **Sender block**: `{{parties.representative.representative_name}}`, address `{{parties.representative.representative_address}}`
3. **Recipient block**: `{{parties.defendant.name}}`, address `{{parties.defendant.address}}`
4. **Document title** (centered, H1-bold): "WEZWANIE DO ZAPŁATY"
5. **Body paragraphs**: formal demand text with `{{parties.plaintiff.name}}`, `{{case.claim_value}}` `{{case.claim_currency}}`, claim description `{{case.claim_description}}`
6. **Payment deadline section**: [UZUPEŁNIJ: termin] days payment deadline, bank account [UZUPEŁNIJ: numer konta]
7. **Consequences paragraph**: warning of court proceedings
8. **Closing + signature block**: right-aligned, representative name

### Pozew (Civil Complaint)

Structure:
1. **Court block** (left-aligned): "Sąd [UZUPEŁNIJ: nazwa sądu]", division `{{case.court_division}}`, city [UZUPEŁNIJ]
2. **Powód block**: `{{parties.plaintiff.name}}`, address `{{parties.plaintiff.address}}`, NIP/REGON `{{parties.plaintiff.notes}}` — represented by `{{parties.representative.representative_name}}`, address `{{parties.representative.representative_address}}`
3. **Pozwany block**: `{{parties.defendant.name}}`, address `{{parties.defendant.address}}`, `{{parties.defendant.notes}}`
4. **Document title** (centered, H1-bold): "POZEW"
5. **Subtitle**: "o zapłatę kwoty `{{case.claim_value}}` `{{case.claim_currency}}`"
6. **Żądanie section** (H2): enumerated claims (numbered list): pay + interest + costs
7. **Uzasadnienie section** (H2): factual background with case data tokens
8. **Dowody section** (H2): evidence list (bullet list with [UZUPEŁNIJ: dowody] placeholder)
9. **Wartość przedmiotu sporu**: `{{case.claim_value}}` `{{case.claim_currency}}`
10. **Signature block**: date, representative name, "Załączniki:" list

### Replika (Reply Brief)

Structure:
1. **Court block**: same as pozew format
2. **Sygnatura akt**: `{{case.reference_number}}` or [UZUPEŁNIJ: sygnatura]
3. **Document title** (centered, H1-bold): "REPLIKA POWODA"
4. **Subtitle**: "na odpowiedź na pozew pozwanego `{{parties.defendant.name}}`"
5. **Opening**: "W odpowiedzi na pismo pozwanego z dnia [UZUPEŁNIJ: data]..."
6. **Stanowisko powoda section** (H2): rebuttal text with plaintiff/defendant tokens
7. **Wnioski section** (H2): list of requests
8. **Signature block**: date, representative name

**HTML conventions for templates:**
- Headings use `<h1>`, `<h2>` tags (rendered by new editor as styled headings)
- Bold labels use `<strong>`
- Right-aligned content uses `style="text-align: right"`
- Centered titles use `style="text-align: center"`
- Manual placeholders as `[UZUPEŁNIJ: …]` in bold: `<strong>[UZUPEŁNIJ: …]</strong>`

**Migration note:**
The existing system templates were seeded with bare HTML (no formatting tags). The `initSystemTemplates()` function checks by name before inserting (idempotent). To replace existing templates, change the check logic: if a system template exists, `UPDATE` it with the new `template_body` rather than skipping. Add a `template_version` field or use a hash comparison, or simply always UPDATE system templates on `initDb()`.

**Success criteria:**
- Fresh `initDb()` call seeds all 3 templates with the new rich HTML
- Opening "Wezwanie do zapłaty" in the template editor shows formatted content with visible heading, aligned blocks, and bold labels — not a flat wall of text
- Generating a document from "Pozew" and exporting as DOCX produces a Word document that a lawyer could use as a starting point (proper court heading, party blocks, numbered claim section)
- All `{{variable}}` tokens in the new templates resolve correctly when generating a document from a fully populated case

**Dependencies:** Task 1 (rich editor must be in place to verify templates render correctly), Task 3 (DOCX export must work to verify DOCX output quality)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `htmlparser2` traversal misses nested inline styles (e.g. bold inside a table cell) | Medium | Medium | Write unit test for nested case; implement style stack accumulation in parser |
| Tiptap v3 table extension API changed from v2 | Low | Medium | Check Tiptap v3 changelog before implementation; toolbar table commands differ slightly |
| `initSystemTemplates()` UPDATE logic on re-init could overwrite user edits to system templates | Low | Medium | System templates cannot be edited (is_system_template=1 guard); UPDATE is safe |
| DOCX page margins not matching Polish court standards exactly | Low | Low | Margins are configurable constants; easy to adjust post-review |

## Documentation Updated

| File | Change |
|------|--------|
| `documentation/technology/architecture/tech-stack.md` | Added Rich Text Editor section (new Tiptap extensions + htmlparser2) |
| `documentation/product/requirements/features.md` | Added "Legal Hub — Template Authoring (Plan 032)" section |
