#!/usr/bin/env python3
"""Harness mínimo para un único worker Claude.

Ejecuta UN worker (un comando, típicamente el CLI de Claude) con:
  - checkpoint JSON persistente,
  - heartbeat durante la ejecución,
  - timeout duro (por defecto 120 min),
  - reporte HTML local,
  - comandos simples: `status` y `run`,
  - sin reintento ciego ante límites de tokens.

Solo biblioteca estándar. Compatible con Python 3.9+.

Uso:
  python3 scripts/harness.py run -- claude -p "haz X"
  python3 scripts/harness.py run --timeout 7200 -- <comando...>
  python3 scripts/harness.py status
"""

import argparse
import datetime as dt
import html
import json
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

HARNESS_DIR = Path(".harness")
CHECKPOINT = HARNESS_DIR / "checkpoint.json"
REPORT = HARNESS_DIR / "report.html"
LOG = HARNESS_DIR / "worker.log"

DEFAULT_TIMEOUT = 120 * 60  # 120 minutos, el presupuesto del desafío.
HEARTBEAT_EVERY = 10.0      # segundos entre latidos.

# Señales de límite de tokens/uso: NO se reintenta a ciegas, se detiene y escala.
TOKEN_LIMIT_MARKERS = (
    "rate limit",
    "rate_limit",
    "token limit",
    "context length",
    "context_length_exceeded",
    "usage limit",
    "quota",
    "429",
)


def _now() -> float:
    return time.time()


def _iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts).isoformat(timespec="seconds")


