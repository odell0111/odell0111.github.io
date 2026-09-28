@echo off
setlocal
cd /d "%~dp0"

echo.
echo   Odell - rebuilding the CV PDFs
echo   ------------------------------
echo.

where node >nul 2>nul || goto :nonode

if not exist "node_modules\markdown-pdf" (
  echo   markdown-pdf is not installed yet. Running npm install first...
  echo.
  call npm install || goto :npmfail
  echo.
)

echo   Building CV_Odell_EN.pdf ...
call "node_modules\.bin\markdown-pdf.cmd" "CV_Odell_EN.md" -o "CV_Odell_EN.pdf" -s "cv.css" -f A4 -b "1.5cm"
if errorlevel 1 goto :buildfail

echo   Building CV_Odell_ES.pdf ...
call "node_modules\.bin\markdown-pdf.cmd" "CV_Odell_ES.md" -o "CV_Odell_ES.pdf" -s "cv.css" -f A4 -b "1.5cm"
if errorlevel 1 goto :buildfail

echo.
echo   Done. Both PDFs rebuilt in this folder.
echo.
echo   The page links straight to cv\CV_Odell_EN.pdf and cv\CV_Odell_ES.pdf,
echo   so there is nothing to copy anywhere - just refresh the browser.
echo.
pause
exit /b 0


:nonode
echo   [X] Node.js was not found on PATH.
echo       Install it from https://nodejs.org, then run this again.
echo.
pause
exit /b 1


:npmfail
echo.
echo   [X] npm install failed. Read the output above.
echo.
pause
exit /b 1


:buildfail
echo.
echo   [X] The build failed. Read the output above.
echo.
echo   The flags above are not the usual ones. In markdown-pdf 11.x, -c is
echo   --cwd and -p is --phantom-path; the CSS flag is -s, the paper format
echo   is -f, and the margin is -b. Passing -c cv.css makes the tool try to
echo   run "A4" as a program.
echo.
pause
exit /b 1
