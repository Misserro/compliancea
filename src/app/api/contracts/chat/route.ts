import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { ensureDb } from "@/lib/server-utils";
import {
  getDocumentById,
  searchContractsByFilters,
  searchContractsByText,
  getObligationsForChat,
} from "@/lib/db-imports";

export const runtime = "nodejs";

const CLASSIFIER_SYSTEM = `You are a query classifier for a contract management system. Analyze the user's message and return ONLY valid JSON — no markdown, no explanation, no code blocks.

Intents:
- "filter":         Find contracts by metadata (company, vendor, status, expiry dates, tags, missing fields)
- "obligations":    Questions about obligations, payments, or deadlines
- "summarize":      Summarize a specific contract
- "content_search": Find specific content, clauses, or keywords inside contracts
- "unknown":        Unclear request or not about contracts in this system

Return exactly this structure:
{
  "intent": "filter|obligations|summarize|content_search|unknown",
  "params": {
    "company": null,
    "vendor": null,
    "status": null,
    "expiryBefore": null,
    "expiryAfter": null,
    "missingExpiry": false,
    "hasTag": null,
    "keyword": null,
    "dueWithinDays": null,
    "overdue": false,
    "category": null,
    "contractName": null
  },
  "needsSelectedContract": false,
  "disambiguationQuestion": null
}

Notes:
- TODAY is {TODAY}
- "this month" → days remaining in current calendar month
- "expiring soon" → expiryBefore set to 60 days from today
- "next 30 days" / "in 30 days" → dueWithinDays: 30 or expiryBefore set accordingly
- "overdue" obligations → overdue: true
- "missing dates" → missingExpiry: true
- status must be one of: unsigned, signed, active, terminated — or null
- category must be one of: payments, reporting, compliance, operational — or null
- If user says "this contract" or "summarize this" without naming one → needsSelectedContract: true
- If intent is unknown, set disambiguationQuestion to a helpful clarifying question`;

type ClassifierResult = {
  intent: "filter" | "obligations" | "summarize" | "content_search" | "unknown";
  params: {
    company?: string | null;
    vendor?: string | null;
    status?: string | null;
    expiryBefore?: string | null;
    expiryAfter?: string | null;
    missingExpiry?: boolean;
    hasTag?: string | null;
    keyword?: string | null;
    dueWithinDays?: number | null;
    overdue?: boolean;
    category?: string | null;
    contractName?: string | null;
  };
  needsSelectedContract?: boolean;
  disambiguationQuestion?: string | null;
};

