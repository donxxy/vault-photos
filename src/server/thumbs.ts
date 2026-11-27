import fsp from "fs/promises";
import path from "path";
import sharp from "sharp";
import { db } from "./db";
import { safeJoin } from "./storage";

// Each sharp job uses one libvips thread; we cap how many jobs run at once instead.
// Weak NAS CPUs choke when several full-size photos are decoded in parallel.
sharp.concurrency(1);
sharp.cache(false);

const MAX_JOBS = Math.max(1, Number(process.env.THUMB_CONCURRENCY ?? 2));
let running = 0;
const waiting: (() => void)[] = [];
const inflight = new Map<string, Promise<boolean>>();

async function acquire() {
  if (running < MAX_JOBS) { running++; return; }
  await new Promise<void>((resolve) => waiting.push(resolve)); // slot is handed over by release()
}
function release() {
  const next = waiting.shift();
  if (next) next(); else running--;
}

type ThumbSrc = { id: string; relPath: string; thumbRel: string };

async function make(m: ThumbSrc): Promise<boolean> {
  const out = safeJoin(m.thumbRel);
  if (await fsp.stat(out).then(() => true, () => false)) return true;
  await acquire();
  try {
    await fsp.mkdir(path.dirname(out), { recursive: true });
    const buf = await sharp(safeJoin(m.relPath), { sequentialRead: true, failOn: "none" })
      .rotate()
      .resize({ height: 360, withoutEnlargement: true })
      .webp({ quality: 78, effort: 3 })
      .toBuffer();
    const tmp = `${out}.tmp`;
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, out); // atomic: readers never see a half-written thumbnail
    return true;
  } catch {
    // e.g. HEIC without libheif: remember that there is no thumbnail so the original is served instead
    await db.media.update({ where: { id: m.id }, data: { thumbRel: null } }).catch(() => undefined);
    return false;
  } finally {
    release();
  }
}

/** Generates a thumbnail at most once at a time per photo, through a small shared queue. */
export function ensureThumb(m: ThumbSrc) {
  let p = inflight.get(m.id);
  if (!p) {
    p = make(m).finally(() => inflight.delete(m.id));
    inflight.set(m.id, p);
  }
  return p;
}
