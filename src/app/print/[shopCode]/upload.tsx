"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, Pencil, RefreshCw, Upload } from "lucide-react";
import { formatINR } from "@/lib/money";

type Job = { id: string; file_name: string; pages: number; original_pages?: number; selected_pages?: string; print_type: string; copies: number; price: number; status: string; created_at: string };

export default function CustomerUpload({ shopCode, shopName, bwPrice, colorPrice }: { shopCode: string; shopName: string; bwPrice: number; colorPrice: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState("1");
  const [type, setType] = useState("bw");
  const [copies, setCopies] = useState("1");
  const [customer, setCustomer] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [history, setHistory] = useState<Job[]>([]);
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let id = localStorage.getItem("smartprint_customer_device_v2");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("smartprint_customer_device_v2", id); }
    setDeviceId(id);
    const name = localStorage.getItem("smartprint_customer_name_v2") || "";
    setCustomer(name); setEditingName(!name);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!deviceId) return;
    try {
      const response = await fetch(`/api/print-jobs/${shopCode}?deviceId=${encodeURIComponent(deviceId)}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setHistory(data.jobs || []);
    } catch { /* history refreshes on the next interval */ }
  }, [deviceId, shopCode]);

  useEffect(() => {
    if (!deviceId) return;
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), 10000);
    return () => window.clearInterval(timer);
  }, [deviceId, loadHistory]);

  function saveName() {
    const name = customer.trim().slice(0, 80);
    if (!name) { setMessage("Enter your name first."); return; }
    setCustomer(name); localStorage.setItem("smartprint_customer_name_v2", name);
    setEditingName(false); setMessage("");
    void fetch(`/api/print-jobs/${shopCode}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, customerName: name }) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setMessage(""); setJob(null);
    if (!file) { setMessage("Choose a PDF file first."); return; }
    if (file.size < 1 || file.size > 25 * 1024 * 1024) { setMessage("PDF must be 25 MB or smaller."); return; }
    const p = Number(pages), c = Number(copies);
    if (!Number.isInteger(p) || p < 1 || p > 1000 || !Number.isInteger(c) || c < 1 || c > 100) { setMessage("Enter valid pages and copies."); return; }
    if (!customer.trim()) { setEditingName(true); setMessage("Enter your name before submitting."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file); body.append("printType", type); body.append("pages", String(p));
      body.append("copies", String(c)); body.append("customerName", customer.trim()); body.append("deviceId", deviceId);
      const response = await fetch(`/api/print-jobs/${shopCode}`, { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit print job.");
      setJob(result.job); setMessage("Your print job has been added to the queue."); await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed. Try again."); }
    finally { setBusy(false); }
  }

  const unitPrice = type === "bw" ? bwPrice : colorPrice;
  const total = Math.max(1, Number(pages) || 1) * Math.max(1, Number(copies) || 1) * unitPrice;
  const statusName: Record<string, string> = { pending: "Pending", printing: "Printing", printed: "Printed", failed: "Failed" };

  return <div className="customer-page">
    <section className="customer-welcome card"><div><div className="eyebrow">Welcome to SmartPrint</div><h2>{customer ? `Hi, ${customer}!` : shopName}</h2><p className="muted">Upload your PDF and track your printing status.</p></div>
      {!editingName && <button type="button" className="btn btn-secondary" onClick={() => setEditingName(true)}><Pencil size={15} /> Edit name</button>}
      {editingName && <div className="name-editor"><label htmlFor="customerName">Your name</label><input id="customerName" value={customer} maxLength={80} onChange={e => setCustomer(e.target.value)} placeholder="Enter your name" /><button type="button" className="btn" onClick={saveName}>Save name</button></div>}
    </section>
    <div className="grid2" style={{ marginTop: 20 }}><section className="card"><h2>Document details</h2><form onSubmit={submit}>
      <div className="field"><label htmlFor="pdf">PDF document</label><label className="dropzone" htmlFor="pdf"><Upload size={28} color="#2563eb" /><strong>{file ? file.name : "Tap to choose your PDF"}</strong><span className="muted" style={{ fontSize: 12 }}>Maximum file size: 25 MB</span><input id="pdf" type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={e => { setFile(e.target.files?.[0] || null); setJob(null); }} /></label></div>
      <div className="field"><label>Print type</label><select value={type} onChange={e => setType(e.target.value)}><option value="bw">Black & white — {formatINR(bwPrice)} / page</option><option value="color">Colour — {formatINR(colorPrice)} / page</option></select></div>
      <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}><div className="field"><label>Page count</label><input type="number" min="1" max="1000" value={pages} onChange={e => setPages(e.target.value)} required /></div><div className="field"><label>Copies</label><input type="number" min="1" max="100" value={copies} onChange={e => setCopies(e.target.value)} required /></div></div>
      <button className="btn btn-full" disabled={busy || !deviceId}>{busy ? "Uploading…" : "Submit print job"}</button>
      {message && <p className="notice" role="status">{message}</p>}
      {job && <div className="notice success"><CheckCircle2 size={16} /> Job ID: {job.id}<br />Server total: {formatINR(Number(job.price))}<br />Status: {job.status}</div>}
    </form></section>
    <aside className="card"><div className="eyebrow">Estimated total</div><div className="price-big" style={{ margin: "12px 0" }}>{formatINR(total)}</div><div className="price-row"><span className="muted">Pages × copies</span><strong>{pages} × {copies}</strong></div><div className="price-row"><span className="muted">Print type</span><strong>{type === "bw" ? "Black & white" : "Colour"}</strong></div><p className="muted">Final price is recalculated by the server using the shop's saved pricing.</p></aside></div>
    <section className="card history-card"><div className="section-heading"><div><div className="eyebrow">Your activity</div><h2 style={{ marginTop: 7 }}>Printing history</h2></div><button type="button" className="btn btn-secondary" onClick={() => void loadHistory()}><RefreshCw size={15} /> Refresh</button></div>
      {history.length === 0 ? <p className="muted">No jobs yet. Your recent print jobs will appear here.</p> : <div className="history-list">{history.map(item => <article className="history-item" key={item.id}><div className="history-file-icon"><FileText size={20} /></div><div className="history-info"><strong>{item.file_name}</strong><span className="muted">{item.pages} pages · {item.copies} copies · {item.print_type === "bw" ? "B&W" : "Colour"}</span><span className="history-date">{new Date(item.created_at).toLocaleString()}</span></div><div className="history-total"><strong>{formatINR(Number(item.price))}</strong><span className={`job-status status-${item.status}`}>{statusName[item.status] || item.status}</span></div></article>)}</div>}
      <p className="muted privacy-note">Your name can be edited. This browser remembers your device; clearing browser data or changing devices may reset your history.</p>
    </section>
  </div>;
}
