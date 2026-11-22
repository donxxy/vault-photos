import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import fs from "fs";
import fsp from "fs/promises";
import { authOptions } from "~/server/auth";
import { findViewable, safeJoin } from "~/server/storage";

/** Streams originals and thumbnails with HTTP byte-range support (needed for video seeking). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).end();
  const m = await findViewable(session.user.id, String(req.query.id));
  if (!m) return res.status(404).end();

  const thumb = req.query.thumb === "1" && !!m.thumbRel;
  let file: string;
  try { file = safeJoin(thumb ? m.thumbRel! : m.relPath); } catch { return res.status(400).end(); }
  const stat = await fsp.stat(file).catch(() => null);
  if (!stat) return res.status(404).end();

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", thumb ? "image/webp" : m.mime);
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (req.query.download === "1")
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(m.filename)}`);

  const range = req.headers.range;
  if (range) {
    const [s, e] = range.replace("bytes=", "").split("-");
    const start = parseInt(s ?? "", 10) || 0;
    const end = e ? Math.min(parseInt(e, 10), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) { res.setHeader("Content-Range", `bytes */${stat.size}`); return res.status(416).end(); }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(file).pipe(res);
  }
}
