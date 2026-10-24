import { createAdminClient } from "@/lib/supabase/admin";
import CustomerUpload from "./upload";

export default async function PrintPage({ params }: { params: Promise<{ shopCode: string }> }) {
  const {shopCode}=await params;
  let shop:any=null;
  try {
    const supabase=createAdminClient();
    const {data}=await supabase.from("shops").select("id,name,shop_code,bw_price,color_price").eq("shop_code",shopCode).eq("active",true).maybeSingle();
    shop=data;
  } catch { shop=null; }
  if(!shop) return <main className="shell page"><div className="card"><h1>Shop not found</h1><p className="muted">This SmartPrint link may be incorrect or the shop is inactive.</p></div></main>;
  return <><header className="topbar"><div className="shell topbar-inner"><div className="brand">Smart<span>Print</span></div><span className="pill">Customer upload</span></div></header><main className="shell page"><div className="eyebrow">Quick print</div><h1>{shop.name}</h1><p className="muted">Upload a PDF to send it to this shop's print queue.</p><CustomerUpload shopCode={shop.shop_code} shopName={shop.name} bwPrice={Number(shop.bw_price)} colorPrice={Number(shop.color_price)} /></main><footer className="footer">Please check your print type and page count before submitting.</footer></>;
}
