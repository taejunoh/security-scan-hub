# Windows 0.2.5 validation status

**Status as of November 10, 2026.** This record covers app version 0.2.5 and
MSIX identity version 1.2.5.0. Results below distinguish completed checks from
work still in progress.

## Completed checks

| Check | Result | Coverage |
| --- | --- | --- |
| Full automated test suite | Passed: 619 passed, 11 skipped, 0 failed (630 total) | Final core suite for the 0.2.5 source. |
| Focused Node adapter tests | Passed: 24/24 | Subset of the 630-test core suite. |
| Local desktop tests | Passed: 53/53 | Separate desktop test suite. |
| Pinned-reader BOM regression | Passed | Separate Python preparation test. It checked the 156-file pinned archive byte-for-byte and confirmed the compatibility copy changes only `workbench_db.py` to accept a UTF-8 BOM. It also covers malformed JSON and unsafe preparation cases. |
| Windows x64 MSIX CI | Passed | The [workflow run](https://github.com/taejunoh/security-scan-hub/actions/runs/42894115122) completed successfully. It installed the app, ran bundled OSV and a controlled PHP scan, and verified reports and recommendations. Its desktop tests passed 40 and skipped 13. |
| Final MSIX candidate | Hash verified | Version 1.2.5.0; 185,962,514 bytes. SHA-256: `9c0f670360337f4eed9f06191a9fbdab4e2280118b733742b31002827494b937`. The packaged app payload SHA-256 is `44a0552ed2fb1de3be5166f0076bf067ae23a8296dac41634354f9ea92116109`. |

The adapter count is already included in the 630-test core total. The local
desktop suite and Windows CI results are separate platform checks.

## Windows guest runs and Store status

| Check | Status | Boundary |
| --- | --- | --- |
| OCR in the original Windows 11 ARM64 guest run (x64 emulation) | Complete | 0 findings in that run. |
| PHP2Shell in the original guest run | Complete | 1 heuristic result. |
| NVIDIA SkillSpector-only guest run | Complete | 2 synthetic pattern findings after the Windows-only timeout was raised to 30 seconds. Report schema and hash checks passed, and recommendations were reviewed in the GUI. |
| Codex Security 0.7.0-only guest run | Complete | Exit code 0 with 0 findings. The run sealed successfully; native findings and exported results were byte-identical by SHA-256. No BOM was present in the files from this live run. |
| Windows guest integration coverage | Complete across 3 runs | OCR and PHP2Shell completed in the original partial four-tool attempt; SkillSpector and Codex Security completed in separate runs. All four completed individually, but not together in one four-tool run. |
| Reports and SARIF | Passed | Hash checks passed for all 9 reports, and schema validation passed for all 3 SARIF files. |
| Microsoft Store update | Submitted, in pre-processing | Version 0.2.4 (identity version 1.2.4.0) remains published. Version 0.2.5 (identity version 1.2.5.0) awaits certification and a separate manual **Publish now** action. |

The guest integrations used controlled fixtures and synthetic patterns to
check tool execution and report handling; they are not a security audit of a
real user's repository. The PHP2Shell output is a heuristic. The live Codex
result had zero findings; that run result does not establish that the scanned
fixture is safe. It used an explicitly configured local compatibility plugin;
the upstream package was unchanged. BOM acceptance was verified separately by
the pinned-reader regression test, not by observing a BOM in the successful
live run.

The native x64 CI smoke covered package installation, OSV, and controlled PHP;
the four guest integrations completed across separate runs. This document
does not claim a single combined four-tool run. Update it after certification
and the manual publication action have actual outcomes. The 0.2.5 update is
not available in the Store until it is certified and published.
