import Anthropic from "@anthropic-ai/sdk";

/**
 * Extract contract terms and obligations using Claude Sonnet.
 * Obligations are grouped into ACTION CATEGORIES — each category represents
 * something you need to do (pay, report, terminate, renew, etc.).
 * Categories are either "active" (ongoing/recurring) or "dormant" (triggered only when needed).
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

Return ONLY valid JSON:
{
  "parties": ["Party A", "Party B"],
  "effective_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "obligations": [
    {
      "category": "payment|reporting|termination|renewal|delivery|compliance|confidentiality|insurance|indemnification|other",
      "title": "Short name for this obligation category (e.g. 'Service Fees', 'Quarterly Reporting', 'Termination')",
      "activation": "active|dormant",
      "summary": "One paragraph summarizing everything about this obligation category — all conditions, amounts, deadlines, penalties, notice periods packed together.",
      "clause_references": ["Section 3.1", "Section 3.2"],
      "suggested_owner": "Finance|Legal|Compliance|Operations|HR|IT|Board",
      "proof_description": "What evidence proves compliance with this obligation",
      "schedule": {
        "recurrence": "weekly|monthly|quarterly|annually|one_time|on_trigger",
        "due_dates": [
          {
            "label": "Description of this specific deadline or payment",
            "date": "YYYY-MM-DD or null",
            "amount": "currency amount as string or null (e.g. '$5,000', '€10,000/month')",
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

CRITICAL RULES:
- "active" = obligations you must meet on a recurring/ongoing basis (payments, reports, deliveries, insurance maintenance). These have real deadlines.
- "dormant" = obligations that only matter when triggered by an action (termination conditions, indemnification, dispute resolution, change of control). These are greyed out until the user activates them.
- For PAYMENT: create a separate due_date entry for EACH payment with the exact amount and deadline. If monthly, list at least the next 12 months. If quarterly, list next 4 quarters. Include the amounts.
- For TERMINATION: pack notice period, penalties for early termination, required steps, and any fees ALL into one category. Mark as "dormant".
- For RENEWAL: if auto-renewal, mark "active" with the opt-out deadline. If manual, mark "dormant".
- NEVER create separate obligations for penalties — pack them into the parent category.
- key_values should extract the specific numbers, dates, and conditions that a human needs to see at a glance.
- If an obligation has sub-items (e.g. multiple types of reports), put them all as separate due_dates within the same category.`;

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
      obligations: [],
      tokenUsage,
      error: "Failed to parse contract analysis results",
    };
  }

  const result = {
    parties: Array.isArray(parsed.parties) ? parsed.parties : [],
    effective_date: parsed.effective_date || null,
    expiry_date: parsed.expiry_date || null,
    obligations: [],
    tokenUsage,
  };

  const validCategories = ["payment", "reporting", "termination", "renewal", "delivery", "compliance", "confidentiality", "insurance", "indemnification", "other"];
  const validRecurrences = ["weekly", "monthly", "quarterly", "annually", "one_time", "on_trigger"];

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
        category: validCategories.includes(ob.category) ? ob.category : "other",
        title: String(ob.title || "Untitled").slice(0, 200),
        activation: ob.activation === "dormant" ? "dormant" : "active",
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
