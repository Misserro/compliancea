# Contracts Chat Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible side-by-side chat panel to the Contracts tab that lets users ask natural-language questions about their contracts, obligations, and payment data — answered exclusively from the uploaded contract database.

**Architecture:** Three-layer pipeline: Claude Haiku classifies query intent and extracts structured parameters → SQL/full-text retrieval over the contracts database (no vector search — contracts are not chunked/embedded) → Claude Sonnet generates a grounded answer from retrieved records plus conversation history. Multi-turn conversation is maintained on the frontend and passed to the backend as a history array.

**Tech Stack:** Next.js 15 App Router, TypeScript, SQLite via sql.js (WebAssembly), Anthropic SDK (Haiku for classification, Sonnet for generation), shadcn/ui components, Tailwind CSS.

---

## Architecture Notes (read before implementing)

**Contracts = Documents:** Contracts are `documents` rows where `doc_type IN ('contract', 'agreement')`. There is no separate contracts table.

**No vector embeddings on contracts:** Unlike general library documents, contracts have `full_text` stored as raw text but are NOT chunked or embedded. `searchDocuments()` (Voyage AI semantic search) cannot be used for contracts. All retrieval is SQL-based.

**Contract statuses:** `unsigned → signed → active → terminated` (different from document statuses).

**Module pattern:** All DB logic lives in `lib/db.js` (CJS). Next.js API routes import DB functions via `src/lib/db-imports.ts` (TypeScript re-export bridge). New DB functions must be added to BOTH files.

**Prompt files:** All Claude system prompts are external `.md` files in `prompts/` at project root, loaded via `fs.readFileSync`. Follow this pattern.

**Existing patterns to follow:**
- `/api/ask/route.ts` — reference for Anthropic API usage, error handling, and response shape
- `src/components/contracts/contracts-tab.tsx` — reference for how the contracts tab is structured
- `src/components/contracts/contract-card.tsx` — reference for shadcn/ui component patterns

---

## File Map

### Task 1 — Backend: DB helpers + API endpoint + prompt

| Action | Path |
|--------|------|
| Modify | `lib/db.js` — append 3 new query functions after line ~1313 |
| Modify | `src/lib/db-imports.ts` — add 3 new re-exports |
| Create | `prompts/contracts-chat.md` — Sonnet system prompt |
| Create | `src/app/api/contracts/chat/route.ts` — POST endpoint |

### Task 2 — Frontend: Chat panel component

| Action | Path |
|--------|------|
| Create | `src/components/contracts/contract-chat-panel.tsx` — full chat panel |

### Task 3 — Integration: ContractsTab + ContractCard + ContractList

| Action | Path |
|--------|------|
| Modify | `src/components/contracts/contracts-tab.tsx` — add chat state + side-by-side layout |
| Modify | `src/components/contracts/contract-list.tsx` — add selectedContractId + onSelectContract props |
| Modify | `src/components/contracts/contract-card.tsx` — add onSelect + isSelected props |

---

## Task 1: Backend — DB Helpers, API Endpoint, and Prompt

**Files:**
- Modify: `lib/db.js`
- Modify: `src/lib/db-imports.ts`
- Create: `prompts/contracts-chat.md`
- Create: `src/app/api/contracts/chat/route.ts`

- [ ] **Step 1: Add 3 new query functions to `lib/db.js`**

Open `lib/db.js`. Find the end of the `getContractById` function (around line 1380). Append these three functions **after** `getContractById`:

