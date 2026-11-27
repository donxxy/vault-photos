import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import { getServerSession } from "next-auth";
import superjson from "superjson";
import { authOptions } from "~/server/auth";
import { db } from "~/server/db";

export const createTRPCContext = async ({ req, res }: CreateNextContextOptions) => ({
  db,
  req,
  res,
  session: await getServerSession(req, res, authOptions),
});

const t = initTRPC.context<typeof createTRPCContext>().create({ transformer: superjson });

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { db: ctx.db, req: ctx.req, res: ctx.res, session: { ...ctx.session, user: ctx.session.user } } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});
