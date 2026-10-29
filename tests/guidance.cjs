const assert = require('node:assert/strict');
const {chromium, reportFailure} = require('./browser.cjs');
const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const errors = [], calls = [];
const pass = message => console.log('PASS ' + message);
const day = n => new Date(Date.now() - n * 86400000).toISOString();
const link = (id, name) => `<a href="https://drive.google.com/file/d/${id}/view">${name}</a>`;
const revisionNote = JSON.stringify([
    {role:'mhs', sender:'Uji', time:day(4), message:'Pendaftaran', status:'Pending'},
    {role:'admin', sender:'Admin', time:day(2), status:'Revision', message:'Berkas yang perlu diperbaiki:\n- LoA Jurnal\n\nInstruksi:\nUnggah LoA yang sudah disahkan.'},
    {kind:'document_review', role:'system', time:day(2), reviews:[{label:'LoA Jurnal', status:'revision', note:'Stempel penerbit belum ada.'}]}
]);
const records = [
    {id:'JOURNAL', date:day(4), nim:'A', nama:'Mahasiswa Uji', jenis:'Skripsi Jurnal', detail:'<b>Judul:</b> J', link:link('j1', 'LoA')+'<br>'+link('j2', 'Draft'), status:'Revision', note:revisionNote},
    {id:'Q1', date:day(6), nim:'111', nama:'Antrean Satu', jenis:'Proposal', detail:'<b>Judul:</b> 1', link:link('q1', 'Form'), status:'Pending', note:'[]'},
    {id:'Q2', date:day(1), nim:'222', nama:'Antrean Dua', jenis:'Outline', detail:'<b>Judul:</b> 2', link:link('q2', 'T')+'<br>'+link('q3', 'D'), status:'Pending', note:'[]'},
    {id:'Q3', date:day(3), nim:'333', nama:'Antrean Tiga', jenis:'Skripsi Jurnal', detail:'<b>Judul:</b> 3', link:link('q4', 'L')+'<br>'+link('q5', 'D'), status:'Resubmitted', note:'[]'}
];
const services = ['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'].map(type => ({type, enabled:type !== 'Pendadaran', open:'', close:'', adminDays:3, studentDays:7}));
async function mock(context) {
    await context.route('**/*', async route => {
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON(); calls.push(data); let result;
            if (data.action === 'admin_login') result = {status:'success', token:'admin'};
            else if (data.action === 'student_login') result = {status:'success', token:'student-' + data.nim, nama:'Mahasiswa Uji'};
            else if (data.action === 'get_data') {
                const nim = String(data.token).startsWith('student-') ? String(data.token).slice(8) : '';
                result = {status:'success', registrations:structuredClone(nim ? records.filter(r => r.nim === nim) : records), students:[], announcements:[], contents:[], services,
                    dosens:[{Nama:'Dr. Alfa', Terpakai:4, Maksimal:5}, {Nama:'Dr. Beta', Terpakai:1, Maksimal:5}, {Nama:'Dr. Gamma', Terpakai:5, Maksimal:5}]};
            } else if (data.action === 'get_journey') result = {status:'success', journey:{checks:{}, revision:1}};
            else if (data.action === 'save_progress') result = {status:'success', journey:{checks:data.changes || {}, revision:2}};
            else if (data.action === 'get_document_review') result = {status:'success', version:'', reviews:[], archived:false};
            else if (data.action === 'change_admin_password') result = data.currentPassword === 'lama-benar' ? {status:'success', username:data.newUsername} : {status:'error', message:'Username atau password lama salah.'};
            else if (data.action === 'get_health') result = {status:'success', events:[], storage:{propertyBytes:724, propertyLimit:500000, privateSheet:true, privateRows:30}, adminPasswordHashed:true, funnel:{Proposal:{service:10, data:8, files:5, review:4, sent:3}}};
            else if (data.action === 'logout') result = {status:'success'};
            else if (await require('./next-mock.cjs')(route, data)) return;
            else result = {status:'success'};
            return route.fulfill({contentType:'application/json', body:JSON.stringify(result)});
        }
        if (url.startsWith(origin)) return route.continue();
        if (url.includes('chart.js')) return route.fulfill({contentType:'text/javascript', body:'window.Chart=class{static defaults={font:{}};destroy(){};constructor(){}};'});
        return route.abort();
    });
}
async function login(page, role) {
    await page.goto(origin);
    if (role === 'admin') { await page.click('#tab-admin'); await page.fill('#input-admin-user', 'fixture'); await page.fill('#input-admin-pass', 'fixture'); await page.locator('#input-admin-pass').press('Enter'); }
    else { await page.fill('#input-nim', 'A'); await page.locator('#input-nim').press('Enter'); }
    await page.waitForSelector('#welcome-modal', {state:'hidden'}); await page.waitForFunction(() => syncPhase === 'success');
}

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({viewport:{width:1365, height:900}, reducedMotion:'reduce'});
    await mock(context);

    // ---------- Student ----------
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
    await login(page, 'mhs');
    assert.equal(await page.locator('#student-first-guide').count(), 0, 'students with requests are not interrupted by the guide');
    await page.evaluate(() => { sessionStorage.setItem('ipcos_registrations', '[]'); renderTaskHome(); });

    await page.waitForSelector('#student-first-guide');
    assert.equal(await page.locator('#student-first-guide li').count(), 3);
    await page.locator('#student-first-guide [data-guide-done]').click();
    assert.equal(await page.locator('#student-first-guide').count(), 0);
    await page.evaluate(() => renderTaskHome());
    assert.equal(await page.locator('#student-first-guide').count(), 0, 'the guide stays dismissed');
    await page.evaluate(() => syncDatabase());
    pass('New students get a 3-step guide on Home that stays dismissed');

    await page.setViewportSize({width:390, height:844});
    await page.evaluate(() => { const event = new Event('beforeinstallprompt'); event.prompt = () => { window.__installPrompted = true; }; event.userChoice = Promise.resolve({outcome:'accepted'}); window.dispatchEvent(event); });
    await page.waitForSelector('#install-app-card [data-install-app]');
    assert.equal(await page.locator('#install-app-button').count(), 1, 'the profile menu also offers installation');
    await page.locator('#install-app-card [data-install-app]').click();
    await page.waitForFunction(() => window.__installPrompted === true);
    assert.equal(await page.evaluate(() => fetch('/manifest.webmanifest').then(r => r.json()).then(m => [m.short_name, m.display, m.icons.length])).then(JSON.stringify), JSON.stringify(['IPCOS', 'standalone', 3]));
    await page.setViewportSize({width:1365, height:900});
    const icons = await page.evaluate(async () => {
        const manifest = await fetch('/manifest.webmanifest').then(r => r.json());
        const sources = [...manifest.icons.map(icon => [icon.src, Number(icon.sizes.split('x')[0])]), [document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'), 180]];
        return Promise.all(sources.map(([src, size]) => new Promise(resolve => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 4, 4); const corner = g.getImageData(0, 0, 1, 1).data; resolve([src, img.naturalWidth === size && img.naturalHeight === size, corner[3] === 255]); }; img.onerror = () => resolve([src, false, false]); img.src = src; })));
    });
    for (const [src, sized, opaque] of icons) { assert(sized, src + ' has its declared size'); assert(opaque, src + ' has no transparent corners'); }
    pass('Phones are offered to install IPCOS as an app, using the web app manifest');

    const quick = page.locator('#home-preparation input[data-home-check]');
    assert.equal(await quick.count(), 3, 'three next items can be ticked on Home');
    const firstId = await quick.first().getAttribute('data-home-check');
    await quick.first().check();
    await page.waitForFunction(id => document.getElementById(id)?.checked === true && journeyPreparationState()[id] === true, firstId);
    await page.waitForFunction(id => !document.querySelector(`#home-preparation input[data-home-check="${id}"]`), firstId);
    pass('Ticking a preparation item on Home updates the real checklist and moves to the next item');

    await page.evaluate(() => switchTab(null, 'pendaftaran'));
    await page.waitForSelector('#service-cards .service-card');
    const cards = await page.locator('#service-cards .service-card').evaluateAll(nodes => nodes.map(node => [node.dataset.serviceCard, node.className.replace('service-card', '').trim(), node.querySelector('span').textContent]));
    assert.equal(cards.length, 5);
    assert.deepEqual(cards.find(card => card[0] === 'Skripsi Jurnal').slice(0, 2), ['Skripsi Jurnal', 'active'], 'a running request is marked as in progress');
    assert.equal(cards.find(card => card[0] === 'Pendadaran')[1], 'blocked', 'a closed service shows why before it is chosen');
    assert.match(cards.find(card => card[0] === 'Pendadaran')[2], /ditutup/);
    assert.equal(cards.find(card => card[0] === 'Proposal')[1], 'open');
    await page.locator('[data-service-card="Proposal"]').click();
    assert.equal(await page.inputValue('#reg-jenis-utama'), 'Proposal');
    assert.equal(await page.getAttribute('[data-service-card="Proposal"]', 'aria-pressed'), 'true');
    pass('Service cards show availability before choosing, and a card selects its service');
    await page.waitForFunction(() => true);
    const funnelCalls = () => calls.filter(c => c.action === 'report_funnel').map(c => c.service + ':' + c.step);
    assert(funnelCalls().includes('Proposal:service'), 'choosing a service is counted');
    await page.evaluate(() => { document.getElementById('reg-jenis-utama').dispatchEvent(new Event('change', {bubbles:true})); window.IPCOSRegistration?.refresh(); });
    assert.equal(funnelCalls().filter(entry => entry === 'Proposal:service').length, 1, 'each step is reported once per session');
    assert.equal(calls.filter(c => c.action === 'report_funnel').some(c => JSON.stringify(c).includes('"nim"')), false, 'reports carry no student ID');
    pass('Wizard steps are reported anonymously, once per service and step');

    await page.evaluate(() => switchTab(null, 'student-status'));
    assert.equal(await page.locator('#student-status .case-tracker.compact:visible').first().locator('li').count(), 4, 'list shows a compact tracker');
    await page.locator('#student-status [data-case-id="JOURNAL"]:visible').first().click();
    await page.waitForSelector('#case-detail-content .case-tracker:not(.compact)');
    const steps = await page.locator('#case-detail-content .case-tracker:not(.compact) li span').allTextContents();
    assert.deepEqual(steps, ['Dikirim', 'Revisi diminta', 'Perbaikan Anda', 'Disetujui']);
    pass('Requests show a progress tracker: submitted, corrections requested, your corrections, approved');

    await page.evaluate(() => closeModal('modal-case-detail', true));

    // ---------- Admin ----------
    const admin = await context.newPage();
    admin.on('pageerror', error => errors.push(error.message)); admin.on('dialog', dialog => dialog.accept());
    await login(admin, 'admin');
    await admin.locator('[data-nav-target="admin-data"]').click();
    await admin.waitForSelector('#queue-saved-views [data-queue-view]');
    await admin.locator('[data-queue-view="resubmitted"]').click();
    assert.deepEqual(await admin.locator('#table-admin-reg tr[data-queue-case]').evaluateAll(rows => rows.map(row => row.dataset.queueCase)), ['Q3']);
    await admin.locator('[data-queue-view="overdue"]').click();
    assert.deepEqual(await admin.locator('#table-admin-reg tr[data-queue-case]').evaluateAll(rows => rows.map(row => row.dataset.queueCase)), ['Q1', 'Q3']);
    await admin.fill('#admin-search-input', 'Antrean Satu'); await admin.evaluate(() => filterAdminData());
    await admin.locator('[data-queue-new]').click(); await admin.fill('#queue-view-name', 'Satu saja'); await admin.locator('#queue-view-name').press('Enter');
    await admin.evaluate(() => setAdminQueueFilter('ALL')); await admin.fill('#admin-search-input', ''); await admin.evaluate(() => filterAdminData());
    await admin.locator('[data-queue-custom="0"]').click();
    assert.equal(await admin.inputValue('#admin-search-input'), 'Antrean Satu');
    await admin.locator('[data-queue-remove="0"]').click();
    assert.equal(await admin.locator('[data-queue-custom]').count(), 0);
    pass('Built-in and saved queue views apply filters in one click; saved views can be removed');

    await admin.locator('[data-queue-view="oldest"]').click();
    await admin.fill('#admin-search-input', ''); await admin.evaluate(() => filterAdminData());
    await admin.locator('#table-admin-reg [data-case-id="Q1"]').click();
    await admin.waitForSelector('#case-review-next');
    await admin.locator('#case-detail-content').click({position:{x:5, y:5}});
    await admin.keyboard.press('j');
    await admin.waitForFunction(() => selectedCaseId === 'Q3');
    await admin.keyboard.press('k');
    await admin.waitForFunction(() => selectedCaseId === 'Q1');
    await admin.keyboard.press('?');
    assert.equal(await admin.locator('#review-shortcut-help').count(), 1);
    await admin.keyboard.press('r');
    await admin.waitForFunction(() => document.getElementById('case-action-panel').dataset.action === 'revision' && !document.getElementById('case-action-panel').hidden);
    await admin.keyboard.press('j');
    assert.equal(await admin.evaluate(() => selectedCaseId), 'Q1', 'shortcuts pause while a decision panel is open');
    await admin.evaluate(() => { document.getElementById('case-action-panel').dataset.dirty = 'false'; cancelCaseAction(); });
    await admin.keyboard.press('a');
    await admin.waitForFunction(() => document.getElementById('case-action-panel').dataset.action === 'accept');
    await admin.evaluate(() => { document.getElementById('case-action-panel').dataset.dirty = 'false'; cancelCaseAction(); closeModal('modal-case-detail', true); });
    pass('Review shortcuts: J/K move through the queue, R and A open decisions, ? shows help');

    await admin.evaluate(() => setAdminQueueFilter('ALL'));
    await admin.locator('#table-admin-reg [data-case-id="Q2"]').click();
    await admin.evaluate(() => caseDetailAction('dospem'));
    const options = await admin.locator('#case-supervisor option').allTextContents();
    assert.match(options[1], /^Dr\. Beta · Sisa kuota: 4 · Disarankan$/);
    assert.match(options[2], /^Dr\. Alfa/); assert.match(options.at(-1), /^Dr\. Gamma · Penuh$/);
    await admin.evaluate(() => { document.getElementById('case-action-panel').dataset.dirty = 'false'; cancelCaseAction(); closeModal('modal-case-detail', true); });
    pass('Supervisors are listed by remaining quota with the least-loaded one suggested');

    await admin.evaluate(() => { if (currentLang !== 'en') toggleLanguage(); });
    assert.deepEqual(await admin.locator('#admin-table-main thead th.lang').evaluateAll(nodes => nodes.slice(0, 3).map(node => node.textContent.trim())).then(list => list.filter(Boolean)).then(list => list.includes('Student') && list.includes('Request Type')), true);
    pass('Queue table headers follow the selected language');
    await admin.evaluate(() => { if (currentLang !== 'id') toggleLanguage(); switchTab(null, 'admin-master'); });
    await admin.locator('#admin-password-card > summary').click();
    await admin.fill('#admin-pw-user', 'admin'); await admin.fill('#admin-pw-current', 'lama-salah');
    await admin.fill('#admin-pw-new', 'pendek'); await admin.fill('#admin-pw-repeat', 'pendek');
    await admin.locator('#admin-pw-submit').click();
    assert.match(await admin.locator('#admin-pw-feedback').textContent(), /minimal 10/);
    await admin.fill('#admin-pw-new', 'password-baru-panjang'); await admin.fill('#admin-pw-repeat', 'password-baru-lain');
    await admin.locator('#admin-pw-submit').click();
    assert.match(await admin.locator('#admin-pw-feedback').textContent(), /tidak sama/);
    await admin.fill('#admin-pw-repeat', 'password-baru-panjang'); await admin.locator('#admin-pw-submit').click();
    await admin.waitForFunction(() => /lama salah/i.test(document.getElementById('admin-pw-feedback').textContent));
    await admin.fill('#admin-pw-current', 'lama-benar'); await admin.fill('#admin-pw-newuser', 'prodi'); await admin.locator('#admin-pw-submit').click();
    await admin.waitForFunction(() => /prodi/.test(document.getElementById('admin-pw-feedback').textContent));
    assert.equal(await admin.inputValue('#admin-pw-current'), '', 'password fields are cleared after saving');
    pass('Admins change the login password in Master Data with validation and clear fields afterwards');

    await admin.evaluate(() => switchTab(null, 'admin-data'));
    await admin.evaluate(() => { document.querySelectorAll('#admin-data details').forEach(node => node.open = true); });
    await admin.locator('[data-health-refresh]').click();
    await admin.waitForSelector('.health-funnel table');
    assert.deepEqual(await admin.locator('.health-funnel tbody td').allTextContents(), ['Ujian Seminar Proposal', '10', '8 80%', '5 50%', '4 40%', '3 30%']);
    assert.match(await admin.locator('#health-results').textContent(), /tersimpan sebagai hash/);
    pass('Service Health shows where students stop in the wizard and whether the admin password is hashed');

    assert.deepEqual(errors, []);
    await browser.close();
    console.log('PASS Guidance suite completed.');
})().catch(reportFailure);
