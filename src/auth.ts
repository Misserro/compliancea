import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail, createSession, getSessionById, getOrgMemberByUserId, getOrgMemberForOrg } from "@/lib/db-imports";
import { ensureDb } from "@/lib/server-utils";
import { authConfig } from "../auth.config";

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
  }
}

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
      } else if (token.sessionId && token.id) {
        // Subsequent requests: lazy re-hydration in case DB was wiped on redeploy.
        // NOTE: this branch runs on every request (every auth() call), not only after cold starts.
        // getSessionById is a synchronous in-memory sql.js query so the cost is negligible.
        await ensureDb();
        const existing = getSessionById(token.sessionId);
        if (!existing) {
          createSession(token.sessionId, Number(token.id));
        }

        // Refresh org context — preserve chosen org across requests
        let membership: any = null;
        if (trigger === "update" && session?.switchToOrgId) {
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
      return session;
    },
  },
});
