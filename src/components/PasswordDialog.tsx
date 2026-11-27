import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  hint?: string;
  submitLabel: string;
  /** Ask for the password twice (used when creating a new one). */
  confirm?: boolean;
  busy?: boolean;
  error?: string;
  onSubmit: (password: string) => void;
  onClose: () => void;
};

export function PasswordDialog({ title, hint, submitLabel, confirm, busy, error, onSubmit, onClose }: Props) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [local, setLocal] = useState("");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirm && pw.length < 4) return setLocal("Use at least 4 characters.");
    if (confirm && pw !== pw2) return setLocal("The two passwords don't match.");
    setLocal("");
    onSubmit(pw);
  };
  const field = "h-11 w-full rounded-md border border-neutral-300 bg-transparent px-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand dark:border-neutral-600";

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-medium">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          {title}
        </h2>
        {hint && <p className="mb-4 text-sm text-neutral-500">{hint}</p>}
        <div className="space-y-3">
          <input ref={first} className={field} type="password" placeholder="Password" autoComplete={confirm ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} />
          {confirm && <input className={field} type="password" placeholder="Repeat password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}
        </div>
        {(local || error) && <p role="alert" className="mt-3 text-sm text-red-600">{local || error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">Cancel</button>
          <button disabled={busy || !pw} className="h-10 rounded-full bg-brand px-5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Please wait…" : submitLabel}</button>
        </div>
      </form>
    </div>
  );
}
