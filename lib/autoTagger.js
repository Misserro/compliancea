import Anthropic from "@anthropic-ai/sdk";

const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

const VALID_DOC_TYPES = [
  "contract", "invoice", "letter", "report", "application",
  "policy", "memo", "minutes", "form", "regulation",
  "certificate", "agreement", "notice", "statement", "other",
];

const VALID_JURISDICTIONS = [
  "EU", "US", "UK", "DE", "PL", "FR", "ES", "NL", "IT", "CH",
  "international", null,
];

const VALID_SENSITIVITIES = ["public", "internal", "confidential", "restricted"];

const VALID_STATUSES = ["draft", "in_review", "approved"];

/**
 * Extract rich metadata from document text using Claude Haiku.
 * Identifies document type, category (department), jurisdiction, client,
 * tags, language, sensitivity, and suggests an initial status.
 *
 * @param {string} text - Extracted document text (first ~2000 words used)
 * @param {string} [apiKey] - Anthropic API key (defaults to env)
 * @returns {Promise<Object>} - Extracted metadata with tokenUsage
 */
export async function extractMetadata(text, apiKey = null) {
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  // Use only first ~2000 words to save tokens
  const words = text.split(/\s+/);
  const truncated = words.slice(0, 2000).join(" ");

  const systemPrompt = `You are a document classification and metadata extraction specialist. Analyze the document text and return ONLY valid JSON (no markdown, no explanation) with these fields:

{
  "doc_type": one of: ${VALID_DOC_TYPES.map(t => `"${t}"`).join(", ")},
  "category": the most appropriate department — one of: ${DEPARTMENTS.map(d => `"${d}"`).join(", ")} — based on document content:
    - "Finance" = invoices, budgets, financial statements, tax documents, payment records
    - "Compliance" = regulatory filings, audit reports, compliance certificates, KYC/AML documents
    - "Operations" = contracts, agreements, SOWs, project plans, operational procedures
    - "HR" = employment contracts, policies, performance reviews, onboarding documents
    - "Board" = board resolutions, shareholder letters, annual reports, governance documents
    - "IT" = technical specs, system documentation, security policies, data processing agreements
  "client": client or counterparty name (string or null if not identifiable),
  "jurisdiction": legal jurisdiction — one of: ${VALID_JURISDICTIONS.filter(Boolean).map(j => `"${j}"`).join(", ")} or null,
  "tags": array of 3-7 descriptive lowercase keyword tags covering: topic, parties, date references, key terms,
  "language": detected language ("English", "Polish", "German", "French", "Spanish", "Dutch", "Italian", or the actual language name),
  "sensitivity": one of: "public", "internal", "confidential", "restricted" — assess based on:
    - "public" = press releases, published reports, public-facing documents
    - "internal" = general business documents, memos, meeting notes
    - "confidential" = contracts with NDAs, financial data, personal data, legal opinions
    - "restricted" = board-level decisions, M&A documents, security audits, highly sensitive personal data
  "suggested_status": one of: "draft", "in_review", "approved" — assess based on:
    - "draft" = incomplete documents, working drafts, unsigned versions, templates
    - "in_review" = documents awaiting signature, pending approval, circulated for comment
    - "approved" = signed documents, executed contracts, published/finalized reports, official filings
  "summary": a 1-sentence summary of the document (max 30 words)
}

Be precise with jurisdiction — look for country references, legal frameworks (GDPR=EU, CCPA=US, etc.), currency, language cues.
For tags, extract meaningful business terms, not generic words.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 700,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: truncated,
        },
      ],
    });

    const responseText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse JSON from response (strip markdown fences if present)
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const metadata = JSON.parse(jsonText);

    // Validate and normalize all fields
    return {
      doc_type: VALID_DOC_TYPES.includes(metadata.doc_type)
        ? metadata.doc_type
        : "other",
      category: DEPARTMENTS.includes(metadata.category)
        ? metadata.category
        : null,
      client: metadata.client || null,
      jurisdiction: VALID_JURISDICTIONS.includes(metadata.jurisdiction)
        ? metadata.jurisdiction
        : null,
      tags: Array.isArray(metadata.tags)
        ? metadata.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 7)
        : [],
      language: metadata.language || "other",
      sensitivity: VALID_SENSITIVITIES.includes(metadata.sensitivity)
        ? metadata.sensitivity
        : "internal",
      suggested_status: VALID_STATUSES.includes(metadata.suggested_status)
        ? metadata.suggested_status
        : "draft",
      summary: typeof metadata.summary === "string"
        ? metadata.summary.slice(0, 200)
        : null,
      tokenUsage: {
        input: message.usage?.input_tokens || 0,
        output: message.usage?.output_tokens || 0,
      },
    };
  } catch (err) {
    console.error("Auto-tagger error:", err.message);
    // Return defaults on failure
    return {
      doc_type: "other",
      category: null,
      client: null,
      jurisdiction: null,
      tags: [],
      language: "other",
      sensitivity: "internal",
      suggested_status: "draft",
      summary: null,
      tokenUsage: { input: 0, output: 0 },
      error: err.message,
    };
  }
}
