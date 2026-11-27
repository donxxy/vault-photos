import crypto from "crypto";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * "Unlocked" state for password-protected (hidden) albums.
 * It lives in a signed, httpOnly cookie that expires after 15 minutes, so a phone left open
 * goes back to locked by itself. The cookie only says WHICH albums were unlocked, never any password.
 */
const COOKIE = "volta_unlock";
const TTL_MS = 15 * 60 * 1000;

type Payload = { u: string; a: Record<string, number> }; // user id, album id -> expiry (ms)

const secret = () => process.env.NEXTAUTH_SECRET ?? "volta-dev-secret";
const sign = (body: string) => crypto.createHmac("sha256", secret()).update(body).digest("base64url");

function cookies(header = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readEntries(req: IncomingMessage, userId: string): Record<string, number> {
  const raw = cookies(req.headers.cookie)[COOKIE];
  if (!raw) return {};
  const [body, sig] = raw.split(".");
  if (!body || !sig) return {};
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return {};
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (p.u !== userId) return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(p.a).filter(([, exp]) => exp > now));
  } catch {
    return {};
  }
}

function write(res: ServerResponse, userId: string, entries: Record<string, number>) {
  const body = Buffer.from(JSON.stringify({ u: userId, a: entries } satisfies Payload)).toString("base64url");
  const secure = (process.env.NEXTAUTH_URL ?? "").startsWith("https");
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(`${body}.${sign(body)}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure ? "; Secure" : ""}`,
  );
}

/** Album ids this user has unlocked (and that have not expired). */
export const readUnlocked = (req: IncomingMessage, userId: string) => new Set(Object.keys(readEntries(req, userId)));

export function unlockAlbum(req: IncomingMessage, res: ServerResponse, userId: string, albumId: string) {
  write(res, userId, { ...readEntries(req, userId), [albumId]: Date.now() + TTL_MS });
}

export function lockAlbum(req: IncomingMessage, res: ServerResponse, userId: string, albumId: string) {
  const entries = readEntries(req, userId);
  delete entries[albumId];
  write(res, userId, entries);
}

// Brute-force guard: 5 wrong passwords per album, then a 10 minute pause (resets if the server restarts).
const fails = new Map<string, { n: number; until: number }>();
export function tooManyAttempts(key: string) {
  const f = fails.get(key);
  if (!f) return false;
  if (Date.now() > f.until) { fails.delete(key); return false; }
  return f.n >= 5;
}
export function recordFail(key: string) {
  const f = fails.get(key), now = Date.now();
  if (!f || now > f.until) fails.set(key, { n: 1, until: now + 10 * 60 * 1000 });
  else f.n++;
}
export const clearFails = (key: string) => void fails.delete(key);
