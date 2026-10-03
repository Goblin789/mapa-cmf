@echo off
rem Arranca o Mapa CMF neste PC e abre-o no browser.
rem Deixar esta janela aberta enquanto se usa o mapa. Para parar: fechar a janela.
cd /d "%~dp0"
title Mapa CMF
start "" /min cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:5173"
call npm run dev