type ContractRow = Record<string, unknown>;
type ObligationRow = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const body = await request.json();
    const { message, history = [], selectedContractId } = body as {
      message: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
      selectedContractId?: number | null;
    };

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    const today = new Date().toISOString().split("T")[0];

    // Step 1: Classify intent with Haiku
    let classification: ClassifierResult;
    try {
      const classifierResp = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 512,
        system: CLASSIFIER_SYSTEM.replace("{TODAY}", today),
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
      classification = { intent: "content_search", params: { keyword: message } };
    }

    const { intent, params, needsSelectedContract, disambiguationQuestion } = classification;

    // Handle disambiguation up front
    if (intent === "unknown" && disambiguationQuestion) {
      return NextResponse.json({
        answer: disambiguationQuestion,
        results: { contracts: [], obligations: [] },
        appliedFilters: {},
        needsDisambiguation: true,
        followUpSuggestions: [],
      });
    }

    if (needsSelectedContract && !selectedContractId) {
      return NextResponse.json({
        answer:
          "Which contract are you asking about? Please expand a contract from the list on the left, then ask again — I'll use that as context.",
        results: { contracts: [], obligations: [] },
        appliedFilters: {},
        needsDisambiguation: true,
        followUpSuggestions: [],
      });
    }

    // Retrieve based on intent
    let contracts: ContractRow[] = [];
    let obligations: ObligationRow[] = [];
    let contextText = "";
    const appliedFilters: Record<string, unknown> = { intent };

    if (intent === "summarize") {
      const contractId = selectedContractId ?? null;
      if (contractId) {
        const doc = getDocumentById(contractId, orgId) as ContractRow | null;
        if (doc) {
          contracts = [doc];
          const fullText = (doc.full_text as string) || "";
          if (fullText.trim()) {
            const truncated = fullText.split(/\s+/).slice(0, 6000).join(" ");
            contextText = `CONTRACT: ${doc.name}
Status: ${doc.status}
Vendor: ${doc.contracting_vendor || "N/A"}
Company: ${doc.contracting_company || "N/A"}
Expiry: ${doc.expiry_date || "not set"}
Commencement: ${doc.commencement_date || "not set"}

FULL TEXT:
${truncated}`;
          } else {
            contextText = `CONTRACT: ${doc.name}
Status: ${doc.status}
Vendor: ${doc.contracting_vendor || "N/A"}
Company: ${doc.contracting_company || "N/A"}
Expiry: ${doc.expiry_date || "not set"}

[No full text available — this contract was created manually without an uploaded document.]`;
          }
          appliedFilters.contractId = contractId;
        }
      } else if (params.contractName) {
        const found = searchContractsByText(params.contractName, 3, orgId) as ContractRow[];
        if (found.length === 1) {
          const doc = getDocumentById(found[0].id as number, orgId) as ContractRow | null;
          if (doc) {
            contracts = [doc];
            const fullText = (doc.full_text as string) || "";
            if (fullText.trim()) {
              const truncated = fullText.split(/\s+/).slice(0, 6000).join(" ");
              contextText = `CONTRACT: ${doc.name}
Status: ${doc.status}
Vendor: ${doc.contracting_vendor || "N/A"}
Company: ${doc.contracting_company || "N/A"}
Expiry: ${doc.expiry_date || "not set"}

FULL TEXT:
${truncated}`;
            } else {
              contextText = `CONTRACT: ${doc.name}
Status: ${doc.status}
Vendor: ${doc.contracting_vendor || "N/A"}
Company: ${doc.contracting_company || "N/A"}
Expiry: ${doc.expiry_date || "not set"}

[No full text available — this contract was created manually without an uploaded document.]`;
            }
          }
        } else if (found.length > 1) {
          const names = found.map((c) => `"${c.name}"`).join(", ");
          return NextResponse.json({
            answer: `I found multiple contracts matching "${params.contractName}": ${names}. Which one would you like summarized? Please expand it from the list.`,
            results: { contracts: found, obligations: [] },
            appliedFilters: {},
            needsDisambiguation: true,
            followUpSuggestions: [],
          });
        }
      }
    } else if (intent === "obligations") {
      const safeDaysLimit =
        typeof params.dueWithinDays === "number" && isFinite(params.dueWithinDays)
          ? Math.max(0, Math.min(Math.floor(params.dueWithinDays), 365))
          : undefined;
      const VALID_CATEGORIES = new Set(["payments", "reporting", "compliance", "operational"]);
      const safeCategory = params.category && VALID_CATEGORIES.has(params.category) ? params.category : undefined;
      obligations = getObligationsForChat({
        dueWithinDays: safeDaysLimit,
        overdue: params.overdue,
        category: safeCategory,
        contractIds: selectedContractId ? [selectedContractId] : undefined,
        limit: 20, orgId }) as ObligationRow[];
      appliedFilters.dueWithinDays = safeDaysLimit;
      appliedFilters.overdue = params.overdue;
      appliedFilters.category = safeCategory;
      contextText = formatObligationsContext(obligations);
    } else if (intent === "filter") {
      const VALID_STATUSES = new Set(["unsigned", "signed", "active", "terminated"]);
      const safeStatus = params.status && VALID_STATUSES.has(params.status) ? params.status : undefined;
      contracts = searchContractsByFilters({
        company: params.company ?? undefined,
        vendor: params.vendor ?? undefined,
        status: safeStatus,
        expiryBefore: params.expiryBefore ?? undefined,
        expiryAfter: params.expiryAfter ?? undefined,
        missingExpiry: params.missingExpiry,
        hasTag: params.hasTag ?? undefined,
        limit: 20, orgId }) as ContractRow[];
      appliedFilters.company = params.company;
      appliedFilters.vendor = params.vendor;
      appliedFilters.status = safeStatus;
      appliedFilters.expiryBefore = params.expiryBefore;
      appliedFilters.expiryAfter = params.expiryAfter;
      contextText = formatContractsContext(contracts);
    } else {
      const keyword = params.keyword || params.contractName || message;
      contracts = searchContractsByText(keyword, 10, orgId) as ContractRow[];
      if (params.company || params.vendor) {
        const filtered = searchContractsByFilters({
          company: params.company ?? undefined,
          vendor: params.vendor ?? undefined,
          limit: 10, orgId }) as ContractRow[];
        if (filtered.length > 0) contracts = filtered;
      }
      appliedFilters.keyword = keyword;
      contextText = formatContractsContext(contracts);
    }

    if (!contextText.trim()) {
      contextText = "No contracts matching the query criteria were found in the database.";
    }

    // Generate answer with Sonnet
    const systemPrompt = await fs.readFile(
      path.join(process.cwd(), "prompts/contracts-chat.md"),
      "utf-8"
    );

    const historyMessages = history
      .slice(-6)
      .map((h) => ({ role: h.role, content: h.content }));

    const userContent = `[CONTRACT DATA]\n${contextText}\n\n[USER QUESTION]\n${message}`;

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
      results: { contracts, obligations },
      appliedFilters,
      needsDisambiguation: false,
      followUpSuggestions: buildFollowUpSuggestions(intent, contracts, obligations),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function formatContractsContext(contracts: ContractRow[]): string {
  if (contracts.length === 0) return "";
  return contracts
    .map(
      (c) =>
        `Contract: ${c.name} (ID: ${c.id})
  Status: ${c.status}
  Vendor: ${c.contracting_vendor || "N/A"}
  Company: ${c.contracting_company || "N/A"}
  Client: ${c.client || "N/A"}
  Signature date: ${c.signature_date || "not set"}
  Start date: ${c.commencement_date || "not set"}
  Expiry date: ${c.expiry_date || "not set"}
  Active obligations: ${c.activeObligations ?? 0}
  Overdue obligations: ${c.overdueObligations ?? 0}
  Next deadline: ${c.nextDeadline || "none"}`
    )
    .join("\n\n");
}

