"use client";

import { useState } from "react";
import { Check, Copy, Printer, ShieldCheck } from "lucide-react";

type Pairing = { token: string; device: { id: string; name: string; created_at: string } };

export default function PrintAgentPage() {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function pairStation() {
    setBusy(true);
    setMessage("");
    setPairing(null);
    setCopied(false);
    try {
      const response = await fetch("/api/admin/print-agent/pair", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not pair the print station.");
      setPairing(data as Pairing);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not pair the print station.");
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.token);
      setCopied(true);
    } catch {
      setMessage("Clipboard access was blocked. Select and copy the token manually.");
    }
  }

  return <div className="dashboard-overview">
    <div className="dashboard-hero">
      <div><div className="eyebrow">Local printing · Windows station</div><h1>Print station</h1>
        <p className="muted">Pair the Windows laptop that is connected to your Epson printer.</p></div>
    </div>
    <section className="card" style={{ maxWidth: 760, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span className="quick-action-icon"><Printer size={22}/></span>
        <div><h2 style={{ margin: 0 }}>Supervised printing</h2><p className="muted" style={{ margin: "4px 0 0" }}>The app asks for confirmation before every job.</p></div>
      </div>
      <ol style={{ paddingLeft: 22, lineHeight: 1.8 }}>
        <li>Run the print-agent migration in your SmartPrint V2 Supabase SQL Editor.</li>
        <li>Generate a pairing token below and copy it immediately.</li>
        <li>Save it in the Windows app's local config file. Never commit it to GitHub.</li>
      </ol>
      <button className="btn" type="button" onClick={() => void pairStation()} disabled={busy}>
        <ShieldCheck size={16}/>{busy ? "Pairing…" : "Generate pairing token"}
      </button>
      {message && <p className="notice error" role="alert">{message}</p>}
      {pairing && <div style={{ marginTop: 20, border: "1px solid var(--border, #ddd)", borderRadius: 12, padding: 16 }}>
        <p><strong>Token created successfully</strong></p>
        <p className="muted">Copy this token now. For security, it will not be shown again after you leave or refresh this page.</p>
        <textarea aria-label="One-time print station token" readOnly value={pairing.token} rows={3} style={{ width: "100%", resize: "vertical", overflowWrap: "anywhere" }}/>
        <button className="btn btn-secondary" type="button" onClick={() => void copyToken()} style={{ marginTop: 10 }}>
          {copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Copied" : "Copy token"}
        </button>
        <p className="muted" style={{ fontSize: 12 }}>Station ID: {pairing.device.id}</p>
      </div>}
      <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>Pairing token grants access to this shop's print queue. Keep it private. If you think it was exposed, deactivate the station in the database and pair a replacement.</p>
    </section>
  </div>;
}
