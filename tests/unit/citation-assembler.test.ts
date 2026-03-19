/**
 * Unit tests for lib/citation-assembler.js
 */
import { describe, it, expect } from "vitest";
// @ts-ignore — .js file without matching .d.ts visible to vitest
import {
  parseCitationResponse,
  resolveNeighborSentences,
  isHighRiskQuery,
} from "../../lib/citation-assembler.js";

// Helper to build a mock retrieved chunk
function makeChunk(
  chunkId: number,
  documentId: number,
  documentName: string,
  pageNumber: number,
  content: string,
  sentences: { text: string; charStart: number; charEnd: number }[]
) {
  return {
    chunkId,
    documentId,
    documentName,
    pageNumber,
    content,
    sectionTitle: null,
    sentences,
    score: 0.9,
    bm25Rank: 1,
    vectorRank: 1,
    rrfScore: 0.5,
    rerankScore: 0.9,
  };
}

const sampleChunks = [
  makeChunk(100, 1, "Contract.pdf", 3, "The deadline is March 30th. All parties must comply. Penalties apply for late submission.", [
    { text: "The deadline is March 30th.", charStart: 0, charEnd: 27 },
    { text: "All parties must comply.", charStart: 28, charEnd: 52 },
    { text: "Penalties apply for late submission.", charStart: 53, charEnd: 88 },
  ]),
  makeChunk(200, 2, "Agreement.pdf", 5, "The claim value is 50000 PLN. Payment is due within 14 days.", [
    { text: "The claim value is 50000 PLN.", charStart: 0, charEnd: 29 },
    { text: "Payment is due within 14 days.", charStart: 30, charEnd: 60 },
  ]),
];

describe("parseCitationResponse", () => {
  it("valid [cit:X] markers map to correct character offsets in answerText", () => {
    const rawJson = JSON.stringify({
      answerText: "The deadline is March 30th.[cit:100] The claim value is 50000 PLN.[cit:200]",
      citations: {
        "100": { sentenceHit: "The deadline is March 30th.", documentId: 1, documentName: "Contract.pdf", page: 3 },
        "200": { sentenceHit: "The claim value is 50000 PLN.", documentId: 2, documentName: "Agreement.pdf", page: 5 },
      },
    });

    const result = parseCitationResponse(rawJson, sampleChunks);

    // answerText should have markers stripped
    expect(result.answerText).not.toContain("[cit:");
    expect(result.answerText).toContain("The deadline is March 30th.");
    expect(result.answerText).toContain("The claim value is 50000 PLN.");

    // Should have 2 valid citations
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].chunkId).toBe(100);
    expect(result.citations[1].chunkId).toBe(200);

    // Annotations should exist and have valid offsets
    expect(result.annotations.length).toBeGreaterThan(0);
    for (const ann of result.annotations) {
      expect(ann.start).toBeGreaterThanOrEqual(0);
      expect(ann.end).toBeGreaterThan(ann.start);
      expect(ann.end).toBeLessThanOrEqual(result.answerText.length);
      expect(ann.citationIds.length).toBeGreaterThan(0);
    }
  });

  it("[cit:X] where X is not in retrieved chunks is stripped (fabrication guard)", () => {
    const rawJson = JSON.stringify({
      answerText: "Some answer text.[cit:999] More text.[cit:100]",
      citations: {
        "999": { sentenceHit: "Fabricated.", documentId: 99, documentName: "Fake.pdf", page: 1 },
        "100": { sentenceHit: "The deadline is March 30th.", documentId: 1, documentName: "Contract.pdf", page: 3 },
      },
    });

    const result = parseCitationResponse(rawJson, sampleChunks);

    // Chunk 999 is not in sampleChunks — should be stripped
    expect(result.citations.find((c: any) => c.chunkId === 999)).toBeUndefined();
    // Chunk 100 is valid — should be present
    expect(result.citations.find((c: any) => c.chunkId === 100)).toBeDefined();
    // answerText should not contain any [cit:] markers
    expect(result.answerText).not.toContain("[cit:");
  });

  it("returns degraded response on invalid JSON", () => {
    const result = parseCitationResponse("not valid json {{{", sampleChunks);
    expect(result.confidence).toBe("low");
    expect(result.answerText).toBe("not valid json {{{");
    expect(result.citations).toEqual([]);
    expect(result.annotations).toEqual([]);
  });

  it("returns degraded response when answerText is missing", () => {
    const rawJson = JSON.stringify({ citations: {} });
    const result = parseCitationResponse(rawJson, sampleChunks);
    expect(result.confidence).toBe("low");
  });

  it("handles JSON wrapped in markdown code fences", () => {
    const wrapped = "```json\n" + JSON.stringify({
      answerText: "Answer.[cit:100]",
      citations: { "100": { sentenceHit: "The deadline is March 30th." } },
    }) + "\n```";

    const result = parseCitationResponse(wrapped, sampleChunks);
    expect(result.answerText).toBe("Answer.");
    expect(result.citations.length).toBe(1);
  });

  it("usedDocuments are deduplicated", () => {
    const rawJson = JSON.stringify({
      answerText: "First.[cit:100] Second.[cit:200]",
      citations: {
        "100": { sentenceHit: "The deadline is March 30th." },
        "200": { sentenceHit: "The claim value is 50000 PLN." },
      },
    });

    const result = parseCitationResponse(rawJson, sampleChunks);
    expect(result.usedDocuments.length).toBe(2);
    const docIds = result.usedDocuments.map((d: any) => d.id);
    expect(docIds).toContain(1);
    expect(docIds).toContain(2);
  });
});

