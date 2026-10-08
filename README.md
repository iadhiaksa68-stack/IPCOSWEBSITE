# IPCOS Website

Static academic portal with the existing Google Apps Script backend. Login and the academic database schema are unchanged.

## Academic preparation

- Internship and thesis stages follow the content already editable by admin. Self-checks sync privately across devices through Script Properties, separately from admin decisions. Existing local checks migrate only when the cloud record does not exist.
- Thesis stage shortcuts open Outline, Proposal or Pendadaran, or continue an active request. Journal and supervisor-change requests remain available in Registration Center.
- Readiness uses the same fields, file formats and 10 MB limit as submission validation for all five services. No new academic prerequisite or internship submission service is imposed.

## Academic journey and document preflight

- Academic Journey groups Outline, Proposal, Pendadaran and the journal service, plus all historical requests and supervisor changes. Approval refers to documents, never an inferred exam result.
- Admin opens a student's journey from case detail and can read preparation; only the student owner can change it. Patches merge under a server lock, response revisions prevent stale reads from reversing newer saves, and failed saves remain unconfirmed with a retry.
- Preflight checks PDF headers/end markers, DOC signatures, Word ZIP container entries, ZIP directory structure and RAR/image signatures. It runs before initial review and correction uploads and repeats in the backend. It is not OCR, malware scanning, signature verification or a complete document parser. Duplicate content is a warning because a combined document may legitimately meet two requirements.
- No dependency is added for these features. The academic spreadsheet, session/login concept and endpoint are unchanged.

## Release checks

Requires Node.js 24. Run `npm ci --include=dev`, then `npm run build`.

Eleven browser suites verify transactions, regressions, workflow continuity, private document cleanup, service settings and academic preparation. API calls are intercepted with test fixtures; tests never write to the real academic database or use real credentials. External requests are blocked by the fixtures.

On macOS the tests use installed Google Chrome; on Linux they use the pinned bundled headless Chromium. For other environments set `IPCOS_TEST_BROWSER` to an installed Chrome/Chromium executable.

GitHub Actions runs eleven browser suites, backend transaction/access/backup checks, structural document checks and eight release-gate checks for pushes and pull requests. Vercel verifies the successful workflow for the exact `VERCEL_GIT_COMMIT_SHA` through GitHub's public API before publishing. Failed, cancelled, missing or unverifiable checks block publication. No extra token is needed because this repository is public. Deploy through the connected Git repository; a manual deployment without a commit SHA is blocked.

Vercel installs no browser dependencies. Build output contains only the twenty-four website assets listed in `scripts/assets.cjs`; backend source, tests, dependencies and environment files are excluded.

Tests cover the supported scenarios, not a guarantee against every possible bug. Backend releases must also run their own Apps Script checks because the backend is deployed separately.

## Drafts, corrections and admin tools (8 October 2026)

- Text form drafts sync across devices through private Script Properties for 14 days. Files remain on the selected device until submission. Concurrent edits require an explicit choice; failed acknowledgements retry the same save ID.
- Requested field corrections update the same request with a server version check and before/after history. Required document corrections still require their files. Supervisor changes remain proposals for admin.
- SOP and CSV modules load on demand. Contextual guide links retain the current form and selected files.
- Admin can sort by longest wait or overdue target, filter by inclusive Jakarta dates, and export all matching rows across pages or explicitly all requests.
- Calendar downloads provide H-3/H-1 alarms for the current service deadline at 23:59 WIB; a changed deadline requires importing a new reminder.
- Authenticated issue reports store only aggregate allowlisted operation, role, code, day, count and last seen for seven days. Admin loads the summary manually. Tokens authenticate the report but are never stored in telemetry.
- System headings/control labels use consistent capitalization in Indonesian and English. Names, authored SOP content, submitted titles, filenames and backend enums retain their original values.

The new module and the small doPost routing addition must be published in Apps Script before the frontend release. See backend/INTEGRATION.md.

## UI clarity refinements

The admin queue keeps search/status and result chips ahead of the table; advanced filters and reporting tools disclose separately. Mobile SOP navigation offers all three guides. Confirmed submissions retain a private in-session receipt card; logout clears it. Display service labels share one glossary, document labels keep canonical keys, and displayed timestamps use Asia/Jakarta (WIB). No backend or spreadsheet migration is needed.
