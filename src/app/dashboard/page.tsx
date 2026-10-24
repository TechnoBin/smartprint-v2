import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: shop } = await supabase.from("shops").select("id,name,shop_code,bw_price,color_price").eq("owner_id", user!.id).maybeSingle();
  let jobs: any[] = [];
  if (shop) {
    const { data } = await supabase.from("print_jobs").select("id,file_name,print_type,pages,price,status,created_at").eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(8);
    jobs = data ?? [];
  }
  return <>
    <div className="eyebrow">Owner dashboard</div><h1>Good to see you.</h1><p className="muted">Your shop's print queue and quick actions.</p>
    {!shop ? <div className="card" style={{marginTop:22}}><h2>Set up your shop</h2><p className="muted">No shop is linked to this owner account yet. Run the SQL in SETUP.md, then create your shop row using the setup instructions.</p><Link className="btn" href="/dashboard/settings">Shop setup instructions</Link></div> : <>
      <div className="stat-grid"><div className="stat"><span className="muted">Shop</span><strong style={{fontSize:21}}>{shop.name}</strong></div><div className="stat"><span className="muted">B&W / page</span><strong>{`₹${shop.bw_price}`}</strong></div><div className="stat"><span className="muted">Colour / page</span><strong>{`₹${shop.color_price}`}</strong></div></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"20px 0"}}><Link className="btn" href="/dashboard/jobs">Open print queue</Link><Link className="btn btn-secondary" href="/dashboard/pricing">Manage pricing</Link><Link className="btn btn-secondary" href="/dashboard/qr">Shop QR details</Link></div>
      <section className="card"><h2>Recent jobs</h2>{jobs.length===0 ? <p className="muted">No jobs yet. Once a customer submits a PDF, it will appear here.</p> : <div className="table-wrap"><table><thead><tr><th>File</th><th>Type</th><th>Pages</th><th>Price</th><th>Status</th></tr></thead><tbody>{jobs.map(j=><tr key={j.id}><td>{j.file_name}</td><td>{j.print_type}</td><td>{j.pages}</td><td>₹{j.price}</td><td><span className="status">{j.status}</span></td></tr>)}</tbody></table></div>}</section>
    </>}
  </>;
}
