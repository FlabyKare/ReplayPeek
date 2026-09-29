# ReplayPeek

Windows desktop utility built with Vue 3, TypeScript, Tauri 2 and Rust. The current MVP
implements a configurable global region-selection hotkey (including `Alt+Backquote`),
multi-monitor/DPI-aware coordinates, screen capture, local Windows OCR, tray operation
and persisted settings.

Version 0.4 adds cursor-based dashboard editing and AI reply generation. Open Settings
by clicking the ReplayPeek logo, enable layout editing, then drag blocks by their dotted
handle or resize them from the bottom-right corner. AI replies can run automatically
after successful OCR or manually from the Reply block.

OCR runs locally through the Windows 10/11 OCR engine. Screenshots never leave the
device. When AI generation is requested, only the recognized text, selected language
and reply style are sent to the ReplayPeek backend. Install the corresponding Windows
language pack if recognition for Russian or English is unavailable on the machine.

The Railway-ready sync service now lives in [`backend/`](backend/README.md). It provides
Telegram OIDC with PKCE, hashed bearer sessions, PostgreSQL migrations, health checks and
revision-controlled workspace synchronization. It also proxies authenticated AI reply
requests to the OpenAI Responses API, keeping `OPENAI_API_KEY` out of the desktop client.
Railway deployment needs PostgreSQL, BotFather OIDC credentials and an OpenAI project
API key.

## Development

Prerequisites: Node.js 20+, Rust stable (MSVC), Microsoft C++ Build Tools and WebView2.

```powershell
npm install
npm run tauri dev
```

Quality checks:

```powershell
npm run lint
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Create a Windows installer:

```powershell
npm run tauri build -- --bundles nsis
```

The portable executable is written to `src-tauri/target/release/reply-overlay.exe`;
the installer is written to `src-tauri/target/release/bundle/nsis/`.
