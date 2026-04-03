import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail, createSession, getSessionById, getOrgMemberByUserId, getOrgMemberForOrg, get, getMemberPermissions, getOrgFeatures } from "@/lib/db-imports";
import { ensureDb } from "@/lib/server-utils";
import { authConfig } from "../auth.config";
import { FEATURES } from "@/lib/feature-flags";

// ─── Type augmentation ─────────────────────────────────────────────────────────
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      sessionId?: string;
      orgId?: number;
      orgRole?: string;
      orgName?: string;
      isSuperAdmin?: boolean;
      permissions?: Record<string, 'none' | 'view' | 'edit' | 'full'> | null;
      orgFeatures?: string[];
    } & DefaultSession["user"];
  }
  interface User {
    role?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    sessionId?: string;
    orgId?: number;
    orgRole?: string;
    orgName?: string;
    isSuperAdmin?: boolean;
    permissions?: Record<string, 'none' | 'view' | 'edit' | 'full'> | null;
    orgFeatures?: string[];
  }
}

// ─── JWT org re-hydration TTL cache (Plan 048) ───────────────────────────────
// Process-local cache to avoid redundant DB queries for burst requests.
// Key: "${userId}:${orgId}". TTL: 5 seconds. Bypassed on org-switch (trigger === 'update').
interface JwtCacheEntry {
  orgId: number;
  orgRole: string;
  orgName: string;
  isSuperAdmin: boolean;
  permissions: Record<string, 'none' | 'view' | 'edit' | 'full'> | null;
  orgFeatures: string[];
  expiresAt: number;
}
const jwtOrgCache = new Map<string, JwtCacheEntry>();
const JWT_CACHE_TTL = 5000; // 5 seconds

