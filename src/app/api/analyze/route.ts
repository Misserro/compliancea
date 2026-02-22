import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { ensureDb, extractTextFromBuffer, guessType, guessTypeFromMime, buildJsonSchemaDescription } from "@/lib/server-utils";

export const runtime = "nodejs";

const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

function first<T>(v: T | T[]): T {
  return Array.isArray(v) ? v[0] : v;
}

function toArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

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

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const analyzerSystemPrompt = await fs.readFile(
      path.join(process.cwd(), "prompts/analyzer.md"),
      "utf-8"
    );

    const formData = await request.formData();

    const mainFile = formData.get("file") as File | null;
    if (!mainFile) {
      return NextResponse.json({ error: "Missing multipart field: file" }, { status: 400 });
    }

    const targetLanguage = (formData.get("targetLanguage") as string || "").trim();
    if (!targetLanguage) {
      return NextResponse.json({ error: "Missing multipart field: targetLanguage" }, { status: 400 });
    }

    const outputs = formData.getAll("outputs").map(String);
    if (!outputs.length) {
      return NextResponse.json({ error: "Select at least one output." }, { status: 400 });
    }

    const wantsCross = outputs.includes("cross_reference");
    const wantsTemplate = outputs.includes("generate_template");
    const prefillTemplate = (formData.get("prefillTemplate") as string || "").trim() === "true";

    const docText = await extractTextFromFile(mainFile);
    if (!docText) {
      return NextResponse.json({ error: "Could not extract any text from the uploaded file." }, { status: 400 });
    }

    let crossText = "";
    if (wantsCross || wantsTemplate) {
      const crossFiles = formData.getAll("crossFiles") as File[];
      if (crossFiles.length) {
        const parts: string[] = [];
        for (let i = 0; i < crossFiles.length; i++) {
          const t = await extractTextFromFile(crossFiles[i]);
          if (t) {
            parts.push(`--- Cross document ${i + 1}: ${crossFiles[i]?.name || "file"} ---\n${t}`);
          }
        }
        crossText = parts.join("\n\n");
      }
    }

    const schemaDescription = buildJsonSchemaDescription(outputs);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
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
      '- If not found: answer="", confidence="low", found_in="not found".',
      "",
      "MAIN DOCUMENT:",
      docText,
      "",
      (wantsCross || wantsTemplate) ? "CROSS DOCUMENTS:" : "",
      (wantsCross || wantsTemplate) ? (crossText || "(none provided)") : "",
    ]
      .filter(Boolean)
      .join("\n");

    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 8192,
      system: analyzerSystemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    inputTokens = message.usage?.input_tokens || 0;
    outputTokens = message.usage?.output_tokens || 0;

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

    out.tokenUsage = {
      claude: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        model: "sonnet",
      },
    };

    return NextResponse.json(out);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
