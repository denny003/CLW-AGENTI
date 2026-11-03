@echo off
title Climawell - Server Locale (LAN e Wi-Fi)
cd /d "%~dp0"
echo =========================================================
echo Avvio del Server Locale Climawell (Porta 3000)...
echo =========================================================
node scripts/local-dev-server.js
pause
