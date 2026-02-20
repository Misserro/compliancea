import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import {
  extractTextFromBuffer,
  guessType,
  guessTypeFromMime,
} from "@/lib/server-utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set." },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "Missing multipart field: file" },
        { status: 400 }
      );
    }

    const jurisdiction = (formData.get("jurisdiction") as string | null)?.trim();
    if (!jurisdiction) {
      return NextResponse.json(
        { error: "Missing multipart field: jurisdiction" },
        { status: 400 }
      );
    }

    // Determine file type
    const name = file.name.toLowerCase();
    const mime = file.type.toLowerCase();
    let kind = guessType(name);
    if (!kind) kind = guessTypeFromMime(mime);
    if (!kind) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or DOCX." },
        { status: 400 }
      );
    }

    // Extract text from the uploaded NDA
    const buffer = Buffer.from(await file.arrayBuffer());
    const ndaText = await extractTextFromBuffer(buffer, kind);
    if (!ndaText) {
      return NextResponse.json(
        { error: "Could not extract any text from the uploaded file." },
        { status: 400 }
      );
    }

    // Read the NDA analysis prompt from disk and fill placeholders
    const promptTemplatePath = path.join(process.cwd(), "nda-analysis-prompt.md");
    const promptTemplate = await fs.readFile(promptTemplatePath, "utf-8");
    const prompt = promptTemplate
      .replaceAll("{JURISDICTION}", jurisdiction)
      .replaceAll("{NDA_TEXT}", ndaText);

    // Call Anthropic
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const markdown = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;

    return NextResponse.json({
      markdown,
      tokenUsage: {
        claude: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
          model: "sonnet",
        },
      },
    });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode || 500;
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
