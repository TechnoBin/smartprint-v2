import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <>
    <header className="topbar"><div className="shell topbar-inner"><Link href="/" className="brand">Smart<span>Print</span> <small style={{fontSize:11,color:"#667085"}}>OWNER</small></Link><nav className="navlinks"><Link href="/dashboard">Overview</Link><Link href="/dashboard/jobs">Print jobs</Link><Link href="/dashboard/pricing">Pricing</Link><Link href="/dashboard/qr">Shop QR</Link></nav><form action="/auth/signout" method="post"><button className="btn btn-secondary" style={{minHeight:38}}>Sign out</button></form></div></header>
    <main className="shell page">{children}</main>
  </>;
}
