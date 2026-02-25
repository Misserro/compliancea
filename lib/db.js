import initSqlJs from "sql.js";
import fs from "fs";
import { DB_PATH, ensureDirectories } from "./paths.js";

let db = null;

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
  ];
  for (const col of obMigrationCols) {
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

  // Save initial state
  saveDb();

  return db;
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
  contracting_company, contracting_vendor, signature_date, commencement_date, expiry_date`;

export function getAllDocuments() {
  return query(`
    SELECT ${DOC_COLUMNS}
    FROM documents
    ORDER BY category, added_at DESC
  `);
}

export function getDocumentById(id) {
  return get(`
    SELECT ${DOC_COLUMNS}
    FROM documents
    WHERE id = ?
  `, [id]);
}

export function getDocumentByPath(filePath) {
  return get(`
    SELECT ${DOC_COLUMNS}
    FROM documents
    WHERE path = ?
  `, [filePath]);
}

export function addDocument(name, filePath, folder, category = null) {
  const result = run(`
    INSERT INTO documents (name, path, folder, category)
    VALUES (?, ?, ?, ?)
  `, [name, filePath, folder, category]);
  return result.lastInsertRowId;
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
    SET processed = 1, word_count = ?
    WHERE id = ?
  `, [wordCount, id]);
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

export function getAllChunksWithEmbeddings() {
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

export function getUnprocessedDocuments() {
  return query(`
    SELECT id, name, path, folder, category, added_at
    FROM documents
    WHERE processed = 0
    ORDER BY added_at
  `);
}

export function getProcessedDocumentCount() {
  const result = get(`SELECT COUNT(*) as count FROM documents WHERE processed = 1`);
  return result ? result.count : 0;
}

export function getTotalDocumentCount() {
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
export function getDocumentByGDriveId(gdriveFileId) {
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

export function getAllTasks(statusFilter = null) {
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

export function getOpenTaskCount() {
  const result = get(`SELECT COUNT(*) as count FROM tasks WHERE status = 'open'`);
  return result?.count || 0;
}

// ============================================
// Phase 0: Legal hold operations
// ============================================

export function getAllLegalHolds(activeOnly = false) {
  const where = activeOnly ? "WHERE status = 'active'" : "";
  return query(`SELECT * FROM legal_holds ${where} ORDER BY created_at DESC`);
}

export function getLegalHoldById(id) {
  return get(`SELECT * FROM legal_holds WHERE id = ?`, [id]);
}

export function createLegalHold(matterName, scopeJson) {
  const result = run(
    `INSERT INTO legal_holds (matter_name, scope_json) VALUES (?, ?)`,
    [matterName, JSON.stringify(scopeJson)]
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
export function logAction(entityType, entityId, action, details = null) {
  run(
    `INSERT INTO audit_log (entity_type, entity_id, action, details) VALUES (?, ?, ?, ?)`,
    [entityType, entityId, action, details]
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
 * @param {string} key
 * @param {string} value
 */
export function setAppSetting(key, value) {
  run(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
    [key, value]
  );
  saveDb();
}

// ============================================
// QA Card operations (reusable questionnaire answers)
// ============================================

export function insertQaCard({ questionText, approvedAnswer, evidenceJson, sourceQuestionnaire, questionEmbedding }) {
  const result = run(
    `INSERT INTO qa_cards (question_text, approved_answer, evidence_json, source_questionnaire, question_embedding)
     VALUES (?, ?, ?, ?, ?)`,
    [questionText, approvedAnswer, evidenceJson || null, sourceQuestionnaire || null, questionEmbedding || null]
  );
  return result.lastInsertRowId;
}

export function getAllQaCards(statusFilter = null) {
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

export function getAllQaCardsWithEmbeddings() {
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

export function insertObligation({ documentId, obligationType, title, description, clauseReference, dueDate, recurrence, noticePeriodDays, owner, escalationTo, proofDescription, evidenceJson, category, activation, summary, detailsJson, penalties, stage }) {
  const statusValue = activation || "active";
  const result = run(
    `INSERT INTO contract_obligations (document_id, obligation_type, title, description, clause_reference, due_date, recurrence, notice_period_days, owner, escalation_to, proof_description, evidence_json, category, activation, status, summary, details_json, penalties, stage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [documentId, obligationType, title, description || null, clauseReference || null, dueDate || null, recurrence || null, noticePeriodDays || null, owner || null, escalationTo || null, proofDescription || null, evidenceJson || "[]", category || null, statusValue, statusValue, summary || null, detailsJson || "{}", penalties || null, stage || "active"]
  );
  return result.lastInsertRowId;
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
  const allowedFields = ["obligation_type", "title", "description", "clause_reference", "due_date", "recurrence", "notice_period_days", "owner", "escalation_to", "proof_description", "evidence_json", "status", "category", "activation", "summary", "details_json", "penalties", "stage", "department", "finalization_note", "finalization_document_id"];
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

export function getUpcomingObligations(days = 30) {
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

export function getOverdueObligations() {
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

export function getAllObligations() {
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

export function createTaskForObligation(obligationId, { title, description, dueDate, owner, escalationTo }) {
  const result = run(
    `INSERT INTO tasks (title, description, entity_type, entity_id, task_type, status, due_date, owner, escalation_to, obligation_id)
     VALUES (?, ?, 'obligation', ?, 'contract_deadline', 'open', ?, ?, ?, ?)`,
    [title, description || null, obligationId, dueDate || null, owner || null, escalationTo || null, obligationId]
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
export function getContractsWithSummaries() {
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
export function getUpcomingObligationsAllContracts(days = 30) {
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
export function getContractById(id) {
  const doc = get(
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
export function getPendingReplacements() {
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
