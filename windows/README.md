# Windows app

The primary local client is a small native C/Win32 application.

It provides:

- destination profile setup for Cloudflare R2 and GitHub;
- Windows-user-local encrypted token storage using DPAPI;
- a paste-URL + Send fallback UI;
- the localhost API used by the browser extension;
- no requirement for Node.js during ordinary use.

## Build

From the repository root on Windows:

```bat
build-windows.bat
```

Requirements:

- Windows 10/11
- CMake
- Visual Studio Build Tools with the C/C++ workload

The app uses only Windows system libraries: Win32, WinHTTP, Winsock, and DPAPI.

## Runtime state

No destination name is compiled into the executable.

Runtime configuration lives under:

```text
%APPDATA%\RemoteAssetIngest\
  profiles.ini
  secrets\
```

A destination profile contains the target Worker URL or GitHub repository and
paths. Secrets are encrypted for the current Windows user.

Renaming this GitHub repository does not alter the runtime configuration or
protocol.
