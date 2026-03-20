# Task 4 Plan — Upgrade System Templates with Professional Polish Legal Structure

## Goal
Rewrite `initSystemTemplates()` in `lib/db.js` to:
1. Change seeding logic from INSERT-if-not-exists to UPSERT (UPDATE existing system templates)
2. Replace all 3 template bodies with rich HTML using headings, alignment, bold labels, and proper structure

## Changes

### File: `lib/db.js` — `initSystemTemplates()` function (line 816)

**Seeding logic change (lines 927-935):**
- Current: checks `COUNT(*)` and only INSERTs if template doesn't exist
- New: INSERT OR replace logic — if a system template with the same name exists, UPDATE its `template_body`, `description`, and `document_type`. If not, INSERT.

```
for (const t of templates) {
  const existing = get(`SELECT id FROM case_templates WHERE name = ? AND is_system_template = 1`, [t.name]);
  if (existing) {
    run(
      `UPDATE case_templates SET template_body = ?, description = ?, document_type = ? WHERE id = ?`,
      [t.template_body, t.description, t.document_type, existing.id]
    );
  } else {
    run(
      `INSERT INTO case_templates (name, description, document_type, template_body, is_system_template) VALUES (?, ?, ?, ?, 1)`,
      [t.name, t.description, t.document_type, t.template_body]
    );
  }
}
```

**Template body rewrites:**

All 3 templates rewritten with rich HTML conventions:
- `<h1 style="text-align: center">` for document titles
- `<p style="text-align: right">` for dates and signature blocks
- `<strong>` for labels (Powód, Pozwany, etc.)
- `<ol><li>` for numbered claims
- `<ul><li>` for evidence/attachment lists
- `<strong>[UZUPEŁNIJ: ...]</strong>` for manual placeholders
- All `{{variable}}` tokens from templateEngine.js

### Token inventory (verified against templateEngine.js)

Used across templates:
- `{{today}}`, `{{case.reference_number}}`, `{{case.court}}`, `{{case.court_division}}`
- `{{case.claim_value}}`, `{{case.claim_currency}}`, `{{case.claim_description}}`, `{{case.summary}}`
- `{{parties.plaintiff.name}}`, `{{parties.plaintiff.address}}`, `{{parties.plaintiff.notes}}`
- `{{parties.defendant.name}}`, `{{parties.defendant.address}}`, `{{parties.defendant.notes}}`
- `{{parties.representative.representative_name}}`, `{{parties.representative.representative_address}}`
- `{{deadlines.next.due_date}}`

Note: `{{case.summary}}` exists in current templates and is valid (column exists in `legal_cases` table).

## Risks
- UPDATE only targets `is_system_template = 1` rows, so user-created templates with the same name are not affected
- The Replika template name is long — matching by exact name string
