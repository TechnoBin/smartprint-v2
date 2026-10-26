# SmartPrint V2 — Automatic Windows Print Station

The Windows station polls the SmartPrint V2 queue and automatically sends pending jobs to the configured printer. It processes one job at a time in oldest-first order and does not open a confirmation popup in automatic mode.

## Requirements

- Windows 10 or Windows 11
- Printer driver installed and the printer connected and ready (tested target: Epson L8050 Series)
- Python 3 (standard library only)
- SumatraPDF installed
- A deployed SmartPrint V2 branch with the print-agent API and database migration applied

## 1. Deploy the correct branch

Deploy the `auto-printing-polish` branch as a **Vercel Preview deployment**. Use that preview URL for the Windows agent during testing. Do not point the station at production until you have tested the full flow and intentionally chosen to switch it.

Set the existing Vercel environment variables for this project/preview environment. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.

## 2. Apply the database migration

In the SmartPrint V2 Supabase SQL Editor, run the contents of `supabase/print-agent-migration.sql` once. It creates the private `print_devices` table used to authenticate the Windows station. Do this in the V2 project only, never in the SmartPrint V1 database.

## 3. Pair the Windows station

1. Sign in to the deployed owner dashboard.
2. Open **Print station** and click **Generate pairing token**.
3. Copy the token immediately. The server stores only its SHA-256 hash; the raw token is displayed once.
4. In this folder, copy `print-agent-config.example.json` to `print-agent-config.json`.
5. Set `base_url` to the exact preview deployment URL (no trailing slash), `token` to the generated token, `printer_name` to the exact Windows printer name, and `sumatra_path` to the actual SumatraPDF executable.
6. Keep `print-agent-config.json` private. Never commit it to GitHub or share its token.

Example config keys:
- `base_url`: your deployed V2 preview URL
- `token`: the one-time pairing token
- `printer_name`: exact name shown in Windows printer settings
- `sumatra_path`: SumatraPDF executable path
- `auto_print`: `true` enables automatic printing; `false` requires confirmation

## 4. Test safely before live use

1. Make sure the printer has paper, the correct media, and no errors.
2. Use a non-sensitive, one-page test PDF.
3. Start the agent from this folder with `python print_agent.py`.
4. Submit one test job from the customer page.
5. Verify the file, page count, B&W/colour mode, copies, physical output, and final status in the owner dashboard.
6. Submit a second test only after checking the first output.

When `auto_print` is enabled (default in this branch), jobs start printing without a popup. Use **Pause auto-print** in the Windows app to stop starting the next job; a job already in progress is allowed to finish. Use **Skip this job** to hide a queued job for the current app session without changing its server status.

## Behavior and safety notes

- The agent polls every five seconds, but prevents overlapping queue requests and processes only one job at a time.
- Jobs are claimed server-side by changing `pending` to `printing`; only one station can successfully claim a given pending job.
- It validates the downloaded PDF signature and size (30 MB limit), uses a short-lived signed download URL, and deletes the temporary local PDF after processing.
- B&W jobs use SumatraPDF's `monochrome` setting; confirm your Epson driver honors it. Copies are sent to SumatraPDF, and page selection is already applied by SmartPrint to the stored PDF.
- A successful SumatraPDF command means Windows accepted the print command; it is **not proof that every page physically came out**. Check output and paper before retrying a job to avoid duplicates.
- The app reports a failure when download or print-command execution fails. Review failed jobs in the owner dashboard before taking action.
- Automatic mode is unattended printing. Keep the laptop secured and the printer supervised; anyone who can submit jobs to your public customer page may cause printing and paper/ink costs. Disable the agent or switch `auto_print` to `false` if you need approval for every job.
- Never put the Supabase service-role key in the Windows config. The station uses its per-device pairing token.

## Troubleshooting

- **No jobs appear:** check the preview URL, deployment status, pairing token, and migration.
- **401 Unauthorized:** generate a new token and update the local config; verify the station is active.
- **Printer not found:** copy the exact name from Windows Settings > Bluetooth & devices > Printers & scanners.
- **No physical output:** check the Windows print queue, paper, driver, SumatraPDF path, and printer settings. Do not assume a job is safe to retry just because the physical output is uncertain.
