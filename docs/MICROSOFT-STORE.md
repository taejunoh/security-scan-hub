# Microsoft Store submission runbook

**Status: preparation only.** The app name, Store publisher identity, and active Partner Center developer account still need to be confirmed. Do not submit a package with a test identity.

## Before creating the Store package

1. Sign in to the [Microsoft Store Developer Portal](https://storedeveloper.microsoft.com/) with the Microsoft account that will own the listing. Complete Partner Center registration and account verification.
2. Create an MSIX app product and reserve **Security Scan Hub** if available. Partner Center assigns the package identity. Copy the exact package `Name`, `Publisher`, and display name from **Product identity**.
3. Confirm the listing owner and legal publisher name. The publisher value in `AppxManifest.xml` must match Partner Center exactly. Do not guess it from the Microsoft account email.
4. Confirm listing requirements and target Windows versions in Partner Center. Prepare the final package identity and matching version before the native Windows release workflow is dispatched.

A Microsoft Store submission does not need an individually purchased public-trust certificate. Microsoft re-signs an MSIX after it passes Store certification. A self-signed certificate used by CI only tests installation on the disposable test runner. It is not a public publisher signature, and that CI package is not the Store release.

## Package and verify

The maintainer workflow is intended to build the existing Windows x64 desktop payload into an MSIX, install it on a native Windows runner, launch the installed app, run the bundled OSV scan against a controlled fixture, check that the report and recommended action are visible, and preserve the test evidence. The CI certificate and identity are for test use only.

The **Desktop MSIX native Windows validation** workflow accepts the reserved package name, publisher distinguished name, publisher display name, and app display name. It builds a separate unsigned Store candidate after the installed test package passes. The workflow checks that the app payload hashes match between the two packages. For desktop app 0.2.4, the MSIX identity version is 1.2.4.0 to meet Store versioning requirements. Submit the Store candidate only. [Microsoft package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)

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

1. Confirm the exact Store package identity and publisher in Partner Center.
2. Run the MSIX workflow on Windows with the Store identity fields and review its installation, scan, report, recommendation, and payload comparison evidence.
3. Run Microsoft's current package checks and Windows App Certification Kit where required by Partner Center.
4. Create the submission and complete pricing, markets, category, age rating, privacy URL, screenshots, description, and other required listing fields.
5. Upload the package in the format requested by Partner Center. Inspect validation messages before submission.
6. Submit for certification. Update this runbook and README only after Partner Center reports the actual outcome.

## References

- [Create a Microsoft Store developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [Reserve the name for an MSIX app](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/reserve-your-apps-name)
- [View Store package identity](https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details)
- [Create an MSIX app submission](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission)
- [Microsoft Store code-signing guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Microsoft Store policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
- [MSIX desktop app packaging](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion)
