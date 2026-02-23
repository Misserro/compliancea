/**
 * Line-level diff between two texts.
 * Returns an array of hunks: { type: 'added'|'removed'|'unchanged', lines: string[] }
 * Unchanged hunks with many lines are included so the UI can collapse them.
 * Guard: if either side exceeds 3000 lines, returns a removed hunk followed by an added hunk.
 */

export function computeLineDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');

  // Safety guard for very large documents
  if (oldLines.length > 3000 || newLines.length > 3000) {
    return [
      { type: 'removed', lines: oldLines },
      { type: 'added', lines: newLines },
    ];
  }

  const m = oldLines.length;
  const n = newLines.length;

  // LCS dynamic programming table
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1).fill(0);
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build flat ops list
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'unchanged', line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'added', line: newLines[j - 1] });
      j--;
    } else {
      ops.unshift({ type: 'removed', line: oldLines[i - 1] });
      i--;
    }
  }

  // Group consecutive ops of the same type into hunks
  const hunks = [];
  for (const op of ops) {
    if (hunks.length > 0 && hunks[hunks.length - 1].type === op.type) {
      hunks[hunks.length - 1].lines.push(op.line);
    } else {
      hunks.push({ type: op.type, lines: [op.line] });
    }
  }

  return hunks;
}

/**
 * Normalize a document name for similarity comparison.
 * Strips version indicators and normalizes whitespace.
 */
export function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\.(pdf|docx)$/i, '')
    .replace(/\b(v\d+|version\s*\d+|\d{4}|final|revised|draft|new|updated|old|copy|backup)\b/gi, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Name similarity score (0-1) between two normalized names.
 */
export function nameSimilarity(nameA, nameB) {
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}
