# Security Scan Hub privacy

**Status:** Draft for Microsoft Store review. Last reviewed for the 0.2.4 desktop source on November 9, 2026. Review this notice against the exact Store build before submission.

Security Scan Hub runs on your computer. It reads the project folder you select for the tools you choose, and saves scan reports in the app's local data folder. It does not send reports to a Security Scan Hub server.

## Data used by scans

- **Google OSV Scanner.** The bundled scanner reads supported dependency and lock files in the selected project. It may send package names, versions, and ecosystem information to the OSV vulnerability and package metadata services for lookups. This tool does not require an account.
- **Optional AI tools.** Before a run that includes an AI tool, the desktop app asks you to approve sending code and related context from the selected folder to the configured providers. Approval applies to that run. Each provider handles its own authentication, data handling, retention, and usage charges. Review the provider's terms and privacy notice before enabling its tool.
- **Other optional tools.** SkillSpector and configured scanners run on your computer when selected. SkillSpector's optional advisory lookups may use the network. PHP2Shell Checker sends a request to the HTTP(S) URL you enter. Use only a URL you are authorized to test. Provider authentication and any network activity of configured third-party tools are controlled by those tools.

The tools available on Windows differ from macOS. Check the app's setup and tool status before a scan.

## Local files

Scan output, including HTML, JSON, and SARIF reports, is saved locally. The Microsoft Store package keeps recent scans in `.security-scan-hub\scan-results` inside your Windows user folder. These reports remain after uninstall. To remove them, delete the corresponding result folders in File Explorer. The portable desktop app uses its app data folder, and the command-line workflow writes to the output directory you select. Keep reports private if they include project paths, dependency details, findings, or code evidence.

The app may read a scanner configuration file and authentication managed by the tools you set up. It does not ask you to send passwords or API keys to Security Scan Hub. Do not put secrets in scan URLs or configuration files.

## Diagnostics and third parties

The source code contains no Security Scan Hub account service or custom analytics endpoint. Network connections can still occur when a scanner performs a lookup, when an AI provider is used with your approval, when PHP2Shell checks the URL you supplied, or when you open a tool's setup page or an advisory link. The selected tool provider may process data under its own policies.

## Contact

For privacy questions, open a GitHub issue at [taejunoh/security-scan-hub](https://github.com/taejunoh/security-scan-hub/issues). GitHub issues are public. Keep private project data and reports out of the issue.

This notice describes the app behavior checked in the stated source version. It is not a statement about how third-party scanner or AI providers handle data. Review it again whenever app networking, scan inputs, or output locations change.
