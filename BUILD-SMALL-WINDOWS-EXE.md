# Build the compact Windows EXE

The old Electron installer bundled Chromium and Node, so its setup file was
about 124 MB and its installed footprint could show about 650 MB. Version 0.3.0
uses Tauri and the Windows system WebView2 runtime instead.

## One-time Windows setup

1. Install **Microsoft C++ Build Tools** and select **Desktop development with C++**.
2. Install Rustup: `winget install --id Rustlang.Rustup`
3. Close and reopen Command Prompt.

Windows 10 (1803+) and Windows 11 already include WebView2 in normal installs.

## Build

```bat
npm install
npm run desktop:build
```

Or double-click `BUILD-DESKTOP.bat`.

The installer appears in:

```text
src-tauri\target\release\bundle\nsis\
```

Its exact size depends on the Rust/Tauri versions and Windows toolchain. The
configuration uses release LTO, symbol stripping, size optimization, and the
zero-payload `downloadBootstrapper` WebView2 mode. Do not use an offline or fixed
WebView2 runtime if small installer size is the priority.

## Android

Double-click `BUILD-ANDROID.bat`. The output is `PicSecure-Renew.apk` in the
project root.
