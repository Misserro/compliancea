import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getLegalCaseById,
  getCaseParties,
  getCaseDeadlines,
} from "@/lib/db-imports";
import { CaseRetrievalService } from "@/lib/case-retrieval-imports";
import {
  buildEvidencePrompt,
  parseCitationResponse,
  isHighRiskQuery,
} from "@/lib/citation-assembler-imports";

export const runtime = "nodejs";

const CLASSIFIER_SYSTEM = `You are an intent classifier for a legal case management assistant. Analyze the user's message and return ONLY valid JSON — no markdown, no explanation, no code blocks.

Intents:
- "case_info":       Questions about case metadata (court, reference number, claim amount, summary, judge)
- "party_lookup":    Questions about parties, defendants, plaintiffs, or their representatives
- "deadline_query":  Questions about hearings, deadlines, due dates, or scheduled events
- "document_search": Questions about document content, finding specific information in case files
- "summarize":       Requests to summarize a document or the entire case file
- "unknown":         Unclear request or not related to this case

Return exactly this structure:
{
  "intent": "case_info|party_lookup|deadline_query|document_search|summarize|unknown",
  "disambiguationQuestion": null
}

If intent is unknown, set disambiguationQuestion to a helpful clarifying question in Polish.`;

type Intent =
  | "case_info"
  | "party_lookup"
  | "deadline_query"
  | "document_search"
  | "summarize"
  | "unknown";

type ClassifierResult = {
  intent: Intent;
  disambiguationQuestion?: string | null;
};

type CaseRow = Record<string, unknown>;
type PartyRow = Record<string, unknown>;
type DeadlineRow = Record<string, unknown>;

