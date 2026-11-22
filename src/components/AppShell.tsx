import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "~/utils/api";
import { fmtBytes } from "~/utils/format";
import { Logo } from "./Logo";
import * as Ic from "./icons";
import { UploadProvider, useUploader } from "./UploadManager";

const NAV = [
  { href: "/", label: "Photos", icon: <Ic.Photo />, match: (v?: string, p?: string) => p === "/" && !v },
  { href: "/albums", label: "Albums", icon: <Ic.Album />, match: (_v?: string, p?: string) => p === "/albums" },
  { href: "/albums?tab=shared", label: "Sharing", icon: <Ic.People />, match: () => false },
  { href: "/?view=favorites", label: "Favorites", icon: <Ic.Star />, match: (v?: string) => v === "favorites" },
  { href: "/?view=trash", label: "Trash", icon: <Ic.Trash />, match: (v?: string) => v === "trash" },
];

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

function Header({ override }: { override?: ReactNode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { pickFiles, pickFolder } = useUploader();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<"up" | "user" | null>(null);
  useEffect(() => setQ(typeof router.query.q === "string" ? router.query.q : ""), [router.query.q]);
  const toggleTheme = () => { const d = document.documentElement.classList.toggle("dark"); try { localStorage.setItem("theme", d ? "dark" : "light"); } catch { /* private mode */ } };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-neutral-200 bg-white/95 px-4 backdrop-blur dark:border-neutral-800 dark:bg-[#121212]/95">
      {override ?? (
        <>
          <form className="relative max-w-2xl flex-1" onSubmit={(e) => { e.preventDefault(); void router.push({ pathname: "/", query: q ? { q } : {} }); }}>
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500"><Ic.Search /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name, camera or text in photos" aria-label="Search"
              className="h-11 w-full rounded-full bg-neutral-100 pl-12 pr-4 text-sm outline-none transition focus:bg-white focus:shadow-md dark:bg-neutral-800 dark:focus:bg-neutral-900" />
          </form>
          <div className="relative ml-auto">
            <button onClick={() => setMenu(menu === "up" ? null : "up")} className="flex h-10 items-center gap-2 rounded-full bg-blue-50 px-4 text-sm font-medium text-brand hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900"><Ic.Upload /> Upload</button>
            {menu === "up" && (
              <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900" onClick={() => setMenu(null)}>
                <button className="block w-full px-4 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={pickFiles}>Files</button>
                <button className="block w-full px-4 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={pickFolder}>Folder</button>
              </div>
            )}
          </div>
          <button aria-label="Toggle dark mode" onClick={toggleTheme} className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><Ic.Moon /></button>
          <div className="relative">
            <button aria-label="Account" onClick={() => setMenu(menu === "user" ? null : "user")} className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-medium text-white">{(session?.user?.name ?? "?").slice(0, 1).toUpperCase()}</button>
            {menu === "user" && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-neutral-200 bg-white p-2 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                <p className="px-3 py-2"><span className="block font-medium">{session?.user?.name}</span><span className="text-xs text-neutral-500">@{session?.user?.username} · {session?.user?.role === "ADMIN" ? "Admin" : "Member"}</span></p>
                <Link href="/account" className="block rounded px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">Change password</Link>
                <button className="w-full rounded px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>
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
  if (status !== "authenticated") return <div className="grid min-h-screen place-items-center text-sm text-neutral-500">Loading…</div>;
  const v = typeof router.query.view === "string" ? router.query.view : undefined;
  const nav = session.user.role === "ADMIN" ? [...NAV, { href: "/admin", label: "Admin", icon: <Ic.Shield />, match: (_v?: string, p?: string) => p === "/admin" }] : NAV;
  return (
    <UploadProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800 md:flex">
          <Link href="/" className="flex h-16 items-center gap-3 px-5 text-lg font-medium"><Logo /> Volta</Link>
          <nav className="space-y-0.5 px-3" aria-label="Main">
            {nav.map((n) => {
              const on = n.match(v, router.pathname);
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
          <main className="px-4 pb-24 pt-4 md:px-6">{children}</main>
        </div>
      </div>
    </UploadProvider>
  );
}
