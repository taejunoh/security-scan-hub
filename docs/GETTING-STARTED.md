# Getting started with Security Scan Hub Desktop

This guide covers the **0.2.7 desktop prerelease**, which adds a guided first
scan and an example scan. The Mac packages are notarized; the portable Windows
package is unsigned. [Read the platform validation record](FIRST-SCAN-VALIDATION.md).

## 1. Download and open the app

Download 0.2.7 for the guided first-scan experience. The Microsoft Store
currently offers 0.2.5. The 0.2.7 update is in Microsoft certification
and is not yet published.
[GitHub 0.2.7 release page](https://github.com/taejunoh/security-scan-hub/releases/tag/desktop-v0.2.7)

- **Mac with Apple silicon (M-series).**
  In Finder, double-click the downloaded ZIP. Then double-click **Security Scan Hub.app**
  (Finder may display it as **Security Scan Hub**). [Download `sec-hub-desktop-0.2.7-darwin-arm64-notarized-prerelease.zip`](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.7/sec-hub-desktop-0.2.7-darwin-arm64-notarized-prerelease.zip)
- **Intel Mac (x64).** In Finder, double-click the downloaded ZIP to extract
  it, then double-click **Security Scan Hub.app**. The Intel package bundles OSV Scanner,
  so the first scan runs in the app without Terminal. The exact notarized ZIP
  passed packaged smoke on a hosted Intel Mac; this is not a physical user Mac
  test. [Download `sec-hub-desktop-0.2.7-darwin-x64-notarized-prerelease.zip`](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.7/sec-hub-desktop-0.2.7-darwin-x64-notarized-prerelease.zip)
- **Windows x64 (Intel or AMD).** Download and extract the unsigned portable
  package, then open **Sec Hub.exe** in the extracted folder. Keep the files
  together. [Download `sec-hub-desktop-0.2.7-win32-x64-prerelease.zip`](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.7/sec-hub-desktop-0.2.7-win32-x64-prerelease.zip)
  Windows may show an unknown publisher warning because the ZIP is unsigned.
  The Store currently offers version 0.2.5.

The app window is titled **Security Scan Hub**.

The Intel package requires macOS 13 or later. You can also scan from Terminal and
view the report in a browser. [Intel Mac Terminal fallback](#intel-mac-scan-from-terminal)

The Windows ZIP requires an x64 PC. If you download it from the release page,
look under **Assets** for the ZIP linked above. The **Source code** archives do
not contain the ready-to-run app.

The app includes its runtime and OSV Scanner. You can run your first OSV scan
as soon as you open the app.

To verify a download, use the release's [SHA-256 checksums](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.7/sec-hub-desktop-0.2.7-SHA256SUMS.txt).

## 2. Run your first scan

On the 0.2.7 welcome screen, choose **Try an example** and then **Start
example scan** to explore a report without your own source code. The example
uses the bundled OSV Scanner, does not run example code, and is marked as an
example rather than a scan of your project. Package names and versions are sent
to OSV lookup services. For your project, choose **Scan my app**, select
**Choose folder**, review the package-file guidance, and select **Start basic
scan**. Extract a source ZIP first and choose its project folder, not the
archive itself. The report opens when the scan finishes.

Earlier Microsoft Store versions have the earlier scan screen. In it,
open **Project security scan**, choose a project folder, keep **OSV Scanner**
selected, and click **Start scan**. The report opens in the **Security Inbox**;
reopen saved reports with **File → Show recent scans**.

## 3. Understand the results

Start with critical and high findings. Open a finding and look under
**What to do next** for **Check first** and **Recommended action**. The app
uses the scanner's saved evidence to show an advisory fix, a tool suggestion,
or the checks to make before deciding what to change.

OSV checks supported dependency files for known vulnerabilities. It needs an
internet connection and may send package names and versions to OSV services.
A completed scan can have findings, and an empty report doesn't prove the
project is safe.

To scan with more tools, configure them and select them before clicking
**Start scan**. AI tools require provider sign-in and consent. A supported Apple
silicon Mac can run all seven integrations after setup. The Cloudflare and Anthropic
workflows are disabled on Windows. [Multi-tool setup guide](../desktop/README.md#run-a-multi-tool-scan)

## Intel Mac: Scan from Terminal

This optional fallback lets Intel Mac users run an OSV scan from Terminal and
review the results in a browser. The Intel desktop package requires macOS 13
or later and targets a macOS 15 Intel runner for release validation. Other
macOS versions and the CLI steps are not covered by that package validation.

1. Install **Node.js 22 or newer** for macOS **x64**, choosing a release
   compatible with your macOS version. [Node.js downloads](https://nodejs.org/en/download)
2. Install **OSV Scanner**. If you already use Homebrew, run
   `brew install osv-scanner`. The verified OSV Scanner 2.7.0 release also
   provides `osv-scanner_darwin_amd64` for Intel Macs. If you use that
   download, name the executable `osv-scanner` and put it on your Terminal's
   PATH. Confirm that `node --version` and `osv-scanner --version` both run.
   [OSV installation guide](https://google.github.io/osv-scanner/installation/) · [OSV Scanner 2.7.0](https://github.com/google/osv-scanner/releases/tag/v2.7.0)
3. Open Terminal and run the commands below. Replace `/path/to/project` with
   the folder you want to scan. A JavaScript project with a
   `package-lock.json` is a good first scan. The output folder must be
   empty or new.

   ```sh
   git clone --branch desktop-v0.2.7 https://github.com/taejunoh/security-scan-hub.git
   cd security-scan-hub
   node bin/sec-hub.mjs scan "/path/to/project" --tools osv --out ./sec-hub-runs/first-scan
   node bin/sec-hub.mjs serve --runs "$PWD/sec-hub-runs"
   ```

4. Open the `127.0.0.1` address printed by Terminal. Select the saved scan
   and a finding to see **What to do next**. Press **Control-C** in Terminal
   when you are done. The scan also saves a standalone HTML report at
   `sec-hub-runs/first-scan/report.html`.
