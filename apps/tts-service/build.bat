@echo off
setlocal

cd /d "%~dp0"
node build-win.js
if errorlevel 1 exit /b 1
