/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-expect-error - JS module without type definitions
export {
  cosineSimilarity,
  searchDocuments,
  formatSearchResults,
  formatSearchResultsForCitations,
  getSourceDocuments,
  extractQueryTags,
  scoreDocumentsByTags,
} from "../../lib/search.js";
