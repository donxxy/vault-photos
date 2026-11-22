import { useState } from "react";
import { AppShell } from "~/components/AppShell";
import { api } from "~/utils/api";

export default function Account() {
  const [f, setF] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState("");
  const m = api.auth.changePassword.useMutation({
    onSuccess: () => { setMsg("Password changed."); setF({ current: "", next: "" }); },
    onError: (e) => setMsg(e.message),
  });
  const input = "h-11 w-full rounded-md border border-neutral-300 bg-transparent px-3 text-sm dark:border-neutral-600";
  return (
    <AppShell>
      <h1 className="mb-5 text-2xl">Account</h1>
      <form className="max-w-sm space-y-4" onSubmit={(e) => { e.preventDefault(); setMsg(""); m.mutate(f); }}>
        <label className="block text-sm">Current password
          <input className={`${input} mt-1`} type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        </label>
        <label className="block text-sm">New password
          <input className={`${input} mt-1`} type="password" autoComplete="new-password" minLength={8} required value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </label>
        {msg && <p role="status" className="text-sm">{msg}</p>}
        <button className="h-10 rounded-full bg-brand px-6 text-sm font-medium text-white">Change password</button>
      </form>
    </AppShell>
  );
}
