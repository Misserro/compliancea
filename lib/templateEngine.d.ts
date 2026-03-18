export function fillTemplate(
  templateBody: string,
  caseData: Record<string, unknown>,
  parties: Record<string, unknown>[],
  deadlines: Record<string, unknown>[]
): { html: string; snapshot: Record<string, string> };
