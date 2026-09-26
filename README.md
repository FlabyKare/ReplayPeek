# Reply Overlay

Windows desktop utility built with Vue 3, TypeScript, Tauri 2 and Rust. The current MVP
implements a configurable global region-selection hotkey (including `Alt+Backquote`),
multi-monitor/DPI-aware coordinates, screen capture, local Windows OCR, tray operation
and persisted settings.

OCR runs locally through the Windows 10/11 OCR engine; screenshots and recognized text
are not sent to an external service. Install the corresponding Windows language pack if
recognition for Russian or English is unavailable on the machine.

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
