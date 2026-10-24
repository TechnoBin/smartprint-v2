# SmartPrint V2 — setup guide (Android-friendly)

## Read this first
- This is a **new Next.js V2 build**. Keep the existing SmartPrint V1 deployment and `main` branch untouched.
- Start with a **new/test Supabase project**. Do not run the SQL against your V1 production database.
- This is an MVP foundation, not a claim that automated physical printing is implemented. The owner updates job status after handling the print manually.
- Do not accept real customer documents until you have tested authorization, uploads, backups, and privacy.

## 1. GitHub / branch
1. Open `TechnoBin/smartprint-v2` on GitHub.
2. Switch to branch `main`.
3. Upload/extract the contents of this project into the repository root. The root should contain `package.json`, `src`, `supabase`, and this guide.
4. Commit to `main` while developing.

## 2. Supabase setup
1. Create a **new test project** at Supabase.
2. Open **SQL Editor → New query**.
3. Copy all of `supabase/schema.sql`, paste, and run.
4. Open **Authentication → Users → Add user** and create your owner email/password. Confirm the account if your project requires it.
5. Copy the user's UUID.
6. In SQL Editor, run a shop insert like the following, replacing the UUID and shop details:

```sql
insert into public.shops (owner_id, name, shop_code, bw_price, color_price)
values ('PASTE-OWNER-USER-UUID-HERE', 'My Print Shop', 'my-print-shop', 2, 5);
```

`shop_code` must be lowercase letters/numbers/hyphens and 3–40 characters. It becomes the stable public URL part.

## 3. Environment variables
In Supabase → Project Settings → API, copy:
- Project URL
- anon/publishable key
- service_role/secret key (server only)

For local development, copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

On Vercel, open the V2 project → Settings → Environment Variables and add the same values. Add `NEXT_PUBLIC_SITE_URL` with your deployed V2 URL for the QR page, for example `https://your-v2-project.vercel.app`.

**Never put the service-role key in a `NEXT_PUBLIC_` variable, GitHub file, screenshot, or chat.** If it is exposed, rotate it immediately.

## 4. Deploy on Vercel
1. Import the GitHub repository into Vercel.
2. Select branch `main`.
3. Add environment variables before deployment.
4. Deploy. Check the build log.
5. Visit `/login` and sign in with the owner account.
6. Visit `/dashboard`, `/dashboard/jobs`, `/dashboard/pricing`, `/dashboard/qr`.
7. Open `/print/my-print-shop` (use your actual shop code) and test with a non-sensitive sample PDF.

## 5. ZIP upload on Android
GitHub's normal web upload doesn't automatically unpack ZIP archives. If you use a ZIP:
1. Download it to your phone.
2. Open GitHub in Chrome and open the repository, then switch to `version-2-nextjs`.
3. If your browser shows **Code → Codespaces**, create/open a Codespace for this branch.
4. In the terminal, use the upload method available in the Codespace UI to place the ZIP, then run:
   `unzip smartprint-v2-nextjs.zip -d /tmp/smartprint-v2`
5. Copy the extracted files into the repository workspace, commit and push to `version-2-nextjs`.
If Codespaces isn't available, use a phone file manager to extract the ZIP and upload the files/folders through GitHub's web UI, or use a Git client that supports folders. Don't upload the ZIP as the only repository file.

## Current MVP limits
- PDF page count is checked on the server with `pdf-lib`.
- Server recalculates the total using shop pricing; the browser's estimate is informational only.
- Files are stored in a private Supabase bucket. The app currently does not expose a customer download link or implement automatic printer control.
- Shop setup is manual SQL for this first pass. We can build an in-app shop onboarding flow next.
- Public job submission has basic size/type validation and server-side price calculation, but production use still needs abuse protection/rate limits and a careful privacy review.
- The QR image is fetched from a third-party QR generator in this starter; use an offline/local QR generator if you need to avoid sending the customer URL to that service.
