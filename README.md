# ReplayPeek

Windows desktop utility built with Vue 3, TypeScript, Tauri 2 and Rust. The current MVP
implements a configurable global region-selection hotkey (including `Alt+Backquote`),
multi-monitor/DPI-aware coordinates, screen capture, local Windows OCR, tray operation
and persisted settings.

Version 0.3 adds local profiles with independent capture/OCR preferences and dashboard
layouts. Open Settings by clicking the ReplayPeek logo, then enable layout editing to
reorder blocks or change their width and height.

OCR runs locally through the Windows 10/11 OCR engine; screenshots and recognized text
are not sent to an external service. Install the corresponding Windows language pack if
recognition for Russian or English is unavailable on the machine.

Telegram Sync is represented by a separate authentication service boundary. To enable
the sign-in entrypoint, copy `.env.example` to `.env` and set `VITE_TELEGRAM_AUTH_URL`
to a public HTTPS backend that implements Telegram OIDC with PKCE and server-side token
verification. The desktop client never embeds a Telegram client secret. Cloud profile
storage still requires that backend and is not provided by the local-only build.

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
