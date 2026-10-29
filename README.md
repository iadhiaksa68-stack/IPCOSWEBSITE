# IPCOS Website

Static academic portal with the existing Google Apps Script backend. Login and the academic database schema are unchanged.

## Evaluation follow-ups (29 October 2026)

- Student: requests show how long they have waited against the admin target ("Sudah menunggu X hari · biasanya diproses dalam Y hari"); Home shows internship/thesis preparation until the first approval; before a first request, Academic Journey leads with open preparation and folds the empty stage map; one announcement appears once, in the banner (important ones emphasized), with no second modal; success messages are toasts only and sit at the bottom on phones; language and theme are icons in the top bar.
- Admin: Home shows received/completed today, 30-day average processing time, requests past target and supervisors near capacity; queue rows show request age, red past target; rows can be selected for bulk approval (only waiting requests that have files and need no supervisor, after an inline confirmation), bulk archive with a reason, or CSV export of the selection; revision instruction examples are editable in Master Data; approving a request with no files needs an extra confirmation; Service Health shows Script Properties usage.
- Backend: per-student data can move from Script Properties to the hidden `IPCOS_DataPribadi` sheet, and admin login locks after repeated failures. See backend/INTEGRATION.md.
- Download names use one ASCII form everywhere.

## Guidance and admin speed-ups (29 October 2026)

- Student: the Registration Center shows all five services as cards with their availability (available, in progress, or why it is closed) before one is chosen; every request shows a progress tracker (submitted → corrections requested → corrections sent → approved); the Home preparation card lists the next three checklist items to tick in place; students without any request see a dismissible three-step guide once.
- Admin: J/K move through the review queue, A approves, R requests corrections, ? shows the shortcuts; built-in and device-saved queue views apply filters in one click; supervisors are listed by remaining quota with the least-loaded one suggested; queue headers follow the selected language.

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

## Admin queue and document workspace (14 October 2026)

- The queue uses four compact status controls with counts reflecting the current search, service, date and overdue filters. Complete status selection, ordering and dates live in Advanced Filters. Primary status controls replace the redundant preset and status-chip rows. Filter preferences, pagination, CSV scope, archives and service health keep their existing behavior.
- Desktop queues use five aligned table columns with keyboard date sorting and a truthful sort state. Mobile queues place the student's name and ID before the service, status and review action; all four status labels remain visible at narrow widths.
- Admin case detail becomes a three-pane workspace: files, document preview, and review notes/actions. Metadata and history disclose separately. Students retain their current detail layout. PDF search, rotation, fullscreen, version comparison, authenticated downloads, review drafts and version checks use the existing modules.
- Mobile admin workspaces offer Documents and Review from the start. Selected panes remain stable while a private file is loading and after late responses. Opening a request action reveals its review fields; language changes retain text, caret, previews and pane scroll. A compact keyboard layout keeps identity, editable content and the action footer within a reduced visual viewport.
- The dedicated browser suite exercises real private PDF pixels/text, pending responses, combined filters, keyboard status/sort controls, four widths, both languages/themes, draft recovery and focus return. Academic writes are simulated; no backend or spreadsheet migration is needed.

## Student dashboard and request detail (14 October 2026)

- Student home presents one contextual next action, owned request counts, prioritized request cards with a short title preview, and academic shortcuts. Corrections are prioritized before owned drafts and other active requests; the existing draft and submission mechanisms remain in use.
- Student request detail leads with the actual request state and current stage, then organizes documents alongside instructions, request information and history. Saved file review notes appear beside the matching file URL/version, and students cannot edit admin reviews. The primary correction action remains in the existing reachable footer.
- Mobile document loading exposes Documents/Follow-up controls immediately. A delayed response cannot switch away from Follow-up or disturb its correction text. Opening an action reveals its editor, and language refresh retains notes, cursor, selected files and history disclosure states. Closing a case or changing accounts still releases private preview resources.
- The student UI suite covers both pages at four widths in two languages/themes, progress marker geometry, empty/completed states, request ownership, private PDF rendering, delayed responses and unsent correction retention. Existing transaction, keyboard, authorization and admin regression suites remain release requirements. No backend migration is required.

## Guided registration center (15 October 2026)

