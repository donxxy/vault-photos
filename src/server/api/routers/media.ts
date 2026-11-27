import { TRPCError } from "@trpc/server";
import fsp from "fs/promises";
import bcrypt from "bcryptjs";
import type { Media, Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { ROOT, purgeExpired, removeFiles } from "~/server/storage";
import { clearFails, HIDDEN_UNLOCK_KEY, lockAlbum, readUnlocked, recordFail, tooManyAttempts, unlockAlbum } from "~/server/unlock";

const pub = (m: Media) => ({
  id: m.id, filename: m.filename, mime: m.mime, category: m.category, size: Number(m.size),
  width: m.width, height: m.height, takenAt: m.takenAt, uploadedAt: m.uploadedAt,
  favorite: m.favorite, lat: m.lat, lng: m.lng, camera: m.camera, deletedAt: m.deletedAt,
});
const ids = z.object({ ids: z.array(z.string()).min(1).max(1000) });

export const mediaRouter = createTRPCRouter({
  hiddenStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({ where: { id: ctx.session.user.id }, select: { hiddenPasswordHash: true } });
    return {
      configured: !!user.hiddenPasswordHash,
      unlocked: readUnlocked(ctx.req, ctx.session.user.id).has(HIDDEN_UNLOCK_KEY),
    };
  }),

  setHiddenPassword: protectedProcedure.input(z.object({ password: z.string().min(4).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: uid }, select: { hiddenPasswordHash: true } });
      if (user.hiddenPasswordHash) throw new TRPCError({ code: "BAD_REQUEST", message: "A Hidden Photos password is already set." });
      await ctx.db.user.update({ where: { id: uid }, data: { hiddenPasswordHash: await bcrypt.hash(input.password, 12) } });
      unlockAlbum(ctx.req, ctx.res, uid, HIDDEN_UNLOCK_KEY);
      return { ok: true };
    }),

  unlockHidden: protectedProcedure.input(z.object({ password: z.string().max(128) }))
    .mutation(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      const key = `${uid}:${HIDDEN_UNLOCK_KEY}`;
      if (tooManyAttempts(key)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many wrong passwords. Try again in 10 minutes." });
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: uid }, select: { hiddenPasswordHash: true } });
      if (!user.hiddenPasswordHash) throw new TRPCError({ code: "BAD_REQUEST", message: "Set a Hidden Photos password first." });
      if (!(await bcrypt.compare(input.password, user.hiddenPasswordHash))) {
        recordFail(key);
        throw new TRPCError({ code: "FORBIDDEN", message: "Wrong password." });
      }
      clearFails(key);
      unlockAlbum(ctx.req, ctx.res, uid, HIDDEN_UNLOCK_KEY);
      return { ok: true };
    }),

  lockHidden: protectedProcedure.mutation(({ ctx }) => {
    lockAlbum(ctx.req, ctx.res, ctx.session.user.id, HIDDEN_UNLOCK_KEY);
    return { ok: true };
  }),

  list: protectedProcedure
    .input(z.object({
      view: z.enum(["all", "favorites", "videos", "screenshots", "recent", "trash", "hidden"]).default("all"),
      q: z.string().trim().max(100).optional(),
      albumId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      if (input.view === "trash") await purgeExpired(uid);
      const and: Prisma.MediaWhereInput[] = [];
      const notHidden: Prisma.MediaWhereInput = {
        hiddenAt: null, albums: { none: { album: { lockHash: { not: null } } } },
      };
      let where: Prisma.MediaWhereInput;
      if (input.view === "hidden") {
        if (!readUnlocked(ctx.req, uid).has(HIDDEN_UNLOCK_KEY))
          throw new TRPCError({ code: "FORBIDDEN", message: "Unlock Hidden Photos first." });
        where = {
          userId: uid, deletedAt: null,
          OR: [{ hiddenAt: { not: null } }, { albums: { some: { album: { lockHash: { not: null } } } } }],
        };
      } else if (input.albumId) {
        const a = await ctx.db.album.findFirst({
          where: { id: input.albumId, OR: [{ userId: uid }, { shares: { some: { userId: uid } } }] },
        });
        if (!a) throw new TRPCError({ code: "NOT_FOUND" });
        const isLocked = a.lockHash !== null;
        if (isLocked && !readUnlocked(ctx.req, uid).has(a.id)) throw new TRPCError({ code: "FORBIDDEN", message: "LOCKED" });
        where = { deletedAt: null, hiddenAt: null, albums: { some: { albumId: a.id } } };
        if (!isLocked) and.push(notHidden); // a photo that also sits in a hidden album stays out of ordinary albums
      } else {
        where = { userId: uid, deletedAt: input.view === "trash" ? { not: null } : null };
        and.push(notHidden);
      }
      if (input.view === "favorites") where.favorite = true;
      if (input.view === "videos") where.category = "VIDEO";
      if (input.view === "screenshots") where.category = "SCREENSHOT";
      if (input.view === "recent") where.uploadedAt = { gte: new Date(Date.now() - 7 * 864e5) };
      if (input.q)
        and.push({ OR: [
          { filename: { contains: input.q } }, { camera: { contains: input.q } }, { ocrText: { contains: input.q } },
        ] });
      if (and.length) where.AND = and;
      const rows = await ctx.db.media.findMany({
        where, take: 5000,
        orderBy: input.view === "recent" ? { uploadedAt: "desc" } : { takenAt: "desc" },
      });
      return rows.map(pub);
    }),

  /** "On this day": photos taken on today's month/day in earlier years. */
  memories: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.media.findMany({
      where: {
        userId: ctx.session.user.id, deletedAt: null, hiddenAt: null, category: { in: ["PHOTO", "VIDEO"] },
        albums: { none: { album: { lockHash: { not: null } } } },
      },
      select: { id: true, takenAt: true }, orderBy: { takenAt: "desc" },
    });
    const now = new Date();
    const byYear = new Map<number, string[]>();
    for (const r of rows) {
      const y = r.takenAt.getFullYear();
      if (y < now.getFullYear() && r.takenAt.getMonth() === now.getMonth() && r.takenAt.getDate() === now.getDate())
        byYear.set(y, [...(byYear.get(y) ?? []), r.id]);
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0])
      .map(([year, mediaIds]) => ({ year, yearsAgo: now.getFullYear() - year, ids: mediaIds }));
  }),

  checkHashes: protectedProcedure
    .input(z.object({ hashes: z.array(z.string().length(64)).max(5000) }))
    .query(async ({ ctx, input }) => {
      const found = await ctx.db.media.findMany({
        where: { userId: ctx.session.user.id, sha256: { in: input.hashes } }, select: { sha256: true },
      });
      return found.map((f) => f.sha256);
    }),

  setFavorite: protectedProcedure.input(ids.extend({ value: z.boolean() })).mutation(({ ctx, input }) =>
    ctx.db.media.updateMany({ where: { id: { in: input.ids }, userId: ctx.session.user.id }, data: { favorite: input.value } })),

  setHidden: protectedProcedure.input(ids.extend({ hidden: z.boolean() })).mutation(async ({ ctx, input }) => {
    const uid = ctx.session.user.id;
    if (!input.hidden && !readUnlocked(ctx.req, uid).has(HIDDEN_UNLOCK_KEY))
      throw new TRPCError({ code: "FORBIDDEN", message: "Unlock Hidden Photos before unhiding items." });
    const result = await ctx.db.media.updateMany({
      where: { id: { in: input.ids }, userId: uid },
      data: { hiddenAt: input.hidden ? new Date() : null },
    });
    if (!input.hidden) {
      await ctx.db.albumMedia.deleteMany({
        where: { mediaId: { in: input.ids }, album: { userId: uid, lockHash: { not: null } } },
      });
    }
    return { updated: result.count };
  }),

  trash: protectedProcedure.input(ids).mutation(({ ctx, input }) =>
    ctx.db.media.updateMany({ where: { id: { in: input.ids }, userId: ctx.session.user.id }, data: { deletedAt: new Date() } })),

  restore: protectedProcedure.input(ids).mutation(({ ctx, input }) =>
    ctx.db.media.updateMany({ where: { id: { in: input.ids }, userId: ctx.session.user.id }, data: { deletedAt: null } })),

  deleteForever: protectedProcedure.input(ids).mutation(async ({ ctx, input }) => {
    const rows = await ctx.db.media.findMany({
      where: { id: { in: input.ids }, userId: ctx.session.user.id, deletedAt: { not: null } },
    });
    for (const m of rows) await removeFiles(m);
    await ctx.db.media.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    return { deleted: rows.length };
  }),

  /** Sidebar storage widget + admin overview. */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const uid = ctx.session.user.id;
    const [agg, user, photos, videos] = await Promise.all([
      ctx.db.media.aggregate({ where: { userId: uid }, _sum: { size: true } }),
      ctx.db.user.findUniqueOrThrow({ where: { id: uid } }),
      ctx.db.media.count({ where: { userId: uid, deletedAt: null, category: { not: "VIDEO" } } }),
      ctx.db.media.count({ where: { userId: uid, deletedAt: null, category: "VIDEO" } }),
    ]);
    let disk: { total: number; free: number } | null = null;
    try {
      await fsp.mkdir(ROOT, { recursive: true });
      const s = await fsp.statfs(ROOT);
      disk = { total: Number(s.blocks) * Number(s.bsize), free: Number(s.bavail) * Number(s.bsize) };
    } catch { /* statfs unavailable on this platform */ }
    return { used: Number(agg._sum.size ?? 0), quota: Number(user.quotaBytes), photos, videos, disk };
  }),
});
