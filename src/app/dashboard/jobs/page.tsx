 "use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/money";

type Job = { id:string; file_name:string; print_type:string; pages:number; price:number; status:string; created_at:string; };
const statuses = ["pending","printing","printed","failed"];

export default function JobsPage() {
  const [jobs,setJobs]=useState<Job[]>([]);
  const [message,setMessage]=useState("Loading print jobs…");
  const [busyId,setBusyId]=useState("");
  const load=useCallback(async()=>{const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();if(!user){setMessage("Please sign in again.");return;}
    const {data:shop}=await supabase.from("shops").select("id").eq("owner_id",user.id).maybeSingle();
    if(!shop){setJobs([]);setMessage("No shop is linked to this account yet.");return;}
    const {data,error}=await supabase.from("print_jobs").select("id,file_name,print_type,pages,price,status,created_at").eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(100);
    if(error){setMessage(error.message);return;}setJobs((data??[]) as Job[]);setMessage(data?.length?"":"No print jobs yet.");},[]);
  useEffect(()=>{void load();const t=setInterval(()=>void load(),10000);return()=>clearInterval(t);},[load]);
  async function update(id:string,status:string){setBusyId(id);setMessage("");const supabase=createClient();const {error}=await supabase.from("print_jobs").update({status, ...(status==="printed"?{printed_at:new Date().toISOString()}:{})}).eq("id",id);if(error)setMessage(error.message);else await load();setBusyId("");}
  return <><div className="eyebrow">Live queue · refreshes every 10 seconds</div><h1>Print jobs</h1><p className="muted">Review incoming PDFs and update their status. Printing is still a manual shop-side step in this MVP.</p>{message&&<p className="notice">{message}</p>}<div className="table-wrap"><table><thead><tr><th>File</th><th>Type</th><th>Pages</th><th>Total</th><th>Submitted</th><th>Status</th><th>Update</th></tr></thead><tbody>{jobs.map(j=><tr key={j.id}><td>{j.file_name}</td><td>{j.print_type}</td><td>{j.pages}</td><td>{formatINR(Number(j.price))}</td><td>{new Date(j.created_at).toLocaleString()}</td><td><span className="status">{j.status}</span></td><td><select value={j.status} disabled={busyId===j.id} onChange={e=>void update(j.id,e.target.value)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div></>;
}
