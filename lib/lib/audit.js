import { run, query } from "./db.js";

/**
 * Log an action to the audit trail
 * @param {string} entityType - 'document', 'chunk', 'setting', 'query', 'policy', 'task', 'legal_hold'
 * @param {number|null} entityId - ID of the affected entity
 * @param {string} action - 'created','updated','deleted','searched','state_changed','hold_applied','processed','synced','tagged','policy_triggered'
 * @param {Object|string|null} details - Additional context (will be JSON-stringified if object)
 */
export function logAction(entityType, entityId, action, details = null) {
  const detailsStr =
    details && typeof details === "object"
      ? JSON.stringify(details)
      : details || null;

  run(
    `INSERT INTO audit_log (entity_type, entity_id, action, details)
     VALUES (?, ?, ?, ?)`,
    [entityType, entityId, action, detailsStr]
  );
}

/**
 * Get audit log entries with optional filters
 * @param {Object} filters
 * @param {string} [filters.entityType] - Filter by entity type
 * @param {number} [filters.entityId] - Filter by entity ID
 * @param {string} [filters.action] - Filter by action type
 * @param {string} [filters.since] - ISO date string, entries after this date
 * @param {string} [filters.until] - ISO date string, entries before this date
 * @param {number} [filters.limit] - Max results (default 100)
 * @param {number} [filters.offset] - Offset for pagination (default 0)
 * @returns {Object[]}
 */
export function getAuditLog(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.entityType) {
    conditions.push("entity_type = ?");
    params.push(filters.entityType);
  }
  if (filters.entityId !== undefined && filters.entityId !== null) {
    conditions.push("entity_id = ?");
    params.push(filters.entityId);
  }
  if (filters.action) {
    conditions.push("action = ?");
    params.push(filters.action);
  }
  if (filters.since) {
    conditions.push("created_at >= ?");
    params.push(filters.since);
  }
  if (filters.until) {
    conditions.push("created_at <= ?");
    params.push(filters.until);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  return query(
    `SELECT id, entity_type, entity_id, action, details, created_at
     FROM audit_log
     ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

/**
 * Get audit log count for filters (for pagination)
 * @param {Object} filters - Same as getAuditLog filters (minus limit/offset)
 * @returns {number}
 */
export function getAuditLogCount(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.entityType) {
    conditions.push("entity_type = ?");
    params.push(filters.entityType);
  }
  if (filters.entityId !== undefined && filters.entityId !== null) {
    conditions.push("entity_id = ?");
    params.push(filters.entityId);
  }
  if (filters.action) {
    conditions.push("action = ?");
    params.push(filters.action);
  }
  if (filters.since) {
    conditions.push("created_at >= ?");
    params.push(filters.since);
  }
  if (filters.until) {
    conditions.push("created_at <= ?");
    params.push(filters.until);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = query(
    `SELECT COUNT(*) as count FROM audit_log ${where}`,
    params
  );

  return result[0]?.count || 0;
}

/**
 * Get recent audit entries for a specific document
 * @param {number} documentId
 * @param {number} limit
 * @returns {Object[]}
 */
export function getDocumentAuditHistory(documentId, limit = 20) {
  return getAuditLog({
    entityType: "document",
    entityId: documentId,
    limit,
  });
}
