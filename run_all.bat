@echo off
setlocal
pushd "%~dp0"
set "BACK_DIR=backend"
set "FRONT_DIR=frontend"
if exist "%BACK_DIR%\venv\Scripts\activate.bat" (
  set "BACK_CMD=call venv\Scripts\activate && python -m uvicorn app.main:app --reload"
) else (
  set "BACK_CMD=python -m uvicorn app.main:app --reload"
)
start "EA Analyzer Backend" cmd /c "cd /d %BACK_DIR% && %BACK_CMD%"
if exist "%FRONT_DIR%\node_modules" (
  set "FRONT_CMD=npm run dev"
) else (
  set "FRONT_CMD=npm install && npm run dev"
)
start "EA Analyzer Frontend" cmd /c "cd /d %FRONT_DIR% && %FRONT_CMD%"
popd
