import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { clearFails, lockAlbum, readUnlocked, recordFail, tooManyAttempts, unlockAlbum } from "~/server/unlock";

export const albumRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const uid = ctx.session.user.id;
    const unlocked = readUnlocked(ctx.req, uid);
    const rows = await ctx.db.album.findMany({
      where: { OR: [{ userId: uid }, { shares: { some: { userId: uid } } }] },
      include: {
        user: { select: { name: true, username: true } },
        shares: { include: { user: { select: { username: true } } } },
        _count: { select: { items: true } },
        items: { take: 1, orderBy: { position: "asc" }, select: { mediaId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((a) => {
      const locked = a.lockHash !== null;
      const open = !locked || unlocked.has(a.id);
      return {
        id: a.id, name: a.name, owner: a.user.name, mine: a.userId === uid,
        locked, unlocked: open,
        // a locked album reveals neither its size nor its cover
        count: open ? a._count.items : 0,
        coverId: open ? (a.coverId ?? a.items[0]?.mediaId ?? null) : null,
        canAdd: a.userId === uid || a.shares.some((s) => s.userId === uid && s.canAdd),
        sharedWith: a.shares.map((s) => ({ username: s.user.username, canAdd: s.canAdd })),
      };
    });
  }),

  create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(80) }))
    .mutation(({ ctx, input }) => ctx.db.album.create({ data: { name: input.name, userId: ctx.session.user.id } })),

  rename: protectedProcedure.input(z.object({ id: z.string(), name: z.string().trim().min(1).max(80) }))
    .mutation(({ ctx, input }) =>
      ctx.db.album.updateMany({ where: { id: input.id, userId: ctx.session.user.id }, data: { name: input.name } })),

  /** Deleting a hidden album would put its photos back in the main library, so it needs the album unlocked. */
  remove: protectedProcedure.input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      const a = await ctx.db.album.findFirst({ where: { id: input.id, userId: uid } });
      if (!a) throw new TRPCError({ code: "NOT_FOUND" });
      if (a.lockHash && !readUnlocked(ctx.req, uid).has(a.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Unlock the album first." });
      return ctx.db.album.delete({ where: { id: a.id } });
    }),

  setCover: protectedProcedure.input(z.object({ id: z.string(), mediaId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.album.updateMany({ where: { id: input.id, userId: ctx.session.user.id }, data: { coverId: input.mediaId } })),

  /** Owner, or a user the album was shared with "Can add photos". Photos added must belong to the caller. */
  addItems: protectedProcedure.input(z.object({ id: z.string(), mediaIds: z.array(z.string()).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      const album = await ctx.db.album.findFirst({
        where: { id: input.id, OR: [{ userId: uid }, { shares: { some: { userId: uid, canAdd: true } } }] },
      });
      if (!album) throw new TRPCError({ code: "FORBIDDEN" });
      const mine = await ctx.db.media.findMany({
        where: { id: { in: input.mediaIds }, userId: uid, deletedAt: null }, select: { id: true },
      });
      const last = await ctx.db.albumMedia.aggregate({ where: { albumId: album.id }, _max: { position: true } });
      let pos = (last._max.position ?? -1) + 1;
      for (const m of mine)
        await ctx.db.albumMedia.upsert({
          where: { albumId_mediaId: { albumId: album.id, mediaId: m.id } },
          create: { albumId: album.id, mediaId: m.id, position: pos++ }, update: {},
        });
      return { added: mine.length };
    }),

  removeItems: protectedProcedure.input(z.object({ id: z.string(), mediaIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      const a = await ctx.db.album.findFirst({ where: { id: input.id, userId: uid } });
      if (!a) throw new TRPCError({ code: "FORBIDDEN" });
      if (a.lockHash && !readUnlocked(ctx.req, uid).has(a.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Unlock the album first." });
      return ctx.db.albumMedia.deleteMany({
        where: a.lockHash
          ? { mediaId: { in: input.mediaIds }, album: { userId: uid, lockHash: { not: null } } }
          : { albumId: a.id, mediaId: { in: input.mediaIds } },
      });
    }),

  share: protectedProcedure
    .input(z.object({ id: z.string(), username: z.string().trim().toLowerCase(), canAdd: z.boolean(), revoke: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.db.album.findFirst({ where: { id: input.id, userId: ctx.session.user.id } });
      if (!a) throw new TRPCError({ code: "FORBIDDEN" });
      if (a.lockHash && !input.revoke) throw new TRPCError({ code: "BAD_REQUEST", message: "Hidden albums can't be shared." });
      const u = await ctx.db.user.findUnique({ where: { username: input.username } });
      if (!u || u.id === a.userId) throw new TRPCError({ code: "NOT_FOUND", message: "No other user with that username." });
      if (input.revoke) return ctx.db.albumShare.deleteMany({ where: { albumId: a.id, userId: u.id } });
      return ctx.db.albumShare.upsert({
        where: { albumId_userId: { albumId: a.id, userId: u.id } },
        create: { albumId: a.id, userId: u.id, canAdd: input.canAdd }, update: { canAdd: input.canAdd },
      });
    }),

  /** Hide an album behind a password. Its photos leave the main library until the password is removed. */
  setLock: protectedProcedure.input(z.object({ id: z.string(), password: z.string().min(4).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      const a = await ctx.db.album.findFirst({ where: { id: input.id, userId: uid }, include: { _count: { select: { shares: true } } } });
      if (!a) throw new TRPCError({ code: "FORBIDDEN" });
      if (a._count.shares > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Stop sharing this album before hiding it." });
      await ctx.db.album.update({ where: { id: a.id }, data: { lockHash: await bcrypt.hash(input.password, 12) } });
      lockAlbum(ctx.req, ctx.res, uid, a.id);
      return { ok: true };
    }),

  unlock: protectedProcedure.input(z.object({ id: z.string(), password: z.string().max(128) }))
    .mutation(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      const key = `${uid}:${input.id}`;
      if (tooManyAttempts(key)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many wrong passwords. Try again in 10 minutes." });
      const a = await ctx.db.album.findFirst({ where: { id: input.id, userId: uid } });
      if (!a?.lockHash) throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await bcrypt.compare(input.password, a.lockHash))) {
        recordFail(key);
        throw new TRPCError({ code: "FORBIDDEN", message: "Wrong password." });
      }
      clearFails(key);
      unlockAlbum(ctx.req, ctx.res, uid, a.id);
      return { ok: true };
    }),

  lockNow: protectedProcedure.input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      lockAlbum(ctx.req, ctx.res, ctx.session.user.id, input.id);
      return { ok: true };
    }),

  /** Turn a hidden album back into a normal one (needs the password). Its photos return to the main library. */
  removeLock: protectedProcedure.input(z.object({ id: z.string(), password: z.string().max(128) }))
    .mutation(async ({ ctx, input }) => {
      const uid = ctx.session.user.id;
      const key = `${uid}:${input.id}`;
      if (tooManyAttempts(key)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many wrong passwords. Try again in 10 minutes." });
      const a = await ctx.db.album.findFirst({ where: { id: input.id, userId: uid } });
      if (!a?.lockHash) throw new TRPCError({ code: "NOT_FOUND" });
      if (!(await bcrypt.compare(input.password, a.lockHash))) {
        recordFail(key);
        throw new TRPCError({ code: "FORBIDDEN", message: "Wrong password." });
      }
      clearFails(key);
      await ctx.db.album.update({ where: { id: a.id }, data: { lockHash: null } });
      lockAlbum(ctx.req, ctx.res, uid, a.id);
      return { ok: true };
    }),
});
