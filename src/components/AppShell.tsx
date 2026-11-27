import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "~/utils/api";
import { fmtBytes } from "~/utils/format";
import { Logo } from "./Logo";
import * as Ic from "./icons";
import { UploadProvider, useUploader } from "./UploadManager";

type Ctx = { v?: string; p: string; tab?: string; album?: string };
const NAV = [
  { href: "/", label: "Photos", icon: <Ic.Photo />, tab: true, match: ({ v, p, album }: Ctx) => p === "/" && !v && !album },
  { href: "/albums", label: "Albums", icon: <Ic.Album />, tab: true, match: ({ p, tab, album }: Ctx) => (p === "/albums" && tab !== "shared") || (p === "/" && !!album) },
  { href: "/albums?tab=hidden", label: "Hidden", icon: <Ic.Lock />, tab: false, match: ({ p, tab }: Ctx) => p === "/albums" && tab === "hidden" },
  { href: "/albums?tab=shared", label: "Sharing", icon: <Ic.People />, tab: true, match: ({ p, tab }: Ctx) => p === "/albums" && tab === "shared" },
  { href: "/?view=favorites", label: "Favorites", icon: <Ic.Star />, tab: false, match: ({ v }: Ctx) => v === "favorites" },
  { href: "/?view=trash", label: "Trash", icon: <Ic.Trash />, tab: false, match: ({ v }: Ctx) => v === "trash" },
];
const ADMIN = { href: "/admin", label: "Admin", icon: <Ic.Shield />, tab: false, match: ({ p }: Ctx) => p === "/admin" };

function Storage() {
  const { data } = api.media.stats.useQuery(undefined, { refetchInterval: 30000 });
  if (!data) return null;
  const pct = Math.min(100, (data.used / data.quota) * 100);
  return (
    <div className="mt-auto space-y-2 border-t border-neutral-200 p-4 text-xs dark:border-neutral-800">
      <div className="flex justify-between"><span className="font-medium">Your storage</span><span>{Math.round(pct)}%</span></div>
      <div className="h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700"><div className={`h-full ${pct > 90 ? "bg-red-500" : "bg-brand"}`} style={{ width: `${pct}%` }} /></div>
      <p className="text-neutral-500">{fmtBytes(data.used)} of {fmtBytes(data.quota)} · {data.photos} photos, {data.videos} videos</p>
      {data.disk && <p className="text-neutral-500">NAS drive: {fmtBytes(data.disk.free)} free of {fmtBytes(data.disk.total)}</p>}
    </div>
  );
}

const toggleTheme = () => {
  const d = document.documentElement.classList.toggle("dark");
  try { localStorage.setItem("theme", d ? "dark" : "light"); } catch { /* private mode */ }
};