// ─── NextAuth config ──────────────────────────────────────────────────────────
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        await ensureDb();
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const normalizedEmail = email?.trim().toLowerCase();
        if (!normalizedEmail || !password) return null;

        const user = getUserByEmail(normalizedEmail);
        if (!user || !user.password_hash) return null;

        const valid = await bcrypt.compare(password, user.password_hash as string);
        if (!valid) return null;

        return {
          id: String(user.id),
          email: user.email as string,
          name: user.name as string | null,
          role: (user.role as string) ?? "admin",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // First sign-in: persist id/role and create a new session row
        token.id = user.id;
        token.role = (user as any).role ?? "admin";
        const sessionId = crypto.randomUUID();
        await ensureDb();
        createSession(sessionId, Number(user.id));
        token.sessionId = sessionId;

        // Look up org membership for the user
        const orgMember = getOrgMemberByUserId(Number(user.id));
        if (orgMember) {
          token.orgId = orgMember.org_id as number;
          token.orgRole = orgMember.role as string;
          token.orgName = orgMember.org_name as string;
        }

        // Look up super admin flag
        const saRow = get(`SELECT is_super_admin FROM users WHERE id = ?`, [Number(user.id)]);
        token.isSuperAdmin = !!saRow?.is_super_admin;

        // Load permissions for member role (owner/admin get null = full access)
        if (orgMember && orgMember.role === 'member') {
          const perms = getMemberPermissions(Number(orgMember.org_id), Number(user.id));
          token.permissions = Object.fromEntries((perms as any[]).map((p: any) => [p.resource, p.action]));
        } else {
          token.permissions = null;
        }

        // Load org feature flags (Plan 034)
        if (token.isSuperAdmin) {
          token.orgFeatures = [...FEATURES];
        } else if (token.orgId) {
          const featureRows = getOrgFeatures(Number(token.orgId));
          const disabledSet = new Set(
            (featureRows as any[]).filter((r: any) => !r.enabled).map((r: any) => r.feature)
          );
          token.orgFeatures = FEATURES.filter(f => !disabledSet.has(f));
        } else {
          token.orgFeatures = [...FEATURES];
        }
      } else if (token.sessionId && token.id) {
        // Subsequent requests: lazy re-hydration in case DB was wiped on redeploy.
        // NOTE: this branch runs on every request (every auth() call), not only after cold starts.
        // getSessionById is a synchronous in-memory sql.js query so the cost is negligible.
        await ensureDb();
        const existing = getSessionById(token.sessionId);
        if (!existing) {
          createSession(token.sessionId, Number(token.id));
        }

        // TTL cache check — skip DB queries for burst requests (Plan 048)
        const isOrgSwitch = trigger === "update" && session?.switchToOrgId;
        const cacheKey = `${token.id}:${token.orgId}`;
        const cached = !isOrgSwitch ? jwtOrgCache.get(cacheKey) : undefined;

        if (cached && cached.expiresAt > Date.now()) {
          // Cache hit — apply cached org context to token
          token.orgId = cached.orgId;
          token.orgRole = cached.orgRole;
          token.orgName = cached.orgName;
          token.isSuperAdmin = cached.isSuperAdmin;
          token.permissions = cached.permissions;
          token.orgFeatures = cached.orgFeatures;
        } else {
          // Cache miss or expired or org-switch — run DB queries

          // Refresh org context — preserve chosen org across requests
          let membership: any = null;
          if (isOrgSwitch) {
            // Explicit org switch request from client via useSession().update()
            membership = getOrgMemberForOrg(Number(token.id), Number(session.switchToOrgId));
          } else if (token.orgId) {
            // Re-fetch current active org (preserves chosen org across requests)
            membership = getOrgMemberForOrg(Number(token.id), Number(token.orgId));
            // If removed from org, fall back to first remaining org
            if (!membership) membership = getOrgMemberByUserId(Number(token.id));
          } else {
            // No org set yet — pick first
            membership = getOrgMemberByUserId(Number(token.id));
          }

          if (membership) {
            // getOrgMemberForOrg returns camelCase (orgId, orgName)
            // getOrgMemberByUserId returns snake_case (org_id, org_name)
            token.orgId = (membership.orgId ?? membership.org_id) as number;
            token.orgRole = membership.role as string;
            token.orgName = (membership.orgName ?? membership.org_name) as string;
          }

          // Refresh super admin flag (picks up promotions without re-login)
          const saUser = get(`SELECT is_super_admin FROM users WHERE id = ?`, [Number(token.id)]);
          token.isSuperAdmin = !!saUser?.is_super_admin;

          // Load permissions for member role (owner/admin get null = full access)
          if (membership && membership.role === 'member') {
            const perms = getMemberPermissions(Number(token.orgId), Number(token.id));
            token.permissions = Object.fromEntries((perms as any[]).map((p: any) => [p.resource, p.action]));
          } else {
            token.permissions = null;
          }

          // Refresh org feature flags (Plan 034)
          if (token.isSuperAdmin) {
            token.orgFeatures = [...FEATURES];
          } else if (token.orgId) {
            const featureRows = getOrgFeatures(Number(token.orgId));
            const disabledSet = new Set(
              (featureRows as any[]).filter((r: any) => !r.enabled).map((r: any) => r.feature)
            );
            token.orgFeatures = FEATURES.filter(f => !disabledSet.has(f));
          } else {
            token.orgFeatures = [...FEATURES];
          }

          // Store in cache with TTL
          if (token.orgId) {
            const newCacheKey = `${token.id}:${token.orgId}`;
            jwtOrgCache.set(newCacheKey, {
              orgId: token.orgId,
              orgRole: token.orgRole as string,
              orgName: token.orgName as string,
              isSuperAdmin: !!token.isSuperAdmin,
              permissions: token.permissions ?? null,
              orgFeatures: token.orgFeatures ?? [...FEATURES],
              expiresAt: Date.now() + JWT_CACHE_TTL,
            });
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id)        session.user.id        = token.id;
      if (token.role)      session.user.role      = token.role;
      if (token.sessionId) session.user.sessionId = token.sessionId;
      if (token.orgId)     session.user.orgId     = token.orgId;
      if (token.orgRole)   session.user.orgRole   = token.orgRole;
      if (token.orgName)   session.user.orgName   = token.orgName;
      session.user.isSuperAdmin = token.isSuperAdmin;
      session.user.permissions = token.permissions;
      session.user.orgFeatures = token.orgFeatures;
      return session;
    },
  },
});
