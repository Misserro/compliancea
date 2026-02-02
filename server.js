import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import formidable from "formidable";
import multer from "multer";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Document library imports
import {
  initDb,
  getAllDocuments,
  getDocumentById,
  getDocumentByPath,
  addDocument,
  updateDocumentProcessed,
  updateDocumentCategory,
  deleteDocument,
  addChunksBatch,
  deleteChunksByDocumentId,
  getUnprocessedDocuments,
} from "./lib/db.js";
import {
  getEmbedding,
  embeddingToBuffer,
  checkEmbeddingStatus,
} from "./lib/embeddings.js";
import { chunkText, countWords } from "./lib/chunker.js";
import { searchDocuments, formatSearchResults, getSourceDocuments } from "./lib/search.js";
import { DOCUMENTS_DIR, DB_PATH, isRailway } from "./lib/paths.js";
import { getSettings, updateSettings, resetSettings, getDefaultSettings } from "./lib/settings.js";
import { shouldSkipTranslation } from "./lib/languageDetection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

// Configure multer for document library uploads
const libraryUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const folder = req.body.folder || "";
      const destDir = folder ? path.join(DOCUMENTS_DIR, folder) : DOCUMENTS_DIR;
      fsSync.mkdirSync(destDir, { recursive: true });
      cb(null, destDir);
    },
    filename: (req, file, cb) => {
      // Use original filename, but sanitize it
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, safeName);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (/\.(pdf|docx)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and DOCX files are allowed"));
    }
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Parse JSON bodies
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Health check endpoint for Railway
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Helper functions
function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function guessType(file) {
  const name = (file?.originalFilename || file?.name || "").toLowerCase();
  const type = (file?.mimetype || "").toLowerCase();

  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (type === "application/pdf") return "pdf";
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";

  return null;
}

