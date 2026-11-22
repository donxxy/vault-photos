export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

export const fmtDuration = (s: number) => {
  if (!isFinite(s) || s <= 0) return "--";
  if (s < 60) return `${Math.ceil(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
};

export const fmtFull = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** "Uploaded Nov 22, 2026 at 10:38 PM" */
export const fmtUploaded = (d: Date) =>
  `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

export type Group<T> = { key: string; label: string; sub: string; pill: string; items: T[] };

/** Today / Yesterday / full date for the last 30 days, then one group per month. */
export function groupByDate<T extends { takenAt: Date }>(items: T[], now = new Date()): Group<T>[] {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const map = new Map<string, Group<T>>();
  for (const it of items) {
    const d = new Date(it.takenAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((startToday - day) / 864e5);
    const pill = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    let key: string, label: string, sub = "";
    if (diff <= 30) {
      key = `d${day}`;
      label = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : fmtFull(d);
      sub = diff <= 1 ? d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }) : "";
    } else {
      key = `m${d.getFullYear()}-${d.getMonth()}`;
      label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    const g = map.get(key) ?? { key, label, sub, pill, items: [] };
    g.items.push(it);
    map.set(key, g);
  }
  return [...map.values()];
}
