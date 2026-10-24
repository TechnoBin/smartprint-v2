# SmartPrint V2 (Next.js)

Mobile-first print shop web app starter with:
- Public shop-specific PDF upload page
- Server-side PDF validation and page counting
- Server-side price calculation from saved shop rates
- Private Supabase Storage bucket
- Owner sign-in with Supabase Auth
- Owner dashboard, print queue, pricing and shop QR page
- Row-level security for owner/shop separation

## Setup
Follow [`SETUP.md`](./SETUP.md) carefully. Run the schema only in a new/test Supabase project first.

## Important
This does not control a physical printer automatically. Owner-side status changes are manual in this MVP. Do not commit secrets or use the service-role key in browser code.
