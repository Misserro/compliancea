/**
 * Split text into chunks of approximately targetWords words with overlap
 * @param {string} text - Text to split
 * @param {number} targetWords - Target words per chunk (default 500)
 * @param {number} overlapWords - Words to overlap between chunks (default 50)
 * @returns {{content: string, wordCount: number}[]} - Array of chunks with their word counts
 */
export function chunkText(text, targetWords = 500, overlapWords = 50) {
  if (!text || typeof text !== "string") {
    return [];
  }

  // Normalize whitespace and trim
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return [];
  }

  // Split into paragraphs first (preserve some structure)
  const paragraphs = normalizedText.split(/\n\s*\n|\r\n\s*\r\n/).filter(Boolean);

  // If no paragraph breaks, split on sentences or just use the text
  const segments =
    paragraphs.length > 1 ? paragraphs : splitIntoSentences(normalizedText);

  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;

  for (const segment of segments) {
    const segmentWords = segment.trim().split(/\s+/);
    const segmentWordCount = segmentWords.length;

    // If adding this segment would exceed target and we have content, finalize chunk
    if (currentWordCount + segmentWordCount > targetWords && currentWordCount > 0) {
      // Finalize current chunk
      const chunkContent = currentChunk.join(" ");
      chunks.push({
        content: chunkContent,
        wordCount: currentWordCount,
      });

      // Start new chunk with overlap from end of current chunk
      const overlapContent = getOverlapFromEnd(currentChunk.join(" "), overlapWords);
      currentChunk = overlapContent ? [overlapContent] : [];
      currentWordCount = overlapContent ? overlapContent.split(/\s+/).length : 0;
    }

    // Add segment to current chunk
    currentChunk.push(segment.trim());
    currentWordCount += segmentWordCount;

    // If a single segment exceeds target significantly, split it
    if (segmentWordCount > targetWords * 1.5) {
      const splitSegments = splitLongSegment(segment, targetWords, overlapWords);
      // Replace current chunk with split segments
      currentChunk = [];
      currentWordCount = 0;

      for (const splitSeg of splitSegments) {
        chunks.push(splitSeg);
      }
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0 && currentWordCount > 0) {
    const chunkContent = currentChunk.join(" ");
    chunks.push({
      content: chunkContent,
      wordCount: currentWordCount,
    });
  }

  // Filter out very small chunks (less than 20 words) unless it's the only chunk
  if (chunks.length > 1) {
    return chunks.filter((chunk) => chunk.wordCount >= 20);
  }

  return chunks;
}

/**
 * Split text into sentences
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoSentences(text) {
  // Simple sentence splitting - handles common cases
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return sentences.filter((s) => s.trim().length > 0);
}

/**
 * Get overlap words from the end of text
 * @param {string} text
 * @param {number} overlapWords
 * @returns {string}
 */
function getOverlapFromEnd(text, overlapWords) {
  const words = text.trim().split(/\s+/);
  if (words.length <= overlapWords) {
    return "";
  }
  return words.slice(-overlapWords).join(" ");
}

/**
 * Split a long segment into smaller chunks
 * @param {string} segment
 * @param {number} targetWords
 * @param {number} overlapWords
 * @returns {{content: string, wordCount: number}[]}
 */
function splitLongSegment(segment, targetWords, overlapWords) {
  const words = segment.trim().split(/\s+/);
  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + targetWords, words.length);
    const chunkWords = words.slice(start, end);
    const content = chunkWords.join(" ");

    chunks.push({
      content,
      wordCount: chunkWords.length,
    });

    // Move start forward, accounting for overlap
    start = end - overlapWords;

    // Prevent infinite loop if overlap is too large
    if (start <= chunks.length * (targetWords - overlapWords) - targetWords) {
      start = end;
    }
  }

  return chunks;
}

/**
 * Split page-separated text into page-aware, sentence-segmented chunks.
 * Each chunk stays within a single page (no cross-page chunks).
 *
 * @param {{pageNumber: number, text: string}[]} pages - Per-page text from pdf-parse
 * @param {number} targetWords - Target words per chunk (default 500)
 * @param {number} overlapWords - Words to overlap between chunks within a page (default 50)
 * @returns {{content: string, pageNumber: number, charOffsetStart: number, charOffsetEnd: number, sectionTitle: string|null, sentences: {text: string, charStart: number, charEnd: number}[]}[]}
 */
export function chunkTextByPages(pages, targetWords = 500, overlapWords = 50) {
  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return [];
  }

  const allChunks = [];

  for (const page of pages) {
    const pageNum = page.pageNumber;
    const rawText = page.text;

    if (!rawText || typeof rawText !== "string") {
      continue;
    }

    const trimmedText = rawText.trim();
    if (!trimmedText) {
      continue;
    }

    // Use existing chunkText logic to split page content into chunks
    const pageChunks = chunkText(trimmedText, targetWords, overlapWords);

    // For short pages that chunkText filters out (< 20 words), create a single chunk
    if (pageChunks.length === 0 && trimmedText.length > 0) {
      pageChunks.push({
        content: trimmedText.replace(/\s+/g, " ").trim(),
        wordCount: trimmedText.split(/\s+/).length,
      });
    }

    for (const chunk of pageChunks) {
      // Compute character offsets relative to the original page text
      const charOffsetStart = trimmedText.indexOf(chunk.content.substring(0, 50));
      const charOffsetEnd = charOffsetStart >= 0
        ? charOffsetStart + chunk.content.length
        : chunk.content.length;

      // Detect section title from the first line
      const sectionTitle = detectSectionTitle(chunk.content);

      // Build sentence array with character offsets relative to chunk content
      const sentences = buildSentences(chunk.content);

      allChunks.push({
        content: chunk.content,
        pageNumber: pageNum,
        charOffsetStart: Math.max(0, charOffsetStart),
        charOffsetEnd,
        sectionTitle,
        sentences,
      });
    }
  }

  return allChunks;
}

/**
 * Detect if the first line of a chunk looks like a section heading.
 * @param {string} text
 * @returns {string|null}
 */
function detectSectionTitle(text) {
  const firstLine = text.split(/\n/)[0]?.trim();
  if (!firstLine) return null;

  const words = firstLine.split(/\s+/);
  // Short line (< 10 words) that is all caps, or ends with colon (no period)
  if (words.length <= 10) {
    const isAllCaps = firstLine === firstLine.toUpperCase() && /[A-Z]/.test(firstLine);
    const endsWithColon = firstLine.endsWith(":") && !firstLine.endsWith(".");
    if (isAllCaps || endsWithColon) {
      return firstLine;
    }
  }
  return null;
}

/**
 * Build sentence array with character offsets relative to chunk content.
 * @param {string} content
 * @returns {{text: string, charStart: number, charEnd: number}[]}
 */
function buildSentences(content) {
  const sentenceTexts = splitIntoSentences(content);
  const sentences = [];
  let searchFrom = 0;

  for (const sentenceText of sentenceTexts) {
    const trimmed = sentenceText.trim();
    if (!trimmed) continue;

    const charStart = content.indexOf(trimmed, searchFrom);
    if (charStart >= 0) {
      sentences.push({
        text: trimmed,
        charStart,
        charEnd: charStart + trimmed.length,
      });
      searchFrom = charStart + trimmed.length;
    } else {
      // Fallback: append at current position
      sentences.push({
        text: trimmed,
        charStart: searchFrom,
        charEnd: searchFrom + trimmed.length,
      });
      searchFrom += trimmed.length;
    }
  }

  return sentences;
}

/**
 * Count words in text
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (!text || typeof text !== "string") {
    return 0;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
