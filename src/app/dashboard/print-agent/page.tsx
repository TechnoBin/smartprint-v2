"use client";

import { useState } from "react";
import { Check, Copy, Printer, ShieldCheck, Zap, CircleAlert, MonitorCheck } from "lucide-react";

type Pairing = { token: string; device: { id: string; name: string; created_at: string } };

export default function PrintAgentPage() {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function pairStation() {
    setBusy(true); setMessage(""); setPairing(null); setCopied(false);
    try {
      const response = await fetch("/api/admin/print-agent/pair", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not pair the print station.");
      setPairing(data as Pairing);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not pair the print station.");
    } finally { setBusy(false); }
  }

  async function copyToken() {
    if (!pairing) return;
    try { await navigator.clipboard.writeText(pairing.token); setCopied(true); }
    catch { setMessage("Clipboard access was blocked. Select and copy the token manually."); }
  }

  return <div className="dashboard-overview">
    <div className="dashboard-hero">
      <div><div className="eyebrow">Shop hardware · Windows station</div><h1>Automatic print station</h1>
        <p className="muted">Connect the Windows laptop to your Epson printer and let SmartPrint process the queue.</p></div>
    </div>
    <section className="card" style={{ maxWidth: 820, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "22px 24px", background: "linear-gradient(120deg,#f0f8f2,#f7faf8)", borderBottom: "1px solid #e0e9e2" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <span style={{ width: 46, height: 46, flex: "0 0 46px", display: "grid", placeItems: "center", borderRadius: 14, background: "#dcefe1", color: "#17683b" }}><Zap size={23}/></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Automatic printing</h2>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 8px", borderRadius: 999, background: "#dff4e5", color: "#17683b", fontSize: 10, fontWeight: 800, letterSpacing: ".04em" }}><span style={{ width: 6, height: 6, borderRadius: 99, background: "#238343" }}/> READY TO CONFIGURE</span>
            </div>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>Jobs print without a confirmation popup once the Windows station is paired and running.</p>
          </div>
        </div>
      </div>
      <div style={{ padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 22 }}>
          {[
            { n: "01", title: "Apply database setup", body: "Run the print-agent migration in your V2 Supabase project." },
            { n: "02", title: "Pair this station", body: "Generate a one-time token and copy it to your private config." },
            { n: "03", title: "Start Windows agent", body: "Keep the laptop, printer, and agent running for automatic jobs." },
          ].map(item => <div key={item.n} style={{ border: "1px solid #e5e9e6", borderRadius: 13, padding: 14 }}>
            <span style={{ display: "inline-grid", placeItems: "center", width: 27, height: 27, borderRadius: 8, background: "#f0f3f1", color: "#506157", fontSize: 11, fontWeight: 800 }}>{item.n}</span>
            <strong style={{ display: "block", fontSize: 13, marginTop: 11 }}>{item.title}</strong>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: "5px 0 0" }}>{item.body}</p>
          </div>)}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 13, borderRadius: 11, background: "#fff8e8", color: "#805414", marginBottom: 20 }}>
          <CircleAlert size={18} style={{ flex: "0 0 auto", marginTop: 1 }}/>
          <p style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>Automatic mode sends valid queued jobs to the selected printer without asking first. Test with a harmless sample PDF and confirm paper, colour, copies, and printer settings before accepting customer orders.</p>
        </div>
        <button className="btn" type="button" onClick={() => void pairStation()} disabled={busy} style={{ minHeight: 46 }}>
          <ShieldCheck size={17}/>{busy ? "Creating secure token…" : "Generate pairing token"}
        </button>
        {message && <p className="notice error" role="alert" style={{ marginTop: 14 }}>{message}</p>}
        {pairing && <div style={{ marginTop: 20, border: "1px solid #cfe4d5", background: "#fbfefc", borderRadius: 14, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><MonitorCheck size={20} color="#17683b"/><strong>Station token created</strong></div>
          <p className="muted" style={{ fontSize: 12, margin: "7px 0 12px" }}>Copy it now. For security, the token is shown only once and cannot be recovered after leaving or refreshing this page.</p>
          <textarea aria-label="One-time print station token" readOnly value={pairing.token} rows={3} style={{ width: "100%", resize: "vertical", overflowWrap: "anywhere", border: "1px solid #d0d9d2", borderRadius: 9, padding: 11, fontSize: 12, background: "#fff" }}/>
          <button className="btn btn-secondary" type="button" onClick={() => void copyToken()} style={{ marginTop: 10 }}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Token copied" : "Copy token"}</button>
          <p className="muted" style={{ fontSize: 11, marginBottom: 0, overflowWrap: "anywhere" }}>Station ID: {pairing.device.id}</p>
        </div>}
        <p className="muted" style={{ fontSize: 11, lineHeight: 1.6, margin: "20px 0 0" }}>Keep the pairing token private. Never paste it into GitHub, public messages, or screenshots. If exposed, disable the device record in Supabase and pair a replacement. Automatic printing only works while the Windows agent is running and connected.</p>
      </div>
    </section>
  </div>;
}