describe("resolveNeighborSentences", () => {
  it("returns sentenceBefore and sentenceAfter for middle sentence", () => {
    const chunk = sampleChunks[0]; // 3 sentences
    const result = resolveNeighborSentences(chunk, "All parties must comply.");
    expect(result.sentenceBefore).toBe("The deadline is March 30th.");
    expect(result.sentenceAfter).toBe("Penalties apply for late submission.");
  });

  it("first sentence has empty sentenceBefore", () => {
    const chunk = sampleChunks[0];
    const result = resolveNeighborSentences(chunk, "The deadline is March 30th.");
    expect(result.sentenceBefore).toBe("");
    expect(result.sentenceAfter).toBe("All parties must comply.");
  });

  it("last sentence has empty sentenceAfter", () => {
    const chunk = sampleChunks[0];
    const result = resolveNeighborSentences(chunk, "Penalties apply for late submission.");
    expect(result.sentenceBefore).toBe("All parties must comply.");
    expect(result.sentenceAfter).toBe("");
  });

  it("1-sentence chunk returns empty before and after", () => {
    const singleSentenceChunk = makeChunk(300, 1, "Doc.pdf", 1, "Only one sentence here.", [
      { text: "Only one sentence here.", charStart: 0, charEnd: 23 },
    ]);
    const result = resolveNeighborSentences(singleSentenceChunk, "Only one sentence here.");
    expect(result.sentenceBefore).toBe("");
    expect(result.sentenceAfter).toBe("");
  });

  it("returns empty when chunk has no sentences", () => {
    const noSentencesChunk = { ...sampleChunks[0], sentences: [] };
    const result = resolveNeighborSentences(noSentencesChunk, "anything");
    expect(result.sentenceBefore).toBe("");
    expect(result.sentenceAfter).toBe("");
  });

  it("returns empty when sentenceHit is empty", () => {
    const result = resolveNeighborSentences(sampleChunks[0], "");
    expect(result.sentenceBefore).toBe("");
    expect(result.sentenceAfter).toBe("");
  });
});

describe("isHighRiskQuery", () => {
  it("'list all deadlines' -> true", () => {
    expect(isHighRiskQuery("list all deadlines")).toBe(true);
  });

  it("'List all references to damages' -> true", () => {
    expect(isHighRiskQuery("List all references to damages")).toBe(true);
  });

  it("'summarize the contract' -> true", () => {
    expect(isHighRiskQuery("summarize the contract")).toBe(true);
  });

  it("'what is the claim value?' -> false", () => {
    expect(isHighRiskQuery("what is the claim value?")).toBe(false);
  });

  it("'who is the plaintiff?' -> false", () => {
    expect(isHighRiskQuery("who is the plaintiff?")).toBe(false);
  });

  it("Polish: 'wymien wszystkie terminy' -> true", () => {
    expect(isHighRiskQuery("wymień wszystkie terminy")).toBe(true);
  });

  it("Polish: 'podsumuj umowe' -> true", () => {
    expect(isHighRiskQuery("podsumuj umowę")).toBe(true);
  });

  it("returns false for null/empty", () => {
    expect(isHighRiskQuery(null)).toBe(false);
    expect(isHighRiskQuery("")).toBe(false);
  });
});
