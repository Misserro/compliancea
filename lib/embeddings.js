const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "nomic-embed-text";

/**
 * Get embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector (768 dimensions for nomic-embed-text)
 */
export async function getEmbedding(text) {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama embedding failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error("Invalid embedding response from Ollama");
  }

  return data.embedding;
}

/**
 * Get embeddings for multiple texts (processes sequentially to avoid overwhelming Ollama)
 * @param {string[]} texts - Array of texts to embed
 * @param {function} onProgress - Optional callback for progress updates (index, total)
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function getEmbeddings(texts, onProgress = null) {
  const embeddings = [];

  for (let i = 0; i < texts.length; i++) {
    const embedding = await getEmbedding(texts[i]);
    embeddings.push(embedding);

    if (onProgress) {
      onProgress(i + 1, texts.length);
    }
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
 * Check if Ollama is available and the embedding model is loaded
 * @returns {Promise<{available: boolean, error?: string}>}
 */
export async function checkOllamaStatus() {
  try {
    // First check if Ollama is running
    const tagsResponse = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: "GET",
    });

    if (!tagsResponse.ok) {
      return { available: false, error: "Ollama is not responding" };
    }

    const tagsData = await tagsResponse.json();
    const models = tagsData.models || [];
    const hasModel = models.some((m) => m.name.includes(EMBEDDING_MODEL));

    if (!hasModel) {
      return {
        available: false,
        error: `Model "${EMBEDDING_MODEL}" not found. Run: ollama pull ${EMBEDDING_MODEL}`,
      };
    }

    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: `Cannot connect to Ollama at ${OLLAMA_URL}: ${error.message}`,
    };
  }
}
