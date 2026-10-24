 "use client";

import { useEffect, useState, FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function PricingPage() {
  const [shop,setShop] = useState<any>(null);
  const [bw,setBw] = useState("2");
  const [color,setColor] = useState("5");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(true);

  useEffect(()=>{ (async()=>{ try {
    const supabase=createClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return;
    const {data,error}=await supabase.from("shops").select("id,name,bw_price,color_price").eq("owner_id",user.id).maybeSingle();
    if(error) throw error;
    if(data){setShop(data);setBw(String(data.bw_price));setColor(String(data.color_price));}
  } catch(e){setMessage(e instanceof Error?e.message:"Could not load shop.");} finally{setBusy(false);} })(); },[]);

  async function save(e:FormEvent){e.preventDefault();setMessage("");if(!shop){setMessage("Shop not found. Follow Shop setup instructions first.");return;}
    const b=Number(bw),c=Number(color);if(!Number.isFinite(b)||!Number.isFinite(c)||b<0||c<0||b>1000||c>1000){setMessage("Enter valid prices between ₹0 and ₹1000.");return;}
    const supabase=createClient();const {error}=await supabase.from("shops").update({bw_price:b,color_price:c}).eq("id",shop.id);
    setMessage(error?error.message:"Pricing saved.");}
  return <><div className="eyebrow">Shop configuration</div><h1>Pricing</h1><p className="muted">Prices are stored per shop and used by the server when creating a print job.</p><div className="card" style={{maxWidth:600}}>{busy?<p className="muted">Loading…</p>:<form onSubmit={save}><div className="field"><label>Black & white price per page (₹)</label><input type="number" min="0" max="1000" step="0.5" value={bw} onChange={e=>setBw(e.target.value)} required /></div><div className="field"><label>Colour price per page (₹)</label><input type="number" min="0" max="1000" step="0.5" value={color} onChange={e=>setColor(e.target.value)} required /></div>{message&&<p className="notice">{message}</p>}<button className="btn">Save pricing</button></form>}</div></>;
}