def _load_checkpoint() -> dict:
    if CHECKPOINT.exists():
        try:
            return json.loads(CHECKPOINT.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return {}
    return {}


def _save_checkpoint(data: dict) -> None:
    HARNESS_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CHECKPOINT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(CHECKPOINT)


def _detect_token_limit(text: str) -> bool:
    low = text.lower()
    return any(marker in low for marker in TOKEN_LIMIT_MARKERS)


def _write_report(cp: dict) -> None:
    HARNESS_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    for key in ("status", "command", "started_at", "ended_at", "last_heartbeat",
                "elapsed_seconds", "exit_code", "note"):
        val = cp.get(key, "")
        rows.append(
            "<tr><th>{}</th><td>{}</td></tr>".format(
                html.escape(str(key)), html.escape(str(val))
            )
        )
    tail = cp.get("output_tail", "")
    doc = """<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Harness report</title>
<style>
body{{font:14px/1.5 system-ui,sans-serif;margin:2rem;color:#222}}
table{{border-collapse:collapse;margin-bottom:1rem}}
th,td{{border:1px solid #ccc;padding:.35rem .6rem;text-align:left;vertical-align:top}}
th{{background:#f4f4f4;white-space:nowrap}}
pre{{background:#111;color:#eee;padding:1rem;overflow:auto;border-radius:6px}}
.status-ok{{color:#0a7d00}} .status-bad{{color:#b00}} .status-blocked{{color:#b56a00}}
</style></head><body>
<h1>Harness — worker único</h1>
<p>Generado: {generated}</p>
<table>{rows}</table>
<h2>Salida (cola)</h2>
<pre>{tail}</pre>
</body></html>""".format(
        generated=html.escape(_iso(_now())),
        rows="".join(rows),
        tail=html.escape(tail),
    )
    REPORT.write_text(doc, encoding="utf-8")


def cmd_run(args: argparse.Namespace) -> int:
    worker_cmd = args.command
    if not worker_cmd:
        print("error: falta el comando del worker tras '--'", file=sys.stderr)
        return 2

    HARNESS_DIR.mkdir(parents=True, exist_ok=True)
    start = _now()
    cp = {
        "status": "running",
        "command": " ".join(worker_cmd),
        "started_at": _iso(start),
        "ended_at": "",
        "last_heartbeat": _iso(start),
        "elapsed_seconds": 0,
        "exit_code": None,
        "note": "",
        "output_tail": "",
    }
    _save_checkpoint(cp)
    _write_report(cp)

    lines = []
    token_limit_hit = False
    last_beat = start

    log_fh = LOG.open("w", encoding="utf-8")
    try:
        proc = subprocess.Popen(
            worker_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            start_new_session=True,
        )
    except (OSError, ValueError) as exc:
        cp.update(status="error", ended_at=_iso(_now()),
                  note="no se pudo lanzar el worker: {}".format(exc),
                  exit_code=127)
        _save_checkpoint(cp)
        _write_report(cp)
        log_fh.close()
        print("error: {}".format(exc), file=sys.stderr)
        return 127

    # Watchdog independiente de stdout: Claude puede quedar en silencio sin terminar.
    watchdog_stop = threading.Event()
    def watch():
        beat = _now()
        while not watchdog_stop.wait(1):
            now = _now()
            if now - start > args.timeout:
                cp.update(status="timeout", note="superado el timeout de {}s".format(args.timeout))
                _save_checkpoint(cp)
                _write_report(cp)
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                return
            if now - beat >= HEARTBEAT_EVERY:
                beat = now
                cp["last_heartbeat"] = _iso(now)
                cp["elapsed_seconds"] = int(now - start)
                cp["output_tail"] = "".join(lines[-40:])
                _save_checkpoint(cp)
                _write_report(cp)
    watchdog = threading.Thread(target=watch, name="harness-watchdog", daemon=True)
    watchdog.start()

    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            lines.append(line)
            log_fh.write(line)
            log_fh.flush()

            if _detect_token_limit(line):
                token_limit_hit = True
                proc.terminate()
                break

            now = _now()
            if now - start > args.timeout:
                cp.update(status="timeout", note="superado el timeout de {}s".format(args.timeout))
                proc.terminate()
                break

            if now - last_beat >= HEARTBEAT_EVERY:
                last_beat = now
                cp["last_heartbeat"] = _iso(now)
                cp["elapsed_seconds"] = int(now - start)
                cp["output_tail"] = "".join(lines[-40:])
                _save_checkpoint(cp)
                _write_report(cp)

        try:
            exit_code = proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
            exit_code = proc.wait()
    finally:
        watchdog_stop.set()
        watchdog.join(timeout=2)
        log_fh.close()

    end = _now()
    cp["ended_at"] = _iso(end)
    cp["elapsed_seconds"] = int(end - start)
    cp["last_heartbeat"] = _iso(end)
    cp["exit_code"] = exit_code
    cp["output_tail"] = "".join(lines[-40:])

    if token_limit_hit:
        # Política explícita: no reintentar a ciegas. Se detiene y se escala al humano.
        cp["status"] = "blocked_token_limit"
        cp["note"] = ("Detectado posible límite de tokens/uso. Detenido sin reintentar. "
                      "Escalar al autor humano antes de volver a ejecutar.")
    elif cp["status"] == "timeout":
        pass  # ya anotado
    elif exit_code == 0:
        cp["status"] = "done"
        cp["note"] = "worker finalizó correctamente"
    else:
        cp["status"] = "error"
        cp["note"] = "worker salió con código {}".format(exit_code)

    _save_checkpoint(cp)
    _write_report(cp)

    print("status: {}".format(cp["status"]))
    print("elapsed: {}s".format(cp["elapsed_seconds"]))
    print("checkpoint: {}".format(CHECKPOINT))
    print("report: {}".format(REPORT))
    if cp["note"]:
        print("note: {}".format(cp["note"]))

    return 0 if cp["status"] == "done" else 1


def cmd_status(args: argparse.Namespace) -> int:
    cp = _load_checkpoint()
    if not cp:
        print("sin checkpoint todavía (ejecuta 'run' primero)")
        return 0
    print("status        : {}".format(cp.get("status", "?")))
    print("command       : {}".format(cp.get("command", "")))
    print("started_at    : {}".format(cp.get("started_at", "")))
    print("last_heartbeat: {}".format(cp.get("last_heartbeat", "")))
    print("ended_at      : {}".format(cp.get("ended_at", "")))
    print("elapsed       : {}s".format(cp.get("elapsed_seconds", 0)))
    print("exit_code     : {}".format(cp.get("exit_code")))
    if cp.get("note"):
        print("note          : {}".format(cp["note"]))
    print("report        : {}".format(REPORT))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Harness mínimo para un único worker Claude.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="ejecuta el worker (comando tras '--')")
    p_run.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT,
                       help="timeout duro en segundos (def. {} = 120 min)".format(DEFAULT_TIMEOUT))
    p_run.add_argument("command", nargs=argparse.REMAINDER,
                       help="comando del worker, p. ej.: -- claude -p \"...\"")
    p_run.set_defaults(func=cmd_run)

    p_status = sub.add_parser("status", help="muestra el checkpoint actual")
    p_status.set_defaults(func=cmd_status)

    return parser


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    args = parser.parse_args(argv)
    # argparse.REMAINDER deja un '--' inicial en la lista; lo quitamos.
    if getattr(args, "command", None) and args.command and args.command[0] == "--":
        args.command = args.command[1:]
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
