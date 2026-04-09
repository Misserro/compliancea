import fs from "fs";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { query, run, get, getOrgSetting, updateDocumentMetadata, updateDocumentProcessed, insertObligation, createTaskForObligation } from "./db.js";
import { logAction } from "./audit.js";
import { shouldSync, scanGDrive, getGDriveStatus } from "./gdrive.js";
import { extractContractTerms } from "./contracts.js";

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
    gdrive: {},
    retention: null,
    unconfirmedTags: null,
    tasks: null,
  };

  // 1. Google Drive sync — per-org loop
  if (!options.skipGDrive) {
    try {
      const orgsWithGDrive = query(
        `SELECT DISTINCT org_id FROM app_settings WHERE key = 'gdrive_enabled' AND value = '1'`
      );

      if (orgsWithGDrive.length === 0) {
        results.gdrive = { skipped: true, reason: "No orgs with GDrive enabled" };
      } else {
        for (const { org_id } of orgsWithGDrive) {
          try {
            const gdriveStatus = getGDriveStatus(org_id);
            if (!gdriveStatus.available) {
              results.gdrive[org_id] = { skipped: true, reason: gdriveStatus.error || "Not configured" };
              continue;
            }
            if (!shouldSync(org_id)) {
              results.gdrive[org_id] = { skipped: true, reason: "Sync interval not reached" };
              continue;
            }

            const syncResult = await scanGDrive(org_id);
            results.gdrive[org_id] = { ...syncResult };

            // Auto-process newly added GDrive documents for this org
            if (syncResult.added > 0) {
              const newDocs = query(
                `SELECT id, path FROM documents WHERE source = 'gdrive' AND processed = 0 AND org_id = ?`,
                [org_id]
              );
              results.gdrive[org_id].autoProcessed = 0;
              results.gdrive[org_id].autoProcessErrors = [];

              for (const doc of newDocs) {
                try {
                  await processGDriveDocument(doc.id, doc.path, org_id);
                  results.gdrive[org_id].autoProcessed++;
                } catch (err) {
                  results.gdrive[org_id].autoProcessErrors.push(`doc ${doc.id}: ${err.message}`);
                }
              }
            }
          } catch (err) {
            results.gdrive[org_id] = { error: err.message };
          }
        }
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
 * Extract text from a local file (PDF or DOCX)
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function extractTextFromLocalPath(filePath) {
  const name = filePath.toLowerCase();
  const buf = fs.readFileSync(filePath);
  if (name.endsWith(".pdf")) {
    const parsed = await pdfParse(buf);
    return (parsed.text || "").trim();
  }
  if (name.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer: buf });
    return (result.value || "").trim();
  }
  throw new Error(`Unsupported file type: ${filePath}`);
}

/**
 * Auto-process a GDrive document as a contract.
 * Skips auto-tagger (all GDrive docs are contracts).
 * Applies is_historical flag if expiry_date < org's gdrive_historical_cutoff.
 * @param {number} docId
 * @param {string} localPath
 * @param {number} orgId
 */
async function processGDriveDocument(docId, localPath, orgId) {
  const text = await extractTextFromLocalPath(localPath);
  if (!text || text.length < 50) {
    throw new Error("Extracted text too short — skipping");
  }

  const wordCount = text.split(/\s+/).length;

  // Extract contract terms via Claude (skip auto-tagger — all GDrive docs are contracts)
  const contractResult = await extractContractTerms(text);

  // Build metadata update
  const contractFieldsUpdate = {
    doc_type: "contract",
    status: "unsigned",
    full_text: text,
    contract_type: contractResult.contract_type || null,
    expiry_date: contractResult.expiry_date || null,
  };

  if (contractResult.suggested_name) {
    contractFieldsUpdate.name = contractResult.suggested_name;
  }
  if (contractResult.parties && contractResult.parties.length > 0) {
    contractFieldsUpdate.contracting_company = contractResult.parties[0];
  }
  if (contractResult.parties && contractResult.parties.length > 1) {
    contractFieldsUpdate.contracting_vendor = contractResult.parties[1];
  }

  // Determine historical flag
  const historicalCutoff = getOrgSetting(orgId, "gdrive_historical_cutoff");
  let isHistorical = 0;
  if (historicalCutoff && contractResult.expiry_date) {
    isHistorical = contractResult.expiry_date < historicalCutoff ? 1 : 0;
  }
  contractFieldsUpdate.is_historical = isHistorical;

  // Mark as processed
  updateDocumentProcessed(docId, wordCount);
  updateDocumentMetadata(docId, contractFieldsUpdate);

  // Insert obligations only for non-historical contracts
  if (!isHistorical && Array.isArray(contractResult.obligations)) {
    const today = new Date().toISOString().split("T")[0];

    for (const ob of contractResult.obligations) {
      // All GDrive docs start as unsigned — only not_signed stage obligations are active
      const shouldBeActive = ob.stage === "not_signed";

      if (ob.category === "payments" && ob.due_dates && ob.due_dates.length > 1) {
        const sortedDueDates = [...ob.due_dates].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        const firstUpcomingIdx = sortedDueDates.findIndex((dd) => dd.date && dd.date >= today);

        for (let i = 0; i < sortedDueDates.length; i++) {
          const dd = sortedDueDates[i];
          const isNextUpcoming = shouldBeActive && i === firstUpcomingIdx;
          const splitActivation = isNextUpcoming ? "active" : "inactive";
          const splitTitle = dd.label ? `${ob.title} — ${dd.label}` : `${ob.title} — ${dd.date || "N/A"}`;
          const splitDetailsJson = JSON.stringify({
            due_dates: [dd],
            key_values: ob.key_values,
            clause_references: ob.clause_references,
          });

          const obligationId = insertObligation({
            documentId: docId,
            obligationType: ob.category,
            title: splitTitle,
            description: ob.summary,
            clauseReference: ob.clause_references ? ob.clause_references.join(", ") : null,
            dueDate: dd.date || null,
            recurrence: ob.recurrence,
            noticePeriodDays: ob.notice_period_days,
            owner: ob.suggested_owner,
            escalationTo: null,
            proofDescription: ob.proof_description,
            evidenceJson: "[]",
            category: ob.category,
            activation: splitActivation,
            summary: ob.summary,
            detailsJson: splitDetailsJson,
            penalties: ob.penalties,
            stage: ob.stage,
            orgId,
          });

          if (splitActivation === "active" && dd.date) {
            createTaskForObligation(obligationId, {
              title: `${dd.label || ob.title}${dd.amount ? ` — ${dd.amount}` : ""}`,
              description: dd.details || ob.summary,
              dueDate: dd.date,
              owner: ob.suggested_owner,
              escalationTo: null,
              orgId,
            });
          }
        }
      } else {
        const firstDueDate = ob.due_dates && ob.due_dates.length > 0 ? ob.due_dates[0].date : null;
        const detailsJson = JSON.stringify({
          due_dates: ob.due_dates || [],
          key_values: ob.key_values,
          clause_references: ob.clause_references,
        });
        const activation = shouldBeActive ? "active" : "inactive";

        const obligationId = insertObligation({
          documentId: docId,
          obligationType: ob.category,
          title: ob.title,
          description: ob.summary,
          clauseReference: ob.clause_references ? ob.clause_references.join(", ") : null,
          dueDate: firstDueDate,
          recurrence: ob.recurrence,
          noticePeriodDays: ob.notice_period_days,
          owner: ob.suggested_owner,
          escalationTo: null,
          proofDescription: ob.proof_description,
          evidenceJson: "[]",
          category: ob.category,
          activation,
          summary: ob.summary,
          detailsJson,
          penalties: ob.penalties,
          stage: ob.stage,
          orgId,
        });

        if (activation === "active" && ob.due_dates) {
          for (const dd of ob.due_dates) {
            if (dd.date) {
              createTaskForObligation(obligationId, {
                title: `${dd.label || ob.title}${dd.amount ? ` — ${dd.amount}` : ""}`,
                description: dd.details || ob.summary,
                dueDate: dd.date,
                owner: ob.suggested_owner,
                escalationTo: null,
                orgId,
              });
            }
          }
        }
      }
    }
  }

  logAction("document", docId, "gdrive_auto_processed", {
    isHistorical,
    wordCount,
    obligationsExtracted: isHistorical ? 0 : (contractResult.obligations || []).length,
  });
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
