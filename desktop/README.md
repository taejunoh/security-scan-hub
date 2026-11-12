# Security Scan Hub desktop

Version 0.2.9 for Mac and 0.2.8 for Windows are the current desktop prereleases, with a guided first scan and
an example scan. The Mac ZIPs are notarized; the portable Windows ZIP is
unsigned. The Microsoft Store currently offers 0.2.5; the 0.2.7 update is
in Microsoft certification and is not yet published.
[Mac 0.2.9 release](https://github.com/taejunoh/security-scan-hub/releases/tag/desktop-v0.2.9) · [Windows 0.2.8 release](https://github.com/taejunoh/security-scan-hub/releases/tag/desktop-v0.2.8)

- macOS Apple silicon, Developer ID signed and notarized. [Download 0.2.9](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.9/sec-hub-desktop-0.2.9-darwin-arm64-notarized-prerelease.zip)
- macOS Intel x64, Developer ID signed and notarized. [Download 0.2.9](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.9/sec-hub-desktop-0.2.9-darwin-x64-notarized-prerelease.zip)
- Windows x64, unsigned portable ZIP. [sec-hub-desktop-0.2.8-win32-x64-prerelease.zip](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.8/sec-hub-desktop-0.2.8-win32-x64-prerelease.zip)
- Windows x64, Microsoft Store listing (currently 0.2.5). [Install Security Scan Hub](https://apps.microsoft.com/detail/9NQQRS8WX1T7)
- [Mac 0.2.9 checksums](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.9/sec-hub-desktop-0.2.9-SHA256SUMS.txt) · [Windows 0.2.8 checksums](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.8/sec-hub-desktop-0.2.8-SHA256SUMS.txt)

Extract the Mac ZIP and open `Security Scan Hub.app`, or install the Windows Store app.
For the portable Windows ZIP, extract it and open `Sec Hub.exe`. The app window
is titled **Security Scan Hub**. [Step-by-step installation](../docs/GETTING-STARTED.md#1-download-and-open-the-app)

The Intel package bundles OSV Scanner for a first scan without Terminal and
requires macOS 13 or later. The exact notarized ZIP passed packaged smoke on a
hosted Intel Mac. This does not claim hands-on testing on a physical user Mac.

The scanner build bundles a pinned OSV Scanner. Select **Try an example** to
run a real example scan, or select **Scan my app**, choose your source-code
folder, and click **Start basic scan**. The saved report opens automatically
in the **Security Inbox**.
OSV may send package names and versions to Google's advisory and package
metadata services. A completed scan covers the supported dependency files
that OSV checked.

## Run a multi-tool scan

1. Choose **Scan my app**, select the project folder, and open **Advanced tools and settings**.
2. Open the setup instructions for the tools you want. Install them and sign
   in through their upstream tools where required. Those one-time steps may
   use a terminal.
3. Open **Advanced tool setup** and import a local, trusted JSON file.
   Start from the [seven-tool example](../examples/seven-tools.config.json)
   and replace the example paths with absolute paths on your machine. Keep the
   file outside the project you scan and select it again after restarting the
   app. Use the executable or a native interpreter with its script path. On Windows, use
   an `.exe` rather than a `.cmd` or `.bat` launcher. Select a local
   Node.js 22 or newer executable in the app if prompted.
4. Click **Select all ready tools** or choose individual tools. Provide the
   HTTP(S) URL for PHP2Shell and approve AI use if selected. Click **Start scan**.
   The **Security inbox** opens the combined report when it is ready. Check
   tool coverage for skipped or failed tools.

| Integration | Setup and sign-in |
| --- | --- |
| Google OSV Scanner | Bundled. No account required. Internet access is needed for advisory lookups. |
| NVIDIA SkillSpector | [Install SkillSpector](https://github.com/NVIDIA/SkillSpector). Static mode needs no model account. Choose an individual skill folder with a top-level `SKILL.md`. |
| OpenAI Codex Security | [Install and sign in](https://github.com/openai/codex-security/blob/main/sdk/typescript/docs/cli.md#authentication) using the upstream tool, then configure its executable and selected authentication method. |
| Alibaba Open Code Review | [Install Open Code Review](https://github.com/alibaba/open-code-review), then [configure your provider](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/cli-reference.md#ocr-auth). ChatGPT sign-in for this tool is a separate flow. |
| OpenAI PHP2Shell Checker | [Get the checker](https://github.com/openai/php2shell-checker) and configure Node.js with the absolute path to `phpcheck.js`. No account required. Use an authorized URL without secrets. |
| Cloudflare Security Audit Skill | [Get the official skill](https://github.com/cloudflare/security-audit-skill) at the example revision. Install and sign in to Codex CLI 0.164.0 on macOS, then configure the checkout and a separate work folder. |
| Anthropic Defending Code | [Get the official harness](https://github.com/anthropics/defending-code-reference-harness) at the example revision and [set up and sign in to Claude Code](https://code.claude.com/docs/en/setup). Configure the checkout and a separate work folder. The app runs the static `/vuln-scan` skill. |

### Windows Codex Security 0.7.0 setup

On Windows, Codex Security 0.7.0 supports Node.js 22.13.0 or newer in the
22.x series, 24.x, or 26.x. It needs Python 3.10 or newer for scans and
exports. Python 3.10 also needs `tomli`. If Codex Security cannot find
Python, add its installation directory to your user `PATH` or set the
user `PYTHON` environment variable to the absolute path to `python.exe`,
then fully quit and reopen Security Scan Hub. If you scan a Git checkout,
install Git for Windows and make `git.exe` available on `PATH`.

Codex Security 0.7.0 can fail to save a Windows scan when a draft manifest
starts with a UTF-8 byte order mark. For a new scan, prepare a separate
plugin from the pinned npm archive with the
[preparation script](../scripts/prepare-codex-windows-plugin.py).

This is an opt-in local compatibility workaround, not an upstream vendor fix:
it changes only your prepared plugin copy, and the upstream package stays
unchanged. The BOM decoder was verified by a separate pinned-reader regression
test. The successful live Windows Codex run used this explicit local override,
but its sealed files did not contain a BOM.

From the Sec Hub source checkout in PowerShell, run these commands as the
same Windows user who opens Sec Hub:

```powershell
npm pack '@openai/codex-security@0.7.0' --ignore-scripts
python .\scripts\prepare-codex-windows-plugin.py .\openai-codex-security-0.7.0.tgz "$env:LOCALAPPDATA\SecHubCodexSecurity070"
```

If you configured `PYTHON` without adding it to `PATH`, use
`& $env:PYTHON` in place of `python`. Use a new destination under your
private user profile, outside any project you scan and outside the report
directory. The script checks the archive
digest, changes only the JSON decoder in the copy, and writes
`provenance.json`. In your Sec Hub configuration, add `pluginPath` to
`tools["codex-security"].scanOptions`, with the absolute path to the
`plugin` directory printed by the script. Escape backslashes in JSON.
The installed Codex Security package stays unchanged. Keep the plugin
directory private because Codex Security loads its code during the scan.

On Windows, if you use ChatGPT with Open Code Review 1.13.3, sign in with
`ocr auth login --provider chatgpt`. Then run
`ocr config set provider chatgpt` and
`ocr config set providers.chatgpt.model <supported-model>`, replacing
`<supported-model>` with a model supported by your account and the tool.
Selecting ChatGPT in the Sec Hub tool configuration passes a scan flag.
Open Code Review still needs the provider and model saved in its own configuration.

The restricted Cloudflare and Anthropic workflows are available on Apple
silicon macOS. They are not validated on Intel and are disabled on Windows
pending validation of their restricted execution environments there. The other
integrations can be configured individually. Each provider handles its own
authentication. AI tools may send project data to the configured provider
and consume usage or incur charges.

## Package signing

The macOS ZIPs are signed with Developer ID and include stapled notarization
tickets. The Windows ZIP is unsigned, so Windows may show an unknown publisher warning.

## Build and package checks

For maintainers, build on the matching OS and architecture with
`node desktop/build.mjs --target <darwin-arm64|darwin-x64|win32-x64> --out <absolute-empty-output> --cache <absolute-cache>`.
Windows x64 packaging requires an x64 Visual Studio Developer Command Prompt,
MSVC, and the Windows SDK. `node desktop/smoke.mjs --executable <absolute-packaged-app> --out <absolute-empty-evidence-directory>`
checks the packaged scan and shutdown; its fixture scan needs network access to
OSV.


[The OSV lock](app/osv-lock.json) pins the upstream version, executable sizes
and SHA-256 checksums, and Apache-2.0 license. Packaging verifies the files
before staging and checks the executable again after signing. The manifest
records the source and executable digest. The unpacked scanner adds about
55 MB on macOS or 59 MB on Windows. To update the pin, cross-check the
official checksum file and release asset digest, update the desktop lock and
core adapter together, and run the packaged smoke on the supported release
targets.

**File → Show recent scans** opens reports saved by this app. **Open saved
view in browser** opens the example or an explicitly opened saved-results
folder. Recent scans remain available from the app window.
