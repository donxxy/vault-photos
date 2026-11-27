import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { AppShell } from "~/components/AppShell";
import { Lightbox } from "~/components/Lightbox";
import { PasswordDialog } from "~/components/PasswordDialog";
import { Timeline } from "~/components/Timeline";
import { useUploader } from "~/components/UploadManager";
import * as Ic from "~/components/icons";
import { api, type MediaItem } from "~/utils/api";

const TABS = [
  { view: "all", label: "All media" }, { view: "favorites", label: "Favorites" }, { view: "videos", label: "Videos" },
  { view: "screenshots", label: "Screenshots" }, { view: "recent", label: "Recent uploads" },
] as const;
type View = (typeof TABS)[number]["view"] | "trash";

export default function Photos() {
  const router = useRouter();
  const view = (typeof router.query.view === "string" ? router.query.view : "all") as View;
  const q = typeof router.query.q === "string" ? router.query.q : undefined;
  const albumId = typeof router.query.album === "string" ? router.query.album : undefined;

  const utils = api.useContext();
  const list = api.media.list.useQuery({ view, q, albumId }, { retry: false });
  // A hidden album answers FORBIDDEN until its password has been entered
  const locked = !!albumId && list.error?.data?.code === "FORBIDDEN";
  const memories = api.media.memories.useQuery(undefined, { enabled: view === "all" && !q && !albumId });
  const albums = api.album.list.useQuery();
  const items = useMemo(() => list.data ?? [], [list.data]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [memory, setMemory] = useState<string[] | null>(null);
  const [picker, setPicker] = useState(false);
  const [hidePicker, setHidePicker] = useState(false);
  const [newHidden, setNewHidden] = useState<{ name: string } | null>(null);
  const [hideError, setHideError] = useState("");
  const [hideBusy, setHideBusy] = useState(false);
  const { pickFiles } = useUploader();

  const done = () => { setSelected(new Set()); void utils.media.list.invalidate(); void utils.media.stats.invalidate(); void utils.album.list.invalidate(); };
  const fav = api.media.setFavorite.useMutation({ onSuccess: done });
  const trash = api.media.trash.useMutation({ onSuccess: done });
  const restore = api.media.restore.useMutation({ onSuccess: done });
  const purge = api.media.deleteForever.useMutation({ onSuccess: done });
  const addTo = api.album.addItems.useMutation({ onSuccess: () => { setPicker(false); setHidePicker(false); done(); } });
  const createAlbum = api.album.create.useMutation();
  const setLock = api.album.setLock.useMutation();
  const removeFrom = api.album.removeItems.useMutation({ onSuccess: done });
  const cover = api.album.setCover.useMutation({ onSuccess: done });
  const unlock = api.album.unlock.useMutation({ onSuccess: () => { void utils.media.list.invalidate(); void utils.album.list.invalidate(); } });
  const lockNow = api.album.lockNow.useMutation({
    onSuccess: () => { void utils.album.list.invalidate(); void utils.media.list.invalidate(); void router.push("/albums"); },
  });

  const ids = [...selected];
  const album = albums.data?.find((a) => a.id === albumId);
  const hiddenAlbums = albums.data?.filter((a) => a.mine && a.locked) ?? [];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  const memItems: MediaItem[] = useMemo(() => (memory ? items.filter((m) => memory.includes(m.id)) : []), [memory, items]);
  const btn = "flex items-center gap-2 rounded-full px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800";

  const createHidden = async (password: string) => {
    if (!newHidden) return;
    setHideBusy(true);
    setHideError("");
    try {
      const created = await createAlbum.mutateAsync({ name: newHidden.name });
      await setLock.mutateAsync({ id: created.id, password });
      await addTo.mutateAsync({ id: created.id, mediaIds: ids });
      setNewHidden(null);
      setHidePicker(false);
      done();
    } catch (e) {
      setHideError(e instanceof Error ? e.message : "Could not hide these photos.");
    } finally {
      setHideBusy(false);
    }
  };

  const bar = selected.size > 0 && (
    <div className="flex w-full items-center gap-1">
      <button aria-label="Clear selection" className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setSelected(new Set())}><Ic.Close /></button>
      <span className="mr-4 text-base font-medium">{selected.size} selected</span>
      {view === "trash" ? (<>
        <button className={btn} onClick={() => restore.mutate({ ids })}>Restore</button>
        <button className={btn} onClick={() => confirm(`Permanently delete ${ids.length} item(s)? This can't be undone.`) && purge.mutate({ ids })}>Delete forever</button>
      </>) : (<>
        <button className={btn} onClick={() => ids.forEach((id) => window.open(`/api/media/${id}?download=1`))}><Ic.Download /> Download</button>
        {!albumId && <button className={btn} onClick={() => setPicker(true)}><Ic.Plus /> Add to album</button>}
        {!albumId && <button className={btn} onClick={() => setHidePicker(true)}>Hide</button>}
        <button className={btn} onClick={() => fav.mutate({ ids, value: !items.filter((m) => selected.has(m.id)).every((m) => m.favorite) })}><Ic.Star /> Favorite</button>
        {albumId && album?.mine && <button className={btn} onClick={() => removeFrom.mutate({ id: albumId, mediaIds: ids })}>{album.locked ? "Unhide" : "Remove from album"}</button>}
        {albumId && album?.mine && selected.size === 1 && <button className={btn} onClick={() => cover.mutate({ id: albumId, mediaId: ids[0]! })}>Set as cover</button>}
        {!albumId && <button className={btn} onClick={() => trash.mutate({ ids })}><Ic.Trash /> Move to trash</button>}
      </>)}
    </div>
  );

  return (
    <AppShell headerOverride={bar || undefined}>
      {albumId ? (
        <div className="mb-4 flex items-center gap-3"><Link href="/albums" className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Back to albums"><Ic.Chevron dir="left" /></Link><h1 className="text-2xl">{album?.name ?? "Album"}</h1>
          {album?.locked && <button className="ml-auto flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800" onClick={() => lockNow.mutate({ id: albumId })}>Lock now</button>}
        </div>
      ) : view === "trash" ? (
        <p className="mb-4 rounded-lg bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-800">Items in trash are deleted from your NAS after 30 days.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          {TABS.map((t) => (
            <Link key={t.view} role="tab" aria-selected={view === t.view} href={t.view === "all" ? "/" : `/?view=${t.view}`}
              className={`rounded-full border px-4 py-1.5 text-sm ${view === t.view ? "border-blue-200 bg-blue-50 font-medium text-brand dark:border-blue-900 dark:bg-blue-950" : "border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"}`}>{t.label}</Link>
          ))}
        </div>
      )}

      {!!memories.data?.length && (
        <section aria-label="On this day" className="mb-6">
          <h2 className="mb-2 text-base font-medium">On this day</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {memories.data.map((g) => (
              <button key={g.year} onClick={() => setMemory(g.ids)} className="relative h-44 w-36 shrink-0 overflow-hidden rounded-xl bg-neutral-200 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${g.ids[0]}?thumb=1`} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 p-3 pt-8 text-sm font-medium text-white">{g.yearsAgo} year{g.yearsAgo > 1 ? "s" : ""} ago<span className="block text-xs font-normal text-white/80">{g.ids.length} photos</span></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {locked ? null : list.isLoading ? <p className="text-sm text-neutral-500">Loading your library…</p>
        : items.length === 0 ? (
          <div className="mx-auto mt-24 max-w-sm text-center">
            <h2 className="text-xl">{q ? `No results for “${q}”` : view === "trash" ? "Trash is empty" : "Your library is empty"}</h2>
            <p className="mt-2 text-sm text-neutral-500">{q || view === "trash" ? "Try a different search." : "Drag photos, videos or whole folders onto this page, or pick them from your computer."}</p>
            {!q && view !== "trash" && <button onClick={pickFiles} className="mt-5 h-10 rounded-full bg-brand px-6 text-sm font-medium text-white">Upload photos</button>}
          </div>
        ) : <Timeline items={items} selected={selected} onToggle={toggle} onOpen={setOpen} />}

      {open !== null && (
        <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)}
          onFavorite={(m) => fav.mutate({ ids: [m.id], value: !m.favorite })}
          onTrash={view === "trash" || albumId ? undefined : (m) => { trash.mutate({ ids: [m.id] }); setOpen(null); }} />
      )}
      {memory && open === null && <Lightbox items={memItems} index={0} onIndex={() => {}} onClose={() => setMemory(null)} onFavorite={(m) => fav.mutate({ ids: [m.id], value: !m.favorite })} />}

      {picker && (
        <div role="dialog" aria-modal="true" aria-label="Add to album" className="fixed inset-0 z-[65] grid place-items-center bg-black/40 p-4" onClick={() => setPicker(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-lg">Add to album</h2>
            {albums.data?.some((a) => a.locked && a.canAdd) && <p className="mb-3 text-xs text-neutral-500">Photos you add to a hidden album leave your main library.</p>}
            <ul className="max-h-64 overflow-y-auto">
              {albums.data?.filter((a) => a.canAdd).map((a) => <li key={a.id}><button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => addTo.mutate({ id: a.id, mediaIds: ids })}>{a.name} <span className="text-neutral-500">· {a.locked ? "hidden" : a.count}</span></button></li>)}
            </ul>
            <button className="mt-3 text-sm font-medium text-brand" onClick={async () => { const name = prompt("Album name"); if (!name) return; const a = await createAlbum.mutateAsync({ name }); addTo.mutate({ id: a.id, mediaIds: ids }); }}>+ New album</button>
          </div>
        </div>
      )}
      {hidePicker && (
        <div role="dialog" aria-modal="true" aria-label="Hide photos" className="fixed inset-0 z-[65] grid place-items-center bg-black/40 p-4" onClick={() => setHidePicker(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg">Hide photos</h2>
            <p className="mb-3 text-sm text-neutral-500">Choose a password-protected album. These photos will no longer appear in your main library.</p>
            {hiddenAlbums.length ? (
              <ul className="max-h-64 overflow-y-auto">
                {hiddenAlbums.map((a) => (
                  <li key={a.id}>
                    <button disabled={addTo.isLoading} className="w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
                      onClick={() => addTo.mutate({ id: a.id, mediaIds: ids })}>{a.name}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-lg bg-neutral-100 p-3 text-sm text-neutral-500 dark:bg-neutral-800">You don’t have a hidden album yet.</p>}
            <button className="mt-3 text-sm font-medium text-brand" onClick={() => {
              const name = prompt("Hidden album name", "Hidden");
              if (name?.trim()) { setHideError(""); setNewHidden({ name: name.trim() }); }
            }}>+ Create hidden album</button>
            {addTo.error && <p role="alert" className="mt-2 text-sm text-red-600">{addTo.error.message}</p>}
            <div className="mt-4 flex justify-end">
              <button className="rounded-full px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setHidePicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {newHidden && (
        <PasswordDialog title={`Create “${newHidden.name}”`} hint="Set a password for this hidden album." submitLabel="Hide photos" confirm
          busy={hideBusy} error={hideError} onSubmit={(password) => void createHidden(password)}
          onClose={() => { if (!hideBusy) setNewHidden(null); }} />
      )}
      {locked && albumId && (
        <PasswordDialog title="Hidden album" hint="Enter this album's password to open it." submitLabel="Unlock" busy={unlock.isLoading}
          error={unlock.error?.message} onSubmit={(password) => unlock.mutate({ id: albumId, password })} onClose={() => void router.push("/albums")} />
      )}
    </AppShell>
  );
}
