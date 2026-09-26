@echo off
setlocal
where cmake >nul 2>nul
if errorlevel 1 (
  echo CMake was not found. Install CMake and the Visual Studio C build tools.
  exit /b 1
)

cmake -S windows -B windows\build -A x64
if errorlevel 1 exit /b 1
cmake --build windows\build --config Release
if errorlevel 1 exit /b 1

echo.
echo Built:
echo windows\build\Release\remote-asset-ingest.exe
