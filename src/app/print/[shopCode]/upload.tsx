"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { CheckCircle2, FileText, Pencil, RefreshCw, Upload } from "lucide-react";
import { formatINR } from "@/lib/money";

type Job = { id: string; file_name: string; pages: number; original_pages?: number; selected_pages?: string; print_type: string; copies: number; price: number; status: string; created_at: string };

function selectedPageIndexes(input: string, total: number): number[] {
  const value = input.trim().toLowerCase();
  if (!total) return [];
  if (value === "all") return Array.from({ length: total }, (_, i) => i);
  const selected = new Set<number>();
  for (const part of value.split(",")) {
    const token = part.trim();
    const pieces = token.split("-");
    if (pieces.length === 2 && pieces.every(piece => piece.trim() !== "" && Number.isInteger(Number(piece)))) {
      const start = Number(pieces[0]), end = Number(pieces[1]);
      if (start < 1 || end < start || end > total) return [];
      for (let page = start; page <= end; page++) selected.add(page - 1);
    } else if (pieces.length === 1 && token !== "" && Number.isInteger(Number(token))) {
      const page = Number(token);
      if (page < 1 || page > total) return [];
      selected.add(page - 1);
    } else return [];
  }
  return [...selected].sort((a, b) => a - b);
}

export default function CustomerUpload({ shopCode, shopName, bwPrice, colorPrice }: { shopCode: string; shopName: string; bwPrice: number; colorPrice: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [originalPages, setOriginalPages] = useState(0);
  const [pageSelection, setPageSelection] = useState("all");
  const [type, setType] = useState<"bw" | "color">("bw");
  const [copies, setCopies] = useState("1");
  const [customer, setCustomer] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [history, setHistory] = useState<Job[]>([]);
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [readingPdf, setReadingPdf] = useState(false);

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
    } catch { /* retry on the next refresh */ }
  }, [deviceId, shopCode]);

  useEffect(() => {
    if (!deviceId) return;
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), 10000);
    return () => window.clearInterval(timer);
  }, [deviceId, loadHistory]);

  const selectedCount = useMemo(() => selectedPageIndexes(pageSelection, originalPages).length, [pageSelection, originalPages]);
  const copyCount = Math.max(1, Number(copies) || 1);
  const unitPrice = type === "bw" ? bwPrice : colorPrice;
  const total = selectedCount * copyCount * unitPrice;

  async function chooseFile(nextFile: File | null) {
    setFile(null); setOriginalPages(0); setPageSelection("all"); setJob(null); setMessage("");
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".pdf") || nextFile.size < 1 || nextFile.size > 25 * 1024 * 1024) {
      setMessage("Choose a PDF file no larger than 25 MB."); return;
    }
    setReadingPdf(true);
    try {
      const pdf = await PDFDocument.load(await nextFile.arrayBuffer(), { ignoreEncryption: false });
      const count = pdf.getPageCount();
      if (count < 1 || count > 1000) throw new Error("PDF must contain between 1 and 1000 pages.");
      setFile(nextFile); setOriginalPages(count);
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes("between 1") ? error.message : "Could not read this PDF. It may be damaged or password-protected.");
    } finally { setReadingPdf(false); }
  }

  function saveName() {
    const name = customer.trim().slice(0, 80);
    if (!name) { setMessage("Enter your name first."); return; }
    setCustomer(name); localStorage.setItem("smartprint_customer_name_v2", name);
    setEditingName(false); setMessage("");
    void fetch(`/api/print-jobs/${shopCode}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, customerName: name }) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setMessage(""); setJob(null);
    if (!file || !originalPages) { setMessage("Choose a readable PDF file first."); return; }
    const indexes = selectedPageIndexes(pageSelection, originalPages);
    if (!indexes.length) { setMessage("Check your page selection. Use all, 2-8, or 1, 3, 7-10."); return; }
    const c = Number(copies);
    if (!Number.isInteger(c) || c < 1 || c > 100) { setMessage("Copies must be between 1 and 100."); return; }
    if (!customer.trim()) { setEditingName(true); setMessage("Enter your name before submitting."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file); body.append("printType", type); body.append("pageSelection", pageSelection.trim().toLowerCase());
      body.append("copies", String(c)); body.append("customerName", customer.trim()); body.append("deviceId", deviceId);
      const response = await fetch(`/api/print-jobs/${shopCode}`, { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit print job.");
      setJob(result.job); setMessage("Your selected pages have been sent to the shop queue."); await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed. Try again."); }
    finally { setBusy(false); }
  }

  const statusName: Record<string, string> = { pending: "Pending", printing: "Printing", printed: "Printed", failed: "Failed" };
  return <div className="customer-page">
    <section className="customer-welcome card"><div><div className="eyebrow">Welcome to SmartPrint</div><h2>{customer ? `Hi, ${customer}!` : shopName}</h2><p className="muted">Upload your PDF and track your printing status.</p></div>
      {!editingName && <button type="button" className="btn btn-secondary" onClick={() => setEditingName(true)}><Pencil size={15} /> Edit name</button>}
      {editingName && <div className="name-editor"><label htmlFor="customerName">Your name</label><input id="customerName" value={customer} maxLength={80} onChange={e => setCustomer(e.target.value)} placeholder="Enter your name" /><button type="button" className="btn" onClick={saveName}>Save name</button></div>}
    </section>
    <div className="grid2" style={{ marginTop: 20 }}><section className="card"><h2>Document details</h2><form onSubmit={submit}>
      <div className="field"><label htmlFor="pdf">PDF document</label><label className="dropzone" htmlFor="pdf"><Upload size={28} color="#2563eb" /><strong>{file ? file.name : "Tap to choose your PDF"}</strong><span className="muted" style={{ fontSize: 12 }}>{readingPdf ? "Counting pages…" : originalPages ? `${originalPages} pages detected` : "PDF only · maximum 25 MB"}</span><input id="pdf" type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={e => void chooseFile(e.target.files?.[0] || null)} /></label></div>
      {originalPages > 0 && <div className="field"><label htmlFor="pageSelection">Pages to print</label><input id="pageSelection" value={pageSelection} onChange={e => setPageSelection(e.target.value)} placeholder="all or 1-5, 8, 10-12" required /><span className="muted" style={{ fontSize: 12 }}>Choose all pages, a range like 2-8, or specific pages/ranges like 1, 3, 7-10. PDF has {originalPages} pages.</span><div className="selection-chips"><button type="button" className="chip" onClick={() => setPageSelection("all")}>All pages</button><button type="button" className="chip" onClick={() => setPageSelection(`1-${Math.min(5, originalPages)}`)}>First {Math.min(5, originalPages)} pages</button><strong>{selectedCount} selected</strong></div></div>}
      <div className="field"><label>Print type</label><select value={type} onChange={e => setType(e.target.value)}><option value="bw">Black & white — {formatINR(bwPrice)} / page</option><option value="color">Colour — {formatINR(colorPrice)} / page</option></select></div>
      <div className="field"><label>Copies</label><input type="number" min="1" max="100" value={copies} onChange={e => setCopies(e.target.value)} required /></div>
      <button className="btn btn-full" disabled={busy || readingPdf || !originalPages}>{busy ? "Preparing print-ready PDF…" : "Submit print job"}</button>
      {message && <p className="notice" role="status">{message}</p>}
      {job && <div className="notice success"><CheckCircle2 size={16} /> Job ID: {job.id}<br />Server total: {formatINR(Number(job.price))}<br />Status: {statusName[job.status] || job.status}</div>}
    </form></section>
    <aside className="card"><div className="eyebrow">Live estimate</div><div className="price-big" style={{ margin: "12px 0" }}>{formatINR(total)}</div><div className="price-row"><span className="muted">Original PDF</span><strong>{originalPages || "—"} pages</strong></div><div className="price-row"><span className="muted">Selected pages</span><strong>{selectedCount}</strong></div><div className="price-row"><span className="muted">Copies</span><strong>{copyCount}</strong></div><div className="price-row"><span className="muted">Print type</span><strong>{type === "bw" ? "Black & white" : "Colour"}</strong></div><div className="price-row"><span className="muted">Rate per page</span><strong>{formatINR(unitPrice)}</strong></div><p className="muted">Only the selected pages are sent to the print queue. The server checks the final price.</p></aside></div>
    <section className="card history-card"><div className="section-heading"><div><div className="eyebrow">Your activity</div><h2 style={{ marginTop: 7 }}>Printing history</h2></div><button type="button" className="btn btn-secondary" onClick={() => void loadHistory()}><RefreshCw size={15} /> Refresh</button></div>
      {history.length === 0 ? <p className="muted">No jobs yet. Your recent print jobs will appear here.</p> : <div className="history-list">{history.map(item => <article className="history-item" key={item.id}><div className="history-info"><strong><FileText size={16} /> {item.file_name}</strong><span className="muted">Selection: {item.selected_pages || "all"} · {item.pages} selected / {item.original_pages || item.pages} original pages · {item.copies} copies · {item.print_type === "bw" ? "B&W" : "Colour"}</span><span className="history-date">{new Date(item.created_at).toLocaleString()}</span></div><div className="history-total"><strong>{formatINR(Number(item.price))}</strong><span className={`job-status status-${item.status}`}>{statusName[item.status] || item.status}</span></div></article>)}</div>}
      <p className="muted privacy-note">Your name can be edited. This browser remembers your device; clearing browser data or changing devices may reset your history.</p>
    </section>
  </div>;
}
