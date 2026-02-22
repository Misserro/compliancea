import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ensureDb, extractTextFromBuffer, guessType, guessTypeFromMime } from "@/lib/server-utils";
import { getSettings } from "@/lib/settings-imports";
import { searchDocuments } from "@/lib/search-imports";
import { shouldSkipTranslation } from "@/lib/language-detection-imports";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  let kind = guessType(name);
  if (!kind) kind = guessTypeFromMime(mime);

  if (!kind) {
    throw Object.assign(new Error("Unsupported file type. Please upload a PDF or DOCX."), { statusCode: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return extractTextFromBuffer(buffer, kind);
}

export async function POST(request: NextRequest) {
  await ensureDb();

  let inputTokens = 0;
  let outputTokens = 0;
  let voyageTokens = 0;
  let translationSkipped = false;

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const deskSystemPrompt = await fs.readFile(
      path.join(process.cwd(), "prompts/desk.md"),
      "utf-8"
    );

    const settings = getSettings();
    const formData = await request.formData();

    // Get the external document
    const mainFile = formData.get("file") as File | null;
    if (!mainFile) {
      return NextResponse.json({ error: "Missing external document" }, { status: 400 });
    }

    const targetLanguage = (formData.get("targetLanguage") as string || "").trim() || "English";
    const outputs = formData.getAll("outputs").map(String);
    if (!outputs.length) {
      return NextResponse.json({ error: "Select at least one output." }, { status: 400 });
    }

    // Get library document IDs for cross-reference
    let libraryDocumentIds: number[] = [];
    try {
      const idsStr = (formData.get("libraryDocumentIds") as string || "").trim();
      if (idsStr) {
        libraryDocumentIds = JSON.parse(idsStr);
      }
    } catch {
      return NextResponse.json({ error: "Invalid libraryDocumentIds format" }, { status: 400 });
    }

    const wantsCrossRef = outputs.includes("cross_reference");
    const wantsTemplate = outputs.includes("generate_template");
    const prefillTemplate = (formData.get("prefillTemplate") as string || "").trim() === "true";

    // Library documents are ONLY required for cross-reference or pre-fill template
    const needsLibraryDocs = wantsCrossRef || prefillTemplate;
    if (needsLibraryDocs && libraryDocumentIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one library document for cross-reference or pre-filled template" },
        { status: 400 }
      );
    }

    // Extract text from the external document
    const docText = await extractTextFromFile(mainFile);
    if (!docText) {
      return NextResponse.json({ error: "Could not extract text from the uploaded file." }, { status: 400 });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    const haikuModel = "claude-3-haiku-20240307";

    let docTextForAnalysis = docText;

    // OPTIMIZATION: Skip translation if document is already in target language
    if (settings.skipTranslationIfSameLanguage) {
      const langCheck = shouldSkipTranslation(docText, targetLanguage);
      if (langCheck.shouldSkipTranslation) {
        translationSkipped = true;
        console.log(`Skipping translation: document detected as ${langCheck.detectedLanguage} (confidence: ${langCheck.confidence})`);
      }
    }

    if (!translationSkipped) {
      // Translate the external document
      const translationPrompt = `Translate to ${targetLanguage}. If already in ${targetLanguage}, return as-is. Return ONLY the translated text.\n\n${docText}`;

      const translationMessage = await anthropic.messages.create({
        model: modelName,
        max_tokens: 8192,
        messages: [{ role: "user", content: translationPrompt }],
      });

      inputTokens += translationMessage.usage?.input_tokens || 0;
      outputTokens += translationMessage.usage?.output_tokens || 0;

      docTextForAnalysis = translationMessage.content
        .filter((block) => block.type === "text")
        .map((block) => {
          if (block.type === "text") return block.text;
          return "";
        })
        .join("") || docText;
    }

    // Only fetch library document content if needed
    let crossText = "";
    if (needsLibraryDocs && libraryDocumentIds.length > 0) {
      // Extract questions/requests from the external document
      const extractionModel = settings.useHaikuForExtraction ? haikuModel : modelName;

      const questionMessage = await anthropic.messages.create({
        model: extractionModel,
        max_tokens: 2048,
        system: `You extract every question, request, and information demand from a regulatory or compliance document. Include implicit requests and sub-questions as separate items. Return a numbered list, one item per line.`,
        messages: [{ role: "user", content: docTextForAnalysis }],
      });

      inputTokens += questionMessage.usage?.input_tokens || 0;
      outputTokens += questionMessage.usage?.output_tokens || 0;

      const extractedQuestions = questionMessage.content
        .filter((block) => block.type === "text")
        .map((block) => {
          if (block.type === "text") return block.text;
          return "";
        })
        .join("");

      // Use semantic search to find relevant chunks
      let searchResults = await searchDocuments(extractedQuestions, libraryDocumentIds, 15);

      // Estimate Voyage tokens
      voyageTokens = Math.ceil(extractedQuestions.length / 4);

      // Apply relevance threshold if enabled
      if (settings.useRelevanceThreshold && searchResults.length > 0) {
        const threshold = settings.relevanceThresholdValue;
        const minResults = settings.minResultsGuarantee;

        const filteredResults = searchResults.filter((r: { score: number }) => r.score >= threshold);

        if (filteredResults.length >= minResults) {
          searchResults = filteredResults;
        } else {
          searchResults = searchResults.slice(0, Math.max(minResults, filteredResults.length));
        }
      }

      if (searchResults.length > 0) {
        // Group results by document
        const docChunks: Record<string, string[]> = {};
        for (const result of searchResults) {
          const docName = result.documentName;
          if (!docChunks[docName]) {
            docChunks[docName] = [];
          }
          docChunks[docName].push(result.content);
        }

        const crossDocParts: string[] = [];
        for (const [docName, chunks] of Object.entries(docChunks)) {
          crossDocParts.push(`[${docName}]\n${chunks.join("\n---\n")}`);
        }
        crossText = crossDocParts.join("\n\n");
      }
    }

    // Build JSON schema
    const schemaObj: Record<string, unknown> = {
      type: "object",
      properties: {} as Record<string, unknown>,
      required: [] as string[],
    };

    const properties = schemaObj.properties as Record<string, unknown>;
    const required = schemaObj.required as string[];

    if (wantsCrossRef) {
      if (settings.useMinimalSchema) {
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
      } else {
        properties.cross_reference = {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The question or request identified in the external document" },
              answer: { type: "string", description: "The answer found in library documents, or empty string if not found" },
              found_in: { type: "string", description: "Name of the library document where answer was found, or 'not found'" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["question", "answer", "found_in", "confidence"],
          },
          description: "Array of ALL questions/requests found in the external document with their answers",
        };
      }
      required.push("cross_reference");
    }

    if (wantsTemplate) {
      if (settings.useMinimalSchema) {
        properties.response_template = { type: "string" };
      } else {
        properties.response_template = {
          type: "string",
          description: `Complete response template in ${targetLanguage} that addresses ALL questions/requests from the external document`,
        };
      }
      required.push("response_template");
    }

    const schemaDescription = settings.useMinimalSchema
      ? JSON.stringify(schemaObj)
      : JSON.stringify(schemaObj, null, 2);

    // Build optimized prompt
    const promptParts: string[] = [
      `Output: ${targetLanguage}. Outputs: ${outputs.join(", ")}`,
      `Respond with ONLY valid JSON: ${schemaDescription}`,
      "",
      "RULES:",
    ];

    if (needsLibraryDocs) {
      promptParts.push("- EXTERNAL DOC = document to respond to. LIBRARY DOCS = reference data.");
    } else {
      promptParts.push("- EXTERNAL DOC = document to respond to.");
    }

    if (wantsCrossRef) {
      promptParts.push(
        "- Cross-ref: List ALL questions/requests from EXTERNAL DOC. Search LIBRARY DOCS for answers.",
        '- If not found: answer="", confidence="low", found_in="not found".'
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

    promptParts.push("", "EXTERNAL DOC:", docTextForAnalysis);

    if (needsLibraryDocs && crossText) {
      promptParts.push("", "LIBRARY DOCS:", crossText);
    }

    const prompt = promptParts.join("\n");

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 8192,
      system: deskSystemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    inputTokens += message.usage?.input_tokens || 0;
    outputTokens += message.usage?.output_tokens || 0;

    const responseText = message.content
      .filter((block) => block.type === "text")
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
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
      return NextResponse.json(
        { error: "Claude returned non-JSON output unexpectedly.", details: responseText || null },
        { status: 502 }
      );
    }

    const usedHaiku = settings.useHaikuForExtraction && needsLibraryDocs;

    out.tokenUsage = {
      claude: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        model: "sonnet",
        usedHaikuForExtraction: usedHaiku,
      },
      voyage: {
        tokens: voyageTokens,
      },
    };

    out.optimizations = {
      translationSkipped,
      usedHaikuForExtraction: usedHaiku,
      relevanceThresholdApplied: settings.useRelevanceThreshold,
    };

    return NextResponse.json(out);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