```js
/**
 * Search contracts by structured metadata filters.
 * All params optional. Returns up to `limit` contracts with obligation summary.
 *
 * @param {object} opts
 * @param {string} [opts.company]        - LIKE match on contracting_company or client
 * @param {string} [opts.vendor]         - LIKE match on contracting_vendor
 * @param {string} [opts.status]         - Exact match: unsigned|signed|active|terminated
 * @param {string} [opts.expiryBefore]   - ISO date string, e.g. "2025-06-30"
 * @param {string} [opts.expiryAfter]    - ISO date string
 * @param {boolean} [opts.missingExpiry] - Only contracts with NULL expiry_date
 * @param {string} [opts.hasTag]         - LIKE match on confirmed_tags or auto_tags
 * @param {number} [opts.limit=20]
 * @returns {Array}
 */
export function searchContractsByFilters({
  company, vendor, status, expiryBefore, expiryAfter, hasTag, missingExpiry, limit = 20
} = {}) {
  const conditions = [`d.doc_type IN ('contract', 'agreement')`];
  const params = [];

  if (company) {
    conditions.push(`(d.contracting_company LIKE ? OR d.client LIKE ?)`);
    params.push(`%${company}%`, `%${company}%`);
  }
  if (vendor) {
    conditions.push(`d.contracting_vendor LIKE ?`);
    params.push(`%${vendor}%`);
  }
  if (status) {
    conditions.push(`d.status = ?`);
    params.push(status);
  }
  if (expiryBefore) {
    conditions.push(`d.expiry_date IS NOT NULL AND d.expiry_date <= ?`);
    params.push(expiryBefore);
  }
  if (expiryAfter) {
    conditions.push(`d.expiry_date IS NOT NULL AND d.expiry_date >= ?`);
    params.push(expiryAfter);
  }
  if (missingExpiry) {
    conditions.push(`d.expiry_date IS NULL`);
  }
  if (hasTag) {
    conditions.push(`(d.confirmed_tags LIKE ? OR d.auto_tags LIKE ?)`);
    params.push(`%${hasTag}%`, `%${hasTag}%`);
  }

  params.push(limit);

  return query(
    `SELECT
       d.id, d.name, d.status, d.contracting_company, d.contracting_vendor,
       d.client, d.signature_date, d.commencement_date, d.expiry_date,
       COUNT(co.id)                                                AS totalObligations,
       SUM(CASE WHEN co.status = 'active' THEN 1 ELSE 0 END)     AS activeObligations,
       SUM(CASE WHEN co.status = 'active' AND co.due_date < date('now') THEN 1 ELSE 0 END) AS overdueObligations,
       MIN(CASE WHEN co.status = 'active' AND co.due_date >= date('now') THEN co.due_date ELSE NULL END) AS nextDeadline
     FROM documents d
     LEFT JOIN contract_obligations co ON d.id = co.document_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY d.id
     ORDER BY d.name ASC
     LIMIT ?`,
    params
  );
}

/**
 * Full-text keyword search over contract name, parties, and stored full_text content.
 * Returns up to `limit` matches ordered alphabetically.
 *
 * @param {string} searchTerm - Keyword to search for
 * @param {number} [limit=10]
 * @returns {Array}
 */
export function searchContractsByText(searchTerm, limit = 10) {
  const like = `%${searchTerm}%`;
  return query(
    `SELECT
       d.id, d.name, d.status, d.contracting_company, d.contracting_vendor,
       d.client, d.signature_date, d.commencement_date, d.expiry_date,
       COUNT(co.id) AS totalObligations,
       MIN(CASE WHEN co.status = 'active' AND co.due_date >= date('now') THEN co.due_date ELSE NULL END) AS nextDeadline
     FROM documents d
     LEFT JOIN contract_obligations co ON d.id = co.document_id
     WHERE d.doc_type IN ('contract', 'agreement')
       AND (d.name LIKE ? OR d.contracting_company LIKE ? OR d.contracting_vendor LIKE ?
            OR d.client LIKE ? OR d.full_text LIKE ?)
     GROUP BY d.id
     ORDER BY d.name ASC
     LIMIT ?`,
    [like, like, like, like, like, limit]
  );
}

/**
 * Get obligations filtered for chat queries.
 * Scoped to contracts only (doc_type IN ('contract', 'agreement')).
 *
 * @param {object} opts
 * @param {number} [opts.dueWithinDays]  - Return obligations due within N days from now
 * @param {boolean} [opts.overdue]       - Return past-due obligations (due_date < today)
 * @param {string} [opts.category]       - One of: payments|reporting|compliance|operational
 * @param {number[]} [opts.contractIds]  - Restrict to specific contract document IDs
 * @param {number} [opts.limit=20]
 * @returns {Array}
 */
export function getObligationsForChat({
  dueWithinDays, overdue, category, contractIds, limit = 20
} = {}) {
  const conditions = [
    `d.doc_type IN ('contract', 'agreement')`,
    `co.status = 'active'`,
  ];
  const params = [];

  if (dueWithinDays != null && !overdue) {
    conditions.push(
      `co.due_date IS NOT NULL AND co.due_date >= date('now') AND co.due_date <= date('now', '+' || ? || ' days')`
    );
    params.push(dueWithinDays);
  }
  if (overdue) {
    conditions.push(`co.due_date IS NOT NULL AND co.due_date < date('now')`);
  }
  if (category) {
    conditions.push(`co.category = ?`);
    params.push(category);
  }
  if (contractIds && contractIds.length > 0) {
    const placeholders = contractIds.map(() => '?').join(', ');
    conditions.push(`co.document_id IN (${placeholders})`);
    params.push(...contractIds);
  }

  params.push(limit);

  return query(
    `SELECT
       co.id, co.document_id, co.title, co.description, co.due_date,
       co.category, co.status, co.payment_amount, co.payment_currency,
       d.name AS document_name, d.contracting_company, d.contracting_vendor
     FROM contract_obligations co
     JOIN documents d ON co.document_id = d.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE WHEN co.due_date IS NULL THEN 1 ELSE 0 END, co.due_date ASC
     LIMIT ?`,
    params
  );
}
```

