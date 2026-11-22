import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { AppShell } from "~/components/AppShell";
import { api } from "~/utils/api";
import { fmtBytes } from "~/utils/format";

export default function Admin() {
  const router = useRouter();
  const me = api.media.stats.useQuery();
  const utils = api.useContext();
  const users = api.admin.users.useQuery(undefined, { retry: false });
  useEffect(() => { if (users.error?.data?.code === "FORBIDDEN") void router.replace("/"); }, [users.error, router]);
  const refresh = () => void utils.admin.users.invalidate();
  const quota = api.admin.setQuota.useMutation({ onSuccess: refresh });
  const role = api.admin.setRole.useMutation({ onSuccess: refresh, onError: (e) => alert(e.message) });
  const create = api.admin.createUser.useMutation({ onSuccess: () => { refresh(); setF({ username: "", name: "", password: "" }); }, onError: (e) => alert(e.message) });
  const [f, setF] = useState({ username: "", name: "", password: "" });
  const input = "h-10 rounded-md border border-neutral-300 bg-transparent px-3 text-sm dark:border-neutral-600";
  const d = me.data?.disk;

  return (
    <AppShell>
      <h1 className="mb-5 text-2xl">Admin</h1>
      {d && (
        <section className="mb-8 max-w-xl rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
          <h2 className="mb-3 font-medium">NAS drive</h2>
          <div className="h-2 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700"><div className="h-full bg-brand" style={{ width: `${((d.total - d.free) / d.total) * 100}%` }} /></div>
          <p className="mt-2 text-sm text-neutral-500">{fmtBytes(d.total - d.free)} used · {fmtBytes(d.free)} free of {fmtBytes(d.total)}</p>
        </section>
      )}
      <section className="mb-8 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-neutral-500"><tr><th className="py-2">Member</th><th>Role</th><th>Items</th><th>Used</th><th>Quota (GB)</th></tr></thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-3"><span className="font-medium">{u.name}</span> <span className="text-neutral-500">@{u.username}</span></td>
                <td><select aria-label={`Role for ${u.username}`} className={input} value={u.role} onChange={(e) => role.mutate({ userId: u.id, role: e.target.value as "ADMIN" | "USER" })}><option value="USER">Member</option><option value="ADMIN">Admin</option></select></td>
                <td>{u.items}</td>
                <td className="w-48"><div className="h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700"><div className="h-full bg-brand" style={{ width: `${Math.min(100, (u.used / u.quotaBytes) * 100)}%` }} /></div><span className="text-xs text-neutral-500">{fmtBytes(u.used)}</span></td>
                <td><input aria-label={`Quota for ${u.username}`} type="number" min={1} defaultValue={Math.round(u.quotaBytes / 1024 ** 3)} className={`${input} w-24`}
                  onBlur={(e) => { const g = Number(e.target.value); if (g >= 1 && g !== Math.round(u.quotaBytes / 1024 ** 3)) quota.mutate({ userId: u.id, quotaGb: g }); }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form className="flex max-w-3xl flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); create.mutate({ ...f, role: "USER" }); }}>
        <h2 className="w-full font-medium">Add a family member</h2>
        <input className={input} placeholder="Username" required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        <input className={input} placeholder="Display name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={input} type="password" placeholder="Temporary password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <button className="h-10 rounded-full bg-brand px-5 text-sm font-medium text-white">Create account</button>
      </form>
    </AppShell>
  );
}
