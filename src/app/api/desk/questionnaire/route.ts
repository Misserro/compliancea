import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { ensureDb, extractTextFromBuffer, guessType, guessTypeFromMime, writeTempFile, cleanupTempFile } from "@/lib/server-utils";
import { parseQuestionnaire, matchExistingCards, draftAnswers } from "@/lib/questionnaire-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  let kind = guessType(name);
  if (!kind) kind = guessTypeFromMime(mime);

  if (!kind) {
    throw Object.assign(new Error("Unsupported file type"), { statusCode: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return extractTextFromBuffer(buffer, kind);
}

export async function POST(request: NextRequest) {
  await ensureDb();

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const formData = await request.formData();

    // Get file or pasted text
    const mainFile = formData.get("file") as File | null;
    const pastedText = (formData.get("pastedText") as string || "").trim();

    if (!mainFile && !pastedText) {
      return NextResponse.json({ error: "Upload a file or paste questionnaire text" }, { status: 400 });
    }

    // Get library document IDs
    let libraryDocumentIds: number[] = [];
    try {
      const idsStr = (formData.get("libraryDocumentIds") as string || "").trim();
      if (idsStr) {
        libraryDocumentIds = JSON.parse(idsStr);
      }
    } catch {
      return NextResponse.json({ error: "Invalid libraryDocumentIds format" }, { status: 400 });
    }

    const totalTokenUsage = { claudeInput: 0, claudeOutput: 0, voyageTokens: 0 };

    // Step 1: Parse questionnaire into questions
    let questions;
    let parseTokens;

    if (mainFile) {
      const ext = (mainFile.name || "").toLowerCase();
      const isExcel = ext.endsWith(".xlsx") || ext.endsWith(".xls") || ext.endsWith(".csv") ||
        (mainFile.type && mainFile.type.includes("spreadsheet"));

      if (isExcel) {
        const fileBuffer = Buffer.from(await mainFile.arrayBuffer());
        const result = await parseQuestionnaire(null as unknown as string, "excel", fileBuffer);
        questions = result.questions;
        parseTokens = result.tokenUsage;
      } else {
        // PDF or DOCX
        const text = await extractTextFromFile(mainFile);
        if (!text) {
          return NextResponse.json({ error: "Could not extract text from file" }, { status: 400 });
        }
        const result = await parseQuestionnaire(text, "text");
        questions = result.questions;
        parseTokens = result.tokenUsage;
      }
    } else {
      // Pasted text
      const result = await parseQuestionnaire(pastedText, "text");
      questions = result.questions;
      parseTokens = result.tokenUsage;
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: "No questions could be extracted from the input" }, { status: 400 });
    }

    totalTokenUsage.claudeInput += parseTokens.input || 0;
    totalTokenUsage.claudeOutput += parseTokens.output || 0;

    // Step 2: Match against existing QA cards
    const { matches, voyageTokens: matchVoyageTokens } = await matchExistingCards(questions);
    totalTokenUsage.voyageTokens += matchVoyageTokens;

    // Step 3: Draft answers for unmatched questions
    const unmatchedQuestions = questions.filter((_q: unknown, i: number) => !matches[i]);
    const unmatchedIndices = questions.map((_q: unknown, i: number) => !matches[i] ? i : -1).filter((i: number) => i >= 0);

    let draftResults = { drafts: [] as unknown[], tokenUsage: { input: 0, output: 0, voyageTokens: 0 } };
    if (unmatchedQuestions.length > 0) {
      draftResults = await draftAnswers(unmatchedQuestions, libraryDocumentIds);
      totalTokenUsage.claudeInput += draftResults.tokenUsage.input || 0;
      totalTokenUsage.claudeOutput += draftResults.tokenUsage.output || 0;
      totalTokenUsage.voyageTokens += draftResults.tokenUsage.voyageTokens || 0;
    }

    // Step 4: Merge results
    const responseQuestions = questions.map((q: { number: number; text: string }, i: number) => {
      const match = matches[i];
      if (match) {
        return {
          number: q.number,
          text: q.text,
          source: "auto-filled",
          answer: match.card.approvedAnswer,
          evidence: JSON.parse(match.card.evidenceJson || "[]"),
          confidence: "high",
          matchedCardId: match.cardId,
          similarity: match.similarity,
        };
      }

      const unmatchedIdx = unmatchedIndices.indexOf(i);
      const draft = draftResults.drafts[unmatchedIdx] as { answer?: string; evidence?: unknown[]; confidence?: string } | undefined;

      return {
        number: q.number,
        text: q.text,
        source: "drafted",
        answer: draft?.answer || "Unable to draft answer",
        evidence: draft?.evidence || [],
        confidence: draft?.confidence || "low",
        matchedCardId: null,
        similarity: null,
      };
    });

    const autoFilledCount = responseQuestions.filter((q: { source: string }) => q.source === "auto-filled").length;

    logAction("questionnaire", null, "processed", {
      total: questions.length,
      autoFilled: autoFilledCount,
      drafted: questions.length - autoFilledCount,
    });

    return NextResponse.json({
      questions: responseQuestions,
      stats: {
        total: questions.length,
        autoFilled: autoFilledCount,
        drafted: questions.length - autoFilledCount,
      },
      tokenUsage: {
        claude: {
          input: totalTokenUsage.claudeInput,
          output: totalTokenUsage.claudeOutput,
          total: totalTokenUsage.claudeInput + totalTokenUsage.claudeOutput,
          model: "sonnet",
        },
        voyage: { tokens: totalTokenUsage.voyageTokens },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
