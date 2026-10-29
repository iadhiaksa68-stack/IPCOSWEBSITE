const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, reportFailure} = require('./browser.cjs');
const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const errors = [], calls = [];
const pass = message => console.log('PASS ' + message);
const day = n => new Date(Date.now() - n * 86400000).toISOString();
const link = id => `<a href="https://drive.google.com/file/d/${id}/view">Berkas ${id}</a>`;
const accepted = (start, end) => JSON.stringify([{role:'mhs',sender:'Uji',time:start,message:'Pendaftaran'},{role:'admin',sender:'Admin',time:end,message:'Disetujui',status:'Accepted'}]);
let records, contents, announcements;
function reset() {
    records = [
        {id:'OLD-PROP', date:day(9), nim:'111', nama:'Rina Lama', jenis:'Proposal', detail:'<b>Judul:</b> A', link:link('p1'), status:'Pending', note:'[]'},
        {id:'NEW-JOURNAL', date:day(0), nim:'222', nama:'Budi Baru', jenis:'Skripsi Jurnal', detail:'<b>Judul:</b> B', link:link('j1')+'<br>'+link('j2'), status:'Pending', note:'[]'},
        {id:'OUTLINE', date:day(1), nim:'333', nama:'Citra Outline', jenis:'Outline', detail:'<b>Judul:</b> C', link:link('o1')+'<br>'+link('o2'), status:'Pending', note:'[]'},
        {id:'NO-FILES', date:day(2), nim:'444', nama:'Dewi Kosong', jenis:'Proposal', detail:'<b>Judul:</b> D', link:'', status:'Pending', note:'[]'},
        {id:'DONE-TODAY', date:day(4), nim:'555', nama:'Eko Selesai', jenis:'Pendadaran', detail:'<b>Judul:</b> E', link:link('d1'), status:'Accepted', note:accepted(day(4), day(0))},
        {id:'MINE', date:day(5), nim:'A', nama:'Mahasiswa Uji', jenis:'Proposal', detail:'<b>Judul:</b> F', link:link('m1'), status:'Pending', note:'[]'}
    ];
    contents = []; announcements = [{Id:'ann-1', Tipe:'important', Pesan:'Batas unggah proposal Jumat.'}];
}
async function mock(context) {
    await context.route('**/*', async route => {
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON(); calls.push(data); let result;
            if (data.action === 'admin_login') result = {status:'success', token:'admin'};
            else if (data.action === 'student_login') result = {status:'success', token:'student-' + data.nim, nama:data.nim === 'A' ? 'Mahasiswa Uji' : 'Mahasiswa Baru'};
            else if (data.action === 'get_data') {
                const student = String(data.token).startsWith('student-'), nim = String(data.token).slice(8);
                result = {status:'success', registrations:structuredClone(student ? records.filter(r => r.nim === nim) : records), students:[], announcements:structuredClone(announcements), contents:structuredClone(contents),
                    dosens:[{Nama:'Dr. Penuh, M.Si', Terpakai:5, Maksimal:5}, {Nama:'Dr. Hampir, M.Si', Terpakai:4, Maksimal:5}, {Nama:'Dr. Longgar, M.Si', Terpakai:0, Maksimal:5}],
                    services:['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'].map(type => ({type, enabled:true, open:'', close:'', adminDays:3, studentDays:7}))};
            } else if (data.action === 'update') {
                const item = records.find(r => r.id === data.id);
                if (!item || !['Pending','Resubmitted'].includes(item.status)) result = {status:'error', message:'Status telah berubah.'};
                else { item.status = data.status; item.note = JSON.stringify([...JSON.parse(item.note || '[]'), {role:'admin', sender:'Admin', time:new Date().toISOString(), message:data.noteText, status:data.status}]); result = {status:'success'}; }
            } else if (data.action === 'archive_request') {
                const item = records.find(r => r.id === data.id);
                item.note = JSON.stringify([...JSON.parse(item.note || '[]'), {kind:'archive', archived:true, reason:data.reason, role:'system', time:new Date().toISOString(), message:'Pengajuan dipindahkan ke arsip.'}]);
                result = {status:'success', note:item.note};
            } else if (data.action === 'update_content') { contents = contents.filter(c => c.Tipe !== data.type).concat({Tipe:data.type, DataJSON:data.content}); result = {status:'success'}; }
            else if (data.action === 'get_journey') result = {status:'success', journey:{checks:{}, revision:1}};
            else if (['get_document_review'].includes(data.action)) result = {status:'success', version:'', reviews:[], archived:false};
            else if (data.action === 'logout') result = {status:'success'};
            else if (await require('./next-mock.cjs')(route, data)) return;
            else throw Error('Unexpected upgrades fixture action ' + data.action);
            return route.fulfill({contentType:'application/json', body:JSON.stringify(result)});
        }
        if (url.startsWith(origin)) return route.continue();
        if (url.includes('chart.js')) return route.fulfill({contentType:'text/javascript', body:'window.Chart=class{static defaults={font:{}};destroy(){};constructor(){}};'});
        return route.abort();
    });
}
async function noOverflow(page, label) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, label + ' has no horizontal scroll'); }

