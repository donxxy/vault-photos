import path from "path";
import fsp from "fs/promises";
import { db } from "./db";
import { HIDDEN_UNLOCK_KEY } from "./unlock";

export const ROOT = path.resolve(process.env.STORAGE_ROOT ?? "./storage");

/** Resolve a path stored in the DB, refusing anything that escapes the storage root. */
export function safeJoin(rel: string) {
  const p = path.resolve(ROOT, rel);
  if (!p.startsWith(ROOT + path.sep)) throw new Error("Invalid path");
  return p;
}

export async function removeFiles(m: { relPath: string; thumbRel: string | null }) {
  await fsp.rm(safeJoin(m.relPath), { force: true });
  if (m.thumbRel) await fsp.rm(safeJoin(m.thumbRel), { force: true });
}

/** Trash items older than 30 days are deleted from disk for good. */
export async function purgeExpired(userId: string) {
  const cutoff = new Date(Date.now() - 30 * 864e5);
  const old = await db.media.findMany({ where: { userId, deletedAt: { lt: cutoff } } });
  for (const m of old) await removeFiles(m);
  if (old.length) await db.media.deleteMany({ where: { id: { in: old.map((m) => m.id) } } });
}

/**
 * Owner can always read; other users only through an album shared with them.
 * Hidden photos are only served while the Hidden Photos section or a legacy hidden album is unlocked.
 * `hidden` tells the caller to send no-cache headers for them.
 */
export async function findViewable(userId: string, mediaId: string, unlocked: Set<string> = new Set()) {
  const m = await db.media.findUnique({ where: { id: mediaId } });
  if (!m) return null;
  const locks = await db.albumMedia.findMany({
    where: { mediaId, album: { lockHash: { not: null } } },
    select: { albumId: true },
  });
  const hidden = m.hiddenAt !== null || locks.length > 0;
  if (hidden && !unlocked.has(HIDDEN_UNLOCK_KEY) && !locks.some((l) => unlocked.has(l.albumId))) return null;
  if (m.userId === userId) return { media: m, hidden };
  if (m.deletedAt) return null;
  const shared = await db.albumMedia.findFirst({
    where: { mediaId, album: { shares: { some: { userId } } } },
  });
  return shared ? { media: m, hidden } : null;
}
