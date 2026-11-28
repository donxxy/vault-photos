import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import fsp from "fs/promises";
import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "../trpc";
import { registerInput } from "./auth";
import { getUploadSubdir, normalizeUploadSubdir, ROOT, safeJoin, UPLOAD_SUBDIR_KEY } from "~/server/storage";
import { getContainerMetrics } from "~/server/container-metrics";

export const adminRouter = createTRPCRouter({
  dashboard: adminProcedure.query(async ({ ctx }) => {
    const [uploadSubdir, metrics, usage] = await Promise.all([
      getUploadSubdir(),
      getContainerMetrics(),
      ctx.db.media.aggregate({ _sum: { size: true }, _count: true }),
    ]);
    let totalBytes = 0, freeBytes = 0;
    try {
      const disk = await fsp.statfs(ROOT);
      totalBytes = Number(disk.blocks) * Number(disk.bsize);
      freeBytes = Number(disk.bavail) * Number(disk.bsize);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || !["ENOSYS", "EACCES", "EPERM"].includes(String(error.code)))
        throw error;
    }
    return {
      ...metrics,
      storage: {
        root: ROOT,
        uploadSubdir,
        totalBytes,
        freeBytes,
        usedBytes: totalBytes - freeBytes,
        libraryBytes: Number(usage._sum.size ?? 0),
        mediaCount: usage._count,
      },
    };
  }),

  setUploadSubdir: adminProcedure.input(z.object({ folder: z.string().trim().max(120) }))
    .mutation(async ({ ctx, input }) => {
      let folder: string;
      try {
        folder = normalizeUploadSubdir(input.folder);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a folder inside the mounted photo share." });
      }
      if (folder) await fsp.mkdir(safeJoin(folder), { recursive: true });
      await ctx.db.appSetting.upsert({
        where: { key: UPLOAD_SUBDIR_KEY },
        create: { key: UPLOAD_SUBDIR_KEY, value: folder },
        update: { value: folder },
      });
      return { folder };
    }),

  users: adminProcedure.query(async ({ ctx }) => {
    const [users, usage] = await Promise.all([
      ctx.db.user.findMany({ orderBy: { createdAt: "asc" } }),
      ctx.db.media.groupBy({ by: ["userId"], _sum: { size: true }, _count: true, _max: { uploadedAt: true } }),
    ]);
    return users.map((u) => {
      const g = usage.find((x) => x.userId === u.id);
      return { id: u.id, username: u.username, name: u.name, role: u.role, quotaBytes: Number(u.quotaBytes),
        used: Number(g?._sum.size ?? 0), items: g?._count ?? 0, lastUploadAt: g?._max.uploadedAt ?? null };
    });
  }),

  uploadActivity: adminProcedure.query(async ({ ctx }) => {
    const uploads = await ctx.db.media.findMany({
      where: {
        deletedAt: null, hiddenAt: null,
        albums: { none: { album: { lockHash: { not: null } } } },
      },
      orderBy: { uploadedAt: "desc" },
      take: 50,
      select: {
        id: true, filename: true, mime: true, size: true, uploadedAt: true,
        user: { select: { name: true, username: true } },
      },
    });
    return uploads.map((upload) => ({ ...upload, size: Number(upload.size) }));
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
