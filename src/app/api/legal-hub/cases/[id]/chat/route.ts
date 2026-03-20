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

const CASE_CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "updateCaseMetadata",
    description:
      "Update case registration data such as court, reference number, judge, case type, claim value, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        court: { type: "string" },
        reference_number: { type: "string" },
        internal_number: { type: "string" },
        judge: { type: "string" },
        case_type: { type: "string" },
        procedure_type: { type: "string" },
        court_division: { type: "string" },
        summary: { type: "string" },
        claim_description: { type: "string" },
        claim_value: { type: "number" },
        claim_currency: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "addParty",
    description:
      "Add a new party to the case (plaintiff, defendant, witness, etc.)",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        party_type: {
          type: "string",
          enum: ["plaintiff", "defendant", "third_party", "witness", "other"],
        },
        address: { type: "string" },
        representative_name: { type: "string" },
        representative_address: { type: "string" },
        representative_type: { type: "string" },
        notes: { type: "string" },
      },
      required: ["name", "party_type"],
    },
  },
  {
    name: "updateParty",
    description:
      "Update an existing party's data. party_id must be the database ID shown in [DANE SPRAWY].",
    input_schema: {
      type: "object" as const,
      properties: {
        party_id: { type: "number" },
        name: { type: "string" },
        address: { type: "string" },
        representative_name: { type: "string" },
        representative_address: { type: "string" },
        representative_type: { type: "string" },
        notes: { type: "string" },
      },
      required: ["party_id"],
    },
  },
  {
    name: "addDeadline",
    description: "Add a new deadline or hearing date to the case.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        deadline_type: {
          type: "string",
          enum: [
            "hearing",
            "response_deadline",
            "appeal_deadline",
            "filing_deadline",
            "payment",
            "other",
          ],
        },
        due_date: { type: "string", description: "ISO date YYYY-MM-DD" },
        description: { type: "string" },
      },
      required: ["title", "deadline_type", "due_date"],
    },
  },
  {
    name: "updateCaseStatus",
    description: "Change the case status.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: [
            "active",
            "signed",
            "unsigned",
            "terminated",
            "closed",
            "other",
          ],
        },
        note: { type: "string", description: "Optional note for status history" },
      },
      required: ["status"],
    },
  },
];

function generateActionLabel(
  toolName: string,
  params: Record<string, unknown>
): string {
  switch (toolName) {
    case "updateCaseMetadata": {
      const fields = Object.keys(params);
      return `Aktualizacja danych sprawy: ${fields.join(", ")}`;
    }
    case "addParty":
      return `Dodanie strony: ${params.name || "?"} (${params.party_type || "?"})`;
    case "updateParty":
      return `Aktualizacja strony ID ${params.party_id}: ${Object.keys(params).filter((k) => k !== "party_id").join(", ")}`;
    case "addDeadline":
      return `Dodanie terminu: ${params.title || "?"} ${params.due_date || ""}`;
    case "updateCaseStatus":
      return `Zmiana statusu na: ${params.status || "?"}`;
    default:
      return `${toolName}`;
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

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

    // Step 4: Read system prompt and call Claude with tools
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
      tools: CASE_CHAT_TOOLS,
      tool_choice: { type: "auto" },
      messages: [
        ...historyMessages,
        { role: "user", content: userContent },
      ],
    });

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

    // Step 5: Handle response — tool_use blocks or text
    const toolUseBlocks = genResponse.content.filter(
      (b) => b.type === "tool_use"
    );
    const textBlocks = genResponse.content.filter((b) => b.type === "text");

    if (toolUseBlocks.length > 0) {
      const proposalText =
        textBlocks.length > 0 && textBlocks[0].type === "text"
          ? textBlocks[0].text
          : "Proponuję następujące zmiany w sprawie:";

      const actions = toolUseBlocks
        .map((b) => {
          if (b.type !== "tool_use") return null;
          const params = b.input as Record<string, unknown>;
          return {
            tool: b.name,
            params,
            label: generateActionLabel(b.name, params),
          };
        })
        .filter(Boolean);

      return NextResponse.json({
        type: "action_proposal",
        proposalText,
        actions,
      });
    }

    // Text-only response — parse as StructuredAnswer
    const rawText = textBlocks
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

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
        `ID: ${p.id}
Strona: ${p.name}
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
