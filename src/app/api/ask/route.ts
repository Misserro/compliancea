import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById } from "@/lib/db-imports";
import { getSettings } from "@/lib/settings-imports";
import { searchDocuments, formatSearchResultsForCitations, getSourceDocuments, extractQueryTags, scoreDocumentsByTags } from "@/lib/search-imports";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  await ensureDb();

  let inputTokens = 0;
  let outputTokens = 0;
  let voyageTokens = 0;

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
    }

    const settings = getSettings();
    const body = await request.json();
    const { question, documentIds, topK = 5 } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    // Estimate Voyage tokens for question embedding
    voyageTokens = Math.ceil(question.length / 4);

    // Stage 1: Tag-based pre-filtering (only when no specific documents selected)
    let targetDocumentIds = documentIds || [];
    let tagPreFilterUsed = false;

    if (targetDocumentIds.length === 0) {
      try {
        const queryTagResult = await extractQueryTags(question);
        const tagMatchedIds = scoreDocumentsByTags(queryTagResult.tags, 15);
        if (tagMatchedIds.length > 0) {
          targetDocumentIds = tagMatchedIds;
          tagPreFilterUsed = true;
          console.log(`Tag pre-filter: query tags=${queryTagResult.tags.join(", ")} → ${tagMatchedIds.length} candidate docs`);
        }
        inputTokens += queryTagResult.tokenUsage.input;
        outputTokens += queryTagResult.tokenUsage.output;
      } catch (tagErr: unknown) {
        const msg = tagErr instanceof Error ? tagErr.message : "Unknown error";
        console.warn("Tag pre-filtering failed, falling back to full search:", msg);
      }
    }

    // Stage 2: Semantic search
    let searchResults = await searchDocuments(question, targetDocumentIds, topK);

    // Apply relevance threshold if enabled
    if (settings.useRelevanceThreshold && searchResults.length > 0) {
      const threshold = settings.relevanceThresholdValue;
      const minResults = settings.minResultsGuarantee;

      const filteredResults = searchResults.filter((r: { score: number }) => r.score >= threshold);

      if (filteredResults.length >= minResults) {
        searchResults = filteredResults;
      } else {
        searchResults = searchResults.slice(0, Math.max(minResults, filteredResults.length));
      }
    }

    if (searchResults.length === 0) {
      return NextResponse.json({
        answer: "I couldn't find any relevant information in the selected documents to answer your question.",
        sources: [],
        tokenUsage: {
          claude: { input: 0, output: 0, total: 0 },
          voyage: { tokens: voyageTokens },
        },
      });
    }

    // Format context for Claude
    const contextText = formatSearchResultsForCitations(searchResults, new Map());
    const sources = getSourceDocuments(searchResults);

    // Build prompt for Claude
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

    const systemPrompt = `You are a document analysis assistant. Answer questions using ONLY the provided document excerpts. When referring to information, mention the document name naturally in your answer (e.g. "The Sanction Screening Policy states that..." or "According to the AML Procedures Manual..."). Be concise but thorough. If context is insufficient, say so.`;

    const userPrompt = `Context:\n${contextText}\n\nQuestion: ${question}`;

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    inputTokens += message.usage?.input_tokens || 0;
    outputTokens += message.usage?.output_tokens || 0;

    const answer = message.content
      .filter((block) => block.type === "text")
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
      .join("");

    return NextResponse.json({
      answer,
      tagPreFilterUsed,
      sources: sources.map((s: { documentId: number; documentName: string; maxScore: number }) => {
        const doc = getDocumentById(s.documentId) as Record<string, unknown> | null;
        return {
          documentId: s.documentId,
          documentName: s.documentName,
          relevance: Math.round(s.maxScore * 100),
          docType: (doc?.doc_type as string) || null,
          category: (doc?.category as string) || null,
        };
      }),
      tokenUsage: {
        claude: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
          model: "sonnet",
        },
        voyage: {
          tokens: voyageTokens,
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
