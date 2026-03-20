# Task 4 Implementation Notes — Upgrade System Templates

## File Modified
- `lib/db.js` — `initSystemTemplates()` function (line 816)

## Changes Made

### 1. Seeding logic: UPSERT instead of skip
**Before (line 927-934):** `SELECT COUNT(*) ... WHERE name = ?` — skipped if template existed.
**After (line 936-948):** `SELECT id ... WHERE name = ? AND is_system_template = 1` — UPDATEs `template_body`, `description`, `document_type` if exists; INSERTs if not. Only targets system templates (`is_system_template = 1`), so user-created templates with the same name are safe.

### 2. Rich HTML template rewrites

All 3 templates now use professional Polish legal document structure:

**Wezwanie do zapłaty:**
- Right-aligned date header: `<p style="text-align: right">`
- Sender block (representative), then acting-on-behalf block (plaintiff), then recipient (defendant)
- Centered title: `<h1 style="text-align: center">WEZWANIE DO ZAPŁATY</h1>`
- Numbered H2 sections (I-IV): Podstawa roszczenia, Wysokość roszczenia, Termin i rachunek, Skutki braku zapłaty
- Right-aligned signature block
- Attachment list as `<ul>`

**Pozew:**
- Right-aligned date header
- Court block, Powód block (with representative), Pozwany block
- Centered title: `<h1 style="text-align: center">POZEW O ZAPŁATĘ</h1>`
- Wartość przedmiotu sporu in bold
- Numbered H2 sections: Żądanie pozwu (with `<ol>` claims), Uzasadnienie (with H3 subsections), Dowody (with `<ol>` evidence list)
- Right-aligned signature block
- Numbered attachment list as `<ol>`

**Replika:**
- Right-aligned date header
- Court block, sygnatura akt, party summary
- Centered title: `<h1 style="text-align: center">REPLIKA POWODA</h1>` with centered subtitle
- Numbered H2 sections: Wnioski procesowe (`<ol>`), Stanowisko powoda, Odpowiedź na zarzuty (H3 per zarzut), Wyjaśnienia, Nowe dowody, Podsumowanie
- Right-aligned signature block
- Attachment list as `<ul>`

### 3. HTML conventions applied
- All `[UZUPEŁNIJ: ...]` placeholders wrapped in `<strong>` tags
- Headings: `<h1>` for document title, `<h2>` for sections, `<h3>` for subsections
- Right-alignment: `style="text-align: right"` on date headers and signature blocks
- Center-alignment: `style="text-align: center"` on document titles
- Lists: `<ol>` for numbered claims/evidence, `<ul>` for attachment lists
- Bold labels: `<strong>Powód:</strong>`, `<strong>Pozwany:</strong>`, etc.

### 4. Tokens used (all verified against templateEngine.js)
`{{today}}`, `{{case.reference_number}}`, `{{case.court}}`, `{{case.court_division}}`, `{{case.claim_value}}`, `{{case.claim_currency}}`, `{{case.claim_description}}`, `{{case.summary}}`, `{{parties.plaintiff.name}}`, `{{parties.plaintiff.address}}`, `{{parties.plaintiff.notes}}`, `{{parties.defendant.name}}`, `{{parties.defendant.address}}`, `{{parties.defendant.notes}}`, `{{parties.representative.representative_name}}`, `{{parties.representative.representative_address}}`, `{{deadlines.next.due_date}}`
