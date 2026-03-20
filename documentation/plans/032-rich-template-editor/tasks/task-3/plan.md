# Task 3 Plan — Rewrite DOCX Export with Full HTML Fidelity

## Overview

Complete rewrite of `lib/docxExport.js` to replace the HTML-stripping approach with a proper HTML-to-docx converter using `htmlparser2` + `docx` library.

## Approach

### 1. Install dependencies
- `htmlparser2` and `domhandler` via npm

### 2. Architecture of the new `lib/docxExport.js`

The file will export a single function `htmlToDocx(html, title)` returning `Promise<Buffer>` — same contract as current code.

**Internal structure:**

1. **Parse HTML** — Use `htmlparser2.parseDocument(html)` to get a DOM tree
2. **Walk DOM** — Recursive traversal function that converts DOM nodes to docx elements
3. **Style stack** — Track inline formatting (bold, italic, underline, strike, font-family, font-size) via a style accumulator that merges as we descend into nested inline elements
4. **Block-level handler** — Maps `<p>`, `<h1-3>`, `<li>`, `<table>` etc. to docx Paragraphs/Tables
5. **Inline handler** — Maps `<strong>`, `<em>`, `<u>`, `<s>`, `<br>` etc. to TextRun properties
6. **List context** — Track whether we're inside `<ul>` or `<ol>` to apply bullet/numbered list formatting
7. **Table handler** — Convert `<table>` to Table with TableRow/TableCell, handling `<th>` bold
8. **Entity decoding** — Handle `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`

### 3. Document configuration

- A4 page: 11906 x 16838 twips (portrait)
- Margins: top 1418, bottom 1418, left 1985, right 1418
- Default font: Times New Roman, size 24 (12pt in half-points)
- Line spacing: 276 (1.15)
- Footer: right-aligned page number via PageNumber.CURRENT
- Numbering config for bullets and ordered lists

### 4. Files changed
- `lib/docxExport.js` — complete rewrite
- `package.json` — add htmlparser2, domhandler (via npm install)

### 5. Contract preservation
- Function signature: `htmlToDocx(html, title)` → `Promise<Buffer>`
- The `title` parameter will be rendered as a HEADING_1 paragraph at the top (same as current behavior)
- Export remains `export async function htmlToDocx` (ESM)
- Caller in `src/app/api/.../export/route.ts` unchanged

## Risk mitigation
- Nested inline styles: style stack accumulation ensures bold-inside-italic works
- Empty paragraphs: handle gracefully (empty TextRun)
- Polish characters: UTF-8 text in TextRun — docx library handles encoding natively