function guessTypeFromPath(filePath) {
  const name = filePath.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

async function parseMultipart(req) {
  return await new Promise((resolve, reject) => {
    const form = formidable({
      multiples: true,
      maxFileSize: 10 * 1024 * 1024
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

async function extractText(file) {
  const kind = guessType(file);
  if (!kind) {
    const e = new Error("Unsupported file type. Please upload a PDF or DOCX.");
    e.statusCode = 400;
    throw e;
  }

  const buf = await fs.readFile(file.filepath);

  if (kind === "pdf") {
    const parsed = await pdfParse(buf);
    return (parsed.text || "").trim();
  }

  const result = await mammoth.extractRawText({ buffer: buf });
  return (result.value || "").trim();
}

async function extractTextFromPath(filePath) {
  const kind = guessTypeFromPath(filePath);
  if (!kind) {
    throw new Error("Unsupported file type");
  }

  const buf = await fs.readFile(filePath);

  if (kind === "pdf") {
    const parsed = await pdfParse(buf);
    return (parsed.text || "").trim();
  }

  const result = await mammoth.extractRawText({ buffer: buf });
  return (result.value || "").trim();
}

function buildJsonSchemaDescription(outputs) {
  const schemaObj = {
    type: "object",
    properties: {},
    required: []
  };

  if (outputs.includes("translation")) {
    schemaObj.properties.translated_text = { type: "string", description: "Full translation of the document" };
    schemaObj.required.push("translated_text");
  }

  if (outputs.includes("summary")) {
    schemaObj.properties.summary = { type: "string", description: "Detailed summary of the document" };
    schemaObj.required.push("summary");
  }

  if (outputs.includes("key_points")) {
    schemaObj.properties.key_points = {
      type: "array",
      items: {
        type: "object",
        properties: {
          point: { type: "string" },
          department: { type: "string", enum: DEPARTMENTS },
          tags: { type: "array", items: { type: "string" } }
        },
        required: ["point", "department", "tags"]
      }
    };
    schemaObj.required.push("key_points");
  }

  if (outputs.includes("todos")) {
    const todoItem = {
      type: "object",
      properties: {
        task: { type: "string" },
        source_point: { type: "string" }
      },
      required: ["task", "source_point"]
    };

    schemaObj.properties.todos_by_department = {
      type: "object",
      properties: {
        Finance: { type: "array", items: todoItem },
        Compliance: { type: "array", items: todoItem },
        Operations: { type: "array", items: todoItem },
        HR: { type: "array", items: todoItem },
        Board: { type: "array", items: todoItem },
        IT: { type: "array", items: todoItem }
      },
      required: DEPARTMENTS
    };
    schemaObj.required.push("todos_by_department");
  }

  if (outputs.includes("cross_reference")) {
    schemaObj.properties.cross_reference = {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          found_in: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] }
        },
        required: ["question", "answer", "found_in", "confidence"]
      }
    };
    schemaObj.required.push("cross_reference");
  }

  if (outputs.includes("generate_template")) {
    schemaObj.properties.response_template = { type: "string", description: "Response template for the document" };
    schemaObj.required.push("response_template");
  }

  return JSON.stringify(schemaObj, null, 2);
}

// ============================================
// Document Library API Endpoints
// ============================================

// GET /api/documents - List all documents
app.get("/api/documents", (req, res) => {
  try {
    const documents = getAllDocuments();
    res.json({ documents });
  } catch (err) {
    console.error("Error fetching documents:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/scan - Scan documents folder for new files
app.post("/api/documents/scan", async (req, res) => {
  try {
    const files = await fs.readdir(DOCUMENTS_DIR);
    let added = 0;
    let skipped = 0;

    for (const file of files) {
      // Skip hidden files and .gitkeep
      if (file.startsWith(".")) continue;

      const filePath = path.join(DOCUMENTS_DIR, file);
      const stat = await fs.stat(filePath);

      // Skip directories
      if (stat.isDirectory()) continue;

      // Check file type
      const fileType = guessTypeFromPath(file);
      if (!fileType) {
        skipped++;
        continue;
      }

      // Check if already in database
      const existing = getDocumentByPath(filePath);
      if (existing) {
        skipped++;
        continue;
      }

      // Add to database
      addDocument(file, filePath, null);
      added++;
    }

    const documents = getAllDocuments();
    res.json({
      message: `Scan complete. Added ${added} new document(s), skipped ${skipped}.`,
      added,
      skipped,
      documents
    });
  } catch (err) {
    console.error("Error scanning documents:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/upload - Upload a document to the library
app.post("/api/documents/upload", libraryUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileName = req.file.filename;
    const filePath = req.file.path;
    const folder = req.body.folder || null;
    const category = req.body.category || null;

    // Validate category if provided
    if (category && !DEPARTMENTS.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${DEPARTMENTS.join(", ")}` });
    }

    // Check if already in database
    const existing = getDocumentByPath(filePath);
    if (existing) {
      return res.status(409).json({ error: "Document already exists in library" });
    }

    // Add to database
    const documentId = addDocument(fileName, filePath, folder, category);
    const document = getDocumentById(documentId);

    res.json({
      message: "Document uploaded successfully",
      document
    });
  } catch (err) {
    console.error("Error uploading document:", err);
    // Clean up uploaded file on error
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch {
        // Ignore cleanup errors
      }
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/:id/process - Process a document (extract text, chunk, embed)
app.post("/api/documents/:id/process", async (req, res) => {
  const documentId = parseInt(req.params.id, 10);

  try {
    // Check Voyage AI status first
    const embeddingStatus = await checkEmbeddingStatus();
    if (!embeddingStatus.available) {
      return res.status(503).json({ error: embeddingStatus.error });
    }

    const document = getDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Check if file still exists
    try {
      await fs.access(document.path);
    } catch {
      return res.status(404).json({ error: "Document file not found on disk" });
    }

    // Extract text
    const text = await extractTextFromPath(document.path);
    if (!text) {
      return res.status(400).json({ error: "Could not extract text from document" });
    }

    const wordCount = countWords(text);

    // Delete existing chunks if reprocessing
    deleteChunksByDocumentId(documentId);

    // Chunk the text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return res.status(400).json({ error: "Document produced no chunks" });
    }

    // Generate embeddings and store chunks
    const chunksToInsert = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk.content);
      const embeddingBuffer = embeddingToBuffer(embedding);

      chunksToInsert.push({
        documentId,
        content: chunk.content,
        chunkIndex: i,
        embedding: embeddingBuffer
      });
    }

    // Batch insert chunks
    addChunksBatch(chunksToInsert);

    // Mark document as processed
    updateDocumentProcessed(documentId, wordCount);

    const updatedDocument = getDocumentById(documentId);

    res.json({
      message: "Document processed successfully",
      document: updatedDocument,
      chunks: chunks.length,
      wordCount
    });
  } catch (err) {
    console.error("Error processing document:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/documents/:id/category - Update document category
app.patch("/api/documents/:id/category", (req, res) => {
  const documentId = parseInt(req.params.id, 10);
  const { category } = req.body;

  try {
    const document = getDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Validate category is one of the allowed departments or null
    const validCategories = [...DEPARTMENTS, null, ""];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${DEPARTMENTS.join(", ")}` });
    }

    updateDocumentCategory(documentId, category || null);

    const updatedDocument = getDocumentById(documentId);
    res.json({
      message: "Category updated successfully",
      document: updatedDocument
    });
  } catch (err) {
    console.error("Error updating document category:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/documents/:id - Delete a document (including file)
app.delete("/api/documents/:id", async (req, res) => {
  const documentId = parseInt(req.params.id, 10);

  try {
    const document = getDocumentById(documentId);
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Delete chunks and document record from database
    deleteDocument(documentId);

    // Also delete the actual file from disk
    try {
      await fs.unlink(document.path);
    } catch (fileErr) {
      // Log but don't fail if file doesn't exist
      console.warn(`Could not delete file ${document.path}:`, fileErr.message);
    }

    res.json({ message: "Document deleted successfully" });
  } catch (err) {
    console.error("Error deleting document:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/embeddings/status - Check Voyage AI status
app.get("/api/embeddings/status", async (req, res) => {
  try {
    const status = await checkEmbeddingStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ available: false, error: err.message });
  }
});

// ============================================
// Settings API Endpoints
// ============================================

// GET /api/settings - Get current settings
app.get("/api/settings", (req, res) => {
  try {
    const settings = getSettings();
    res.json({ settings });
  } catch (err) {
    console.error("Error fetching settings:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/settings - Update settings
app.patch("/api/settings", (req, res) => {
  try {
    const updates = req.body;
    const settings = updateSettings(updates);
    res.json({ message: "Settings updated successfully", settings });
  } catch (err) {
    console.error("Error updating settings:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/reset - Reset settings to defaults
app.post("/api/settings/reset", (req, res) => {
  try {
    const settings = resetSettings();
    res.json({ message: "Settings reset to defaults", settings });
  } catch (err) {
    console.error("Error resetting settings:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/defaults - Get default settings
app.get("/api/settings/defaults", (req, res) => {
  try {
    const defaults = getDefaultSettings();
    res.json({ defaults });
  } catch (err) {
    console.error("Error fetching default settings:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ask - Ask a question against selected documents
app.post("/api/ask", async (req, res) => {
  let inputTokens = 0;
  let outputTokens = 0;
  let voyageTokens = 0;

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set." });
    }

    const settings = getSettings();
    const { question, documentIds, topK = 5 } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Question is required" });
    }

    // Estimate Voyage tokens for question embedding (rough: 1 token per 4 chars)
    voyageTokens = Math.ceil(question.length / 4);

    // Search for relevant chunks
    let searchResults = await searchDocuments(question, documentIds || [], topK);

    // Apply relevance threshold if enabled
    if (settings.useRelevanceThreshold && searchResults.length > 0) {
      const threshold = settings.relevanceThresholdValue;
      const minResults = settings.minResultsGuarantee;

      // Filter by threshold but guarantee minimum results
      const filteredResults = searchResults.filter(r => r.score >= threshold);

      if (filteredResults.length >= minResults) {
        searchResults = filteredResults;
      } else {
        // Keep at least minResults, sorted by score
        searchResults = searchResults.slice(0, Math.max(minResults, filteredResults.length));
      }
    }

    if (searchResults.length === 0) {
      return res.json({
        answer: "I couldn't find any relevant information in the selected documents to answer your question.",
        sources: [],
        context: [],
        tokenUsage: {
          claude: { input: 0, output: 0, total: 0 },
          voyage: { tokens: voyageTokens }
        }
      });
    }

    // Format context for Claude (optimized formatting)
    const contextText = settings.optimizeContextFormatting
      ? formatContextOptimized(searchResults)
      : formatSearchResults(searchResults);

    const sources = getSourceDocuments(searchResults);

    // Build prompt for Claude
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

    // Optimized system prompt (shorter but equally effective)
    const systemPrompt = `Answer questions using ONLY the provided document excerpts. Be concise but thorough. Cite document names when relevant. If context is insufficient, say so.`;

    const userPrompt = `Context:\n${contextText}\n\nQuestion: ${question}`;

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ]
    });

    inputTokens = message.usage?.input_tokens || 0;
    outputTokens = message.usage?.output_tokens || 0;

    const answer = message.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("");

    res.json({
      answer,
      sources: sources.map(s => ({
        documentId: s.documentId,
        documentName: s.documentName,
        relevance: Math.round(s.maxScore * 100)
      })),
      context: searchResults.map(r => ({
        content: r.content.substring(0, 200) + (r.content.length > 200 ? "..." : ""),
        documentName: r.documentName,
        score: Math.round(r.score * 100)
      })),
      tokenUsage: {
        claude: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens
        },
        voyage: {
          tokens: voyageTokens
        }
      }
    });
  } catch (err) {
    console.error("Error answering question:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Optimized context formatting - removes metadata, keeps only essential info
 */
function formatContextOptimized(results) {
  if (!results || results.length === 0) {
    return "No relevant content found.";
  }

  return results
    .map((r, i) => `[${r.documentName}]\n${r.content}`)
    .join("\n\n---\n\n");
}

// ============================================
// Desk Analyze Endpoint (Cross-reference & Template with Library Documents)
// ============================================

app.post("/api/desk/analyze", async (req, res) => {
  // Track token usage for statistics
  let inputTokens = 0;
  let outputTokens = 0;
  let voyageTokens = 0;
  let translationSkipped = false;

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set." });
    }

    const settings = getSettings();
    const { fields, files } = await parseMultipart(req);

    // Get the external document (main document to analyze)
    const uploaded = files?.file;
    const mainFile = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (!mainFile) {
      return res.status(400).json({ error: "Missing external document" });
    }

    const targetLanguage = String(first(fields?.targetLanguage || "")).trim() || "English";
    const outputs = toArray(fields?.outputs).map(String);
    if (!outputs.length) {
      return res.status(400).json({ error: "Select at least one output." });
    }

    // Get library document IDs for cross-reference
    let libraryDocumentIds = [];
    try {
      const idsStr = String(first(fields?.libraryDocumentIds || "")).trim();
      if (idsStr) {
        libraryDocumentIds = JSON.parse(idsStr);
      }
    } catch {
      return res.status(400).json({ error: "Invalid libraryDocumentIds format" });
    }

    const wantsCrossRef = outputs.includes("cross_reference");
    const wantsTemplate = outputs.includes("generate_template");
    const prefillTemplate = String(first(fields?.prefillTemplate || "")).trim() === "true";

    // Library documents are ONLY required for cross-reference or pre-fill template
    const needsLibraryDocs = wantsCrossRef || prefillTemplate;
    if (needsLibraryDocs && libraryDocumentIds.length === 0) {
      return res.status(400).json({
        error: "Select at least one library document for cross-reference or pre-filled template"
      });
    }

    // Extract text from the external document
    let docText = await extractText(mainFile);
    if (!docText) {
      return res.status(400).json({ error: "Could not extract text from the uploaded file." });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    const haikuModel = "claude-3-haiku-20240307";

    let docTextForAnalysis = docText;

    // OPTIMIZATION: Skip translation if document is already in target language
    if (settings.skipTranslationIfSameLanguage) {
      const langCheck = shouldSkipTranslation(docText, targetLanguage);
      if (langCheck.shouldSkipTranslation) {
        // Document is already in target language, skip translation
        translationSkipped = true;
        console.log(`Skipping translation: document detected as ${langCheck.detectedLanguage} (confidence: ${langCheck.confidence})`);
      }
    }

    if (!translationSkipped) {
      // Step 1: Translate the external document to the target language
      const translationPrompt = `Translate to ${targetLanguage}. If already in ${targetLanguage}, return as-is. Return ONLY the translated text.\n\n${docText}`;

      const translationMessage = await anthropic.messages.create({
        model: modelName,
        max_tokens: 8192,
        messages: [{ role: "user", content: translationPrompt }]
      });

      inputTokens += translationMessage.usage?.input_tokens || 0;
      outputTokens += translationMessage.usage?.output_tokens || 0;

      docTextForAnalysis = translationMessage.content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("") || docText;
    }

    // Only fetch library document content if needed (cross-reference or pre-fill)
    let crossText = "";
    if (needsLibraryDocs && libraryDocumentIds.length > 0) {
      // Extract questions/requests from the external document
      // OPTIMIZATION: Use Haiku for simple extraction task if enabled
      const extractionModel = settings.useHaikuForExtraction ? haikuModel : modelName;
      const questionExtractionPrompt = `List ALL questions, requests, and information needs from this document. One per line, numbered.\n\n${docTextForAnalysis}`;

      const questionMessage = await anthropic.messages.create({
        model: extractionModel,
        max_tokens: 2048,
        messages: [{ role: "user", content: questionExtractionPrompt }]
      });

      inputTokens += questionMessage.usage?.input_tokens || 0;
      outputTokens += questionMessage.usage?.output_tokens || 0;

      const extractedQuestions = questionMessage.content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("");

      // Use semantic search to find relevant chunks
      let searchResults = await searchDocuments(extractedQuestions, libraryDocumentIds, 15);

      // Estimate Voyage tokens for the search
      voyageTokens = Math.ceil(extractedQuestions.length / 4);

      // OPTIMIZATION: Apply relevance threshold if enabled
      if (settings.useRelevanceThreshold && searchResults.length > 0) {
        const threshold = settings.relevanceThresholdValue;
        const minResults = settings.minResultsGuarantee;

        const filteredResults = searchResults.filter(r => r.score >= threshold);

        if (filteredResults.length >= minResults) {
          searchResults = filteredResults;
        } else {
          searchResults = searchResults.slice(0, Math.max(minResults, filteredResults.length));
        }
      }

      if (searchResults.length > 0) {
        // Group results by document
        const docChunks = {};
        for (const result of searchResults) {
          const docName = result.documentName;
          if (!docChunks[docName]) {
            docChunks[docName] = [];
          }
          docChunks[docName].push(result.content);
        }

        // Build cross-reference text from relevant chunks only
        const crossDocParts = [];
        for (const [docName, chunks] of Object.entries(docChunks)) {
          crossDocParts.push(`[${docName}]\n${chunks.join("\n---\n")}`);
        }
        crossText = crossDocParts.join("\n\n");
      }
    }

    // OPTIMIZATION: Build minimal JSON schema (remove verbose descriptions)
    const schemaObj = {
      type: "object",
      properties: {},
      required: []
    };

    if (wantsCrossRef) {
      if (settings.useMinimalSchema) {
        schemaObj.properties.cross_reference = {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
              found_in: { type: "string" },
              confidence: { type: "string", enum: ["low", "medium", "high"] }
            },
            required: ["question", "answer", "found_in", "confidence"]
          }
        };
      } else {
        schemaObj.properties.cross_reference = {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The question or request identified in the external document" },
              answer: { type: "string", description: "The answer found in library documents, or empty string if not found" },
              found_in: { type: "string", description: "Name of the library document where answer was found, or 'not found'" },
              confidence: { type: "string", enum: ["low", "medium", "high"] }
            },
            required: ["question", "answer", "found_in", "confidence"]
          },
          description: "Array of ALL questions/requests found in the external document with their answers"
        };
      }
      schemaObj.required.push("cross_reference");
    }

    if (wantsTemplate) {
      if (settings.useMinimalSchema) {
        schemaObj.properties.response_template = { type: "string" };
      } else {
        schemaObj.properties.response_template = {
          type: "string",
          description: `Complete response template in ${targetLanguage} that addresses ALL questions/requests from the external document`
        };
      }
      schemaObj.required.push("response_template");
    }

    // OPTIMIZATION: Compact JSON schema formatting
    const schemaDescription = settings.useMinimalSchema
      ? JSON.stringify(schemaObj)
      : JSON.stringify(schemaObj, null, 2);

    // Build optimized prompt
    const promptParts = [
      `Output: ${targetLanguage}. Outputs: ${outputs.join(", ")}`,
      `Respond with ONLY valid JSON: ${schemaDescription}`,
      "",
      "RULES:"
    ];

    if (needsLibraryDocs) {
      promptParts.push("- EXTERNAL DOC = document to respond to. LIBRARY DOCS = reference data.");
    } else {
      promptParts.push("- EXTERNAL DOC = document to respond to.");
    }

    if (wantsCrossRef) {
      promptParts.push(
        "- Cross-ref: List ALL questions/requests from EXTERNAL DOC. Search LIBRARY DOCS for answers.",
        "- If not found: answer=\"\", confidence=\"low\", found_in=\"not found\"."
      );
    }

    if (wantsTemplate) {
      promptParts.push(
        `- Template: Professional response in ${targetLanguage}. Address ALL questions. Include greeting and closing.`
      );

      if (prefillTemplate && crossText) {
        promptParts.push("- Fill with actual data from LIBRARY DOCS. Only use [PLACEHOLDER] if truly not found.");
      } else {
        promptParts.push("- Use [PLACEHOLDER] format for missing info.");
      }
    }

    promptParts.push(
      "",
      "EXTERNAL DOC:",
      docTextForAnalysis
    );

    if (needsLibraryDocs && crossText) {
      promptParts.push(
        "",
        "LIBRARY DOCS:",
        crossText
      );
    }

    const prompt = promptParts.join("\n");

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }]
    });

    inputTokens += message.usage?.input_tokens || 0;
    outputTokens += message.usage?.output_tokens || 0;

    // Extract text from response
    const responseText = message.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("");

    // Parse JSON from response
    let jsonText = responseText.trim();

    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    let out;
    try {
      out = JSON.parse(jsonText);
    } catch {
      return res.status(502).json({
        error: "Claude returned non-JSON output unexpectedly.",
        details: responseText || null
      });
    }

    // Add token usage statistics to response
    out.tokenUsage = {
      claude: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens
      },
      voyage: {
        tokens: voyageTokens
      }
    };

    // Add optimization info for debugging/transparency
    out.optimizations = {
      translationSkipped,
      usedHaikuForExtraction: settings.useHaikuForExtraction && needsLibraryDocs,
      relevanceThresholdApplied: settings.useRelevanceThreshold
    };

    return res.status(200).json(out);
  } catch (err) {
    console.error("Error processing desk analyze request:", err);
    const status = err?.statusCode || 500;
    return res.status(status).json({ error: err?.message || "Server error" });
  }
});

// ============================================
// Original Analyze Endpoint
// ============================================

// Main API endpoint
app.post("/api/analyze", async (req, res) => {
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set." });
    }

    const { fields, files } = await parseMultipart(req);

    const uploaded = files?.file;
    const mainFile = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (!mainFile) return res.status(400).json({ error: "Missing multipart field: file" });

    const targetLanguage = String(first(fields?.targetLanguage || "")).trim();
    if (!targetLanguage) return res.status(400).json({ error: "Missing multipart field: targetLanguage" });

    const outputs = toArray(fields?.outputs).map(String);
    if (!outputs.length) return res.status(400).json({ error: "Select at least one output." });

    const wantsCross = outputs.includes("cross_reference");
    const wantsTemplate = outputs.includes("generate_template");
    const prefillTemplate = String(first(fields?.prefillTemplate || "")).trim() === "true";

    const docText = await extractText(mainFile);
    if (!docText) return res.status(400).json({ error: "Could not extract any text from the uploaded file." });

    let crossText = "";
    if (wantsCross || wantsTemplate) {
      const crossFiles = toArray(files?.crossFiles);
      if (crossFiles.length) {
        const parts = [];
        for (let i = 0; i < crossFiles.length; i++) {
          const t = await extractText(crossFiles[i]);
          if (t) {
            parts.push(`--- Cross document ${i + 1}: ${crossFiles[i]?.originalFilename || "file"} ---\n${t}`);
          }
        }
        crossText = parts.join("\n\n");
      }
    }

    const schemaDescription = buildJsonSchemaDescription(outputs);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const prompt = [
      `Target language: ${targetLanguage}`,
      `Requested outputs: ${outputs.join(", ")}`,
      "",
      "You must respond with ONLY valid JSON matching the following schema:",
      "```json",
      schemaDescription,
      "```",
      "",
      "Rules:",
      "- Use ONLY the MAIN DOCUMENT for translation/summary/key points/to-dos.",
      "- Use CROSS DOCUMENTS for cross-reference and to help fill the response template when available.",
      "",
      "Summary requirement (if requested):",
      "- More detailed than a short abstract.",
      "- Include key context, key decisions, important constraints, and risks/implications if present.",
      "- Aim for ~8-12 sentences unless the document is extremely short.",
      "",
      "Template requirement (if requested):",
      "- response_template should be a structured, reusable email/letter-style reply to the inquiry in the MAIN DOCUMENT.",
      "- Include sections like greeting, reference to the inquiry, key answers, and closing.",
      prefillTemplate
        ? "- IMPORTANT: You MUST fill the template with actual data from CROSS DOCUMENTS. Search thoroughly for any relevant information (names, dates, numbers, KYC data, addresses, etc.) and insert it directly into the template. Do NOT use placeholders if the information can be found in cross documents."
        : "- Leave clearly marked placeholders (e.g. [INSERT NAME HERE], [INSERT DATE HERE], [INSERT KYC DATA HERE]) for the user to fill manually. Do NOT attempt to fill in specific data from cross documents.",
      "",
      `Allowed departments: ${DEPARTMENTS.join(", ")}`,
      "",
      "Cross-reference requirement (if requested):",
      "- Identify questions/unknowns/requests in the MAIN DOCUMENT.",
      "- Search CROSS DOCUMENTS for answers/evidence.",
      "- If not found: answer=\"\", confidence=\"low\", found_in=\"not found\".",
      "",
      "MAIN DOCUMENT:",
      docText,
      "",
      (wantsCross || wantsTemplate) ? "CROSS DOCUMENTS:" : "",
      (wantsCross || wantsTemplate) ? (crossText || "(none provided)") : ""
    ].filter(Boolean).join("\n");

    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    inputTokens = message.usage?.input_tokens || 0;
    outputTokens = message.usage?.output_tokens || 0;

    // Extract text from response
    const responseText = message.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("");

    // Parse JSON from response - handle potential markdown code blocks
    let jsonText = responseText.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    let out;
    try {
      out = JSON.parse(jsonText);
    } catch {
      return res.status(502).json({
        error: "Claude returned non-JSON output unexpectedly.",
        details: responseText || null
      });
    }

    // Add token usage statistics
    out.tokenUsage = {
      claude: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens
      }
    };

    return res.status(200).json(out);
  } catch (err) {
    console.error("Error processing request:", err);
    const status = err?.statusCode || 500;
    return res.status(status).json({ error: err?.message || "Server error" });
  }
});

// Serve index.html for root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize sql.js database
    await initDb();
    console.log("Database initialized successfully");

    // Log environment info
    console.log("Environment:", isRailway ? "Railway" : "Local");
    console.log("Documents directory:", DOCUMENTS_DIR);
    console.log("Database path:", DB_PATH);

    // Start server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check available at /health`);
    });
  } catch (err) {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  }
}

startServer();
