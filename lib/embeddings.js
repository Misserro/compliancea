const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "voyage-3-lite";
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const MAX_INPUT_LENGTH = 32000;

const EMBEDDING_MAX_RETRIES = 3;
const EMBEDDING_RETRY_DELAYS = [200, 400]; // ms between attempt 1->2, 2->3
const EMBEDDING_TIMEOUT_MS = 10000; // 10s per attempt

/**
 * Truncate text to maximum allowed length
 * @param {string} text
 * @returns {string}
 */
function truncateText(text) {
  if (text.length <= MAX_INPUT_LENGTH) {
    return text;
  }
  return text.substring(0, MAX_INPUT_LENGTH);
}

/**
 * Get embedding for a single text using Voyage AI
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector (1024 dimensions for voyage-3-lite)
 */
export async function getEmbedding(text) {
  if (!VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  const truncatedText = truncateText(text);
  let lastError;

  for (let attempt = 1; attempt <= EMBEDDING_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

    try {
      const response = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${VOYAGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: truncatedText,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;

        // Permanent 4xx errors (except 429) — throw immediately, do not retry
        if (status >= 400 && status < 500 && status !== 429) {
          throw new Error(`Voyage AI embedding failed: ${status} - ${errorText}`);
        }

        // 429 or 5xx — retryable
        lastError = new Error(`Voyage AI embedding failed: ${status} - ${errorText}`);

        if (attempt < EMBEDDING_MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, EMBEDDING_RETRY_DELAYS[attempt - 1]));
          continue;
        }

        throw lastError;
      }

      const data = await response.json();

      if (!data.data || !data.data[0] || !data.data[0].embedding) {
        throw new Error("Invalid embedding response from Voyage AI");
      }

      return data.data[0].embedding;
    } catch (err) {
      clearTimeout(timeoutId);

      // Permanent 4xx errors and invalid response format — do not retry
      if (
        err.message &&
        (/Voyage AI embedding failed: (400|401|403|404)\b/.test(err.message) ||
          err.message === "Invalid embedding response from Voyage AI")
      ) {
        throw err;
      }

      lastError = err;

      if (attempt === EMBEDDING_MAX_RETRIES) {
        throw lastError;
      }

      // Wait before next attempt (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, EMBEDDING_RETRY_DELAYS[attempt - 1]));
    }
  }

  // Should never reach here, but satisfy linters
  throw lastError;
}

/**
 * Get embeddings for multiple texts in a single batch request
 * @param {string[]} texts - Array of texts to embed
 * @param {function} onProgress - Optional callback for progress updates (index, total)
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function getEmbeddings(texts, onProgress = null) {
  if (!VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  if (!texts || texts.length === 0) {
    return [];
  }

  // Truncate all texts
  const truncatedTexts = texts.map(truncateText);

  // Voyage AI supports batch requests with arrays
  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncatedTexts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Voyage AI batch embedding failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error("Invalid batch embedding response from Voyage AI");
  }

  // Sort by index to ensure correct order
  const sorted = data.data.sort((a, b) => a.index - b.index);
  const embeddings = sorted.map(item => item.embedding);

  if (onProgress) {
    onProgress(texts.length, texts.length);
  }

  return embeddings;
}

/**
 * Convert a float array embedding to a Buffer for storage
 * Uses Float32Array for efficient storage (4 bytes per float)
 * @param {number[]} embedding - Embedding vector
 * @returns {Buffer} - Buffer representation
 */
export function embeddingToBuffer(embedding) {
  const float32Array = new Float32Array(embedding);
  return Buffer.from(float32Array.buffer);
}

/**
 * Convert a Buffer back to a float array embedding
 * @param {Buffer} buffer - Buffer representation
 * @returns {number[]} - Embedding vector
 */
export function bufferToEmbedding(buffer) {
  const float32Array = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / Float32Array.BYTES_PER_ELEMENT
  );
  return Array.from(float32Array);
}

/**
 * Check if Voyage AI API is available
 * @returns {Promise<{available: boolean, error?: string}>}
 */
export async function checkEmbeddingStatus() {
  if (!VOYAGE_API_KEY) {
    return { available: false, error: "VOYAGE_API_KEY is not set" };
  }

  try {
    // Make a small test request
    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: "test",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { available: false, error: `Voyage AI error: ${response.status} - ${errorText}` };
    }

    return { available: true };
  } catch (error) {
    return { available: false, error: `Cannot connect to Voyage AI: ${error.message}` };
  }
}
