@echo off
echo Starting Nautilus servers...
echo.

echo Starting backend server on port 3001...
start "Backend Server" cmd /k "cd /d %~dp0 && npm run server"

timeout /t 3 /nobreak > nul

echo Starting frontend server...
start "Frontend Server" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo Both servers starting...
echo Backend: http://localhost:3001
echo Frontend: Will be shown in the second window
echo.
pause
