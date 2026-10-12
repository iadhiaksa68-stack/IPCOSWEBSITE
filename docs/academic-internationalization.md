# Academic stages and internationalization

Admin verifies the last completed stage in Master Data → Manage Stage, or within a request. Outline → Proposal seminar → Thesis defence applies to new registrations. Approval of documents does not imply exam completion. Historical exams can be recorded with a reason without recreating requests. Existing active requests can continue revisions.

An admin can correct an active Outline/Proposal/Pendadaran selection in the same request, subject to prerequisites and file count. Files and history are retained; the request returns to Pending for fresh review. Verify student identity, completed exam and destination documents before saving.

Internationalization → Import and Data Source accepts XLSX up to 2 MB. Cohort sheets with NIM, Nama and Keterangan are supported, including adjacent class I/J tables and optional Status. Preview does not save; confirmation imports the source. Manual edits survive reimport. Use Source Notes restores source values while retaining edit history.

Students receive aggregate cohort/class totals only. Names, NIM, activity notes and source links are restricted to admins. Blank notes mean not recorded. Each student counts once; source abbreviations and countries are not inferred.

Students from 2024 onward are included from the master roster, with blank activity notes. Add missing students through Master Data, then refresh Internationalization. Names and NIM must come from the institution; no placeholder student records are created.

New state is stored in Script Properties and included in private backups. Existing spreadsheet headers and login are preserved. Academic.gs and International.gs are local mirrors bundled inside Next.gs; do not create duplicate Apps Script files. Deploy Next.gs, getDataForSession from SessionData.gs, and the relevant Features.gs changes together before frontend deployment.

The release gate includes backend-academic-international.cjs and academic-international.cjs with synthetic data, plus all previous suites. Actual source workbooks and live-code backups must remain outside the public repository/static output.