- [ ] **Step 2: Re-export the 3 new functions from `src/lib/db-imports.ts`**

Open `src/lib/db-imports.ts`. The file ends with `} from "../../lib/db.js";`. Add the 3 new function names to the export list, just before `getContractsWithSummaries`:

```ts
  searchContractsByFilters,
  searchContractsByText,
  getObligationsForChat,
```

After editing, the relevant section should look like:
```ts
  getContractSummary,
  createTaskForObligation,
  searchContractsByFilters,
  searchContractsByText,
  getObligationsForChat,
  getContractsWithSummaries,
  getUpcomingObligationsAllContracts,
  getContractById,
```

- [ ] **Step 3: Create `prompts/contracts-chat.md`**

Create this file at the project root level alongside the existing `prompts/ask.md`:

```markdown
You are a contract assistant for this organization. You answer questions exclusively using the contract records, obligation data, and document text retrieved from this organization's contract database — provided to you in the [CONTRACT DATA] section of each message.

**Core rules:**
- Answer only from the [CONTRACT DATA] provided — never from external knowledge, general legal expertise, or world knowledge
- If the retrieved data is insufficient to answer the question, say: "I couldn't find enough information in the uploaded contracts to answer that."
- Never invent contract terms, dates, parties, amounts, or any other facts not present in the retrieved data
- Reference contracts by their exact names as they appear in the database

**Answer format:**
- Be direct and concise
- For contract lists, name each contract and include the most relevant details (status, expiry date, vendor, obligation counts)
- For obligation/payment questions, state exact amounts and dates from the records
- For contract summaries, cover: parties, purpose, duration, and major obligation categories based on the available text
- If retrieved data is partial (e.g., no full text uploaded), acknowledge what is and isn't available

**Scope:**
- You only have access to contracts stored in this application's database
- If asked about legal concepts, regulatory requirements, or business practices not explicitly stated in the contract text, redirect: "I can only answer based on the contracts stored in this system."
- If no contract is selected and the question requires a specific contract (e.g., "summarize this contract"), ask the user to expand a contract from the list first
```

- [ ] **Step 4: Create `src/app/api/contracts/chat/route.ts`**

Create this file. It follows the same pattern as `src/app/api/ask/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
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

// -----------------------------------------------------------------------
// Inline Haiku classifier prompt — kept here (not in prompts/) because
// it outputs structured JSON, not creative text.
// -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Step 1: Classify intent with Haiku (fast, cheap)
    // -----------------------------------------------------------------------
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
      // Classifier failed — default to keyword search so the user still gets something
      classification = { intent: "content_search", params: { keyword: message } };
    }

    const { intent, params, needsSelectedContract, disambiguationQuestion } = classification;

    // -----------------------------------------------------------------------
    // Step 2: Handle disambiguation / missing context up front
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Step 3: Retrieve data based on intent
    // -----------------------------------------------------------------------
    let contracts: ContractRow[] = [];
    let obligations: ObligationRow[] = [];
    let contextText = "";
    const appliedFilters: Record<string, unknown> = { intent };

    if (intent === "summarize") {
      // Use the currently selected contract, or search by name
      const contractId = selectedContractId ?? null;
      if (contractId) {
        const doc = getDocumentById(contractId) as ContractRow | null;
        if (doc) {
          contracts = [doc];
          const fullText = (doc.full_text as string) || "";
          if (fullText.trim()) {
            // Truncate to ~6000 words to stay within token budget
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
        const found = searchContractsByText(params.contractName, 3) as ContractRow[];
        if (found.length === 1) {
          const doc = getDocumentById(found[0].id as number) as ContractRow | null;
          if (doc) {
            contracts = [doc];
            const fullText = (doc.full_text as string) || "";
            const truncated = fullText.split(/\s+/).slice(0, 6000).join(" ");
            contextText = `CONTRACT: ${doc.name}
