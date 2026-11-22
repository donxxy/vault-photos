import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import fsp from "fs/promises";
import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "../trpc";
import { registerInput } from "./auth";
import { safeJoin } from "~/server/storage";

export const adminRouter = createTRPCRouter({
  users: adminProcedure.query(async ({ ctx }) => {
    const [users, usage] = await Promise.all([
      ctx.db.user.findMany({ orderBy: { createdAt: "asc" } }),
      ctx.db.media.groupBy({ by: ["userId"], _sum: { size: true }, _count: true }),
    ]);
    return users.map((u) => {
      const g = usage.find((x) => x.userId === u.id);
      return { id: u.id, username: u.username, name: u.name, role: u.role, quotaBytes: Number(u.quotaBytes),
        used: Number(g?._sum.size ?? 0), items: g?._count ?? 0 };
    });
  }),

  createUser: adminProcedure.input(registerInput.extend({ role: z.enum(["ADMIN", "USER"]).default("USER") }))
    .mutation(async ({ ctx, input }) => {
      if (await ctx.db.user.findUnique({ where: { username: input.username } }))
        throw new TRPCError({ code: "CONFLICT", message: "That username is taken." });
      const u = await ctx.db.user.create({ data: {
        username: input.username, name: input.name, role: input.role, passwordHash: await bcrypt.hash(input.password, 12),
      } });
      await fsp.mkdir(safeJoin(u.username), { recursive: true });
      return { id: u.id };
    }),

  setQuota: adminProcedure.input(z.object({ userId: z.string(), quotaGb: z.number().min(1).max(100000) }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({ where: { id: input.userId }, data: { quotaBytes: BigInt(Math.round(input.quotaGb * 1024 ** 3)) } })),

  setRole: adminProcedure.input(z.object({ userId: z.string(), role: z.enum(["ADMIN", "USER"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't change your own role." });
      return ctx.db.user.update({ where: { id: input.userId }, data: { role: input.role } });
    }),
});
