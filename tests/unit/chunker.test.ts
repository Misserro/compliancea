/**
 * Unit tests for lib/chunker.js — chunkTextByPages
 */
import { describe, it, expect } from "vitest";
// @ts-ignore — .js file without matching .d.ts visible to vitest
import { chunkTextByPages } from "../../lib/chunker.js";

describe("chunkTextByPages", () => {
  it("returns empty array for null/undefined/empty input", () => {
    expect(chunkTextByPages(null)).toEqual([]);
    expect(chunkTextByPages(undefined)).toEqual([]);
    expect(chunkTextByPages([])).toEqual([]);
  });

  it("single-page document — all chunks have pageNumber = 1", () => {
    const pages = [
      {
        pageNumber: 1,
        text: "This is a test sentence for the chunker. It should produce at least one chunk with the correct page number assigned to it. The text needs to be long enough to not be considered empty but can be relatively short for testing purposes.",
      },
    ];
    const chunks = chunkTextByPages(pages);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.pageNumber).toBe(1);
    }
  });

  it("multi-page document — no chunk crosses page boundary", () => {
    const pages = [
      {
        pageNumber: 1,
        text: "Page one content. This is the first page of the document with some legal text about contracts and obligations that need to be fulfilled by the parties involved.",
      },
      {
        pageNumber: 2,
        text: "Page two content. This is the second page with different content about deadlines and compliance requirements that must be met before the end of the quarter.",
      },
      {
        pageNumber: 3,
        text: "Page three content. The final page discusses remedies and penalties for non-compliance with the terms outlined in the previous sections of this agreement.",
      },
    ];
    const chunks = chunkTextByPages(pages);
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    // Each chunk belongs to exactly one page
    const pageNumbers = new Set(chunks.map((c: any) => c.pageNumber));
    expect(pageNumbers.size).toBeGreaterThanOrEqual(1);

    for (const chunk of chunks) {
      expect([1, 2, 3]).toContain(chunk.pageNumber);
    }

    // Verify page 1 chunks don't contain page 2 content and vice versa
    const page1Chunks = chunks.filter((c: any) => c.pageNumber === 1);
    const page2Chunks = chunks.filter((c: any) => c.pageNumber === 2);
    for (const c of page1Chunks) {
      expect(c.content).not.toContain("Page two content");
    }
    for (const c of page2Chunks) {
      expect(c.content).not.toContain("Page one content");
    }
  });

  it("sentences[] entries are substrings of content", () => {
    const pages = [
      {
        pageNumber: 1,
        text: "The contract was signed on January 15th. All parties agreed to the terms. The deadline for compliance is March 30th.",
      },
    ];
    const chunks = chunkTextByPages(pages);
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      expect(Array.isArray(chunk.sentences)).toBe(true);
      for (const sentence of chunk.sentences) {
        expect(chunk.content).toContain(sentence.text);
        expect(typeof sentence.charStart).toBe("number");
        expect(typeof sentence.charEnd).toBe("number");
        expect(sentence.charEnd).toBeGreaterThan(sentence.charStart);
      }
    }
  });

  it("short page (< 20 words) — produces 1 chunk, not filtered out", () => {
    const pages = [
      {
        pageNumber: 1,
        text: "Short page with few words.",
      },
    ];
    const chunks = chunkTextByPages(pages);
    expect(chunks.length).toBe(1);
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks[0].content).toContain("Short page");
  });

  it("empty page text — handled gracefully (no crash)", () => {
    const pages = [
      { pageNumber: 1, text: "" },
      { pageNumber: 2, text: "   " },
      { pageNumber: 3, text: null },
    ];
    expect(() => chunkTextByPages(pages)).not.toThrow();
    const chunks = chunkTextByPages(pages);
    // Empty/whitespace-only pages should produce no chunks
    expect(chunks.length).toBe(0);
  });

  it("mixed pages — empty page between content pages does not disrupt numbering", () => {
    const pages = [
      {
        pageNumber: 1,
        text: "First page has meaningful content about the legal dispute between the two companies regarding intellectual property rights.",
      },
      { pageNumber: 2, text: "" },
      {
        pageNumber: 3,
        text: "Third page resumes with content about the proposed settlement and the terms that both parties have tentatively agreed upon.",
      },
    ];
    const chunks = chunkTextByPages(pages);
    const pageNums = chunks.map((c: any) => c.pageNumber);
    expect(pageNums).not.toContain(2);
    expect(pageNums).toContain(1);
    expect(pageNums).toContain(3);
  });

  it("charOffsetStart and charOffsetEnd are non-negative numbers", () => {
    const pages = [
      {
        pageNumber: 1,
        text: "This document contains important information. It must be processed correctly by the chunker module.",
      },
    ];
    const chunks = chunkTextByPages(pages);
    for (const chunk of chunks) {
      expect(chunk.charOffsetStart).toBeGreaterThanOrEqual(0);
      expect(chunk.charOffsetEnd).toBeGreaterThan(0);
    }
  });
});
