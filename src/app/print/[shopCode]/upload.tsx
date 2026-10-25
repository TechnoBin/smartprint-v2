"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { CheckCircle2, FileImage, FileText, Pencil, RefreshCw, Upload, ZoomIn, Crop } from "lucide-react";
import { formatINR } from "@/lib/money";

type Job = { id:string; file_name:string; pages:number; original_pages?:number; selected_pages?:string; print_type:string; copies:number; price:number; status:string; created_at:string };
type UploadMode = "pdf" | "image";
type ImageEdit = { zoom:number; x:number; y:number };
const DEFAULT_IMAGE_EDIT:ImageEdit={zoom:1,x:50,y:50};

function selectedPageIndexes(input:string,total:number):number[] {
  const value=input.trim().toLowerCase();
  if (!total) return [];
  if (value==="all") return Array.from({length:total},(_,i)=>i);
  const selected=new Set<number>();
  for (const part of value.split(",")) {
    const token=part.trim(), pieces=token.split("-");
    if (pieces.length===2 && pieces.every(piece=>piece.trim()!=="" && /^\d+$/.test(piece))) {
      const start=Number(pieces[0]),end=Number(pieces[1]);
      if(start<1||end<start||end>total)return [];
      for(let p=start;p<=end;p++)selected.add(p-1);
    } else if(pieces.length===1 && /^\d+$/.test(token)) {
      const p=Number(token);if(p<1||p>total)return [];selected.add(p-1);
    } else return [];
  }
  return [...selected].sort((a,b)=>a-b);
}

async function imagesToA4Pdf(files:File[],edits:ImageEdit[]):Promise<File> {
  const output=await PDFDocument.create();
  const width=1240,height=1754;
  for(const file of files) {
    const imageUrl=URL.createObjectURL(file);
    try {
      const image=new Image();
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("One of the images could not be opened."));image.src=imageUrl;});
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Image editing is not supported in this browser.");
      ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);
      const edit=edits[files.indexOf(file)]||DEFAULT_IMAGE_EDIT;
      const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight)*edit.zoom;
      const drawWidth=image.naturalWidth*scale,drawHeight=image.naturalHeight*scale;
      ctx.drawImage(image,width*(edit.x/100)-drawWidth/2,height*(edit.y/100)-drawHeight/2,drawWidth,drawHeight);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not prepare the image.")),"image/png"));
      const png=await output.embedPng(await blob.arrayBuffer());
      const page=output.addPage([595.28,841.89]);
      page.drawImage(png,{x:0,y:0,width:595.28,height:841.89});
    } finally { URL.revokeObjectURL(imageUrl); }
  }
  const bytes=await output.save();
  // Copy into a definite ArrayBuffer so TypeScript accepts it as a BlobPart.
  const pdfBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(pdfBuffer).set(bytes);
  return new File([pdfBuffer],`images-a4-${files.length}-pages.pdf`,{type:"application/pdf"});
}

