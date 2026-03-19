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

    // Step 1: Fetch structured case data (sync DB calls)
    const parties = getCaseParties(caseId) as PartyRow[];
    const deadlines = getCaseDeadlines(caseId) as DeadlineRow[];
    const structuredContext = buildStructuredContext(
      legalCase,
      parties,
      deadlines
    );

    // Step 2: Run document retrieval (async)
    const highRisk = isHighRiskQuery(message);
    const retrievalService = new CaseRetrievalService();
    const retrieval = await retrievalService.search(
      message,
      caseId,
      highRisk
        ? { bm25Limit: 80, vectorLimit: 80, rerankTopK: 30 }
        : {}
    );

    // Step 3: Build combined user message
    const evidenceSection =
      retrieval.results.length > 0
        ? buildEvidencePrompt(retrieval.results)
        : "Brak zindeksowanych dokumentów dla tej sprawy.";

    const userContent = `${message}\n\n[DANE SPRAWY]\n${structuredContext}\n\n[DOKUMENTY SPRAWY]\n${evidenceSection}`;

    // Step 4: Read system prompt and call Claude
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

    // Fix: max_tokens truncation — return clean fallback instead of raw JSON
    if (genResponse.stop_reason === "max_tokens") {
      return NextResponse.json({
        answerText:
          "Odpowiedź była zbyt długa i została przerwana. Spróbuj zadać bardziej szczegółowe pytanie.",
        annotations: [],
        citations: [],
        usedDocuments: [],
        confidence: "low",
        needsDisambiguation: false,
      });
    }

    const structured = parseCitationResponse(rawText, retrieval.results);

    if (retrieval.lowConfidence || retrieval.results.length === 0) {
      structured.confidence = "low";
    }

    return NextResponse.json(structured);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function buildStructuredContext(
  legalCase: CaseRow,
  parties: PartyRow[],
  deadlines: DeadlineRow[]
): string {
  const caseInfo = formatCaseInfoContext(legalCase);
  const partiesInfo = formatPartiesContext(parties);
  const deadlinesInfo = formatDeadlinesContext(deadlines);

  let context = `=== DANE SPRAWY ===\n\n${caseInfo}`;

  if (partiesInfo) {
    context += `\n\nSTRONY POSTĘPOWANIA:\n${partiesInfo}`;
  }

  if (deadlinesInfo) {
    context += `\n\nNADCHODZĄCE TERMINY:\n${deadlinesInfo}`;
  }

  return context;
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
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = deadlines
    .filter((d) => d.status !== "completed" && String(d.due_date || "") >= today)
    .sort((a, b) => {
      const dateA = String(a.due_date || "");
      const dateB = String(b.due_date || "");
      return dateA.localeCompare(dateB);
    })
    .slice(0, 5);
  if (upcoming.length === 0) return "";
  return upcoming
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
