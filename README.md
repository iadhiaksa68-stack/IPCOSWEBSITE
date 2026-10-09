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

Fourteen browser suites verify transactions, regressions, workflow continuity, private document cleanup, service settings and academic preparation. API calls are intercepted with test fixtures; tests never write to the real academic database or use real credentials. External requests are blocked by the fixtures.

On macOS the tests use installed Google Chrome; on Linux they use the pinned bundled headless Chromium. For other environments set `IPCOS_TEST_BROWSER` to an installed Chrome/Chromium executable.

GitHub Actions runs fourteen browser suites, backend transaction/access/backup checks, structural document checks and eight release-gate checks for pushes and pull requests. Vercel verifies the successful workflow for the exact `VERCEL_GIT_COMMIT_SHA` through GitHub's public API before publishing. Failed, cancelled, missing or unverifiable checks block publication. No extra token is needed because this repository is public. Deploy through the connected Git repository; a manual deployment without a commit SHA is blocked.

Vercel installs only the pinned esbuild production dependency and no browser dependencies. The build combines the deferred scripts and styles in their original order, preserves global handler names, minifies the output, and emits content-hashed files. SOP and CSV scripts remain lazy. All browser suites run against this production output. Only allowlisted website assets enter `public/`; backend source, tests, dependencies, environment files and source maps are excluded.

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


## Document review, previews and archives (9 October 2026)

- Private Drive files use the authenticated `get_document` API. The old preview entry point resolves an accessible request instead of embedding Drive. PDF.js 6.4.299 is self-hosted and imported only when opening a PDF; document bytes are processed locally. Pages, zoom, a bounded canvas and download/open fallbacks work without a browser PDF plugin. Images use a local image element; Word and archives offer explicit downloads.
- Students can preview selected PDFs/images from the submission summary without uploading them. Closing, editing, changing a request or logging out revokes URLs and cancels PDF rendering. Late API/worker responses cannot revive a closed view.
- Admin saves per-document review results and notes on the existing request history. Notes are required for documents needing corrections; saving review results does not decide the request. The correction action selects known document types and includes file-specific reasons. Choosing approval while a file needs correction is prevented in the UI.
- Review updates use the original snapshot version and stable retry ID. Background refresh cannot silently overwrite a newer review. Explicit Reload Review recovers after a conflict; unsaved notes survive language switching.
- Admin archives only completed requests by submission dates in WIB, optionally by service. The UI shows an eligible count and asks for confirmation. Archives are reversible history events, never row/file deletion or changes to status/supervisor quota. Student history/journey remains visible; admin active queues omit archived requests. CSV All Requests intentionally still includes archives.
- SOP authoring shows missing English titles, introductions, bodies and link labels with links to the relevant input. Completion indicates coverage, not translation accuracy, and does not automatically translate admin-authored content.
- `get_review_capabilities` gates the new write controls. On the old backend these controls remain unavailable while existing transactions and previews continue to function. Publish the updated private `Next.gs` on the existing Apps Script deployment to activate them; no `Kode.gs` routing change is required because it already uses `NEXT_ACTIONS`.
- The release checks use renderable single/multi-page PDFs and inspect actual canvas pixels/text, not only successful blob creation. They also verify access, replay, conflicts, language, lifecycle cleanup and backend compatibility using simulated transactions.

## Review recovery and document tools (9 October 2026)

- Admin file notes and correction-action text are saved automatically in private sessionStorage. Recovery is offered explicitly after reload or reopening a request, for up to 24 hours during that tab session. Logout or another login clears drafts. Closing a tab requires browser session restoration; drafts are not cloud backups or available in a new device/tab. No automatic academic writes or decisions occur. Older request versions retain read-only draft text instead of overwriting current records. Confirmed review clears only the review draft; a separate action draft remains.
- PDF tools include page entry, rotation, fullscreen and bounded local text search. Advanced tools disclose to keep document content visible. Search finds matching pages with snippets, supports text PDFs (not OCR), and caps scanning at 300 pages or two million characters. Canvas resizing is debounced and avoids redundant redraws.
- Version comparison uses only historical/current links attached to an accessible request, through the existing session-authorized file API. Two selected versions render side by side on desktop and stack on phones. One failed file does not prevent viewing the other. Word/archive versions provide downloads. Switching requests, closing, logout and delayed responses clean up readers and object URLs.
- Decorative hidden cat/doodle elements, their timers and unused styles were removed. Missing template URLs show availability text rather than nonfunctional Download links. Default compression guidance stays on the student's device. Share metadata uses the current portal name/domain without an unrelated thumbnail URL.
- The thirteenth browser suite covers these flows with simulated APIs, actual PDF pixels/text, revision history, drafts, language and lifecycle cleanup. Existing role/backend gates stay in place. No backend deployment is required for these three frontend improvements.

## Audit and production optimization (9 October 2026)

- Five unreachable legacy modals and their handlers were removed. Existing review, supervisor assignment, correction, private preview and history flows continue through the case workspace. PDF.js character maps/fonts/decoders and their licenses are retained because they are loaded on demand for real documents.
- Production requests for local CSS/JavaScript fall from 23 to 2. Fingerprinted portal/SOP/CSV assets can cache immutably; HTML revalidates. Vercel adds MIME sniffing, referrer and framing protections. This CSP does not yet restrict scripts because inline handlers still exist.
- Empty/hash/unsafe template URLs show availability text. The academic countdown and its reminder use the nearest valid admin-edited calendar deadline at the end of that day in WIB, advance after expiry, and stop while logged out, hidden or offscreen. This is display/reminder behavior, not a new submission deadline rule.
- Repeated refresh clicks share one in-flight read for the same session. API deadlines cover response bodies as well as headers. Date filtering, waiting, timelines and notification ages consistently interpret timezone-less server timestamps as WIB.
- Large student/lecturer/history tables use one DOM commit per render. Master rendering preserves its input array. Checklist rendering indexes original content once instead of repeatedly parsing it for every item.
- Login makes background workspace controls inert, login errors announce through alert regions, and the WhatsApp widget uses a keyboard-accessible link.
- The fourteenth suite tests the emitted production files, edited/expired calendar boundaries, downloaded reminder dates, template availability, timezone behavior, duplicate reads, stalled response bodies, stable table ordering, output exclusion and session cleanup. Tests use synthetic accounts and intercepted APIs. No Apps Script deployment or academic data migration is required for this frontend release.
