import Anthropic from "@anthropic-ai/sdk";

/**
 * Extract contract terms and obligations using Claude Sonnet.
 * Obligations are grouped into ACTION CATEGORIES — each category represents
 * something you need to do (pay, report, terminate, renew, etc.).
 * Each obligation is assigned to a lifecycle STAGE (not_signed, signed, active, terminated).
 *
 * @param {string} text - Full contract text
 * @param {string} [apiKey] - Anthropic API key (defaults to env)
 * @returns {Promise<Object>}
 */
export async function extractContractTerms(text, apiKey = null) {
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  const words = text.split(/\s+/);
  const truncated = words.slice(0, 6000).join(" ");

  const systemPrompt = `You are a contract analysis specialist. Extract obligations GROUPED BY ACTION CATEGORY.

Each category is a type of action the contracting party must take. Pack ALL related details (penalties, notice periods, amounts, schedules) INTO the category — do not create separate obligations for penalties or notice periods.

Each obligation is assigned to a CONTRACT LIFECYCLE STAGE — the stage during which it becomes relevant.

Return ONLY valid JSON:
{
  "parties": ["Party A", "Party B"],
  "effective_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "contract_type": "vendor|b2b|employment|nda|lease|licensing|partnership|framework|other",
  "suggested_name": "Short descriptive name: 'CompanyA — CompanyB' using the two main contracting parties. Use legal entity names (not abbreviations). Max 60 characters.",
  "obligations": [
    {
      "category": "payments|termination|legal|others",
      "title": "Short name for this obligation category (e.g. 'Service Fees', 'Termination Notice', 'Confidentiality')",
      "stage": "not_signed|signed|active|terminated",
      "summary": "One paragraph summarizing everything about this obligation — all conditions, amounts, deadlines, penalties, notice periods packed together.",
      "clause_references": ["Section 3.1", "Section 3.2"],
      "suggested_owner": "Finance|Legal|Compliance|Operations|HR|IT|Board",
      "proof_description": "What evidence proves compliance with this obligation",
      "schedule": {
        "recurrence": "weekly|monthly|quarterly|annually|one_time|on_trigger",
        "due_dates": [
          {
            "label": "Description of this specific deadline or payment",
            "date": "YYYY-MM-DD or null",
            "amount": "currency amount as string or null (e.g. '$5,000', '\u20ac10,000/month')",
            "details": "Any extra info about this specific date/payment"
          }
        ],
        "notice_period_days": null
      },
      "penalties": "Description of penalties for non-compliance, or null",
      "key_values": {
        "amounts": ["$X per month", "$Y annually"],
        "deadlines": ["30 days notice required", "Due by 15th of each month"],
        "conditions": ["Only if revenue exceeds $1M", "Subject to 90-day cure period"]
      }
    }
  ]
}

STAGE ASSIGNMENT RULES — THIS IS CRITICAL:
- "not_signed" = obligations relevant BEFORE the contract is signed: due diligence, legal review, document review, negotiation tasks, analysis, board/committee approvals needed before signing.
- "signed" = obligations that activate right after signing but before the contract becomes fully active: uploading/submitting the signed document, setup tasks, onboarding, initial filings, system integrations, first-time registrations, opening accounts, initial deposits.
- "active" = ongoing obligations during the life of the contract: recurring payments, periodic reports, deliveries, insurance maintenance, ongoing compliance, confidentiality obligations, regular audits.
- "terminated" = obligations that apply when the contract ends: exit procedures, final payments, data return/destruction, transition support, final audits, post-termination confidentiality, non-compete periods.

IMPORTANT: Stage and category are independent. A "signed" stage obligation belongs to the category that matches what it IS (e.g. uploading a contract document = category "others", not "termination").

CRITICAL RULES:
- contract_type: classify the contract into exactly one of: vendor, b2b, employment, nda, lease, licensing, partnership, framework, other.
- suggested_name: format as "Party1 — Party2" using the two main contracting parties' full names. If only one party is identifiable, use just that party's name. Max 60 characters.
- NEVER create separate obligations for penalties — pack them into the parent obligation.
- key_values should extract the specific numbers, dates, and conditions that a human needs to see at a glance.
- If an obligation has sub-items (e.g. multiple types of reports), put them all as separate due_dates within the same obligation.
- For TERMINATION obligations: pack notice period, penalties for early termination, required steps, and any fees ALL into one obligation. Stage = "terminated". Category = "termination".
- For RENEWAL: if auto-renewal, stage = "active" with the opt-out deadline. If manual, stage = "terminated". Category = "termination".
- CATEGORY RULES: Use exactly 4 categories:
  - "payments" = all payment obligations (fees, invoices, deposits, refunds, penalties that are financial)
  - "termination" = ONLY obligations that apply when ending the contract: termination notices, early termination fees, renewal opt-out deadlines, exit/wind-down procedures. Do NOT put signing tasks, document uploads, or onboarding tasks here.
  - "legal" = compliance, confidentiality, insurance, indemnification, reporting, regulatory filings, audits, data protection
  - "others" = everything operational that doesn't fit above: document uploads, signing procedures, deliverables, system setup, onboarding tasks, training, approvals before or after signing, any miscellaneous procedural obligations

NON-PAYMENT OBLIGATION GATE — CRITICAL FILTER:
For ALL non-payment obligations (termination, legal, others), apply this strict gate BEFORE extracting:
An obligation MUST have BOTH:
  1. A concrete due date — a specific YYYY-MM-DD date, or a date calculable from contract terms (e.g. "90 days before expiry" = calculate the exact date)
  2. A specific, discrete action — something that must be done once or by a deadline (not ongoing maintenance or general duties)

If an obligation fails EITHER condition, DO NOT extract it.

EXPLICITLY EXCLUDE (never extract these):
- General confidentiality obligations (ongoing duty, no specific deadline)
- General insurance maintenance ("shall maintain insurance coverage" — ongoing, no specific date)
- Ongoing compliance statements without concrete dates ("shall comply with all applicable laws" — regulatory boilerplate)
- Termination procedures without a specific notice deadline date (generic exit clauses)
- Any obligation using "shall maintain", "shall ensure", "shall comply" without a concrete YYYY-MM-DD deadline
- Boilerplate legal language (indemnification clauses, limitation of liability, governing law, dispute resolution — unless they have a specific dated action)

EXPLICITLY INCLUDE (extract these non-payment obligations):
- Service delivery milestones with a specific YYYY-MM-DD date (e.g. "deliver Phase 1 by 2025-06-15")
- Report submission deadlines with a specific date (e.g. "submit quarterly report by Jan 15" — calculate YYYY-MM-DD dates)
- Notice deadlines with calculated dates (e.g. "termination notice required 90 days before expiry" — calculate the exact YYYY-MM-DD date from the contract's expiry_date)
- Any obligation where the contract specifies a concrete date for a specific, one-time or periodic deliverable

This gate does NOT apply to payment obligations — ALL payment obligations are always extracted per the rules below.

PAYMENT EXTRACTION — THIS IS THE MOST IMPORTANT RULE:
You MUST extract exact payment amounts and dates. A payment obligation with missing amounts or dates is INVALID.
1. Search the ENTIRE contract for any mention of fees, prices, costs, payments, charges, rates, or compensation.
2. Extract the EXACT currency amount (e.g. "$5,000", "\u20ac10,000", "PLN 25,000"). NEVER leave amount as null for payments.
3. For recurring payments, calculate concrete YYYY-MM-DD dates starting from today (${new Date().toISOString().split("T")[0]}):
   - Monthly: list 12 entries, one per month
   - Quarterly: list 4 entries
   - Annually: list 2 entries
4. If a specific day of month is not stated, default to the 1st.
5. Each due_date entry MUST have a non-null "date" AND a non-null "amount".

EXAMPLE — if the contract says "monthly fee of $5,000 payable by the 15th of each month":
{
  "category": "payments",
  "title": "Monthly Service Fee",
  "stage": "active",
  "summary": "Monthly service fee of $5,000 payable by the 15th of each month as per Section 4.1. Late payments incur 1.5% monthly interest.",
  "schedule": {
    "recurrence": "monthly",
    "due_dates": [
      {"label": "Monthly service fee — March 2025", "date": "2025-03-15", "amount": "$5,000", "details": null},
      {"label": "Monthly service fee — April 2025", "date": "2025-04-15", "amount": "$5,000", "details": null}
    ]
  },
  "key_values": {
    "amounts": ["$5,000/month"],
    "deadlines": ["Due by 15th of each month"],
    "conditions": ["Late payment interest: 1.5%/month"]
  }
}`;

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Analyze this contract and extract all obligation categories:\n\n${truncated}`,
      },
    ],
  });

  const responseText = response.content[0]?.text || "";
  const tokenUsage = {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0,
    total: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    model: "sonnet",
  };

  let parsed;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (parseErr) {
    console.error("Contract extraction parse error:", parseErr.message);
    return {
      parties: [],
      effective_date: null,
      expiry_date: null,
      contract_type: "other",
      suggested_name: null,
      obligations: [],
      tokenUsage,
      error: "Failed to parse contract analysis results",
    };
  }

  const validContractTypes = ["vendor", "b2b", "employment", "nda", "lease", "licensing", "partnership", "framework", "other"];

  const result = {
    parties: Array.isArray(parsed.parties) ? parsed.parties : [],
    effective_date: parsed.effective_date || null,
    expiry_date: parsed.expiry_date || null,
    contract_type: validContractTypes.includes(parsed.contract_type) ? parsed.contract_type : "other",
    suggested_name: typeof parsed.suggested_name === "string" && parsed.suggested_name.trim().length > 0
      ? parsed.suggested_name.trim().slice(0, 60)
      : null,
    obligations: [],
    tokenUsage,
  };

  const validCategories = ["payments", "termination", "legal", "others"];
  const categoryMigrationMap = {
    payment: "payments", reporting: "legal", renewal: "termination",
    delivery: "others", compliance: "legal", confidentiality: "legal",
    insurance: "legal", indemnification: "legal", other: "others",
  };
  const validRecurrences = ["weekly", "monthly", "quarterly", "annually", "one_time", "on_trigger"];
  const validStages = ["not_signed", "signed", "active", "terminated"];

  if (Array.isArray(parsed.obligations)) {
    for (const ob of parsed.obligations) {
      const schedule = ob.schedule || {};
      const dueDates = Array.isArray(schedule.due_dates) ? schedule.due_dates.map(d => ({
        label: String(d.label || ""),
        date: d.date || null,
        amount: d.amount || null,
        details: d.details || null,
      })) : [];

      const keyValues = ob.key_values || {};

      result.obligations.push({
        category: validCategories.includes(ob.category) ? ob.category : (categoryMigrationMap[ob.category] || "others"),
        title: String(ob.title || "Untitled").slice(0, 200),
        stage: validStages.includes(ob.stage) ? ob.stage : "active",
        activation: ob.stage === "not_signed" || ob.stage === "signed" || ob.stage === "terminated" ? "dormant" : "active",
        summary: ob.summary || null,
        clause_references: Array.isArray(ob.clause_references) ? ob.clause_references : [],
        suggested_owner: ob.suggested_owner || null,
        proof_description: ob.proof_description || null,
        recurrence: validRecurrences.includes(schedule.recurrence) ? schedule.recurrence : "one_time",
        notice_period_days: typeof schedule.notice_period_days === "number" ? schedule.notice_period_days : null,
        due_dates: dueDates,
        penalties: ob.penalties || null,
        key_values: {
          amounts: Array.isArray(keyValues.amounts) ? keyValues.amounts : [],
          deadlines: Array.isArray(keyValues.deadlines) ? keyValues.deadlines : [],
          conditions: Array.isArray(keyValues.conditions) ? keyValues.conditions : [],
        },
      });
    }
  }

  return result;
}

/**
 * Classify a GDrive document as contract, annex, invoice, or other.
 * Returns classification + extracted parent reference (annexes) or financial data (invoices).
 *
 * @param {string} text - Full document text
 * @param {string} [apiKey] - Anthropic API key (defaults to env)
 * @returns {Promise<Object>}
 */
export async function classifyGDriveDocument(text, apiKey = null) {
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  const words = text.split(/\s+/);
  const truncated = words.slice(0, 6000).join(" ");

  const systemPrompt = `You are a document classification specialist. Classify the document into exactly one category and extract relevant metadata.

Return ONLY valid JSON (no markdown):
{
  "classification": "contract|annex|invoice|other",
  "annexParentReference": {
    "contractTitle": "title of the parent contract or null",
    "parties": ["Party A", "Party B"],
    "contractNumber": "contract number or null"
  },
  "invoiceData": {
    "vendorName": "vendor/supplier name or null",
    "contractReference": "referenced contract number/title or null",
    "invoiceNumber": "invoice number or null",
    "amount": 1234.56,
    "currency": "EUR",
    "issueDate": "YYYY-MM-DD or null",
    "dueDate": "YYYY-MM-DD or null"
  }
}

CLASSIFICATION RULES:

1. **annex** — The document is an annex, attachment, amendment, or addendum to an existing contract.
   Indicators: "Annex", "Załącznik", "Addendum", "Amendment", "Exhibit", "Schedule", "Appendix", "Aneks", explicit references to a parent/main contract, amendment numbering.
   When classified as annex: populate annexParentReference with the parent contract details. Set invoiceData to null.

2. **invoice** — The document is a financial invoice or bill.
   Indicators: "Invoice", "Faktura", "Faktura VAT", "VAT", invoice number patterns (e.g. FV/2024/001), total/gross/net amount, payment due date, bank account details, tax ID / NIP.
   When classified as invoice: populate invoiceData with extracted financial details. Set annexParentReference to null.

3. **contract** — The document is a standalone contract or agreement.
   Indicators: two or more contracting parties, effective/commencement date, expiry/termination date, obligation language, governing law clause, signatures section, "Agreement", "Umowa", "Contract".
   When classified as contract: set both annexParentReference and invoiceData to null.

4. **other** — Letters, policies, reports, memos, certificates, or anything that does not fit the above categories.
   When classified as other: set both annexParentReference and invoiceData to null.

CRITICAL RULES:
- When uncertain between categories, default to "contract" (fail-safe — better to over-classify as contract than to misroute).
- The document may be in English OR Polish — classify based on content regardless of language.
- For invoiceData.amount: extract the gross/total amount as a number (e.g. 1234.56), not a string.
- For dates: use ISO format YYYY-MM-DD.
- Set annexParentReference to null when classification is NOT "annex".
- Set invoiceData to null when classification is NOT "invoice".`;

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Classify this document and extract relevant metadata:\n\n${truncated}`,
      },
    ],
  });

  const responseText = response.content[0]?.text || "";
  const tokenUsage = {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0,
    total: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    model: "sonnet",
  };

  let parsed;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = null;
    }
  } catch (e) {
    parsed = null;
  }

  const validClassifications = ["contract", "annex", "invoice", "other"];
  const classification = validClassifications.includes(parsed?.classification)
    ? parsed.classification
    : "contract";

  return {
    classification,
    annexParentReference: classification === "annex" && parsed?.annexParentReference
      ? {
          contractTitle: parsed.annexParentReference.contractTitle || null,
          parties: Array.isArray(parsed.annexParentReference.parties) ? parsed.annexParentReference.parties : [],
          contractNumber: parsed.annexParentReference.contractNumber || null,
        }
      : null,
    invoiceData: classification === "invoice" && parsed?.invoiceData
      ? {
          vendorName: parsed.invoiceData.vendorName || null,
          contractReference: parsed.invoiceData.contractReference || null,
          invoiceNumber: parsed.invoiceData.invoiceNumber || null,
          amount: typeof parsed.invoiceData.amount === "number" ? parsed.invoiceData.amount : null,
          currency: parsed.invoiceData.currency || null,
          issueDate: parsed.invoiceData.issueDate || null,
          dueDate: parsed.invoiceData.dueDate || null,
        }
      : null,
    tokenUsage,
  };
}

