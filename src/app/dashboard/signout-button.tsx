"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="btn btn-secondary signout-trigger" onClick={() => setOpen(true)}><LogOut size={16} /> Sign out</button>
    {open && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="signout-title">
        <div className="modal-icon"><LogOut size={22} /></div><h2 id="signout-title">Sign out of SmartPrint?</h2>
        <p className="muted">You’ll need to sign in again to manage your shop and print jobs.</p>
        <div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>Stay signed in</button><form action="/auth/signout" method="post"><button className="btn btn-danger" type="submit">Yes, sign out</button></form></div>
      </section>
    </div>}
  </>;
}
