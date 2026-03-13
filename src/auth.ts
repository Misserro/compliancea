import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db-imports";
import { ensureDb } from "@/lib/server-utils";
import { authConfig } from "../auth.config";

// ─── Type augmentation ─────────────────────────────────────────────────────────
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role ?? "admin";
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
});
