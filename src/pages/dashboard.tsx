import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { AppShell } from "~/components/AppShell";
import { api } from "~/utils/api";
import { fmtBytes, fmtUploaded } from "~/utils/format";

function Meter({ percent, color = "bg-brand" }: { percent: number | null; color?: string }) {
  const value = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
      <div className={`h-full transition-[width] ${color}`} style={{ width: `${value}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const data = api.admin.dashboard.useQuery(undefined, { retry: false, refetchInterval: 5000 });
  const users = api.admin.users.useQuery(undefined, { retry: false, refetchInterval: 30000 });
  const uploads = api.admin.uploadActivity.useQuery(undefined, { retry: false, refetchInterval: 10000 });
  const utils = api.useContext();
  const [folder, setFolder] = useState("");
  const [folderLoaded, setFolderLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const saveFolder = api.admin.setUploadSubdir.useMutation({
    onSuccess: async ({ folder: saved }) => {
      setFolder(saved);
      setMessage("New uploads will use the selected folder. Existing photos were not moved.");
      await utils.admin.dashboard.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  useEffect(() => {
    if (data.data && !folderLoaded) {
      setFolder(data.data.storage.uploadSubdir);
      setFolderLoaded(true);
    }
    if ([data.error, users.error, uploads.error].some((error) => error?.data?.code === "FORBIDDEN")) void router.replace("/");
  }, [data.data, data.error, folderLoaded, router, users.error, uploads.error]);

  const d = data.data;
  const diskPct = d?.storage.totalBytes ? d.storage.usedBytes / d.storage.totalBytes * 100 : null;

  return (
    <AppShell>
      <h1 className="mb-2 text-2xl">Dashboard</h1>
      <p className="mb-6 text-sm text-neutral-500">Live resource and storage information for the Volta Docker container.</p>
      {data.error && <p role="alert" className="mb-4 text-sm text-red-600">{data.error.message}</p>}
      {data.isLoading ? <p className="text-sm text-neutral-500">Loading system information…</p> : d && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-medium">CPU</h2>
                <span className="text-2xl font-semibold">{d.cpuPercent === null ? "Sampling…" : `${d.cpuPercent.toFixed(1)}%`}</span>
              </div>
              <Meter percent={d.cpuPercent} />
              <p className="mt-2 text-xs text-neutral-500">{d.cpuSource === "container" ? "Container" : "App process"} · {d.cpuCores.toFixed(2)} CPU capacity</p>
            </section>

            <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-medium">RAM</h2>
                <span className="text-2xl font-semibold">{d.memory.percent === null ? fmtBytes(d.memory.usedBytes) : `${d.memory.percent.toFixed(1)}%`}</span>
              </div>
              <Meter percent={d.memory.percent} color="bg-violet-500" />
              <p className="mt-2 text-xs text-neutral-500">
                {fmtBytes(d.memory.usedBytes)} used{d.memory.limitBytes === null ? " · app process (container limit unavailable)" : ` of ${fmtBytes(d.memory.limitBytes)}`}
              </p>
            </section>

            <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
              <h2 className="mb-3 font-medium">Photo storage</h2>
              <Meter percent={diskPct} color={diskPct !== null && diskPct > 90 ? "bg-red-500" : "bg-brand"} />
              <p className="mt-2 text-sm">{fmtBytes(d.storage.usedBytes)} used · {fmtBytes(d.storage.freeBytes)} free of {fmtBytes(d.storage.totalBytes)}</p>
              <p className="mt-1 break-all text-xs text-neutral-500">Mounted share: {d.storage.root}</p>
              <p className="mt-1 break-all text-xs text-neutral-500">New uploads: {d.storage.uploadSubdir || "share root"}</p>
              <p className="mt-1 text-xs text-neutral-500">{fmtBytes(d.storage.libraryBytes)} in the library · {d.storage.mediaCount} items</p>
            </section>

            <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
              <h2 className="mb-3 font-medium">NAS RAID status · read-only</h2>
              {d.raid ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-800">{d.raid}</pre>
              ) : (
                <p className="text-sm text-neutral-500">RAID status is not exposed to this Docker container. No RAID changes are made from Volta.</p>
              )}
            </section>
          </div>

          <section className="mt-6 max-w-2xl rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
            <h2 className="mb-1 font-medium">Upload destination</h2>
            <p className="mb-4 text-sm text-neutral-500">Choose a subfolder inside the mounted photo share. Only new uploads use this folder; existing photos stay where they are.</p>
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); saveFolder.mutate({ folder }); }}>
              <label className="min-w-0 flex-1 text-sm">
                Folder under {d.storage.root}
                <input value={folder} onChange={(e) => { setFolder(e.target.value); setMessage(""); }}
                  placeholder="Leave blank to use the share root" maxLength={120}
                  className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-transparent px-3 text-sm dark:border-neutral-600" />
              </label>
              <button disabled={saveFolder.isLoading} className="h-10 rounded-full bg-brand px-5 text-sm font-medium text-white disabled:opacity-50">
                {saveFolder.isLoading ? "Saving…" : "Save destination"}
              </button>
            </form>
            {message && <p role={saveFolder.error ? "alert" : "status"} className={`mt-3 text-sm ${saveFolder.error ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{message}</p>}
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-xl font-medium">Users</h2>
            <p className="mb-3 text-sm text-neutral-500">Upload totals and most recent upload for each account.</p>
            {users.error && <p role="alert" className="mb-3 text-sm text-red-600">{users.error.message}</p>}
            <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-neutral-800">
                  <tr><th className="px-4 py-3">User</th><th>Role</th><th>Uploads</th><th>Storage used</th><th>Last upload</th></tr>
                </thead>
                <tbody>
                  {users.data?.map((user) => (
                    <tr key={user.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="px-4 py-3"><span className="font-medium">{user.name}</span><span className="ml-2 text-neutral-500">@{user.username}</span></td>
                      <td>{user.role === "ADMIN" ? "Admin" : "Member"}</td>
                      <td>{user.items}</td>
                      <td>{fmtBytes(user.used)}</td>
                      <td>{user.lastUploadAt ? fmtUploaded(user.lastUploadAt) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-xl font-medium">Recent uploads</h2>
            <p className="mb-3 text-sm text-neutral-500">Latest 50 non-hidden uploads. This activity list contains file metadata only—no thumbnails or image access.</p>
            {uploads.error && <p role="alert" className="mb-3 text-sm text-red-600">{uploads.error.message}</p>}
            {uploads.data?.length ? (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-neutral-800">
                    <tr><th className="px-4 py-3">User</th><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th></tr>
                  </thead>
                  <tbody>
                    {uploads.data.map((upload) => (
                      <tr key={upload.id} className="border-t border-neutral-200 dark:border-neutral-800">
                        <td className="px-4 py-3">{upload.user.name}<span className="ml-2 text-neutral-500">@{upload.user.username}</span></td>
                        <td className="max-w-64 truncate" title={upload.filename}>{upload.filename}</td>
                        <td>{upload.mime}</td>
                        <td>{fmtBytes(upload.size)}</td>
                        <td>{fmtUploaded(upload.uploadedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : !uploads.isLoading && <p className="rounded-xl border border-neutral-200 p-5 text-sm text-neutral-500 dark:border-neutral-700">No recent uploads.</p>}
          </section>
        </>
      )}
    </AppShell>
  );
}
