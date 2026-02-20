# NDA Review Feature — Design Document
**Date:** 2026-02-20
**Status:** Approved

---

## Overview

Add an **NDA Review** option to the Cross-Reference & Questionnaire section on the Analyze & Ask page. Users upload an NDA (PDF or DOCX), select a jurisdiction, and receive a structured risk analysis report rendered in the app.

---

## User Flow

1. User opens the **Analyze & Ask** page and scrolls to the **Cross-Reference & Questionnaire** card.
2. User selects the **NDA Review** radio option (third alongside "Regulator Query" and "Questionnaire").
3. User uploads an NDA file (PDF or DOCX).
4. User selects a jurisdiction from a dropdown (Poland, EU, UK, USA, Germany, France, Netherlands, Switzerland, Singapore, or Other with free-text input).
5. User clicks **Review NDA**.
6. The app shows a loading status while the analysis runs.
7. The result is displayed as **rendered markdown** (tables, headings, risk emoji badges) below the form.
8. User can **Export as DOCX** to download the report.

---

## Architecture

### New Files

| File | Purpose |
|---|---|
| `src/app/api/nda/analyze/route.ts` | POST endpoint — extracts NDA text, fills prompt, calls Anthropic, returns `{ markdown: string }` |

### Modified Files

| File | Change |
|---|---|
| `src/components/analyze/desk-section.tsx` | Add `"nda"` to `DeskMode` union, add radio option, add `NdaReviewMode` sub-component |
| `src/lib/types.ts` | Add `NdaAnalysisResult` interface |

### New Dependencies

| Package | Purpose |
|---|---|
| `react-markdown` | Render markdown string to React elements |
| `remark-gfm` | GFM plugin for react-markdown (enables tables, strikethrough, etc.) |

---

## API Route — `/api/nda/analyze`

**Method:** POST
**Content-Type:** multipart/form-data

**Inputs:**
- `file` — PDF or DOCX file
- `jurisdiction` — string (e.g. "Poland", "European Union", "United Kingdom")

**Processing:**
1. Extract text from uploaded file using existing `extractTextFromBuffer` utility
2. Read `nda-analysis-prompt.md` from project root at runtime
3. Replace `{JURISDICTION}` with the provided jurisdiction string
4. Replace `{NDA_TEXT}` with the extracted document text
5. Call Anthropic (`claude-sonnet-4-20250514` or `CLAUDE_MODEL` env var) with the filled prompt
6. Return `{ markdown: string, tokenUsage: TokenUsage }`

**Error responses:**
- `400` — missing file, missing jurisdiction, unsupported file type, empty text extraction
- `500` — missing API key
- `502` — unexpected Anthropic response

---

## Component — `NdaReviewMode`

### Form state
- `file` — from `useRef<HTMLInputElement>`
- `jurisdiction` — selected from dropdown (`string`)
- `customJurisdiction` — free text when "Other" is selected (`string`)
- `loading` — boolean
- `status` — `{ message: string; type: "info" | "success" | "error" } | null`
- `result` — `string | null` (raw markdown)

### Jurisdiction list
Poland, European Union, United Kingdom, United States, Germany, France, Netherlands, Switzerland, Singapore, Other

### UI layout
```
[ File input (PDF or DOCX)                  ]

[ Jurisdiction dropdown ▼ ]
[ "Other" text input — shown only when "Other" selected ]

[ Review NDA ]   ← primary button, disabled while loading

— status message —

═══════════════════════════════════════
  NDA Analysis Report    [ Export as DOCX ]
  ─────────────────────────────────────────
  [Rendered markdown output]
```

### Markdown rendering
Uses `react-markdown` with `remark-gfm`. Styled with Tailwind prose classes to match the app's existing aesthetic (muted backgrounds for blockquotes, bordered tables, etc.).

### Export
Downloads the raw markdown string wrapped in basic HTML as a `.docx` file, using the existing `downloadBlob` utility — consistent with how other sections export.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| No file selected | Inline error: "Please select a PDF or DOCX file." |
| No jurisdiction selected | Inline error: "Please select a jurisdiction." |
| "Other" selected but text empty | Inline error: "Please enter a jurisdiction." |
| Unsupported file type | API 400 → shown as error status |
| Empty text extraction | API 400: "Could not extract any text from the uploaded file." |
| Anthropic failure | Error status message with details |
| Missing API key | API 500: "ANTHROPIC_API_KEY is not set." |

---

## Type Addition

```typescript
// src/lib/types.ts
export interface NdaAnalysisResult {
  markdown: string;
  tokenUsage?: TokenUsage;
}
```
