import initSqlJs from "sql.js";
import fs from "fs";
import crypto from "crypto";
import { DB_PATH, ensureDirectories } from "./paths.js";

let db = null;

export const SESSION_ACTIVE_WINDOW_MINUTES = 15;

/**
 * Initialize the database
 * Loads existing database file or creates a new one
 */
export async function initDb() {
  // Ensure directories exist (documents and db)
  ensureDirectories();

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL mode for improved read concurrency
  db.run("PRAGMA journal_mode=WAL;");

  // Create tables if they don't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      folder TEXT,
      category TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed INTEGER DEFAULT 0,
      page_count INTEGER,
      word_count INTEGER
    )
  `);

  // Add category column if it doesn't exist (migration for existing databases)
  try {
    db.run(`ALTER TABLE documents ADD COLUMN category TEXT`);
  } catch (e) {
    // Column already exists, ignore error
  }

  // Phase 0 migrations: enriched metadata columns
  const phase0Columns = [
    { name: "content_hash", def: "TEXT" },
    { name: "file_hash", def: "TEXT" },
    { name: "status", def: "TEXT DEFAULT 'draft'" },
    { name: "doc_type", def: "TEXT" },
    { name: "client", def: "TEXT" },
    { name: "jurisdiction", def: "TEXT" },
    { name: "tags", def: "TEXT" },
    { name: "source", def: "TEXT" },
    { name: "gdrive_file_id", def: "TEXT" },
    { name: "gdrive_modified_time", def: "TEXT" },
    { name: "sync_status", def: "TEXT" },
    { name: "canonical_id", def: "INTEGER" },
    { name: "superseded_by", def: "INTEGER" },
    { name: "version", def: "INTEGER DEFAULT 1" },
    { name: "retention_label", def: "TEXT" },
    { name: "retention_until", def: "DATETIME" },
    { name: "legal_hold", def: "INTEGER DEFAULT 0" },
    { name: "auto_tags", def: "TEXT" },
    { name: "confirmed_tags", def: "INTEGER DEFAULT 0" },
    { name: "metadata_json", def: "TEXT" },
    { name: "updated_at", def: "DATETIME" },
    { name: "sensitivity", def: "TEXT DEFAULT 'internal'" },
    { name: "language", def: "TEXT" },
    { name: "in_force", def: "TEXT DEFAULT 'unknown'" },
    { name: "full_text", def: "TEXT" },
  ];

  for (const col of phase0Columns) {
    try {
      db.run(`ALTER TABLE documents ADD COLUMN ${col.name} ${col.def}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Phase 0: Audit log table
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Phase 0: Document lineage table
  db.run(`
    CREATE TABLE IF NOT EXISTS document_lineage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      relationship TEXT NOT NULL,
      confidence REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES documents(id),
      FOREIGN KEY (target_id) REFERENCES documents(id)
    )
  `);


  // Version control: pending replacement candidates
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_replacements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      new_document_id INTEGER NOT NULL,
      candidate_id INTEGER NOT NULL,
      confidence REAL NOT NULL,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (new_document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (candidate_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pending_replacements_new ON pending_replacements(new_document_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pending_replacements_status ON pending_replacements(status)`);

  // Version control: precomputed line diffs
  db.run(`
    CREATE TABLE IF NOT EXISTS document_diffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_document_id INTEGER NOT NULL,
      new_document_id INTEGER NOT NULL,
      diff_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (old_document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (new_document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_document_diffs_new ON document_diffs(new_document_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_document_diffs_old ON document_diffs(old_document_id)`);

  // Phase 0: Policy rules table
  db.run(`
    CREATE TABLE IF NOT EXISTS policy_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      condition_json TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_params TEXT,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Phase 0: Tasks table
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      task_type TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    )
  `);

  // Phase 0: Legal holds table
  db.run(`
    CREATE TABLE IF NOT EXISTS legal_holds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matter_name TEXT NOT NULL,
      scope_json TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      released_at DATETIME
    )
  `);

  // Phase 0: User profile table (simulated, single-user)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT 'Default User',
      role TEXT DEFAULT 'admin',
      projects TEXT,
      departments TEXT,
      clearance_level INTEGER DEFAULT 10
    )
  `);

  // Insert default user profile if none exists
  const userCount = db.exec("SELECT COUNT(*) as count FROM user_profile");
  if (userCount[0]?.values[0]?.[0] === 0) {
    db.run(`
      INSERT INTO user_profile (name, role, projects, departments, clearance_level)
      VALUES ('Default User', 'admin', '[]', '["Finance","Compliance","Operations","HR","Board","IT"]', 10)
    `);
  }

  // Users table (authentication accounts)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT,
      password_hash TEXT,
      google_id     TEXT UNIQUE,
      avatar_url    TEXT,
      role          TEXT NOT NULL DEFAULT 'admin',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`);

  // User sessions table (for real-time session tracking and admin termination)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id           TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked      INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`);

  // App settings table (persisted key-value store for credentials, config, etc.)
  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Indexes for new tables
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_lineage_source ON document_lineage(source_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_lineage_target ON document_lineage(target_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_documents_gdrive ON documents(gdrive_file_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      embedding BLOB,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)
  `);

  // QA Cards table (reusable questionnaire answers)
  db.run(`
    CREATE TABLE IF NOT EXISTS qa_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_text TEXT NOT NULL,
      approved_answer TEXT NOT NULL,
      evidence_json TEXT,
      source_questionnaire TEXT,
      question_embedding BLOB,
      status TEXT DEFAULT 'approved',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_qa_cards_status ON qa_cards(status)`);

  // Contract obligations table
  db.run(`
    CREATE TABLE IF NOT EXISTS contract_obligations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      obligation_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      clause_reference TEXT,
      due_date TEXT,
      recurrence TEXT,
      notice_period_days INTEGER,
      owner TEXT,
      escalation_to TEXT,
      proof_description TEXT,
      evidence_json TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_obligations_document ON contract_obligations(document_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_obligations_status ON contract_obligations(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_obligations_due_date ON contract_obligations(due_date)`);

  // Contract obligations migration: add new category-based columns
  const obMigrationCols = [
    { name: "category", def: "TEXT" },
    { name: "activation", def: "TEXT DEFAULT 'active'" },
    { name: "summary", def: "TEXT" },
    { name: "details_json", def: "TEXT DEFAULT '{}'" },
    { name: "penalties", def: "TEXT" },
    { name: "stage", def: "TEXT DEFAULT 'active'" },
    { name: "department", def: "TEXT" },
    { name: "finalization_note", def: "TEXT" },
    { name: "finalization_document_id", def: "INTEGER" },
    { name: "start_date", def: "TEXT" },
    { name: "is_repeating", def: "INTEGER DEFAULT 0" },
    { name: "recurrence_interval", def: "INTEGER" },
    { name: "parent_obligation_id", def: "INTEGER REFERENCES contract_obligations(id)" },
  ];
  for (const col of obMigrationCols) {
    try {
      db.run(`ALTER TABLE contract_obligations ADD COLUMN ${col.name} ${col.def}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Category-specific typed columns for the 4-category system
  const obCategorySpecificCols = [
    { name: "payment_amount", def: "REAL" },
    { name: "payment_currency", def: "TEXT DEFAULT 'EUR'" },
    { name: "reporting_frequency", def: "TEXT" },
    { name: "reporting_recipient", def: "TEXT" },
    { name: "compliance_regulatory_body", def: "TEXT" },
    { name: "compliance_jurisdiction", def: "TEXT" },
    { name: "operational_service_type", def: "TEXT" },
    { name: "operational_sla_metric", def: "TEXT" },
  ];
  for (const col of obCategorySpecificCols) {
    try {
      db.run(`ALTER TABLE contract_obligations ADD COLUMN ${col.name} ${col.def}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Contract hub migration: add contract-specific metadata to documents
  const contractMetadataColumns = [
    { name: "contracting_company", def: "TEXT" },
    { name: "contracting_vendor", def: "TEXT" },
    { name: "signature_date", def: "TEXT" },
    { name: "commencement_date", def: "TEXT" },
    { name: "expiry_date", def: "TEXT" },
  ];
  for (const col of contractMetadataColumns) {
    try {
      db.run(`ALTER TABLE documents ADD COLUMN ${col.name} ${col.def}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Tasks table migration: add columns for contract obligations
  const taskMigrationCols = [
    { name: "due_date", def: "TEXT" },
    { name: "owner", def: "TEXT" },
    { name: "escalation_to", def: "TEXT" },
    { name: "obligation_id", def: "INTEGER" },
  ];
  for (const col of taskMigrationCols) {
    try {
      db.run(`ALTER TABLE tasks ADD COLUMN ${col.name} ${col.def}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Data-fix: correct obligations miscategorised as "termination" when their
  // stage is "signed" or "not_signed". Termination only applies to the
  // terminated stage — anything in signed/not_signed stages that was labelled
  // "termination" was produced by the old prompt and should be "others".
  try {
    db.run(`
      UPDATE contract_obligations
      SET category = 'others', obligation_type = 'others'
      WHERE category = 'termination'
        AND stage IN ('signed', 'not_signed')
    `);
  } catch (e) {
    // Non-fatal — log and continue
    console.warn("Category fix migration warning:", e.message);
  }

  // Product Hub: feature definitions and AI-generated documentation
  db.run(`
    CREATE TABLE IF NOT EXISTS product_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'Untitled Feature',
      intake_form_json TEXT,
      selected_document_ids TEXT,
      free_context TEXT,
      selected_templates TEXT,
      generated_outputs_json TEXT,
      status TEXT DEFAULT 'idea',
      version_history_json TEXT,
      linked_contract_id INTEGER,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_product_features_status ON product_features(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_product_features_created ON product_features(created_at)`);

  // Contract invoices table
  db.run(`
    CREATE TABLE IF NOT EXISTS contract_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      description TEXT,
      date_of_issue DATE,
      date_of_payment DATE,
      is_paid INTEGER DEFAULT 0,
      invoice_file_path TEXT,
      payment_confirmation_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_contract ON contract_invoices(contract_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_payment_date ON contract_invoices(date_of_payment)`);

  // Contract documents table (attachments: uploads or linked library docs)
  db.run(`
    CREATE TABLE IF NOT EXISTS contract_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      file_path TEXT,
      file_name TEXT,
      document_type TEXT DEFAULT 'other',
      label TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_contract_docs_contract ON contract_documents(contract_id)`);

  // ── Legal Hub tables ──────────────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS legal_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_number TEXT,
      internal_number TEXT,
      title TEXT NOT NULL,
      case_type TEXT NOT NULL,
      procedure_type TEXT,
      court TEXT,
      court_division TEXT,
      judge TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      status_history_json TEXT DEFAULT '[]',
      summary TEXT,
      claim_description TEXT,
      claim_value REAL,
      claim_currency TEXT DEFAULT 'PLN',
      tags TEXT DEFAULT '[]',
      extension_data TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS case_parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
      party_type TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      representative_name TEXT,
      representative_address TEXT,
      representative_type TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS case_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
      document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      file_path TEXT,
      file_name TEXT,
      document_category TEXT NOT NULL DEFAULT 'other',
      label TEXT,
      date_filed DATE,
      filing_reference TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS case_deadlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      deadline_type TEXT NOT NULL,
      due_date DATE NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS case_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      document_type TEXT,
      applicable_case_types TEXT DEFAULT '[]',
      template_body TEXT NOT NULL,
      variables_json TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS case_generated_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES case_templates(id) ON DELETE SET NULL,
      template_name TEXT,
      document_name TEXT NOT NULL,
      generated_content TEXT NOT NULL,
      filled_variables_json TEXT DEFAULT '{}',
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── case_templates: system template flag ──────────────────────────────
  try {
    db.run(`ALTER TABLE case_templates ADD COLUMN is_system_template INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Legal Hub indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_legal_cases_status ON legal_cases(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_legal_cases_case_type ON legal_cases(case_type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_case_parties_case ON case_parties(case_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_case_documents_case ON case_documents(case_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_case_documents_document ON case_documents(document_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_case_deadlines_case ON case_deadlines(case_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_case_deadlines_due ON case_deadlines(due_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_case_generated_docs_case ON case_generated_docs(case_id)`);

  // ── Documents: processing error tracking ──────────────────────────────
  try {
    db.run(`ALTER TABLE documents ADD COLUMN processing_error TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // ── Organization tables ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS org_members (
      org_id INTEGER NOT NULL REFERENCES organizations(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      invited_by INTEGER REFERENCES users(id),
      PRIMARY KEY (org_id, user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS org_invites (
      token TEXT PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id),
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      expires_at DATETIME NOT NULL,
      accepted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add created_at to org_invites for existing databases
  try {
    db.run(`ALTER TABLE org_invites ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  } catch (e) {
    // Column already exists
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_org_invites_org ON org_invites(org_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_org_invites_email ON org_invites(email)`);

  // ── org_id migration: add org_id to all data tables ─────────────────
  const orgIdTables = [
    'documents', 'legal_cases', 'contract_obligations', 'tasks',
    'legal_holds', 'policy_rules', 'qa_cards', 'audit_log',
    'case_templates', 'chunks', 'product_features'
  ];
  for (const table of orgIdTables) {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN org_id INTEGER REFERENCES organizations(id)`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Add user_id to audit_log
  try {
    db.run(`ALTER TABLE audit_log ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  } catch (e) {
    // Column already exists, ignore
  }

  // ── app_settings migration: recreate with composite PK (org_id, key) ─
  try {
    // Check if app_settings already has org_id
    db.exec(`SELECT org_id FROM app_settings LIMIT 0`);
    // org_id exists -- no migration needed
  } catch (e) {
    // org_id doesn't exist -- recreate table with composite PK
    // Errors MUST propagate here -- if RENAME succeeds but CREATE fails,
    // the database is in a broken state and must not be silently ignored.
    db.run(`ALTER TABLE app_settings RENAME TO app_settings_old`);
    db.run(`
      CREATE TABLE app_settings (
        org_id INTEGER NOT NULL DEFAULT 1,
        key TEXT NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (org_id, key)
      )
    `);
    db.run(`INSERT INTO app_settings (org_id, key, value, updated_at)
      SELECT 1, key, value, updated_at FROM app_settings_old`);
    db.run(`DROP TABLE app_settings_old`);
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_app_settings_org ON app_settings(org_id)`);

  // ── Chunks: page-aware metadata columns ───────────────────────────────
  const chunkMigrationCols = [
    { name: "page_number",       def: "INTEGER" },
    { name: "char_offset_start", def: "INTEGER" },
    { name: "char_offset_end",   def: "INTEGER" },
    { name: "section_title",     def: "TEXT" },
    { name: "sentences_json",    def: "TEXT" },
  ];
  for (const col of chunkMigrationCols) {
    try {
      db.run(`ALTER TABLE chunks ADD COLUMN ${col.name} ${col.def}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // ── FTS5 full-text index over chunks ──────────────────────────────────
  try {
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, content='chunks', content_rowid='id')`);

    db.run(`CREATE TRIGGER IF NOT EXISTS chunks_fts_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END`);

    db.run(`CREATE TRIGGER IF NOT EXISTS chunks_fts_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
    END`);

    db.run(`CREATE TRIGGER IF NOT EXISTS chunks_fts_au AFTER UPDATE OF content ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END`);

    // Backfill existing chunks into FTS index
    db.run(`INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')`);
  } catch (e) {
    console.warn("FTS5 setup warning (may not be available in this sql.js build):", e.message);
  }

  // ── Storage-layer columns ─────────────────────────────────────────
  const storageColumns = [
    { table: "documents", name: "storage_backend", def: "TEXT DEFAULT 'local'" },
    { table: "documents", name: "storage_key", def: "TEXT" },
    { table: "contract_documents", name: "storage_backend", def: "TEXT DEFAULT 'local'" },
    { table: "contract_documents", name: "storage_key", def: "TEXT" },
    { table: "contract_invoices", name: "invoice_storage_backend", def: "TEXT DEFAULT 'local'" },
    { table: "contract_invoices", name: "invoice_storage_key", def: "TEXT" },
    { table: "contract_invoices", name: "payment_storage_backend", def: "TEXT DEFAULT 'local'" },
    { table: "contract_invoices", name: "payment_storage_key", def: "TEXT" },
  ];
  for (const col of storageColumns) {
    try {
      db.run(`ALTER TABLE ${col.table} ADD COLUMN ${col.name} ${col.def}`);
    } catch (e) {
      // Column already exists
    }
  }

  // ── Super admin & soft-delete migrations (Plan 030) ──────────────────
  try { db.run(`ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0`); } catch (e) {}
  try { db.run(`ALTER TABLE organizations ADD COLUMN deleted_at DATETIME`); } catch (e) {}

  // ── Permission tables (Plan 031) ────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS member_permissions (
      org_id INTEGER NOT NULL REFERENCES organizations(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      resource TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'full',
      PRIMARY KEY (org_id, user_id, resource)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS org_permission_defaults (
      org_id INTEGER NOT NULL REFERENCES organizations(id),
      resource TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'full',
      PRIMARY KEY (org_id, resource)
    )
  `);

  // Seed system templates
  initSystemTemplates();

  // ── First-run org bootstrap ─────────────────────────────────────────
  const orgCount = get(`SELECT COUNT(*) as count FROM organizations`);
  if (orgCount && orgCount.count === 0) {
    // 1. Insert default organization
    run(`INSERT INTO organizations (name, slug) VALUES (?, ?)`, ["Default Organization", "default"]);

    // 2. Backfill org_id = 1 on all data tables
    const tablesToBackfill = [
      'documents', 'legal_cases', 'contract_obligations', 'tasks',
      'legal_holds', 'policy_rules', 'qa_cards', 'audit_log',
      'case_templates', 'app_settings', 'chunks', 'product_features'
    ];
    for (const table of tablesToBackfill) {
      try {
        run(`UPDATE ${table} SET org_id = 1 WHERE org_id IS NULL`, []);
      } catch (e) {
        // Table might be empty or column might not exist yet -- non-fatal
      }
    }

    // 3. Enroll all existing users as owners of the default org
    const existingUsers = query(`SELECT id FROM users`);
    for (const user of existingUsers) {
      run(`INSERT INTO org_members (org_id, user_id, role) VALUES (1, ?, 'owner')`, [user.id]);
    }

    // 4. Seed permission defaults for the default org (Plan 031)
    try {
      seedOrgPermissionDefaults(1);
    } catch (e) {
      console.warn('[permissions] seedOrgPermissionDefaults failed for default org:', e?.message);
    }
  }

  // ── Super admin bootstrap (Plan 030) ──────────────────────────────────
  // Grant super admin to all existing users
  run(`UPDATE users SET is_super_admin = 1`);
  // Also honour SUPER_ADMIN_EMAIL for future-proofing (new users registered after init)
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (superAdminEmail) {
    const user = get(`SELECT id FROM users WHERE email = ?`, [superAdminEmail.trim().toLowerCase()]);
    if (user) {
      run(`UPDATE users SET is_super_admin = 1 WHERE id = ?`, [user.id]);
    }
  }

  // Save initial state
  saveDb();

  return db;
}

/**
 * Idempotently seed built-in Polish legal templates.
 * Called at end of initDb(). Checks by name to avoid duplicates.
 */
function initSystemTemplates() {
  const templates = [
    {
      name: "Wezwanie do zapłaty",
      description: "Formalne przedsądowe wezwanie do zapłaty z uzupełnieniem danych sprawy i należności.",
      document_type: "wezwanie",
      template_body: `<p style="text-align: right"><strong>[UZUPEŁNIJ: miejscowość]</strong>, dnia {{today}}</p>
<p><strong>Nadawca:</strong><br>{{parties.representative.representative_name}}<br>{{parties.representative.representative_address}}</p>
<p><strong>Działając w imieniu:</strong><br>{{parties.plaintiff.name}}<br>{{parties.plaintiff.address}}<br>NIP/REGON: {{parties.plaintiff.notes}}</p>
<hr>
<p><strong>Adresat (Dłużnik):</strong><br>{{parties.defendant.name}}<br>{{parties.defendant.address}}<br>NIP/REGON: {{parties.defendant.notes}}</p>
<p>Ref. sprawy: {{case.reference_number}}</p>
<h1 style="text-align: center">WEZWANIE DO ZAPŁATY</h1>
<p>Działając jako pełnomocnik {{parties.plaintiff.name}}, na podstawie udzielonego pełnomocnictwa <strong>[UZUPEŁNIJ: pełnomocnictwo z dnia …]</strong>, niniejszym wzywam do niezwłocznego uregulowania zaległego świadczenia pieniężnego.</p>
<h2>I. Podstawa roszczenia</h2>
<p>{{case.claim_description}}</p>
<p>Tytuł prawny: <strong>[UZUPEŁNIJ: rodzaj stosunku prawnego, np. umowa z dnia … nr …, faktura VAT nr … z dnia …]</strong>.</p>
<h2>II. Wysokość roszczenia</h2>
<p>Łączna kwota wymagalnej należności głównej wynosi: <strong>{{case.claim_value}} {{case.claim_currency}}</strong>.</p>
<p>Do powyższej kwoty dolicza się odsetki: <strong>[UZUPEŁNIJ: rodzaj i wysokość odsetek, np. ustawowe odsetki za opóźnienie w transakcjach handlowych, naliczane od dnia … do dnia zapłaty]</strong>.</p>
<p>Łączna kwota zadłużenia na dzień sporządzenia niniejszego pisma (należność główna wraz z odsetkami): <strong>[UZUPEŁNIJ: kwota łączna]</strong> {{case.claim_currency}}.</p>
<h2>III. Termin i rachunek bankowy do zapłaty</h2>
<p>Wzywam do zapłaty wyżej wymienionej kwoty w terminie do dnia <strong>{{deadlines.next.due_date}}</strong> na rachunek bankowy:</p>
<p>Nr rachunku: <strong>[UZUPEŁNIJ: numer rachunku bankowego]</strong><br>Właściciel rachunku: {{parties.plaintiff.name}}<br>Tytuł przelewu: <strong>[UZUPEŁNIJ: tytuł przelewu, np. zapłata należności z tytułu umowy/faktury …]</strong></p>
<h2>IV. Skutki braku zapłaty</h2>
<p>W przypadku bezskutecznego upływu powyższego terminu {{parties.plaintiff.name}} zastrzega sobie prawo skierowania sprawy na drogę postępowania sądowego i dochodzenia należności w trybie przymusowym, wraz z żądaniem zwrotu kosztów postępowania, w tym kosztów zastępstwa procesowego.</p>
<p style="text-align: right">Z poważaniem,</p>
<p style="text-align: right">{{parties.representative.representative_name}}<br><strong>[UZUPEŁNIJ: tytuł zawodowy, np. adwokat/radca prawny]</strong><br>{{parties.representative.representative_address}}</p>
<p><strong>Załączniki:</strong></p>
<ul>
<li><strong>[UZUPEŁNIJ: lista załączników, np. kopia faktury, kopia umowy, kopia pełnomocnictwa]</strong></li>
</ul>`,
    },
    {
      name: "Pozew",
      description: "Profesjonalny szablon pozwu do wykorzystania w sprawach cywilnych i gospodarczych.",
      document_type: "pozew",
      template_body: `<p style="text-align: right"><strong>[UZUPEŁNIJ: miejscowość]</strong>, dnia {{today}}</p>
<p><strong>{{case.court}}</strong><br>{{case.court_division}}<br><strong>[UZUPEŁNIJ: adres sądu]</strong></p>
<p><strong>Powód:</strong><br>{{parties.plaintiff.name}}<br>{{parties.plaintiff.address}}<br>NIP/REGON/PESEL: {{parties.plaintiff.notes}}<br>reprezentowany przez: {{parties.representative.representative_name}}, {{parties.representative.representative_address}}, na podstawie pełnomocnictwa złożonego do akt sprawy</p>
<p><strong>Pozwany:</strong><br>{{parties.defendant.name}}<br>{{parties.defendant.address}}<br>NIP/REGON/PESEL: {{parties.defendant.notes}}</p>
<p><strong>Wartość przedmiotu sporu:</strong> {{case.claim_value}} {{case.claim_currency}}</p>
<h1 style="text-align: center">POZEW O ZAPŁATĘ</h1>
<h2>I. Żądanie pozwu</h2>
<p>Działając w imieniu i na rzecz powoda {{parties.plaintiff.name}}, na podstawie udzielonego pełnomocnictwa, wnoszę o:</p>
<ol>
<li>zasądzenie od pozwanego {{parties.defendant.name}} na rzecz powoda {{parties.plaintiff.name}} kwoty <strong>{{case.claim_value}} {{case.claim_currency}}</strong> wraz z odsetkami <strong>[UZUPEŁNIJ: rodzaj odsetek, np. ustawowymi odsetkami za opóźnienie w transakcjach handlowych]</strong> od dnia <strong>[UZUPEŁNIJ: data wymagalności]</strong> do dnia zapłaty;</li>
<li>zasądzenie od pozwanego kosztów postępowania, w tym kosztów zastępstwa procesowego według norm przepisanych;</li>
<li><strong>[UZUPEŁNIJ: inne żądania, np. nadanie wyrokowi rygoru natychmiastowej wykonalności — usunąć, jeśli nieaktualne]</strong>.</li>
</ol>
<h2>II. Uzasadnienie</h2>
<h3>Stan faktyczny</h3>
<p>{{case.summary}}</p>
<p>{{case.claim_description}}</p>
<p><strong>[UZUPEŁNIJ: rozszerzony opis stanu faktycznego — okoliczności zawarcia umowy/powstania zobowiązania, wykonania świadczenia przez powoda, daty wymagalności roszczenia, wezwanie do zapłaty z dnia … i jego bezskuteczność]</strong></p>
<h3>Podstawa prawna</h3>
<p><strong>[UZUPEŁNIJ: podstawa prawna roszczenia — np. art. 471 k.c. (odpowiedzialność kontraktowa), art. 535 k.c. (umowa sprzedaży), art. 6 ust. 1 ustawy o terminach zapłaty w transakcjach handlowych, lub inna adekwatna podstawa]</strong></p>
<h3>Właściwość sądu</h3>
<p><strong>[UZUPEŁNIJ: uzasadnienie właściwości miejscowej i rzeczowej sądu — np. właściwość ogólna wg miejsca zamieszkania/siedziby pozwanego (art. 27 k.p.c.), właściwość przemienna wg miejsca wykonania zobowiązania (art. 34 k.p.c.), lub właściwość wyłączna]</strong></p>
<h3>Próby polubownego rozwiązania sporu</h3>
<p><strong>[UZUPEŁNIJ: informacja o podjętych próbach polubownego rozwiązania — np. wezwanie do zapłaty z dnia … pozostało bez odpowiedzi / pozwany odmówił zapłaty]</strong></p>
<h2>III. Dowody</h2>
<p>Na potwierdzenie powyższego powód wnosi o przeprowadzenie następujących dowodów:</p>
<ol>
<li><strong>[UZUPEŁNIJ: dowód z dokumentu: umowa z dnia … — na okoliczność zawarcia stosunku zobowiązaniowego i jego treści]</strong></li>
<li><strong>[UZUPEŁNIJ: dowód z dokumentu: faktura VAT nr … z dnia … — na okoliczność wymagalności roszczenia]</strong></li>
<li><strong>[UZUPEŁNIJ: dowód z dokumentu: wezwanie do zapłaty z dnia … wraz z dowodem doręczenia — na okoliczność bezskuteczności wezwania]</strong></li>
<li><strong>[UZUPEŁNIJ: inne dowody wedle potrzeb]</strong></li>
</ol>
<p style="text-align: right">Z poważaniem,</p>
<p style="text-align: right">{{parties.representative.representative_name}}<br><strong>[UZUPEŁNIJ: tytuł zawodowy, np. adwokat/radca prawny]</strong><br>{{parties.representative.representative_address}}</p>
<p><strong>Załączniki:</strong></p>
<ol>
<li><strong>[UZUPEŁNIJ: Pełnomocnictwo — 1 egz.]</strong></li>
<li><strong>[UZUPEŁNIJ: Odpis pozwu dla pozwanego — 1 egz.]</strong></li>
<li><strong>[UZUPEŁNIJ: Dowód uiszczenia opłaty od pozwu]</strong></li>
<li><strong>[UZUPEŁNIJ: Umowa / faktura / wezwanie do zapłaty]</strong></li>
</ol>`,
    },
    {
      name: "Replika do odpowiedzi na pozew / replika do sprzeciwu od nakazu zapłaty",
      description: "Profesjonalny szablon repliki na odpowiedź na pozew albo na sprzeciw od nakazu zapłaty.",
      document_type: "replika",
      template_body: `<p style="text-align: right"><strong>[UZUPEŁNIJ: miejscowość]</strong>, dnia {{today}}</p>
<p><strong>{{case.court}}</strong><br>{{case.court_division}}</p>
<p>Sygnatura akt: <strong>[UZUPEŁNIJ: sygnatura akt sądowych]</strong></p>
<p><strong>Powód:</strong> {{parties.plaintiff.name}}<br><strong>Pozwany:</strong> {{parties.defendant.name}}<br><strong>Pełnomocnik powoda:</strong> {{parties.representative.representative_name}}, {{parties.representative.representative_address}}</p>
<h1 style="text-align: center">REPLIKA POWODA</h1>
<p style="text-align: center">na <strong>[UZUPEŁNIJ: odpowiedź na pozew / sprzeciw od nakazu zapłaty]</strong> pozwanego {{parties.defendant.name}}</p>
<p>Działając jako pełnomocnik powoda {{parties.plaintiff.name}}, w odpowiedzi na <strong>[UZUPEŁNIJ: odpowiedź na pozew / sprzeciw od nakazu zapłaty]</strong> pozwanego {{parties.defendant.name}} z dnia <strong>[UZUPEŁNIJ: data pisma pozwanego]</strong>, wnoszę o:</p>
<h2>I. Wnioski procesowe</h2>
<ol>
<li><strong>[UZUPEŁNIJ: utrzymanie nakazu zapłaty w mocy / oddalenie powództwa wzajemnego / oddalenie wniosków pozwanego — wedle potrzeb]</strong></li>
<li>zasądzenie od pozwanego kosztów postępowania, w tym kosztów zastępstwa procesowego.</li>
</ol>
<h2>II. Stanowisko powoda</h2>
<p>Powód podtrzymuje w całości powództwo oraz twierdzenia faktyczne i prawne zawarte w pozwie.</p>
<p>Twierdzenia i zarzuty zawarte w <strong>[UZUPEŁNIJ: odpowiedzi na pozew / sprzeciwie]</strong> są nieuzasadnione. <strong>[UZUPEŁNIJ: ogólna charakterystyka linii obrony pozwanego i dlaczego jest ona bezzasadna]</strong></p>
<h2>III. Odpowiedź na poszczególne zarzuty pozwanego</h2>
<h3>Zarzut 1: <strong>[UZUPEŁNIJ: treść zarzutu pozwanego]</strong></h3>
<p><strong>[UZUPEŁNIJ: szczegółowe stanowisko powoda — przyznanie / zaprzeczenie / kontrargumentacja]</strong></p>
<h3>Zarzut 2: <strong>[UZUPEŁNIJ: treść zarzutu pozwanego]</strong></h3>
<p><strong>[UZUPEŁNIJ: stanowisko powoda]</strong></p>
<p><em>[Dodać kolejne punkty według liczby zarzutów. Usunąć punkty nieaktualne.]</em></p>
<h2>IV. Wyjaśnienia i uzupełnienie stanu faktycznego</h2>
<p>{{case.summary}}</p>
<p><strong>[UZUPEŁNIJ: wyjaśnienia dotyczące okoliczności podnoszonych lub kwestionowanych przez pozwanego, sprostowanie błędnych twierdzeń, dodatkowe fakty istotne dla rozstrzygnięcia]</strong></p>
<h2>V. Nowe dowody</h2>
<p><strong>[UZUPEŁNIJ: wskazanie nowych dowodów powołanych w replice z uzasadnieniem, że ich powołanie wcześniej nie było możliwe albo potrzeba ich powołania wynikła dopiero z treści odpowiedzi/sprzeciwu. Jeżeli brak nowych dowodów — usunąć ten punkt.]</strong></p>
<h2>Podsumowanie</h2>
<p>Mając na uwadze powyższe, powód wnosi o rozstrzygnięcie zgodne z żądaniami pozwu.</p>
<p style="text-align: right">Z poważaniem,</p>
<p style="text-align: right">{{parties.representative.representative_name}}<br><strong>[UZUPEŁNIJ: tytuł zawodowy, np. adwokat/radca prawny]</strong><br>{{parties.representative.representative_address}}</p>
<p><strong>Załączniki:</strong></p>
<ul>
<li><strong>[UZUPEŁNIJ: lista nowych załączników powołanych w replice]</strong></li>
</ul>`,
    },
  ];

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
}

/**
 * Save the database to file
 */
export function saveDb() {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Get the database instance
 */
export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

/**
 * Execute a query and return all results as an array of objects
 * @param {string} sql - SQL query
 * @param {any[]} params - Query parameters
 * @returns {Object[]} - Array of row objects
 */
export function query(sql, params = []) {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Execute a single query and return the first result
 * @param {string} sql - SQL query
 * @param {any[]} params - Query parameters
 * @returns {Object|null} - First row object or null
 */
export function get(sql, params = []) {
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement
 * @param {string} sql - SQL statement
 * @param {any[]} params - Statement parameters
 * @returns {{changes: number, lastInsertRowId: number}}
 */
export function run(sql, params = []) {
  if (!db) {
    throw new Error("Database not initialized");
  }

  db.run(sql, params);

  // Get changes and last insert rowid
  const changes = db.getRowsModified();
  const lastIdResult = query("SELECT last_insert_rowid() as id");
  const lastInsertRowId = lastIdResult.length > 0 ? lastIdResult[0].id : 0;

  // Save after every write operation
  saveDb();

  return { changes, lastInsertRowId };
}

// ============================================
// Document operations
// ============================================

// Full column list for document queries
const DOC_COLUMNS = `id, name, path, folder, category, added_at, processed, page_count, word_count,
  content_hash, file_hash, status, doc_type, client, jurisdiction, tags, source,
  gdrive_file_id, gdrive_modified_time, sync_status, canonical_id, superseded_by,
  version, retention_label, retention_until, legal_hold, auto_tags, confirmed_tags,
  metadata_json, updated_at, sensitivity, language, in_force, full_text,
  contracting_company, contracting_vendor, signature_date, commencement_date, expiry_date,
  storage_backend, storage_key`;

export function getAllDocuments(orgId) {
  if (orgId !== undefined) {
    return query(`
      SELECT ${DOC_COLUMNS}
      FROM documents
      WHERE org_id = ?
      ORDER BY category, added_at DESC
    `, [orgId]);
  }
  return query(`
    SELECT ${DOC_COLUMNS}
    FROM documents
    ORDER BY category, added_at DESC
  `);
}

export function getDocumentById(id, orgId) {
  if (orgId !== undefined) {
    return get(`
      SELECT ${DOC_COLUMNS}
      FROM documents
      WHERE id = ? AND org_id = ?
    `, [id, orgId]);
  }
  return get(`
    SELECT ${DOC_COLUMNS}
    FROM documents
    WHERE id = ?
  `, [id]);
}

export function getDocumentByPath(filePath, orgId) {
  if (orgId !== undefined) {
    return get(`
      SELECT ${DOC_COLUMNS}
      FROM documents
      WHERE path = ? AND org_id = ?
    `, [filePath, orgId]);
  }
  return get(`
    SELECT ${DOC_COLUMNS}
    FROM documents
    WHERE path = ?
  `, [filePath]);
}

export function addDocument(name, filePath, folder, category = null, orgId = null) {
  const result = run(`
    INSERT INTO documents (name, path, folder, category, org_id)
    VALUES (?, ?, ?, ?, ?)
  `, [name, filePath, folder, category, orgId]);
  return result.lastInsertRowId;
}

export function setDocumentStorage(docId, storageBackend, storageKey) {
  run(`
    UPDATE documents
    SET storage_backend = ?, storage_key = ?
    WHERE id = ?
  `, [storageBackend, storageKey, docId]);
}

export function updateDocumentCategory(id, category) {
  run(`
    UPDATE documents
    SET category = ?
    WHERE id = ?
  `, [category, id]);
}

export function updateDocumentProcessed(id, wordCount) {
  run(`
    UPDATE documents
    SET processed = 1, word_count = ?, processing_error = NULL
    WHERE id = ?
  `, [wordCount, id]);
}

export function setDocumentProcessingError(id, error) {
  run(`
    UPDATE documents
    SET processing_error = ?
    WHERE id = ?
  `, [error, id]);
  saveDb();
}

export function deleteDocument(id) {
  // Delete chunks first (sql.js doesn't support ON DELETE CASCADE reliably)
  run("DELETE FROM chunks WHERE document_id = ?", [id]);
  run("DELETE FROM documents WHERE id = ?", [id]);
}

// ============================================
// Chunk operations
// ============================================

export function addChunk(documentId, content, chunkIndex, embedding) {
  const result = run(`
    INSERT INTO chunks (document_id, content, chunk_index, embedding)
    VALUES (?, ?, ?, ?)
  `, [documentId, content, chunkIndex, embedding]);
  return result.lastInsertRowId;
}

export function getChunksByDocumentId(documentId) {
  return query(`
    SELECT id, content, chunk_index, embedding
    FROM chunks
    WHERE document_id = ?
    ORDER BY chunk_index
  `, [documentId]);
}

export function getChunksByDocumentIds(documentIds) {
  if (!documentIds || documentIds.length === 0) {
    return [];
  }

  const placeholders = documentIds.map(() => "?").join(",");
  return query(`
    SELECT c.id, c.document_id, c.content, c.chunk_index, c.embedding, d.name as document_name
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE c.document_id IN (${placeholders})
    AND c.embedding IS NOT NULL
    ORDER BY c.document_id, c.chunk_index
  `, documentIds);
}

export function getAllChunksWithEmbeddings(orgId) {
  if (orgId !== undefined) {
    return query(`
      SELECT c.id, c.document_id, c.content, c.chunk_index, c.embedding, d.name as document_name
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.embedding IS NOT NULL AND d.org_id = ?
      ORDER BY c.document_id, c.chunk_index
    `, [orgId]);
  }
  return query(`
    SELECT c.id, c.document_id, c.content, c.chunk_index, c.embedding, d.name as document_name
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.document_id, c.chunk_index
  `);
}

export function deleteChunksByDocumentId(documentId) {
  run("DELETE FROM chunks WHERE document_id = ?", [documentId]);
}

export function getChunkCountsByDocumentIds(documentIds) {
  if (!documentIds || documentIds.length === 0) return new Map();
  const placeholders = documentIds.map(() => "?").join(",");
  const rows = query(
    `SELECT document_id, COUNT(*) as total FROM chunks WHERE document_id IN (${placeholders}) GROUP BY document_id`,
    documentIds
  );
  const map = new Map();
  for (const row of rows) {
    map.set(row.document_id, row.total);
  }
  return map;
}

// ============================================
// Batch operations
// ============================================

export function addChunksBatch(chunks) {
  for (const chunk of chunks) {
    run(`
      INSERT INTO chunks (document_id, content, chunk_index, embedding)
      VALUES (?, ?, ?, ?)
    `, [chunk.documentId, chunk.content, chunk.chunkIndex, chunk.embedding]);
  }
}

export function getUnprocessedDocuments(orgId) {
  if (orgId !== undefined) {
    return query(`
      SELECT id, name, path, folder, category, added_at
      FROM documents
      WHERE processed = 0 AND org_id = ?
      ORDER BY added_at
    `, [orgId]);
  }
  return query(`
    SELECT id, name, path, folder, category, added_at
    FROM documents
    WHERE processed = 0
    ORDER BY added_at
  `);
}

export function getProcessedDocumentCount(orgId) {
  if (orgId !== undefined) {
    const result = get(`SELECT COUNT(*) as count FROM documents WHERE processed = 1 AND org_id = ?`, [orgId]);
    return result ? result.count : 0;
  }
  const result = get(`SELECT COUNT(*) as count FROM documents WHERE processed = 1`);
  return result ? result.count : 0;
}

export function getTotalDocumentCount(orgId) {
  if (orgId !== undefined) {
    const result = get(`SELECT COUNT(*) as count FROM documents WHERE org_id = ?`, [orgId]);
    return result ? result.count : 0;
  }
  const result = get(`SELECT COUNT(*) as count FROM documents`);
  return result ? result.count : 0;
}

// ============================================
// Phase 0: Document metadata operations
// ============================================

/**
 * Update document metadata fields
 * @param {number} id - Document ID
 * @param {Object} metadata - Fields to update
 */
export function updateDocumentMetadata(id, metadata) {
  const allowedFields = [
    "doc_type", "client", "jurisdiction", "tags", "source",
    "status", "retention_label", "retention_until", "legal_hold",
    "auto_tags", "confirmed_tags", "metadata_json", "content_hash",
    "file_hash", "canonical_id", "superseded_by", "version",
    "gdrive_file_id", "gdrive_modified_time", "sync_status",
    "sensitivity", "language", "category", "in_force", "full_text",
    "contracting_company", "contracting_vendor", "signature_date",
    "commencement_date", "expiry_date",
  ];

  const fields = [];
  const params = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (fields.length === 0) return;

  // Always update updated_at
  fields.push("updated_at = CURRENT_TIMESTAMP");

  params.push(id);
  run(`UPDATE documents SET ${fields.join(", ")} WHERE id = ?`, params);
}

/**
 * Update document status with validation
 * @param {number} id
 * @param {string} newStatus
 * @returns {{success: boolean, error?: string}}
 */
export function updateDocumentStatus(id, newStatus) {
  const doc = getDocumentById(id);
  if (!doc) return { success: false, error: "Document not found" };

  const isContract = doc.doc_type === "contract" || doc.doc_type === "agreement";

  const contractStatuses = ["unsigned", "signed", "active", "terminated"];
  const documentStatuses = ["draft", "in_review", "approved", "archived", "disposed"];

  const validStatuses = isContract ? contractStatuses : documentStatuses;
  if (!validStatuses.includes(newStatus)) {
    return { success: false, error: `Invalid status: ${newStatus}` };
  }

  const contractTransitions = {
    unsigned: ["signed"],
    signed: ["active", "unsigned"],
    active: ["terminated", "signed"],
    terminated: ["active"],
  };

  const documentTransitions = {
    draft: ["in_review"],
    in_review: ["approved", "draft"],
    approved: ["archived"],
    archived: ["draft", "disposed"],
    disposed: [],
  };

  const transitions = isContract ? contractTransitions : documentTransitions;
  // For contracts, treat legacy "draft" status as "unsigned"
  let currentStatus = doc.status || (isContract ? "unsigned" : "draft");
  if (isContract && !contractTransitions[currentStatus]) {
    currentStatus = "unsigned";
    // Also fix the stored status
    run(`UPDATE documents SET status = 'unsigned' WHERE id = ?`, [id]);
  }
  const allowed = transitions[currentStatus] || [];

  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed.join(", ")}`,
    };
  }

  run(
    `UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [newStatus, id]
  );

  return { success: true, from: currentStatus, to: newStatus };
}

/**
 * Get document by Google Drive file ID
 * @param {string} gdriveFileId
 * @returns {Object|null}
 */
export function getDocumentByGDriveId(gdriveFileId, orgId) {
  if (orgId !== undefined) {
    return get(`SELECT ${DOC_COLUMNS} FROM documents WHERE gdrive_file_id = ? AND org_id = ?`, [gdriveFileId, orgId]);
  }
  return get(`SELECT ${DOC_COLUMNS} FROM documents WHERE gdrive_file_id = ?`, [gdriveFileId]);
}

// ============================================
// Phase 0: Document lineage operations
// ============================================

export function addLineageEntry(sourceId, targetId, relationship, confidence = null) {
  const result = run(
    `INSERT INTO document_lineage (source_id, target_id, relationship, confidence)
     VALUES (?, ?, ?, ?)`,
    [sourceId, targetId, relationship, confidence]
  );
  return result.lastInsertRowId;
}

export function getDocumentLineage(documentId) {
  return query(
    `SELECT dl.*, ds.name as source_name, dt.name as target_name
     FROM document_lineage dl
     JOIN documents ds ON dl.source_id = ds.id
     JOIN documents dt ON dl.target_id = dt.id
     WHERE dl.source_id = ? OR dl.target_id = ?
     ORDER BY dl.created_at DESC`,
    [documentId, documentId]
  );
}

// ============================================
// Phase 0: Task operations
// ============================================

export function getAllTasks(statusFilter = null, orgId = undefined) {
  if (orgId !== undefined) {
    if (statusFilter) {
      return query(
        `SELECT * FROM tasks WHERE status = ? AND org_id = ? ORDER BY created_at DESC`,
        [statusFilter, orgId]
      );
    }
    return query(`SELECT * FROM tasks WHERE org_id = ? ORDER BY created_at DESC`, [orgId]);
  }
  if (statusFilter) {
    return query(
      `SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC`,
      [statusFilter]
    );
  }
  return query(`SELECT * FROM tasks ORDER BY created_at DESC`);
}

export function getTaskById(id) {
  return get(`SELECT * FROM tasks WHERE id = ?`, [id]);
}

export function updateTaskStatus(id, status) {
  const resolvedAt = status === "resolved" ? new Date().toISOString() : null;
  run(
    `UPDATE tasks SET status = ?, resolved_at = ? WHERE id = ?`,
    [status, resolvedAt, id]
  );
}

export function getOpenTaskCount(orgId) {
  if (orgId !== undefined) {
    const result = get(`SELECT COUNT(*) as count FROM tasks WHERE status = 'open' AND org_id = ?`, [orgId]);
    return result?.count || 0;
  }
  const result = get(`SELECT COUNT(*) as count FROM tasks WHERE status = 'open'`);
  return result?.count || 0;
}

// ============================================
// Phase 0: Legal hold operations
// ============================================

export function getAllLegalHolds(activeOnly = false, orgId = undefined) {
  if (orgId !== undefined) {
    const where = activeOnly ? "WHERE status = 'active' AND org_id = ?" : "WHERE org_id = ?";
    return query(`SELECT * FROM legal_holds ${where} ORDER BY created_at DESC`, [orgId]);
  }
  const where = activeOnly ? "WHERE status = 'active'" : "";
  return query(`SELECT * FROM legal_holds ${where} ORDER BY created_at DESC`);
}

export function getLegalHoldById(id) {
  return get(`SELECT * FROM legal_holds WHERE id = ?`, [id]);
}

export function createLegalHold(matterName, scopeJson, orgId = null) {
  const result = run(
    `INSERT INTO legal_holds (matter_name, scope_json, org_id) VALUES (?, ?, ?)`,
    [matterName, JSON.stringify(scopeJson), orgId]
  );
  return result.lastInsertRowId;
}

export function releaseLegalHold(id) {
  run(
    `UPDATE legal_holds SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id]
  );
}

// ============================================
// Audit log operations
// ============================================

/**
 * Log an action to the audit log
 * @param {string} entityType - Type of entity (e.g., 'obligation', 'contract')
 * @param {number} entityId - ID of the entity
 * @param {string} action - Action performed (e.g., 'finalized', 'created')
 * @param {string|null} details - Additional details about the action
 */
export function logAction(entityType, entityId, action, details = null, options = {}) {
  const { userId = null, orgId = null } = options;
  run(
    `INSERT INTO audit_log (entity_type, entity_id, action, details, user_id, org_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [entityType, entityId, action, details, userId, orgId]
  );
}

/**
 * Get audit log entries for an entity
 * @param {string} entityType - Type of entity
 * @param {number} entityId - ID of the entity
 * @returns {Array} Audit log entries
 */
export function getAuditLog(entityType, entityId) {
  return query(
    `SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC`,
    [entityType, entityId]
  );
}

// ============================================
// Phase 0: User profile operations
// ============================================

export function getUserProfile() {
  return get(`SELECT * FROM user_profile LIMIT 1`);
}

export function updateUserProfile(updates) {
  const fields = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (["name", "role", "projects", "departments", "clearance_level"].includes(key)) {
      fields.push(`${key} = ?`);
      params.push(typeof value === "object" ? JSON.stringify(value) : value);
    }
  }

  if (fields.length === 0) return;

  const profile = getUserProfile();
  if (profile) {
    params.push(profile.id);
    run(`UPDATE user_profile SET ${fields.join(", ")} WHERE id = ?`, params);
  }
}

// ============================================
// App Settings (persisted key-value store)
// ============================================

/**
 * Get a persisted app setting by key
 * @param {string} key
 * @returns {string|null}
 */
export function getAppSetting(key) {
  const row = get(`SELECT value FROM app_settings WHERE key = ?`, [key]);
  return row ? row.value : null;
}

/**
 * Set a persisted app setting (upsert)
 * Defaults to org_id=1 for backward compatibility. Task 2 will migrate callers to setOrgSetting.
 * @param {string} key
 * @param {string} value
 */
export function setAppSetting(key, value) {
  run(
    `INSERT OR REPLACE INTO app_settings (org_id, key, value, updated_at) VALUES (1, ?, ?, CURRENT_TIMESTAMP)`,
    [key, value]
  );
  saveDb();
}

// ============================================
// QA Card operations (reusable questionnaire answers)
// ============================================

export function insertQaCard({ questionText, approvedAnswer, evidenceJson, sourceQuestionnaire, questionEmbedding, orgId = null }) {
  const result = run(
    `INSERT INTO qa_cards (question_text, approved_answer, evidence_json, source_questionnaire, question_embedding, org_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [questionText, approvedAnswer, evidenceJson || null, sourceQuestionnaire || null, questionEmbedding || null, orgId]
  );
  return result.lastInsertRowId;
}

export function getAllQaCards(statusFilter = null, orgId = undefined) {
  if (orgId !== undefined) {
    if (statusFilter) {
      return query(`SELECT id, question_text, approved_answer, evidence_json, source_questionnaire, status, created_at, updated_at FROM qa_cards WHERE status = ? AND org_id = ? ORDER BY created_at DESC`, [statusFilter, orgId]);
    }
    return query(`SELECT id, question_text, approved_answer, evidence_json, source_questionnaire, status, created_at, updated_at FROM qa_cards WHERE org_id = ? ORDER BY created_at DESC`, [orgId]);
  }
  if (statusFilter) {
    return query(`SELECT id, question_text, approved_answer, evidence_json, source_questionnaire, status, created_at, updated_at FROM qa_cards WHERE status = ? ORDER BY created_at DESC`, [statusFilter]);
  }
  return query(`SELECT id, question_text, approved_answer, evidence_json, source_questionnaire, status, created_at, updated_at FROM qa_cards ORDER BY created_at DESC`);
}

export function getQaCardById(id) {
  return get(`SELECT * FROM qa_cards WHERE id = ?`, [id]);
}

export function updateQaCard(id, updates) {
  const allowedFields = ["question_text", "approved_answer", "evidence_json", "source_questionnaire", "status", "question_embedding"];
  const fields = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
  }
  if (fields.length === 0) return;

  fields.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  run(`UPDATE qa_cards SET ${fields.join(", ")} WHERE id = ?`, params);
}

export function deleteQaCard(id) {
  run(`DELETE FROM qa_cards WHERE id = ?`, [id]);
}

export function getAllQaCardsWithEmbeddings(orgId) {
  if (orgId !== undefined) {
    return query(
      `SELECT id, question_text, approved_answer, evidence_json, source_questionnaire, question_embedding, status
       FROM qa_cards
       WHERE question_embedding IS NOT NULL AND status = 'approved' AND org_id = ?
       ORDER BY created_at DESC`,
      [orgId]
    );
  }
  return query(
    `SELECT id, question_text, approved_answer, evidence_json, source_questionnaire, question_embedding, status
     FROM qa_cards
     WHERE question_embedding IS NOT NULL AND status = 'approved'
     ORDER BY created_at DESC`
  );
}

// ============================================
// Contract obligation operations
// ============================================

export function insertObligation({ documentId, obligationType, title, description, clauseReference, dueDate, recurrence, noticePeriodDays, owner, escalationTo, proofDescription, evidenceJson, category, department, activation, summary, detailsJson, penalties, stage, startDate, isRepeating, recurrenceInterval, parentObligationId, paymentAmount, paymentCurrency, reportingFrequency, reportingRecipient, complianceRegulatoryBody, complianceJurisdiction, operationalServiceType, operationalSlaMetric, orgId = null }) {
  const statusValue = activation || "active";
  const result = run(
    `INSERT INTO contract_obligations (document_id, obligation_type, title, description, clause_reference, due_date, recurrence, notice_period_days, owner, escalation_to, proof_description, evidence_json, category, department, activation, status, summary, details_json, penalties, stage, start_date, is_repeating, recurrence_interval, parent_obligation_id, payment_amount, payment_currency, reporting_frequency, reporting_recipient, compliance_regulatory_body, compliance_jurisdiction, operational_service_type, operational_sla_metric, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [documentId, obligationType, title, description || null, clauseReference || null, dueDate || null, recurrence || null, noticePeriodDays || null, owner || null, escalationTo || null, proofDescription || null, evidenceJson || "[]", category || null, department || null, statusValue, statusValue, summary || null, detailsJson || "{}", penalties || null, stage || "active", startDate || null, isRepeating ? 1 : 0, recurrenceInterval || null, parentObligationId || null, paymentAmount ?? null, paymentCurrency || null, reportingFrequency || null, reportingRecipient || null, complianceRegulatoryBody || null, complianceJurisdiction || null, operationalServiceType || null, operationalSlaMetric || null, orgId]
  );
  return result.lastInsertRowId;
}

export function spawnDueObligations(documentId) {
  const contract = getContractById(documentId);
  if (!contract || !["active", "signed"].includes(contract.status)) return;

  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < 100; i++) {
    const qualifying = query(
      `SELECT * FROM contract_obligations
       WHERE document_id = ?
         AND is_repeating = 1
         AND recurrence_interval IS NOT NULL
         AND due_date IS NOT NULL
         AND due_date < ?
         AND NOT EXISTS (
           SELECT 1 FROM contract_obligations c2
           WHERE c2.parent_obligation_id = contract_obligations.id
         )`,
      [documentId, today]
    );

    if (qualifying.length === 0) break;

    for (const ob of qualifying) {
      const d = new Date(ob.due_date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + ob.recurrence_interval);
      const nextDue = d.toISOString().slice(0, 10);

      insertObligation({
        documentId: ob.document_id,
        obligationType: ob.obligation_type,
        title: ob.title,
        description: ob.description,
        clauseReference: ob.clause_reference,
        dueDate: nextDue,
        recurrence: ob.recurrence,
        noticePeriodDays: ob.notice_period_days,
        owner: ob.owner,
        escalationTo: ob.escalation_to,
        proofDescription: ob.proof_description,
        evidenceJson: "[]",
        category: ob.category,
        department: ob.department,
        activation: null,
        summary: ob.summary,
        detailsJson: "{}",
        penalties: ob.penalties,
        stage: "active",
        startDate: ob.start_date,
        isRepeating: ob.is_repeating,
        recurrenceInterval: ob.recurrence_interval,
        parentObligationId: ob.id,
        paymentAmount: ob.payment_amount,
        paymentCurrency: ob.payment_currency,
        reportingFrequency: ob.reporting_frequency,
        reportingRecipient: ob.reporting_recipient,
        complianceRegulatoryBody: ob.compliance_regulatory_body,
        complianceJurisdiction: ob.compliance_jurisdiction,
        operationalServiceType: ob.operational_service_type,
        operationalSlaMetric: ob.operational_sla_metric,
      });
    }
  }
}

export function getObligationsByDocumentId(documentId) {
  return query(
    `SELECT * FROM contract_obligations WHERE document_id = ? ORDER BY due_date ASC, created_at ASC`,
    [documentId]
  );
}

export function getObligationById(id) {
  return get(`SELECT * FROM contract_obligations WHERE id = ?`, [id]);
}

export function updateObligation(id, updates) {
  const allowedFields = ["obligation_type", "title", "description", "clause_reference", "due_date", "recurrence", "notice_period_days", "owner", "escalation_to", "proof_description", "evidence_json", "status", "category", "activation", "summary", "details_json", "penalties", "stage", "department", "finalization_note", "finalization_document_id", "start_date", "is_repeating", "recurrence_interval", "parent_obligation_id", "payment_amount", "payment_currency", "reporting_frequency", "reporting_recipient", "compliance_regulatory_body", "compliance_jurisdiction", "operational_service_type", "operational_sla_metric"];
  const fields = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
  }
  if (fields.length === 0) return;

  fields.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  run(`UPDATE contract_obligations SET ${fields.join(", ")} WHERE id = ?`, params);
}

export function deleteObligation(id) {
  run(`DELETE FROM contract_obligations WHERE id = ?`, [id]);
}

export function getUpcomingObligations(days = 30, orgId = undefined) {
  if (orgId !== undefined) {
    return query(
      `SELECT co.*, d.name as document_name
       FROM contract_obligations co
       JOIN documents d ON co.document_id = d.id
       WHERE co.status = 'active'
         AND co.due_date IS NOT NULL
         AND co.due_date <= date('now', '+' || ? || ' days')
         AND co.due_date >= date('now')
         AND d.org_id = ?
       ORDER BY co.due_date ASC`,
      [days, orgId]
    );
  }
  return query(
    `SELECT co.*, d.name as document_name
     FROM contract_obligations co
     JOIN documents d ON co.document_id = d.id
     WHERE co.status = 'active'
       AND co.due_date IS NOT NULL
       AND co.due_date <= date('now', '+' || ? || ' days')
       AND co.due_date >= date('now')
     ORDER BY co.due_date ASC`,
    [days]
  );
}

export function getOverdueObligations(orgId) {
  if (orgId !== undefined) {
    return query(
      `SELECT co.*, d.name as document_name
       FROM contract_obligations co
       JOIN documents d ON co.document_id = d.id
       WHERE co.status = 'active'
         AND co.due_date IS NOT NULL
         AND co.due_date < date('now')
         AND d.org_id = ?
       ORDER BY co.due_date ASC`,
      [orgId]
    );
  }
  return query(
    `SELECT co.*, d.name as document_name
     FROM contract_obligations co
     JOIN documents d ON co.document_id = d.id
     WHERE co.status = 'active'
       AND co.due_date IS NOT NULL
       AND co.due_date < date('now')
     ORDER BY co.due_date ASC`
  );
}

export function getAllObligations(orgId) {
  if (orgId !== undefined) {
    return query(
      `SELECT co.*, d.name as document_name, d.doc_type as document_type, d.client as document_client, d.status as document_status
       FROM contract_obligations co
       JOIN documents d ON co.document_id = d.id
       WHERE d.org_id = ?
       ORDER BY
         d.name ASC,
         CASE co.stage WHEN 'not_signed' THEN 0 WHEN 'signed' THEN 1 WHEN 'active' THEN 2 WHEN 'terminated' THEN 3 ELSE 4 END ASC,
         co.due_date ASC,
         co.created_at DESC`,
      [orgId]
    );
  }
  return query(
    `SELECT co.*, d.name as document_name, d.doc_type as document_type, d.client as document_client, d.status as document_status
     FROM contract_obligations co
     JOIN documents d ON co.document_id = d.id
     ORDER BY
       d.name ASC,
       CASE co.stage WHEN 'not_signed' THEN 0 WHEN 'signed' THEN 1 WHEN 'active' THEN 2 WHEN 'terminated' THEN 3 ELSE 4 END ASC,
       co.due_date ASC,
       co.created_at DESC`
  );
}

export function transitionObligationsByStage(documentId, newStage, previousStage) {
  // Activate obligations for the new stage (but not already finalized/met/waived)
  run(
    `UPDATE contract_obligations SET status = 'active', updated_at = CURRENT_TIMESTAMP
     WHERE document_id = ? AND stage = ? AND status NOT IN ('met', 'waived', 'finalized')`,
    [documentId, newStage]
  );

  // Deactivate obligations from ALL other stages that are currently active
  run(
    `UPDATE contract_obligations SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
     WHERE document_id = ? AND stage != ? AND status = 'active'`,
    [documentId, newStage]
  );

  return getObligationsByDocumentId(documentId);
}

export function getContractSummary(documentId) {
  const doc = getDocumentById(documentId);
  if (!doc) return null;

  const obligations = query(
    `SELECT category, stage, status, due_date FROM contract_obligations WHERE document_id = ?`,
    [documentId]
  );

  const stageCounts = { not_signed: { active: 0, finalized: 0 }, signed: { active: 0, finalized: 0 }, active: { active: 0, finalized: 0 }, terminated: { active: 0, finalized: 0 } };
  let nextDeadline = null;
  let overdueCount = 0;
  const now = new Date().toISOString().split("T")[0];

  for (const ob of obligations) {
    const s = ob.stage || "active";
    if (!stageCounts[s]) stageCounts[s] = { active: 0, finalized: 0 };
    if (ob.status === "active") {
      stageCounts[s].active++;
      if (ob.due_date && ob.due_date < now) overdueCount++;
      if (ob.due_date && ob.due_date >= now) {
        if (!nextDeadline || ob.due_date < nextDeadline) nextDeadline = ob.due_date;
      }
    } else {
      stageCounts[s].finalized++;
    }
  }

  // Normalize contract status
  const isContract = doc.doc_type === "contract" || doc.doc_type === "agreement";
  const contractStatuses = ["unsigned", "signed", "active", "terminated"];
  let status = doc.status || (isContract ? "unsigned" : "draft");
  if (isContract && !contractStatuses.includes(status)) {
    status = "unsigned";
  }

  return {
    id: doc.id,
    name: doc.name,
    status,
    doc_type: doc.doc_type,
    client: doc.client,
    stageCounts,
    totalObligations: obligations.length,
    nextDeadline,
    overdueCount,
  };
}

export function createTaskForObligation(obligationId, { title, description, dueDate, owner, escalationTo, orgId = null }) {
  const result = run(
    `INSERT INTO tasks (title, description, entity_type, entity_id, task_type, status, due_date, owner, escalation_to, obligation_id, org_id)
     VALUES (?, ?, 'obligation', ?, 'contract_deadline', 'open', ?, ?, ?, ?, ?)`,
    [title, description || null, obligationId, dueDate || null, owner || null, escalationTo || null, obligationId, orgId]
  );
  return result.lastInsertRowId;
}

// ============================================
// Contract Hub operations
// ============================================

/**
 * Get all contracts with obligation summaries
 * @returns {Array} Array of contracts with metadata and obligation statistics
 */
export function getContractsWithSummaries(orgId) {
  if (orgId !== undefined) {
    return query(
      `SELECT
        d.id, d.name, d.path, d.status, d.doc_type, d.client,
        d.contracting_company, d.contracting_vendor, d.signature_date,
        d.commencement_date, d.expiry_date,
        COUNT(co.id) as totalObligations,
        SUM(CASE WHEN co.status = 'active' THEN 1 ELSE 0 END) as activeObligations,
        SUM(CASE WHEN co.status = 'active' AND co.due_date < date('now') THEN 1 ELSE 0 END) as overdueObligations,
        SUM(CASE WHEN co.status = 'finalized' THEN 1 ELSE 0 END) as finalizedObligations,
        MIN(CASE WHEN co.status = 'active' AND co.due_date >= date('now') THEN co.due_date ELSE NULL END) as nextDeadline
      FROM documents d
      LEFT JOIN contract_obligations co ON d.id = co.document_id
      WHERE d.doc_type IN ('contract', 'agreement') AND d.org_id = ?
      GROUP BY d.id
      ORDER BY d.name ASC`,
      [orgId]
    );
  }
  return query(
    `SELECT
      d.id, d.name, d.path, d.status, d.doc_type, d.client,
      d.contracting_company, d.contracting_vendor, d.signature_date,
      d.commencement_date, d.expiry_date,
      COUNT(co.id) as totalObligations,
      SUM(CASE WHEN co.status = 'active' THEN 1 ELSE 0 END) as activeObligations,
      SUM(CASE WHEN co.status = 'active' AND co.due_date < date('now') THEN 1 ELSE 0 END) as overdueObligations,
      SUM(CASE WHEN co.status = 'finalized' THEN 1 ELSE 0 END) as finalizedObligations,
      MIN(CASE WHEN co.status = 'active' AND co.due_date >= date('now') THEN co.due_date ELSE NULL END) as nextDeadline
    FROM documents d
    LEFT JOIN contract_obligations co ON d.id = co.document_id
    WHERE d.doc_type IN ('contract', 'agreement')
    GROUP BY d.id
    ORDER BY d.name ASC`
  );
}

/**
 * Get upcoming obligations from all contracts within specified days
 * @param {number} days - Number of days to look ahead (default 30)
 * @returns {Array} Array of obligations with contract info
 */
export function getUpcomingObligationsAllContracts(days = 30, orgId = undefined) {
  if (orgId !== undefined) {
    return query(
      `SELECT co.*, d.name as document_name, d.status as document_status,
              d.contracting_company, d.contracting_vendor
       FROM contract_obligations co
       JOIN documents d ON co.document_id = d.id
       WHERE co.status = 'active'
         AND co.due_date IS NOT NULL
         AND co.due_date <= date('now', '+' || ? || ' days')
         AND co.due_date >= date('now')
         AND d.doc_type IN ('contract', 'agreement')
         AND d.org_id = ?
       ORDER BY co.due_date ASC`,
      [days, orgId]
    );
  }
  return query(
    `SELECT co.*, d.name as document_name, d.status as document_status,
            d.contracting_company, d.contracting_vendor
     FROM contract_obligations co
     JOIN documents d ON co.document_id = d.id
     WHERE co.status = 'active'
       AND co.due_date IS NOT NULL
       AND co.due_date <= date('now', '+' || ? || ' days')
       AND co.due_date >= date('now')
       AND d.doc_type IN ('contract', 'agreement')
     ORDER BY co.due_date ASC`,
    [days]
  );
}

/**
 * Get contract by ID with full details
 * @param {number} id - Contract document ID
 * @returns {Object|null} Contract with metadata
 */
export function getContractById(id, orgId) {
  const doc = orgId !== undefined
    ? get(
        `SELECT ${DOC_COLUMNS} FROM documents WHERE id = ? AND doc_type IN ('contract', 'agreement') AND org_id = ?`,
        [id, orgId]
      )
    : get(
        `SELECT ${DOC_COLUMNS} FROM documents WHERE id = ? AND doc_type IN ('contract', 'agreement')`,
        [id]
      );

  if (!doc) return null;

  // Get obligation counts
  const obligations = query(
    `SELECT category, status, due_date
     FROM contract_obligations
     WHERE document_id = ?`,
    [id]
  );

  let totalObligations = obligations.length;
  let activeObligations = 0;
  let overdueObligations = 0;
  let finalizedObligations = 0;
  let nextDeadline = null;
  const now = new Date().toISOString().split("T")[0];

  for (const ob of obligations) {
    if (ob.status === "active") {
      activeObligations++;
      if (ob.due_date && ob.due_date < now) {
        overdueObligations++;
      }
      if (ob.due_date && ob.due_date >= now) {
        if (!nextDeadline || ob.due_date < nextDeadline) {
          nextDeadline = ob.due_date;
        }
      }
    } else if (ob.status === "finalized") {
      finalizedObligations++;
    }
  }

  return {
    ...doc,
    totalObligations,
    activeObligations,
    overdueObligations,
    finalizedObligations,
    nextDeadline,
  };
}

/**
 * Search contracts by structured metadata filters.
 * All params optional. Returns up to `limit` contracts with obligation summary.
 */
export function searchContractsByFilters({
  company, vendor, status, expiryBefore, expiryAfter, hasTag, missingExpiry, limit = 20, orgId
} = {}) {
  const conditions = [`d.doc_type IN ('contract', 'agreement')`];
  const params = [];

  if (orgId !== undefined && orgId !== null) {
    conditions.push(`d.org_id = ?`);
    params.push(orgId);
  }

  if (company) {
    conditions.push(`(d.contracting_company LIKE ? OR d.client LIKE ?)`);
    params.push(`%${company}%`, `%${company}%`);
  }
  if (vendor) {
    conditions.push(`d.contracting_vendor LIKE ?`);
    params.push(`%${vendor}%`);
  }
  if (status) {
    conditions.push(`d.status = ?`);
    params.push(status);
  }
  if (expiryBefore) {
    conditions.push(`d.expiry_date IS NOT NULL AND d.expiry_date <= ?`);
    params.push(expiryBefore);
  }
  if (expiryAfter) {
    conditions.push(`d.expiry_date IS NOT NULL AND d.expiry_date >= ?`);
    params.push(expiryAfter);
  }
  if (missingExpiry) {
    conditions.push(`d.expiry_date IS NULL`);
  }
  if (hasTag) {
    conditions.push(`(d.confirmed_tags LIKE ? OR d.auto_tags LIKE ?)`);
    params.push(`%${hasTag}%`, `%${hasTag}%`);
  }

  params.push(limit);

  return query(
    `SELECT
       d.id, d.name, d.status, d.contracting_company, d.contracting_vendor,
       d.client, d.signature_date, d.commencement_date, d.expiry_date,
       COUNT(co.id)                                                AS totalObligations,
       SUM(CASE WHEN co.status = 'active' THEN 1 ELSE 0 END)     AS activeObligations,
       SUM(CASE WHEN co.status = 'active' AND co.due_date < date('now') THEN 1 ELSE 0 END) AS overdueObligations,
       MIN(CASE WHEN co.status = 'active' AND co.due_date >= date('now') THEN co.due_date ELSE NULL END) AS nextDeadline
     FROM documents d
     LEFT JOIN contract_obligations co ON d.id = co.document_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY d.id
     ORDER BY d.name ASC
     LIMIT ?`,
    params
  );
}

/**
 * Full-text keyword search over contract name, parties, and stored full_text content.
 */
export function searchContractsByText(searchTerm, limit = 10, orgId = undefined) {
  const like = `%${searchTerm}%`;
  if (orgId !== undefined) {
    return query(
      `SELECT
         d.id, d.name, d.status, d.contracting_company, d.contracting_vendor,
         d.client, d.signature_date, d.commencement_date, d.expiry_date,
         COUNT(co.id) AS totalObligations,
         MIN(CASE WHEN co.status = 'active' AND co.due_date >= date('now') THEN co.due_date ELSE NULL END) AS nextDeadline
       FROM documents d
       LEFT JOIN contract_obligations co ON d.id = co.document_id
       WHERE d.doc_type IN ('contract', 'agreement')
         AND d.org_id = ?
         AND (d.name LIKE ? OR d.contracting_company LIKE ? OR d.contracting_vendor LIKE ?
              OR d.client LIKE ? OR d.full_text LIKE ?)
       GROUP BY d.id
       ORDER BY d.name ASC
       LIMIT ?`,
      [orgId, like, like, like, like, like, limit]
    );
  }
  return query(
    `SELECT
       d.id, d.name, d.status, d.contracting_company, d.contracting_vendor,
       d.client, d.signature_date, d.commencement_date, d.expiry_date,
       COUNT(co.id) AS totalObligations,
       MIN(CASE WHEN co.status = 'active' AND co.due_date >= date('now') THEN co.due_date ELSE NULL END) AS nextDeadline
     FROM documents d
     LEFT JOIN contract_obligations co ON d.id = co.document_id
     WHERE d.doc_type IN ('contract', 'agreement')
       AND (d.name LIKE ? OR d.contracting_company LIKE ? OR d.contracting_vendor LIKE ?
            OR d.client LIKE ? OR d.full_text LIKE ?)
     GROUP BY d.id
     ORDER BY d.name ASC
     LIMIT ?`,
    [like, like, like, like, like, limit]
  );
}

/**
 * Get obligations filtered for chat queries. Scoped to contracts only.
 */
export function getObligationsForChat({
  dueWithinDays, overdue, category, contractIds, limit = 20, orgId
} = {}) {
  const conditions = [
    `d.doc_type IN ('contract', 'agreement')`,
    `co.status = 'active'`,
  ];
  const params = [];

  if (orgId !== undefined && orgId !== null) {
    conditions.push(`d.org_id = ?`);
    params.push(orgId);
  }

  if (dueWithinDays != null && !overdue) {
    conditions.push(
      `co.due_date IS NOT NULL AND co.due_date >= date('now') AND co.due_date <= date('now', '+' || ? || ' days')`
    );
    params.push(dueWithinDays);
  }
  if (overdue) {
    conditions.push(`co.due_date IS NOT NULL AND co.due_date < date('now')`);
  }
  if (category) {
    conditions.push(`co.category = ?`);
    params.push(category);
  }
  if (contractIds && contractIds.length > 0) {
    const placeholders = contractIds.map(() => '?').join(', ');
    conditions.push(`co.document_id IN (${placeholders})`);
    params.push(...contractIds);
  }

  params.push(limit);

  return query(
    `SELECT
       co.id, co.document_id, co.title, co.description, co.due_date,
       co.category, co.status, co.payment_amount, co.payment_currency,
       d.name AS document_name, d.contracting_company, d.contracting_vendor
     FROM contract_obligations co
     JOIN documents d ON co.document_id = d.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE WHEN co.due_date IS NULL THEN 1 ELSE 0 END, co.due_date ASC
     LIMIT ?`,
    params
  );
}

/**
 * Update contract metadata fields
 * @param {number} id - Contract document ID
 * @param {Object} metadata - Contract fields to update
 */
export function updateContractMetadata(id, metadata) {
  const allowedFields = [
    "contracting_company",
    "contracting_vendor",
    "signature_date",
    "commencement_date",
    "expiry_date",
    "name",
    "status",
    "category",
    "doc_type",
  ];

  const fields = [];
  const params = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (fields.length === 0) return;

  fields.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  run(`UPDATE documents SET ${fields.join(", ")} WHERE id = ?`, params);
}

/**
 * Finalize an obligation with note and/or document
 * @param {number} id - Obligation ID
 * @param {Object} options - Finalization details
 * @param {string} [options.note] - Finalization note
 * @param {number} [options.documentId] - Finalization document ID
 * @returns {Object} Updated obligation or error
 */
export function finalizeObligation(id, { note, documentId }) {
  // Validate at least one is provided
  if (!note && !documentId) {
    throw new Error("Either note or documentId must be provided to finalize obligation");
  }

  const updates = {
    status: "finalized",
    finalization_note: note || null,
    finalization_document_id: documentId || null,
  };

  updateObligation(id, updates);
  return getObligationById(id);
}

/**
 * Create a system obligation for contract lifecycle
 * @param {number} documentId - Contract document ID
 * @param {string} type - System obligation type ('system_sign' or 'system_terminate')
 * @returns {number} Created obligation ID
 */
export function createSystemObligation(documentId, type) {
  const systemObligations = {
    system_sign: {
      title: "Upload signed contract",
      description: "Replace the unsigned contract with the signed version",
      category: "termination",
      stage: "signed",
    },
    system_terminate: {
      title: "Confirm termination notice sent",
      description: "Upload proof or add note confirming termination notice was sent",
      category: "termination",
      stage: "terminated",
    },
  };

  const config = systemObligations[type];
  if (!config) {
    throw new Error(`Unknown system obligation type: ${type}`);
  }

  // Check if system obligation already exists
  const existing = query(
    `SELECT id FROM contract_obligations WHERE document_id = ? AND obligation_type = ?`,
    [documentId, type]
  );

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Get contract to determine due date for termination
  const doc = getDocumentById(documentId);
  let dueDate = null;

  if (type === "system_terminate" && doc) {
    // Calculate due date as 30 days from now (or use contract's notice period if available)
    const date = new Date();
    date.setDate(date.getDate() + 30);
    dueDate = date.toISOString().split("T")[0];
  }

  return insertObligation({
    documentId,
    obligationType: type,
    title: config.title,
    description: config.description,
    clauseReference: null,
    dueDate,
    recurrence: null,
    noticePeriodDays: type === "system_terminate" ? 30 : null,
    owner: null,
    escalationTo: null,
    proofDescription: null,
    evidenceJson: "[]",
    category: config.category,
    activation: "active",
    summary: null,
    detailsJson: "{}",
    penalties: null,
    stage: config.stage,
  });
}

/**
 * Delete system obligation for contract lifecycle
 * @param {number} documentId - Contract document ID
 * @param {string} type - System obligation type ('system_sign' or 'system_terminate')
 */
export function deleteSystemObligation(documentId, type) {
  run(
    `DELETE FROM contract_obligations WHERE document_id = ? AND obligation_type = ?`,
    [documentId, type]
  );
}

// ============================================
// Version control operations
// ============================================

/**
 * Insert a pending replacement candidate detected during processing.
 */
export function addPendingReplacement(newDocumentId, candidateId, confidence) {
  const result = run(
    `INSERT INTO pending_replacements (new_document_id, candidate_id, confidence) VALUES (?, ?, ?)`,
    [newDocumentId, candidateId, confidence]
  );
  return result.lastInsertRowId;
}

/**
 * Get all pending replacements (status = 'pending'), joined with document names.
 */
export function getPendingReplacements(orgId) {
  if (orgId !== undefined) {
    return query(`
      SELECT pr.*,
        nd.name AS new_doc_name, nd.doc_type AS new_doc_type,
        cd.name AS candidate_name, cd.doc_type AS candidate_doc_type,
        cd.version AS candidate_version
      FROM pending_replacements pr
      JOIN documents nd ON pr.new_document_id = nd.id
      JOIN documents cd ON pr.candidate_id = cd.id
      WHERE pr.status = 'pending' AND nd.org_id = ?
      ORDER BY pr.detected_at DESC
    `, [orgId]);
  }
  return query(`
    SELECT pr.*,
      nd.name AS new_doc_name, nd.doc_type AS new_doc_type,
      cd.name AS candidate_name, cd.doc_type AS candidate_doc_type,
      cd.version AS candidate_version
    FROM pending_replacements pr
    JOIN documents nd ON pr.new_document_id = nd.id
    JOIN documents cd ON pr.candidate_id = cd.id
    WHERE pr.status = 'pending'
    ORDER BY pr.detected_at DESC
  `);
}

/**
 * Get pending replacement for a specific new document (status = 'pending').
 */
export function getPendingReplacementForDoc(newDocumentId) {
  return get(`
    SELECT pr.*,
      cd.name AS candidate_name, cd.version AS candidate_version
    FROM pending_replacements pr
    JOIN documents cd ON pr.candidate_id = cd.id
    WHERE pr.new_document_id = ? AND pr.status = 'pending'
    LIMIT 1
  `, [newDocumentId]);
}

/**
 * Update pending replacement status.
 */
export function updatePendingReplacementStatus(id, status) {
  run(`UPDATE pending_replacements SET status = ? WHERE id = ?`, [status, id]);
}

/**
 * Store a precomputed diff between two document versions.
 */
export function addDocumentDiff(oldDocumentId, newDocumentId, diffJson) {
  const result = run(
    `INSERT INTO document_diffs (old_document_id, new_document_id, diff_json) VALUES (?, ?, ?)`,
    [oldDocumentId, newDocumentId, JSON.stringify(diffJson)]
  );
  return result.lastInsertRowId;
}

/**
 * Get stored diff between two documents.
 */
export function getDocumentDiff(oldDocumentId, newDocumentId) {
  return get(
    `SELECT * FROM document_diffs WHERE old_document_id = ? AND new_document_id = ?`,
    [oldDocumentId, newDocumentId]
  );
}

/**
 * Get the full version chain for a document (all versions sharing the same canonical_id).
 * Returns newest-first.
 */
export function getDocumentVersionChain(documentId) {
  // First resolve canonical_id
  const doc = get(`SELECT id, canonical_id FROM documents WHERE id = ?`, [documentId]);
  if (!doc) return [];
  const rootId = doc.canonical_id ?? doc.id;
  return query(`
    SELECT id, name, version, status, in_force, added_at, superseded_by, canonical_id
    FROM documents
    WHERE id = ? OR canonical_id = ?
    ORDER BY version DESC
  `, [rootId, rootId]);
}

/**
 * Apply version link: old doc gets archived, new doc becomes current version.
 * Returns { oldDoc, newDoc }.
 */
export function applyVersionLink(oldDocumentId, newDocumentId) {
  const oldDoc = get(`SELECT * FROM documents WHERE id = ?`, [oldDocumentId]);
  if (!oldDoc) throw new Error(`Old document ${oldDocumentId} not found`);
  const newDoc = get(`SELECT * FROM documents WHERE id = ?`, [newDocumentId]);
  if (!newDoc) throw new Error(`New document ${newDocumentId} not found`);

  const canonicalId = oldDoc.canonical_id ?? oldDoc.id;
  const newVersion = (oldDoc.version ?? 1) + 1;

  // Archive old document
  run(
    `UPDATE documents SET in_force = 'false', status = 'archived', superseded_by = ? WHERE id = ?`,
    [newDocumentId, oldDocumentId]
  );

  // Promote new document
  run(
    `UPDATE documents SET in_force = 'true', version = ?, canonical_id = ? WHERE id = ?`,
    [newVersion, canonicalId, newDocumentId]
  );

  return {
    oldDoc: get(`SELECT * FROM documents WHERE id = ?`, [oldDocumentId]),
    newDoc: get(`SELECT * FROM documents WHERE id = ?`, [newDocumentId]),
  };
}

// ============================================
// Product Hub operations
// ============================================

export function createProductFeature(title = 'Untitled Feature') {
  const result = run(
    `INSERT INTO product_features (title, status) VALUES (?, 'idea')`,
    [title]
  );
  return get(`SELECT * FROM product_features WHERE id = ?`, [result.lastInsertRowId]);
}

export function getProductFeatures(orgId) {
  if (orgId !== undefined) {
    return query(`
      SELECT id, title, status, created_by, created_at, updated_at,
             linked_contract_id, selected_document_ids, selected_templates
      FROM product_features
      WHERE org_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `, [orgId]);
  }
  return query(`
    SELECT id, title, status, created_by, created_at, updated_at,
           linked_contract_id, selected_document_ids, selected_templates
    FROM product_features
    ORDER BY updated_at DESC, created_at DESC
  `);
}

export function getProductFeature(id) {
  return get(`SELECT * FROM product_features WHERE id = ?`, [id]);
}

export function updateProductFeature(id, fields) {
  const allowed = [
    'title', 'intake_form_json', 'selected_document_ids', 'free_context',
    'selected_templates', 'generated_outputs_json', 'status',
    'version_history_json', 'linked_contract_id', 'created_by'
  ];
  const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (updates.length === 0) return;
  const setClauses = updates.map(([k]) => `${k} = ?`).join(', ');
  const values = updates.map(([, v]) => v);
  run(
    `UPDATE product_features SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...values, id]
  );
}

export function deleteProductFeature(id) {
  run(`DELETE FROM product_features WHERE id = ?`, [id]);
}

// ============================================
// Contract invoice operations
// ============================================

export function insertInvoice({ contractId, amount, currency, description, dateOfIssue, dateOfPayment, isPaid, invoiceFilePath, paymentConfirmationPath }) {
  const result = run(
    `INSERT INTO contract_invoices (contract_id, amount, currency, description, date_of_issue, date_of_payment, is_paid, invoice_file_path, payment_confirmation_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [contractId, amount, currency || "EUR", description || null, dateOfIssue || null, dateOfPayment || null, isPaid ? 1 : 0, invoiceFilePath || null, paymentConfirmationPath || null]
  );
  return result.lastInsertRowId;
}

export function getInvoicesByContractId(contractId) {
  return query(
    `SELECT * FROM contract_invoices WHERE contract_id = ? ORDER BY date_of_issue DESC, created_at DESC`,
    [contractId]
  );
}

export function getInvoiceById(id) {
  return get(`SELECT * FROM contract_invoices WHERE id = ?`, [id]);
}

export function updateInvoice(id, updates) {
  const allowedFields = ["amount", "currency", "description", "date_of_issue", "date_of_payment", "is_paid", "invoice_file_path", "payment_confirmation_path"];
  const fields = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      params.push(value);
    }
  }
  if (fields.length === 0) return;

  fields.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  run(`UPDATE contract_invoices SET ${fields.join(", ")} WHERE id = ?`, params);
}

export function deleteInvoice(id) {
  run(`DELETE FROM contract_invoices WHERE id = ?`, [id]);
}

export function getContractInvoiceSummary(contractId) {
  const totals = get(
    `SELECT
      COALESCE(SUM(amount), 0) as totalInvoiced,
      COALESCE(SUM(CASE WHEN is_paid = 1 THEN amount ELSE 0 END), 0) as totalPaid,
      COALESCE(SUM(CASE WHEN is_paid = 0 AND date_of_payment < date('now') THEN 1 ELSE 0 END), 0) as overdueCount
    FROM contract_invoices
    WHERE contract_id = ?`,
    [contractId]
  );
  return totals || { totalInvoiced: 0, totalPaid: 0, overdueCount: 0 };
}

// ============================================
// Contract document operations (attachments)
// ============================================

export function addContractDocumentUpload({ contractId, filePath, fileName, documentType, label }) {
  const result = run(
    `INSERT INTO contract_documents (contract_id, file_path, file_name, document_type, label)
     VALUES (?, ?, ?, ?, ?)`,
    [contractId, filePath, fileName, documentType || "other", label || null]
  );
  return result.lastInsertRowId;
}

export function linkContractDocument({ contractId, documentId, documentType, label }) {
  // Look up the document name from the documents table
  const doc = get(`SELECT name FROM documents WHERE id = ?`, [documentId]);
  const fileName = doc ? doc.name : null;
  const result = run(
    `INSERT INTO contract_documents (contract_id, document_id, file_name, document_type, label)
     VALUES (?, ?, ?, ?, ?)`,
    [contractId, documentId, fileName, documentType || "other", label || null]
  );
  return result.lastInsertRowId;
}

export function getContractDocuments(contractId) {
  return query(
    `SELECT cd.*,
       d.name AS linked_document_name
     FROM contract_documents cd
     LEFT JOIN documents d ON cd.document_id = d.id
     WHERE cd.contract_id = ?
     ORDER BY cd.added_at DESC`,
    [contractId]
  );
}

export function getContractDocumentById(id) {
  return get(
    `SELECT cd.*,
       d.name AS linked_document_name
     FROM contract_documents cd
     LEFT JOIN documents d ON cd.document_id = d.id
     WHERE cd.id = ?`,
    [id]
  );
}

export function deleteContractDocument(id) {
  run(`DELETE FROM contract_documents WHERE id = ?`, [id]);
}

// ─── User auth helpers ────────────────────────────────────────────────────────

export function getUserByEmail(email) {
  return get(`SELECT * FROM users WHERE email = ?`, [email]);
}

export function getUserByGoogleId(googleId) {
  return get(`SELECT * FROM users WHERE google_id = ?`, [googleId]);
}

export function createUser(email, name, passwordHash) {
  run(
    `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`,
    [email, name, passwordHash]
  );
  return get(`SELECT * FROM users WHERE email = ?`, [email]);
}

/**
 * Called on Google OAuth sign-in.
 * - If google_id already exists: return that user.
 * - If email exists (prior password registration): link google_id to it.
 * - Otherwise: create a new user row.
 */
export function createOrUpdateGoogleUser(googleId, email, name, avatarUrl) {
  const byGoogleId = get(`SELECT * FROM users WHERE google_id = ?`, [googleId]);
  if (byGoogleId) return byGoogleId;

  const byEmail = get(`SELECT * FROM users WHERE email = ?`, [email]);
  if (byEmail) {
    run(
      `UPDATE users SET google_id = ?, avatar_url = ? WHERE email = ?`,
      [googleId, avatarUrl, email]
    );
    return get(`SELECT * FROM users WHERE email = ?`, [email]);
  }

  run(
    `INSERT INTO users (email, name, google_id, avatar_url) VALUES (?, ?, ?, ?)`,
    [email, name, googleId, avatarUrl]
  );
  return get(`SELECT * FROM users WHERE email = ?`, [email]);
}

// ─── Session helpers ──────────────────────────────────────────────────────────

// INSERT OR IGNORE is intentional: session IDs are UUIDs, so collision is
// impossible in practice. The IGNORE handles the rare case of a duplicate
// call during JWT token refresh cycles without throwing.
export function createSession(id, userId) {
  run(
    `INSERT OR IGNORE INTO user_sessions (id, user_id) VALUES (?, ?)`,
    [id, userId]
  );
  return get(`SELECT * FROM user_sessions WHERE id = ?`, [id]);
}

// Does NOT call saveDb() — bypasses run() helper intentionally to avoid
// writing the full DB to disk on every page navigation.
// Safety guard: returns early if db is not initialised.
export function touchSession(id) {
  if (!db) return;
  db.run(
    `UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked = 0`,
    [id]
  );
}

export function revokeUserSessions(userId) {
  run(
    `UPDATE user_sessions SET revoked = 1 WHERE user_id = ?`,
    [userId]
  );
}

export function getSessionById(id) {
  return get(`SELECT * FROM user_sessions WHERE id = ?`, [id]);
}

export function getUsersWithSessionInfo() {
  const sql = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.created_at,
      s.last_seen_at,
      CASE
        WHEN s.last_seen_at IS NOT NULL
         AND s.revoked = 0
         AND (strftime('%s','now') - strftime('%s', s.last_seen_at)) < ?
        THEN 1 ELSE 0
      END AS is_active
    FROM users u
    LEFT JOIN user_sessions s
      ON s.user_id = u.id
      AND s.revoked = 0
      AND s.id = (
        SELECT id FROM user_sessions
        WHERE user_id = u.id AND revoked = 0
        ORDER BY last_seen_at DESC
        LIMIT 1
      )
    ORDER BY u.created_at DESC
  `;
  return query(sql, [SESSION_ACTIVE_WINDOW_MINUTES * 60]);
}

// ============================================
// Legal Hub operations
// ============================================

/**
 * List legal cases with optional search and filters.
 * Includes next_deadline via subquery.
 * @param {Object} [options]
 * @param {string} [options.search] - Search term for title
 * @param {string} [options.status] - Filter by status
 * @param {string} [options.caseType] - Filter by case_type
 * @returns {Object[]}
 */
export function getLegalCases({ search, status, caseType, orgId } = {}) {
  let sql = `
    SELECT lc.*,
      (SELECT MIN(cd.due_date)
       FROM case_deadlines cd
       WHERE cd.case_id = lc.id AND cd.status = 'pending'
      ) AS next_deadline
    FROM legal_cases lc
    WHERE 1=1
  `;
  const params = [];

  if (orgId !== undefined && orgId !== null) {
    sql += ` AND lc.org_id = ?`;
    params.push(orgId);
  }
  if (search) {
    sql += ` AND lc.title LIKE ?`;
    params.push(`%${search}%`);
  }
  if (status) {
    sql += ` AND lc.status = ?`;
    params.push(status);
  }
  if (caseType) {
    sql += ` AND lc.case_type = ?`;
    params.push(caseType);
  }

  sql += ` ORDER BY lc.created_at DESC`;
  return query(sql, params);
}

/**
 * Get a single legal case by ID.
 * @param {number} id
 * @returns {Object|null}
 */
export function getLegalCaseById(id) {
  return get(`
    SELECT lc.*,
      (SELECT MIN(cd.due_date)
       FROM case_deadlines cd
       WHERE cd.case_id = lc.id AND cd.status = 'pending'
      ) AS next_deadline
    FROM legal_cases lc
    WHERE lc.id = ?
  `, [id]);
}

/**
 * Create a new legal case.
 * @param {Object} data
 * @returns {number} New case ID
 */
export function createLegalCase({
  title,
  caseType,
  referenceNumber,
  internalNumber,
  procedureType,
  court,
  courtDivision,
  judge,
  summary,
  claimDescription,
  claimValue,
  claimCurrency,
  tags,
  extensionData,
  orgId = null,
}) {
  const result = run(
    `INSERT INTO legal_cases (
      title, case_type, reference_number, internal_number,
      procedure_type, court, court_division, judge,
      summary, claim_description, claim_value, claim_currency,
      tags, extension_data, org_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      caseType,
      referenceNumber || null,
      internalNumber || null,
      procedureType || null,
      court || null,
      courtDivision || null,
      judge || null,
      summary || null,
      claimDescription || null,
      claimValue ?? null,
      claimCurrency || "PLN",
      tags ? JSON.stringify(tags) : "[]",
      extensionData ? JSON.stringify(extensionData) : "{}",
      orgId,
    ]
  );
  return result.lastInsertRowId;
}

/**
 * Update a legal case by ID.
 * @param {number} id
 * @param {Object} fields
 */
export function updateLegalCase(id, fields) {
  const allowedFields = [
    "title", "case_type", "reference_number", "internal_number",
    "procedure_type", "court", "court_division", "judge",
    "status", "status_history_json", "summary", "claim_description",
    "claim_value", "claim_currency", "tags", "extension_data",
  ];

  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  run(`UPDATE legal_cases SET ${setClauses.join(", ")} WHERE id = ?`, params);
}

/**
 * Delete a legal case by ID.
 * @param {number} id
 */
export function deleteLegalCase(id) {
  run(`DELETE FROM legal_cases WHERE id = ?`, [id]);
}

// ---- Case Parties ----

/**
 * Get all parties for a case.
 * @param {number} caseId
 * @returns {Object[]}
 */
export function getCaseParties(caseId) {
  return query(
    `SELECT * FROM case_parties WHERE case_id = ? ORDER BY party_type, id`,
    [caseId]
  );
}

/**
 * Add a party to a case.
 * @param {Object} data
 * @returns {number} New party ID
 */
export function addCaseParty({
  caseId,
  partyType,
  name,
  address,
  representativeName,
  representativeAddress,
  representativeType,
  notes,
}) {
  const result = run(
    `INSERT INTO case_parties (
      case_id, party_type, name, address,
      representative_name, representative_address, representative_type, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      caseId,
      partyType,
      name,
      address || null,
      representativeName || null,
      representativeAddress || null,
      representativeType || null,
      notes || null,
    ]
  );
  return result.lastInsertRowId;
}

/**
 * Update a case party by ID.
 * @param {number} id
 * @param {Object} fields
 */
export function updateCaseParty(id, fields) {
  const allowedFields = [
    "party_type", "name", "address",
    "representative_name", "representative_address", "representative_type",
    "notes",
  ];

  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) return;

  params.push(id);
  run(`UPDATE case_parties SET ${setClauses.join(", ")} WHERE id = ?`, params);
}

/**
 * Delete a case party by ID.
 * @param {number} id
 */
export function deleteCaseParty(id) {
  run(`DELETE FROM case_parties WHERE id = ?`, [id]);
}

/**
 * Get a single case party by ID.
 * @param {number} id
 * @returns {Object|undefined}
 */
export function getCasePartyById(id) {
  return get(`SELECT * FROM case_parties WHERE id = ?`, [id]);
}

// ---- Case Deadlines ----

/**
 * Get all deadlines for a case.
 * @param {number} caseId
 * @returns {Object[]}
 */
export function getCaseDeadlines(caseId) {
  return query(
    `SELECT * FROM case_deadlines WHERE case_id = ? ORDER BY due_date ASC`,
    [caseId]
  );
}

/**
 * Add a deadline to a case.
 * @param {Object} data
 * @returns {number} New deadline ID
 */
export function addCaseDeadline({
  caseId,
  title,
  deadlineType,
  dueDate,
  description,
}) {
  const result = run(
    `INSERT INTO case_deadlines (
      case_id, title, deadline_type, due_date, description, status
    ) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [
      caseId,
      title,
      deadlineType,
      dueDate,
      description || null,
    ]
  );
  return result.lastInsertRowId;
}

/**
 * Update a case deadline by ID.
 * @param {number} id
 * @param {Object} fields
 */
export function updateCaseDeadline(id, fields) {
  const allowedFields = [
    "title", "deadline_type", "due_date", "description",
    "status", "completed_at",
  ];

  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) return;

  params.push(id);
  run(`UPDATE case_deadlines SET ${setClauses.join(", ")} WHERE id = ?`, params);
}

/**
 * Delete a case deadline by ID.
 * @param {number} id
 */
export function deleteCaseDeadline(id) {
  run(`DELETE FROM case_deadlines WHERE id = ?`, [id]);
}

/**
 * Get a single case deadline by ID.
 * @param {number} id
 * @returns {Object|undefined}
 */
export function getCaseDeadlineById(id) {
  return get(`SELECT * FROM case_deadlines WHERE id = ?`, [id]);
}

// ---- Case Documents ----

/**
 * Get all documents for a case (with linked document info).
 * @param {number} caseId
 * @returns {Object[]}
 */
export function getCaseDocuments(caseId) {
  return query(
    `SELECT cd.*,
       d.name AS linked_document_name,
       d.path AS linked_document_path
     FROM case_documents cd
     LEFT JOIN documents d ON cd.document_id = d.id
     WHERE cd.case_id = ?
     ORDER BY cd.added_at DESC`,
    [caseId]
  );
}

/**
 * Add a document attachment to a case.
 * @param {Object} data
 * @returns {number} New case_document ID
 */
export function addCaseDocument({
  caseId,
  documentId,
  filePath,
  fileName,
  documentCategory,
  label,
  dateFiled,
  filingReference,
}) {
  const result = run(
    `INSERT INTO case_documents (
      case_id, document_id, file_path, file_name,
      document_category, label, date_filed, filing_reference
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      caseId,
      documentId || null,
      filePath || null,
      fileName || null,
      documentCategory || "other",
      label || null,
      dateFiled || null,
      filingReference || null,
    ]
  );
  return result.lastInsertRowId;
}

/**
 * Get a single case document by ID (with linked document info).
 * @param {number} id
 * @returns {Object|null}
 */
export function getCaseDocumentById(id) {
  return get(
    `SELECT cd.*,
       d.name AS linked_document_name,
       d.path AS linked_document_path
     FROM case_documents cd
     LEFT JOIN documents d ON cd.document_id = d.id
     WHERE cd.id = ?`,
    [id]
  );
}

/**
 * Remove a case document attachment (does NOT delete from documents library).
 * @param {number} id
 */
export function removeCaseDocument(id) {
  run(`DELETE FROM case_documents WHERE id = ?`, [id]);
}

// ---- Case Templates ----

/**
 * List case templates with optional filters.
 * @param {Object} [options]
 * @param {string} [options.search] - Search term for name
 * @param {string} [options.documentType] - Filter by document_type
 * @param {number} [options.isActive] - Filter by is_active (1 or 0)
 * @returns {Object[]}
 */
export function getCaseTemplates({ search, documentType, isActive, orgId } = {}) {
  let sql = `SELECT * FROM case_templates WHERE 1=1`;
  const params = [];

  if (orgId !== undefined && orgId !== null) {
    sql += ` AND (org_id = ? OR is_system_template = 1)`;
    params.push(orgId);
  }
  if (search) {
    sql += ` AND name LIKE ?`;
    params.push(`%${search}%`);
  }
  if (documentType) {
    sql += ` AND document_type = ?`;
    params.push(documentType);
  }
  if (isActive !== undefined && isActive !== null) {
    sql += ` AND is_active = ?`;
    params.push(isActive);
  }

  sql += ` ORDER BY name ASC`;
  return query(sql, params);
}

/**
 * Get a single case template by ID.
 * @param {number} id
 * @returns {Object|null}
 */
export function getCaseTemplateById(id) {
  return get(`SELECT * FROM case_templates WHERE id = ?`, [id]);
}

/**
 * Create a new case template.
 * @param {Object} data
 * @returns {number} New template ID
 */
export function createCaseTemplate({
  name,
  description,
  documentType,
  applicableCaseTypes,
  templateBody,
  variablesJson,
  orgId = null,
}) {
  const result = run(
    `INSERT INTO case_templates (
      name, description, document_type, applicable_case_types,
      template_body, variables_json, org_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      description || null,
      documentType || null,
      applicableCaseTypes ? JSON.stringify(applicableCaseTypes) : "[]",
      templateBody,
      variablesJson ? JSON.stringify(variablesJson) : "[]",
      orgId,
    ]
  );
  return result.lastInsertRowId;
}

/**
 * Update a case template by ID.
 * @param {number} id
 * @param {Object} fields
 */
export function updateCaseTemplate(id, fields) {
  const allowedFields = [
    "name", "description", "document_type", "applicable_case_types",
    "template_body", "variables_json", "is_active",
  ];

  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  run(`UPDATE case_templates SET ${setClauses.join(", ")} WHERE id = ?`, params);
}

/**
 * Delete a case template by ID.
 * @param {number} id
 */
export function deleteCaseTemplate(id) {
  run(`DELETE FROM case_templates WHERE id = ?`, [id]);
}

// ---- Case Generated Docs ----

/**
 * List generated docs for a case, newest first.
 * @param {number} caseId
 * @returns {Object[]}
 */
export function getCaseGeneratedDocs(caseId) {
  return query(
    `SELECT * FROM case_generated_docs WHERE case_id = ? ORDER BY created_at DESC`,
    [caseId]
  );
}

/**
 * Get a single generated doc by ID.
 * @param {number} id
 * @returns {Object|null}
 */
export function getCaseGeneratedDocById(id) {
  return get(`SELECT * FROM case_generated_docs WHERE id = ?`, [id]);
}

/**
 * Create a generated document record.
 * @param {Object} data
 * @returns {number} New generated doc ID
 */
export function createCaseGeneratedDoc({
  caseId,
  templateId,
  templateName,
  documentName,
  generatedContent,
  filledVariablesJson,
}) {
  const result = run(
    `INSERT INTO case_generated_docs (
      case_id, template_id, template_name, document_name,
      generated_content, filled_variables_json
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      caseId,
      templateId || null,
      templateName || null,
      documentName,
      generatedContent,
      filledVariablesJson || "{}",
    ]
  );
  return result.lastInsertRowId;
}

/**
 * Update a generated document by ID.
 * @param {number} id
 * @param {Object} fields
 */
export function updateCaseGeneratedDoc(id, fields) {
  const allowedFields = [
    "document_name", "generated_content", "filled_variables_json", "file_path",
  ];

  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  run(`UPDATE case_generated_docs SET ${setClauses.join(", ")} WHERE id = ?`, params);
}

/**
 * Delete a generated document by ID.
 * @param {number} id
 */
export function deleteCaseGeneratedDoc(id) {
  run(`DELETE FROM case_generated_docs WHERE id = ?`, [id]);
}

// ---- Case Chunks (for chat) ----

/**
 * Get all chunks (with embeddings) for documents linked to a case.
 * Used by the case chat endpoint for in-memory cosine similarity search.
 * Only returns chunks that have embeddings and belong to documents
 * linked via case_documents (document_id IS NOT NULL).
 * @param {number} caseId
 * @returns {Array<{id, document_id, content, chunk_index, embedding, document_name}>}
 */
export function getCaseChunks(caseId) {
  return query(
    `SELECT c.id, c.document_id, c.content, c.chunk_index, c.embedding,
            d.name as document_name
     FROM chunks c
     JOIN documents d ON c.document_id = d.id
     WHERE c.embedding IS NOT NULL
       AND c.document_id IN (
         SELECT document_id FROM case_documents
         WHERE case_id = ? AND document_id IS NOT NULL
       )
     ORDER BY c.document_id, c.chunk_index`,
    [caseId]
  );
}

// ---- Page-aware chunk helpers (Plan 023) ----

/**
 * Insert a chunk with full page-aware metadata.
 * FTS5 trigger fires automatically after this INSERT.
 * @param {Object} chunk
 * @returns {{changes: number, lastInsertRowId: number}}
 */
export function insertChunkWithMeta({
  documentId,
  content,
  chunkIndex,
  embedding,
  pageNumber,
  charOffsetStart,
  charOffsetEnd,
  sectionTitle,
  sentencesJson,
}) {
  return run(
    `INSERT INTO chunks
       (document_id, content, chunk_index, embedding,
        page_number, char_offset_start, char_offset_end,
        section_title, sentences_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      documentId, content, chunkIndex, embedding,
      pageNumber ?? null, charOffsetStart ?? null,
      charOffsetEnd ?? null, sectionTitle ?? null,
      sentencesJson ?? null,
    ]
  );
}

/**
 * Get all chunks (with page metadata) for documents linked to a case.
 * Includes page_number, section_title, sentences_json for citation support.
 * @param {number} caseId
 * @returns {Object[]}
 */
export function getChunksByCaseId(caseId) {
  return query(
    `SELECT c.id, c.document_id, c.content, c.chunk_index, c.embedding,
            c.page_number, c.char_offset_start, c.char_offset_end,
            c.section_title, c.sentences_json,
            d.name as document_name
     FROM chunks c
     JOIN documents d ON c.document_id = d.id
     JOIN case_documents cd ON d.id = cd.document_id
     WHERE cd.case_id = ?
       AND c.embedding IS NOT NULL
     ORDER BY c.document_id, c.chunk_index`,
    [caseId]
  );
}

/**
 * Get indexing status for all documents linked to a case.
 * @param {number} caseId
 * @returns {{documentId: number, documentName: string, processed: number, chunksIndexed: number}[]}
 */
export function getCaseDocumentIndexingStatus(caseId) {
  return query(
    `SELECT
       cd.document_id AS documentId,
       COALESCE(d.name, cd.file_name) AS documentName,
       COALESCE(d.processed, 0) AS processed,
       d.processing_error AS processingError,
       (SELECT COUNT(*) FROM chunks ch WHERE ch.document_id = cd.document_id AND ch.embedding IS NOT NULL) AS chunksIndexed,
       cd.added_at AS addedAt
     FROM case_documents cd
     LEFT JOIN documents d ON cd.document_id = d.id
     WHERE cd.case_id = ?
       AND cd.document_id IS NOT NULL
     ORDER BY cd.added_at DESC`,
    [caseId]
  );
}

// ============================================
// Organization operations
// ============================================

/**
 * Get the default (first) organization
 * @returns {Object|null}
 */
export function getDefaultOrg() {
  return get(`SELECT * FROM organizations ORDER BY id ASC LIMIT 1`);
}

/**
 * Get an organization by id
 * @param {number} id
 * @returns {Object|null}
 */
export function getOrgById(id) {
  return get(`SELECT * FROM organizations WHERE id = ?`, [id]);
}

/**
 * Get the first org membership for a user (ordered by joined_at ASC)
 * @param {number} userId
 * @returns {Object|null} - { org_id, user_id, role, joined_at, invited_by }
 */
export function getOrgMemberByUserId(userId) {
  return get(
    `SELECT om.org_id, om.user_id, om.role, om.joined_at, om.invited_by, o.name AS org_name
     FROM org_members om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = ? AND o.deleted_at IS NULL
     ORDER BY om.joined_at ASC
     LIMIT 1`,
    [userId]
  );
}

/**
 * Add a user to an organization
 * @param {number} orgId
 * @param {number} userId
 * @param {string} role
 * @param {number|null} invitedBy
 */
export function addOrgMember(orgId, userId, role, invitedBy) {
  run(
    `INSERT INTO org_members (org_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)`,
    [orgId, userId, role, invitedBy]
  );
  if (role === 'member') {
    seedMemberPermissionsFromDefaults(orgId, userId);
  }
}

/**
 * Get all settings for an org as key-value rows
 * @param {number} orgId
 * @returns {Object[]}
 */
export function getOrgSettings(orgId) {
  return query(`SELECT key, value FROM app_settings WHERE org_id = ?`, [orgId]);
}

/**
 * Upsert a single setting for an org
 * @param {number} orgId
 * @param {string} key
 * @param {string} value
 */
export function setOrgSetting(orgId, key, value) {
  run(
    `INSERT OR REPLACE INTO app_settings (org_id, key, value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    [orgId, key, value]
  );
}

/**
 * Delete all settings for an org
 * @param {number} orgId
 */
export function deleteOrgSettings(orgId) {
  run(`DELETE FROM app_settings WHERE org_id = ?`, [orgId]);
}

/**
 * Get all members of an organization with user info
 * @param {number} orgId
 * @returns {Object[]}
 */
export function getOrgMembers(orgId) {
  return query(
    `SELECT om.user_id AS userId, u.name, u.email, om.role, om.joined_at AS joinedAt
     FROM org_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.org_id = ?
     ORDER BY om.joined_at ASC`,
    [orgId]
  );
}

/**
 * Get a single org member record
 * @param {number} orgId
 * @param {number} userId
 * @returns {Object|null}
 */
export function getOrgMemberRecord(orgId, userId) {
  return get(
    `SELECT om.org_id, om.user_id, om.role, om.joined_at
     FROM org_members om
     WHERE om.org_id = ? AND om.user_id = ?`,
    [orgId, userId]
  );
}

/**
 * Update a member's role in an organization
 * @param {number} orgId
 * @param {number} userId
 * @param {string} role
 */
export function updateOrgMemberRole(orgId, userId, role) {
  run(
    `UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?`,
    [role, orgId, userId]
  );
}

/**
 * Remove a member from an organization
 * @param {number} orgId
 * @param {number} userId
 */
export function removeOrgMember(orgId, userId) {
  run(
    `DELETE FROM org_members WHERE org_id = ? AND user_id = ?`,
    [orgId, userId]
  );
}

/**
 * Update an organization's name
 * @param {number} orgId
 * @param {string} name
 */
export function updateOrgName(orgId, name) {
  run(
    `UPDATE organizations SET name = ? WHERE id = ?`,
    [name, orgId]
  );
}

/**
 * Count the number of owners in an organization
 * @param {number} orgId
 * @returns {number}
 */
export function countOrgOwners(orgId) {
  const row = get(
    `SELECT COUNT(*) AS cnt FROM org_members WHERE org_id = ? AND role = 'owner'`,
    [orgId]
  );
  return row ? row.cnt : 0;
}

/**
 * Count all members in an organization
 * @param {number} orgId
 * @returns {number}
 */
export function countOrgMembers(orgId) {
  const row = get(
    `SELECT COUNT(*) AS cnt FROM org_members WHERE org_id = ?`,
    [orgId]
  );
  return row ? row.cnt : 0;
}

// ── Org Invites ──────────────────────────────────────────────────────────

/**
 * Create an org invite. Revokes any pending (non-accepted, non-expired) invite
 * for the same email+org first.
 * @param {number} orgId
 * @param {string} email
 * @param {string} role
 * @returns {{ token: string, orgId: number, email: string, role: string, expiresAt: string }}
 */
export function createOrgInvite(orgId, email, role) {
  // Revoke any existing pending invite for same email+org
  run(
    `DELETE FROM org_invites
     WHERE org_id = ? AND email = ? AND accepted_at IS NULL AND datetime(expires_at) > datetime('now')`,
    [orgId, email]
  );

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  run(
    `INSERT INTO org_invites (token, org_id, email, role, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [token, orgId, email, role, expiresAt]
  );

  return { token, orgId, email, role, expiresAt };
}

/**
 * Look up an invite by token, with org name via JOIN
 * @param {string} token
 * @returns {{ token: string, orgId: number, orgName: string, email: string, role: string, expiresAt: string, acceptedAt: string|null }|null}
 */
export function getOrgInviteByToken(token) {
  const row = get(
    `SELECT i.token, i.org_id AS orgId, o.name AS orgName, i.email, i.role,
            i.expires_at AS expiresAt, i.accepted_at AS acceptedAt
     FROM org_invites i
     JOIN organizations o ON o.id = i.org_id
     WHERE i.token = ?`,
    [token]
  );
  return row || null;
}

/**
 * List all pending (non-accepted, non-expired) invites for an org
 * @param {number} orgId
 * @returns {Array<{ token: string, email: string, role: string, expiresAt: string }>}
 */
export function listOrgInvites(orgId) {
  return query(
    `SELECT token, email, role, expires_at AS expiresAt, created_at AS createdAt
     FROM org_invites
     WHERE org_id = ? AND accepted_at IS NULL AND datetime(expires_at) > datetime('now')
     ORDER BY created_at DESC`,
    [orgId]
  );
}

/**
 * Mark an invite as accepted
 * @param {string} token
 */
export function acceptOrgInvite(token) {
  run(
    `UPDATE org_invites SET accepted_at = CURRENT_TIMESTAMP WHERE token = ?`,
    [token]
  );
}

/**
 * Revoke (delete) an invite
 * @param {string} token
 */
export function revokeOrgInvite(token) {
  run(`DELETE FROM org_invites WHERE token = ?`, [token]);
}

/**
 * Get all org memberships for a user, with org details
 * @param {number} userId
 * @returns {Array<{ orgId: number, orgName: string, orgSlug: string, role: string, joinedAt: string }>}
 */
export function getAllOrgMembershipsForUser(userId) {
  return query(
    `SELECT om.org_id AS orgId, o.name AS orgName, o.slug AS orgSlug,
            om.role, om.joined_at AS joinedAt
     FROM org_members om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = ?
     ORDER BY om.joined_at ASC`,
    [userId]
  );
}

/**
 * Get a single org membership for a user+org pair, with org details
 * @param {number} userId
 * @param {number} orgId
 * @returns {{ orgId: number, orgName: string, orgSlug: string, role: string }|null}
 */
export function getOrgMemberForOrg(userId, orgId) {
  const row = get(
    `SELECT om.org_id AS orgId, o.name AS orgName, o.slug AS orgSlug, om.role
     FROM org_members om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = ? AND om.org_id = ? AND o.deleted_at IS NULL`,
    [userId, orgId]
  );
  return row || null;
}

// ─── Super Admin / Organization Management (Plan 030) ────────────────────────

/**
 * Get all organizations (including soft-deleted) with member counts.
 * @returns {Array<{id: number, name: string, slug: string, created_at: string, deleted_at: string|null, member_count: number}>}
 */
export function getAllOrganizations() {
  return query(
    `SELECT o.id, o.name, o.slug, o.created_at, o.deleted_at,
            COUNT(om.user_id) as member_count
     FROM organizations o
     LEFT JOIN org_members om ON om.org_id = o.id
     GROUP BY o.id
     ORDER BY o.created_at DESC`
  );
}

/**
 * Get only active (non-deleted) organizations with member counts.
 * @returns {Array<{id: number, name: string, slug: string, created_at: string, deleted_at: null, member_count: number}>}
 */
export function getActiveOrganizations() {
  return query(
    `SELECT o.id, o.name, o.slug, o.created_at, o.deleted_at,
            COUNT(om.user_id) as member_count
     FROM organizations o
     LEFT JOIN org_members om ON om.org_id = o.id
     WHERE o.deleted_at IS NULL
     GROUP BY o.id
     ORDER BY o.created_at DESC`
  );
}

/**
 * Create a new organization.
 * @param {string} name
 * @param {string} slug
 * @returns {number} The new organization's id
 */
export function createOrganization(name, slug) {
  const result = run(`INSERT INTO organizations (name, slug) VALUES (?, ?)`, [name, slug]);
  const newOrgId = result.lastInsertRowId;
  try {
    seedOrgPermissionDefaults(newOrgId);
  } catch (e) {
    // Non-fatal: org_permission_defaults table may not exist on pre-Plan 031 DBs
    console.warn('[permissions] seedOrgPermissionDefaults failed for org', newOrgId, e?.message);
  }
  return newOrgId;
}

/**
 * Soft-delete an organization by setting deleted_at.
 * @param {number} id
 */
export function softDeleteOrg(id) {
  run(`UPDATE organizations SET deleted_at = datetime('now') WHERE id = ?`, [id]);
}

/**
 * Restore a soft-deleted organization by clearing deleted_at.
 * @param {number} id
 */
export function restoreOrg(id) {
  run(`UPDATE organizations SET deleted_at = NULL WHERE id = ?`, [id]);
}

/**
 * Set or clear super admin flag on a user.
 * @param {number} userId
 * @param {number} flag - 0 or 1
 */
export function setSuperAdmin(userId, flag) {
  run(`UPDATE users SET is_super_admin = ? WHERE id = ?`, [flag, userId]);
}

/**
 * Get a single organization by id with member count (including deleted).
 * @param {number} id
 * @returns {{id: number, name: string, slug: string, created_at: string, deleted_at: string|null, member_count: number}|null}
 */
export function getOrgWithMemberCount(id) {
  return get(
    `SELECT o.*, COUNT(om.user_id) as member_count
     FROM organizations o
     LEFT JOIN org_members om ON om.org_id = o.id
     WHERE o.id = ?
     GROUP BY o.id`,
    [id]
  );
}

// ── Permission System (Plan 031) ──────────────────────────────────────

/**
 * Resources that can be permission-controlled.
 * @type {string[]}
 */
export const PERMISSION_RESOURCES = ['documents', 'contracts', 'legal_hub', 'policies', 'qa_cards'];

/**
 * Seed org permission defaults with 'full' for all resources.
 * Called automatically when a new organization is created.
 * @param {number} orgId
 */
export function seedOrgPermissionDefaults(orgId) {
  for (const resource of PERMISSION_RESOURCES) {
    run(`INSERT OR IGNORE INTO org_permission_defaults (org_id, resource, action) VALUES (?, ?, 'full')`, [orgId, resource]);
  }
}

/**
 * Seed member permissions from org defaults.
 * Called automatically when a member joins an organization.
 * @param {number} orgId
 * @param {number} userId
 */
export function seedMemberPermissionsFromDefaults(orgId, userId) {
  const defaults = getOrgPermissionDefaults(orgId);
  for (const { resource, action } of defaults) {
    run(`INSERT OR IGNORE INTO member_permissions (org_id, user_id, resource, action) VALUES (?, ?, ?, ?)`, [orgId, userId, resource, action]);
  }
}

/**
 * Get all permission defaults for an organization.
 * @param {number} orgId
 * @returns {Array<{resource: string, action: string}>}
 */
export function getOrgPermissionDefaults(orgId) {
  return query(`SELECT resource, action FROM org_permission_defaults WHERE org_id = ?`, [orgId]);
}

/**
 * Set a single org permission default.
 * @param {number} orgId
 * @param {string} resource
 * @param {string} action - 'none' | 'view' | 'edit' | 'full'
 */
export function setOrgPermissionDefault(orgId, resource, action) {
  run(`INSERT OR REPLACE INTO org_permission_defaults (org_id, resource, action) VALUES (?, ?, ?)`, [orgId, resource, action]);
}

/**
 * Get all permissions for a specific user in an organization.
 * @param {number} orgId
 * @param {number} userId
 * @returns {Array<{resource: string, action: string}>}
 */
export function getMemberPermissions(orgId, userId) {
  return query(`SELECT resource, action FROM member_permissions WHERE org_id = ? AND user_id = ?`, [orgId, userId]);
}

/**
 * Get permission level for a specific user and resource.
 * Returns 'full' as default if no row exists (backward compatibility).
 * @param {number} orgId
 * @param {number} userId
 * @param {string} resource
 * @returns {string} 'none' | 'view' | 'edit' | 'full'
 */
export function getUserPermissionForResource(orgId, userId, resource) {
  const row = get(`SELECT action FROM member_permissions WHERE org_id = ? AND user_id = ? AND resource = ?`, [orgId, userId, resource]);
  return row ? row.action : 'full';
}

/**
 * Set a single permission for a user in an organization.
 * @param {number} orgId
 * @param {number} userId
 * @param {string} resource
 * @param {string} action - 'none' | 'view' | 'edit' | 'full'
 */
export function setMemberPermission(orgId, userId, resource, action) {
  run(`INSERT OR REPLACE INTO member_permissions (org_id, user_id, resource, action) VALUES (?, ?, ?, ?)`, [orgId, userId, resource, action]);
}

/**
 * Reset a user's permissions back to org defaults.
 * Deletes existing rows and re-seeds from org_permission_defaults.
 * @param {number} orgId
 * @param {number} userId
 */
export function resetMemberPermissions(orgId, userId) {
  run(`DELETE FROM member_permissions WHERE org_id = ? AND user_id = ?`, [orgId, userId]);
  seedMemberPermissionsFromDefaults(orgId, userId);
}
