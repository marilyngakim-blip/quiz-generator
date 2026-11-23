@echo off
set PYTHONIOENCODING=utf-8
chcp 65001 >nul
cd /d "%~dp0"
echo Membuka TaipSoalan dalam pelayar... (tutup tetingkap ini untuk berhenti)
py -3 -m streamlit run app.py --browser.gatherUsageStats false --server.headless false
pause
