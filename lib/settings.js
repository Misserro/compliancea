/**
 * Application settings — DB-backed, per-org store
 *
 * Settings are stored in app_settings table with (org_id, key) composite PK.
 * Missing keys fall back to defaults.
 */

import { getOrgSettings, setOrgSetting, deleteOrgSettings } from "./db.js";

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
  policiesTabDocTypes: ["policy", "procedure"],
};

/**
 * Get current settings for an org, with defaults for missing keys
 * @param {number} [orgId=1] - Organization ID (defaults to 1 for backward compatibility)
 * @returns {Object} - Merged settings
 */
export function getSettings(orgId = 1) {
  const rows = getOrgSettings(orgId);
  const merged = { ...defaultSettings };

  for (const row of rows) {
    const key = row.key;
    if (key in defaultSettings) {
      try {
        merged[key] = JSON.parse(row.value);
      } catch {
        merged[key] = row.value;
      }
    }
  }

  return merged;
}

/**
 * Update settings for an org (upserts each key-value pair)
 * @param {number} [orgId=1] - Organization ID
 * @param {Partial<typeof defaultSettings>} updates
 * @returns {Object} - Updated settings
 */
export function updateSettings(orgId = 1, updates = undefined) {
  // Support legacy call signature: updateSettings(updates) where updates is the first arg
  if (typeof orgId === "object" && orgId !== null) {
    updates = orgId;
    orgId = 1;
  }

  if (!updates) return getSettings(orgId);

  for (const [key, value] of Object.entries(updates)) {
    if (key in defaultSettings) {
      setOrgSetting(orgId, key, JSON.stringify(value));
    }
  }

  return getSettings(orgId);
}

/**
 * Reset settings to defaults for an org (deletes all org settings rows)
 * @param {number} [orgId=1] - Organization ID
 * @returns {Object} - Default settings
 */
export function resetSettings(orgId = 1) {
  deleteOrgSettings(orgId);
  return { ...defaultSettings };
}

/**
 * Get default settings (static, no DB access)
 * @returns {Object}
 */
export function getDefaultSettings() {
  return { ...defaultSettings };
}
