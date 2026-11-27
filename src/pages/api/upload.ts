import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import sharp from "sharp";
import exifr from "exifr";
import { authOptions } from "~/server/auth";
import { db } from "~/server/db";
import { safeJoin } from "~/server/storage";
import { ensureThumb } from "~/server/thumbs";

export const config = { api: { bodyParser: false } };

const RAW = /\.(heic|heif|dng|arw|cr2|nef|raw)$/i;

/** One file per request: PUT /api/upload  (headers: x-filename, x-last-modified; body: raw bytes). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PUT") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: "Not signed in" });
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return res.status(401).json({ error: "Not signed in" });

  const filename = decodeURIComponent(String(req.headers["x-filename"] ?? "file")).replace(/[\\/]/g, "_").slice(0, 200);
  const mime = String(req.headers["content-type"] ?? "application/octet-stream");
  const isVideo = mime.startsWith("video/");
  if (!isVideo && !mime.startsWith("image/") && !RAW.test(filename)) return res.status(415).json({ error: "Only photos and videos" });

  const incoming = Number(req.headers["content-length"] ?? 0);
  const used = Number((await db.media.aggregate({ where: { userId: user.id }, _sum: { size: true } }))._sum.size ?? 0);
  if (used + incoming > Number(user.quotaBytes)) return res.status(413).json({ error: "Storage quota reached" });

  const tmp = safeJoin(path.join(user.username, ".tmp", crypto.randomUUID()));
  await fsp.mkdir(path.dirname(tmp), { recursive: true });
  const hash = crypto.createHash("sha256");
  try {
    // Hash while streaming to disk: no second pass over the file. Big write buffer = fewer syscalls on NAS disks.
    await pipeline(
      req,
      async function* (src: AsyncIterable<Buffer>) { for await (const c of src) { hash.update(c); yield c; } },
      fs.createWriteStream(tmp, { highWaterMark: 1 << 20 }),
    );
  } catch { await fsp.rm(tmp, { force: true }); return res.status(400).json({ error: "Upload interrupted" }); }
  const sha = hash.digest("hex");

  const dup = await db.media.findUnique({ where: { userId_sha256: { userId: user.id, sha256: sha } } });
  if (dup) { await fsp.rm(tmp, { force: true }); return res.json({ duplicate: true, id: dup.id }); }

  const id = crypto.randomUUID().replace(/-/g, "");
  const stat = await fsp.stat(tmp);
  let width: number | null = null, height: number | null = null, thumbRel: string | null = null;
  let takenAt = new Date(Number(req.headers["x-last-modified"]) || Date.now());
  let lat: number | null = null, lng: number | null = null, camera: string | null = null, hasMake = false;

  if (!isVideo) {
    try {
      // Only the blocks we use: skipping XMP/ICC/maker notes makes parsing much cheaper on big photos.
      const ex = await exifr.parse(tmp, {
        gps: true, tiff: true, exif: true,
        xmp: false, icc: false, iptc: false, jfif: false, ihdr: false, ifd1: false, interop: false, makerNote: false, userComment: false,
      });
      if (ex) {
        if (ex.DateTimeOriginal instanceof Date) takenAt = ex.DateTimeOriginal;
        if (typeof ex.latitude === "number") { lat = ex.latitude; lng = ex.longitude; }
        if (ex.Model) camera = [ex.Make, ex.Model].filter(Boolean).join(" ");
        hasMake = !!ex.Make;
      }
    } catch { /* no EXIF */ }
    try {
      const meta = await sharp(tmp).metadata(); // header only, cheap
      const swap = (meta.orientation ?? 1) >= 5;
      width = (swap ? meta.height : meta.width) ?? null;
      height = (swap ? meta.width : meta.height) ?? null;
      thumbRel = path.join(user.username, ".thumbs", `${id}.webp`); // generated after the response, see ensureThumb below
    } catch { thumbRel = null; /* e.g. HEIC without libheif: original still served */ }
  }

  const category = isVideo ? "VIDEO" : mime === "image/png" && !hasMake ? "SCREENSHOT" : "PHOTO";
  const rel = path.join(user.username, String(takenAt.getFullYear()), String(takenAt.getMonth() + 1).padStart(2, "0"), `${id}-${filename}`);
  await fsp.mkdir(path.dirname(safeJoin(rel)), { recursive: true });
  await fsp.rename(tmp, safeJoin(rel));

  let m;
  try {
    m = await db.media.create({ data: {
      id, userId: user.id, filename, relPath: rel, thumbRel, mime, category, size: BigInt(stat.size), sha256: sha,
      width, height, takenAt, lat, lng, camera,
    } });
  } catch (e) {
    // Two identical files uploaded at the same moment: the other request won the unique (userId, sha256) race.
    await fsp.rm(safeJoin(rel), { force: true });
    if ((e as { code?: string }).code === "P2002") {
      const again = await db.media.findUnique({ where: { userId_sha256: { userId: user.id, sha256: sha } } });
      return res.json({ duplicate: true, id: again?.id });
    }
    throw e;
  }

  // Reply now; the thumbnail is built in the background through a small queue (and on demand if the grid asks first).
  if (thumbRel) void ensureThumb({ id, relPath: rel, thumbRel });
  res.json({ id: m.id, duplicate: false });
}
