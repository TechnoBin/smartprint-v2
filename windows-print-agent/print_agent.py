import json
import os
import queue
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
import tkinter as tk
from tkinter import messagebox, ttk
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "print-agent-config.json"
POLL_SECONDS = 5
MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024


def load_config():
    if not CONFIG_PATH.exists():
        raise RuntimeError(
            "Missing print-agent-config.json. Copy print-agent-config.example.json "
            "to print-agent-config.json and fill in your SmartPrint URL, token and printer name."
        )
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    for key in ("base_url", "token", "printer_name", "sumatra_path"):
        if not str(config.get(key, "")).strip():
            raise RuntimeError(f"Please fill in '{key}' in print-agent-config.json.")
    config["base_url"] = config["base_url"].rstrip("/")
    # Automatic printing is the default for this branch. Set false for supervised mode.
    config["auto_print"] = config.get("auto_print", True) is True
    return config


class PrintAgent:
    def __init__(self, root, config):
        self.root = root
        self.config = config
        self.auto_print = config["auto_print"]
        self.auto_print_paused = False
        self.events = queue.Queue()
        self.jobs = []
        self.dismissed = set()
        self.busy = False
        self.active_job_id = None
        self.poll_in_flight = False
        self.print_scheduled = False
        self.prompt_scheduled = False
        self.prompt_active = False
        self.closing = False

        root.title("SmartPrint V2 — Automatic Print Station")
        root.geometry("940x600")
        root.minsize(720, 470)
        root.configure(background="#f4f6f8")

        style = ttk.Style(root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("App.TFrame", background="#f4f6f8")
        style.configure("Card.TFrame", background="#ffffff")
        style.configure("Title.TLabel", background="#ffffff", foreground="#15251c", font=("Segoe UI", 19, "bold"))
        style.configure("Muted.TLabel", background="#ffffff", foreground="#68766d", font=("Segoe UI", 10))
        style.configure("Section.TLabel", background="#ffffff", foreground="#24352b", font=("Segoe UI", 11, "bold"))
        style.configure("Treeview", background="#ffffff", fieldbackground="#ffffff", foreground="#24352b", rowheight=32, borderwidth=0, font=("Segoe UI", 10))
        style.configure("Treeview.Heading", background="#eef2ef", foreground="#536257", font=("Segoe UI", 9, "bold"), padding=(8, 9))
        style.map("Treeview", background=[("selected", "#e2efe6")], foreground=[("selected", "#15251c")])
        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"), padding=(13, 9))
        style.configure("TButton", font=("Segoe UI", 10), padding=(11, 8))

        shell = ttk.Frame(root, style="App.TFrame", padding=16)
        shell.pack(fill="both", expand=True)

        header = ttk.Frame(shell, style="Card.TFrame", padding=(18, 16))
        header.pack(fill="x")
        title_row = ttk.Frame(header, style="Card.TFrame")
        title_row.pack(fill="x")
        ttk.Label(title_row, text="SmartPrint V2", style="Title.TLabel").pack(side="left")
        mode_text = "AUTOMATIC PRINTING ON" if self.auto_print else "SUPERVISED MODE"
        mode_color = "#17683b" if self.auto_print else "#8a5a12"
        self.mode_badge = tk.Label(
            title_row, text=mode_text, bg="#e5f5eb" if self.auto_print else "#fff2d8",
            fg=mode_color, font=("Segoe UI", 9, "bold"), padx=10, pady=7
        )
        self.mode_badge.pack(side="right", padx=(8, 0))
        ttk.Label(
            header,
            text=f"Station: {config['printer_name']}  ·  Jobs print in queue order",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(7, 0))

        summary = ttk.Frame(shell, style="Card.TFrame", padding=(18, 12))
        summary.pack(fill="x", pady=(12, 0))
        self.queue_count = tk.StringVar(value="0 waiting")
        self.activity = tk.StringVar(value="Connecting to SmartPrint…")
        ttk.Label(summary, textvariable=self.queue_count, style="Section.TLabel").pack(side="left")
        ttk.Label(summary, textvariable=self.activity, style="Muted.TLabel").pack(side="right", padx=(12, 0))

        table_card = ttk.Frame(shell, style="Card.TFrame", padding=12)
        table_card.pack(fill="both", expand=True, pady=(12, 0))
        ttk.Label(table_card, text="Incoming print queue", style="Section.TLabel").pack(anchor="w", padx=4, pady=(2, 10))
        middle = ttk.Frame(table_card, style="Card.TFrame")
        middle.pack(fill="both", expand=True)
        columns = ("id", "file", "pages", "type", "copies", "price")
        self.tree = ttk.Treeview(middle, columns=columns, show="headings", selectmode="browse")
        for key, label, width in [
            ("id", "Job ID", 205),
            ("file", "Document", 260),
            ("pages", "Pages", 65),
            ("type", "Print", 75),
            ("copies", "Copies", 65),
            ("price", "Total", 90),
        ]:
            self.tree.heading(key, text=label)
            self.tree.column(key, width=width, minwidth=48, stretch=(key == "file"), anchor="w" if key in ("id", "file") else "center")
        scrollbar = ttk.Scrollbar(middle, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        footer = ttk.Frame(shell, style="Card.TFrame", padding=(14, 12))
        footer.pack(fill="x", pady=(12, 0))
        self.status = tk.StringVar(value="Connecting to SmartPrint…")
        ttk.Label(footer, textvariable=self.status, style="Muted.TLabel", wraplength=540).pack(side="left", fill="x", expand=True, padx=(0, 12))

        actions = ttk.Frame(footer, style="Card.TFrame")
        actions.pack(side="right")
        self.print_button = ttk.Button(
            actions,
            text="Print selected now" if self.auto_print else "Print selected job…",
            command=self.print_selected,
            style="Primary.TButton",
        )
        self.print_button.pack(side="left")
        self.skip_button = ttk.Button(actions, text="Skip this job", command=self.dismiss_selected)
        self.skip_button.pack(side="left", padx=(7, 0))
        self.pause_button = ttk.Button(
            actions,
            text="Pause auto-print" if self.auto_print else "Auto-print off",
            command=self.toggle_auto_print,
            state="normal" if self.auto_print else "disabled",
        )
        self.pause_button.pack(side="left", padx=(7, 0))
        self.refresh_button = ttk.Button(actions, text="Refresh", command=self.refresh)
        self.refresh_button.pack(side="left", padx=(7, 0))

        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.refresh()
        self.root.after(200, self.process_events)
        self.root.after(POLL_SECONDS * 1000, self.poll_loop)

    def api_request(self, path, method="GET", payload=None, timeout=20):
        url = self.config["base_url"] + path
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": "Bearer " + self.config["token"],
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Cache-Control": "no-store",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def poll_loop(self):
        if self.closing:
            return
        if not self.busy and not self.poll_in_flight:
            self.refresh()
        self.root.after(POLL_SECONDS * 1000, self.poll_loop)

    def fetch_jobs_worker(self):
        try:
            result = self.api_request("/api/print-agent/jobs")
            self.events.put(("jobs", result.get("jobs", [])))
        except Exception as exc:
            self.events.put(("error", f"Could not connect to SmartPrint: {exc}"))

    def refresh(self):
        if self.closing or self.poll_in_flight or self.busy:
            return
        self.poll_in_flight = True
        self.activity.set("Checking server…")
        threading.Thread(target=self.fetch_jobs_worker, daemon=True).start()

    def process_events(self):
        if self.closing:
            return
        try:
            while True:
                event, value = self.events.get_nowait()
                if event == "jobs":
                    self.poll_in_flight = False
                    self.jobs = value
                    self.render_jobs()
                    self.update_queue_status()
                    if self.auto_print:
                        self.schedule_auto_print()
                    else:
                        self.schedule_prompt()
                elif event == "printed":
                    self.dismissed.add(value)
                    self.status.set(f"Job {value} was sent to the Windows print queue. Check the physical output.")
                    self.render_jobs()
                elif event == "finished":
                    self.busy = False
                    self.active_job_id = None
                    self.print_button.configure(state="normal")
                    self.update_queue_status()
                    self.root.after(350, self.refresh)
                elif event == "error":
                    self.poll_in_flight = False
                    self.status.set(value[:260])
        except queue.Empty:
            pass
        self.root.after(200, self.process_events)

    def update_queue_status(self):
        count = len([job for job in self.jobs if job["id"] not in self.dismissed])
        self.queue_count.set(f"{count} waiting job{'s' if count != 1 else ''}")
        if self.busy:
            self.status.set("Printing in progress. Please keep this station running.")
        elif self.auto_print and self.auto_print_paused:
            self.status.set(f"Auto-print paused. {count} job(s) are waiting; resume when ready.")
        elif self.auto_print and count:
            self.status.set(f"Automatic mode is on. Processing the oldest waiting job next.")
        elif self.auto_print:
            self.status.set("Automatic printing is on. Waiting for customer jobs.")
        elif count:
            self.status.set(f"{count} waiting job(s). Select a job and approve its confirmation.")
        else:
            self.status.set("Supervised mode is on. Waiting for customer jobs.")

    def render_jobs(self):
        current = self.tree.selection()
        selected_id = current[0] if current else None
        self.tree.delete(*self.tree.get_children())
        for job in self.jobs:
            if job["id"] in self.dismissed:
                continue
            print_type = "B&W" if job.get("print_type") == "bw" else "Colour"
            price = f"₹{float(job.get('price') or 0):.2f}"
            file_name = job.get("file_name", "Uploaded PDF")
            self.tree.insert(
                "", "end", iid=job["id"],
                values=(job["id"][:8], file_name, job.get("pages", ""),
                        print_type, job.get("copies", 1), price),
            )
        if selected_id and self.tree.exists(selected_id):
            self.tree.selection_set(selected_id)

    def schedule_auto_print(self):
        if not self.auto_print or self.auto_print_paused or self.busy or self.print_scheduled:
            return
        candidate = next(
            (job for job in self.jobs if job["id"] not in self.dismissed and self.tree.exists(job["id"])),
            None,
        )
        if not candidate:
            return
        self.print_scheduled = True
        self.root.after(120, lambda job_id=candidate["id"]: self.start_scheduled_print(job_id))

    def start_scheduled_print(self, job_id):
        self.print_scheduled = False
        if self.closing or self.busy or self.auto_print_paused:
            return
        if not any(job["id"] == job_id for job in self.jobs):
            return
        self.start_print(job_id)

    def schedule_prompt(self):
        if self.busy or self.prompt_scheduled or self.prompt_active:
            return
        candidate = next(
            (job for job in self.jobs if job["id"] not in self.dismissed and self.tree.exists(job["id"])),
            None,
        )
        if not candidate:
            return
        self.tree.selection_set(candidate["id"])
        self.tree.focus(candidate["id"])
        self.prompt_scheduled = True
        self.root.after(150, self.confirm_print)

    def toggle_auto_print(self):
        if not self.auto_print:
            return
        self.auto_print_paused = not self.auto_print_paused
        self.pause_button.configure(text="Resume auto-print" if self.auto_print_paused else "Pause auto-print")
        self.mode_badge.configure(
            text="AUTO-PRINT PAUSED" if self.auto_print_paused else "AUTOMATIC PRINTING ON",
            bg="#fff2d8" if self.auto_print_paused else "#e5f5eb",
            fg="#8a5a12" if self.auto_print_paused else "#17683b",
        )
        self.update_queue_status()
        if not self.auto_print_paused:
            self.schedule_auto_print()

    def print_selected(self):
        selection = self.tree.selection()
        if not selection:
            messagebox.showinfo("Choose a job", "Select a waiting job first.", parent=self.root)
            return
        if self.auto_print:
            self.start_print(selection[0])
        else:
            self.confirm_print()

    def dismiss_selected(self):
        selection = self.tree.selection()
        if not selection:
            messagebox.showinfo("Choose a job", "Select a waiting job first.", parent=self.root)
            return
        self.dismissed.add(selection[0])
        self.render_jobs()
        self.update_queue_status()

    def confirm_print(self):
        if self.prompt_active:
            return
        self.prompt_scheduled = False
        selection = self.tree.selection()
        if not selection:
            return
        job_id = selection[0]
        job = next((item for item in self.jobs if item["id"] == job_id), None)
        if not job or job_id in self.dismissed:
            self.refresh()
            return
        details = (
            f"Job ID: {job['id']}\n"
            f"File: {job.get('file_name', '')}\n"
            f"Pages: {job.get('pages', '')}\n"
            f"Type: {'Black & white' if job.get('print_type') == 'bw' else 'Colour'}\n"
            f"Copies: {job.get('copies', 1)}\n"
            f"Listed total: ₹{float(job.get('price') or 0):.2f}\n\n"
            "Send this job to the Windows printer queue now?"
        )
        self.prompt_active = True
        try:
            approved = messagebox.askyesno("Confirm printing", details, icon="question", parent=self.root)
        finally:
            self.prompt_active = False
        if approved:
            self.start_print(job_id)
        else:
            self.dismissed.add(job_id)
            self.render_jobs()
            self.update_queue_status()

    def start_print(self, job_id):
        if self.busy or self.closing:
            return
        job = next((item for item in self.jobs if item["id"] == job_id), None)
        if not job or job_id in self.dismissed:
            self.refresh()
            return
        self.busy = True
        self.active_job_id = job_id
        self.print_button.configure(state="disabled")
        self.status.set(f"{'Automatically printing' if self.auto_print else 'Claiming'}: {job.get('file_name', job_id)}")
        threading.Thread(target=self.print_worker, args=(job_id,), daemon=True).start()

    def print_worker(self, job_id):
        claimed = False
        temp_path = None
        try:
            result = self.api_request(
                "/api/print-agent/jobs", "POST", {"action": "claim", "jobId": job_id}
            )
            claimed = True
            job = result["job"]
            request = urllib.request.Request(
                result["downloadUrl"],
                headers={"Accept": "application/pdf", "Cache-Control": "no-store"},
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                content_type = response.headers.get("Content-Type", "")
                pdf_bytes = response.read(MAX_DOWNLOAD_BYTES + 1)
            if len(pdf_bytes) > MAX_DOWNLOAD_BYTES or not pdf_bytes.startswith(b"%PDF-"):
                raise RuntimeError("Downloaded file is not a valid PDF or exceeds the 30 MB safety limit.")
            if "pdf" not in content_type.lower() and "octet-stream" not in content_type.lower():
                raise RuntimeError("The secure file link did not return a PDF.")
            with tempfile.NamedTemporaryFile(prefix="smartprint_", suffix=".pdf", delete=False) as handle:
                handle.write(pdf_bytes)
                temp_path = handle.name

            sumatra = os.path.expandvars(self.config["sumatra_path"])
            if not os.path.isfile(sumatra):
                raise RuntimeError("SumatraPDF was not found. Install it or correct sumatra_path in the config.")
            settings = []
            copies = int(job.get("copies") or 1)
            if copies > 1:
                settings.append(f"{copies}x")
            if job.get("print_type") == "bw":
                settings.append("monochrome")
            settings.append("fit")
            command = [
                sumatra, "-print-to", self.config["printer_name"],
                "-print-settings", ",".join(settings), "-silent", temp_path,
            ]
            completed = subprocess.run(command, capture_output=True, text=True, timeout=120)
            if completed.returncode != 0:
                raise RuntimeError(
                    (completed.stderr or completed.stdout or f"SumatraPDF exited with code {completed.returncode}")[:450]
                )

            self.api_request(
                "/api/print-agent/jobs", "POST",
                {"action": "result", "jobId": job_id, "result": "printed"},
            )
            self.events.put(("printed", job_id))
        except urllib.error.HTTPError as exc:
            try:
                message = exc.read().decode("utf-8", errors="replace")[:400]
            except Exception:
                message = str(exc)
            if claimed:
                self.report_failed(job_id, f"HTTP {exc.code}: {message}")
            self.events.put(("error", f"Print request failed (HTTP {exc.code}). {message}"))
        except Exception as exc:
            if claimed:
                self.report_failed(job_id, str(exc))
            self.events.put(("error", f"Could not print job: {exc}"))
        finally:
            if temp_path:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            self.events.put(("finished", job_id))

    def report_failed(self, job_id, reason):
        try:
            self.api_request(
                "/api/print-agent/jobs", "POST",
                {"action": "result", "jobId": job_id, "result": "failed", "errorMessage": reason},
            )
        except Exception:
            pass

    def close(self):
        if self.busy:
            if not messagebox.askyesno(
                "Printing in progress",
                "A job is being processed. Closing now may leave its physical print result uncertain. Close anyway?",
                parent=self.root,
            ):
                return
        self.closing = True
        self.root.destroy()


def main():
    root = tk.Tk()
    try:
        config = load_config()
    except Exception as exc:
        root.withdraw()
        messagebox.showerror("SmartPrint setup required", str(exc))
        root.destroy()
        return

    app = PrintAgent(root, config)
    root.mainloop()


if __name__ == "__main__":
    main()
