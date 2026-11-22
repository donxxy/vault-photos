import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const albumRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const uid = ctx.session.user.id;
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
    return rows.map((a) => ({
      id: a.id, name: a.name, count: a._count.items, owner: a.user.name, mine: a.userId === uid,
      coverId: a.coverId ?? a.items[0]?.mediaId ?? null,
      canAdd: a.userId === uid || a.shares.some((s) => s.userId === uid && s.canAdd),
      sharedWith: a.shares.map((s) => ({ username: s.user.username, canAdd: s.canAdd })),
    }));
  }),

  create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(80) }))
    .mutation(({ ctx, input }) => ctx.db.album.create({ data: { name: input.name, userId: ctx.session.user.id } })),

  rename: protectedProcedure.input(z.object({ id: z.string(), name: z.string().trim().min(1).max(80) }))
    .mutation(({ ctx, input }) =>
      ctx.db.album.updateMany({ where: { id: input.id, userId: ctx.session.user.id }, data: { name: input.name } })),

  remove: protectedProcedure.input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.db.album.deleteMany({ where: { id: input.id, userId: ctx.session.user.id } })),

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
      const a = await ctx.db.album.findFirst({ where: { id: input.id, userId: ctx.session.user.id } });
      if (!a) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.db.albumMedia.deleteMany({ where: { albumId: a.id, mediaId: { in: input.mediaIds } } });
    }),

  share: protectedProcedure
    .input(z.object({ id: z.string(), username: z.string().trim().toLowerCase(), canAdd: z.boolean(), revoke: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.db.album.findFirst({ where: { id: input.id, userId: ctx.session.user.id } });
      if (!a) throw new TRPCError({ code: "FORBIDDEN" });
      const u = await ctx.db.user.findUnique({ where: { username: input.username } });
      if (!u || u.id === a.userId) throw new TRPCError({ code: "NOT_FOUND", message: "No other user with that username." });
      if (input.revoke) return ctx.db.albumShare.deleteMany({ where: { albumId: a.id, userId: u.id } });
      return ctx.db.albumShare.upsert({
        where: { albumId_userId: { albumId: a.id, userId: u.id } },
        create: { albumId: a.id, userId: u.id, canAdd: input.canAdd }, update: { canAdd: input.canAdd },
      });
    }),
});
