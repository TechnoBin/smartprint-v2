"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckSquare, FileText, RefreshCw, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/money";

type Job = { id:string; file_name:string; print_type:string; pages:number; original_pages:number|null; selected_pages:string|null; copies:number; customer_name:string|null; price:number; status:string; created_at:string; };
const statuses = ["pending","printing","printed","failed"];
const statusLabel: Record<string,string> = { pending:"Pending", printing:"Printing", printed:"Printed", failed:"Failed" };

export default function JobsPage() {
  const [jobs,setJobs] = useState<Job[]>([]);
  const [message,setMessage] = useState("Loading print jobs…");
  const [busyId,setBusyId] = useState("");
  const [selected,setSelected] = useState<string[]>([]);
  const [search,setSearch] = useState("");
  const [filter,setFilter] = useState("all");
  const [confirmDelete,setConfirmDelete] = useState(false);
  const [deleting,setDeleting] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data:{user} } = await supabase.auth.getUser();
    if (!user) { setMessage("Please sign in again."); return; }
    const { data:shop } = await supabase.from("shops").select("id").eq("owner_id",user.id).maybeSingle();
    if (!shop) { setJobs([]); setMessage("No shop is linked to this account."); return; }
    const { data,error } = await supabase.from("print_jobs").select("id,file_name,print_type,pages,original_pages,selected_pages,copies,customer_name,price,status,created_at").eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(500);
    if (error) { setMessage(error.message); return; }
    setJobs((data??[]) as Job[]); setSelected(old => old.filter(id => (data??[]).some(j => j.id === id))); setMessage(data?.length ? "" : "No print jobs yet. New customer uploads will appear here.");
  },[]);

  useEffect(() => { void load(); const timer=window.setInterval(()=>void load(),10000); return ()=>window.clearInterval(timer); },[load]);

  const visibleJobs = useMemo(() => jobs.filter(job => {
    const matchesStatus = filter === "all" || job.status === filter;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [job.id,job.file_name,job.customer_name??"",job.print_type,job.status].some(v=>v.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  }),[jobs,filter,search]);
  const allVisibleSelected = visibleJobs.length > 0 && visibleJobs.every(job => selected.includes(job.id));

  async function update(id:string,status:string) {
    setBusyId(id); setMessage("");
    const supabase=createClient();
    const {error}=await supabase.from("print_jobs").update({status,...(status==="printed"?{printed_at:new Date().toISOString()}:{})}).eq("id",id);
    if(error)setMessage(error.message);else await load();
    setBusyId("");
  }
  function toggle(id:string) { setSelected(old => old.includes(id) ? old.filter(item=>item!==id) : [...old,id]); }
  function toggleVisible() { setSelected(old => allVisibleSelected ? old.filter(id=>!visibleJobs.some(job=>job.id===id)) : [...new Set([...old,...visibleJobs.map(job=>job.id)])]); }

  async function deleteSelected() {
    if (!selected.length) return;
    setDeleting(true); setMessage("");
    try {
      const response=await fetch("/api/admin/print-jobs",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:selected})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||"Could not delete selected jobs.");
      setSelected([]); setConfirmDelete(false); setMessage(`${result.deleted} job${result.deleted===1?"":"s"} permanently deleted, including stored files.`);
      await load();
    } catch(error) { setMessage(error instanceof Error?error.message:"Delete failed."); }
    finally { setDeleting(false); }
  }

  const pending = jobs.filter(j=>j.status==="pending").length;
  const printing = jobs.filter(j=>j.status==="printing").length;
  const printed = jobs.filter(j=>j.status==="printed").length;
  const revenue = jobs.filter(j=>j.status==="printed").reduce((sum,j)=>sum+Number(j.price),0);

  return <div className="admin-jobs-page">
    <style jsx global>{`
      .admin-jobs-page { color:#101828; }
      .admin-jobs-page .admin-page-heading { align-items:center; margin-bottom:28px; }
      .admin-jobs-page .admin-page-heading h1 { font-size:clamp(30px,3vw,40px); letter-spacing:-1.3px; }
      .admin-jobs-page .admin-page-heading .muted { margin:0; font-size:13px; }
      .admin-jobs-page .admin-page-heading>.btn { min-height:44px; box-shadow:0 2px 5px rgba(16,24,40,.06); }
      .admin-jobs-page .admin-metrics { gap:16px; margin:26px 0; }
      .admin-jobs-page .metric-card { position:relative; overflow:hidden; padding:22px; border-radius:18px; transition:transform .18s ease,box-shadow .18s ease; }
      .admin-jobs-page .metric-card:hover { transform:translateY(-2px); box-shadow:0 12px 28px rgba(16,24,40,.07); }
      .admin-jobs-page .metric-card:after { content:""; position:absolute; width:4px; inset:0 auto 0 0; background:#3157d5; opacity:.8; }
      .admin-jobs-page .metric-card:nth-child(2):after { background:#7f56d9; }
      .admin-jobs-page .metric-card:nth-child(3):after { background:#12b76a; }
      .admin-jobs-page .metric-card:nth-child(4):after { background:#f79009; }
      .admin-jobs-page .metric-card strong { margin:12px 0 6px; font-variant-numeric:tabular-nums; }
      .admin-jobs-page .jobs-workspace { border-radius:18px; box-shadow:0 5px 22px rgba(16,24,40,.045); }
      .admin-jobs-page .jobs-toolbar { padding:20px 22px; background:linear-gradient(180deg,#fff,#fcfcfd); }
      .admin-jobs-page .search-box { min-height:46px; transition:border-color .15s,box-shadow .15s; }
      .admin-jobs-page .search-box:focus-within { border-color:#84adff; box-shadow:0 0 0 3px rgba(49,87,213,.10); }
      .admin-jobs-page .jobs-toolbar>select { min-width:155px; min-height:44px; }
      .admin-jobs-page .bulk-toolbar { padding:14px 22px; }
      .admin-jobs-page .admin-table-wrap { max-height:min(68vh,760px); overflow:auto; }
      .admin-jobs-page .admin-jobs-table { min-width:1020px; }
      .admin-jobs-page .admin-jobs-table thead th { position:sticky; top:0; z-index:2; background:#f8f9fc; box-shadow:0 1px 0 #eaecf0; }
      .admin-jobs-page .admin-jobs-table th { padding:14px 13px; font-size:10px; letter-spacing:.8px; }
      .admin-jobs-page .admin-jobs-table td { padding:15px 13px; }
      .admin-jobs-page .admin-jobs-table tbody tr { transition:background .12s; }
      .admin-jobs-page .admin-jobs-table tbody tr:hover { background:#f8faff; }
      .admin-jobs-page .admin-jobs-table td:nth-child(2) code { display:inline-block; max-width:115px; color:#667085; font-size:10px!important; }
      .admin-jobs-page .admin-jobs-table select { min-width:112px; min-height:40px; border-color:#c7d2fe; background:#eff4ff; color:#2448bc; font-weight:800; font-size:12px; cursor:pointer; }
      .admin-jobs-page .admin-jobs-table select:focus-visible,.admin-jobs-page button:focus-visible { outline:3px solid rgba(49,87,213,.24); outline-offset:2px; }
      .admin-jobs-page .admin-jobs-table .job-status { padding:7px 10px; }
      .admin-jobs-page .job-file-cell { gap:6px; }
      .admin-jobs-page .job-file-cell strong { font-size:12px; color:#344054; }
      .admin-jobs-page .job-file-cell a { max-width:210px; overflow-wrap:anywhere; font-size:12px; line-height:1.4; }
      .admin-jobs-page .job-file-cell small { line-height:1.4; }
      .admin-jobs-page .notice { margin:14px 18px; }
      .mobile-job-list { display:none; }
      .mobile-job-card { background:#fff; border:1px solid var(--admin-line,#eaecf0); border-radius:15px; padding:15px; display:grid; gap:13px; box-shadow:0 3px 12px rgba(16,24,40,.035); }
      .mobile-job-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
      .mobile-job-identity { display:flex; align-items:flex-start; gap:10px; min-width:0; }
      .mobile-job-identity input { width:18px; height:18px; margin-top:2px; flex:0 0 auto; accent-color:#3157d5; }
      .mobile-job-name { min-width:0; display:grid; gap:5px; }
      .mobile-job-name strong { font-size:14px; overflow-wrap:anywhere; }
      .mobile-job-name a { font-size:12px; color:#3157d5; text-decoration:underline; text-underline-offset:3px; overflow-wrap:anywhere; }
      .mobile-job-name small { font-size:10px; color:#98a2b3; overflow-wrap:anywhere; }
      .mobile-job-status { display:grid; gap:5px; min-width:112px; }
      .mobile-job-status label { font-size:10px; color:#667085; font-weight:800; }
      .mobile-job-status select { width:100%; min-height:40px; border:1px solid #c7d2fe; border-radius:10px; background:#eff4ff; color:#2448bc; padding:0 8px; font-size:12px; font-weight:800; }
      .mobile-job-status select:disabled { opacity:.6; }
      .mobile-job-details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
      .mobile-job-detail { min-width:0; padding:10px; background:#f9fafb; border-radius:10px; display:grid; gap:4px; }
      .mobile-job-detail span { font-size:10px; color:#667085; }
      .mobile-job-detail strong { font-size:13px; overflow-wrap:anywhere; }
      .mobile-job-date { font-size:10px; color:#98a2b3; }
      @media(min-width:761px) and (max-width:1100px) {
        .admin-jobs-page .admin-metrics { gap:11px; }
        .admin-jobs-page .metric-card { padding:17px; }
        .admin-jobs-page .admin-table-wrap { max-height:65vh; }
      }
      @media(max-width:760px) {
        .admin-jobs-page .admin-table-wrap { display:none; }
        .admin-jobs-page .mobile-job-list { display:grid; gap:11px; padding:12px; }
        .admin-jobs-page .jobs-workspace { overflow:visible; }
        .admin-jobs-page .bulk-toolbar { position:sticky; top:0; z-index:4; background:#fbfcfe; }
        .admin-jobs-page .mobile-job-status { min-width:108px; }
      }
      @media(max-width:380px) {
        .mobile-job-card { padding:12px; }
        .mobile-job-top { flex-direction:column; }
        .mobile-job-status { width:100%; }
      }
    `}</style>
    <div className="admin-page-heading"><div><div className="eyebrow">Operations · Live queue</div><h1>Print jobs</h1><p className="muted">Manage incoming orders, update status, and safely remove old jobs.</p></div><button className="btn btn-secondary" type="button" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</button></div>
    <div className="admin-metrics"><div className="metric-card"><span>Pending</span><strong>{pending}</strong><small>Awaiting print</small></div><div className="metric-card"><span>Printing</span><strong>{printing}</strong><small>In progress</small></div><div className="metric-card"><span>Printed</span><strong>{printed}</strong><small>Completed jobs</small></div><div className="metric-card"><span>Printed value</span><strong>{formatINR(revenue)}</strong><small>Marked as printed</small></div></div>
    <section className="card jobs-workspace">
      <div className="jobs-toolbar"><label className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job ID, file, customer, status…" /></label><select aria-label="Filter by status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select></div>
      <div className="bulk-toolbar"><label className="select-all-label"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={!visibleJobs.length}/><span>{selected.length ? `${selected.length} selected` : "Select jobs"}</span></label><div className="bulk-actions">{selected.length>0&&<button type="button" className="btn btn-danger" onClick={()=>setConfirmDelete(true)}><Trash2 size={16}/> Delete selected ({selected.length})</button>}</div></div>
      {message&&<p className={message.toLowerCase().includes("failed")||message.toLowerCase().includes("could not")?"notice error":"notice"} role="status">{message}</p>}
      {visibleJobs.length===0?<div className="empty-state"><FileText size={30}/><strong>No matching jobs</strong><p className="muted">Try another search or status filter.</p></div>:<>
        <div className="mobile-job-list">{visibleJobs.map(j=><article className="mobile-job-card" key={j.id}>
          <div className="mobile-job-top">
            <div className="mobile-job-identity"><input aria-label={`Select ${j.file_name}`} type="checkbox" checked={selected.includes(j.id)} onChange={()=>toggle(j.id)}/><div className="mobile-job-name"><strong>{j.customer_name||"Guest customer"}</strong><a href={`/api/admin/print-jobs/${j.id}/file`} target="_blank" rel="noreferrer" title="Open or download uploaded PDF">{j.file_name}</a><small>ID: {j.id.slice(0,8)}… · {j.selected_pages||"All pages"}</small></div></div>
            <div className="mobile-job-status"><label htmlFor={`mobile-status-${j.id}`}>CHANGE STATUS</label><select id={`mobile-status-${j.id}`} aria-label={`Update status for ${j.file_name}`} value={j.status} disabled={busyId===j.id} onChange={e=>void update(j.id,e.target.value)}>{statuses.map(s=><option key={s} value={s}>{busyId===j.id?"Saving…":statusLabel[s]}</option>)}</select></div>
          </div>
          <div className="mobile-job-details"><div className="mobile-job-detail"><span>Pages</span><strong>{j.pages} <small style={{fontWeight:400,color:"#667085"}}>/ {j.original_pages||j.pages} original</small></strong></div><div className="mobile-job-detail"><span>Print setup</span><strong>{j.print_type==="bw"?"B&W":"Colour"} · {j.copies} {j.copies===1?"copy":"copies"}</strong></div><div className="mobile-job-detail"><span>Total</span><strong>{formatINR(Number(j.price))}</strong></div><div className="mobile-job-detail"><span>Current status</span><strong><span className={`job-status status-${j.status}`}>{statusLabel[j.status]||j.status}</span></strong></div></div>
          <div className="mobile-job-date">Submitted {new Date(j.created_at).toLocaleString()}</div>
        </article>)}</div>
        <div className="table-wrap admin-table-wrap"><table className="admin-jobs-table"><thead><tr><th><span className="sr-only">Select</span></th><th>Job ID</th><th>Customer / file</th><th>Pages</th><th>Print setup</th><th>Total</th><th>Submitted</th><th>Status</th><th>Update</th></tr></thead><tbody>{visibleJobs.map(j=><tr key={j.id}><td><input aria-label={`Select ${j.file_name}`} type="checkbox" checked={selected.includes(j.id)} onChange={()=>toggle(j.id)}/></td><td><code style={{fontSize:11,wordBreak:"break-all"}} title={j.id}>{j.id}</code></td><td><div className="job-file-cell"><strong>{j.customer_name||"Guest customer"}</strong><a href={`/api/admin/print-jobs/${j.id}/file`} target="_blank" rel="noreferrer" style={{color:"var(--accent, #8b6b35)",textDecoration:"underline",textUnderlineOffset:3}} title="Open or download this uploaded PDF">{j.file_name}</a><small>Tap filename to open PDF · Selection: {j.selected_pages||"all"}</small></div></td><td><strong>{j.pages}</strong><small className="cell-subtext">of {j.original_pages||j.pages} original</small></td><td><strong>{j.print_type==="bw"?"B&W":"Colour"}</strong><small className="cell-subtext">{j.copies} {j.copies===1?"copy":"copies"}</small></td><td><strong>{formatINR(Number(j.price))}</strong></td><td><time>{new Date(j.created_at).toLocaleString()}</time></td><td><span className={`job-status status-${j.status}`}>{statusLabel[j.status]||j.status}</span></td><td><select aria-label={`Update status for ${j.file_name}`} value={j.status} disabled={busyId===j.id} onChange={e=>void update(j.id,e.target.value)}>{statuses.map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select></td></tr>)}</tbody></table></div>
      </>}
    </section>
    {confirmDelete&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!deleting)setConfirmDelete(false);}}><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="modal-icon danger-icon"><Trash2 size={22}/></div><h2 id="delete-title">Delete {selected.length} selected {selected.length===1?"job":"jobs"}?</h2><p className="muted">This permanently removes the selected database records and their stored print files. This action cannot be undone.</p><div className="modal-actions"><button className="btn btn-secondary" type="button" disabled={deleting} onClick={()=>setConfirmDelete(false)}>Cancel</button><button className="btn btn-danger" type="button" disabled={deleting} onClick={()=>void deleteSelected()}>{deleting?"Deleting…":"Delete permanently"}</button></div></section></div>}
  </div>;
}
