# IPCOS Website

Static academic portal with the existing Google Apps Script backend. Login and the academic database schema are unchanged.

## Academic preparation

- Internship and thesis stages follow the content already editable by admin. Self-checks are stored on the student's device, separately from admin decisions.
- Thesis stage shortcuts open Outline, Proposal or Pendadaran, or continue an active request. Journal and supervisor-change requests remain available in Registration Center.
- Readiness uses the same fields, file formats and 10 MB limit as submission validation for all five services. No new academic prerequisite or internship submission service is imposed.

## Release checks

Requires Node.js 24. Run `npm ci --include=dev`, then `npm run build`.

Six browser suites verify transactions, regressions, workflow continuity, private document cleanup, service settings and academic preparation. API calls are intercepted with test fixtures; tests never write to the real academic database or use real credentials. External requests are blocked by the fixtures.

On macOS the tests use installed Google Chrome; on Linux they use the pinned bundled headless Chromium. For other environments set `IPCOS_TEST_BROWSER` to an installed Chrome/Chromium executable.

GitHub Actions runs all six browser suites and eight release-gate checks for pushes and pull requests. Vercel verifies the successful workflow for the exact `VERCEL_GIT_COMMIT_SHA` through GitHub's public API before publishing. Failed, cancelled, missing or unverifiable checks block publication. No extra token is needed because this repository is public. Deploy through the connected Git repository; a manual deployment without a commit SHA is blocked.

Vercel installs no browser dependencies. Build output contains only the nine website assets listed in `scripts/assets.cjs`; backend source, tests, dependencies and environment files are excluded.

Tests cover the supported scenarios, not a guarantee against every possible bug. Backend releases must also run their own Apps Script checks because the backend is deployed separately.
