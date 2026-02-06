import Anthropic from "@anthropic-ai/sdk";

/**
 * Extract metadata from document text using Claude Haiku
 * Identifies doc_type, client, jurisdiction, tags, language, sensitivity
 * @param {string} text - Extracted document text (first ~2000 words used to save tokens)
 * @param {string} [apiKey] - Anthropic API key (defaults to env)
 * @returns {Promise<{doc_type: string, client: string|null, jurisdiction: string|null, tags: string[], language: string, sensitivity: string}>}
 */
export async function extractMetadata(text, apiKey = null) {
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  // Use only first ~2000 words to save tokens
  const words = text.split(/\s+/);
  const truncated = words.slice(0, 2000).join(" ");

  const systemPrompt = `Extract document metadata. Return ONLY valid JSON with these fields:
- doc_type: one of "contract","invoice","letter","report","application","policy","memo","minutes","form","other"
- client: client/counterparty name or null
- jurisdiction: "EU","US","UK","DE","PL","FR","ES","international" or null
- tags: array of 1-5 short keyword tags (lowercase)
- language: detected language ("English","Polish","German","French","Spanish","other")
- sensitivity: "public","internal","confidential","restricted"`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 512,
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

    // Parse JSON from response
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const metadata = JSON.parse(jsonText);

    // Validate and normalize fields
    const validDocTypes = [
      "contract", "invoice", "letter", "report", "application",
      "policy", "memo", "minutes", "form", "other",
    ];

    const validSensitivities = ["public", "internal", "confidential", "restricted"];

    return {
      doc_type: validDocTypes.includes(metadata.doc_type)
        ? metadata.doc_type
        : "other",
      client: metadata.client || null,
      jurisdiction: metadata.jurisdiction || null,
      tags: Array.isArray(metadata.tags)
        ? metadata.tags.map((t) => String(t).toLowerCase().trim()).slice(0, 5)
        : [],
      language: metadata.language || "other",
      sensitivity: validSensitivities.includes(metadata.sensitivity)
        ? metadata.sensitivity
        : "internal",
      // Return token usage for statistics
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
      client: null,
      jurisdiction: null,
      tags: [],
      language: "other",
      sensitivity: "internal",
      tokenUsage: { input: 0, output: 0 },
      error: err.message,
    };
  }
}
