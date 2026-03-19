# Task 1 — Implementation Plan: DB Migration + System Template Seeding

## File: `lib/db.js`

### Change 1: ALTER TABLE migration (after line 542, before indexes at line 559)

Insert after the `case_generated_docs` CREATE TABLE block (line 557), before the Legal Hub indexes:

```js
// ── case_templates: system template flag ──────────────────────────────
try {
  db.run(`ALTER TABLE case_templates ADD COLUMN is_system_template INTEGER DEFAULT 0`);
} catch (e) {
  // Column already exists, ignore
}
```

Uses raw `db.run()` — consistent with all other DDL migrations in `initDb()`.

### Change 2: `initSystemTemplates()` function

Define as a module-level function (not exported) below `initDb()`. Uses the exported `get()` and `run()` helpers (not raw `db.run`), since the module-level `db` is already initialized when this runs.

```js
function initSystemTemplates() {
  const templates = [
    { name: "Wezwanie do zapłaty", description: "...", document_type: "wezwanie", template_body: `...` },
    { name: "Pozew", description: "...", document_type: "pozew", template_body: `...` },
    { name: "Replika do odpowiedzi na pozew / replika do sprzeciwu od nakazu zapłaty", description: "...", document_type: "replika", template_body: `...` },
  ];

  for (const t of templates) {
    const existing = get(`SELECT COUNT(*) as count FROM case_templates WHERE name = ?`, [t.name]);
    if (existing && existing.count === 0) {
      run(
        `INSERT INTO case_templates (name, description, document_type, template_body, is_system_template) VALUES (?, ?, ?, ?, 1)`,
        [t.name, t.description, t.document_type, t.template_body]
      );
    }
  }
}
```

Key decisions:
- **`get()` helper** for SELECT: returns `{ count: 0 }` — avoids raw sql.js `db.exec()` API complexity.
- **`run()` helper** for INSERT: handles params correctly via `db.run(sql, params)` internally, also calls `saveDb()`.
- **Idempotency**: SELECT COUNT(*) by name before each INSERT.
- **Template bodies**: Verbatim HTML from README.md in template literals.

### Change 3: Call `initSystemTemplates()` at end of `initDb()`

Insert just before `saveDb()` (line 616):

```js
  // Seed system templates
  initSystemTemplates();

  // Save initial state
  saveDb();
```

Note: `run()` helper already calls `saveDb()` per INSERT, so the final `saveDb()` is a harmless flush.

### Risks & Mitigations

1. **`get()`/`run()` called before export**: These are module-level functions, not methods — calling them inside `initDb()` (same module) works fine since `db` is set by that point.
2. **Large template bodies**: Straightforward template literal strings. No escaping issues since HTML doesn't contain backticks.
3. **Duplicate prevention**: Using name as uniqueness key. If a user already created a template with the same name, it won't be overwritten.

### Verification

- App starts without errors
- `case_templates` table has `is_system_template` column
- 3 templates seeded with `is_system_template = 1`
- Re-running `initDb()` does not create duplicates
- Existing user templates unaffected (get `is_system_template = 0` from DEFAULT)
