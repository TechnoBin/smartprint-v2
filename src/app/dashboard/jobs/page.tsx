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
    const matchesSearch = !q || [job.file_name,job.customer_name??"",job.print_type,job.status].some(v=>v.toLowerCase().includes(q));
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
    <div className="admin-page-heading"><div><div className="eyebrow">Operations · Live queue</div><h1>Print jobs</h1><p className="muted">Manage incoming orders, update status, and safely remove old jobs.</p></div><button className="btn btn-secondary" type="button" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</button></div>
    <div className="admin-metrics"><div className="metric-card"><span>Pending</span><strong>{pending}</strong><small>Awaiting print</small></div><div className="metric-card"><span>Printing</span><strong>{printing}</strong><small>In progress</small></div><div className="metric-card"><span>Printed</span><strong>{printed}</strong><small>Completed jobs</small></div><div className="metric-card"><span>Printed value</span><strong>{formatINR(revenue)}</strong><small>Marked as printed</small></div></div>
    <section className="card jobs-workspace">
      <div className="jobs-toolbar"><label className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search file, customer, status…" /></label><select aria-label="Filter by status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select></div>
      <div className="bulk-toolbar"><label className="select-all-label"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={!visibleJobs.length}/><span>{selected.length ? `${selected.length} selected` : "Select jobs"}</span></label><div className="bulk-actions">{selected.length>0&&<button type="button" className="btn btn-danger" onClick={()=>setConfirmDelete(true)}><Trash2 size={16}/> Delete selected ({selected.length})</button>}</div></div>
      {message&&<p className={message.toLowerCase().includes("failed")||message.toLowerCase().includes("could not")?"notice error":"notice"} role="status">{message}</p>}
      {visibleJobs.length===0?<div className="empty-state"><FileText size={30}/><strong>No matching jobs</strong><p className="muted">Try another search or status filter.</p></div>:<div className="table-wrap admin-table-wrap"><table className="admin-jobs-table"><thead><tr><th><span className="sr-only">Select</span></th><th>Customer / file</th><th>Pages</th><th>Print setup</th><th>Total</th><th>Submitted</th><th>Status</th><th>Update</th></tr></thead><tbody>{visibleJobs.map(j=><tr key={j.id}><td><input aria-label={`Select ${j.file_name}`} type="checkbox" checked={selected.includes(j.id)} onChange={()=>toggle(j.id)}/></td><td><div className="job-file-cell"><strong>{j.customer_name||"Guest customer"}</strong><span>{j.file_name}</span><small>Selection: {j.selected_pages||"all"}</small></div></td><td><strong>{j.pages}</strong><small className="cell-subtext">of {j.original_pages||j.pages} original</small></td><td><strong>{j.print_type==="bw"?"B&W":"Colour"}</strong><small className="cell-subtext">{j.copies} {j.copies===1?"copy":"copies"}</small></td><td><strong>{formatINR(Number(j.price))}</strong></td><td><time>{new Date(j.created_at).toLocaleString()}</time></td><td><span className={`job-status status-${j.status}`}>{statusLabel[j.status]||j.status}</span></td><td><select aria-label={`Update status for ${j.file_name}`} value={j.status} disabled={busyId===j.id} onChange={e=>void update(j.id,e.target.value)}>{statuses.map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select></td></tr>)}</tbody></table></div>}
    </section>
    {confirmDelete&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!deleting)setConfirmDelete(false);}}><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="modal-icon danger-icon"><Trash2 size={22}/></div><h2 id="delete-title">Delete {selected.length} selected {selected.length===1?"job":"jobs"}?</h2><p className="muted">This permanently removes the selected database records and their stored print files. This action cannot be undone.</p><div className="modal-actions"><button className="btn btn-secondary" type="button" disabled={deleting} onClick={()=>setConfirmDelete(false)}>Cancel</button><button className="btn btn-danger" type="button" disabled={deleting} onClick={()=>void deleteSelected()}>{deleting?"Deleting…":"Delete permanently"}</button></div></section></div>}
  </div>;
}
