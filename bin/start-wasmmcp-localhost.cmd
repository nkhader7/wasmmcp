@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\src\mcp\http-server.ps1" -Port 8765
exit /b %ERRORLEVEL%
