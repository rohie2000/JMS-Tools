#!/bin/sh
cd "$(dirname "$0")" || exit 1

if [ ! -x ".venv/bin/python" ]; then
  PYTHON_BIN="$(command -v python3)"
  if [ -z "$PYTHON_BIN" ]; then
    echo "Python 3 wurde nicht gefunden. Bitte Python 3.10 oder neuer installieren."
    read -r _
    exit 1
  fi
  echo "Richte die Medienwerkstatt einmalig ein …"
  "$PYTHON_BIN" -m venv .venv || exit 1
  .venv/bin/python -m pip install --upgrade pip -r requirements.txt || exit 1
fi

.venv/bin/python app.py
