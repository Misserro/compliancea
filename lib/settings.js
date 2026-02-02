/**
 * Application settings for token optimization
 * These can be toggled via the Settings tab in the UI
 */

// Default settings
const defaultSettings = {
  // Low-risk optimizations (always on)
  useMinimalSchema: true,           // Remove verbose descriptions from JSON schemas
  optimizeContextFormatting: true,  // Streamlined context formatting for Q&A

  // Medium-risk optimizations (user-configurable)
  useHaikuForExtraction: true,      // Use Claude Haiku for question extraction (cheaper)
  skipTranslationIfSameLanguage: true, // Skip translation if document appears to be in target language
  useRelevanceThreshold: true,      // Filter out low-relevance chunks
  relevanceThresholdValue: 0.25,    // Minimum relevance score (0-1)
  minResultsGuarantee: 3,           // Always return at least this many results regardless of threshold
};

// In-memory settings (persisted to localStorage on client side)
let currentSettings = { ...defaultSettings };

/**
 * Get current settings
 */
export function getSettings() {
  return { ...currentSettings };
}

/**
 * Update settings
 * @param {Partial<typeof defaultSettings>} updates
 */
export function updateSettings(updates) {
  currentSettings = { ...currentSettings, ...updates };
  return getSettings();
}

/**
 * Reset settings to defaults
 */
export function resetSettings() {
  currentSettings = { ...defaultSettings };
  return getSettings();
}

/**
 * Get default settings
 */
export function getDefaultSettings() {
  return { ...defaultSettings };
}
