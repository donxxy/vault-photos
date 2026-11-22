import Link from "next/link";
import { useRouter } from "next/router";
import { AppShell } from "~/components/AppShell";
import * as Ic from "~/components/icons";
import { api } from "~/utils/api";

export default function Albums() {
  const router = useRouter();
  const shared = router.query.tab === "shared";
  const utils = api.useContext();
  const { data, isLoading } = api.album.list.useQuery();
  const refresh = () => void utils.album.list.invalidate();
  const create = api.album.create.useMutation({ onSuccess: refresh });
  const rename = api.album.rename.useMutation({ onSuccess: refresh });
  const remove = api.album.remove.useMutation({ onSuccess: refresh });
  const share = api.album.share.useMutation({ onSuccess: refresh, onError: (e) => alert(e.message) });
  const albums = (data ?? []).filter((a) => (shared ? !a.mine || a.sharedWith.length > 0 : a.mine));
  const link = "rounded px-2 py-1 text-xs text-brand hover:bg-blue-50 dark:hover:bg-blue-950";

  return (
    <AppShell>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-2xl">{shared ? "Sharing" : "Albums"}</h1>
        {!shared && <button className="flex items-center gap-1 rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          onClick={() => { const name = prompt("Album name"); if (name) create.mutate({ name }); }}><Ic.Plus /> New album</button>}
      </div>
      {isLoading ? null : albums.length === 0 ? (
        <p className="mt-16 text-center text-sm text-neutral-500">{shared ? "Albums you share, or that others share with you, appear here." : "No albums yet. Select photos on the Photos page and choose Add to album."}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={`/?album=${a.id}`} className="block aspect-square overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.coverId ? <img src={`/api/media/${a.coverId}?thumb=1`} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-neutral-400"><Ic.Album /></span>}
              </Link>
              <p className="mt-2 truncate text-sm font-medium">{a.name}</p>
              <p className="text-xs text-neutral-500">{a.count} item{a.count !== 1 ? "s" : ""}{!a.mine && ` · by ${a.owner}`}{a.mine && a.sharedWith.length > 0 && ` · shared with ${a.sharedWith.map((s) => "@" + s.username).join(", ")}`}</p>
              {a.mine && (
                <div className="-ml-2 mt-1 flex flex-wrap">
                  <button className={link} onClick={() => { const name = prompt("Rename album", a.name); if (name) rename.mutate({ id: a.id, name }); }}>Rename</button>
                  <button className={link} onClick={() => { const u = prompt("Share with which username?"); if (!u) return; const canAdd = confirm("Let them add their own photos?\nOK = Can add photos, Cancel = View only"); share.mutate({ id: a.id, username: u, canAdd }); }}>Share</button>
                  {a.sharedWith.map((s) => <button key={s.username} className={link} onClick={() => share.mutate({ id: a.id, username: s.username, canAdd: false, revoke: true })}>Unshare @{s.username}</button>)}
                  <button className={link} onClick={() => confirm("Delete album? Photos stay in your library.") && remove.mutate({ id: a.id })}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
