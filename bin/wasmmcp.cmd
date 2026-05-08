@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\src\mcp\server.ps1"
exit /b %ERRORLEVEL%
