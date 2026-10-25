import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, Clock3, FileText, QrCode, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: shop } = await supabase.from("shops").select("id,name,shop_code,bw_price,color_price").eq("owner_id",user!.id).maybeSingle();

  if (!shop) return <section className="card dashboard-empty"><div className="eyebrow">Welcome to SmartPrint</div><h1>Set up your shop</h1><p className="muted">Your owner account is ready, but no shop is linked yet. Follow the setup guide to connect your shop before accepting print orders.</p><Link className="btn" href="/dashboard/settings">Open shop setup <ArrowRight size={16}/></Link></section>;

  const { data: jobs } = await supabase.from("print_jobs").select("id,file_name,customer_name,print_type,pages,original_pages,copies,price,status,created_at").eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(100);
  const allJobs = jobs ?? [];
  const pending = allJobs.filter(j=>j.status==="pending").length;
  const printing = allJobs.filter(j=>j.status==="printing").length;
  const printed = allJobs.filter(j=>j.status==="printed").length;
  const failed = allJobs.filter(j=>j.status==="failed").length;
  const printedValue = allJobs.filter(j=>j.status==="printed").reduce((sum,j)=>sum+Number(j.price),0);

  return <div className="dashboard-overview">
    <div className="dashboard-hero"><div><div className="eyebrow">Shop overview</div><h1>Good to see you.</h1><p className="muted">Here’s what’s happening at <strong>{shop.name}</strong> today.</p></div><Link className="btn" href="/dashboard/jobs">Manage print jobs <ArrowRight size={16}/></Link></div>
    <div className="overview-metrics">
      <div className="overview-metric"><span className="metric-icon blue"><Clock3 size={18}/></span><div><small>Pending jobs</small><strong>{pending}</strong><span>Waiting in queue</span></div></div>
      <div className="overview-metric"><span className="metric-icon violet"><Activity size={18}/></span><div><small>Currently printing</small><strong>{printing}</strong><span>In progress</span></div></div>
      <div className="overview-metric"><span className="metric-icon green"><CheckCircle2 size={18}/></span><div><small>Completed jobs</small><strong>{printed}</strong><span>Marked as printed</span></div></div>
      <div className="overview-metric"><span className="metric-icon orange"><WalletCards size={18}/></span><div><small>Printed value</small><strong>{formatINR(printedValue)}</strong><span>{failed} failed job{failed===1?"":"s"}</span></div></div>
    </div>
    <div className="dashboard-two-col">
      <section className="card overview-recent"><div className="section-heading"><div><div className="eyebrow">Latest activity</div><h2 style={{marginTop:7}}>Recent print jobs</h2></div><Link href="/dashboard/jobs" className="inline-link">View all <ArrowRight size={15}/></Link></div>
        {allJobs.length===0?<div className="empty-state"><FileText size={30}/><strong>No print jobs yet</strong><p className="muted">Customer orders will appear here after their first upload.</p></div>:<div className="recent-job-list">{allJobs.slice(0,6).map(j=><article className="recent-job" key={j.id}><span className="recent-job-icon"><FileText size={18}/></span><div className="recent-job-main"><strong>{j.customer_name||"Guest customer"}</strong><span>{j.file_name}</span><small>{j.pages} pages · {j.copies} {j.copies===1?"copy":"copies"} · {new Date(j.created_at).toLocaleString()}</small></div><div className="recent-job-end"><strong>{formatINR(Number(j.price))}</strong><span className={`job-status status-${j.status}`}>{j.status}</span></div></article>)}</div>}
      </section>
      <aside className="dashboard-side-stack"><section className="card shop-info-card"><div className="eyebrow">Your shop</div><h2>{shop.name}</h2><p className="muted">Code: <strong>{shop.shop_code}</strong></p><div className="shop-price-line"><span>Black & white</span><strong>{formatINR(Number(shop.bw_price))} / page</strong></div><div className="shop-price-line"><span>Colour</span><strong>{formatINR(Number(shop.color_price))} / page</strong></div><Link href="/dashboard/pricing" className="inline-link">Manage pricing <ArrowRight size={15}/></Link></section>
        <section className="card quick-actions-card"><div className="eyebrow">Quick actions</div><Link href="/dashboard/jobs"><span className="quick-action-icon"><FileText size={17}/></span><span><strong>Print queue</strong><small>Review and update orders</small></span><ArrowRight size={16}/></Link><Link href="/dashboard/pricing"><span className="quick-action-icon"><WalletCards size={17}/></span><span><strong>Pricing</strong><small>Change per-page rates</small></span><ArrowRight size={16}/></Link><Link href="/dashboard/qr"><span className="quick-action-icon"><QrCode size={17}/></span><span><strong>Shop QR code</strong><small>Open customer upload link</small></span><ArrowRight size={16}/></Link></section>
      </aside>
    </div>
    <p className="dashboard-footnote">Counts and printed value reflect the latest 100 jobs loaded for this overview. The print queue refreshes automatically.</p>
  </div>;
}
