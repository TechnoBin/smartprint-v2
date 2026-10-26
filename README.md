# SmartPrint V2 — Automatic Printing Preview

Next.js print-shop workflow with a customer upload page, owner dashboard, Supabase Storage, and a Windows print station.

## Included
- Customer PDF/image upload, page selection, server-side price calculation, and job history
- Owner dashboard for print jobs, pricing, QR code, and print-station pairing
- Private stored files and short-lived signed PDF download URLs for the station
- Windows print agent with sequential automatic printing (or optional supervised confirmation mode)

## Automatic-printing branch setup
1. Deploy `auto-printing-polish` to a **Vercel Preview deployment** first.
2. Follow [SETUP.md](./SETUP.md) for environment variables and Supabase setup.
3. Run [supabase/print-agent-migration.sql](./supabase/print-agent-migration.sql) in the SmartPrint V2 Supabase project.
4. Follow [windows-print-agent/README.md](./windows-print-agent/README.md) to pair and test the Windows station.

## Safety
Automatic mode sends queued customer jobs to the configured printer without a confirmation prompt. Test with harmless documents before live use. A successful Windows print command does not guarantee physical output. Never commit local tokens or environment secrets, and do not use the SmartPrint V1 database.
