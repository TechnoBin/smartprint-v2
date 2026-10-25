import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const { data: shop, error: shopError } = await supabase.from("shops").select("id").eq("owner_id", user.id).maybeSingle();
    if (shopError || !shop) return NextResponse.json({ error: "Shop not found for this account." }, { status: 404 });

    const admin = createAdminClient();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { data: device, error } = await admin.from("print_devices").insert({
      shop_id: shop.id,
      name: "Windows USB print station",
      token_hash: tokenHash,
      active: true
    }).select("id,name,created_at").single();

    if (error || !device) return NextResponse.json({ error: "Could not pair this print station. Make sure the print-agent migration has been run." }, { status: 500 });
    return NextResponse.json({ device, token }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not pair the print station." }, { status: 500 });
  }
}