(async () => {
    reset();
    const browser = await chromium.launch();
    const context = await browser.newContext({viewport:{width:1365, height:900}, reducedMotion:'reduce', acceptDownloads:true});
    await mock(context);

    // ---------- Admin ----------
    const admin = await context.newPage();
    admin.on('pageerror', error => errors.push(error.message)); admin.on('dialog', dialog => dialog.accept());
    await admin.goto(origin); await admin.click('#tab-admin');
    await admin.fill('#input-admin-user', 'fixture'); await admin.fill('#input-admin-pass', 'fixture'); await admin.locator('#input-admin-pass').press('Enter');
    await admin.waitForSelector('#welcome-modal', {state:'hidden'});
    await admin.waitForFunction(() => syncPhase === 'success' && window.IPCOSReviewTools.supported() === true);

    await admin.waitForSelector('#admin-today .admin-today-tile');
    const tiles = await admin.locator('#admin-today .admin-today-tile strong').allTextContents();
    assert.equal(tiles.length, 5);
    assert.equal(tiles[0], '1', 'one request received today');
    assert.equal(tiles[1], '1', 'one request completed today');
    assert.match(tiles[2], /^4(\.0)? hari$/, 'average processing over 30 days');
    assert.equal(tiles[3], '2', 'the 9- and 5-day-old requests are past the 3-day target');
    assert.equal(tiles[4], '2', 'full and nearly full supervisors are critical');
    assert.match(await admin.locator('#admin-home-subtitle').textContent(), /5 pengajuan menunggu tinjauan · 2 lewat target/);
    assert.equal(await admin.locator('#dashboard .page-intro p.student-only').isVisible(), false, 'student subtitle is hidden for admin');
    assert.equal(await admin.locator('#dashboard .operation-feedback:visible').count(), 0, 'login success is not pinned under Home');
    pass('Admin home shows today, completed, average time, overdue and critical supervisor counts with an admin subtitle');

    await admin.locator('[data-nav-target="admin-data"]').click();
    await admin.evaluate(() => setAdminQueueFilter('ALL'));
    const age = admin.locator('#table-admin-reg tr[data-queue-case="OLD-PROP"] .request-wait');
    assert.match(await age.textContent(), /9 hari · lewat target 3 hari/);
    assert.equal(await age.evaluate(node => node.classList.contains('overdue')), true);
    assert.match(await admin.locator('#table-admin-reg tr[data-queue-case="NEW-JOURNAL"] .request-wait').textContent(), /Hari ini/);
    assert.equal(await admin.locator('#admin-table-main').evaluate(table => { const wrap = table.closest('.responsive-table-wrapper'); return wrap.scrollWidth <= wrap.clientWidth + 2; }), true, 'selection column does not push the table sideways');
    pass('Queue rows show how long each request has waited, marked red past target');

    for (const id of ['OLD-PROP', 'NEW-JOURNAL', 'OUTLINE', 'NO-FILES']) await admin.locator(`#table-admin-reg input[data-bulk-id="${id}"]`).check();
    await admin.waitForSelector('#bulk-actions:not([hidden])');
    assert.match(await admin.locator('#bulk-actions').textContent(), /4 dipilih/);
    assert.match(await admin.locator('[data-bulk="approve"]').textContent(), /\(2\)/, 'Outline and no-file requests are excluded from bulk approval');
    const download = admin.waitForEvent('download');
    await admin.locator('[data-bulk="export"]').click();
    const csv = fs.readFileSync(await (await download).path(), 'utf8');
    assert.equal(csv.trim().split('\r\n').length, 5, 'CSV holds the header and the four selected requests');
    await admin.locator('[data-bulk="approve"]').click();
    await admin.locator('[data-bulk="approve-confirm"]').click();
    await admin.waitForFunction(() => /2 pengajuan disetujui/.test(document.getElementById('bulk-actions')?.textContent || ''));
    assert.deepEqual(calls.filter(c => c.action === 'update').map(c => [c.id, c.status]).sort(), [['NEW-JOURNAL','Accepted'], ['OLD-PROP','Accepted']]);
    assert.equal(records.find(r => r.id === 'OUTLINE').status, 'Pending');
    assert.match(await admin.locator('#bulk-actions').textContent(), /2 dipilih/, 'ineligible requests stay selected for manual review');
    await admin.locator('[data-bulk="clear"]').click();
    pass('Bulk select exports exactly the selection and approves only eligible requests after an inline confirmation');

    await admin.evaluate(() => setAdminQueueFilter('ALL'));
    for (const id of ['OLD-PROP', 'NEW-JOURNAL']) await admin.locator(`#table-admin-reg input[data-bulk-id="${id}"]`).check();
    await admin.locator('[data-bulk="archive"]').click();
    await admin.fill('#bulk-archive-reason', 'Periode ganjil selesai');
    await admin.locator('[data-bulk="archive-confirm"]').click();
    await admin.waitForFunction(() => /2 pengajuan diarsipkan/.test(document.getElementById('bulk-actions')?.textContent || ''));
    assert.deepEqual(calls.filter(c => c.action === 'archive_request').map(c => c.reason), ['Periode ganjil selesai', 'Periode ganjil selesai']);
    assert.equal(await admin.locator('#table-admin-reg tr[data-queue-case="OLD-PROP"]').count(), 0, 'archived requests leave the queue');
    pass('Bulk archive asks for a reason and removes archived requests from the queue');

    await admin.evaluate(() => switchTab(null, 'admin-master'));
    await admin.locator('#revision-template-management > summary').click();
    await admin.waitForSelector('#rt-label-0');
    assert.equal(await admin.locator('#revision-template-editor .revision-template-row').count(), 4, 'editor starts from the four built-in examples');
    await admin.locator('[data-rt-remove="3"]').click();
    await admin.locator('[data-rt-add]').click();
    await admin.fill('#rt-label-3', 'Tanda tangan dosen'); await admin.fill('#rt-text-3', 'Lengkapi tanda tangan dosen pembimbing pada lembar pengesahan.');
    await admin.locator('[data-rt-save]').click();
    await admin.waitForFunction(() => /Template tersimpan/.test(document.getElementById('revision-template-editor').textContent));
    assert.deepEqual(JSON.parse(contents.find(c => c.Tipe === 'revision_templates').DataJSON).map(item => item.label).at(-1), 'Tanda tangan dosen');
    await admin.evaluate(() => { switchTab(null, 'admin-data'); setAdminQueueFilter('ALL'); });
    await admin.locator('#table-admin-reg [data-case-id="NO-FILES"]').click();
    await admin.evaluate(() => caseDetailAction('revision'));
    const options = await admin.locator('#revision-template option').allTextContents();
    assert(options.includes('Tanda tangan dosen') && !options.includes('Isian perlu disesuaikan'), 'saved templates replace the built-in list');
    await admin.selectOption('#revision-template', {label:'Tanda tangan dosen'});
    assert.match(await admin.inputValue('#case-revision-note'), /lembar pengesahan/);
    await admin.evaluate(() => { document.getElementById('case-action-panel').dataset.dirty = 'false'; cancelCaseAction(); });
    pass('Admin edits revision templates in Master Data and they appear when requesting corrections');

    await admin.evaluate(() => caseDetailAction('accept'));
    assert.equal(await admin.locator('#case-accept-no-files').count(), 1);
    await admin.locator('#btn-case-submit').click();
    assert.match(await admin.locator('#case-action-feedback').textContent(), /tanpa berkas perlu konfirmasi/);
    assert.equal(calls.filter(c => c.action === 'update' && c.id === 'NO-FILES').length, 0, 'nothing is sent without the extra confirmation');
    await admin.evaluate(() => { document.getElementById('case-action-panel').dataset.dirty = 'false'; cancelCaseAction(); closeModal('modal-case-detail', true); });
    pass('Approving a request without any files needs an explicit extra confirmation');

    // ---------- Student with a request ----------
    const student = await context.newPage();
    student.on('pageerror', error => errors.push(error.message)); student.on('dialog', dialog => dialog.accept());
    await student.goto(origin); await student.fill('#input-nim', 'A'); await student.locator('#input-nim').press('Enter');
    await student.waitForSelector('#welcome-modal', {state:'hidden'}); await student.waitForFunction(() => syncPhase === 'success');
    assert.equal(await student.locator('#modal-important-announcement').isVisible(), false, 'no second announcement modal');
    assert.equal(await student.locator('#announcement-banner').isVisible(), true);
    assert.equal(await student.locator('#announcement-banner').evaluate(node => node.classList.contains('announcement-important')), true);
    assert.equal(await student.locator('#dashboard .operation-feedback:visible').count(), 0, 'welcome is a toast only, not a permanent box');
    pass('An important announcement shows once, in the banner, and the welcome message is not pinned to Home');

    assert.match(await student.locator('#task-home .request-wait').first().textContent(), /Sudah menunggu 5 hari · biasanya diproses dalam 3 hari/);
    await student.waitForSelector('#home-preparation');
    assert.equal(await student.locator('#home-preparation .home-preparation-row').count(), 2);
    pass('Students see how long a request has waited against the usual time, plus preparation on Home');

    assert.equal(await student.locator('#lang-btn').isVisible(), true);
    assert.equal(await student.locator('#main-sidebar .btn-sidebar').count(), 0, 'sidebar no longer holds the language/theme buttons');
    await student.locator('#lang-btn').click();
    assert.equal(await student.evaluate(() => currentLang), 'en');
    assert.equal((await student.locator('#lang-btn').textContent()).trim(), 'EN');
    await student.locator('#header-theme-toggle').click();
    assert.equal(await student.evaluate(() => document.body.classList.contains('dark-mode')), true);
    assert.equal(await student.getAttribute('#header-theme-toggle', 'aria-pressed'), 'true');
    await student.locator('#lang-btn').click(); await student.locator('#header-theme-toggle').click();
    assert.notEqual(await student.locator('[data-nav-target="academic-journey"]').getAttribute('data-nav-icon'), await student.locator('[data-nav-target="student-status"]').getAttribute('data-nav-icon'));
    pass('Language and theme are compact header icons; Journey and Requests have different icons');

    // ---------- New student: journey leads with preparation ----------
    await student.evaluate(() => logoutUser());
    await student.waitForSelector('#welcome-modal', {state:'visible'});
    await student.fill('#input-nim', 'NEW'); await student.locator('#input-nim').press('Enter');
    await student.waitForSelector('#welcome-modal', {state:'hidden'}); await student.waitForFunction(() => syncPhase === 'success');
    await student.evaluate(() => switchTab(null, 'academic-journey'));
    const journey = student.locator('#academic-journey-content');
    assert.equal(await journey.evaluate(node => node.classList.contains('journey-fresh')), true);
    assert.equal(await student.locator('#journey-preparation-skripsi').evaluate(node => node.open), true, 'preparation is open, not hidden in an accordion');
    assert.equal(await student.locator('.journey-fresh-map').evaluate(node => node.open), false, 'empty stage map is folded');
    const order = await student.evaluate(() => ['journey-overview', 'journey-preparation'].map(id => document.getElementById(id).getBoundingClientRect().top));
    assert(order[0] < order[1]);
    const mapTop = await student.locator('.journey-fresh-map').evaluate(node => node.getBoundingClientRect().top);
    assert(order[1] < mapTop, 'preparation comes before the folded map');
    for (const width of [390, 1365]) { await student.setViewportSize({width, height:900}); await noOverflow(student, 'journey ' + width); }
    pass('Before a first request, the Journey page leads with open preparation and folds the empty stage map');

    await student.setViewportSize({width:390, height:844});
    await student.evaluate(() => switchTab(null, 'dashboard'));
    await student.evaluate(() => showToast('Uji posisi toast', 'success'));
    const toastBox = await student.locator('#toast-container .toast').last().boundingBox();
    assert(toastBox.y > 844 / 2, 'phone toasts sit at the bottom, away from the statistics');
    await noOverflow(student, 'home 390');
    pass('Phone toasts sit above the bottom navigation instead of over the statistics');

    assert.deepEqual(errors, []);
    await browser.close();
    console.log('PASS Evaluation follow-up suite completed.');
})().catch(reportFailure);
