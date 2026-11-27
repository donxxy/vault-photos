import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "~/utils/api";
import { fmtBytes, fmtDuration, fmtUploaded } from "~/utils/format";
import { Chevron, Close } from "./icons";

type Status = "hashing" | "queued" | "uploading" | "done" | "duplicate" | "error";
type Up = {
  id: number; name: string; file: File; size: number; sent: number; status: Status;
  speed: number; hash?: string; finishedAt?: Date; thumb?: boolean; error?: string;
};
type Ctx = { pickFiles: () => void; pickFolder: () => void; enqueue: (f: File[]) => void };
const UploadCtx = createContext<Ctx>({ pickFiles() {}, pickFolder() {}, enqueue() {} });
export const useUploader = () => useContext(UploadCtx);

const OK = (f: File) => f.type.startsWith("image/") || f.type.startsWith("video/") || /\.(heic|heif|dng|arw|cr2|nef|raw)$/i.test(f.name);
const MAX_PARALLEL = 3;
const MAX_HASH_BYTES = 24 * 1024 * 1024; // photos are hashed here to skip re-uploads; bigger files (videos) are de-duplicated by the server instead
const MAX_LISTED = 60; // rows drawn in the queue panel; the rest are still uploaded and counted

async function sha256(file: File) {
  // crypto.subtle only exists on https:// or localhost; on plain http://nas.local the server dedupes instead.
  if (!globalThis.crypto?.subtle || file.size > MAX_HASH_BYTES) return undefined;
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function filesFromDrop(dt: DataTransfer) {
  const out: File[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = async (e: any): Promise<void> => {
    if (e.isFile) out.push(await new Promise<File>((r) => e.file(r)));
    else if (e.isDirectory) {
      const reader = e.createReader();
      let batch: unknown[];
      do { batch = await new Promise<unknown[]>((r) => reader.readEntries(r)); for (const c of batch) await walk(c); } while (batch.length);
    }
  };
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) for (const e of entries) await walk(e);
  else out.push(...dt.files);
  return out.filter(OK);
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const utils = api.useContext();
  const items = useRef<Up[]>([]);
  const nextId = useRef(1);
  const [, setTick] = useState(0);
  // Progress events fire many times a second per file; redraw the panel at most ~5x/s instead of on every event.
  const bumpTimer = useRef<ReturnType<typeof setTimeout>>();
  const bump = useCallback(() => {
    if (bumpTimer.current) return;
    bumpTimer.current = setTimeout(() => { bumpTimer.current = undefined; setTick((n) => n + 1); }, 200);
  }, []);
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const startedAt = useRef(0);

  // Reloading the library re-queries thousands of rows, so do it once when the whole batch is finished.
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const refresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { void utils.media.list.invalidate(); void utils.media.stats.invalidate(); void utils.media.memories.invalidate(); }, 300);
  }, [utils]);

  const pump = useCallback(() => {
    const running = items.current.filter((i) => i.status === "uploading" || i.status === "hashing").length;
    let free = Math.max(0, MAX_PARALLEL - running);
    // Walk oldest-first and stop early: with thousands of queued files we only need the next few.
    for (let k = items.current.length - 1; k >= 0 && free > 0; k--) {
      const it = items.current[k]!;
      if (it.status === "queued") { free--; void begin(it); }
    }
    if (!items.current.some((i) => i.status === "uploading" || i.status === "queued" || i.status === "hashing")) refresh();
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, bump]);

  /** Per-file pipeline: (small files) hash and ask the server if it already has it -> upload. Never blocks other files. */
  async function begin(it: Up) {
    it.status = "hashing"; bump();
    try {
      it.hash = await sha256(it.file);
      if (it.hash) {
        const known = await utils.media.checkHashes.fetch({ hashes: [it.hash] }, { staleTime: 0 });
        if (known.includes(it.hash)) {
          Object.assign(it, { status: "duplicate" as Status, sent: it.size, speed: 0, finishedAt: new Date() });
          return pump();
        }
      }
    } catch { /* hashing is only an optimisation; the server still de-duplicates */ }
    start(it);
  }

  function start(it: Up) {
    it.status = "uploading";
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/upload");
    xhr.setRequestHeader("x-filename", encodeURIComponent(it.name));
    xhr.setRequestHeader("x-last-modified", String(it.file.lastModified));
    xhr.setRequestHeader("Content-Type", it.file.type || "application/octet-stream");
    let lastT = performance.now(), lastB = 0;
    xhr.upload.onprogress = (e) => {
      const now = performance.now();
      if (now - lastT > 400) {
        const inst = ((e.loaded - lastB) / (now - lastT)) * 1000;
        it.speed = it.speed ? it.speed * 0.6 + inst * 0.4 : inst; // smoothed bytes/s
        lastT = now; lastB = e.loaded;
      }
      it.sent = e.loaded; bump();
    };
    const finish = (s: Status, extra: Partial<Up> = {}) => { Object.assign(it, { status: s, speed: 0, finishedAt: new Date() }, extra); pump(); };
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText) as { duplicate?: boolean; thumb?: boolean; error?: string };
        if (xhr.status >= 400) return finish("error", { error: r.error ?? "Upload failed" });
        it.sent = it.size;
        finish(r.duplicate ? "duplicate" : "done", { thumb: r.thumb });
      } catch { finish("error", { error: "Upload failed" }); }
    };
    xhr.onerror = () => finish("error", { error: "Network error" });
    xhr.send(it.file);
  }

  const enqueue = useCallback(async (files: File[]) => {
    const batch: Up[] = files.filter(OK).map((f) => ({
      id: nextId.current++, name: f.name, file: f, size: f.size, sent: 0, status: "queued" as Status, speed: 0,
    }));
    if (!batch.length) return;
    if (!items.current.some((i) => i.status === "uploading" || i.status === "queued")) startedAt.current = Date.now();
    items.current = [...batch, ...items.current];
    setDismissed(false); setOpen(true);
    pump(); // uploads start immediately instead of waiting for the whole batch to be read and hashed
  }, [pump]);

  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setDragging(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = async (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault(); setDragging(false);
      void enqueue(await filesFromDrop(e.dataTransfer));
    };
    window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [enqueue]);

  // Stable identity: otherwise every progress tick re-renders every page that calls useUploader().
  const ctx = useMemo<Ctx>(() => ({ pickFiles: () => fileInput.current?.click(), pickFolder: () => folderInput.current?.click(), enqueue: (f) => void enqueue(f) }), [enqueue]);

  const list = items.current;
  const active = list.filter((i) => ["hashing", "queued", "uploading"].includes(i.status));
  const real = list.filter((i) => i.status !== "duplicate");
  const total = real.reduce((a, i) => a + i.size, 0);
  const sent = real.reduce((a, i) => a + i.sent, 0);
  const speed = list.reduce((a, i) => a + i.speed, 0);
  const pct = total ? Math.min(100, Math.round((sent / total) * 100)) : 100;
  const eta = speed > 0 ? (total - sent) / speed : Infinity;
  const done = list.filter((i) => i.status === "done" || i.status === "duplicate").length;

  return (
    <UploadCtx.Provider value={ctx}>
      {children}
      <input ref={fileInput} type="file" multiple accept="image/*,video/*,.heic,.heif,.dng,.arw,.cr2,.nef" hidden
        onChange={(e) => { void enqueue([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {/* @ts-expect-error webkitdirectory is non-standard */}
      <input ref={folderInput} type="file" webkitdirectory="" multiple hidden
        onChange={(e) => { void enqueue([...(e.target.files ?? [])]); e.target.value = ""; }} />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-blue-600/10 backdrop-blur-[1px]">
          <div className="rounded-2xl border-2 border-dashed border-brand bg-white px-10 py-8 text-lg font-medium text-brand dark:bg-neutral-900">Drop photos, videos or folders to upload</div>
        </div>
      )}

      {list.length > 0 && !dismissed && (
        <section aria-label="Upload queue" className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          <header className="flex items-center gap-2 bg-neutral-50 px-4 py-3 dark:bg-neutral-800">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{active.length ? `Uploading ${active.length} item${active.length > 1 ? "s" : ""}` : `${done} upload${done !== 1 ? "s" : ""} complete`}</p>
              {active.length > 0 && <p className="text-xs text-neutral-500">{pct}% · {fmtBytes(speed)}/s · ETA {fmtDuration(eta)}</p>}
            </div>
            <button aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)} className="rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/10"><Chevron dir={open ? "down" : "up"} /></button>
            {!active.length && <button aria-label="Dismiss" onClick={() => { items.current = []; setDismissed(true); }} className="rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/10"><Close /></button>}
          </header>
          {active.length > 0 && <div className="h-1 bg-neutral-200 dark:bg-neutral-700"><div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} /></div>}
          {open && (
            <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
              {list.slice(0, MAX_LISTED).map((i) => (
                <li key={i.id} className="px-4 py-2.5 text-xs">
                  <div className="flex justify-between gap-2"><span className="truncate font-medium">{i.name}</span><span className="shrink-0 text-neutral-500">{i.status === "uploading" ? `${Math.round((i.sent / i.size) * 100)}%` : ""}</span></div>
                  {i.status === "uploading" && <div className="mt-1.5 h-1 rounded bg-neutral-200 dark:bg-neutral-700"><div className="h-full rounded bg-brand" style={{ width: `${(i.sent / i.size) * 100}%` }} /></div>}
                  <p className="mt-0.5 text-neutral-500">
                    {i.status === "hashing" && "Checking for duplicates…"}
                    {i.status === "queued" && `Waiting · ${fmtBytes(i.size)}`}
                    {i.status === "uploading" && `${fmtBytes(i.sent)} of ${fmtBytes(i.size)} · ${fmtBytes(i.speed)}/s`}
                    {i.status === "done" && `Uploaded ${fmtUploaded(i.finishedAt!)}${i.thumb ? " · Thumbnail ready" : ""}`}
                    {i.status === "duplicate" && "Already in your library, skipped"}
                    {i.status === "error" && <span className="text-red-600">{i.error}</span>}
                  </p>
                </li>
              ))}
              {list.length > MAX_LISTED && <li className="px-4 py-2.5 text-xs text-neutral-500">+ {list.length - MAX_LISTED} more</li>}
            </ul>
          )}
        </section>
      )}
    </UploadCtx.Provider>
  );
}
