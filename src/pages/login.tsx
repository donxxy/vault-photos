import { useRouter } from "next/router";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Logo } from "~/components/Logo";
import { api } from "~/utils/api";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ username: "", name: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const register = api.auth.register.useMutation();

  const login = async () => {
    const r = await signIn("credentials", { username: f.username, password: f.password, redirect: false });
    if (r?.ok) void router.push("/"); else setErr("Wrong username or password.");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      if (mode === "up") await register.mutateAsync(f);
      await login();
    } catch (x) { setErr(x instanceof Error ? x.message : "Something went wrong."); }
    setBusy(false);
  };
  const field = "h-12 w-full rounded-md border border-neutral-300 bg-transparent px-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand dark:border-neutral-600";

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-neutral-200 p-8 dark:border-neutral-700">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={40} />
          <h1 className="text-2xl font-normal">{mode === "in" ? "Sign in" : "Create your account"}</h1>
          <p className="text-sm text-neutral-500">{mode === "in" ? "to open your Volta library" : "Your photos stay on your NAS. The first account becomes the admin."}</p>
        </div>
        <div className="space-y-4">
          <input className={field} placeholder="Username" autoComplete="username" required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          {mode === "up" && <input className={field} placeholder="Display name" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
          <input className={field} type="password" placeholder="Password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={mode === "up" ? 8 : 1} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="text-sm font-medium text-brand" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); }}>{mode === "in" ? "Create account" : "Sign in instead"}</button>
          <button disabled={busy} className="h-10 rounded-full bg-brand px-6 text-sm font-medium text-white disabled:opacity-60">{mode === "in" ? "Sign in" : "Create account"}</button>
        </div>
      </form>
    </div>
  );
}
