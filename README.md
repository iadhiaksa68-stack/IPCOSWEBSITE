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

Seventeen browser suites verify transactions, regressions, workflow continuity, private document cleanup, service settings, academic preparation, modal accessibility and announcement readability. API calls are intercepted with test fixtures; tests never write to the real academic database or use real credentials. External requests are blocked by the fixtures.

On macOS the tests use installed Google Chrome; on Linux they use the pinned bundled headless Chromium. For other environments set `IPCOS_TEST_BROWSER` to an installed Chrome/Chromium executable.

GitHub Actions runs seventeen source browser suites, seven production-artifact browser suites, backend transaction/access/backup checks, structural document checks and release-gate checks for pushes and pull requests. Vercel verifies the successful workflow for the exact `VERCEL_GIT_COMMIT_SHA` through GitHub's public API before publishing. Failed, cancelled, missing or unverifiable checks block publication. No extra token is needed because this repository is public. Deploy through the connected Git repository; a manual deployment without a commit SHA is blocked.

Vercel installs no browser dependencies. Build output contains only the explicitly allowed website assets listed in `scripts/assets.cjs`; backend source, tests, dependencies and environment files are excluded.

Tests cover the supported scenarios, not a guarantee against every possible bug. Backend releases must also run their own Apps Script checks because the backend is deployed separately.

## Full portal audit (13 October 2026)

- File drops and removal run the same validation, document preflight and draft events as the file picker. Single-file fields accept the first dropped file; multi-file corrections retain all selected files.
- Submitted titles, supervisor names and reasons preserve HTML characters as literal text. Admin passwords retain their exact input. Relative times, queue ordering and date filters consistently interpret timestamps in WIB.
- Search trims surrounding spaces and renders native buttons. All portal overlays trap keyboard focus, make background controls inert, close only their top layer with Escape and restore focus to their opening control. Nested native previews retain precedence. Search, quota and preview controls have associated names; contact widgets use keyboard-accessible links.
- Academic request-type correction acquires its busy lock before asynchronous version lookup. Repeated clicks and a session change during lookup cannot submit another mutation.
- Graduation clearance countdowns and reminders derive from the existing admin-editable calendar and end at 23:59:59 WIB. The next period is selected automatically; missing future dates disable reminders.
- Production combines the ordered global scripts and styles into two minified assets with content hashes. Global names remain intact for inline handlers. SOP, CSV and internationalization modules remain lazy and receive content hashes; PDF assets retain their existing paths. Browser suites also exercise the actual built output.
- The public portal sends anti-framing, MIME, referrer and limited CSP headers. Hashed assets cache immutably; HTML revalidates so new releases pick up new asset URLs.
- These changes require no backend deployment or spreadsheet migration. Live academic mutations are not part of the automated checks; backend integration tests use synthetic Apps Script fixtures.

## Request clarity and announcements (13 October 2026)

- Student and admin request cards show a status and one next-step instruction. Timing disclosures, repeated internal targets and duplicate owner labels are removed from home, queues, history and case detail. Internal admin waiting/overdue filters remain available and interpret timestamps in WIB.
- Announcement composers and student announcement surfaces use readable light/dark colors and 44px controls. Submitting via Enter is supported. Pending writes disable both submit buttons; failure retains the draft, confirmed sends clear only the submitted draft, and responses from older sessions cannot reset current controls or text.
- Announcement dismissal is private to each account. Background sync retains the current important-announcement checkbox; backdrop dismissal is remembered. Dismissed banners stay hidden until a new announcement arrives.
- Returning from a guide preserves the live registration review and selected files. Notification and search navigation respect a declined leave-form confirmation. Reopening search cancels the previous close animation; search requires an authenticated session.
- A SOP script that loads without installing its implementation now fails visibly with a working retry rather than recursively reopening its placeholder. Concurrent opens share one script attempt; stale session responses cannot overwrite current guidance.
- Redundant dashboard workspace labels and large decorative announcement symbols are removed. Academic transactions, source content and backend schema are unchanged.

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

## Admin comment conflict fix (10 October 2026)

- The session response emits reviewVersion from the raw request before extracting the supervisor and formatting detail. Per-file saves and archives use this token, and confirmed saves update it for the next edit. Genuine concurrent changes still conflict; private recovery drafts include the server version.
- backend/SessionData.gs mirrors only the existing getDataForSession function in Kode.gs. Replace that function in place; do not add another same-named function or change spreadsheet rows/columns. Publish the existing Apps Script deployment before the frontend.
- The fourteenth browser suite uses the actual response function and transaction backend to verify a Resubmitted legacy record with a supervisor suffix: the admin file note saves, the correction instruction sends once, and the student receives both with read-only review controls.

## Form and review polish (12 October 2026)

- Existing pages, navigation and transaction flow are retained. Text fields show the existing 500/2,000-character limits without truncating recovered drafts; corrected fields clear their stale errors, and required semantics follow the selected service.
- Login role selection and validation feedback are accessible; translated error messages retain their source and follow language changes. The session/login scheme is unchanged.
- Review textareas retain focus and selection across language changes. Missing revision notes have associated field errors that persist when translating and clear when corrected. Approval buttons describe request approval rather than exam completion.
- Restoring a correction-action draft into an already open panel retains the existing action footer. Review/correction checkbox labels offer 44px targets, and service input spacing leaves more room on narrow phones. Dark success text has readable contrast; case notifications stay inline and survive language changes without covering action buttons.
- Regression scenarios cover input recovery, limits, active requirements, translated approval labels, missing review notes, caret preservation and footer restoration. All use synthetic API fixtures. No backend/schema changes or actual academic writes.

## Small workflow improvements (14 October 2026)

- The student home button follows the next useful action: continue a correction, resume an owned draft, view an active request, or start a new request. Corrections open the existing request's reply form; late cloud draft recovery refreshes the same button.
- Returning to the same service from its stage guide preserves the submission summary and selected files, and focuses the summary or first missing requirement. Changing service still confirms unsent input.
- Repeated clicks on the same private file preview share one pending request. The existing button exposes its busy state and becomes available again after success or failure; downloads and stale-session protection remain independent.
- Closing admin case detail restores focus to the current matching queue row after background refresh. If the row has left the active filter, focus returns to queue search. Home instructions use a short review count.
- Regression checks exercise both roles, delayed responses, keyboard focus, retained summaries/files, draft ownership and language preferences with synthetic data. No backend deployment is required.
