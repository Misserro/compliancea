# Task 1 — Implementation Notes

## File changed: `lib/db.js`

### Change 1: ALTER TABLE migration (line 559-564)
Added `is_system_template INTEGER DEFAULT 0` column migration using the existing try/catch pattern. Placed after the `case_generated_docs` CREATE TABLE block, before Legal Hub indexes.

### Change 2: `initSystemTemplates()` function (lines 631-755)
- Module-level (non-exported) function defined between `initDb()` and `saveDb()`
- Contains 3 template definitions with verbatim HTML from the plan README.md
- Uses `get()` helper for idempotent COUNT(*) check by template name
- Uses `run()` helper for INSERT with `is_system_template = 1`
- Template bodies use JS template literals (no backtick conflicts with HTML)

### Change 3: Call in initDb() (line 623)
`initSystemTemplates()` called just before `saveDb()` at end of `initDb()`, after all migrations have run (including the ALTER TABLE that adds the column).

### Idempotency
- Each template checked by name before INSERT
- Existing user-created templates unaffected (get DEFAULT 0 for is_system_template)
- Re-running initDb() skips INSERT if template name already exists