export default function CustomerUpload({shopCode,shopName,bwPrice,colorPrice}:{shopCode:string;shopName:string;bwPrice:number;colorPrice:number}) {
  const [mode,setMode]=useState<UploadMode>("pdf");
  const [file,setFile]=useState<File|null>(null);
  const [imageFiles,setImageFiles]=useState<File[]>([]);
  const [imageUrls,setImageUrls]=useState<string[]>([]);
  const [imageIndex,setImageIndex]=useState(0);
  const [imageEdits,setImageEdits]=useState<ImageEdit[]>([]);
  const [editScope,setEditScope]=useState<"all"|"single">("all");
  const cropDragStart=useRef<{x:number;y:number;imageX:number;imageY:number}|null>(null);
  const activeEdit=imageEdits[imageIndex]||DEFAULT_IMAGE_EDIT;
  function updateImageEdit<K extends keyof ImageEdit>(key:K,value:ImageEdit[K]) {
    setImageEdits(previous=>previous.map((edit,index)=>editScope==="all"||index===imageIndex?{...edit,[key]:value}:edit));
  }
  function changeEditScope(scope:"all"|"single") {
    if(scope==="all"&&imageEdits.length){const current={...activeEdit};setImageEdits(previous=>previous.map(()=>current));}
    setEditScope(scope);
  }
  const [originalPages,setOriginalPages]=useState(0);
  const [pageSelection,setPageSelection]=useState("all");
  const [type,setType]=useState<"bw"|"color">("bw");
  const [copies,setCopies]=useState("1");
  const [customer,setCustomer]=useState("");
  const [editingName,setEditingName]=useState(false);
  const [deviceId,setDeviceId]=useState("");
  const [history,setHistory]=useState<Job[]>([]);
  const [message,setMessage]=useState("");
  const [job,setJob]=useState<Job|null>(null);
  const [busy,setBusy]=useState(false);
  const [readingPdf,setReadingPdf]=useState(false);

  useEffect(()=>{
    let id=localStorage.getItem("smartprint_customer_device_v2");
    if(!id){id=crypto.randomUUID();localStorage.setItem("smartprint_customer_device_v2",id);}
    setDeviceId(id);
    const name=localStorage.getItem("smartprint_customer_name_v2")||"";
    setCustomer(name);setEditingName(!name);
  },[]);

  useEffect(()=>()=>{imageUrls.forEach(url=>URL.revokeObjectURL(url));},[imageUrls]);

  const loadHistory=useCallback(async()=>{
    if(!deviceId)return;
    try{const response=await fetch(`/api/print-jobs/${shopCode}?deviceId=${encodeURIComponent(deviceId)}`,{cache:"no-store"});const data=await response.json();if(response.ok)setHistory(data.jobs||[]);}
    catch{/* retry on next refresh */}
  },[deviceId,shopCode]);
  useEffect(()=>{if(!deviceId)return;void loadHistory();const timer=window.setInterval(()=>void loadHistory(),10000);return()=>window.clearInterval(timer);},[deviceId,loadHistory]);

  const selectedCount=useMemo(()=>selectedPageIndexes(pageSelection,originalPages).length,[pageSelection,originalPages]);
  const copyCount=Math.max(1,Number(copies)||1);
  const unitPrice=type==="bw"?bwPrice:colorPrice;
  const total=selectedCount*copyCount*unitPrice;
  const statusName:Record<string,string>={pending:"Pending",printing:"Printing",printed:"Printed",failed:"Failed"};

  async function choosePdf(nextFile:File|null){
    setFile(null);setOriginalPages(0);setPageSelection("all");setJob(null);setMessage("");
    if(!nextFile)return;
    if(!nextFile.name.toLowerCase().endsWith(".pdf")||nextFile.size<1||nextFile.size>25*1024*1024){setMessage("Choose a PDF no larger than 25 MB.");return;}
    setReadingPdf(true);
    try{const pdf=await PDFDocument.load(await nextFile.arrayBuffer(),{ignoreEncryption:false});const count=pdf.getPageCount();if(count<1||count>1000)throw new Error("PDF must contain between 1 and 1000 pages.");setFile(nextFile);setOriginalPages(count);}
    catch(error){setMessage(error instanceof Error&&error.message.includes("between 1")?error.message:"Could not read this PDF. It may be damaged or password-protected.");}
    finally{setReadingPdf(false);}
  }

  function chooseImages(list:FileList|null){
    const files=Array.from(list||[]);
    setImageUrls([]);setImageFiles([]);setFile(null);setOriginalPages(0);setPageSelection("all");setJob(null);setMessage("");
    if(!files.length)return;
    if(files.length>20){setMessage("Choose up to 20 images per job.");return;}
    if(files.some(f=>!f.type.startsWith("image/")||f.size<1||f.size>12*1024*1024)){setMessage("Use image files (JPG, PNG or WebP), each no larger than 12 MB.");return;}
    setImageFiles(files);setImageUrls(files.map(f=>URL.createObjectURL(f)));setImageIndex(0);setOriginalPages(files.length);setImageEdits(files.map(()=>({...DEFAULT_IMAGE_EDIT})));setEditScope("all");
  }

  function saveName(){
    const name=customer.trim().slice(0,80);if(!name){setMessage("Enter your name first.");return;}
    setCustomer(name);localStorage.setItem("smartprint_customer_name_v2",name);setEditingName(false);setMessage("");
    void fetch(`/api/print-jobs/${shopCode}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId,customerName:name})});
  }

  async function submit(e:FormEvent){
    e.preventDefault();setMessage("");setJob(null);
    if(!originalPages){setMessage(mode==="pdf"?"Choose a readable PDF first.":"Choose at least one image first.");return;}
    const indexes=selectedPageIndexes(pageSelection,originalPages);
    if(!indexes.length){setMessage("Check the page selection. Use all, 2-8, or 1, 3, 7-10.");return;}
    const c=Number(copies);if(!Number.isInteger(c)||c<1||c>100){setMessage("Copies must be between 1 and 100.");return;}
    if(!customer.trim()){setEditingName(true);setMessage("Enter your name before submitting.");return;}
    setBusy(true);
    try{
      let uploadFile=file;
      if(mode==="image"){uploadFile=await imagesToA4Pdf(imageFiles,imageEdits);}
      if(!uploadFile)throw new Error("Choose a file first.");
      if(uploadFile.size>25*1024*1024)throw new Error("The prepared PDF exceeds 25 MB. Try fewer or smaller images.");
      const body=new FormData();body.append("file",uploadFile);body.append("printType",type);body.append("pageSelection",pageSelection.trim().toLowerCase());body.append("copies",String(c));body.append("customerName",customer.trim());body.append("deviceId",deviceId);
      const response=await fetch(`/api/print-jobs/${shopCode}`,{method:"POST",body});const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Could not submit print job.");
      setJob(result.job);setMessage("Your print-ready file has been sent to the shop queue.");await loadHistory();
    }catch(error){setMessage(error instanceof Error?error.message:"Upload failed. Try again.");}
    finally{setBusy(false);}
  }

  const currentImageUrl=imageUrls[imageIndex];
  return <div className="customer-page">
    <section className="customer-welcome card"><div><div className="eyebrow">Welcome to SmartPrint</div><h2>{customer?`Hi, ${customer}!`:shopName}</h2><p className="muted">Upload documents or photos, preview your pages, and track your order.</p></div>
      {!editingName&&<button type="button" className="btn btn-secondary" onClick={()=>setEditingName(true)}><Pencil size={15}/> Edit name</button>}
      {editingName&&<div className="name-editor"><label htmlFor="customerName">Your name</label><input id="customerName" value={customer} maxLength={80} onChange={e=>setCustomer(e.target.value)} placeholder="Enter your name"/><button type="button" className="btn" onClick={saveName}>Save name</button></div>}
    </section>

    <div className="upload-mode-switch" role="tablist" aria-label="Choose upload type">
      <button type="button" role="tab" aria-selected={mode==="pdf"} className={mode==="pdf"?"mode-tab active":"mode-tab"} onClick={()=>{setMode("pdf");setImageFiles([]);setImageUrls([]);setOriginalPages(0);setPageSelection("all");setJob(null);setMessage("");}}><FileText size={18}/> PDF document</button>
      <button type="button" role="tab" aria-selected={mode==="image"} className={mode==="image"?"mode-tab active":"mode-tab"} onClick={()=>{setMode("image");setFile(null);setOriginalPages(0);setPageSelection("all");setJob(null);setMessage("");}}><FileImage size={18}/> Photos / images</button>
    </div>

    <div className="grid2 customer-upload-grid"><section className="card"><div className="card-heading"><div><div className="eyebrow">New print order</div><h2>{mode==="pdf"?"Document details":"Photo print setup"}</h2></div></div>
      <form onSubmit={submit}>
        {mode==="pdf"?<div className="field"><label htmlFor="pdf">PDF document</label><label className="dropzone modern-dropzone" htmlFor="pdf"><Upload size={28}/><strong>{file?file.name:"Tap to choose your PDF"}</strong><span className="muted">{readingPdf?"Counting pages…":originalPages?`${originalPages} pages detected`:"PDF only · maximum 25 MB"}</span><input id="pdf" type="file" accept="application/pdf,.pdf" onChange={e=>void choosePdf(e.target.files?.[0]||null)}/></label></div>
        :<div className="field"><label htmlFor="images">Images for A4 printing</label><label className="dropzone modern-dropzone" htmlFor="images"><FileImage size={28}/><strong>{imageFiles.length?`${imageFiles.length} image${imageFiles.length===1?"":"s"} selected`:"Choose photos or images"}</strong><span className="muted">JPG, PNG or WebP · up to 20 images · 12 MB each</span><input id="images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>chooseImages(e.target.files)}/></label>
          {imageFiles.length>0&&<div className="image-editor"><div className="editor-heading"><div><div className="eyebrow">Live preview</div><strong>Page {imageIndex+1} of {imageFiles.length}</strong></div><span className="a4-label">A4 · portrait</span></div>
            <div className="a4-preview"><div className="a4-paper" onPointerDown={e=>{if(!currentImageUrl)return;e.currentTarget.setPointerCapture(e.pointerId);cropDragStart.current={x:e.clientX,y:e.clientY,imageX:activeEdit.x,imageY:activeEdit.y};}} onPointerMove={e=>{const start=cropDragStart.current;if(!start)return;const rect=e.currentTarget.getBoundingClientRect();updateImageEdit("x",Math.max(0,Math.min(100,start.imageX+((e.clientX-start.x)/Math.max(1,rect.width))*100)));updateImageEdit("y",Math.max(0,Math.min(100,start.imageY+((e.clientY-start.y)/Math.max(1,rect.height))*100)));}} onPointerUp={()=>{cropDragStart.current=null;}} onPointerCancel={()=>{cropDragStart.current=null;}}>{currentImageUrl&&<img src={currentImageUrl} alt={`A4 preview of ${imageFiles[imageIndex]?.name}`} draggable={false} style={{left:`${activeEdit.x}%`,top:`${activeEdit.y}%`,transform:`translate(-50%,-50%) scale(${activeEdit.zoom})`}}/>}</div></div>
            {imageFiles.length>1&&<div className="image-pagination"><button type="button" className="chip" disabled={imageIndex===0} onClick={()=>setImageIndex(i=>Math.max(0,i-1))}>Previous image</button><span>{imageIndex+1} / {imageFiles.length}</span><button type="button" className="chip" disabled={imageIndex===imageFiles.length-1} onClick={()=>setImageIndex(i=>Math.min(imageFiles.length-1,i+1))}>Next image</button></div>}
            <div className="crop-controls"><div className="crop-title"><Crop size={16}/><strong>Image layout</strong><button type="button" className="text-button" onClick={()=>{const reset={...DEFAULT_IMAGE_EDIT};if(editScope==="all")setImageEdits(previous=>previous.map(()=>reset));else setImageEdits(previous=>previous.map((edit,index)=>index===imageIndex?reset:edit));}}>Reset</button></div>
              <div className="edit-scope-switch" role="group" aria-label="Choose which images to edit"><button type="button" className={editScope==="all"?"chip active":"chip"} onClick={()=>changeEditScope("all")}>Apply to all images</button><button type="button" className={editScope==="single"?"chip active":"chip"} onClick={()=>changeEditScope("single")}>This image only</button></div>
              <label>Zoom <strong>{Math.round(activeEdit.zoom*100)}%</strong><input type="range" min="0.25" max="2.5" step="0.05" value={activeEdit.zoom} onChange={e=>updateImageEdit("zoom",Number(e.target.value))}/><span className="zoom-buttons"><button type="button" className="chip" aria-label="Zoom out" onClick={()=>updateImageEdit("zoom",Math.max(.25,Math.round((activeEdit.zoom-.1)*100)/100))}>−</button><button type="button" className="chip" aria-label="Zoom in" onClick={()=>updateImageEdit("zoom",Math.min(2.5,Math.round((activeEdit.zoom+.1)*100)/100))}>+</button></span></label>
              <label>Horizontal position <strong>{Math.round(activeEdit.x)}%</strong><input type="range" min="0" max="100" value={activeEdit.x} onChange={e=>updateImageEdit("x",Number(e.target.value))}/></label>
              <label>Vertical position <strong>{Math.round(activeEdit.y)}%</strong><input type="range" min="0" max="100" value={activeEdit.y} onChange={e=>updateImageEdit("y",Number(e.target.value))}/></label>
              <p className="muted editor-help">The white A4 sheet is the printable page. Zoom from 25% to 250%, use − / +, or drag the image to position it. Choose whether edits apply to all photos or only this photo. The PDF uses the same layout as the preview.</p>
            </div>
          </div>}
        </div>}
        {originalPages>0&&<div className="field page-selection-field"><label>Pages to print</label><div className="page-choice-row"><button type="button" className={pageSelection==="all"?"page-choice selected":"page-choice"} onClick={()=>setPageSelection("all")}><CheckCircle2 size={17}/> All pages <span>{originalPages}</span></button><button type="button" className={pageSelection===`1-${Math.min(5,originalPages)}`?"page-choice selected":"page-choice"} onClick={()=>setPageSelection(`1-${Math.min(5,originalPages)}`)}>First {Math.min(5,originalPages)}</button></div><input className="page-range-input" aria-label="Custom page selection" value={pageSelection} onChange={e=>setPageSelection(e.target.value)} placeholder="Or enter 2-8, 1, 3, 7-10"/><span className="muted page-help">Enter all, a range like 2-8, or specific pages like 1, 3, 7-10. {originalPages} total page{originalPages===1?"":"s"}.</span><div className="selection-summary"><span>Selected pages</span><strong>{selectedCount} <small>/ {originalPages}</small></strong></div></div>}
        <div className="field"><label htmlFor="printType">Print type</label><select id="printType" value={type} onChange={e=>setType(e.target.value as "bw"|"color")}><option value="bw">Black & white — {formatINR(bwPrice)} / page</option><option value="color">Colour — {formatINR(colorPrice)} / page</option></select></div>
        <div className="field"><label htmlFor="copies">Copies</label><input id="copies" type="number" min="1" max="100" value={copies} onChange={e=>setCopies(e.target.value)} required/></div>
        <button className="btn btn-full submit-print-btn" disabled={busy||readingPdf||!originalPages}>{busy?"Preparing print-ready PDF…":"Submit print job"}</button>
        {message&&<p className={message.toLowerCase().includes("could not")||message.toLowerCase().includes("failed")?"notice error":"notice"} role="status">{message}</p>}
        {job&&<div className="notice success"><CheckCircle2 size={16}/> Job ID: {job.id}<br/>Server total: {formatINR(Number(job.price))}<br/>Status: {statusName[job.status]||job.status}</div>}
      </form>
    </section>
    <aside className="card estimate-card"><div className="estimate-top"><div className="eyebrow">Order summary</div><span className="estimate-icon"><ZoomIn size={19}/></span></div><div className="price-big">{formatINR(total)}</div><p className="muted">Estimated total</p><div className="price-row"><span className="muted">Original pages</span><strong>{originalPages||"—"}</strong></div><div className="price-row"><span className="muted">Selected pages</span><strong>{selectedCount}</strong></div><div className="price-row"><span className="muted">Copies</span><strong>{copyCount}</strong></div><div className="price-row"><span className="muted">Print type</span><strong>{type==="bw"?"Black & white":"Colour"}</strong></div><div className="price-row"><span className="muted">Rate per page</span><strong>{formatINR(unitPrice)}</strong></div><div className="estimate-note">The final price is checked by the server. Images are converted into A4 PDF pages before submission.</div></aside></div>

    <section className="card history-card"><div className="section-heading"><div><div className="eyebrow">Your activity</div><h2 style={{marginTop:7}}>Printing history</h2><p className="muted history-intro">Track the latest jobs from this browser.</p></div><button type="button" className="btn btn-secondary" onClick={()=>void loadHistory()}><RefreshCw size={15}/> Refresh</button></div>
      {history.length===0?<div className="empty-state"><FileText size={28}/><strong>No jobs yet</strong><p className="muted">Your recent print jobs will appear here.</p></div>:<div className="history-list">{history.map(item=><article className="history-item" key={item.id}><div className="history-info"><strong><FileText size={16}/> {item.file_name}</strong><span className="muted">Selection: {item.selected_pages||"all"} · {item.pages} selected / {item.original_pages||item.pages} original pages · {item.copies} copies · {item.print_type==="bw"?"B&W":"Colour"}</span><span className="history-date">{new Date(item.created_at).toLocaleString()}</span></div><div className="history-total"><strong>{formatINR(Number(item.price))}</strong><span className={`job-status status-${item.status}`}>{statusName[item.status]||item.status}</span></div></article>)}</div>}
      <p className="muted privacy-note">Your name and device ID are remembered in this browser. Clearing browser data or changing devices may reset your history.</p>
    </section>
  </div>;
}
