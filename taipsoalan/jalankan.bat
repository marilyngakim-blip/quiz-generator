@echo off
set PYTHONIOENCODING=utf-8
chcp 65001 >nul
cd /d "%~dp0"
rem Langkau soalan e-mel Streamlit pada kali pertama
if not exist "%USERPROFILE%\.streamlit" mkdir "%USERPROFILE%\.streamlit"
if not exist "%USERPROFILE%\.streamlit\credentials.toml" (
  > "%USERPROFILE%\.streamlit\credentials.toml" echo [general]
  >> "%USERPROFILE%\.streamlit\credentials.toml" echo email = ""
)
echo Membuka TaipSoalan dalam pelayar... (tutup tetingkap ini untuk berhenti)
py -3 -m streamlit run app.py --browser.gatherUsageStats false --server.headless false
pause
