import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";

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

// Safety threshold: documents longer than this are tagged in 3 sections.
// 140,000 words ≈ 185,000 tokens — safely within Haiku 4.5's 200K context.
const SINGLE_PASS_WORD_LIMIT = 140000;

/**
 * Extract rich metadata from document text using Claude Haiku 4.5.
 * Reads the ENTIRE document. For very long documents (>140K words),
 * tags three sections independently and merges the results.
 *
 * @param {string} text - Full extracted document text
 * @param {string} [apiKey] - Anthropic API key (defaults to env)
 * @returns {Promise<Object>} - Extracted metadata with tokenUsage
 */
export async function extractMetadata(text, apiKey = null) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length > SINGLE_PASS_WORD_LIMIT) {
    return extractMetadataChunked(words, apiKey);
  }

  return extractMetadataSinglePass(text, apiKey);
}

/**
 * For very long documents: tag beginning, middle, and end separately,
 * then merge tags. Primary metadata (doc_type, category, etc.) comes
 * from the first section since titles and scope appear at the start.
 */
async function extractMetadataChunked(words, apiKey) {
  const total = words.length;
  const third = Math.floor(total / 3);

  const sections = [
    words.slice(0, third).join(" "),
    words.slice(third, 2 * third).join(" "),
    words.slice(2 * third).join(" "),
  ];

  const results = await Promise.all(
    sections.map((s) => extractMetadataSinglePass(s, apiKey))
  );

  // Primary metadata from first section (document beginning has title, parties, scope)
  const primary = results.find((r) => !r.error) ?? results[0];
  const allFailed = results.every((r) => r.error);

  // Merge tags across all sections
  const allFlatTags = [...new Set(results.flatMap((r) => r.tags))].slice(0, 100);

  const mergedStructured = {};
  for (const category of TAG_CATEGORIES) {
    const merged = new Set(results.flatMap((r) => r.structured_tags?.[category] ?? []));
    mergedStructured[category] = [...merged].slice(0, 20);
  }

  const { error: _ignored, ...primaryWithoutError } = primary;

  return {
    ...primaryWithoutError,
    tags: allFlatTags,
    structured_tags: mergedStructured,
    tokenUsage: {
      input: results.reduce((sum, r) => sum + r.tokenUsage.input, 0),
      output: results.reduce((sum, r) => sum + r.tokenUsage.output, 0),
    },
    ...(allFailed && { error: results[0].error }),
  };
}

/**
 * Single-pass metadata extraction — sends the full text to the model.
 */
async function extractMetadataSinglePass(text, apiKey) {
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  try {
    const systemPrompt = await readFile(
      join(process.cwd(), "prompts/auto-tagger.md"),
      "utf-8"
    );

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: text,
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
      // Structured format
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

    // Cap at 100 tags
    flatTags = flatTags.slice(0, 100);

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
        ? metadata.summary.slice(0, 350)
        : null,
      tokenUsage: {
        input: message.usage?.input_tokens || 0,
        output: message.usage?.output_tokens || 0,
      },
    };
  } catch (err) {
    console.error("Auto-tagger error:", err.message);
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