Status: ${doc.status}
Vendor: ${doc.contracting_vendor || "N/A"}
Company: ${doc.contracting_company || "N/A"}
Expiry: ${doc.expiry_date || "not set"}

FULL TEXT:
${truncated}`;
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
      obligations = getObligationsForChat({
        dueWithinDays: params.dueWithinDays ?? undefined,
        overdue: params.overdue,
        category: params.category ?? undefined,
        contractIds: selectedContractId ? [selectedContractId] : undefined,
        limit: 20,
      }) as ObligationRow[];
      appliedFilters.dueWithinDays = params.dueWithinDays;
      appliedFilters.overdue = params.overdue;
      appliedFilters.category = params.category;
      contextText = formatObligationsContext(obligations);
    } else if (intent === "filter") {
      contracts = searchContractsByFilters({
        company: params.company ?? undefined,
        vendor: params.vendor ?? undefined,
        status: params.status ?? undefined,
        expiryBefore: params.expiryBefore ?? undefined,
        expiryAfter: params.expiryAfter ?? undefined,
        missingExpiry: params.missingExpiry,
        hasTag: params.hasTag ?? undefined,
        limit: 20,
      }) as ContractRow[];
      appliedFilters.company = params.company;
      appliedFilters.vendor = params.vendor;
      appliedFilters.status = params.status;
      appliedFilters.expiryBefore = params.expiryBefore;
      appliedFilters.expiryAfter = params.expiryAfter;
      contextText = formatContractsContext(contracts);
    } else {
      // content_search or fallback: keyword search
      const keyword = params.keyword || params.contractName || message;
      contracts = searchContractsByText(keyword, 10) as ContractRow[];
      // If also has company/vendor filter, try that too and prefer it if it returned results
      if (params.company || params.vendor) {
        const filtered = searchContractsByFilters({
          company: params.company ?? undefined,
          vendor: params.vendor ?? undefined,
          limit: 10,
        }) as ContractRow[];
        if (filtered.length > 0) contracts = filtered;
      }
      appliedFilters.keyword = keyword;
      contextText = formatContractsContext(contracts);
    }

    // Fallback context if retrieval returned nothing
    if (!contextText.trim()) {
      contextText = "No contracts matching the query criteria were found in the database.";
    }

    // -----------------------------------------------------------------------
    // Step 4: Generate answer with Sonnet, including conversation history
    // -----------------------------------------------------------------------
    const systemPrompt = await fs.readFile(
      path.join(process.cwd(), "prompts/contracts-chat.md"),
      "utf-8"
    );

    // Include last 3 turns (6 messages) of history for multi-turn context
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

    const followUpSuggestions = buildFollowUpSuggestions(intent, contracts, obligations);

    return NextResponse.json({
      answer,
      results: { contracts, obligations },
      appliedFilters,
      needsDisambiguation: false,
      followUpSuggestions,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

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
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit
```

Expected: No errors. If you see "searchContractsByFilters is not exported", the db-imports.ts edit in Step 2 was incomplete.

- [ ] **Step 6: Test the endpoint with curl**

Start dev server in another terminal (`npm run dev`), then:

```bash
curl -s -X POST http://localhost:3000/api/contracts/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Which contracts are expiring soon?","history":[]}' | jq .
```

Expected: JSON with `answer`, `results.contracts`, `results.obligations`, `needsDisambiguation: false`.

```bash
curl -s -X POST http://localhost:3000/api/contracts/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"summarize this contract","history":[]}' | jq .
```

Expected: JSON with `needsDisambiguation: true` and an answer asking the user to select a contract.

