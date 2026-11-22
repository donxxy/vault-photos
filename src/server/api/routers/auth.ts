import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import fsp from "fs/promises";
import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { ROOT, safeJoin } from "~/server/storage";

export const registerInput = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/, "3-32 letters, numbers, - or _"),
  name: z.string().trim().min(1).max(60),
  password: z.string().min(8, "At least 8 characters").max(128),
});

export const authRouter = createTRPCRouter({
  /** Open sign-up. The very first account becomes the NAS admin. */
  register: publicProcedure.input(registerInput).mutation(async ({ ctx, input }) => {
    const count = await ctx.db.user.count();
    if (count > 0 && process.env.ALLOW_SIGNUP === "false")
      throw new TRPCError({ code: "FORBIDDEN", message: "Sign-up is closed. Ask your admin to create an account." });
    if (await ctx.db.user.findUnique({ where: { username: input.username } }))
      throw new TRPCError({ code: "CONFLICT", message: "That username is taken." });
    const user = await ctx.db.user.create({
      data: {
        username: input.username,
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: count === 0 ? "ADMIN" : "USER",
      },
    });
    await fsp.mkdir(safeJoin(user.username), { recursive: true });
    return { ok: true, firstUser: count === 0, root: ROOT };
  }),
  changePassword: protectedProcedure
    .input(z.object({
      current: z.string(),
      next: z.string().min(8, "At least 8 characters").max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const u = await ctx.db.user.findUniqueOrThrow({ where: { id: ctx.session.user.id } });
      if (!(await bcrypt.compare(input.current, u.passwordHash)))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is wrong." });
      await ctx.db.user.update({
        where: { id: u.id },
        data: { passwordHash: await bcrypt.hash(input.next, 12) },
      });
      return { ok: true };
    }),
});
