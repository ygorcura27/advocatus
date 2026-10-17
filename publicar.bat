@echo off
REM Publica o Advocatus: clique duas vezes neste arquivo.
cd /d "%~dp0"
git pull origin main
cd functions
call npm install
cd ..
call firebase deploy --only hosting,functions,firestore:rules
pause
