import { useEffect, useState } from "react";
import type { MediaItem } from "~/utils/api";
import { fmtBytes, fmtFull } from "~/utils/format";
import * as Ic from "./icons";

type Props = {
  items: MediaItem[]; index: number; onIndex: (i: number) => void; onClose: () => void;
  onFavorite: (m: MediaItem) => void; onTrash?: (m: MediaItem) => void;
};

export function Lightbox({ items, index, onIndex, onClose, onFavorite, onTrash }: Props) {
  const m = items[index];
  const [info, setInfo] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => setZoom(false), [index]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      else if (e.key === "i") setInfo((v) => !v);
      else if (e.key === "z") setZoom((v) => !v);
    };
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = ""; };
  }, [index, items.length, onClose, onIndex]);

  if (!m) return null;
  const src = `/api/media/${m.id}`;
  const btn = "rounded-full p-2.5 text-white/90 hover:bg-white/15";
  const rows: [string, string][] = [
    ["File", m.filename], ["Taken", `${fmtFull(new Date(m.takenAt))}`],
    ["Size", fmtBytes(m.size)], ...(m.width && m.height ? [["Resolution", `${m.width} × ${m.height}`] as [string, string]] : []),
    ...(m.camera ? [["Camera", m.camera] as [string, string]] : []),
    ...(m.lat != null && m.lng != null ? [["Location", `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`] as [string, string]] : []),
  ];

  return (
    <div role="dialog" aria-modal="true" aria-label={m.filename} className="fixed inset-0 z-[70] flex bg-black/95">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 px-3 py-2">
          <button aria-label="Close" className={btn} onClick={onClose}><Ic.Close /></button>
          <span className="ml-2 truncate text-sm text-white/80">{m.filename}</span>
          <span className="flex-1" />
          <button aria-label="Zoom (z)" className={btn} onClick={() => setZoom(!zoom)}><Ic.Zoom /></button>
          <button aria-label="Favorite" className={btn} onClick={() => onFavorite(m)}><Ic.Star filled={m.favorite} /></button>
          <a aria-label="Download" className={btn} href={`${src}?download=1`}><Ic.Download /></a>
          {onTrash && <button aria-label="Move to trash" className={btn} onClick={() => onTrash(m)}><Ic.Trash /></button>}
          <button aria-label="Info (i)" className={btn} onClick={() => setInfo(!info)}><Ic.Info /></button>
        </div>
        <div className={`relative flex flex-1 items-center justify-center ${zoom ? "overflow-auto" : "overflow-hidden"}`}>
          {m.category === "VIDEO" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video key={m.id} src={src} controls autoPlay className="max-h-full max-w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.id} src={src} alt={m.filename} onClick={() => setZoom(!zoom)}
              className={zoom ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"} />
          )}
          {index > 0 && <button aria-label="Previous" className={`${btn} absolute left-3 top-1/2 -translate-y-1/2 bg-black/40`} onClick={() => onIndex(index - 1)}><Ic.Chevron dir="left" /></button>}
          {index < items.length - 1 && <button aria-label="Next" className={`${btn} absolute right-3 top-1/2 -translate-y-1/2 bg-black/40`} onClick={() => onIndex(index + 1)}><Ic.Chevron dir="right" /></button>}
        </div>
      </div>
      {info && (
        <aside className="w-80 shrink-0 overflow-y-auto bg-white p-5 text-sm dark:bg-neutral-900">
          <h2 className="mb-4 text-base font-medium">Info</h2>
          <dl className="space-y-3">{rows.map(([k, v]) => <div key={k}><dt className="text-xs text-neutral-500">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>
        </aside>
      )}
    </div>
  );
}
