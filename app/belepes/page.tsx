"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearGrowattBrowserCache } from "@/lib/growatt/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      clearGrowattBrowserCache();
      router.replace("/"); router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sikertelen bejelentkezés.");
    } finally { setLoading(false); }
  }
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-7 flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-emerald-700 text-xl font-black text-white">W</span><div><h1 className="text-2xl font-black">Wattmérleg</h1><p className="text-sm text-slate-500">Jelentkezz be a folytatáshoz</p></div></div>
        <label className="mb-4 block text-sm font-bold">E-mail<input required type="email" autoComplete="email" className="field mt-2" value={email} onChange={e => setEmail(e.target.value)}/></label>
        <label className="mb-5 block text-sm font-bold">Jelszó<input required type="password" autoComplete="current-password" className="field mt-2" value={password} onChange={e => setPassword(e.target.value)}/></label>
        {message && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <button disabled={loading} className="primary w-full">{loading ? "Belépés…" : "Bejelentkezés"}</button>
      </form>
    </main>
  );
}
