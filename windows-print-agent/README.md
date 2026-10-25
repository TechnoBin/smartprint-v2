# SmartPrint V2 — Windows print confirmation app

This is the first supervised-printing prototype. It does **not** print automatically: the shop operator must select a job and approve the confirmation dialog.

## Requirements

- Windows 10 or Windows 11
- Epson L8050 driver installed and the printer connected by USB
- Python 3 (the app uses only the Python standard library)
- SumatraPDF installed; configure its exact executable path
- SmartPrint V2 deployed with the print-agent API and migration applied

## Setup

1. In the SmartPrint V2 owner dashboard, open **Print station** and create a pairing token. Copy it immediately; the raw token is shown only once.
2. Copy `print-agent-config.example.json` to `print-agent-config.json`.
3. Edit `print-agent-config.json`: paste the one-time token and enter the exact Windows printer name. Do not commit the real config/token to GitHub or share it.
4. Install SumatraPDF and confirm its executable path. If needed, change `sumatra_path` to the actual path.
5. Run `python print_agent.py` from this folder.
6. Select a pending job, review its details, and approve printing.

## Important behavior

- The app polls every five seconds and never prints without a click and confirmation.
- A job is changed from `pending` to `printing` only after approval. Only one station can claim a pending job.
- Failed downloads or print-command errors are reported as `failed`; review them in the admin dashboard before retrying.
- A successful SumatraPDF command means Windows accepted the print command, not proof that every sheet physically exited the printer. Check the printer/output before marking or retrying jobs manually.
- The first version intentionally avoids automatic retries to reduce duplicate prints.
- B&W jobs use SumatraPDF's `monochrome` print setting. Verify this with a test page and the Epson driver; driver behavior can vary.
- Job page selection is already applied to the uploaded PDF by SmartPrint. Copies are passed to SumatraPDF.
- A dismissed job remains pending and can be selected again after restarting the app. Use the admin dashboard to review/resolve it.
- Never expose the Supabase service-role key to this app. The app uses a per-station token; the server stores only its SHA-256 hash.

## Troubleshooting

- **No jobs appear:** verify pairing token, deployment URL, owner dashboard, and that the migration was run.
- **Unauthorized:** deactivate/re-pair the station and update the local config.
- **Printer not found:** use the exact printer name from Windows Settings > Bluetooth & devices > Printers & scanners.
- **PDF not printed:** install/update SumatraPDF, verify its path, and try a harmless test PDF with the Epson driver.