function Header({ override }: { override?: ReactNode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { pickFiles, pickFolder } = useUploader();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<"up" | "user" | null>(null);
  useEffect(() => setQ(typeof router.query.q === "string" ? router.query.q : ""), [router.query.q]);
  useEffect(() => setMenu(null), [router.asPath]);

  return (
    <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-2 border-b border-neutral-200 bg-white/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-neutral-800 dark:bg-[#121212]/95 sm:gap-3 sm:px-4">
      {override ?? (
        <>
          <Link href="/" aria-label="Volta" className="shrink-0 md:hidden"><Logo size={26} /></Link>
          <form className="relative min-w-0 max-w-2xl flex-1" onSubmit={(e) => { e.preventDefault(); void router.push({ pathname: "/", query: q ? { q } : {} }); }}>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 sm:left-4"><Ic.Search /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search photos" aria-label="Search" enterKeyHint="search"
              className="h-11 w-full rounded-full bg-neutral-100 pl-11 pr-4 text-sm outline-none transition focus:bg-white focus:shadow-md dark:bg-neutral-800 dark:focus:bg-neutral-900 sm:pl-12" />
          </form>
          <div className="relative ml-auto shrink-0">
            <button aria-label="Upload" onClick={() => setMenu(menu === "up" ? null : "up")}
              className="flex h-10 w-10 items-center justify-center gap-2 rounded-full bg-blue-50 text-sm font-medium text-brand hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 sm:w-auto sm:px-4"><Ic.Upload /><span className="hidden sm:inline">Upload</span></button>
            {menu === "up" && (
              <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900" onClick={() => setMenu(null)}>
                <button className="block w-full px-4 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={pickFiles}>Photos and videos</button>
                <button className="hidden w-full px-4 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 md:block" onClick={pickFolder}>Folder</button>
              </div>
            )}
          </div>
          <button aria-label="Toggle dark mode" onClick={toggleTheme} className="hidden shrink-0 rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 sm:block"><Ic.Moon /></button>
          <div className="relative shrink-0">
            <button aria-label="Account" onClick={() => setMenu(menu === "user" ? null : "user")} className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-medium text-white">{(session?.user?.name ?? "?").slice(0, 1).toUpperCase()}</button>
            {menu === "user" && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-neutral-200 bg-white p-2 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                <p className="px-3 py-2"><span className="block font-medium">{session?.user?.name}</span><span className="text-xs text-neutral-500">@{session?.user?.username} · {session?.user?.role === "ADMIN" ? "Admin" : "Member"}</span></p>
                <Link href="/account" className="block rounded px-3 py-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">Change password</Link>
                <button className="w-full rounded px-3 py-2.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>
              </div>
            )}
          </div>
        </>
      )}
    </header>
  );
}

export function AppShell({ children, headerOverride }: { children: ReactNode; headerOverride?: ReactNode }) {
  const router = useRouter();
  const { status, data: session } = useSession({ required: true });
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [router.asPath]);
  if (status !== "authenticated") return <div className="grid min-h-screen place-items-center text-sm text-neutral-500">Loading…</div>;

  const q = router.query;
  const ctx: Ctx = {
    p: router.pathname, v: typeof q.view === "string" ? q.view : undefined,
    tab: typeof q.tab === "string" ? q.tab : undefined, album: typeof q.album === "string" ? q.album : undefined,
  };
  const nav = session.user.role === "ADMIN" ? [...NAV, ADMIN] : NAV;
  const moreItems = nav.filter((n) => !n.tab);
  const moreActive = moreItems.some((n) => n.match(ctx));

  return (
    <UploadProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800 md:flex">
          <Link href="/" className="flex h-16 items-center gap-3 px-5 text-lg font-medium"><Logo /> Volta</Link>
          <nav className="space-y-0.5 px-3" aria-label="Main">
            {nav.map((n) => {
              const on = n.match(ctx);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-4 rounded-full px-4 py-2.5 text-sm ${on ? "bg-blue-50 font-medium text-brand dark:bg-blue-950" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>{n.icon}{n.label}</Link>
              );
            })}
          </nav>
          <Storage />
        </aside>

        <div className="min-w-0 flex-1">
          <Header override={headerOverride} />
          <main className="px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 md:px-6 md:pb-24">{children}</main>
        </div>
      </div>

      {/* Phone navigation */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-neutral-800 dark:bg-[#121212] md:hidden">
        {nav.filter((n) => n.tab).map((n) => {
          const on = n.match(ctx);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${on ? "font-medium text-brand" : "text-neutral-600 dark:text-neutral-400"}`}>{n.icon}{n.label}</Link>
          );
        })}
        <button onClick={() => setMore(true)} aria-haspopup="dialog" className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${moreActive ? "font-medium text-brand" : "text-neutral-600 dark:text-neutral-400"}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>More
        </button>
      </nav>

      {more && (
        <div role="dialog" aria-modal="true" aria-label="More" className="fixed inset-0 z-[55] flex items-end bg-black/40 md:hidden" onClick={() => setMore(false)}>
          <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mt-2 h-1 w-10 rounded bg-neutral-300 dark:bg-neutral-700" />
            <ul className="p-2">
              {moreItems.map((n) => (
                <li key={n.href}><Link href={n.href} className="flex items-center gap-4 rounded-lg px-4 py-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">{n.icon}{n.label}</Link></li>
              ))}
              <li><Link href="/account" className="flex items-center gap-4 rounded-lg px-4 py-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"><Ic.Shield />Change password</Link></li>
              <li><button onClick={toggleTheme} className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"><Ic.Moon />Dark mode</button></li>
              <li><button onClick={() => void signOut({ callbackUrl: "/login" })} className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"><Ic.Close />Sign out</button></li>
            </ul>
            <Storage />
          </div>
        </div>
      )}
    </UploadProvider>
  );
}
