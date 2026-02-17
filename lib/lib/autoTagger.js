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

const VALID_IN_FORCE = ["in_force", "archival", "unknown"];

const TAG_CATEGORIES = [
  "topics", "subtopics", "legal_concepts", "regulations",
  "entity_types", "procedures", "compliance_areas",
  "geographic", "temporal", "industry",
];

/**
 * Extract rich metadata from document text using Claude Haiku.
 * Identifies document type, category (department), jurisdiction, client,
 * extensive categorized tags, language, sensitivity, in-force status,
 * and suggests an initial status.
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
    - "Compliance" = regulatory filings, audit reports, compliance certificates, KYC/AML documents, risk assessments
    - "Operations" = contracts, agreements, SOWs, project plans, operational procedures
    - "HR" = employment contracts, policies, performance reviews, onboarding documents
    - "Board" = board resolutions, shareholder letters, annual reports, governance documents
    - "IT" = technical specs, system documentation, security policies, data processing agreements
  "client": client or counterparty name (string or null if not identifiable),
  "jurisdiction": legal jurisdiction — one of: ${VALID_JURISDICTIONS.filter(Boolean).map(j => `"${j}"`).join(", ")} or null,
  "tags": an object with categorized tags for comprehensive document indexing:
    {
      "topics": array of 3-5 main subjects/themes covered in the document,
      "subtopics": array of 3-5 more specific sub-themes or details,
      "legal_concepts": array of 2-4 legal principles, doctrines, or frameworks referenced (e.g. "fiduciary-duty", "force-majeure", "data-minimization"),
      "regulations": array of 1-5 specific regulations, directives, or laws cited (e.g. "gdpr", "amld5", "mifid-ii", "fatca", "ccpa"),
      "entity_types": array of 1-3 entity types discussed (e.g. "pep", "corporate", "natural-person", "trust", "foundation"),
      "procedures": array of 1-4 procedures or processes described (e.g. "onboarding", "kyc", "due-diligence", "risk-assessment", "reporting"),
      "compliance_areas": array of 1-4 compliance domains (e.g. "aml", "sanctions", "data-protection", "tax-compliance", "consumer-protection"),
      "geographic": array of 1-4 countries, regions, or markets referenced (e.g. "latvia", "european-union", "united-states"),
      "temporal": array of 0-2 time references (e.g. "2024", "q1-2024", "annual", "multi-year"),
      "industry": array of 1-2 industry sectors (e.g. "banking", "insurance", "fintech", "real-estate", "payments")
    }
    Use lowercase, hyphen-separated terms. Be specific and precise — these tags will be used to match documents to user queries. Include every relevant concept, regulation, entity, and procedure mentioned in the document.
  "language": detected language ("English", "Polish", "German", "French", "Spanish", "Dutch", "Italian", or the actual language name),
  "sensitivity": one of: "public", "internal", "confidential", "restricted" — assess based on:
    - "public" = press releases, published reports, public-facing documents
    - "internal" = general business documents, memos, meeting notes
    - "confidential" = contracts with NDAs, financial data, personal data, legal opinions
    - "restricted" = board-level decisions, M&A documents, security audits, highly sensitive personal data
  "in_force": one of: "in_force", "archival", "unknown" — assess based on:
    - "in_force" = currently active, binding, or effective. Look for: effective dates in present/future, no expiry mentioned, signed/executed status, current policies, active regulations, no superseding references
    - "archival" = historical, superseded, expired, or no longer binding. Look for: past expiry dates, "superseded by" references, old version numbers, historical records, revoked/repealed notices, outdated dates
    - "unknown" = cannot determine from content alone
  "suggested_status": one of: "draft", "in_review", "approved" — assess based on:
    - "draft" = incomplete documents, working drafts, unsigned versions, templates
    - "in_review" = documents awaiting signature, pending approval, circulated for comment
    - "approved" = signed documents, executed contracts, published/finalized reports, official filings
  "summary": a 1-sentence summary of the document (max 30 words)
}

Be precise with jurisdiction — look for country references, legal frameworks (GDPR=EU, CCPA=US, etc.), currency, language cues.
For tags, extract every meaningful business/legal/regulatory term. Be exhaustive — more tags means better search matching.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1200,
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

    // Process structured tags: flatten into a single deduplicated array
    let flatTags = [];
    let structuredTags = null;

    if (metadata.tags && typeof metadata.tags === "object" && !Array.isArray(metadata.tags)) {
      // New structured format
      structuredTags = {};
      for (const category of TAG_CATEGORIES) {
        if (Array.isArray(metadata.tags[category])) {
          const normalized = metadata.tags[category]
            .map((t) => String(t).toLowerCase().trim())
            .filter(Boolean);
          structuredTags[category] = normalized;
          flatTags.push(...normalized);
        } else {
          structuredTags[category] = [];
        }
      }
      flatTags = [...new Set(flatTags)]; // deduplicate
    } else if (Array.isArray(metadata.tags)) {
      // Fallback: old flat format
      flatTags = metadata.tags
        .map((t) => String(t).toLowerCase().trim())
        .filter(Boolean);
    }

    // Cap at 50 tags
    flatTags = flatTags.slice(0, 50);

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
      tags: flatTags,
      structured_tags: structuredTags,
      language: metadata.language || "other",
      sensitivity: VALID_SENSITIVITIES.includes(metadata.sensitivity)
        ? metadata.sensitivity
        : "internal",
      in_force: VALID_IN_FORCE.includes(metadata.in_force)
        ? metadata.in_force
        : "unknown",
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
      structured_tags: null,
      language: "other",
      sensitivity: "internal",
      in_force: "unknown",
      suggested_status: "draft",
      summary: null,
      tokenUsage: { input: 0, output: 0 },
      error: err.message,
    };
  }
}