- Registration uses four named navigation steps: service, details, files, and final review. Details and required files remain in one short guided form after selecting a service. Navigation focuses the corresponding field; only the final confirmation sends an academic request.
- A contextual preparation rail shows the selected service and the existing live requirements. Supervisor change text fields belong to Details; its request letter belongs to Files. Review presents a separate summary with local file previews and a reachable confirmation action. Editing returns keyboard focus to the visible Details section.
- The original input nodes, File objects, field IDs, cloud draft fields, service restrictions and idempotent submission path remain in use. Text/files survive navigation, language changes and guide detours. Pending submissions expose disabled navigation and failed sends keep the review available for retry.
- Preflight now checks its session, service generation, exact text values and File identities before opening review. A delayed format check cannot open an outdated summary after text/file changes or a service round trip.
- The dedicated release/artifact suite covers five services, 176 screen/language/theme layouts, keyboard focus, document identity, contextual guides, inline validation, delayed preflight and acknowledged submission recovery. All academic API calls in tests are simulated; no backend migration is required.

## Student request history (15 October 2026)

- Status Pengajuanku offers four status controls with counts, bilingual service/ID/title search, and ordering by actual latest activity or submission date. Counts follow the search independently of the selected status. Desktop uses four aligned columns; narrower screens use one card per request with a single contextual detail, correction or result action.
- Filters stay within the current signed-in account and survive ordinary data refresh and language changes. Logout and account changes clear them. Opening a request explicitly from another portal entry point reveals it when an existing filter would hide it. Closing detail restores focus to its visible action, or search if the request has left the results.
- Refresh retains cached rows instead of replacing them with a loading skeleton. Identical responses keep the same buttons; changed rows recover focus. Search value and caret survive pending or failed reads. Whitespace-padded student IDs use consistent ownership checks across lists, detail, notifications and private document entry points. Detail excerpts preserve text separators.
- The dedicated source and production-artifact suite checks 48 populated/empty/no-result layouts, dates, filters, bilingual search, account isolation, keyboard focus and refresh recovery with synthetic API fixtures. No backend or spreadsheet migration is required.

## Focused academic journey (15 October 2026)

- Academic Journey leads with the current admin-verified academic stage and one contextual next action. Outline, proposal seminar and thesis defence use only the recorded academic level; approved request documents and student preparation never mark exams complete. The journal-based thesis service appears separately from the three-stage map.
- Internship and thesis preparation use compact disclosures with per-group counts and the existing editable checklists. Save status and retry remain visible while the disclosures are closed. Students reach their complete history through My Requests; admin keeps a contextual, read-only preparation view, expandable student request history and a return to the queue.
- Refresh and language changes retain disclosures and keyboard focus, including case actions inside admin history. Request selection uses the latest valid activity across the submission and log entries, with consistent whitespace-normalized student ownership. Pending admin journey reads cannot restore another student or a logged-out session.
- Academic snapshots now bind to the session epoch, role and student identity. Explicit cache cleanup clears academic status, drafts and the editor. An unavailable or invalid snapshot cannot retain another account's old stage or be presented as verified completion; unrecorded progress remains distinct from recorded level zero. Existing backend prerequisites and academic write paths remain in place.
- The dedicated source/artifact browser suite covers 64 screen/language/theme/state combinations, levels zero through three, unavailable and legacy backends, account isolation, actions, disclosures and delayed responses. Existing cloud preparation, bilingual guidance and admin stage-management suites remain release requirements. No backend or spreadsheet migration is needed.

## Templates and frequently asked questions (15 October 2026)

- Templates and FAQ share bilingual search, author-defined category groups, result counts and distinct empty/no-match states. Document cards display the published group, declared filename format when known, and an external Open Document action. Empty, fragment-only, malformed, relative and unsafe URLs cannot become fake download links; opaque document links retain an unknown-format label. Published content and its JSON schema remain unchanged. Default resources use existing items grouped by topic without adding official files or URLs.
- FAQ state uses stable content identities, including duplicate or non-Latin IDs. Open answers and keyboard focus survive language changes, refresh, filtering, and inserted/reordered entries. Unchanged content retains its existing nodes. Search caret and category selection survive ordinary refresh; logout and account changes clear controls, disclosure state and request metadata.
- File-field and final-review template links open the resource page with the selected service and document context. Related words rank existing titles without claiming that a match is an official required template; missing matches or unpublished links remain explicit. The existing guide return preserves the same form nodes, File objects, unsent details and review state. It reveals and focuses the correct field or review heading after workspace scroll restoration. Navigation cancellation and pending submission/preflight guards remain in force.
- Existing admin template/FAQ editors continue to publish through update_content. The dedicated source/artifact browser suite exercises 64 layout/state modes, URL handling, content escaping, bilingual search, category counts, identity/focus recovery, real guide detours from fields and review, editor access and logout races. Additional independent layout and interaction checks use synthetic data. No backend or spreadsheet migration is needed.
