# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-27

Initial public release on Open VSX Registry as `dllsystem.terminal-bridge`.

Extracted from `loque-facil-livewire/tools/vscode-extensions/terminal-image-paste`
(originally developed in 2025 as v0.1.0 – v0.2.2 inside that monorepo).

> **Note**: at first publish the `dllsystem` namespace was created in
> unverified state (`unrelatedPublisher: true` in the API response).
> Installation works, but Open VSX will display an "Unrelated Publisher"
> warning on the extension page until the namespace is formally claimed
> via https://open-vsx.org/user-settings/namespaces.

### Added

- **Terminal image paste (Ctrl+V)** — overrides the integrated terminal's
  paste so that an image in the clipboard is saved to a configurable
  directory and the resulting file path is typed into the terminal.
  Text clipboards keep the native paste behavior.
- **Forced image paste (Ctrl+Shift+V)** — forces image paste even when the
  clipboard also contains text.
- **Send Selection to Terminal** — sends a textual reference
  (`<path>:<line>` or `<path>:<lineStart>-<lineEnd>` etc.) of the current
  editor selection to the active terminal. Available via editor title bar
  button, editor context menu, and Command Palette.
- **Copy Selection to Terminal** — same reference, copied to the clipboard
  instead of being sent to a terminal.
- **Configurable settings** — `terminalImagePaste.saveDirectory` (default
  `/tmp/clipboard`), `terminalImagePaste.maxAgeHours` (default `24`),
  `terminalImagePaste.maxFileSizeMB` (default `10`).
