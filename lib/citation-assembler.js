/**
 * Citation assembler — builds evidence prompts, parses grounded citation responses,
 * and maps citation markers to character-level annotation spans.
 */

/**
 * @typedef {Object} CitationRecord
 * @property {number} chunkId
 * @property {number} documentId
 * @property {string} documentName
 * @property {number|null} page
 * @property {string} sentenceHit
 * @property {string} sentenceBefore
 * @property {string} sentenceAfter
 */

/**
 * @typedef {Object} Annotation
 * @property {number} start
 * @property {number} end
 * @property {number[]} citationIds
 */

/**
 * @typedef {Object} StructuredAnswer
 * @property {string} answerText
 * @property {Annotation[]} annotations
 * @property {CitationRecord[]} citations
 * @property {Array<{id: number, name: string}>} usedDocuments
 * @property {"high"|"medium"|"low"} confidence
 * @property {boolean} needsDisambiguation
 */

/**
 * Format retrieved chunks as tagged evidence blocks for the grounded system prompt.
 * @param {import('./case-retrieval').RetrievalResult[]} chunks
 * @returns {string}
 */
export function buildEvidencePrompt(chunks) {
  if (!chunks || chunks.length === 0) return "";

  return chunks
    .map((chunk) => {
      const page = chunk.pageNumber ?? "?";
      return `[CHUNK:${chunk.chunkId}|DOC:${chunk.documentId}|PAGE:${page}]\n${chunk.content}`;
    })
    .join("\n\n");
}

/**
 * Parse Claude's grounded citation JSON response, validate citations against
 * the retrieved set, resolve neighbor sentences, and compute annotation spans.
 * @param {string} rawText
 * @param {import('./case-retrieval').RetrievalResult[]} retrievedChunks
 * @returns {StructuredAnswer}
 */
export function parseCitationResponse(rawText, retrievedChunks) {
  const degraded = {
    answerText: rawText,
    annotations: [],
    citations: [],
    usedDocuments: [],
    confidence: "low",
    needsDisambiguation: false,
  };

  let parsed;
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return degraded;
  }

  if (!parsed || typeof parsed.answerText !== "string") {
    return degraded;
  }

  // Build lookup of valid chunk IDs
  const chunkMap = new Map();
  for (const chunk of retrievedChunks) {
    chunkMap.set(String(chunk.chunkId), chunk);
  }

  // Validate and build citations
  const rawCitations = parsed.citations || {};
  const validCitations = [];

  for (const [chunkIdStr, citData] of Object.entries(rawCitations)) {
    if (!chunkMap.has(chunkIdStr)) continue; // fabrication guard

    const chunk = chunkMap.get(chunkIdStr);
    const chunkId = Number(chunkIdStr);

    const neighbors = resolveNeighborSentences(
      chunk,
      citData?.sentenceHit || ""
    );

    validCitations.push({
      chunkId,
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      page: chunk.pageNumber,
      sentenceHit: citData?.sentenceHit || "",
      sentenceBefore: neighbors.sentenceBefore,
      sentenceAfter: neighbors.sentenceAfter,
    });
  }

  // Build set of valid chunk IDs for marker filtering
  const validChunkIds = new Set(validCitations.map((c) => String(c.chunkId)));

  // Parse [cit:X] markers, strip invalid ones, compute annotations
  let answerText = parsed.answerText;
  const annotations = [];
  const citPattern = /\[cit:(\d+)\]/g;

  // First pass: collect all marker positions and validate
  const markers = [];
  let match;
  while ((match = citPattern.exec(answerText)) !== null) {
    markers.push({
      fullMatch: match[0],
      chunkId: match[1],
      index: match.index,
      valid: validChunkIds.has(match[1]),
    });
  }

  // Strip ALL [cit:X] markers (valid and invalid) to produce clean text
  const cleanText = answerText.replace(/\[cit:\d+\]/g, "");

  // Group consecutive valid markers that annotate the same sentence.
  // Two valid markers are "consecutive" if the text between them (ignoring other
  // markers and whitespace) is empty — e.g. "[cit:1][cit:2]" or "[cit:1] [cit:2]".
  const validMarkers = markers.filter((m) => m.valid);
  const markerGroups = [];
  let currentGroup = null;

  for (let i = 0; i < validMarkers.length; i++) {
    const marker = validMarkers[i];

    if (currentGroup) {
      const prevEnd =
        currentGroup.lastMarker.index + currentGroup.lastMarker.fullMatch.length;
      const between = answerText
        .substring(prevEnd, marker.index)
        .replace(/\[cit:\d+\]/g, "")
        .trim();

      if (between === "") {
        // Consecutive — same sentence
        currentGroup.chunkIds.push(Number(marker.chunkId));
        currentGroup.lastMarker = marker;
        continue;
      }
    }

    // Start new group
    if (currentGroup) markerGroups.push(currentGroup);
    currentGroup = {
      chunkIds: [Number(marker.chunkId)],
      firstMarker: marker,
      lastMarker: marker,
    };
  }
  if (currentGroup) markerGroups.push(currentGroup);

  // Compute annotation positions in clean text.
  // For each marker group, find its position in clean text by stripping markers
  // from the original-text prefix up to that marker — the resulting length is
  // the exact offset in cleanText.
  for (const group of markerGroups) {
    const prefixWithMarkers = answerText.substring(0, group.firstMarker.index);
    const annotationEnd = prefixWithMarkers.replace(/\[cit:\d+\]/g, "").length;

    // Walk backwards to find sentence start (previous ". " / ".\n" / "? " etc.)
    const searchBack = cleanText.substring(0, annotationEnd);
    const lastSentenceEnd = Math.max(
      searchBack.lastIndexOf(". "),
      searchBack.lastIndexOf(".\n"),
      searchBack.lastIndexOf("?\n"),
      searchBack.lastIndexOf("? "),
      searchBack.lastIndexOf("!\n"),
      searchBack.lastIndexOf("! ")
    );
    const annotationStart = lastSentenceEnd >= 0 ? lastSentenceEnd + 2 : 0;

    if (annotationStart < annotationEnd) {
      annotations.push({
        start: annotationStart,
        end: annotationEnd,
        citationIds: group.chunkIds,
      });
    }
  }

  // Build usedDocuments (deduplicated)
  const docMap = new Map();
  for (const cit of validCitations) {
    if (!docMap.has(cit.documentId)) {
      docMap.set(cit.documentId, { id: cit.documentId, name: cit.documentName });
    }
  }

  return {
    answerText: cleanText,
    annotations,
    citations: validCitations,
    usedDocuments: Array.from(docMap.values()),
    confidence: "high",
    needsDisambiguation: false,
  };
}

