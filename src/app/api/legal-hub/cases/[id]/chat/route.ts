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
  getDocumentById,
  getCaseChunks,
} from "@/lib/db-imports";
import { getEmbedding, bufferToEmbedding } from "@/lib/embeddings-imports";
import { cosineSimilarity } from "@/lib/search-imports";

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

type Intent = "case_info" | "party_lookup" | "deadline_query" | "document_search" | "summarize" | "unknown";

type ClassifierResult = {
  intent: Intent;
  disambiguationQuestion?: string | null;
};

type CaseRow = Record<string, unknown>;
type PartyRow = Record<string, unknown>;
type DeadlineRow = Record<string, unknown>;
type DocumentRow = Record<string, unknown>;
type ChunkRow = {
  id: number;
  document_id: number;
  content: string;
  chunk_index: number;
  embedding: Uint8Array;
  document_name: string;
};

type Source = {
  documentName: string;
  documentId: number;
  score?: number;
};

const SIMILARITY_THRESHOLD = 0.65;
const TOP_K = 5;
const MAX_WORDS_PER_DOC = 6000;
const HISTORY_TURNS = 6;
const FALLBACK_MESSAGE = "Nie znaleziono wystarczających informacji w materiałach sprawy.";

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
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
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
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { message, history = [] } = body as {
      message: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
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
        answer: disambiguationQuestion,
        sources: [],
        needsDisambiguation: true,
      });
    }

    // Step 2: Retrieve context based on intent
    let contextText = "";
    let sources: Source[] = [];

    if (intent === "case_info") {
      contextText = formatCaseInfoContext(legalCase);
    } else if (intent === "party_lookup") {
      const parties = getCaseParties(caseId) as PartyRow[];
      contextText = formatPartiesContext(parties);
    } else if (intent === "deadline_query") {
      const deadlines = getCaseDeadlines(caseId) as DeadlineRow[];
      contextText = formatDeadlinesContext(deadlines);
    } else if (intent === "summarize") {
      // Fetch full_text from all indexed case documents
      const caseChunks = getCaseChunks(caseId) as ChunkRow[];
      // Collect unique document IDs from chunks
      const docIds = [...new Set(caseChunks.map((c) => c.document_id))];
      if (docIds.length > 0) {
        const docTexts: string[] = [];
        const usedDocs: Source[] = [];
        for (const docId of docIds) {
          const doc = getDocumentById(docId) as DocumentRow | null;
          if (doc) {
            const fullText = (doc.full_text as string) || "";
            const truncated = fullText.split(/\s+/).slice(0, MAX_WORDS_PER_DOC).join(" ");
            if (truncated.trim()) {
              docTexts.push(`DOKUMENT: ${doc.name}\n\n${truncated}`);
              usedDocs.push({ documentName: doc.name as string, documentId: docId });
            }
          }
        }
        contextText = docTexts.join("\n\n---\n\n");
        sources = usedDocs;
      }
    } else {
      // document_search (also fallback for unknown without disambiguation)
      const chunks = getCaseChunks(caseId) as ChunkRow[];
      if (chunks.length > 0) {
        const queryEmbedding = await getEmbedding(message);
        const scored = chunks.map((chunk) => {
          const chunkEmbedding = bufferToEmbedding(Buffer.from(chunk.embedding));
          const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
          return { chunk, score };
        });
        scored.sort((a, b) => b.score - a.score);
        const topChunks = scored.slice(0, TOP_K);

        if (topChunks.length > 0 && topChunks[0].score >= SIMILARITY_THRESHOLD) {
          const relevantChunks = topChunks.filter((s) => s.score >= SIMILARITY_THRESHOLD);
          contextText = relevantChunks
            .map(
              (s, i) =>
                `[Fragment ${i + 1}] Źródło: ${s.chunk.document_name}\n${s.chunk.content}`
            )
            .join("\n\n");
          sources = relevantChunks.map((s) => ({
            documentName: s.chunk.document_name,
            documentId: s.chunk.document_id,
            score: s.score,
          }));
        }
      }
    }

    // Fallback: if no context found, return the Polish fallback message immediately
    if (!contextText.trim()) {
      return NextResponse.json({
        answer: FALLBACK_MESSAGE,
        sources: [],
        needsDisambiguation: false,
      });
    }

    // Step 3: Generate answer with Sonnet
    const systemPrompt = await fs.readFile(
      path.join(process.cwd(), "prompts/case-chat.md"),
      "utf-8"
    );

    const historyMessages = history
      .slice(-HISTORY_TURNS)
      .map((h) => ({ role: h.role, content: h.content }));

    const userContent = `[DANE SPRAWY]\n${contextText}\n\n[PYTANIE UŻYTKOWNIKA]\n${message}`;

    const genResponse = await anthropic.messages.create({
      model: modelName,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [...historyMessages, { role: "user", content: userContent }],
    });

    const answer = genResponse.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    return NextResponse.json({
      answer,
      sources,
      needsDisambiguation: false,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
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
Wartość przedmiotu sporu: ${legalCase.claim_value != null ? `${legalCase.claim_value} ${legalCase.claim_currency || "PLN"}` : "brak"}
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
