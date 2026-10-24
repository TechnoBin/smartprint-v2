import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ shopCode: string }> }) {
  let storagePath = "";
  try {
    const { shopCode } = await params;
    const form = await request.formData();
    const file = form.get("file");
    const printType = form.get("printType");
    const pageSelection = String(form.get("pageSelection") ?? "all").trim().toLowerCase();
    const copies = Number(form.get("copies"));
    const customerName = String(form.get("customerName") ?? "").trim().slice(0, 80);
    const deviceId = String(form.get("deviceId") ?? "");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF file." }, { status: 400 });
    if (file.size < 1 || file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "PDF must be 25 MB or smaller." }, { status: 400 });
    if (printType !== "bw" && printType !== "color") return NextResponse.json({ error: "Invalid print type." }, { status: 400 });
    if (!Number.isInteger(copies) || copies < 1 || copies > 100 || deviceId.length !== 36) return NextResponse.json({ error: "Invalid copies or device." }, { status: 400 });
    if (!customerName) return NextResponse.json({ error: "Enter your name first." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "The uploaded file is not a valid PDF." }, { status: 400 });
    const source = await PDFDocument.load(bytes, { ignoreEncryption: false });
    const originalPages = source.getPageCount();
    if (originalPages < 1 || originalPages > 1000) return NextResponse.json({ error: "PDF must contain between 1 and 1000 pages." }, { status: 400 });
    let indexes: number[] = [];
    if (pageSelection === "all") {
      indexes = Array.from({ length: originalPages }, (_, index) => index);
    } else {
      const chosen = new Set<number>();
      for (const part of pageSelection.split(",")) {
        const token = part.trim();
        const pieces = token.split("-");
        if (pieces.length === 2 && pieces.every(piece => piece.trim() !== "" && Number.isInteger(Number(piece)))) {
          const start = Number(pieces[0]), end = Number(pieces[1]);
          if (start < 1 || end < start || end > originalPages) return NextResponse.json({ error: "A page range is outside this PDF." }, { status: 400 });
          for (let page = start; page <= end; page++) chosen.add(page - 1);
        } else if (pieces.length === 1 && token !== "" && Number.isInteger(Number(token))) {
          const page = Number(token);
          if (page < 1 || page > originalPages) return NextResponse.json({ error: "A selected page is outside this PDF." }, { status: 400 });
          chosen.add(page - 1);
        } else return NextResponse.json({ error: "Use all, 2-8, or 1, 3, 7-10." }, { status: 400 });
      }
      indexes = [...chosen].sort((a, b) => a - b);
    }
    if (!indexes.length) return NextResponse.json({ error: "Select at least one page." }, { status: 400 });
    const output = await PDFDocument.create();
    const extracted = await output.copyPages(source, indexes);
    extracted.forEach(page => output.addPage(page));
    const printBytes = await output.save();
    const supabase = createAdminClient();
    const { data: shop, error: shopError } = await supabase.from("shops").select("id,bw_price,color_price,active").eq("shop_code", shopCode).eq("active", true).maybeSingle();
    if (shopError || !shop) return NextResponse.json({ error: "Shop not found or inactive." }, { status: 404 });
    const selectedCount = indexes.length;
    const unitPrice = Number(printType === "bw" ? shop.bw_price : shop.color_price);
    const price = Math.round(unitPrice * selectedCount * copies * 100) / 100;
    const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "document.pdf";
    const jobId = crypto.randomUUID();
    storagePath = shop.id + "/" + jobId + ".pdf";
    const { error: uploadError } = await supabase.storage.from("print-files").upload(storagePath, printBytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) return NextResponse.json({ error: "File upload failed. Check the private print-files bucket setup." }, { status: 500 });
    const { data: job, error: jobError } = await supabase.from("print_jobs").insert({
      id: jobId, shop_id: shop.id, file_name: safeName, storage_path: storagePath,
      pages: selectedCount, original_pages: originalPages, selected_pages: pageSelection,
      device_id: deviceId, print_type: printType, copies, price, customer_name: customerName, status: "pending"
    }).select("id,file_name,pages,original_pages,selected_pages,print_type,copies,price,status,created_at").single();
    if (jobError) {
      await supabase.storage.from("print-files").remove([storagePath]);
      return NextResponse.json({ error: "Could not create the print job. Check the customer migration." }, { status: 500 });
    }
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    console.error("print job error", error);
    if (storagePath) {
      try { await createAdminClient().storage.from("print-files").remove([storagePath]); } catch {}
    }
    return NextResponse.json({ error: "Unexpected server error while submitting the job." }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ shopCode: string }> }) {
  try {
    const { shopCode } = await params;
    const deviceId = request.nextUrl.searchParams.get("deviceId");
    if (!deviceId || !/^[0-9a-f-]{36}$/i.test(deviceId)) {
      return NextResponse.json({ error: "Invalid device ID." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data: shop } = await supabase.from("shops").select("id").eq("shop_code", shopCode).eq("active", true).maybeSingle();
    if (!shop) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    const { data: jobs, error } = await supabase.from("print_jobs")
      .select("id,file_name,pages,original_pages,selected_pages,print_type,copies,price,status,created_at")
      .eq("shop_id", shop.id).eq("device_id", deviceId).order("created_at", { ascending: false }).limit(30);
    if (error) return NextResponse.json({ error: "History unavailable. Run the customer device migration first." }, { status: 500 });
    return NextResponse.json({ jobs: jobs ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load history." }, { status: 500 });
  }
}


export async function PATCH(request: NextRequest, { params }: { params: Promise<{ shopCode: string }> }) {
  try {
    const { shopCode } = await params;
    const body = await request.json();
    const deviceId = String(body.deviceId ?? "");
    const customerName = typeof body.customerName === "string" ? body.customerName.trim().slice(0, 80) : "";
    if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !customerName) {
      return NextResponse.json({ error: "Enter a valid name." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data: shop } = await supabase.from("shops").select("id").eq("shop_code", shopCode).eq("active", true).maybeSingle();
    if (!shop) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    const { error } = await supabase.from("print_jobs").update({ customer_name: customerName }).eq("shop_id", shop.id).eq("device_id", deviceId);
    if (error) return NextResponse.json({ error: "Could not update the name on your previous jobs." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save the name." }, { status: 500 });
  }
}
