from __future__ import annotations

import json
import mimetypes
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

try:
    import yt_dlp
except ImportError:
    yt_dlp = None


HOST = "127.0.0.1"
PORT = 8765
APP_DIR = Path(__file__).parent
WEB_DIR = APP_DIR / "web"
DEFAULT_OUTPUT_DIR = Path.home() / "Downloads" / "JMS Medienwerkstatt"
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

VIDEO_QUALITIES = {
    "beste": "Beste verfügbare Qualität",
    "1080": "Bis 1080p",
    "720": "Bis 720p",
    "480": "Bis 480p",
}
OUTPUT_TYPES = {
    "video": "Video (MP4)",
    "mp3": "Audio (MP3)",
    "m4a": "Audio (M4A)",
}
SUPPORTED_AUDIO_EXTENSIONS = {
    ".m4a", ".m4v", ".mp4", ".aac", ".aiff", ".aif", ".alac", ".caf",
    ".wav", ".flac", ".ogg", ".wma", ".mp3", ".opus",
}
MP3_BITRATES = {"128k", "160k", "192k", "256k", "320k"}
YOUTUBE_HOSTS = {"youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
MAC_COOKIE_ATTEMPTS = (("edge", "Default"), ("edge", "Profile 1"), ("chrome", None), (None, None))


def find_node_runtime() -> str | None:
    candidates = [
        Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node",
        Path("/opt/homebrew/bin/node"),
        Path("/usr/local/bin/node"),
    ]
    if sys.platform.startswith("win"):
        candidates.extend(
            [
                Path(os.environ.get("ProgramFiles", "")) / "nodejs" / "node.exe",
                Path(os.environ.get("ProgramFiles(x86)", "")) / "nodejs" / "node.exe",
                Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "nodejs" / "node.exe",
            ]
        )
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return shutil.which("node")


def find_ffmpeg_location() -> str | None:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")


def detect_source(url: str) -> str | None:
    try:
        host = urlparse(url.strip()).netloc.lower().split(":")[0].removeprefix("www.")
    except ValueError:
        return None
    if host in YOUTUBE_HOSTS or host.endswith(".youtube.com"):
        return "YouTube"
    if host == "instagram.com" or host.endswith(".instagram.com"):
        return "Instagram"
    return None


def parse_time(value: str, label: str) -> float | None:
    value = value.strip()
    if not value:
        return None
    parts = value.split(":")
    try:
        numbers = [float(part) for part in parts]
    except ValueError as exc:
        raise ValueError(f"{label} muss z. B. 1:30 oder 01:02:30 sein.") from exc
    if len(numbers) == 1:
        seconds = numbers[0]
    elif len(numbers) == 2:
        seconds = numbers[0] * 60 + numbers[1]
    elif len(numbers) == 3:
        seconds = numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    else:
        raise ValueError(f"{label} muss z. B. 1:30 oder 01:02:30 sein.")
    if seconds < 0 or any(number < 0 for number in numbers[1:]):
        raise ValueError(f"{label} darf nicht negativ sein.")
    if len(numbers) > 1 and any(number >= 60 for number in numbers[1:]):
        raise ValueError(f"{label} enthält ungültige Minuten oder Sekunden.")
    return seconds


def safe_filename(value: str) -> str:
    clean = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", value).strip().rstrip(".")
    clean = re.sub(r"\s+", " ", clean)
    return clean[:120]


def available_output_path(input_file: Path, output_dir: Path) -> Path:
    candidate = output_dir / f"{input_file.stem}.mp3"
    counter = 2
    while candidate.exists():
        candidate = output_dir / f"{input_file.stem}-{counter}.mp3"
        counter += 1
    return candidate


def clean_message(message: object) -> str:
    return ANSI_RE.sub("", str(message)).strip()


def cookie_attempts() -> tuple[tuple[str | None, str | None], ...]:
    if sys.platform == "darwin":
        return MAC_COOKIE_ATTEMPTS
    if sys.platform.startswith("win"):
        return (("edge", None), ("chrome", None), (None, None))
    return (("chrome", None), (None, None))


class DownloadState:
    def __init__(self) -> None:
        self.messages: queue.Queue[str] = queue.Queue()
        self.running = False
        self.lock = threading.Lock()

    def log(self, message: str) -> None:
        message = clean_message(message)
        if message:
            self.messages.put(message)

    def drain(self) -> list[str]:
        result: list[str] = []
        while True:
            try:
                result.append(self.messages.get_nowait())
            except queue.Empty:
                return result


STATE = DownloadState()


class QueueLogger:
    def debug(self, _message: str) -> None:
        return

    def warning(self, message: str) -> None:
        message = clean_message(message)
        ignored = ("Support for Python", "SABR", "missing a url")
        if message and not any(item in message for item in ignored):
            STATE.log(f"Hinweis: {message}")

    def error(self, message: str) -> None:
        message = clean_message(message)
        ignored = ("HTTP Error 403", "downloaded file is empty", "The page needs to be reloaded")
        if message and not any(item in message for item in ignored):
            STATE.log(f"Hinweis: {message}")


def progress_hook(status: dict) -> None:
    status_type = status.get("status")
    filename = Path(status.get("filename", "")).name
    if status_type == "downloading":
        percent = status.get("_percent_str", "").strip()
        speed = status.get("_speed_str", "").strip()
        eta = status.get("_eta_str", "").strip()
        STATE.log(f"{filename}: {percent} · {speed} · Restzeit {eta}")
    elif status_type == "finished":
        STATE.log(f"Download abgeschlossen: {filename}")
        STATE.log("Datei wird vorbereitet …")


def make_options(
    output_dir: Path,
    source: str,
    output_type: str,
    quality: str,
    filename: str,
    start_time: float | None,
    end_time: float | None,
    browser: str | None = None,
    profile: str | None = None,
) -> dict:
    output_template = f"{filename}.%(ext)s" if filename else "%(title).180s [%(id)s].%(ext)s"
    options: dict = {
        "outtmpl": str(output_dir / output_template),
        "logger": QueueLogger(),
        "progress_hooks": [progress_hook],
        "extractor_retries": 4,
        "retries": 3,
        "fragment_retries": 3,
        "noplaylist": True,
        "windowsfilenames": True,
        "quiet": True,
        "no_warnings": False,
    }
    ffmpeg_location = find_ffmpeg_location()
    if ffmpeg_location:
        options["ffmpeg_location"] = ffmpeg_location
    node_runtime = find_node_runtime()
    if node_runtime:
        options["js_runtimes"] = {"node": {"path": node_runtime}}
    if source == "YouTube":
        options["extractor_args"] = {"youtube": {"player_client": ["web_safari", "web"]}}
    if browser:
        options["cookiesfrombrowser"] = (browser, profile) if profile else (browser,)

    if output_type == "video":
        if quality == "beste":
            format_selector = "bestvideo+bestaudio/best"
        else:
            format_selector = f"bestvideo[height<={quality}]+bestaudio/best[height<={quality}]"
        options.update({"format": f"{format_selector}/best[ext=mp4]/best", "merge_output_format": "mp4"})
    else:
        processor = {"key": "FFmpegExtractAudio", "preferredcodec": output_type}
        if output_type == "mp3":
            processor["preferredquality"] = "0" if quality == "beste" else {"1080": "256", "720": "192", "480": "128"}.get(quality, "0")
        options.update({"format": "bestaudio/best", "postprocessors": [processor]})

    if start_time is not None or end_time is not None:
        options["download_ranges"] = lambda _info, _ydl: [
            {"start_time": start_time or 0, "end_time": end_time}
        ]
        options["force_keyframes_at_cuts"] = True
    return options


def user_friendly_error(error: Exception, source: str) -> str:
    message = clean_message(error)
    lowered = message.lower()
    if "ffmpeg" in lowered:
        return "FFmpeg wurde nicht gefunden. Bitte die App erneut starten, damit die lokale Medienkomponente eingerichtet wird."
    if "login required" in lowered or "requested content is not available" in lowered:
        return "Der Inhalt ist nicht öffentlich verfügbar oder verlangt eine Anmeldung. Bitte prüfe die URL und deine Berechtigung."
    if "private" in lowered or "not logged in" in lowered:
        return "Dieser Instagram-Inhalt ist nicht öffentlich erreichbar. Private Inhalte können nicht verarbeitet werden."
    if "403" in lowered or "page needs to be reloaded" in lowered or "empty" in lowered:
        return "Die Plattform hat den Abruf abgelehnt. Bitte aktualisiere yt-dlp über die Update-Datei und versuche es erneut."
    if source == "YouTube" and ("javascript" in lowered or "ejs" in lowered or "runtime" in lowered):
        return "Für YouTube fehlt oder veraltet die JavaScript-Komponente. Bitte Node.js 22 oder neuer installieren und die App erneut starten."
    return f"Download nicht möglich: {message or 'Unbekannter Fehler'}"


def run_download(job: dict) -> None:
    source = job["source"]
    try:
        if yt_dlp is None:
            raise RuntimeError("yt-dlp ist nicht installiert.")
        if not find_ffmpeg_location():
            raise RuntimeError("FFmpeg ist nicht installiert.")
        output_dir = Path(job["output_dir"])
        output_dir.mkdir(parents=True, exist_ok=True)
        STATE.log(f"{source} erkannt. Starte Verarbeitung nach: {output_dir}")
        attempts = cookie_attempts() if source == "YouTube" else ((None, None),)
        last_error: Exception | None = None
        for browser, profile in attempts:
            try:
                with yt_dlp.YoutubeDL(
                    make_options(
                        output_dir, source, job["output_type"], job["quality"], job["filename"],
                        job["start_time"], job["end_time"], browser, profile,
                    )
                ) as downloader:
                    downloader.download([job["url"]])
                last_error = None
                break
            except Exception as error:
                last_error = error
        if last_error:
            raise last_error
        STATE.log("Fertig. Die Datei liegt im gewählten Zielordner.")
    except Exception as error:
        STATE.log(f"Fehler: {user_friendly_error(error, source)}")
    finally:
        with STATE.lock:
            STATE.running = False


def run_conversion(job: dict) -> None:
    try:
        ffmpeg = find_ffmpeg_location()
        if not ffmpeg:
            raise RuntimeError("FFmpeg ist nicht installiert.")
        output_dir = Path(job["output_dir"])
        output_dir.mkdir(parents=True, exist_ok=True)
        files = [Path(item) for item in job["files"]]
        total = len(files)
        successes = 0
        STATE.log(f"Starte MP3-Konvertierung von {total} Datei(en) nach: {output_dir}")
        for index, input_file in enumerate(files, start=1):
            if not input_file.is_file():
                STATE.log(f"[{index}/{total}] Übersprungen: {input_file.name} wurde nicht gefunden.")
                continue
            output_file = available_output_path(input_file, output_dir)
            STATE.log(f"[{index}/{total}] Konvertiere: {input_file.name}")
            result = subprocess.run(
                [
                    ffmpeg, "-hide_banner", "-n", "-i", str(input_file), "-vn",
                    "-codec:a", "libmp3lame", "-b:a", job["bitrate"], str(output_file),
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                successes += 1
                STATE.log(f"[{index}/{total}] Fertig: {output_file.name}")
            else:
                details = (result.stderr or result.stdout or "Unbekannter Fehler").strip().splitlines()
                STATE.log(f"[{index}/{total}] Fehler bei {input_file.name}: {(details[-1] if details else 'Unbekannter Fehler')[:180]}")
        STATE.log(f"Fertig. {successes} von {total} Datei(en) wurden als MP3 gespeichert.")
    except Exception as error:
        STATE.log(f"Fehler: {user_friendly_error(error, 'Konvertierung')}")
    finally:
        with STATE.lock:
            STATE.running = False


def choose_folder(initial_dir: str) -> str:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    result = filedialog.askdirectory(title="Zielordner auswählen", initialdir=initial_dir or str(DEFAULT_OUTPUT_DIR))
    root.destroy()
    return result


def choose_audio_files() -> list[str]:
    import tkinter as tk
    from tkinter import filedialog

    patterns = " ".join(f"*{extension}" for extension in sorted(SUPPORTED_AUDIO_EXTENSIONS))
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    selected = filedialog.askopenfilenames(
        title="Audio- oder Videodateien auswählen",
        filetypes=(("Unterstützte Medien", patterns), ("Alle Dateien", "*.*")),
    )
    root.destroy()
    return list(selected)


class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/api/state":
            self.send_json(
                {
                    "running": STATE.running,
                    "messages": STATE.drain(),
                    "defaultOutputDir": str(DEFAULT_OUTPUT_DIR),
                    "qualities": VIDEO_QUALITIES,
                    "outputs": OUTPUT_TYPES,
                    "dependencies": {
                        "ffmpeg": bool(find_ffmpeg_location()),
                        "node": bool(find_node_runtime()),
                        "ytDlp": yt_dlp is not None,
                    },
                }
            )
            return
        path = "index.html" if self.path == "/" else unquote(self.path.lstrip("/"))
        file_path = (WEB_DIR / path).resolve()
        if not file_path.is_file() or WEB_DIR.resolve() not in file_path.parents:
            self.send_error(404)
            return
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(file_path.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        try:
            data = self.read_json()
            if self.path == "/api/download":
                self.start_download(data)
                return
            if self.path == "/api/convert":
                self.start_conversion(data)
                return
            if self.path == "/api/choose-files":
                self.send_json({"ok": True, "paths": choose_audio_files()})
                return
            if self.path == "/api/choose-folder":
                self.send_json({"ok": True, "path": choose_folder(data.get("initialDir", ""))})
                return
            if self.path == "/api/clear":
                STATE.drain()
                self.send_json({"ok": True})
                return
            self.send_error(404)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"ok": False, "error": str(error)}, 400)
        except Exception as error:
            self.send_json({"ok": False, "error": f"Aktion nicht möglich: {clean_message(error)}"}, 500)

    def start_download(self, data: dict) -> None:
        url = str(data.get("url", "")).strip()
        parsed = urlparse(url)
        source = detect_source(url)
        if parsed.scheme not in {"http", "https"} or not source:
            self.send_json({"ok": False, "error": "Bitte eine öffentliche YouTube- oder Instagram-URL eintragen."}, 400)
            return
        output_type = str(data.get("outputType", "video"))
        quality = str(data.get("quality", "beste"))
        if output_type not in OUTPUT_TYPES or quality not in VIDEO_QUALITIES:
            self.send_json({"ok": False, "error": "Die gewählte Ausgabe oder Qualität ist ungültig."}, 400)
            return
        start_time = parse_time(str(data.get("startTime", "")), "Startzeit")
        end_time = parse_time(str(data.get("endTime", "")), "Endzeit")
        if start_time is not None and end_time is not None and end_time <= start_time:
            self.send_json({"ok": False, "error": "Die Endzeit muss nach der Startzeit liegen."}, 400)
            return
        filename = safe_filename(str(data.get("filename", "")))
        output_dir = Path(str(data.get("outputDir", "")) or DEFAULT_OUTPUT_DIR).expanduser()
        with STATE.lock:
            if STATE.running:
                self.send_json({"ok": False, "error": "Es läuft bereits ein Download."}, 409)
                return
            STATE.running = True
        STATE.log("Download wird vorbereitet …")
        threading.Thread(
            target=run_download,
            args=({
                "url": url, "source": source, "output_type": output_type, "quality": quality,
                "filename": filename, "output_dir": str(output_dir), "start_time": start_time, "end_time": end_time,
            },),
            daemon=True,
        ).start()
        self.send_json({"ok": True, "source": source})

    def start_conversion(self, data: dict) -> None:
        files = [str(item) for item in data.get("files", []) if str(item).strip()]
        if not files:
            self.send_json({"ok": False, "error": "Bitte mindestens eine Audio- oder Videodatei auswählen."}, 400)
            return
        unsupported = [Path(item).name for item in files if Path(item).suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS]
        if unsupported:
            self.send_json({"ok": False, "error": f"Nicht unterstütztes Format: {unsupported[0]}"}, 400)
            return
        bitrate = str(data.get("bitrate", "192k"))
        if bitrate not in MP3_BITRATES:
            self.send_json({"ok": False, "error": "Die gewählte MP3-Qualität ist ungültig."}, 400)
            return
        output_dir = Path(str(data.get("outputDir", "")) or DEFAULT_OUTPUT_DIR).expanduser()
        with STATE.lock:
            if STATE.running:
                self.send_json({"ok": False, "error": "Es läuft bereits eine Verarbeitung."}, 409)
                return
            STATE.running = True
        STATE.log("Konvertierung wird vorbereitet …")
        threading.Thread(
            target=run_conversion,
            args=({"files": files, "output_dir": str(output_dir), "bitrate": bitrate},),
            daemon=True,
        ).start()
        self.send_json({"ok": True})

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    def send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    url = f"http://{HOST}:{server.server_address[1]}"
    print(f"JMS Medienwerkstatt läuft unter {url}")
    webbrowser.open(url)
    server.serve_forever()


if __name__ == "__main__":
    main()
