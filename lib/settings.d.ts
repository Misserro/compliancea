export function getSettings(orgId?: number): Record<string, any>;
export function updateSettings(orgId?: number | Record<string, any>, updates?: Record<string, any>): Record<string, any>;
export function resetSettings(orgId?: number): Record<string, any>;
export function getDefaultSettings(): Record<string, any>;
