import Anthropic from "@anthropic-ai/sdk";
import { searchDocuments } from "./search.js";
import { cosineSimilarity } from "./search.js";
import { getEmbedding, getEmbeddings, embeddingToBuffer, bufferToEmbedding } from "./embeddings.js";
import { getAllQaCardsWithEmbeddings } from "./db.js";

/**
 * Parse a questionnaire into individual questions.
 * Supports Excel (via xlsx), PDF/DOCX text, and pasted text.
 *
 * @param {string} text - Extracted text content (or raw Excel data)
 * @param {string} format - "text" | "excel"
 * @param {Buffer} [fileBuffer] - Raw file buffer for Excel parsing
 * @param {string} [apiKey] - Anthropic API key
 * @returns {Promise<{questions: Array<{number: number, text: string}>, tokenUsage: Object}>}
 */
export async function parseQuestionnaire(text, format = "text", fileBuffer = null, apiKey = null) {
  // For Excel files, parse the spreadsheet first
  if (format === "excel" && fileBuffer) {
    return parseExcelQuestionnaire(fileBuffer, apiKey);
  }

  // For text (PDF/DOCX/pasted), use Claude to split into questions
  return parseTextQuestionnaire(text, apiKey);
}

/**
 * Parse Excel file into questions
 */
async function parseExcelQuestionnaire(fileBuffer, apiKey = null) {
  // Dynamic import xlsx (ESM compatible)
  let XLSX;
  try {
    XLSX = await import("xlsx");
    // Handle default export
    if (XLSX.default) XLSX = XLSX.default;
  } catch (e) {
    throw new Error("xlsx package not installed. Run: npm install xlsx");
  }

  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON rows
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (!rows || rows.length === 0) {
    throw new Error("Excel file appears to be empty");
  }

  // Use Claude Haiku to identify which columns contain question numbers and question text
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  // Send first 10 rows as sample to Claude for structure identification
  const sampleRows = rows.slice(0, Math.min(10, rows.length));
  const sampleText = sampleRows.map((row, i) => `Row ${i}: ${JSON.stringify(row)}`).join("\n");

  const structureResponse = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 300,
    system: `You analyze spreadsheet data. Given sample rows, identify which column index (0-based) contains the question number and which contains the question text. Return ONLY valid JSON: {"number_col": N or null, "text_col": N, "header_row": N or null}. header_row is the index of the header row (if present) to skip.`,
    messages: [{ role: "user", content: `Identify question columns:\n${sampleText}` }],
  });

  let structureTokens = {
    input: structureResponse.usage?.input_tokens || 0,
    output: structureResponse.usage?.output_tokens || 0,
  };

  let structure;
  try {
    const jsonMatch = structureResponse.content[0]?.text.match(/\{[\s\S]*\}/);
    structure = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: assume first column is number, second is text
    structure = { number_col: 0, text_col: 1, header_row: 0 };
  }

  const startRow = (structure.header_row !== null && structure.header_row !== undefined) ? structure.header_row + 1 : 0;
  const textCol = structure.text_col || 1;
  const numCol = structure.number_col;

  const questions = [];
  let questionNum = 1;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const questionText = String(row[textCol] || "").trim();
    if (!questionText || questionText.length < 5) continue;

    const num = numCol !== null && numCol !== undefined ? (parseInt(row[numCol]) || questionNum) : questionNum;
    questions.push({ number: num, text: questionText });
    questionNum++;
  }

  return {
    questions,
    tokenUsage: {
      input: structureTokens.input,
      output: structureTokens.output,
      total: structureTokens.input + structureTokens.output,
      model: "haiku",
    },
  };
}

/**
 * Parse text (from PDF/DOCX/paste) into questions using Claude
 */
async function parseTextQuestionnaire(text, apiKey = null) {
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  // Use up to ~4000 words
  const words = text.split(/\s+/);
  const truncated = words.slice(0, 4000).join(" ");

  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 4096,
    system: `You extract individual questions from questionnaire documents. Return ONLY valid JSON array (no markdown):
[
  {"number": 1, "text": "The full question text here"},
  {"number": 2, "text": "Next question..."}
]

Guidelines:
- Extract EVERY question or information request, including sub-questions (1a, 1b, etc.)
- Preserve the original numbering scheme if present
- Keep the full question text as-is, don't summarize
- Ignore headers, instructions, and non-question text
- If there are no clear questions, treat each substantive paragraph as a request`,
    messages: [{ role: "user", content: `Extract all questions from this questionnaire:\n\n${truncated}` }],
  });

  const responseText = response.content[0]?.text || "";
  const tokenUsage = {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0,
    total: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    model: "haiku",
  };

  let questions;
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      questions = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON array found");
    }
  } catch {
    // Fallback: split by numbered lines
    questions = text
      .split(/\n/)
      .filter(line => /^\d+[\.\)]\s/.test(line.trim()))
      .map((line, i) => ({
        number: i + 1,
        text: line.replace(/^\d+[\.\)]\s*/, "").trim(),
      }));
  }

  return { questions, tokenUsage };
}

/**
 * Match questions against existing QA cards for auto-fill.
 * Uses semantic similarity of question embeddings.
 *
 * @param {Array<{number: number, text: string}>} questions
 * @returns {Promise<{matches: Array<{questionIndex: number, cardId: number, similarity: number, card: Object}|null>, voyageTokens: number}>}
 */
