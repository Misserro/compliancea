import { query, run, get } from "./db.js";
import { logAction } from "./audit.js";
import { shouldSync, scanGDrive, getGDriveStatus } from "./gdrive.js";

let lastRunTime = null;
const MIN_RUN_INTERVAL_MS = 60 * 1000; // Don't run more than once per minute

/**
 * Run the full maintenance cycle
 * Called via POST /api/maintenance/run or piggybacked on other requests
 * @param {Object} [options]
 * @param {boolean} [options.force] - Force run even if recently ran
 * @param {boolean} [options.skipGDrive] - Skip Google Drive sync
 * @returns {Promise<Object>} - Summary of all maintenance actions
 */
export async function runMaintenanceCycle(options = {}) {
  // Prevent running too frequently (unless forced)
  if (!options.force && lastRunTime) {
    const elapsed = Date.now() - lastRunTime;
    if (elapsed < MIN_RUN_INTERVAL_MS) {
      return {
        skipped: true,
        reason: `Last run was ${Math.round(elapsed / 1000)}s ago. Minimum interval: ${MIN_RUN_INTERVAL_MS / 1000}s.`,
      };
    }
  }

  const results = {
    startedAt: new Date().toISOString(),
    gdrive: null,
    retention: null,
    unconfirmedTags: null,
    tasks: null,
  };

  // 1. Google Drive sync (if configured and interval elapsed)
  if (!options.skipGDrive) {
    try {
      const gdriveStatus = getGDriveStatus();
      if (gdriveStatus.available && shouldSync()) {
        results.gdrive = await scanGDrive();
      } else if (!gdriveStatus.available) {
        results.gdrive = { skipped: true, reason: "Not configured" };
      } else {
        results.gdrive = { skipped: true, reason: "Sync interval not reached" };
      }
    } catch (err) {
      results.gdrive = { error: err.message };
    }
  }

  // 2. Retention check — find documents past retention_until
  try {
    results.retention = checkRetention();
  } catch (err) {
    results.retention = { error: err.message };
  }

  // 3. Unconfirmed tags — flag documents with old unconfirmed auto-tags
  try {
    results.unconfirmedTags = checkUnconfirmedTags();
  } catch (err) {
    results.unconfirmedTags = { error: err.message };
  }

  // 4. Summary of open tasks
  try {
    results.tasks = getTaskSummary();
  } catch (err) {
    results.tasks = { error: err.message };
  }

  lastRunTime = Date.now();
  results.completedAt = new Date().toISOString();

  logAction("system", null, "maintenance_run", results);

  return results;
}

/**
 * Check for documents past their retention period
 * Creates disposal tasks for eligible documents
 * @returns {{checked: number, eligible: number, tasksCreated: number}}
 */
function checkRetention() {
  const now = new Date().toISOString();

  // Find documents past retention with no legal hold and no existing open disposal task
  const expired = query(
    `SELECT d.id, d.name, d.retention_label, d.retention_until
     FROM documents d
     WHERE d.retention_until IS NOT NULL
     AND d.retention_until < ?
     AND d.legal_hold = 0
     AND d.status != 'disposed'
     AND NOT EXISTS (
       SELECT 1 FROM tasks t
       WHERE t.entity_id = d.id
       AND t.entity_type = 'document'
       AND t.task_type = 'retention_expiry'
       AND t.status = 'open'
     )`,
    [now]
  );

  let tasksCreated = 0;

  for (const doc of expired) {
    run(
      `INSERT INTO tasks (title, description, entity_type, entity_id, task_type)
       VALUES (?, ?, 'document', ?, 'retention_expiry')`,
      [
        `Retention expired: ${doc.name}`,
        `Document "${doc.name}" (${doc.retention_label}) retention period ended on ${doc.retention_until}. Review for disposal.`,
        doc.id,
      ]
    );
    tasksCreated++;
  }

  const totalWithRetention = get(
    `SELECT COUNT(*) as count FROM documents WHERE retention_until IS NOT NULL`
  );

  return {
    checked: totalWithRetention?.count || 0,
    eligible: expired.length,
    tasksCreated,
  };
}

/**
 * Check for documents with unconfirmed auto-tags older than 7 days
 * Creates review tasks for them
 * @returns {{checked: number, flagged: number, tasksCreated: number}}
 */
function checkUnconfirmedTags() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const unconfirmed = query(
    `SELECT d.id, d.name
     FROM documents d
     WHERE d.confirmed_tags = 0
     AND d.auto_tags IS NOT NULL
     AND d.added_at < ?
     AND NOT EXISTS (
       SELECT 1 FROM tasks t
       WHERE t.entity_id = d.id
       AND t.entity_type = 'document'
       AND t.task_type = 'review_metadata'
       AND t.status = 'open'
     )`,
    [sevenDaysAgo]
  );

  let tasksCreated = 0;

  for (const doc of unconfirmed) {
    run(
      `INSERT INTO tasks (title, description, entity_type, entity_id, task_type)
       VALUES (?, ?, 'document', ?, 'review_metadata')`,
      [
        `Review auto-tags: ${doc.name}`,
        `Document "${doc.name}" has unconfirmed auto-generated metadata. Please review and confirm.`,
        doc.id,
      ]
    );
    tasksCreated++;
  }

  return {
    checked: unconfirmed.length + (get(`SELECT COUNT(*) as count FROM documents WHERE confirmed_tags = 1`)?.count || 0),
    flagged: unconfirmed.length,
    tasksCreated,
  };
}

/**
 * Get summary of open tasks by type
 * @returns {Object}
 */
function getTaskSummary() {
  const byType = query(
    `SELECT task_type, COUNT(*) as count
     FROM tasks
     WHERE status = 'open'
     GROUP BY task_type`
  );

  const totalOpen = get(`SELECT COUNT(*) as count FROM tasks WHERE status = 'open'`);
  const totalResolved = get(`SELECT COUNT(*) as count FROM tasks WHERE status = 'resolved'`);

  return {
    open: totalOpen?.count || 0,
    resolved: totalResolved?.count || 0,
    byType: Object.fromEntries(byType.map((r) => [r.task_type, r.count])),
  };
}

/**
 * Get last maintenance run time
 * @returns {string|null}
 */
export function getLastRunTime() {
  return lastRunTime ? new Date(lastRunTime).toISOString() : null;
}
