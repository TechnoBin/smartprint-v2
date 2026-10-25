import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, ClipboardList, WalletCards, QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./signout-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link href="/dashboard" className="brand admin-brand">Smart<span>Print</span><small>OWNER CONSOLE</small></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-nav"><Link href="/dashboard"><LayoutDashboard size={18}/> Overview</Link><Link href="/dashboard/jobs"><ClipboardList size={18}/> Print jobs</Link><Link href="/dashboard/pricing"><WalletCards size={18}/> Pricing</Link><Link href="/dashboard/qr"><QrCode size={18}/> Shop QR</Link></nav>
      <div className="sidebar-bottom"><div className="owner-avatar">{(user.email||"O").slice(0,1).toUpperCase()}</div><div className="owner-meta"><strong>Shop owner</strong><span>{user.email}</span></div><SignOutButton/></div>
    </aside>
    <div className="admin-main"><header className="admin-mobile-header"><Link href="/dashboard" className="brand">Smart<span>Print</span></Link><SignOutButton/></header><main className="admin-content">{children}</main><footer className="admin-footer">SmartPrint V2 <span>·</span> Shop operations console</footer></div>
  </div>;
}
