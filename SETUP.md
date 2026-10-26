# SmartPrint V2 — Setup

## Important
- This guide is for the separate SmartPrint V2 Supabase project.
- Keep SmartPrint V1 and its database untouched.
- For the automatic-printing feature, deploy the `dual-print-modes` branch as a Vercel **Preview** first.

## 1. Supabase
1. Create or select the dedicated SmartPrint V2 project.
2. Open SQL Editor and run `supabase/schema.sql` if the base schema has not been installed.
3. Create the owner user in Supabase Authentication and copy the user's UUID.
4. Create a shop if one does not exist:

```sql
insert into public.shops (owner_id, name, shop_code, bw_price, color_price)
values ('OWNER-UUID-HERE', 'My Print Shop', 'my-print-shop', 2, 5);
```

Replace the placeholder with the actual owner UUID and choose a unique lowercase shop code.

## 2. Print station database setup
Run `supabase/print-agent-migration.sql` once in the V2 project's SQL Editor. It creates the private station-token table. Do not run it in SmartPrint V1.

## 3. Vercel environment variables
Configure these in the V2 Vercel project:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

Set `NEXT_PUBLIC_SITE_URL` to the deployment URL being tested. Keep the service-role key server-side and never commit real environment values.

## 4. Automatic Windows printing
Follow [windows-print-agent/README.md](./windows-print-agent/README.md):
1. Deploy `auto-printing-polish` to Preview and wait for a successful build.
2. Apply the print-agent migration above.
3. Sign in to the preview owner dashboard and generate a station token.
4. Configure a local, untracked `windows-print-agent/print-agent-config.json` with the preview URL, token, exact printer name, SumatraPDF path, and `"auto_print": true`.
5. Test with a one-page, non-sensitive PDF and verify the physical output before any customer use.

## 5. Important safety notes
- Automatic mode prints without asking for approval. Keep the printer supervised and consider that public uploads can consume paper and ink.
- A successful print command only means Windows accepted the job; verify physical output before retrying.
- Public upload rate limiting and abuse protection should be reviewed before using this for real customer traffic.
- Never expose service-role keys or pairing tokens in browser code, GitHub, or screenshots.