function formatObligationsContext(obligations: ObligationRow[]): string {
  if (obligations.length === 0) return "";
  return obligations
    .map(
      (o) =>
        `Obligation: ${o.title} (ID: ${o.id})
  Contract: ${o.document_name}
  Category: ${o.category || "N/A"}
  Due date: ${o.due_date || "no date set"}
  Payment: ${o.payment_amount ? `${o.payment_amount} ${o.payment_currency}` : "N/A"}
  Vendor: ${o.contracting_vendor || "N/A"}`
    )
    .join("\n\n");
}

function buildFollowUpSuggestions(
  intent: string,
  contracts: ContractRow[],
  obligations: ObligationRow[]
): string[] {
  const suggestions: string[] = [];
  if (intent === "filter" && contracts.length > 0) {
    suggestions.push("Show obligations for these contracts");
    suggestions.push("Which of these expire soonest?");
  }
  if (intent === "obligations" && obligations.length > 0) {
    suggestions.push("Show the contracts with the most overdue obligations");
  }
  if (intent === "summarize") {
    suggestions.push("What are the payment obligations for this contract?");
    suggestions.push("Show upcoming deadlines for this contract");
  }
  if (intent === "content_search" && contracts.length > 0) {
    suggestions.push("Summarize the first matching contract");
  }
  return suggestions.slice(0, 3);
}
