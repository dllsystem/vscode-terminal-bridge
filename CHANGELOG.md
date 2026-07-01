# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2026-07-01

### Changed

- **Version realigned to the `0.2.x` lineage.** The extension was published
  as `0.1.0`/`0.1.1` at extraction, but the same source had already shipped
  inside the `loque-facil-livewire` monorepo up to `0.2.2`. Continuing at
  `0.2.3` avoids regressing the number developers already had installed and
  keeps Open VSX resolving this as the newest version.

### Internal

- This repository is now the **single source of truth** for the extension.
  The monorepo copy (`loque-facil-livewire/tools/vscode-extensions/terminal-image-paste/`)
  is being removed, and both Coder templates (`loquefacil`, `certify`) install
  `dllsystem.terminal-bridge` from Open VSX with `--force`. No behavioral
  changes to the extension in this release.

## [0.1.1] - 2026-05-27

### Changed

- README now documents the automated release workflow (tag → GitHub Actions
  publishes to Open VSX and creates a GitHub Release).
- CHANGELOG entry for `0.1.0` was amended with a note explaining the
  unverified-namespace state at first publish.

### Internal

- Added `.github/workflows/release.yml` — tag-push triggered pipeline that
  validates the tag against `package.json`, builds, publishes to Open VSX
  (with `--skip-duplicate`), and creates a GitHub Release with the VSIX
  attached. This is now the canonical release path.

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
