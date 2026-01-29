import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "db", "documents.db");

const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma("journal_mode = WAL");

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    folder TEXT,
    added_at TEXT DEFAULT (datetime('now')),
    processed INTEGER DEFAULT 0,
    word_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding BLOB,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
`);

// Document operations
export function getAllDocuments() {
  return db.prepare(`
    SELECT id, name, path, folder, added_at, processed, word_count
    FROM documents
    ORDER BY added_at DESC
  `).all();
}

export function getDocumentById(id) {
  return db.prepare(`
    SELECT id, name, path, folder, added_at, processed, word_count
    FROM documents
    WHERE id = ?
  `).get(id);
}

export function getDocumentByPath(filePath) {
  return db.prepare(`
    SELECT id, name, path, folder, added_at, processed, word_count
    FROM documents
    WHERE path = ?
  `).get(filePath);
}

export function addDocument(name, filePath, folder) {
  const stmt = db.prepare(`
    INSERT INTO documents (name, path, folder)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(name, filePath, folder);
  return result.lastInsertRowid;
}

export function updateDocumentProcessed(id, wordCount) {
  db.prepare(`
    UPDATE documents
    SET processed = 1, word_count = ?
    WHERE id = ?
  `).run(wordCount, id);
}

export function deleteDocument(id) {
  // Chunks are deleted automatically due to CASCADE
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

// Chunk operations
export function addChunk(documentId, content, chunkIndex, embedding) {
  const stmt = db.prepare(`
    INSERT INTO chunks (document_id, content, chunk_index, embedding)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(documentId, content, chunkIndex, embedding);
  return result.lastInsertRowid;
}

export function getChunksByDocumentId(documentId) {
  return db.prepare(`
    SELECT id, content, chunk_index, embedding
    FROM chunks
    WHERE document_id = ?
    ORDER BY chunk_index
  `).all(documentId);
}

export function getChunksByDocumentIds(documentIds) {
  if (!documentIds || documentIds.length === 0) {
    return [];
  }

  const placeholders = documentIds.map(() => "?").join(",");
  return db.prepare(`
    SELECT c.id, c.document_id, c.content, c.chunk_index, c.embedding, d.name as document_name
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE c.document_id IN (${placeholders})
    AND c.embedding IS NOT NULL
    ORDER BY c.document_id, c.chunk_index
  `).all(...documentIds);
}

export function getAllChunksWithEmbeddings() {
  return db.prepare(`
    SELECT c.id, c.document_id, c.content, c.chunk_index, c.embedding, d.name as document_name
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.document_id, c.chunk_index
  `).all();
}

export function deleteChunksByDocumentId(documentId) {
  db.prepare("DELETE FROM chunks WHERE document_id = ?").run(documentId);
}

// Batch operations
export function addChunksBatch(chunks) {
  const stmt = db.prepare(`
    INSERT INTO chunks (document_id, content, chunk_index, embedding)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const chunk of items) {
      stmt.run(chunk.documentId, chunk.content, chunk.chunkIndex, chunk.embedding);
    }
  });

  insertMany(chunks);
}

export function getUnprocessedDocuments() {
  return db.prepare(`
    SELECT id, name, path, folder, added_at
    FROM documents
    WHERE processed = 0
    ORDER BY added_at
  `).all();
}

export function getProcessedDocumentCount() {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM documents WHERE processed = 1
  `).get();
  return result.count;
}

export function getTotalDocumentCount() {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM documents
  `).get();
  return result.count;
}

export default db;