const HISTORY_TURNS = 6;

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set." },
        { status: 500 }
      );
    }

    const { id: idStr } = await props.params;
    const caseId = parseInt(idStr, 10);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    const legalCase = getLegalCaseById(caseId) as CaseRow | null;
    if (!legalCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    let body: { message?: unknown; history?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const { message, history = [] } = body as {
      message: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

    // Step 1: Classify intent with Haiku
    let classification: ClassifierResult;
    try {
      const classifierResp = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: CLASSIFIER_SYSTEM,
        messages: [{ role: "user", content: message }],
      });
      const raw = classifierResp.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .replace(/```json?\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      classification = JSON.parse(raw);
    } catch {
      classification = { intent: "document_search" };
    }

    const { intent, disambiguationQuestion } = classification;

    // Handle unknown intent with disambiguation
    if (intent === "unknown" && disambiguationQuestion) {
      return NextResponse.json({
        answerText: disambiguationQuestion,
        annotations: [],
        citations: [],
        usedDocuments: [],
        confidence: "high",
        needsDisambiguation: true,
      });
    }

    // Step 2: Route by intent — structured data intents use simple context path
    if (intent === "case_info") {
      const contextText = formatCaseInfoContext(legalCase);
      return respondWithSimpleContext(
        anthropic,
        modelName,
        contextText,
        message,
        history
      );
    }

    if (intent === "party_lookup") {
      const parties = getCaseParties(caseId) as PartyRow[];
      const contextText = formatPartiesContext(parties);
      return respondWithSimpleContext(
        anthropic,
        modelName,
        contextText,
        message,
        history
      );
    }

    if (intent === "deadline_query") {
      const deadlines = getCaseDeadlines(caseId) as DeadlineRow[];
      const contextText = formatDeadlinesContext(deadlines);
      return respondWithSimpleContext(
        anthropic,
        modelName,
        contextText,
        message,
        history
      );
    }

    // Step 3: Grounded RAG pipeline for document_search and summarize
    const highRisk = isHighRiskQuery(message);
    const retrievalService = new CaseRetrievalService();
    const retrieval = await retrievalService.search(
      message,
      caseId,
      highRisk
        ? { bm25Limit: 80, vectorLimit: 80, rerankTopK: 30 }
        : {}
    );

    if (retrieval.results.length === 0) {
      return NextResponse.json({
        answerText:
          "Na podstawie dostępnych dokumentów sprawy nie mogę odpowiedzieć na to pytanie.",
        annotations: [],
        citations: [],
        usedDocuments: [],
        confidence: "low",
        needsDisambiguation: false,
      });
    }

    const evidencePrompt = buildEvidencePrompt(retrieval.results);

    const groundedSystemPrompt = await fs.readFile(
      path.join(process.cwd(), "prompts/case-chat-grounded.md"),
      "utf-8"
    );

    const historyMessages = history
      .slice(-HISTORY_TURNS)
      .map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      }));

    const userContent = `${message}\n\nDowody:\n${evidencePrompt}`;

    const genResponse = await anthropic.messages.create({
      model: modelName,
      max_tokens: 4096,
      system: groundedSystemPrompt,
      messages: [
        ...historyMessages,
        { role: "user", content: userContent },
        { role: "assistant", content: "{" },
      ],
    });

    const rawText =
      "{" +
      genResponse.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");

    // If response was truncated, JSON is likely incomplete — skip parsing
    if (genResponse.stop_reason === "max_tokens") {
      return NextResponse.json({
        answerText: rawText,
        annotations: [],
        citations: [],
        usedDocuments: [],
        confidence: "low",
        needsDisambiguation: false,
      });
    }

    const structured = parseCitationResponse(rawText, retrieval.results);

    if (retrieval.lowConfidence) {
      structured.confidence = "low";
    }

    return NextResponse.json(structured);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Handle non-document intents (case_info, party_lookup, deadline_query)
 * using the original simple system prompt, wrapped in StructuredAnswer format.
 */
async function respondWithSimpleContext(
  anthropic: Anthropic,
  modelName: string,
  contextText: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
) {
  if (!contextText.trim()) {
    return NextResponse.json({
      answerText:
        "Nie znaleziono wystarczających informacji w materiałach sprawy.",
      annotations: [],
      citations: [],
      usedDocuments: [],
      confidence: "low",
      needsDisambiguation: false,
    });
  }

  const simpleSystemPrompt = await fs.readFile(
    path.join(process.cwd(), "prompts/case-chat.md"),
    "utf-8"
  );

  const historyMessages = history
    .slice(-HISTORY_TURNS)
    .map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    }));

  const userContent = `[DANE SPRAWY]\n${contextText}\n\n[PYTANIE UŻYTKOWNIKA]\n${message}`;

  const genResponse = await anthropic.messages.create({
    model: modelName,
    max_tokens: 2048,
    system: simpleSystemPrompt,
    messages: [...historyMessages, { role: "user", content: userContent }],
  });

  const answer = genResponse.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  return NextResponse.json({
    answerText: answer,
    annotations: [],
    citations: [],
    usedDocuments: [],
    confidence: "high",
    needsDisambiguation: false,
  });
}

function formatCaseInfoContext(legalCase: CaseRow): string {
  return `SPRAWA: ${legalCase.title}
Numer referencyjny: ${legalCase.reference_number || "brak"}
Numer wewnętrzny: ${legalCase.internal_number || "brak"}
Typ sprawy: ${legalCase.case_type || "brak"}
Rodzaj postępowania: ${legalCase.procedure_type || "brak"}
Sąd: ${legalCase.court || "brak"}
Wydział: ${legalCase.court_division || "brak"}
Sędzia: ${legalCase.judge || "brak"}
Status: ${legalCase.status || "brak"}
Opis roszczenia: ${legalCase.claim_description || "brak"}
Wartość przedmiotu sporu: ${
    legalCase.claim_value != null
      ? `${legalCase.claim_value} ${legalCase.claim_currency || "PLN"}`
      : "brak"
  }
Streszczenie: ${legalCase.summary || "brak"}`;
}

function formatPartiesContext(parties: PartyRow[]): string {
  if (parties.length === 0) return "";
  return parties
    .map(
      (p) =>
        `Strona: ${p.name}
Typ: ${p.party_type}
Adres: ${p.address || "brak"}
Pełnomocnik: ${p.representative_name || "brak"}
Adres pełnomocnika: ${p.representative_address || "brak"}
Typ pełnomocnictwa: ${p.representative_type || "brak"}
Uwagi: ${p.notes || "brak"}`
    )
    .join("\n\n");
}

function formatDeadlinesContext(deadlines: DeadlineRow[]): string {
  if (deadlines.length === 0) return "";
  return deadlines
    .map(
      (d) =>
        `Termin: ${d.title}
Typ: ${d.deadline_type}
Data: ${d.due_date}
Status: ${d.status}
Opis: ${d.description || "brak"}`
    )
    .join("\n\n");
}
