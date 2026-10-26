import json
import os
import queue
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
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
    return config


class PrintAgent:
    def __init__(self, root, config):
        self.root = root
        self.config = config
        self.events = queue.Queue()
        self.jobs = []
        self.dismissed = set()
        self.busy = False
        self.prompt_scheduled = False
        self.prompt_active = False
        self.closing = False

        root.title("SmartPrint V2 — Print Confirmation")
        root.geometry("820x520")
        root.minsize(650, 420)

        top = ttk.Frame(root, padding=(16, 14))
        top.pack(fill="x")
        ttk.Label(top, text="SmartPrint V2", font=("Segoe UI", 18, "bold")).pack(anchor="w")
        ttk.Label(
            top,
            text=f"Station: {config['printer_name']}  •  Approval required before printing",
        ).pack(anchor="w", pady=(4, 0))

        middle = ttk.Frame(root, padding=(16, 0, 16, 8))
        middle.pack(fill="both", expand=True)
        columns = ("id", "file", "pages", "type", "copies", "price")
        self.tree = ttk.Treeview(middle, columns=columns, show="headings", selectmode="browse")
        for key, label, width in [
            ("id", "Job ID", 245),
            ("file", "Uploaded PDF", 180),
            ("pages", "Pages", 60),
            ("type", "Print", 70),
            ("copies", "Copies", 60),
            ("price", "Price", 75),
        ]:
            self.tree.heading(key, text=label)
            self.tree.column(key, width=width, minwidth=45, stretch=(key == "file"))
        scrollbar = ttk.Scrollbar(middle, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self.status = tk.StringVar(value="Connecting to SmartPrint…")
        ttk.Label(root, textvariable=self.status, padding=(16, 0, 16, 8)).pack(anchor="w")

        bottom = ttk.Frame(root, padding=(16, 0, 16, 16))
        bottom.pack(fill="x")
        self.print_button = ttk.Button(bottom, text="Print selected job…", command=self.confirm_print)
        self.print_button.pack(side="left")
        ttk.Button(bottom, text="Not now", command=self.dismiss_selected).pack(side="left", padx=(8, 0))
        ttk.Button(bottom, text="Refresh queue", command=self.refresh).pack(side="right")

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
        threading.Thread(target=self.fetch_jobs_worker, daemon=True).start()
        self.root.after(POLL_SECONDS * 1000, self.poll_loop)

    def fetch_jobs_worker(self):
        try:
            result = self.api_request("/api/print-agent/jobs")
            self.events.put(("jobs", result.get("jobs", [])))
        except Exception as exc:
            self.events.put(("error", f"Could not connect to SmartPrint: {exc}"))

    def refresh(self):
        self.status.set("Checking the print queue…")
        threading.Thread(target=self.fetch_jobs_worker, daemon=True).start()

    def process_events(self):
        if self.closing:
            return
        try:
            while True:
                event, value = self.events.get_nowait()
                if event == "jobs":
                    self.jobs = value
                    self.render_jobs()
                    count = len([j for j in self.jobs if j["id"] not in self.dismissed])
                    self.status.set(f"{count} waiting job(s). Nothing prints without your approval.")
                    self.schedule_prompt()
                elif event == "printed":
                    self.dismissed.add(value)
                    self.status.set(f"Job {value} was sent to the Windows print queue. Check the printer output.")
                    self.render_jobs()
                elif event == "finished":
                    self.busy = False
                    self.print_button.configure(state="normal")
                elif event == "error":
                    self.status.set(value[:220])
        except queue.Empty:
            pass
        self.root.after(200, self.process_events)

    def render_jobs(self):
        current = self.tree.selection()
        selected_id = current[0] if current else None
        self.tree.delete(*self.tree.get_children())
        for job in self.jobs:
            if job["id"] in self.dismissed:
                continue
            print_type = "B&W" if job.get("print_type") == "bw" else "Colour"
            price = f"₹{float(job.get('price') or 0):.2f}"
            self.tree.insert(
                "", "end", iid=job["id"],
                values=(job["id"], job.get("file_name", ""), job.get("pages", ""),
                        print_type, job.get("copies", 1), price),
            )
        if selected_id and self.tree.exists(selected_id):
            self.tree.selection_set(selected_id)

    def schedule_prompt(self):
        if self.busy or self.prompt_scheduled or self.prompt_active:
            return
        candidate = next((job for job in self.jobs if job["id"] not in self.dismissed and self.tree.exists(job["id"])), None)
        if not candidate:
            return
        self.tree.selection_set(candidate["id"])
        self.tree.focus(candidate["id"])
        self.prompt_scheduled = True
        self.root.after(150, self.confirm_print)

    def dismiss_selected(self):
        selection = self.tree.selection()
        if not selection:
            messagebox.showinfo("Choose a job", "Select a job first.", parent=self.root)
            return
        self.dismissed.add(selection[0])
        self.render_jobs()
        self.status.set("Job hidden for this session; it remains pending in the admin queue.")

    def confirm_print(self):
        if self.prompt_active:
            return

        self.prompt_scheduled = False
        selection = self.tree.selection()
        if not selection:
            messagebox.showinfo("Choose a job", "Select a job first.", parent=self.root)
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
            f"Listed price: ₹{float(job.get('price') or 0):.2f}\n\n"
            "Send this job to the Windows printer queue now?"
        )

        self.prompt_active = True
        try:
            approved = messagebox.askyesno(
                "Confirm printing",
                details,
                icon="question",
                parent=self.root,
            )
        finally:
            self.prompt_active = False

        if not approved:
            self.dismissed.add(job_id)
            self.render_jobs()
            return

        if self.busy:
            messagebox.showinfo(
                "Please wait",
                "Another print job is being processed.",
                parent=self.root,
            )
            return

        self.busy = True
        self.print_button.configure(state="disabled")
        self.status.set(f"Claiming job {job_id}…")
        threading.Thread(
            target=self.print_worker,
            args=(job_id,),
            daemon=True,
        ).start()

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
            safe_name = "".join(c for c in job.get("file_name", "print-job.pdf") if c.isalnum() or c in "._- ")[:100]
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
            command = [sumatra, "-print-to", self.config["printer_name"], "-print-settings", ",".join(settings), "-silent", temp_path]
            completed = subprocess.run(command, capture_output=True, text=True, timeout=120)
            if completed.returncode != 0:
                raise RuntimeError((completed.stderr or completed.stdout or f"SumatraPDF exited with code {completed.returncode}")[:450])

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
                "A job is being processed. Close the confirmation app anyway?",
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
