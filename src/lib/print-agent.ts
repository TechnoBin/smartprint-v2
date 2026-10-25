import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function authenticatePrintAgent(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length < 32) return null;

  const tokenHash = createHash("sha256").update(match[1]).digest("hex");
  const admin = createAdminClient();
  const { data: device, error } = await admin
    .from("print_devices")
    .select("id,shop_id,name,active")
    .eq("token_hash", tokenHash)
    .eq("active", true)
    .maybeSingle();

  if (error || !device) return null;
  await admin.from("print_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return { admin, device };
}
