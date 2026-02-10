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
  metadata_json, updated_at, sensitivity, language, in_force`;

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
    "sensitivity", "language", "category", "in_force",
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
  const validStatuses = ["draft", "in_review", "approved", "archived", "disposed"];
  if (!validStatuses.includes(newStatus)) {
    return { success: false, error: `Invalid status: ${newStatus}` };
  }

  const doc = getDocumentById(id);
  if (!doc) return { success: false, error: "Document not found" };

  const validTransitions = {
    draft: ["in_review"],
    in_review: ["approved", "draft"],
    approved: ["archived"],
    archived: ["draft", "disposed"],
    disposed: [], // terminal state — no transitions out
  };

  const currentStatus = doc.status || "draft";
  const allowed = validTransitions[currentStatus] || [];

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

export function insertObligation({ documentId, obligationType, title, description, clauseReference, dueDate, recurrence, noticePeriodDays, owner, escalationTo, proofDescription, evidenceJson }) {
  const result = run(
    `INSERT INTO contract_obligations (document_id, obligation_type, title, description, clause_reference, due_date, recurrence, notice_period_days, owner, escalation_to, proof_description, evidence_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [documentId, obligationType, title, description || null, clauseReference || null, dueDate || null, recurrence || null, noticePeriodDays || null, owner || null, escalationTo || null, proofDescription || null, evidenceJson || "[]"]
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
  const allowedFields = ["obligation_type", "title", "description", "clause_reference", "due_date", "recurrence", "notice_period_days", "owner", "escalation_to", "proof_description", "evidence_json", "status"];
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

export function createTaskForObligation(obligationId, { title, description, dueDate, owner, escalationTo }) {
  const result = run(
    `INSERT INTO tasks (title, description, entity_type, entity_id, task_type, status, due_date, owner, escalation_to, obligation_id)
     VALUES (?, ?, 'obligation', ?, 'contract_deadline', 'open', ?, ?, ?, ?)`,
    [title, description || null, obligationId, dueDate || null, owner || null, escalationTo || null, obligationId]
  );
  return result.lastInsertRowId;
}
