import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

import { initDb } from "../../lib/db.js";
import { DOCUMENTS_DIR } from "../../lib/paths.js";
import { putFile } from "../../lib/storage.js";

let dbInitialized = false;

export async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export function getDocumentsDir(): string {
  return DOCUMENTS_DIR;
}

export function guessType(filename: string): string | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

export function guessTypeFromMime(mimetype: string): string | null {
  const type = mimetype.toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return null;
}

async function extractTextViaOcr(pdfBuffer: Buffer): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const { createWorker } = await import("tesseract.js");

  GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";

  const pageImages: Buffer[] = [];
  const pdfDoc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d");
      // @ts-expect-error — pdfjs-dist expects browser CanvasRenderingContext2D but @napi-rs/canvas is compatible
      await page.render({ canvasContext: ctx, viewport }).promise;
      pageImages.push(canvas.toBuffer("image/png"));
    } catch (err) {
      console.warn(`[OCR fallback] Failed to render page ${pageNum}:`, err);
    }
  }

  if (pageImages.length === 0) return "";

  const worker = await createWorker(["pol", "eng"]);
  try {
    const texts: string[] = [];
    for (let i = 0; i < pageImages.length; i++) {
      try {
        const { data: { text } } = await worker.recognize(pageImages[i]);
        texts.push(text.trim());
      } catch (err) {
        console.warn(`[OCR fallback] Failed to OCR page image ${i + 1}:`, err);
      }
    }
    return texts.filter(Boolean).join("\n\n");
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromBuffer(buffer: Buffer, fileType: string): Promise<string> {
  if (fileType === "pdf") {
    const parsed = await pdfParse(buffer);
    const text = (parsed.text || "").trim();
    if (text.length > 0) return text;

    console.warn("[OCR fallback] pdf-parse returned empty text \u2014 running Tesseract OCR");
    const ocrText = await extractTextViaOcr(buffer);
    return ocrText;
  }
  if (fileType === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  }
  throw new Error("Unsupported file type");
}

export async function extractTextFromPath(filePath: string): Promise<string> {
  const kind = guessType(path.basename(filePath));
  if (!kind) throw new Error("Unsupported file type");

  const buf = await fs.readFile(filePath);
  return extractTextFromBuffer(buf, kind);
}

export async function saveUploadedFile(
  file: File,
  destDir: string,
  orgId?: number,
): Promise<{ filePath: string; fileName: string; storageBackend?: string; storageKey?: string | null }> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const buffer = Buffer.from(await file.arrayBuffer());

  if (orgId !== undefined) {
    const result = await putFile(orgId, "documents", safeName, buffer, file.type);
    return {
      filePath: result.localPath ?? result.storageKey ?? "",
      fileName: safeName,
      storageBackend: result.storageBackend,
      storageKey: result.storageKey,
    };
  }

  // Legacy fallback: no orgId provided
  fsSync.mkdirSync(destDir, { recursive: true });
  const filePath = path.join(destDir, safeName);
  await fs.writeFile(filePath, buffer);
  return { filePath, fileName: safeName };
}

export async function writeTempFile(file: File): Promise<{ tmpPath: string; buffer: Buffer }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const tmpPath = path.join("/tmp", `upload_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  await fs.writeFile(tmpPath, buffer);
  return { tmpPath, buffer };
}

export async function cleanupTempFile(tmpPath: string) {
  try {
    await fs.unlink(tmpPath);
  } catch {
    // ignore cleanup errors
  }
}

const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

export function buildJsonSchemaDescription(outputs: string[]): string {
  const schemaObj: Record<string, unknown> = {
    type: "object",
    properties: {} as Record<string, unknown>,
    required: [] as string[],
  };

  const properties = schemaObj.properties as Record<string, unknown>;
  const required = schemaObj.required as string[];

  if (outputs.includes("translation")) {
    properties.translated_text = { type: "string", description: "Full translation of the document" };
    required.push("translated_text");
  }

  if (outputs.includes("summary")) {
    properties.summary = { type: "string", description: "Detailed summary of the document" };
    required.push("summary");
  }

  if (outputs.includes("key_points")) {
    properties.key_points = {
      type: "array",
      items: {
        type: "object",
        properties: {
          point: { type: "string" },
          department: { type: "string", enum: DEPARTMENTS },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["point", "department", "tags"],
      },
    };
    required.push("key_points");
  }

  if (outputs.includes("todos")) {
    const todoItem = {
      type: "object",
      properties: {
        task: { type: "string" },
        source_point: { type: "string" },
      },
      required: ["task", "source_point"],
    };

    properties.todos_by_department = {
      type: "object",
      properties: Object.fromEntries(
        DEPARTMENTS.map((d) => [d, { type: "array", items: todoItem }])
      ),
      required: DEPARTMENTS,
    };
    required.push("todos_by_department");
  }

  if (outputs.includes("cross_reference")) {
    properties.cross_reference = {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          found_in: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["question", "answer", "found_in", "confidence"],
      },
    };
    required.push("cross_reference");
  }

  if (outputs.includes("generate_template")) {
    properties.response_template = { type: "string", description: "Response template for the document" };
    required.push("response_template");
  }

  return JSON.stringify(schemaObj, null, 2);
}
