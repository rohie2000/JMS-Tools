#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ ! -x ".venv/bin/python" ]; then
  echo "Bitte die Medienwerkstatt zuerst einmal starten."
  read -r _
  exit 1
fi
.venv/bin/python -m pip install --upgrade "yt-dlp[default]"
echo "yt-dlp und die YouTube-Komponente wurden aktualisiert."
read -r _
