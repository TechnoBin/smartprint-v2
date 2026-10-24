
# SmartPrint V2 Setup

## Before starting
- Repository: TechnoBin/smartprint-v2
- Branch: main
- Keep SmartPrint V1 and its database untouched.
- This version requires a separate Supabase project.

## 1. Supabase
1. Create a new Supabase project.
2. Open SQL Editor and create a new query.
3. Copy all of supabase/schema.sql into the query and run it.
4. Open Authentication and create your owner user.
5. Copy the owner's UUID.
6. In SQL Editor, create your shop:

insert into public.shops (owner_id, name, shop_code, bw_price, color_price)
values ('OWNER-UUID-HERE', 'My Print Shop', 'my-print-shop', 2, 5);

Replace OWNER-UUID-HERE with the actual user UUID.
Choose a unique lowercase shop code.

## 2. Environment variables
In Supabase Project Settings, find the project URL and API keys.

Configure these variables in Vercel:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_SITE_URL

Set NEXT_PUBLIC_SITE_URL to the deployed V2 URL.

Never put real keys in GitHub. The service-role key must remain server-side.

## 3. Vercel
1. Import TechnoBin/smartprint-v2.
2. Select branch main.
3. Add all four environment variables.
4. Deploy and inspect the build logs.
5. Test /login and the owner dashboard.
6. Test /print/my-print-shop using a non-sensitive sample PDF.

## 4. Important limitations
- Physical printing is manual; automatic printer control is not implemented.
- Shop creation is currently performed using SQL.
- Test authentication, uploads, pricing, job status updates and privacy before real use.
- Public uploads still need rate limiting and abuse protection.
- The QR image currently uses a third-party QR generator.
- Never use real customer documents until the security and privacy checks are complete.
