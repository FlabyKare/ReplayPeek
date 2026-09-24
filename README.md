# Reply Overlay

Windows desktop utility built with Vue 3, TypeScript, Tauri 2 and Rust. Milestone 1
implements a global `Ctrl+Shift+S` region selector, multi-monitor/DPI-aware coordinates,
screen capture, tray operation and persisted settings.

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
