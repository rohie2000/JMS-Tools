@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PY_CMD="
where py >nul 2>nul
if not errorlevel 1 set "PY_CMD=py -3"
if "%PY_CMD%"=="" (
  where python >nul 2>nul
  if not errorlevel 1 set "PY_CMD=python"
)
if "%PY_CMD%"=="" (
  echo Python wurde nicht gefunden. Bitte Python 3.10 oder neuer installieren.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo Richte die Medienwerkstatt einmalig ein ...
  %PY_CMD% -m venv .venv
  if errorlevel 1 pause & exit /b 1
  ".venv\Scripts\python.exe" -m pip install --upgrade pip -r requirements.txt
  if errorlevel 1 pause & exit /b 1
)
where node >nul 2>nul
if errorlevel 1 echo Hinweis: Fuer aktuelle YouTube-Downloads wird Node.js 22 oder neuer empfohlen.
".venv\Scripts\python.exe" app.py