/**
 * Check if an obligation is being met based on stored evidence.
 * Uses Claude to evaluate the evidence against the obligation.
 *
 * @param {Object} obligation - The obligation record
 * @param {Object[]} evidenceDocs - Array of {documentName, content} for evidence documents
 * @param {string} [apiKey] - Anthropic API key
 * @returns {Promise<{met: boolean, assessment: string, confidence: string, tokenUsage: Object}>}
 */
export async function checkObligationCompliance(obligation, evidenceDocs, apiKey = null) {
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  const evidenceText = evidenceDocs.length > 0
    ? evidenceDocs.map((d, i) => `Evidence ${i + 1} — "${d.documentName}":\n${d.content}`).join("\n\n---\n\n")
    : "No evidence documents have been linked yet.";

  const systemPrompt = `You are a compliance assessor. Evaluate whether a contract obligation is being met based on provided evidence documents.

Return ONLY valid JSON (no markdown):
{
  "met": true or false,
  "assessment": "Brief explanation of your assessment (2-3 sentences max)",
  "confidence": "high|medium|low"
}

If no evidence is provided, always return met=false with a note that evidence needs to be uploaded.`;

  const userMessage = `Obligation: ${obligation.title}
Type: ${obligation.obligation_type || obligation.category || "N/A"}
Description: ${obligation.summary || obligation.description || "N/A"}
Penalties: ${obligation.penalties || "N/A"}
Clause: ${obligation.clause_reference || "N/A"}
Required proof: ${obligation.proof_description || "Not specified"}
Due date: ${obligation.due_date || "Ongoing"}
Status: ${obligation.status}

---

${evidenceText}`;

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const response = await anthropic.messages.create({
    model,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const responseText = response.content[0]?.text || "";
  const tokenUsage = {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0,
    total: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    model: "sonnet",
  };

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        met: !!parsed.met,
        assessment: String(parsed.assessment || "Unable to assess"),
        confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
        tokenUsage,
      };
    }
  } catch (e) {
    // Fall through to default
  }

  return {
    met: false,
    assessment: "Unable to parse compliance assessment",
    confidence: "low",
    tokenUsage,
  };
}