- [ ] **Step 7: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add lib/db.js src/lib/db-imports.ts prompts/contracts-chat.md src/app/api/contracts/chat/route.ts
git commit -m "feat: contracts chat backend — DB helpers, API endpoint, and system prompt"
```

---

## Task 2: Contract Chat Panel Component

**Files:**
- Create: `src/components/contracts/contract-chat-panel.tsx`

This component is self-contained. It manages its own message history, calls `/api/contracts/chat`, and renders message bubbles and result cards. It receives `selectedContractId` and `selectedContractName` as props from the parent.

- [ ] **Step 1: Create `src/components/contracts/contract-chat-panel.tsx`**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Send, X, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// -----------------------------------------------------------------------
// Types matching the API response shape from /api/contracts/chat
// -----------------------------------------------------------------------
interface ContractResult {
  id: number;
  name: string;
  status: string;
  contracting_company?: string | null;
  contracting_vendor?: string | null;
  client?: string | null;
  expiry_date?: string | null;
  nextDeadline?: string | null;
  activeObligations?: number;
  overdueObligations?: number;
}

interface ObligationResult {
  id: number;
  document_id: number;
  document_name: string;
  title: string;
  due_date?: string | null;
  category?: string | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  results?: {
    contracts: ContractResult[];
    obligations: ObligationResult[];
  };
  followUpSuggestions?: string[];
  error?: string;
}

interface ContractChatPanelProps {
  selectedContractId?: number | null;
  selectedContractName?: string | null;
  onClose: () => void;
}

// -----------------------------------------------------------------------
// Example prompts shown in the empty state
// -----------------------------------------------------------------------
const EXAMPLE_PROMPTS = [
  "Which contracts expire in the next 60 days?",
  "Show overdue payment obligations",
  "Find contracts missing an expiry date",
  "Summarize the selected contract",
];

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

// -----------------------------------------------------------------------
// Sub-component: contract result card shown inside assistant messages
// -----------------------------------------------------------------------
function ContractResultCard({ contract }: { contract: ContractResult }) {
  const expiry = formatDate(contract.expiry_date);
  const deadline = formatDate(contract.nextDeadline);
  return (
    <div className="text-xs p-2 rounded border bg-background space-y-0.5">
      <div className="font-medium truncate">{contract.name}</div>
      <div className="flex flex-wrap gap-x-2 text-muted-foreground">
        <span className="capitalize">{contract.status}</span>
        {contract.contracting_vendor && <span>{contract.contracting_vendor}</span>}
        {expiry && <span>Expires {expiry}</span>}
        {(contract.overdueObligations ?? 0) > 0 && (
          <span className="text-destructive font-medium">
            {contract.overdueObligations} overdue
          </span>
        )}
        {(contract.activeObligations ?? 0) > 0 && !contract.overdueObligations && (
          <span>{contract.activeObligations} active obligations</span>
        )}
        {deadline && <span>Next: {deadline}</span>}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Sub-component: obligation result card shown inside assistant messages
// -----------------------------------------------------------------------
function ObligationResultCard({ obligation }: { obligation: ObligationResult }) {
  const due = formatDate(obligation.due_date);
  return (
    <div className="text-xs p-2 rounded border bg-background space-y-0.5">
      <div className="font-medium truncate">{obligation.title}</div>
      <div className="flex flex-wrap gap-x-2 text-muted-foreground">
        <span>{obligation.document_name}</span>
        {obligation.category && <span className="capitalize">{obligation.category}</span>}
        {due && <span>Due {due}</span>}
        {obligation.payment_amount != null && (
          <span className="font-medium">
            {obligation.payment_amount} {obligation.payment_currency}
          </span>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------
export function ContractChatPanel({
  selectedContractId,
  selectedContractName,
  onClose,
}: ContractChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    // Snapshot previous messages for history (before appending current)
    const previousMessages = messages;
    const newMessages = [...previousMessages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Build history: all messages BEFORE the current one
      const history = previousMessages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/contracts/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history,
          selectedContractId: selectedContractId ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: "", error: data.error || "An error occurred." },
        ]);
        return;
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.answer || "",
          results: data.results,
          followUpSuggestions: data.followUpSuggestions,
        },
      ]);
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "",
          error: err instanceof Error ? err.message : "Network error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col border rounded-lg bg-card overflow-hidden h-full" style={{ minHeight: "480px" }}>
      {/* ----------------------------------------------------------------
          Header
      ---------------------------------------------------------------- */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm">Contract Assistant</span>
          {selectedContractName && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[120px]"
              title={selectedContractName}
            >
              · {selectedContractName}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* ----------------------------------------------------------------
          Message list
      ---------------------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div className="pt-2 space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Ask anything about your contracts
            </p>
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="w-full text-left text-xs px-3 py-2 rounded-md border border-dashed hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {msg.error ? (
                <span className="text-destructive text-xs">{msg.error}</span>
              ) : (
                <>
                  {msg.content && (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  )}

                  {/* Contract result cards */}
                  {(msg.results?.contracts ?? []).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.results!.contracts.map((c) => (
                        <ContractResultCard key={c.id} contract={c} />
                      ))}
                    </div>
                  )}

                  {/* Obligation result cards */}
                  {(msg.results?.obligations ?? []).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.results!.obligations.map((o) => (
                        <ObligationResultCard key={o.id} obligation={o} />
                      ))}
                    </div>
                  )}

                  {/* Follow-up suggestion chips */}
                  {(msg.followUpSuggestions ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.followUpSuggestions!.map((s) => (
                        <button
                          key={s}
                          onClick={() => sendMessage(s)}
                          className="text-[11px] px-2 py-0.5 rounded-full border hover:bg-accent transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ----------------------------------------------------------------
          Input
      ---------------------------------------------------------------- */}
      <div className="border-t px-3 py-2 flex gap-2 shrink-0">
        <Input
          ref={inputRef}
          placeholder="Ask about your contracts…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          disabled={loading}
          className="text-sm h-8"
        />
        <Button
          size="sm"
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="h-8 px-2 shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/contract-chat-panel.tsx
git commit -m "feat: ContractChatPanel UI component — multi-turn chat with contract and obligation result cards"
```

