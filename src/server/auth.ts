import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Volta",
      credentials: { username: {}, password: {} },
      async authorize(creds) {
        if (!creds?.username || !creds.password) return null;
        const u = await db.user.findUnique({ where: { username: creds.username.trim().toLowerCase() } });
        if (!u || !(await bcrypt.compare(creds.password, u.passwordHash))) return null;
        return { id: u.id, name: u.name, username: u.username, role: u.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) { token.id = user.id; token.role = user.role; token.username = user.username; }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id ?? "";
      session.user.role = token.role ?? "USER";
      session.user.username = token.username ?? "";
      return session;
    },
  },
};
