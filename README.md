# Security Scan Hub

**New desktop prerelease: 0.2.6.** It adds guided first use, an example scan,
and the Security Scan Hub name and icon. Download the notarized Mac packages
or the portable Windows ZIP below. The Microsoft Store currently offers 0.2.4;
its 0.2.5 update is in publishing, and no 0.2.6 Store submission is
confirmed. The exact notarized Intel ZIP passed hosted Intel smoke, but this
is not a physical-user Mac test. See the [platform validation record](docs/FIRST-SCAN-VALIDATION.md).

**Run seven security tools in a single scan. Review the results in one place.**
Security Scan Hub combines dependency checks, AI skill scanning, code review,
and URL checks in one report. See the findings and which tools completed,
were skipped, or failed. Results are available as HTML, JSON, and SARIF.

**Desktop quick start.** [Choose your Mac or Windows download](#download-security-scan-hub-desktop-026)
and run Google OSV Scanner without a terminal. To run multiple tools,
select them in the app and click **Start scan**. The combined report opens
automatically in the **Security Inbox**. An Apple silicon Mac can run all seven
after setup. On Windows, the Cloudflare and Anthropic workflows are disabled.
Follow the [desktop setup guide](desktop/README.md#run-a-multi-tool-scan).

![Security Scan Hub first-use screen with choices to scan an app or try an example](docs/images/onboarding-welcome-en.png)

## Seven integrations

| Upstream project | What it checks |
| --- | --- |
| [Google OSV Scanner](https://github.com/google/osv-scanner) | Finds known vulnerabilities in project dependencies. |
| [NVIDIA SkillSpector](https://github.com/NVIDIA/SkillSpector) | Scans AI agent skills for suspicious patterns in static mode. |
| [OpenAI Codex Security](https://github.com/openai/codex-security) | Reviews source code for potential vulnerabilities. |
| [Alibaba Open Code Review](https://github.com/alibaba/open-code-review) | Reviews repository code for security and correctness issues. |
| [OpenAI PHP2Shell Checker](https://github.com/openai/php2shell-checker) | Checks the specified URL's response headers for signs of affected PHP versions. |
| [Cloudflare Security Audit Skill](https://github.com/cloudflare/security-audit-skill) | Runs the upstream audit workflow through the Codex CLI. |
| [Anthropic Defending Code Reference Harness](https://github.com/anthropics/defending-code-reference-harness) | Runs the upstream Claude Code `/vuln-scan` skill in static mode. |

Before installing or upgrading an integration, check the [verified CLI versions](src/adapters/SOURCES.md)
and the [requirements for the Cloudflare and Anthropic workflows](docs/REFERENCE.md#official-security-skill-workflows).
New upstream versions may change sign-in, command options, or report formats.

Install the upstream tools and adapt the [seven-tool configuration](examples/seven-tools.config.json)
to your environment. AI workflows require explicit `--ai` opt-in and may send
code or context to the configured provider. The PHP check uses the URL you supply.
SkillSpector requires a target with a top-level `SKILL.md`. With the tools
configured, select all seven in one command:

```sh
node bin/sec-hub.mjs scan /path/to/project \
  --tools osv,skillspector,codex-security,open-code-review,php2shell,cloudflare,anthropic \
  --ai --config /path/to/sec-hub.config.json \
  --url http://127.0.0.1:8080 --timeout 1200 --out ./sec-hub-runs
```

See the [CLI setup and technical reference](docs/REFERENCE.md) for tool
requirements and execution limits. The [verification history](docs/HISTORY.md#031-source-and-seven-tool-validation)
describes how results from the seven integrations were checked and combined.

## Example scan

![Security inbox with findings on the left and the selected advisory on the right](docs/images/security-inbox-wide.png)

The screenshot shows the current desktop design with saved results from an
OSV scan of the included example project. Its `lodash` 4.17.20 dependency had
four findings, two high and two medium. The screenshot was captured from a
development build and does not represent a scan of your own project.

The inbox puts the highest severity findings first. Start with critical and
high findings, and confirm whether candidates affect your project. Search by
package, title, or advisory ID, or filter by severity.

In 0.2.4, open a finding and look under **What to do next** for **Check first**
and **Recommended action**. The guidance uses saved scanner evidence, such
as an advisory's fixed version or code suggested by a tool. For PHP header
warnings, it explains how to verify the installed version and patch status.
When the saved result has no specific fix, it directs you to the evidence to
review. Expand **Original evidence and metadata** for the full record.

On narrow screens, findings open in a full-width detail view. **Back to
results** restores the search, filters, scroll position, and keyboard focus.

## Download Security Scan Hub Desktop 0.2.6

Select several security tools, start one scan, and review findings and run
status together in the **Security Inbox**. Version 0.2.6 is a prerelease.

### Install on Mac (Apple silicon)

1. Download the Developer ID-signed and notarized package: [sec-hub-desktop-0.2.6-darwin-arm64-notarized-prerelease.zip](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.6/sec-hub-desktop-0.2.6-darwin-arm64-notarized-prerelease.zip).
2. In Finder, double-click the ZIP to extract it.
3. Open **Security Scan Hub.app**. The app window is titled **Security Scan Hub**.

The Apple silicon package supports M-series Macs and can run all seven
integrations after setup.

### Install on Mac (Intel)

1. Download the signed and notarized Intel package: [sec-hub-desktop-0.2.6-darwin-x64-notarized-prerelease.zip](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.6/sec-hub-desktop-0.2.6-darwin-x64-notarized-prerelease.zip).
2. In Finder, double-click the ZIP to extract it.
3. Open **Security Scan Hub.app**. The app window is titled **Security Scan Hub**.

The Intel package bundles OSV Scanner for a first scan without Terminal and
requires macOS 13 or later. The exact notarized ZIP passed packaged smoke on a
hosted Intel Mac. This is not a hands-on test on a physical user Mac.

### Install on Windows (x64)

**For the 0.2.6 prerelease:** [Download the unsigned Windows x64 portable ZIP](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.6/sec-hub-desktop-0.2.6-win32-x64-prerelease.zip).
In File Explorer, choose **Extract All**, then open **Sec Hub.exe** from the
extracted folder. Keep the files together. Windows may show an unknown
publisher warning because the ZIP is unsigned.

The Microsoft Store currently publishes version 0.2.4 for Intel and AMD x64
PCs running Windows 10 version 2004 or later, or Windows 11. The 0.2.5 update
is in publishing and has not propagated to the listing yet. No Store
submission for 0.2.6 is confirmed. [Open the current Store listing](https://apps.microsoft.com/detail/9NQQRS8WX1T7).
The Store app bundles OSV Scanner and does not require a terminal, Node.js, or
separate OSV account for a first scan.

**Verified November 10, 2026:** Store installation, folder selection, a bundled
OSV scan, and the results screen with recommended actions worked on Windows 11
ARM in a virtual machine using x64 emulation. The saved HTML, JSON, and SARIF
reports matched the scan results. This check covered OSV, not every integration
or native Intel/AMD hardware.

Up to five integrations are available after setup. The Cloudflare and
Anthropic workflows are disabled on Windows. Other tools may need their own
installation and provider sign-in.

OSV Scanner is bundled on all three platforms. Other tools require setup, and AI
tools require provider sign-in and consent. [Browse all 0.2.6 release assets](https://github.com/taejunoh/security-scan-hub/releases/tag/desktop-v0.2.6)
· [Verify ZIP checksums](https://github.com/taejunoh/security-scan-hub/releases/download/desktop-v0.2.6/sec-hub-desktop-0.2.6-SHA256SUMS.txt)

The earlier OSV-only [0.2.1 prerelease](https://github.com/taejunoh/security-scan-hub/releases/tag/desktop-v0.2.1) is still
available for users who need that version.

## Run your first scan with 0.2.6

1. To try the app without your own project, choose **Try an example**, then
   **Start example scan**. The bundled OSV Scanner checks a small included
   example; it does not run example code or check your own project.
2. To scan your own code, choose **Scan my app**, select **Choose folder**,
   and pick the folder containing your app's source and package files. Extract
   a source ZIP first. Choose **Start basic scan**.
3. When the scan finishes, review findings and **What to do next** in the
   report. Use **View previous results** to reopen saved reports later.

A completed scan with no findings means OSV Scanner found no known
vulnerabilities in the dependencies it checked. If the scan fails, check the
error message and try again after resolving it.

To add more tools to the same scan, follow
[Run a multi-tool scan](desktop/README.md#run-a-multi-tool-scan).
[See the full setup and scan guide](docs/GETTING-STARTED.md).

## How the desktop scan works

**Choose a folder → Read the package list → Look up known vulnerabilities →
Save the report**

Electron provides the desktop window. The app starts the
bundled Google OSV Scanner and saves its results for the app to display. You
can run a scan without installing Node.js or creating an OSV account.

OSV Scanner needs internet access and may send package names and versions to
its advisory and package metadata services. The results cover the supported
dependency files that OSV checked.

## For developers

- [Sample report from a multi-tool CLI scan](docs/sample-report.html)
- [Desktop build and packaging notes](desktop/README.md)
- [Release and verification history](docs/HISTORY.md)
