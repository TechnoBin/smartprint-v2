 "use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/dashboard"); router.refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }

  return <><header className="topbar"><div className="shell topbar-inner"><Link href="/" className="brand">Smart<span>Print</span></Link><span className="pill">Owner portal</span></div></header>
    <main className="shell page" style={{maxWidth:520}}><div className="card"><div className="eyebrow">Secure access</div><h1 style={{fontSize:32}}>Welcome back</h1><p className="muted">Sign in with the owner account created in your Supabase project.</p>
      <form onSubmit={submit}><div className="field"><label htmlFor="email">Owner email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></div><div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} /></div>
      {message && <p className="notice error">{message}</p>}<button className="btn btn-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form>
      <p className="muted" style={{fontSize:12,marginTop:18}}>Create the owner account in Supabase Authentication first. See SETUP.md.</p></div></main></>;
}
