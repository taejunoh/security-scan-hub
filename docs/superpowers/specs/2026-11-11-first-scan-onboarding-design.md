# First scan without developer knowledge

User-approved scope: explain what Security Scan Hub checks, guide folder selection,
provide an example experience, simplify first use, and unify visible application branding.

## Experience

The desktop first screen states that this app checks source code of websites/apps.
It distinguishes code scanning from whole-computer antivirus and URL-only scanning.
Two clear paths are available: scan my app, or try an example. A small link opens saved
results. Debug timestamps, tool inventory, comparisons, and the preloaded synthetic
report are not the first-use screen.

Own-code flow explains where a downloaded/exported code folder comes from, including
unzipping exports, with a concrete package-lock.json example. Native folder selection
returns only a safe folder label and bounded filename-based guidance. Not detecting a
known file must not claim the folder is safe or invalidate advanced scanner use.
A default OSV scan requires no tool selection; advanced integrations remain available.

The example path selects a private shipped lockfile and runs real bundled OSV after
an explicit scan action. It never executes example code or installs dependencies,
uses no AI/provider login, and clearly labels the result as an example. Scanner network
usage is explained in plain terms. Failure offers retry or the own-code route and does
not display a fabricated success. Returning to own-code selection must be straightforward.

Both paths show progress, cancellation, a comprehensible result, and the next action.
All new copy is available in English and Korean. Keyboard navigation and narrow screens
are required. Browser-only report viewers keep their existing behavior.

## Host boundary

`chooseDemo()` is a zero-argument gesture-protected native IPC. State adds
`projectKind: null | 'folder' | 'demo'` and `projectGuidance: null | {status:
'recognized'|'not-detected'|'limited', examples:string[]}`. Example scans use only the
trusted bundled OSV regardless of optional user configuration. Example provenance
survives saving/opening a report. Folder inspection is bounded, read-only, and does
not traverse symlinks or disclose file contents. Existing identity/ACL/IPC protections
remain in force.

## Branding

Finder shows Security Scan Hub.app with a custom navy/cream icon. Keep stable bundle
and data identities so updates retain settings/results. Supply corresponding Windows
runtime icon and Store tile assets. Preserve pinned upstream Windows PE bytes and
legacy published download names; no publishing or signing-account changes this task.

## Acceptance

Verify own-code selection, wrong/unknown folder guidance, example scan through real
OSV to clearly labeled results, retry/cancel paths, advanced tools, saved results,
English/Korean, keyboard use, wide/narrow layouts, and branded Mac bundle/icon.
Automated checks establish behavior; they do not establish that an uncoached human
usability test passed. Record actual platform and verification limits.
