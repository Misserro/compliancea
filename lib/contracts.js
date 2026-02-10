import Anthropic from "@anthropic-ai/sdk";

/**
 * Extract contract terms and obligations using Claude Sonnet.
 * Analyzes contract text and returns structured data about parties,
 * dates, and obligations (renewals, duties, penalties, etc.)
 *
 * @param {string} text - Full contract text
 * @param {string} [apiKey] - Anthropic API key (defaults to env)
 * @returns {Promise<{parties: string[], effective_date: string, expiry_date: string, obligations: Object[], tokenUsage: Object}>}
 */
export async function extractContractTerms(text, apiKey = null) {
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  // Use up to ~6000 words to get good coverage of the contract
  const words = text.split(/\s+/);
  const truncated = words.slice(0, 6000).join(" ");

  const systemPrompt = `You are a contract analysis specialist. Analyze the contract text and extract all key terms and obligations.

Return ONLY valid JSON (no markdown, no explanation) with this structure:
{
  "parties": ["Party A name", "Party B name"],
  "effective_date": "YYYY-MM-DD or null if not found",
  "expiry_date": "YYYY-MM-DD or null if not found",
  "obligations": [
    {
      "type": "renewal|termination_notice|duty|penalty|reporting|payment",
      "title": "Short descriptive title (max 80 chars)",
      "description": "Full description of the obligation",
      "clause_reference": "Section X.Y or Clause N or null",
      "due_date": "YYYY-MM-DD or null for ongoing obligations",
      "recurrence": "one_time|monthly|quarterly|annually|ongoing",
      "notice_period_days": number or null,
      "suggested_owner": "Department or role best suited (e.g. Legal, Compliance, Finance, Operations)",
      "proof_description": "What evidence would prove this obligation is being met"
    }
  ]
}

Guidelines:
- Extract ALL obligations, not just the obvious ones. Include renewals, notice periods, reporting duties, payment terms, penalties, compliance requirements.
- For renewal/termination obligations, calculate the actual deadline date based on the expiry date and notice period.
- For recurring obligations, set due_date to the next upcoming occurrence.
- proof_description should be specific and actionable (e.g. "Signed compliance report submitted to regulator" not just "Report").
- If dates cannot be determined, use null.
- Always include clause_reference when identifiable.`;

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Analyze this contract and extract all terms and obligations:\n\n${truncated}`,
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

  // Parse JSON response
  let parsed;
  try {
    // Try to extract JSON from response (handle possible markdown wrapping)
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

  // Validate and normalize
  const result = {
    parties: Array.isArray(parsed.parties) ? parsed.parties : [],
    effective_date: parsed.effective_date || null,
    expiry_date: parsed.expiry_date || null,
    obligations: [],
    tokenUsage,
  };

  const validTypes = ["renewal", "termination_notice", "duty", "penalty", "reporting", "payment"];
  const validRecurrences = ["one_time", "monthly", "quarterly", "annually", "ongoing"];

  if (Array.isArray(parsed.obligations)) {
    for (const ob of parsed.obligations) {
      result.obligations.push({
        type: validTypes.includes(ob.type) ? ob.type : "duty",
        title: String(ob.title || "Untitled obligation").slice(0, 200),
        description: ob.description || null,
        clause_reference: ob.clause_reference || null,
        due_date: ob.due_date || null,
        recurrence: validRecurrences.includes(ob.recurrence) ? ob.recurrence : "one_time",
        notice_period_days: typeof ob.notice_period_days === "number" ? ob.notice_period_days : null,
        suggested_owner: ob.suggested_owner || null,
        proof_description: ob.proof_description || null,
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
Type: ${obligation.obligation_type}
Description: ${obligation.description || "N/A"}
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
