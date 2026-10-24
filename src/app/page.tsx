import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <header className="topbar"><div className="shell topbar-inner"><div className="brand">Smart<span>Print</span> <small style={{fontSize:11,color:"#667085"}}>V2</small></div><span className="pill">Self-service printing</span></div></header>
      <main className="shell page">
        <div className="grid2">
          <section style={{padding:"24px 0"}}>
            <div className="eyebrow">Print smarter</div>
            <h1>Upload your document.<br/>Collect your printout.</h1>
            <p className="muted" style={{maxWidth:490}}>A mobile-friendly way for customers to send PDFs to a print shop. Shop owners can manage the queue, pricing and job status from one dashboard.</p>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:24}}>
              <Link className="btn" href="/login">Owner sign in</Link>
              <a className="btn btn-secondary" href="#how-it-works">How it works</a>
            </div>
            <div className="stat-grid" style={{gridTemplateColumns:"repeat(2,1fr)"}}>
              <div className="stat"><span className="muted">Customer flow</span><strong style={{fontSize:20}}>Scan & upload</strong><span className="muted">No customer account</span></div>
              <div className="stat"><span className="muted">Owner flow</span><strong style={{fontSize:20}}>Manage jobs</strong><span className="muted">Private owner dashboard</span></div>
            </div>
          </section>
          <section className="card" id="how-it-works">
            <div className="eyebrow">Designed for mobile</div><h2 style={{marginTop:10}}>From phone to print queue</h2>
            {["Customer scans the shop QR code","Uploads a PDF and chooses print type","Price is calculated using shop settings","Owner reviews the job and updates its status"].map((item,i)=><div className="price-row" key={item}><div style={{display:"flex",gap:12,alignItems:"center"}}><span className="pill">{i+1}</span><span>{item}</span></div></div>)}
            <p className="muted" style={{fontSize:12,marginTop:16}}>V2 is a development build. Configure Supabase and test with sample files before using it for real customer documents.</p>
          </section>
        </div>
      </main>
      <footer className="footer">SmartPrint V2 · Built for practical, secure print-shop workflows</footer>
    </>
  );
}
