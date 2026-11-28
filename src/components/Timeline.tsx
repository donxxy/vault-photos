import { useEffect, useMemo, useRef, useState } from "react";
import { groupByDate } from "~/utils/format";
import type { MediaItem } from "~/utils/api";
import * as Ic from "./icons";

const GAP = 4;
// Photo row heights (px) for each zoom step. Pinching on the grid moves between them, like Google Photos.
const STEPS_PHONE = [60, 85, 120, 170, 240];
const STEPS_WIDE = [110, 160, 220, 300, 360];
const DEFAULT_STEP = 2;
const STORE = "volta-grid-zoom";

function layoutRows(items: MediaItem[], width: number, target: number) {
  const rows: { items: MediaItem[]; h: number }[] = [];
  let cur: MediaItem[] = [], sum = 0;
  const ar = (m: MediaItem) => (m.width && m.height ? m.width / m.height : 1.5);
  for (const it of items) {
    cur.push(it); sum += ar(it);
    if (sum * target + GAP * (cur.length - 1) >= width) {
      rows.push({ items: cur, h: (width - GAP * (cur.length - 1)) / sum });
      cur = []; sum = 0;
    }
  }
  if (cur.length) rows.push({ items: cur, h: target }); // last row keeps the target height
  return rows;
}

type Props = {
  items: MediaItem[]; selected: Set<string>;
  onToggle: (id: string) => void; onOpen: (index: number) => void;
};

/** Justified grid grouped by day/month with a floating date pill that follows the scrollbar. */
export function Timeline({ items, selected, onToggle, onOpen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pill, setPill] = useState<{ label: string; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const groups = useMemo(() => groupByDate(items), [items]);
  const indexOf = useMemo(() => new Map(items.map((m, i) => [m.id, i])), [items]);
  const selecting = selected.size > 0;
  const [step, setStep] = useState(() => {
    try {
      const v = Number(localStorage.getItem(STORE));
      return Number.isInteger(v) && v >= 0 && v < STEPS_WIDE.length ? v : DEFAULT_STEP;
    } catch { return DEFAULT_STEP; }
  });
  useEffect(() => { try { localStorage.setItem(STORE, String(step)); } catch { /* private mode */ } }, [step]);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el); setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const secs = [...document.querySelectorAll<HTMLElement>("[data-pill]")];
      const current = [...secs].reverse().find((s) => s.getBoundingClientRect().top <= 140) ?? secs[0];
      if (!current) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      setPill({ label: current.dataset.pill ?? "", top: 90 + p * (window.innerHeight - 190) });
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setPill(null), 1400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(hideTimer.current); };
  }, []);

  // Pinch on the grid changes the photo size instead of zooming the whole page.
  useEffect(() => {
    const el = box.current; if (!el) return;
    const last = STEPS_WIDE.length - 1;
    let base = 0; // finger distance when the current step started
    const dist = (t: TouchList) =>
      Math.hypot((t[0]?.clientX ?? 0) - (t[1]?.clientX ?? 0), (t[0]?.clientY ?? 0) - (t[1]?.clientY ?? 0));
    const start = (e: TouchEvent) => { base = e.touches.length === 2 ? dist(e.touches) : 0; };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !base) return;
      e.preventDefault();
      const ratio = dist(e.touches) / base;
      if (ratio > 1.3) { setStep((s) => Math.min(last, s + 1)); base = dist(e.touches); }      // fingers apart: bigger photos
      else if (ratio < 0.77) { setStep((s) => Math.max(0, s - 1)); base = dist(e.touches); }  // fingers together: smaller photos
    };
    const end = (e: TouchEvent) => { if (e.touches.length < 2) base = 0; };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end);
    };
  }, []);

  const steps = width < 640 ? STEPS_PHONE : STEPS_WIDE;
  const target = steps[step] ?? steps[DEFAULT_STEP] ?? 120;

  return (
    <div ref={box} className="relative pr-6" style={{ touchAction: "pan-y" }}>
      {width > 0 && groups.map((g) => (
        <section key={g.key} data-pill={g.pill} className="mb-8">
          <h2 className="sticky top-16 z-10 mb-2 flex items-baseline gap-2 bg-white/90 py-2 backdrop-blur dark:bg-[#121212]/90">
            <span className="text-base font-medium">{g.label}</span>
            <span className="text-xs text-neutral-500">{g.sub && `${g.sub} · `}{g.items.length} item{g.items.length > 1 ? "s" : ""}</span>
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
            {layoutRows(g.items, width - 24, target).map((row, r) => (
              <div key={r} style={{ display: "flex", gap: GAP }}>
                {row.items.map((m) => {
                  const ar = m.width && m.height ? m.width / m.height : 1.5;
                  const on = selected.has(m.id);
                  return (
                    <div key={m.id} className="group relative overflow-hidden bg-neutral-100 dark:bg-neutral-800"
                      style={{ width: ar * row.h, height: row.h, flex: "0 0 auto" }}>
                      <button aria-label={`Open ${m.filename}`} className="absolute inset-0" onClick={() => (selecting ? onToggle(m.id) : onOpen(indexOf.get(m.id) ?? 0))}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/media/${m.id}?thumb=1`} alt="" loading="lazy" draggable={false}
                          className={`h-full w-full object-cover transition-transform ${on ? "scale-90 rounded-lg" : ""}`}
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
                      </button>
                      <button aria-label={on ? "Deselect" : "Select"} aria-pressed={on} onClick={() => onToggle(m.id)}
                        className={`absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-white text-white shadow ${on ? "bg-brand" : "bg-black/30 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"} ${selecting && !on ? "opacity-100" : ""}`}>
                        <Ic.Check />
                      </button>
                      {m.category === "VIDEO" && <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white"><Ic.Play /> Video</span>}
                      {m.favorite && <span className="pointer-events-none absolute right-2 top-2 text-white drop-shadow"><Ic.Star filled /></span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
      {pill && (
        <div aria-hidden className="pointer-events-none fixed right-3 z-40 rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-white shadow-lg dark:bg-neutral-200 dark:text-neutral-900" style={{ top: pill.top }}>{pill.label}</div>
      )}
    </div>
  );
}
