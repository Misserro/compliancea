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

  try {
    const systemPrompt = await readFile(
      join(process.cwd(), "prompts/auto-tagger.md"),
      "utf-8"
    );

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
        ? metadata.summary.slice(0, 350)
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
