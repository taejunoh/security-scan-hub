# Microsoft Store submission runbook

**Status: update draft in progress.** Security Scan Hub 0.2.4 (MSIX identity
version 1.2.4.0) is published in the Microsoft Store. The next update, app
version 0.2.5 / identity version 1.2.5.0, is Partner Center Submission 2,
draft ID `1152921505702369546`; it has not been submitted for certification.

The confirmed package identity is `AllinSimple.SecurityScanHub`, publisher
`CN=0498002F-4BC4-4404-B331-9629F74C3F46`, with publisher display name
**All in Simple** and app display name **Security Scan Hub**. Keep the current
published package available until Partner Center reports an outcome for the
draft update.

## Store identity and signing

A Microsoft Store submission does not need an individually purchased public-trust certificate. Microsoft re-signs an MSIX after it passes Store certification. A self-signed certificate used by CI only tests installation on the disposable test runner. It is not a public publisher signature, and that CI package is not the Store release.

## Package and verify

The maintainer workflow builds the existing Windows x64 desktop payload into an MSIX, installs it on a native Windows runner, launches the installed app, runs the bundled OSV scan against a controlled fixture, checks that the report and recommended action are visible, and preserves the test evidence. The CI certificate and identity are for test use only.

The **Desktop MSIX native Windows validation** workflow accepts the confirmed
package identity fields above. It builds a separate unsigned Store candidate
after the installed test package passes and checks that the app payload hashes
match between the two packages. For this update, app version 0.2.5 uses MSIX
identity version 1.2.5.0 to meet Store versioning requirements. Submit the
Store candidate only. [Microsoft package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)

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

**Category and age rating**

Choose the closest available developer tools or productivity category in Partner Center. Complete the current age-rating questionnaire based on the packaged app and its external scanner integrations.

**Required listing assets**

Capture Windows screenshots from the app being submitted. Include project selection, a completed OSV scan in the Security Inbox, and an opened finding with **What to do next**. The listing needs at least one desktop PNG at 1366 × 768 or larger, up to 50 MB. Use sample data and keep private project details out of the images. [Microsoft screenshot requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images)

## Certification notes draft

> Security Scan Hub is a local desktop workbench for user-initiated software security scans. To exercise the basic scan, launch the app, open **Project security scan**, choose a test project with a package lockfile, select **OSV Scanner**, and click **Start scan**. The app runs the bundled OSV Scanner against the selected files. It may make vulnerability lookup requests to OSV's public services. When complete, open the Security Inbox. If OSV reports findings, open a finding to inspect its evidence and recommended action. Results are stored on the device.
>
> The app does not require an account to run the bundled OSV check. Optional integrations require their own tools and may require sign-in. AI scans are disabled until configured and require explicit per-run approval. The app does not automatically upload a project or scan report to a Security Scan Hub service. Please evaluate the Store-identity package provided in this submission.

Before submission, replace this note if the final UI, permissions, scanner behavior, or package changes. Provide any reviewer access or test instructions requested by Partner Center through its designated secure fields.

## Submission steps

1. Run the MSIX workflow on Windows with the confirmed identity and review its installation, scan, report, recommendation, and payload comparison evidence.
2. Run Microsoft's current package checks and Windows App Certification Kit where required by Partner Center.
3. Complete or verify pricing, markets, category, age rating, privacy URL, screenshots, description, and other required listing fields in Submission 2.
4. Upload the 1.2.5.0 Store candidate. Inspect Partner Center validation messages before submitting.
5. Submit the draft for certification only after validation and evidence review. Record the actual Partner Center outcome here and in the README; until then, 0.2.4 remains the published version.

## References

- [Create a Microsoft Store developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [Reserve the name for an MSIX app](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/reserve-your-apps-name)
- [View Store package identity](https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details)
- [Create an MSIX app submission](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission)
- [Microsoft Store code-signing guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Microsoft Store policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
- [MSIX desktop app packaging](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion)
