import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { AppShell } from "~/components/AppShell";
import { PasswordDialog } from "~/components/PasswordDialog";
import * as Ic from "~/components/icons";
import { api } from "~/utils/api";

type Dlg =
  | { kind: "unlock"; id: string }
  | { kind: "lock"; id: string }
  | { kind: "removeLock"; id: string }
  | { kind: "newHidden"; name: string }
  | null;

const LockIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export default function Albums() {
  const router = useRouter();
  const shared = router.query.tab === "shared";
  const utils = api.useContext();
  const { data, isLoading } = api.album.list.useQuery();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Locking or unlocking changes which photos the main library shows, so refresh those too.
  const refresh = () => {
    void utils.album.list.invalidate(); void utils.media.list.invalidate();
    void utils.media.memories.invalidate(); void utils.media.stats.invalidate();
  };
  const create = api.album.create.useMutation({ onSuccess: refresh });
  const rename = api.album.rename.useMutation({ onSuccess: refresh });
  const remove = api.album.remove.useMutation({ onSuccess: refresh, onError: (e) => alert(e.message) });
  const share = api.album.share.useMutation({ onSuccess: refresh, onError: (e) => alert(e.message) });
  const unlock = api.album.unlock.useMutation();
  const setLock = api.album.setLock.useMutation();
  const removeLock = api.album.removeLock.useMutation();
  const lockNow = api.album.lockNow.useMutation({ onSuccess: refresh });

  const albums = (data ?? []).filter((a) => (shared ? !a.mine || a.sharedWith.length > 0 : a.mine));
  const link = "rounded px-2 py-1 text-xs text-brand hover:bg-blue-50 dark:hover:bg-blue-950";
  const closeDlg = () => { setDlg(null); setErr(""); };
  const dlgAlbum = dlg && "id" in dlg ? data?.find((a) => a.id === dlg.id) : undefined;

  const submit = async (password: string) => {
    if (!dlg) return;
    setErr(""); setBusy(true);
    try {
      if (dlg.kind === "unlock") { await unlock.mutateAsync({ id: dlg.id, password }); refresh(); void router.push(`/?album=${dlg.id}`); }
      else if (dlg.kind === "lock") await setLock.mutateAsync({ id: dlg.id, password });
      else if (dlg.kind === "removeLock") await removeLock.mutateAsync({ id: dlg.id, password });
      else { const a = await create.mutateAsync({ name: dlg.name }); await setLock.mutateAsync({ id: a.id, password }); }
      refresh();
      closeDlg();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  };

  const warn = "Photos in this album will disappear from your library, search and memories until you unlock it. If you forget the password it can't be reset.";
  const dialog = !dlg ? null : dlg.kind === "unlock" ? { title: "Hidden album", hint: `Enter the password to open “${dlgAlbum?.name ?? "this album"}”.`, label: "Unlock", confirm: false }
    : dlg.kind === "lock" ? { title: "Hide with password", hint: warn, label: "Hide album", confirm: true }
    : dlg.kind === "newHidden" ? { title: "New hidden album", hint: warn, label: "Create hidden album", confirm: true }
    : { title: "Remove password", hint: "Enter the password. The album becomes a normal album and its photos return to your main library.", label: "Remove password", confirm: false };

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">{shared ? "Sharing" : "Albums"}</h1>
        {!shared && <>
          <button className="flex items-center gap-1 rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            onClick={() => { const name = prompt("Album name"); if (name) create.mutate({ name }); }}><Ic.Plus /> New album</button>
          <button className="flex items-center gap-1 rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            onClick={() => { const name = prompt("Hidden album name"); if (name) setDlg({ kind: "newHidden", name }); }}><Ic.Plus /> New hidden album</button>
        </>}
      </div>
      {isLoading ? null : albums.length === 0 ? (
        <p className="mt-16 text-center text-sm text-neutral-500">{shared ? "Albums you share, or that others share with you, appear here." : "No albums yet. Select photos on the Photos page and choose Add to album."}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {albums.map((a) => {
            const closed = a.locked && !a.unlocked;
            return (
              <li key={a.id}>
                {closed ? (
                  <button aria-label={`Unlock ${a.name}`} onClick={() => a.mine && setDlg({ kind: "unlock", id: a.id })}
                    className="grid aspect-square w-full place-items-center rounded-xl bg-neutral-200 text-neutral-500 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700"><LockIcon /></button>
                ) : (
                  <Link href={`/?album=${a.id}`} className="block aspect-square overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.coverId ? <img src={`/api/media/${a.coverId}?thumb=1`} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-neutral-400"><Ic.Album /></span>}
                  </Link>
                )}
                <p className="mt-2 truncate text-sm font-medium">{a.name}</p>
                <p className="text-xs text-neutral-500">
                  {closed ? "Hidden · password required" : <>{a.count} item{a.count !== 1 ? "s" : ""}{a.locked && " · hidden"}{!a.mine && ` · by ${a.owner}`}{a.mine && a.sharedWith.length > 0 && ` · shared with ${a.sharedWith.map((s) => "@" + s.username).join(", ")}`}</>}
                </p>
                {a.mine && (
                  <div className="-ml-2 mt-1 flex flex-wrap">
                    <button className={link} onClick={() => { const name = prompt("Rename album", a.name); if (name) rename.mutate({ id: a.id, name }); }}>Rename</button>
                    {!a.locked && <button className={link} onClick={() => { const u = prompt("Share with which username?"); if (!u) return; const canAdd = confirm("Let them add their own photos?\nOK = Can add photos, Cancel = View only"); share.mutate({ id: a.id, username: u, canAdd }); }}>Share</button>}
                    {!a.locked && a.sharedWith.map((s) => <button key={s.username} className={link} onClick={() => share.mutate({ id: a.id, username: s.username, canAdd: false, revoke: true })}>Unshare @{s.username}</button>)}
                    {!a.locked && a.sharedWith.length === 0 && <button className={link} onClick={() => setDlg({ kind: "lock", id: a.id })}>Hide with password</button>}
                    {a.locked && a.unlocked && <button className={link} onClick={() => lockNow.mutate({ id: a.id })}>Lock now</button>}
                    {a.locked && <button className={link} onClick={() => setDlg({ kind: "removeLock", id: a.id })}>Remove password</button>}
                    {!closed && <button className={link} onClick={() => confirm(a.locked ? "Delete this hidden album? Its photos stay in your library and become visible." : "Delete album? Photos stay in your library.") && remove.mutate({ id: a.id })}>Delete</button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dialog && <PasswordDialog title={dialog.title} hint={dialog.hint} submitLabel={dialog.label} confirm={dialog.confirm} busy={busy} error={err} onSubmit={(p) => void submit(p)} onClose={closeDlg} />}
    </AppShell>
  );
}
