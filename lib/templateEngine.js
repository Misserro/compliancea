/**
 * Template engine for {{variable}} placeholder resolution.
 * Pure function — no side effects, no imports.
 */

/**
 * Resolve a dot-path on a plain object.
 * e.g. resolveDeep({ name: 'Jan' }, ['name']) -> 'Jan'
 */
function resolveDeep(obj, pathParts) {
  let current = obj;
  for (const part of pathParts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Fill {{variable}} placeholders in templateBody with values from case context.
 *
 * Variable sources:
 *   case.<field>               -> caseData[field]
 *   parties.plaintiff.<field>  -> first party with party_type === 'plaintiff'
 *   parties.defendant.<field>  -> first party with party_type === 'defendant'
 *   parties.representative.<f> -> first party with representative_name set
 *   deadlines.next.<field>     -> nearest pending deadline (by due_date)
 *   today                      -> current date in pl-PL locale format
 *
 * Missing values render as [brak danych: <token>].
 *
 * @param {string} templateBody - HTML string with {{variable}} placeholders
 * @param {Object} caseData - legal_cases row
 * @param {Object[]} parties - case_parties rows
 * @param {Object[]} deadlines - case_deadlines rows
 * @returns {{ html: string, snapshot: Record<string, string> }}
 */
export function fillTemplate(templateBody, caseData, parties, deadlines) {
  const plaintiff = (parties || []).find(p => p.party_type === "plaintiff");
  const defendant = (parties || []).find(p => p.party_type === "defendant");
  const representative = (parties || []).find(p => p.representative_name);
  const nextDeadline = (deadlines || [])
    .filter(d => d.status === "pending")
    .sort((a, b) => (a.due_date > b.due_date ? 1 : -1))[0];

  const today = new Date().toLocaleDateString("pl-PL");

  const snapshot = {};

  const html = templateBody.replace(/\{\{([^}]+)\}\}/g, (match, token) => {
    const trimmed = token.trim();
    const parts = trimmed.split(".");
    const [source, ...rest] = parts;

    let value;

    if (trimmed === "today") {
      value = today;
    } else if (source === "case") {
      value = resolveDeep(caseData, rest);
    } else if (source === "parties" && rest[0] === "plaintiff") {
      value = resolveDeep(plaintiff, rest.slice(1));
    } else if (source === "parties" && rest[0] === "defendant") {
      value = resolveDeep(defendant, rest.slice(1));
    } else if (source === "parties" && rest[0] === "representative") {
      value = resolveDeep(representative, rest.slice(1));
    } else if (source === "deadlines" && rest[0] === "next") {
      value = resolveDeep(nextDeadline, rest.slice(1));
    }

    if (value === undefined || value === null) {
      snapshot[trimmed] = "[brak danych]";
      return `[brak danych: ${trimmed}]`;
    }

    const strValue = String(value);
    snapshot[trimmed] = strValue;
    return strValue;
  });

  return { html, snapshot };
}
