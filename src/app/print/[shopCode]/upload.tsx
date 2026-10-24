 "use client";

import { FormEvent, useMemo, useState } from "react";
import { Upload, FileText, CheckCircle2 } from "lucide-react";
import { formatINR } from "@/lib/money";

export default function CustomerUpload({shopCode,shopName,bwPrice,colorPrice}:{shopCode:string;shopName:string;bwPrice:number;colorPrice:number}) {
  const [file,setFile]=useState<File|null>(null);
  const [pages,setPages]=useState("1");
  const [type,setType]=useState("bw");
  const [copies,setCopies]=useState("1");
  const [customer,setCustomer]=useState("");
  const [message,setMessage]=useState("");
  const [job,setJob]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const total=useMemo(()=>Math.max(1,Number(pages)||1)*Math.max(1,Number(copies)||1)*(type==="bw"?bwPrice:colorPrice),[pages,copies,type,bwPrice,colorPrice]);
  async function submit(e:FormEvent){e.preventDefault();setMessage("");setJob(null);
    if(!file){setMessage("Choose a PDF file first.");return;}
    if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){setMessage("Only PDF files are supported.");return;}
    if(file.size>25*1024*1024){setMessage("File must be 25 MB or smaller.");return;}
    const p=Number(pages),c=Number(copies);if(!Number.isInteger(p)||p<1||p>1000||!Number.isInteger(c)||c<1||c>100){setMessage("Enter valid pages and copies.");return;}
    setBusy(true);
    try {const body=new FormData();body.append("file",file);body.append("printType",type);body.append("pages",String(p));body.append("copies",String(c));body.append("customerName",customer);
      const response=await fetch(`/api/print-jobs/${shopCode}`,{method:"POST",body});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not submit print job.");setJob(result.job);setMessage("Your job has been added to the shop queue.");
    }catch(err){setMessage(err instanceof Error?err.message:"Upload failed. Please try again.");}finally{setBusy(false);}
  }
  return <div className="grid2" style={{marginTop:22}}><section className="card"><h2>Document details</h2><form onSubmit={submit}>
    <div className="field"><label>PDF document</label><label className="dropzone" htmlFor="pdf"><Upload size={28} color="#2563eb"/><strong>{file?file.name:"Choose a PDF file"}</strong><span className="muted" style={{fontSize:12}}>Maximum file size: 25 MB</span><input id="pdf" type="file" accept="application/pdf,.pdf" style={{display:"none"}} onChange={e=>{setFile(e.target.files?.[0]??null);setJob(null);}} /></label></div>
    <div className="field"><label>Print type</label><select value={type} onChange={e=>setType(e.target.value)}><option value="bw">Black & white — {formatINR(bwPrice)} / page</option><option value="color">Colour — {formatINR(colorPrice)} / page</option></select></div>
    <div className="grid2" style={{gridTemplateColumns:"1fr 1fr",gap:12}}><div className="field"><label>Page count</label><input type="number" min="1" max="1000" value={pages} onChange={e=>setPages(e.target.value)} required/><span className="muted" style={{fontSize:11}}>Enter total PDF pages.</span></div><div className="field"><label>Copies</label><input type="number" min="1" max="100" value={copies} onChange={e=>setCopies(e.target.value)} required/></div></div>
    <div className="field"><label>Your name (optional)</label><input value={customer} maxLength={80} onChange={e=>setCustomer(e.target.value)} placeholder="Name for collection"/></div>
    <button className="btn btn-full" disabled={busy}>{busy?"Uploading…":"Submit print job"}</button>
    {message&&<p className={`notice ${job?"success":message.toLowerCase().includes("error")||message.toLowerCase().includes("failed")?"error":""}`}>{message}</p>}
    {job&&<div className="notice success"><CheckCircle2 size={16} style={{verticalAlign:"middle",marginRight:6}}/>Job ID: <strong>{job.id}</strong><br/>Server-calculated total: <strong>{formatINR(job.price)}</strong><br/>Status: <strong>{job.status}</strong></div>}
  </form></section>
  <aside className="card"><div className="eyebrow">Estimated total</div><div className="price-big" style={{margin:"12px 0"}}>{formatINR(total)}</div><div className="price-row"><span className="muted">Pages × copies</span><strong>{Math.max(1,Number(pages)||1)} × {Math.max(1,Number(copies)||1)}</strong></div><div className="price-row"><span className="muted">Print type</span><strong>{type==="bw"?"Black & white":"Colour"}</strong></div><div className="notice" style={{marginTop:18}}>Final price is calculated again by the server using the shop's saved pricing. Please confirm your document details with the shop before collecting.</div><p className="muted" style={{fontSize:12,marginTop:18}}><FileText size={15} style={{verticalAlign:"middle",marginRight:5}}/>PDF only · up to 25 MB</p></aside></div>;
}