---

## Task 3: Integration — ContractsTab Layout, ContractList, ContractCard

**Files:**
- Modify: `src/components/contracts/contract-card.tsx`
- Modify: `src/components/contracts/contract-list.tsx`
- Modify: `src/components/contracts/contracts-tab.tsx`

**Context:** `ContractCard` currently manages its own `expanded` state and has no selection/focus concept. We add:
1. `onSelect(id, name)` callback on ContractCard — fires when card expands (with `id` + `name`) and when it collapses (with `null, null`)
2. `isSelected` prop — adds a subtle visual ring to indicate the chat is using this contract as context
3. `ContractList` receives `selectedContractId` + `onSelectContract` and threads them through to each card
4. `ContractsTab` owns the `chatOpen`, `selectedContractId`, `selectedContractName` state and renders the side-by-side layout

- [ ] **Step 1: Update `ContractCard` — add `onSelect` and `isSelected` props**

Open `src/components/contracts/contract-card.tsx`.

Change the `ContractCardProps` interface (currently at line 12):

```tsx
interface ContractCardProps {
  contract: Contract;
  onContractUpdate?: () => void;
  onSelect?: (contractId: number | null, contractName: string | null) => void;
  isSelected?: boolean;
}
```

Update the function signature (line 52):

```tsx
export function ContractCard({ contract, onContractUpdate, onSelect, isSelected }: ContractCardProps) {
```

Find the `setExpanded(!expanded)` call inside the card header click handler (around line 115). Replace `setExpanded(!expanded)` with:

```tsx
const nextExpanded = !expanded;
setExpanded(nextExpanded);
if (onSelect) {
  onSelect(nextExpanded ? contract.id : null, nextExpanded ? contract.name : null);
}
```

Find the outermost `<div>` wrapper of the card and add an `isSelected` ring. The existing card wrapper is:

```tsx
<div className="bg-card border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
```

Change it to:

```tsx
<div className={`bg-card border rounded-lg overflow-hidden hover:shadow-md transition-shadow ${isSelected ? "ring-2 ring-primary/40" : ""}`}>
```

- [ ] **Step 2: Update `ContractList` — thread selection props**

Open `src/components/contracts/contract-list.tsx`.

Update `ContractListProps` (line 9):

```tsx
interface ContractListProps {
  refreshTrigger?: number;
  searchQuery: string;
  selectedStatuses: string[];
  selectedContractId?: number | null;
  onSelectContract?: (contractId: number | null, contractName: string | null) => void;
}
```

Update the function signature (line 16):

```tsx
export function ContractList({
  refreshTrigger,
  searchQuery,
  selectedStatuses,
  selectedContractId,
  onSelectContract,
}: ContractListProps) {
```