export async function matchExistingCards(questions) {
  const existingCards = getAllQaCardsWithEmbeddings();
  if (!existingCards || existingCards.length === 0) {
    return { matches: questions.map(() => null), voyageTokens: 0 };
  }

  // Get embeddings for all questions
  const questionTexts = questions.map(q => q.text);
  const questionEmbeddings = await getEmbeddings(questionTexts);

  // Estimate Voyage tokens
  const voyageTokens = questionTexts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);

  // Prepare card embeddings
  const cardEmbeddings = existingCards.map(card => {
    if (card.question_embedding) {
      return bufferToEmbedding(card.question_embedding);
    }
    return null;
  }).filter(Boolean);

  const cardIndexMap = existingCards
    .map((card, i) => card.question_embedding ? i : -1)
    .filter(i => i !== -1);

  const matches = [];
  const SIMILARITY_THRESHOLD = 0.90;

  for (let qi = 0; qi < questions.length; qi++) {
    const qEmb = questionEmbeddings[qi];
    if (!qEmb) {
      matches.push(null);
      continue;
    }

    let bestSimilarity = 0;
    let bestCardIdx = -1;

    for (let ci = 0; ci < cardEmbeddings.length; ci++) {
      const sim = cosineSimilarity(qEmb, cardEmbeddings[ci]);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestCardIdx = cardIndexMap[ci];
      }
    }

    if (bestSimilarity >= SIMILARITY_THRESHOLD && bestCardIdx >= 0) {
      const card = existingCards[bestCardIdx];
      matches.push({
        questionIndex: qi,
        cardId: card.id,
        similarity: Math.round(bestSimilarity * 100),
        card: {
          id: card.id,
          questionText: card.question_text,
          approvedAnswer: card.approved_answer,
          evidenceJson: card.evidence_json,
        },
      });
    } else {
      matches.push(null);
    }
  }

  return { matches, voyageTokens };
}

/**
 * Draft answers for questions that weren't matched to existing cards.
 * Searches library documents and uses Claude to generate answers.
 *
 * @param {Array<{number: number, text: string}>} questions - Questions needing answers
 * @param {number[]} libraryDocIds - Library document IDs to search
 * @param {string} [apiKey] - Anthropic API key
 * @returns {Promise<{drafts: Array<{questionIndex: number, answer: string, evidence: Object[], confidence: string}>, tokenUsage: Object}>}
 */
export async function draftAnswers(questions, libraryDocIds, apiKey = null) {
  if (!questions || questions.length === 0) {
    return { drafts: [], tokenUsage: { input: 0, output: 0, total: 0, model: "sonnet", voyageTokens: 0 } };
  }

  // Search library for each question and collect evidence
  const questionsWithEvidence = [];
  let voyageTokens = 0;

  for (const q of questions) {
    const searchResults = await searchDocuments(q.text, {
      documentIds: libraryDocIds.length > 0 ? libraryDocIds : [],
      topK: 3,
    });

    voyageTokens += Math.ceil(q.text.length / 4);

    const evidence = searchResults.map(r => ({
      documentId: r.documentId,
      documentName: r.documentName,
      chunkContent: r.content.substring(0, 500),
      relevance: Math.round(r.score * 100),
    }));

    questionsWithEvidence.push({
      number: q.number,
      text: q.text,
      evidence,
    });
  }

  // Build context for Claude
  const anthropic = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });

  const questionsContext = questionsWithEvidence.map(q => {
    const evidenceText = q.evidence.length > 0
      ? q.evidence.map((e, i) => `  Evidence ${i + 1} (from "${e.documentName}", ${e.relevance}% match):\n  ${e.chunkContent}`).join("\n\n")
      : "  No relevant evidence found in library.";

    return `Question ${q.number}: ${q.text}\n\nAvailable evidence:\n${evidenceText}`;
  }).join("\n\n===\n\n");

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: `You are a compliance document analyst drafting answers to questionnaire questions. For each question, draft a concise, professional answer using ONLY the provided evidence.

Return ONLY valid JSON array (no markdown):
[
  {
    "question_number": 1,
    "answer": "Your drafted answer here. Be specific and reference the source documents.",
    "confidence": "high|medium|low"
  }
]

Confidence levels:
- high: Evidence directly and fully answers the question
- medium: Evidence partially answers but some aspects aren't covered
- low: Little or no relevant evidence found, answer is speculative

If no evidence is found, still provide a placeholder answer noting what information would be needed.`,
    messages: [{ role: "user", content: `Draft answers for these questions:\n\n${questionsContext}` }],
  });

  const responseText = response.content[0]?.text || "";
  const tokenUsage = {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0,
    total: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    model: "sonnet",
    voyageTokens,
  };

  let drafts;
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      drafts = questionsWithEvidence.map((q, i) => {
        const draft = parsed.find(d => d.question_number === q.number) || parsed[i];
        return {
          questionIndex: i,
          answer: draft?.answer || "Unable to draft answer — insufficient evidence.",
          evidence: q.evidence,
          confidence: ["high", "medium", "low"].includes(draft?.confidence) ? draft.confidence : "low",
        };
      });
    } else {
      throw new Error("No JSON array found");
    }
  } catch {
    // Fallback: create low-confidence drafts
    drafts = questionsWithEvidence.map((q, i) => ({
      questionIndex: i,
      answer: "Unable to draft answer — AI response parsing failed. Please review the evidence and draft manually.",
      evidence: q.evidence,
      confidence: "low",
    }));
  }

  return { drafts, tokenUsage };
}
