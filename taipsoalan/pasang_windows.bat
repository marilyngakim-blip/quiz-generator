@echo off
set PYTHONIOENCODING=utf-8
chcp 65001 >nul
setlocal
echo ============================================================
echo   Pemasangan TaipSoalan (Windows) - sekali sahaja
echo   Klik kanan fail ini dan pilih "Run as administrator".
echo ============================================================
echo.
where winget >nul 2>nul
if errorlevel 1 (
  echo [!] winget tiada. Pasang/kemas kini "App Installer" dari Microsoft Store, kemudian cuba lagi.
  pause
  exit /b 1
)
set WG=--accept-package-agreements --accept-source-agreements --silent

where py >nul 2>nul
if errorlevel 1 (
  echo [1/5] Memasang Python...
  winget install -e --id Python.Python.3.12 %WG%
) else (
  echo [1/5] Python sudah ada.
)
echo [2/5] Memasang LibreOffice...
winget install -e --id TheDocumentFoundation.LibreOffice %WG%
echo [3/5] Memasang Poppler (pdftoppm)...
winget install -e --id oschwartz10612.Poppler %WG%
echo [4/5] Memasang Tesseract OCR...
winget install -e --id UB-Mannheim.TesseractOCR %WG%

set "TD=%ProgramFiles%\Tesseract-OCR\tessdata"
if exist "%TD%\msa.traineddata" goto ada_msa
echo       Memuat turun data bahasa Melayu untuk Tesseract...
curl -L -o "%TEMP%\msa.traineddata" https://github.com/tesseract-ocr/tessdata/raw/main/msa.traineddata
copy /Y "%TEMP%\msa.traineddata" "%TD%\" >nul
if errorlevel 1 echo [!] Gagal menyalin msa.traineddata - jalankan fail ini sebagai Administrator.
:ada_msa

echo [5/5] Memasang pakej Python...
where py >nul 2>nul
if errorlevel 1 (
  echo [!] Python baru dipasang. Tutup tetingkap ini dan jalankan pasang_windows.bat sekali lagi.
  pause
  exit /b 0
)
py -3 -m pip install --upgrade pip
py -3 -m pip install -r "%~dp0requirements.txt"
echo.
py -3 "%~dp0main.py" --semak-pemasangan
echo.
echo Siap. Untuk mula, klik dua kali "jalankan.bat".
pause
