import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ shopCode: string }> }) {
  try {
    const { shopCode } = await params;
    const form = await request.formData();
    const file = form.get("file");
    const printType = form.get("printType");
    const pagesInput = Number(form.get("pages"));
    const copies = Number(form.get("copies"));
    const customerName = String(form.get("customerName") ?? "").trim().slice(0,80);

    if (!(file instanceof File)) return NextResponse.json({error:"Choose a PDF file."},{status:400});
    if (file.size < 1 || file.size > 25 * 1024 * 1024) return NextResponse.json({error:"PDF must be 25 MB or smaller."},{status:400});
    if (printType !== "bw" && printType !== "color") return NextResponse.json({error:"Invalid print type."},{status:400});
    if (!Number.isInteger(pagesInput) || pagesInput < 1 || pagesInput > 1000 || !Number.isInteger(copies) || copies < 1 || copies > 100) return NextResponse.json({error:"Invalid page count or copies."},{status:400});

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0,5)) !== "%PDF-") return NextResponse.json({error:"The uploaded file is not a valid PDF."},{status:400});
    let actualPages:number;
    try { const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false }); actualPages = pdf.getPageCount(); }
    catch { return NextResponse.json({error:"Could not read this PDF. It may be damaged or password-protected."},{status:400}); }
    if (actualPages < 1 || actualPages > 1000) return NextResponse.json({error:"PDF must contain between 1 and 1000 pages."},{status:400});

    const supabase = createAdminClient();
    const {data:shop,error:shopError}=await supabase.from("shops").select("id,name,bw_price,color_price,active").eq("shop_code",shopCode).eq("active",true).maybeSingle();
    if(shopError||!shop) return NextResponse.json({error:"Shop not found or inactive."},{status:404});
    const unitPrice = Number(printType === "bw" ? shop.bw_price : shop.color_price);
    const price = Math.round(unitPrice * actualPages * copies * 100) / 100;
    const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g,"_").slice(0,120) || "document.pdf";
    const jobId = crypto.randomUUID();
    const storagePath = `${shop.id}/${jobId}.pdf`;

    const {error:uploadError}=await supabase.storage.from("print-files").upload(storagePath,bytes,{contentType:"application/pdf",upsert:false});
    if(uploadError) return NextResponse.json({error:"File upload failed. Check the private print-files bucket setup."},{status:500});

    const {data:job,error:jobError}=await supabase.from("print_jobs").insert({
      id:jobId,shop_id:shop.id,file_name:safeName,storage_path:storagePath,
      pages:actualPages,print_type:printType,copies,price,customer_name:customerName || null,status:"pending"
    }).select("id,file_name,pages,print_type,copies,price,status,created_at").single();

    if(jobError) {
      await supabase.storage.from("print-files").remove([storagePath]);
      return NextResponse.json({error:"Could not create the print job. Check the database setup."},{status:500});
    }
    return NextResponse.json({job},{status:201});
  } catch (error) {
    console.error("print job error",error);
    return NextResponse.json({error:"Unexpected server error while submitting the job."},{status:500});
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
      .select("id,file_name,pages,print_type,copies,price,status,created_at")
      .eq("shop_id", shop.id).eq("device_id", deviceId).order("created_at", { ascending: false }).limit(30);
    if (error) return NextResponse.json({ error: "History unavailable. Run the customer device migration first." }, { status: 500 });
    return NextResponse.json({ jobs: jobs ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load history." }, { status: 500 });
  }
}
