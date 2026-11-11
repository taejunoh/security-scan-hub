# Microsoft Store submission runbook

**Status on November 11, 2026.** Security Scan Hub 0.2.5
(MSIX identity version 1.2.5.0, Submission 2) is published in the Microsoft
Store. Submission 3 contains the validated 0.2.7 package and was submitted
for certification. Publishing is on hold until the maintainer selects
**Publish now** after certification.

The confirmed package identity is `AllinSimple.SecurityScanHub`, publisher
`CN=0498002F-4BC4-4404-B331-9629F74C3F46`, with publisher display name
**All in Simple** and app display name **Security Scan Hub**. Keep the current
published package available until Partner Center reports an outcome for the
submitted update.

## Store identity and signing

A Microsoft Store submission does not need an individually purchased public-trust certificate. Microsoft re-signs an MSIX after it passes Store certification. A self-signed certificate used by CI only tests installation on the disposable test runner. It is not a public publisher signature, and that CI package is not the Store release.

## Package and verify

The native x64 CI workflow installed the test MSIX, launched the app, ran
bundled OSV and a controlled PHP scan, and verified reports and recommendations.
The CI certificate and identity are for test use only. Separate Windows 11
ARM64 guest runs using x64 emulation completed OCR, PHP2Shell, SkillSpector,
and Codex Security individually; they were not one combined four-tool run.
See the [Windows 0.2.5 validation record](WINDOWS-0.2.5-VALIDATION.md) for
results and limits.

The **Desktop MSIX native Windows validation** workflow accepts the confirmed
package identity fields above. It builds a separate unsigned Store candidate
after the installed test package passes and checks that the app payload hashes
match between the two packages. App version 0.2.7 maps to MSIX identity
version 1.2.7.0. The submitted Store-identity candidate came from the [Windows x64
validation run](https://github.com/taejunoh/security-scan-hub/actions/runs/43114910833).
[Microsoft package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)

The app is a full-trust desktop application because it launches the packaged OSV executable and, when explicitly configured, other native scanner processes. The package manifest must declare the applicable full-trust capability. In certification notes, explain the user-initiated scan flow and that the app runs only the scanners the user selects. OSV reads dependency manifests and uses its upstream vulnerability lookup service. AI tools require per-run approval before code or related context can be sent to a configured provider. Scans save reports locally.

## Store listing draft

**Product name**

Security Scan Hub

**Short description**

Run security scanners for a project and review findings, scan coverage, reports, and evidence in one desktop app.

**Description**

Security Scan Hub brings software dependency checks, AI-assisted code review, and security skill scanning into one desktop workspace. Choose a project folder, select scanners that are installed and configured, and review their findings and run status together.

The app includes Google OSV Scanner for dependency vulnerability checks. Other integrations require their upstream tools and accounts where applicable. AI scans require your approval for each run. Some tools send project code or related context to their configured providers. Scanner capabilities vary by Windows version and configuration.

Security Scan Hub saves scan reports on your device. See the [Privacy notice](https://github.com/taejunoh/security-scan-hub/blob/main/docs/PRIVACY.md) before use.

**What's new in 0.2.6**

New first-scan guidance helps you select the folder that contains your app's
code. You can run a bundled example scan, review findings in the Security
Inbox, and reopen your saved scans.

**Category and age rating**

Choose the closest available developer tools or productivity category in Partner Center. Complete the current age-rating questionnaire based on the packaged app and its external scanner integrations.

**Required listing assets**

Capture Windows screenshots from the app being submitted. Include project selection, a completed OSV scan in the Security Inbox, and an opened finding with **What to do next**. The listing needs at least one desktop PNG at 1366 × 768 or larger, up to 50 MB. Use sample data and keep private project details out of the images. [Microsoft screenshot requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images)

## Certification notes draft

> Security Scan Hub runs software security scans when the user starts them. To test the included example, open the app, select **Try an example**, and then select **Start example scan**. The app uses the bundled OSV Scanner on a sample dependency lockfile. The **Security Inbox** opens when the scan completes and labels the report **Example scan results**. Open a finding to see the affected dependency and recommended action. The home screen's **Scan my app** flow explains how to select a separate project folder with a dependency manifest or lockfile.
>
> OSV Scanner may send package names and versions to OSV's public services for vulnerability lookups. Results are stored on the device and can be reopened with **View previous results**. The app uses the full-trust capability to launch the bundled scanner and other native scanners the user explicitly configures and selects.
>
> The app does not require an account to run the bundled OSV check. Optional integrations require their own tools and may require sign-in. AI scans are disabled until configured and require explicit per-run approval. The app does not automatically upload a project or scan report to a Security Scan Hub service. Please evaluate the Store-identity package provided in this submission.

Before submission, replace this note if the final UI, permissions, scanner behavior, or package changes. Provide any reviewer access or test instructions requested by Partner Center through its designated secure fields.

## Submission steps

1. Review the completed MSIX workflow evidence for installation, scans, reports, recommendations, and payload comparison.
2. Run Microsoft's current package checks and Windows App Certification Kit where required by Partner Center.
3. When **Start update** is available, review the carried-forward listing fields and enter the certification notes for the new version.
4. Confirm that the uploaded Store candidate is the validated package and review Partner Center validation messages before submitting for certification.
5. Check the certification result and record the actual publication outcome here and in the README.

## References

- [Create a Microsoft Store developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [Reserve the name for an MSIX app](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/reserve-your-apps-name)
- [View Store package identity](https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details)
- [Create an MSIX app submission](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission)
- [Microsoft Store code-signing guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Microsoft Store policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
- [MSIX desktop app packaging](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion)
