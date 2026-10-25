import { NextRequest, NextResponse } from "next/server";
import { authenticatePrintAgent } from "@/lib/print-agent";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await authenticatePrintAgent(request);
  if (!auth) return NextResponse.json({ error: "Print station is not paired or has been disabled." }, { status: 401 });

  const { data, error } = await auth.admin
    .from("print_jobs")
    .select("id,file_name,pages,print_type,copies,price,status,created_at")
    .eq("shop_id", auth.device.shop_id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) return NextResponse.json({ error: "Could not load print queue." }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await authenticatePrintAgent(request);
  if (!auth) return NextResponse.json({ error: "Print station is not paired or has been disabled." }, { status: 401 });

  try {
    const body = await request.json();
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const action = body.action;
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ error: "Invalid job ID." }, { status: 400 });

    if (action === "claim") {
      const { data: job, error } = await auth.admin
        .from("print_jobs")
        .update({ status: "printing" })
        .eq("id", jobId)
        .eq("shop_id", auth.device.shop_id)
        .eq("status", "pending")
        .select("id,file_name,storage_path,pages,print_type,copies,price")
        .maybeSingle();

      if (error) return NextResponse.json({ error: "Could not claim this job." }, { status: 500 });
      if (!job) return NextResponse.json({ error: "This job is no longer waiting in the queue." }, { status: 409 });

      const { data: signed, error: signedError } = await auth.admin.storage
        .from("print-files")
        .createSignedUrl(job.storage_path, 120);

      if (signedError || !signed?.signedUrl) {
        await auth.admin.from("print_jobs").update({ status: "failed", error_message: "Could not create secure download link." }).eq("id", job.id).eq("status", "printing");
        return NextResponse.json({ error: "Could not securely download the file." }, { status: 500 });
      }

      return NextResponse.json({
        job: { id: job.id, file_name: job.file_name, pages: job.pages, print_type: job.print_type, copies: job.copies, price: job.price },
        downloadUrl: signed.signedUrl
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "result") {
      const result = body.result;
      const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage.slice(0, 500) : "";
      if (result !== "printed" && result !== "failed") return NextResponse.json({ error: "Invalid print result." }, { status: 400 });
      const update = result === "printed"
        ? { status: "printed", printed_at: new Date().toISOString(), error_message: null }
        : { status: "failed", error_message: errorMessage || "The Windows print station reported a printing error." };

      const { data: job, error } = await auth.admin
        .from("print_jobs")
        .update(update)
        .eq("id", jobId)
        .eq("shop_id", auth.device.shop_id)
        .eq("status", "printing")
        .select("id,status")
        .maybeSingle();

      if (error) return NextResponse.json({ error: "Could not save print result." }, { status: 500 });
      if (!job) return NextResponse.json({ error: "Job is not currently marked as printing." }, { status: 409 });
      return NextResponse.json({ ok: true, status: job.status });
    }

    return NextResponse.json({ error: "Unknown print-agent action." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid print-agent request." }, { status: 400 });
  }
}
