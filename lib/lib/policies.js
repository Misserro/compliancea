import { run, query, get } from "./db.js";
import { logAction } from "./audit.js";

/**
 * Get all policy rules
 * @param {boolean} enabledOnly - Only return enabled rules
 * @returns {Object[]}
 */
export function getAllPolicies(enabledOnly = false) {
  const where = enabledOnly ? "WHERE enabled = 1" : "";
  return query(
    `SELECT id, name, condition_json, action_type, action_params, enabled, created_at
     FROM policy_rules ${where}
     ORDER BY created_at DESC`
  );
}

/**
 * Get a single policy rule by ID
 * @param {number} id
 * @returns {Object|null}
 */
export function getPolicyById(id) {
  return get(
    `SELECT id, name, condition_json, action_type, action_params, enabled, created_at
     FROM policy_rules WHERE id = ?`,
    [id]
  );
}

/**
 * Create a new policy rule
 * @param {string} name
 * @param {Object} condition - Conditions to match (e.g. {doc_type:"contract",jurisdiction:"EU"})
 * @param {string} actionType - 'set_retention','require_approval','add_tag','flag_review'
 * @param {Object} actionParams - Action parameters (e.g. {retention_label:"retain-5y",retention_years:5})
 * @returns {number} - New policy ID
 */
export function createPolicy(name, condition, actionType, actionParams = {}) {
  const validActions = ["set_retention", "require_approval", "add_tag", "flag_review"];
  if (!validActions.includes(actionType)) {
    throw new Error(`Invalid action_type: ${actionType}. Must be one of: ${validActions.join(", ")}`);
  }

  const result = run(
    `INSERT INTO policy_rules (name, condition_json, action_type, action_params)
     VALUES (?, ?, ?, ?)`,
    [
      name,
      JSON.stringify(condition),
      actionType,
      JSON.stringify(actionParams),
    ]
  );

  logAction("policy", result.lastInsertRowId, "created", {
    name,
    condition,
    actionType,
    actionParams,
  });

  return result.lastInsertRowId;
}

/**
 * Update an existing policy rule
 * @param {number} id
 * @param {Object} updates - Fields to update
 * @returns {boolean}
 */
export function updatePolicy(id, updates) {
  const fields = [];
  const params = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    params.push(updates.name);
  }
  if (updates.condition !== undefined) {
    fields.push("condition_json = ?");
    params.push(JSON.stringify(updates.condition));
  }
  if (updates.actionType !== undefined) {
    fields.push("action_type = ?");
    params.push(updates.actionType);
  }
  if (updates.actionParams !== undefined) {
    fields.push("action_params = ?");
    params.push(JSON.stringify(updates.actionParams));
  }
  if (updates.enabled !== undefined) {
    fields.push("enabled = ?");
    params.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) return false;

  params.push(id);
  const result = run(
    `UPDATE policy_rules SET ${fields.join(", ")} WHERE id = ?`,
    params
  );

  logAction("policy", id, "updated", updates);
  return result.changes > 0;
}

/**
 * Delete a policy rule
 * @param {number} id
 * @returns {boolean}
 */
export function deletePolicy(id) {
  const policy = getPolicyById(id);
  const result = run("DELETE FROM policy_rules WHERE id = ?", [id]);
  if (result.changes > 0) {
    logAction("policy", id, "deleted", { name: policy?.name });
  }
  return result.changes > 0;
}

/**
 * Evaluate a document against all enabled policy rules
 * Returns array of triggered actions
 * @param {Object} document - Document object with metadata fields
 * @returns {{policy: Object, action: string, params: Object}[]}
 */
export function evaluateDocument(document) {
  const policies = getAllPolicies(true); // enabled only
  const triggered = [];

  for (const policy of policies) {
    let condition;
    try {
      condition = JSON.parse(policy.condition_json);
    } catch {
      continue;
    }

    if (matchesCondition(document, condition)) {
      let actionParams;
      try {
        actionParams = policy.action_params ? JSON.parse(policy.action_params) : {};
      } catch {
        actionParams = {};
      }

      triggered.push({
        policy: { id: policy.id, name: policy.name },
        action: policy.action_type,
        params: actionParams,
      });
    }
  }

  return triggered;
}

/**
 * Check if a document matches a policy condition
 * Conditions are AND-ed: all specified fields must match
 * @param {Object} document
 * @param {Object} condition
 * @returns {boolean}
 */
