import { NextResponse } from "next/server";
import type { Session } from "next-auth";

export const FEATURES = [
  "contracts",
  "legal_hub",
  "template_editor",
  "court_fee_calculator",
  "policies",
  "qa_cards",
] as const;

export type Feature = (typeof FEATURES)[number];

/**
 * Guard that checks whether the current org has a specific feature enabled.
 * Mirrors the requireSuperAdmin pattern: returns a Response to deny, or null to allow.
 *
 * - Super admins bypass all feature checks.
 * - Undefined orgFeatures (stale session) treated as all-enabled to avoid lockout on first deploy.
 */
export function requireOrgFeature(feature: Feature, session: Session | null): Response | null {
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Super admins bypass all feature checks
  if (session.user.isSuperAdmin) return null;

  // Undefined orgFeatures = treat as all enabled (graceful on first deploy / stale sessions)
  const features = session.user.orgFeatures;
  if (!features) return null;

  if (!features.includes(feature)) {
    return NextResponse.json(
      { error: "Feature not available for your organization" },
      { status: 403 }
    );
  }
  return null;
}
