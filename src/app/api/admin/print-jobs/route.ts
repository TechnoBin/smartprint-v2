import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const body = await request.json();
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))] : [];
    if (!ids.length || ids.length > 100) return NextResponse.json({ error: "Select between 1 and 100 jobs." }, { status: 400 });

    const { data: shop, error: shopError } = await supabase.from("shops").select("id").eq("owner_id", user.id).maybeSingle();
    if (shopError || !shop) return NextResponse.json({ error: "Shop not found for this account." }, { status: 404 });

    const admin = createAdminClient();
    const { data: jobs, error: findError } = await admin.from("print_jobs").select("id,storage_path").eq("shop_id", shop.id).in("id", ids);
    if (findError) return NextResponse.json({ error: "Could not load selected jobs." }, { status: 500 });
    if (!jobs?.length || jobs.length !== ids.length) return NextResponse.json({ error: "Some selected jobs were not found for this shop. Refresh and try again." }, { status: 404 });

    const paths = jobs.map(job => job.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await admin.storage.from("print-files").remove(paths);
      if (storageError) return NextResponse.json({ error: "Files could not be removed, so no jobs were deleted. Try again." }, { status: 500 });
    }
    const { error: deleteError } = await admin.from("print_jobs").delete().eq("shop_id", shop.id).in("id", ids);
    if (deleteError) return NextResponse.json({ error: "Files were removed but the database delete failed. Contact support before retrying." }, { status: 500 });
    return NextResponse.json({ deleted: ids.length });
  } catch {
    return NextResponse.json({ error: "Could not delete the selected jobs." }, { status: 500 });
  }
}