function matchesCondition(document, condition) {
  for (const [field, expected] of Object.entries(condition)) {
    const actual = document[field];

    if (actual === undefined || actual === null) {
      return false;
    }

    // Handle array fields (tags)
    if (field === "tags") {
      let docTags;
      try {
        docTags = typeof actual === "string" ? JSON.parse(actual) : actual;
      } catch {
        docTags = [];
      }

      const expectedTags = Array.isArray(expected) ? expected : [expected];
      const hasAll = expectedTags.every((t) =>
        docTags.some((dt) => dt.toLowerCase() === t.toLowerCase())
      );
      if (!hasAll) return false;
      continue;
    }

    // Handle string comparison (case-insensitive)
    if (
      typeof expected === "string" &&
      typeof actual === "string" &&
      actual.toLowerCase() !== expected.toLowerCase()
    ) {
      return false;
    }

    // Handle numeric comparison
    if (typeof expected === "number" && actual !== expected) {
      return false;
    }
  }

  return true;
}

/**
 * Apply triggered policy actions to a document
 * @param {number} documentId
 * @param {{policy: Object, action: string, params: Object}[]} triggeredActions
 * @returns {{applied: string[], tasks_created: number}}
 */
export function applyActions(documentId, triggeredActions) {
  const applied = [];
  let tasksCreated = 0;

  for (const { policy, action, params } of triggeredActions) {
    switch (action) {
      case "set_retention": {
        const retentionYears = params.retention_years || 5;
        const retentionLabel = params.retention_label || `retain-${retentionYears}y`;
        // Calculate retention_until from now
        const retentionUntil = new Date();
        retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);

        run(
          `UPDATE documents SET retention_label = ?, retention_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [retentionLabel, retentionUntil.toISOString(), documentId]
        );

        logAction("document", documentId, "policy_triggered", {
          policy: policy.name,
          action: "set_retention",
          retention_label: retentionLabel,
          retention_until: retentionUntil.toISOString(),
        });
        applied.push(`Retention: ${retentionLabel}`);
        break;
      }

      case "require_approval": {
        run(
          `INSERT INTO tasks (title, description, entity_type, entity_id, task_type)
           VALUES (?, ?, 'document', ?, 'review_metadata')`,
          [
            `Document requires approval (policy: ${policy.name})`,
            params.description || `Policy "${policy.name}" requires this document to be approved before use.`,
            documentId,
          ]
        );
        tasksCreated++;
        logAction("document", documentId, "policy_triggered", {
          policy: policy.name,
          action: "require_approval",
        });
        applied.push(`Task created: requires approval`);
        break;
      }

      case "add_tag": {
        const tagToAdd = params.tag;
        if (tagToAdd) {
          // Get current tags
          const doc = get("SELECT tags FROM documents WHERE id = ?", [documentId]);
          let currentTags = [];
          try {
            currentTags = doc?.tags ? JSON.parse(doc.tags) : [];
          } catch {
            currentTags = [];
          }

          if (!currentTags.includes(tagToAdd.toLowerCase())) {
            currentTags.push(tagToAdd.toLowerCase());
            run(
              `UPDATE documents SET tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [JSON.stringify(currentTags), documentId]
            );
          }

          logAction("document", documentId, "policy_triggered", {
            policy: policy.name,
            action: "add_tag",
            tag: tagToAdd,
          });
          applied.push(`Tag added: ${tagToAdd}`);
        }
        break;
      }

      case "flag_review": {
        run(
          `INSERT INTO tasks (title, description, entity_type, entity_id, task_type)
           VALUES (?, ?, 'document', ?, 'review_metadata')`,
          [
            `Review flagged: ${params.reason || policy.name}`,
            params.description || `Policy "${policy.name}" flagged this document for review.`,
            documentId,
          ]
        );
        tasksCreated++;
        logAction("document", documentId, "policy_triggered", {
          policy: policy.name,
          action: "flag_review",
          reason: params.reason,
        });
        applied.push(`Task created: flagged for review`);
        break;
      }
    }
  }

  return { applied, tasks_created: tasksCreated };
}

/**
 * Dry-run: test a policy against all documents without applying actions
 * @param {number} policyId
 * @returns {{matches: Object[], totalDocuments: number}}
 */
export function testPolicy(policyId) {
  const policy = getPolicyById(policyId);
  if (!policy) throw new Error("Policy not found");

  let condition;
  try {
    condition = JSON.parse(policy.condition_json);
  } catch {
    throw new Error("Invalid policy condition JSON");
  }

  const allDocs = query(
    `SELECT id, name, doc_type, client, jurisdiction, tags, category, status, source
     FROM documents`
  );

  const matches = allDocs.filter((doc) => matchesCondition(doc, condition));

  return {
    policy: { id: policy.id, name: policy.name, action: policy.action_type },
    matches: matches.map((d) => ({ id: d.id, name: d.name })),
    totalDocuments: allDocs.length,
  };
}
