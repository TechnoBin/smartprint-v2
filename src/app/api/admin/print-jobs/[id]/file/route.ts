import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid job ID." }, { status: 400 });
    }

    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (shopError || !shop) {
      return NextResponse.json({ error: "Shop not found for this account." }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data: job, error: jobError } = await admin
      .from("print_jobs")
      .select("storage_path,file_name")
      .eq("id", id)
      .eq("shop_id", shop.id)
      .maybeSingle();

    if (jobError || !job) {
      return NextResponse.json({ error: "Print job or uploaded file not found." }, { status: 404 });
    }

    const { data, error } = await admin.storage
      .from("print-files")
      .createSignedUrl(job.storage_path, 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Could not create a secure file link." }, { status: 500 });
    }

    return NextResponse.redirect(data.signedUrl);
  } catch {
    return NextResponse.json({ error: "Could not open the uploaded print file." }, { status: 500 });
  }
}