In the map block where `<ContractCard>` is rendered (around line 84), update it to pass the new props:

```tsx
{filteredContracts.map((contract) => (
  <ContractCard
    key={contract.id}
    contract={contract}
    onContractUpdate={() => setCardRefresh((n) => n + 1)}
    isSelected={selectedContractId === contract.id}
    onSelect={onSelectContract}
  />
))}
```

- [ ] **Step 3: Update `ContractsTab` — chat state, side-by-side layout, and AI button**

Open `src/components/contracts/contracts-tab.tsx`. This is the most involved change. Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
import { Plus, MessageSquare } from "lucide-react";
import { ContractList } from "./contract-list";
import { ContractChatPanel } from "./contract-chat-panel";
import { AddContractDialog } from "./add-contract-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CONTRACT_STATUS_DISPLAY } from "@/lib/constants";

export function ContractsTab() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    Object.keys(CONTRACT_STATUS_DISPLAY)
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedContractName, setSelectedContractName] = useState<string | null>(null);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  function handleContractSelect(
    contractId: number | null,
    contractName: string | null
  ) {
    setSelectedContractId(contractId);
    setSelectedContractName(contractName);
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">All Contracts</h3>
        <div className="flex items-center gap-2">
          <Button
            variant={chatOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setChatOpen((v) => !v)}
            className="gap-1.5"
          >
            <MessageSquare className="h-4 w-4" />
            {chatOpen ? "Close Chat" : "Ask AI"}
          </Button>
          <button
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Add New Contract
          </button>
        </div>
      </div>

      {/* Main layout: list (always visible) + optional chat panel */}
      <div className={chatOpen ? "grid grid-cols-2 gap-4 items-start" : undefined}>
        {/* Left column: search, filters, list */}
        <div className="space-y-4">
          {/* Search + filter row */}
          <div className="space-y-2">
            <Input
              placeholder="Search by name or vendor…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(CONTRACT_STATUS_DISPLAY).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(key)}
                    onChange={() => toggleStatus(key)}
                    className="rounded border-input"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <ContractList
            refreshTrigger={refreshTrigger}
            searchQuery={searchQuery}
            selectedStatuses={selectedStatuses}
            selectedContractId={chatOpen ? selectedContractId : undefined}
            onSelectContract={chatOpen ? handleContractSelect : undefined}
          />
        </div>

        {/* Right column: chat panel — only rendered when chatOpen */}
        {chatOpen && (
          <div className="sticky top-6">
            <ContractChatPanel
              selectedContractId={selectedContractId}
              selectedContractName={selectedContractName}
              onClose={() => {
                setChatOpen(false);
                setSelectedContractId(null);
                setSelectedContractName(null);
              }}
            />
          </div>
        )}
      </div>

      <AddContractDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => {
          setShowAddDialog(false);
          setRefreshTrigger((t) => t + 1);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 5: Run full build**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea" && npm run build
```

Expected: Build succeeds. The `/contracts` route and `/api/contracts/chat` route should both appear in the build output.

- [ ] **Step 6: Manual end-to-end test**

Start dev server (`npm run dev`), navigate to `/contracts`.

Test checklist:
- [ ] "Ask AI" button appears in the header
- [ ] Clicking "Ask AI" opens the chat panel to the right of the contract list
- [ ] The contract list still shows and filters correctly while chat is open
- [ ] Example prompt chips are visible in the empty chat state
- [ ] Clicking an example prompt sends it and gets a response
- [ ] Expanding a contract card causes the chat header to show the contract name
- [ ] Asking "summarize this contract" after expanding a card returns a summary
- [ ] Asking "which contracts expire in the next 60 days?" returns filtered results with contract cards
- [ ] Asking "show overdue obligations" returns obligation cards
- [ ] Asking something nonsensical gets a graceful fallback response
- [ ] Closing the chat panel with the X button returns to single-column layout

- [ ] **Step 7: Commit**

```bash
cd "/Users/krzysztofpietranik/Documents/AI/Mój projekt/v4/compliancea"
git add src/components/contracts/contract-card.tsx \
        src/components/contracts/contract-list.tsx \
        src/components/contracts/contracts-tab.tsx
git commit -m "feat: integrate contract chat panel into Contracts tab — side-by-side layout with selection context"
```
