# Desktop 0.2.7 validation

The 0.2.7 desktop payload was built from commit `87bcfe32c999c6d5757ff8ae9b7a638805c9eacc`. Subsequent commits used for the Windows MSIX and Intel verification runs changed only desktop CI workflows.

- **macOS Apple silicon:** the Developer ID-signed, Apple-notarized ZIP passed signature, stapled-ticket, and Gatekeeper checks. The extracted release app was opened on an Apple silicon Mac; its example OSV scan completed and displayed four findings. A local automated smoke attempt failed at the example step when its window was not focused; the manual run was performed with the window focused. The same source also passed [packaged smoke on a hosted Apple silicon Mac](https://github.com/taejunoh/security-scan-hub/actions/runs/43114528776).
- **macOS Intel:** the exact notarized ZIP uploaded to the draft release passed checksum, Gatekeeper, and packaged scan/report smoke on a [hosted Intel Mac](https://github.com/taejunoh/security-scan-hub/actions/runs/43115324142). It was not tested on a physical user's Intel Mac.
- **Windows x64:** the [portable ZIP build and packaged smoke](https://github.com/taejunoh/security-scan-hub/actions/runs/43114528776) passed on a hosted native Windows runner. A separate [MSIX run](https://github.com/taejunoh/security-scan-hub/actions/runs/43114910833) installed a temporarily signed test package and verified scans and reports; its Store-identity candidate has the same app payload. The portable ZIP remains unsigned, and the Store candidate was submitted for certification but is not yet published.
- **Tests:** the full local suite with the pinned Cloudflare source configured passed 630 tests, with 11 skipped. The desktop and dashboard focused suite passed 121 tests.

The Apple silicon and Windows manual/CI validations do not establish coverage for every optional upstream integration. See the [integration details](../README.md#seven-integrations) and previous [first-scan validation](FIRST-SCAN-VALIDATION.md).
