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

export function getAllDocuments() {
  return query(`
    SELECT id, name, path, folder, category, added_at, processed, page_count, word_count
    FROM documents
    ORDER BY category, added_at DESC
  `);
}

export function getDocumentById(id) {
  return get(`
    SELECT id, name, path, folder, category, added_at, processed, page_count, word_count
    FROM documents
    WHERE id = ?
  `, [id]);
}

export function getDocumentByPath(filePath) {
  return get(`
    SELECT id, name, path, folder, category, added_at, processed, page_count, word_count
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
