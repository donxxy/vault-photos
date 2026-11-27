import { TRPCError } from "@trpc/server";
import fsp from "fs/promises";
import type { Media, Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { ROOT, purgeExpired, removeFiles } from "~/server/storage";
import { readUnlocked } from "~/server/unlock";

const pub = (m: Media) => ({
  id: m.id, filename: m.filename, mime: m.mime, category: m.category, size: Number(m.size),
  width: m.width, height: m.height, takenAt: m.takenAt, uploadedAt: m.uploadedAt,
  favorite: m.favorite, lat: m.lat, lng: m.lng, camera: m.camera, deletedAt: m.deletedAt,
});
const ids = z.object({ ids: z.array(z.string()).min(1).max(1000) });

export const mediaRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      view: z.enum(["all", "favorites", "videos", "screenshots", "recent", "trash"]).default("all"),
      q: z.string().trim().max(100).optional(),
      albumId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      if (input.view === "trash") await purgeExpired(uid);
      const and: Prisma.MediaWhereInput[] = [];
      // Photos in a hidden (password) album never show in the timeline, search, favorites, trash or memories.
      const notHidden: Prisma.MediaWhereInput = { albums: { none: { album: { lockHash: { not: null } } } } };
      let where: Prisma.MediaWhereInput;
      if (input.albumId) {
        const a = await ctx.db.album.findFirst({
          where: { id: input.albumId, OR: [{ userId: uid }, { shares: { some: { userId: uid } } }] },
        });
        if (!a) throw new TRPCError({ code: "NOT_FOUND" });
        const isLocked = a.lockHash !== null;
        if (isLocked && !readUnlocked(ctx.req, uid).has(a.id)) throw new TRPCError({ code: "FORBIDDEN", message: "LOCKED" });
        where = { deletedAt: null, albums: { some: { albumId: a.id } } };
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
        userId: ctx.session.user.id, deletedAt: null, category: { in: ["PHOTO", "VIDEO"] },
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
