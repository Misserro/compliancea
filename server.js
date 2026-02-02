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

    // Check if already in database
    const existing = getDocumentByPath(filePath);
    if (existing) {
      return res.status(409).json({ error: "Document already exists in library" });
    }

    // Add to database
    const documentId = addDocument(fileName, filePath, folder);
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

// POST /api/ask - Ask a question against selected documents
app.post("/api/ask", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set." });
    }

    const { question, documentIds, topK = 5 } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Question is required" });
    }

    // Search for relevant chunks
    const searchResults = await searchDocuments(question, documentIds || [], topK);

    if (searchResults.length === 0) {
      return res.json({
        answer: "I couldn't find any relevant information in the selected documents to answer your question.",
        sources: [],
        context: []
      });
    }

    // Format context for Claude
    const contextText = formatSearchResults(searchResults);
    const sources = getSourceDocuments(searchResults);

    // Build prompt for Claude
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

    const systemPrompt = `You are a helpful assistant that answers questions based on the provided document excerpts.
Answer the question using ONLY the information from the provided context.
If the context doesn't contain enough information to fully answer the question, say so.
Be concise but thorough. Cite which document(s) your answer comes from when relevant.`;

    const userPrompt = `Context from documents:

${contextText}

Question: ${question}

Please answer the question based on the context above.`;

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
      }))
    });
  } catch (err) {
    console.error("Error answering question:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Desk Analyze Endpoint (Cross-reference & Template with Library Documents)
// ============================================

app.post("/api/desk/analyze", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set." });
    }

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

    if (libraryDocumentIds.length === 0) {
      return res.status(400).json({ error: "Select at least one library document for cross-reference" });
    }

    const prefillTemplate = String(first(fields?.prefillTemplate || "")).trim() === "true";

    // Extract text from the external document
    const docText = await extractText(mainFile);
    if (!docText) {
      return res.status(400).json({ error: "Could not extract text from the uploaded file." });
    }

    // Extract text from library documents for cross-reference
    const crossDocParts = [];
    for (const docId of libraryDocumentIds) {
      const doc = getDocumentById(docId);
      if (doc && doc.processed) {
        try {
          const text = await extractTextFromPath(doc.path);
          if (text) {
            crossDocParts.push(`--- Library Document: ${doc.name} ---\n${text}`);
          }
        } catch (err) {
          console.warn(`Could not extract text from library document ${doc.name}:`, err.message);
        }
      }
    }

    const crossText = crossDocParts.join("\n\n");

    // Build JSON schema for requested outputs (only cross_reference and generate_template)
    const schemaObj = {
      type: "object",
      properties: {},
      required: []
    };

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

    const schemaDescription = JSON.stringify(schemaObj, null, 2);

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
      "- The EXTERNAL DOCUMENT is the document the user received and needs to respond to.",
      "- The LIBRARY DOCUMENTS contain reference data to help answer questions and fill templates.",
      "",
      "Cross-reference requirement (if requested):",
      "- Identify questions/unknowns/requests in the EXTERNAL DOCUMENT.",
      "- Search LIBRARY DOCUMENTS for answers/evidence.",
      "- If not found: answer=\"\", confidence=\"low\", found_in=\"not found\".",
      "",
      "Template requirement (if requested):",
      "- response_template should be a structured, reusable email/letter-style reply to the inquiry in the EXTERNAL DOCUMENT.",
      "- Include sections like greeting, reference to the inquiry, key answers, and closing.",
      prefillTemplate
        ? "- IMPORTANT: You MUST fill the template with actual data from LIBRARY DOCUMENTS. Search thoroughly for any relevant information (names, dates, numbers, KYC data, addresses, etc.) and insert it directly into the template. Do NOT use placeholders if the information can be found in library documents."
        : "- Leave clearly marked placeholders (e.g. [INSERT NAME HERE], [INSERT DATE HERE], [INSERT KYC DATA HERE]) for the user to fill manually. Do NOT attempt to fill in specific data from library documents.",
      "",
      "EXTERNAL DOCUMENT (document to respond to):",
      docText,
      "",
      "LIBRARY DOCUMENTS (reference data):",
      crossText || "(none provided)"
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