/**
 * Resolve neighbor sentences from chunk's sentences array.
 * @param {import('./case-retrieval').RetrievalResult} chunk
 * @param {string} sentenceHit
 * @returns {{sentenceBefore: string, sentenceAfter: string}}
 */
export function resolveNeighborSentences(chunk, sentenceHit) {
  const empty = { sentenceBefore: "", sentenceAfter: "" };

  if (!chunk?.sentences || chunk.sentences.length === 0 || !sentenceHit) {
    return empty;
  }

  const sentences = chunk.sentences;
  const hitTrimmed = sentenceHit.trim().toLowerCase();

  if (!hitTrimmed) return empty;

  // Try exact match first
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentText = sentences[i].text.trim().toLowerCase();

    // Exact match
    if (sentText === hitTrimmed) {
      bestIdx = i;
      break;
    }

    // Containment match
    if (sentText.includes(hitTrimmed) || hitTrimmed.includes(sentText)) {
      const score = Math.min(sentText.length, hitTrimmed.length) /
        Math.max(sentText.length, hitTrimmed.length);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }

  // Fallback: substring overlap
  if (bestIdx === -1) {
    for (let i = 0; i < sentences.length; i++) {
      const sentText = sentences[i].text.trim().toLowerCase();
      // Check if first 40 chars match
      const prefix = hitTrimmed.substring(0, 40);
      if (sentText.includes(prefix) || prefix.includes(sentText.substring(0, 40))) {
        bestIdx = i;
        break;
      }
    }
  }

  if (bestIdx === -1) return empty;

  return {
    sentenceBefore: bestIdx > 0 ? sentences[bestIdx - 1].text : "",
    sentenceAfter: bestIdx < sentences.length - 1 ? sentences[bestIdx + 1].text : "",
  };
}

/**
 * Detect broad/high-risk queries that need expanded retrieval.
 * @param {string} query
 * @returns {boolean}
 */
export function isHighRiskQuery(query) {
  if (!query) return false;

  const patterns = [
    /list\s+all/i,
    /summarize/i,
    /all\s+deadlines/i,
    /all\s+references/i,
    /every\s+/i,
    /complete\s+list/i,
    /wymień\s+wszystk/i,
    /podsumuj/i,
    /wszystkie\s+termin/i,
    /wszystkie\s+odniesien/i,
    /pełn[aąy]\s+list/i,
    /zestawienie/i,
    /wymień/i,
    /podsumowanie/i,
  ];

  return patterns.some((p) => p.test(query));
}
