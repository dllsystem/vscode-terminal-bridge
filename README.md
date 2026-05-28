# Terminal Bridge

A VS Code / code-server extension that bridges the editor and the integrated
terminal: paste images from the clipboard via `Ctrl+V`, and send textual
references of editor selections (`path:line`) to the terminal with one click.

Originally developed for a `code-server` + AI-coding-assistant workflow,
where moving images and code references between the editor and an assistant
running in the terminal is a constant source of friction.

## Features

### 1. Paste images into the terminal (`Ctrl+V`)

- Overrides `Ctrl+V` while the terminal is focused:
  - Text clipboard → identical to native paste (fast path).
  - Image clipboard (no text) → image is saved to
    `/tmp/clipboard/img-{timestamp}.{ext}` and the path is typed into the
    terminal automatically.
- `Ctrl+Shift+V` forces image paste even when the clipboard also contains
  text.

### 2. Send / Copy selection reference

Send a textual reference (`<path>:<line>-<line>`) of the current editor
selection to the terminal or clipboard with one click — useful for pointing
an AI assistant at a specific code excerpt without typing the path manually.

**How to trigger:**

| Method | How |
|--------|-----|
| Editor title bar | `$(send)` icon (paper plane) with tooltip "Send Selection to Terminal" — visible whenever a file is open |
| Context menu | Right-click in the editor → "Send/Copy Selection to Terminal" |
| Command Palette | `Ctrl+Shift+P` → "Terminal Bridge: Send/Copy Selection to Terminal" |

**Reference format** (border whitespace included so it can be appended to
in-progress sentences):

| Selection type | Generated format |
|----------------|------------------|
| Cursor without selection | `<path>:<line>` |
| Partial selection on one line | `<path>:<line>:<colStart>-<colEnd>` |
| Full-line selection | `<path>:<lineStart>-<lineEnd>` |
| Partial multi-line selection | `<path>:<lStart>:<cStart>-<lEnd>:<cEnd>` |

**Destination behavior:**

- **Send** → `vscode.window.activeTerminal.sendText(ref, false)` plus focus
  transfer to the terminal. If no terminal is open, a warning is shown and
  the clipboard is not modified.
- **Copy** → `vscode.env.clipboard.writeText(ref)` plus a notification
  showing the copied reference (truncated to 80 chars).

**Edge cases:**

- Untitled (unsaved) file → warning, no reference generated.
- No active editor → warning.
- Multiple terminals open → uses `activeTerminal` (last focused) without
  prompting.

## No default keybinding for Send / Copy

`Ctrl+Alt+<letter>` combinations conflict with AltGr on Brazilian ABNT
keyboards. The Microsoft best practice to avoid conflicts is to ship no
default — each user binds their own preferred shortcut under
`Preferences: Open Keyboard Shortcuts`.

Suggested safe combinations (no AltGr collision):

- `Ctrl+K R` (chord) → Send
- `Ctrl+K Shift+R` (chord) → Copy

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `terminalImagePaste.saveDirectory` | `/tmp/clipboard` | Where pasted images are saved. |
| `terminalImagePaste.maxAgeHours` | `24` | Older images are removed on activation. |
| `terminalImagePaste.maxFileSizeMB` | `10` | Per-image limit (above this is rejected). |

## Requirements

- `code-server` served over **HTTPS** (the Clipboard API requires a secure
  context).
- **Chrome** or any Chromium-based browser. Firefox is not supported.
- "Clipboard read" permission granted in the browser (an automatic prompt
  is shown on the first attempt).

## Install

### From Open VSX (recommended)

```bash
code-server --install-extension dllsystem.terminal-bridge --force
```

Then reload the code-server window
(`Ctrl+Shift+P` → "Developer: Reload Window").

### From a local VSIX

```bash
code-server --install-extension terminal-bridge-X.Y.Z.vsix --force
```

VSIX files are attached to each GitHub Release.

## Build locally

```bash
git clone https://github.com/dllsystem/vscode-terminal-bridge.git
cd vscode-terminal-bridge
npm install
npm run compile
npm run package   # produces *.vsix
```

## Releasing a new version

Releases are automated via GitHub Actions on tag push. The workflow lives at
`.github/workflows/release.yml` and runs `npm ci → compile → package →
ovsx publish → gh release create`. Local publishing is not needed.

**Prerequisites (one-time setup):**

- An `OVSX_PAT` secret must exist under repo Settings → Secrets and
  variables → Actions. Generate the token at
  https://open-vsx.org/user-settings/tokens.

**To cut a new release:**

```bash
# 1. Make your changes in src/, media/, etc.
# 2. Update CHANGELOG.md with a new "## [X.Y.Z] - YYYY-MM-DD" section.
# 3. Bump the version and create a tag in one shot:
npm version patch       # or `minor` / `major` — bumps package.json + creates tag
# 4. Push both the commit and the tag:
git push --follow-tags
# 5. Watch the workflow at:
#    https://github.com/dllsystem/vscode-terminal-bridge/actions
```

The workflow validates that the tag matches `package.json` `version` before
publishing — so `npm version` and the tag stay in sync automatically.

If you need to publish from your local machine for any reason (workflow
broken, etc.), the manual flow still works:

```bash
npm run compile && npm run package
npx ovsx --pat "$OVSX_PAT" publish terminal-bridge-X.Y.Z.vsix
```

## License

MIT — see [LICENSE](./LICENSE).
