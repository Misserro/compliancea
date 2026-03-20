export const RESOURCES = ['documents', 'contracts', 'legal_hub', 'policies', 'qa_cards'] as const;
export type Resource = typeof RESOURCES[number];
export type PermissionLevel = 'none' | 'view' | 'edit' | 'full';

export const PERMISSION_LEVELS: Record<PermissionLevel, number> = {
  none: 0, view: 1, edit: 2, full: 3,
};

export function hasPermission(
  userLevel: PermissionLevel | undefined | null,
  required: PermissionLevel
): boolean {
  if (userLevel === undefined || userLevel === null) return true; // null = full access (owner/admin)
  return PERMISSION_LEVELS[userLevel] >= PERMISSION_LEVELS[required];
}

export const RESOURCE_LABELS: Record<Resource, string> = {
  documents: 'Documents',
  contracts: 'Contracts',
  legal_hub: 'Legal Hub',
  policies: 'Policies',
  qa_cards: 'QA Cards',
};
