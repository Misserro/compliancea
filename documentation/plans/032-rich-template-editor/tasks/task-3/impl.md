# Task 3 Implementation Notes — DOCX Export Rewrite

## Changes Made

### 1. `package.json` — added dependencies
- `htmlparser2` — HTML parser for DOM tree traversal
- `domhandler` — DOM node types (installed as htmlparser2 dependency)

### 2. `lib/docxExport.js` — complete rewrite

**Architecture:**

The file exports a single function `htmlToDocx(html, title)` returning `Promise<Buffer>` — identical contract to the previous version.

**Internal structure:**
- `processNodes(nodes)` — block-level dispatcher: maps `<p>`, `<h1-3>`, `<ul>`, `<ol>`, `<table>`, `<hr>`, `<blockquote>`, `<div>`, `<br>` to docx structures
- `buildParagraph(node, overrides)` — creates Paragraph with alignment from inline style and runs from children
- `collectTextRuns(nodes, inherited)` — recursive inline traversal with style accumulation. Handles `<strong>/<b>`, `<em>/<i>`, `<u>`, `<s>/<del>`, `<br>`, `<span>`, `<a>`, and font-family/font-size from inline styles
- `formatProps(style)` — converts accumulated style object to TextRun properties
- `buildList(listNode, reference)` — converts `<ul>/<ol>` to Paragraph array with numbering reference
- `buildTable(tableNode)` — handles `<table>` with `<thead>/<tbody>/<tfoot>` wrappers
- `buildTableRow(trNode)` — converts `<tr>` children (`<td>`/`<th>`) to TableCells; `<th>` gets bold text; supports colspan/rowspan; handles block-level content inside cells
- `buildBlockquote(node)` — indented paragraphs
- `buildHorizontalRule()` — paragraph with bottom border
- `parseInlineStyle(styleStr)` — parses CSS: font-family, font-size (pt to half-points), text-align
- `decodeEntities(str)` — handles `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, numeric entities

**Document configuration:**
- A4 page: 11906 x 16838 twips (portrait)
- Margins: top 1418, bottom 1418, left 1985, right 1418 (Polish court standard)
- Default font: Times New Roman, 24 half-points (12pt)
- Line spacing: 276 (1.15)
- Footer: right-aligned page number (PageNumber.CURRENT)
- Numbering config: "bullets" (bullet character) and "numbers" (decimal %1.)
- Table width: 8503 DXA (full content width)

**HTML-to-docx mapping implemented:**
- `<p>` → Paragraph
- `<h1>/<h2>/<h3>` → Paragraph with HeadingLevel
- `<strong>/<b>` → TextRun bold
- `<em>/<i>` → TextRun italics
- `<u>` → TextRun underline
- `<s>/<del>` → TextRun strike
- `text-align` → AlignmentType (LEFT/CENTER/RIGHT/BOTH)
- `font-family` → TextRun font
- `font-size: Npt` → TextRun size: N*2
- `<ul>/<li>` → Paragraph with bullets numbering
- `<ol>/<li>` → Paragraph with numbers numbering
- `<table>/<tr>/<td>/<th>` → Table/TableRow/TableCell
- `<br>` → TextRun break: 1
- `<hr>` → Paragraph with bottom border
- HTML entities decoded
- Nested inline styles accumulated (bold inside italic = both)
- `<blockquote>` → indented paragraphs
- `<div>` → transparent wrapper (recurses into children)

## No breaking changes
- Function signature unchanged: `htmlToDocx(html, title)` → `Promise<Buffer>`
- ESM export unchanged
- Re-export bridge `src/lib/docx-export-imports.ts` unchanged
- Caller in export route unchanged

## Tests performed
- Nested inline styles (bold+italic+underline)
- Empty/null HTML input
- Complex tables with thead/tbody
- Polish characters (ą ę ź ż ó ś ć ń)
- Alignment + custom font + font size
- Line breaks (`<br>`)
- HTML entities
- Strikethrough (`<del>`, `<s>`)
- TypeScript compilation passes
