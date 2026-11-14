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
    {id:'Q1', date:day(6), nim:'111', nama:'Antrean Satu', jenis:'Proposal', detail:'<b>Judul:</b> 1', link:link('q1', 'Form'), status:'Pending', note:JSON.stringify([{role:'mhs', sender:'Antrean Satu', time:day(6), message:'Pendaftaran', documents:[{url:'https://drive.google.com/file/d/q1/view', label:'Form', fileName:'berkas.rar', version:1}]}])},
    {id:'Q2', date:day(1), nim:'222', nama:'Antrean Dua', jenis:'Outline', detail:'<b>Judul:</b> 2', link:link('q2', 'T')+'<br>'+link('q3', 'D'), status:'Pending', note:'[]'},
    {id:'Q4', date:day(20), nim:'444', nama:'Antrean Empat', jenis:'Outline', detail:'<b>Judul:</b> 4', link:link('q6', 'T'), status:'Accepted', note:'[]'},
    {id:'Q3', date:day(3), nim:'333', nama:'Antrean Tiga', jenis:'Skripsi Jurnal', detail:'<b>Judul:</b> 3', link:link('q4', 'L')+'<br>'+link('q5', 'D'), status:'Resubmitted', note:'[]'}
];
const services = ['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'].map(type => ({type, enabled:type !== 'Pendadaran', open:type === 'Pendadaran' ? '2099-01-15' : '', close:'', adminDays:3, studentDays:7}));
async function mock(context) {
    await context.route('**/*', async route => {
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON(); calls.push(data); let result;
            if (data.action === 'admin_login') result = {status:'success', token:'admin'};
            else if (data.action === 'student_login') result = {status:'success', token:'student-' + data.nim, nama:'Mahasiswa Uji'};
            else if (data.action === 'get_data') {
                const nim = String(data.token).startsWith('student-') ? String(data.token).slice(8) : '';
                result = {status:'success', registrations:structuredClone(nim ? records.filter(r => r.nim === nim) : records), students:nim ? [] : [{NIM:'444', Nama:'Antrean Empat', Status:'Aktif'}, {NIM:'222', Nama:'Antrean Dua', Status:'Aktif'}], announcements:[], contents:[], services,
                    dosens:[{Nama:'Dr. Alfa', Terpakai:4, Maksimal:5}, {Nama:'Dr. Beta', Terpakai:1, Maksimal:5}, {Nama:'Dr. Gamma', Terpakai:5, Maksimal:5}]};
                if (!nim) Object.assign(result, {academicSupported:true, academicByNim:{'222':{exists:false, level:0, revision:0, updatedAt:''}, '444':{exists:false, level:0, revision:0, updatedAt:''}}});
            } else if (data.action === 'get_journey') result = {status:'success', journey:{checks:{}, revision:1}};
            else if (data.action === 'save_academic_progress') result = {status:'success', academic:{exists:true, level:data.level, revision:data.revision + 1, updatedAt:new Date().toISOString(), events:[]}};
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
    assert.equal(await page.locator('#task-home .student-overview').count(), 0, 'counters stay hidden until there are enough requests to summarise');
    await page.evaluate(() => { sessionStorage.setItem('ipcos_registrations', '[]'); renderTaskHome(); });

    await page.waitForSelector('#student-first-guide');
    assert.equal(await page.locator('#student-first-guide li').count(), 3);
    assert.equal(await page.locator('#task-home .student-overview, #task-home .student-empty, #task-home .student-shortcuts').count(), 0, 'a new student sees no zero counters, empty list or duplicate links');
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
    assert.match(cards.find(card => card[0] === 'Pendadaran')[2], /ditutup.*dibuka kembali/i, 'a closed service says when it reopens');
    assert.equal(cards.find(card => card[0] === 'Proposal')[1], 'open');
    assert.equal(await page.locator('#reg-jenis-utama').evaluate(node => node.getBoundingClientRect().width <= 1), true, 'the old dropdown no longer duplicates the cards');
    assert.equal(await page.locator('label[for="reg-jenis-utama"]').evaluate(node => node.getBoundingClientRect().width <= 1), true);
    assert.equal(await page.locator('#registration-companion').isVisible(), false, 'no side panel before a service is chosen');
    assert.equal(await page.locator('#registration-service-next').isVisible(), false, 'no greyed-out Continue button before a service is chosen');
    await page.locator('[data-service-card="Pendadaran"]').click();
    assert.equal(await page.evaluate(() => window.IPCOSRegistration.current()), 'service', 'a closed service stays on the choice step');
    await page.locator('[data-service-card="Proposal"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.IPCOSRegistration.current()), 'data', 'an available service opens the details step');
    assert.equal(await page.evaluate(() => document.activeElement.closest('#registration-data-step') !== null), true, 'focus moves to the first detail field');
    assert.equal(await page.locator('#registration-companion').isVisible(), true, 'the checklist panel appears once a service is chosen');
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

    await page.fill('#reg-judul', 'Judul uji'); await page.evaluate(() => window.IPCOSRegistration.navigate('files'));
    await page.waitForFunction(() => window.IPCOSRegistration.current() === 'files');
    const choose = page.locator('#registration-document-step .upload-choose:visible').first();
    assert.equal((await choose.textContent()).trim(), 'Pilih Berkas', 'the file button is in the portal language');
    assert.equal(await choose.evaluate(node => document.getElementById(node.dataset.uploadInput).getBoundingClientRect().width <= 1), true, 'the browser file control with English text is not shown');
    const chooser = page.waitForEvent('filechooser'); await choose.click(); await (await chooser).setFiles([]);
    await page.setViewportSize({width:390, height:844});
    assert.match(await page.locator('#registration-readiness-jump').textContent(), /^Persyaratan: \d\/\d siap/i, 'phones show requirement progress above the form');
    await page.locator('#registration-readiness-jump').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'readiness-heading');
    await page.setViewportSize({width:1365, height:900});
    assert.equal(await page.locator('#registration-readiness-jump').isVisible(), false, 'wide screens already show the checklist beside the form');
    pass('File fields use an Indonesian button, and phones show requirement progress at the top');

    await page.evaluate(() => switchTab(null, 'student-status'));
    assert.equal(await page.locator('#student-status .case-tracker.compact:visible').first().locator('li').count(), 4, 'list shows a compact tracker');
    await page.locator('#student-status [data-case-id="JOURNAL"]:visible').first().click();
    await page.waitForSelector('#case-detail-content .case-tracker:not(.compact)');
    const steps = await page.locator('#case-detail-content .case-tracker:not(.compact) li span').allTextContents();
    assert.equal(await page.locator('#case-detail-content .student-no-action').count(), 0, 'no filler message in the action column');
    assert.equal((await page.locator('#case-detail-content').textContent()).includes('penanda versi'), false, 'students do not see the version-label note');
    assert.deepEqual(steps, ['Dikirim', 'Revisi diminta', 'Perbaikan Anda', 'Selesai']);
    assert.equal(await page.locator('#case-detail-content .student-request-progress').count(), 0, 'the detail shows one tracker, not two');
    await page.setViewportSize({width:390, height:844});
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#case-detail-content .case-tracker:not(.compact) li')).minWidth === '0px');
    assert.equal(await page.locator('#case-detail-content .case-tracker:not(.compact)').evaluate(node => { const box = node.getBoundingClientRect(); return node.scrollWidth <= node.clientWidth + 1 && [...node.children].every(step => step.getBoundingClientRect().right <= box.right + 1 && step.scrollWidth <= step.clientWidth + 1); }), true, 'all four steps fit a phone screen');
    await page.setViewportSize({width:1365, height:900});
    pass('Requests show a progress tracker: submitted, corrections requested, your corrections, approved');

    await page.evaluate(() => closeModal('modal-case-detail', true));
    await page.evaluate(() => switchTab(null, 'academic-journey'));
    await page.waitForSelector('#journey-overview.journey-no-stage');
    assert.equal(await page.evaluate(() => { const next = document.getElementById('journey-next-action').getBoundingClientRect(), stage = document.querySelector('.journey-position').getBoundingClientRect(); return next.left < stage.left || next.top < stage.top; }), true, 'without a recorded stage the next step leads the page');
    pass('Academic Journey leads with the next step when no stage is recorded');
    const stageLine = await page.evaluate(() => journeyStageHtml('Outline', [{jenis:'Outline', status:'Accepted'}], {level:null}, 0));
    assert.match(stageLine, /data-stage-awaits-record/); assert.equal(stageLine.includes('journey-map-request'), false, 'an approved request without a recorded stage reads as one status, not two');
    assert.match(await page.evaluate(() => journeyStageHtml('Outline', [{jenis:'Outline', status:'Accepted'}], {level:1}, 0)), /journey-map-request/, 'a recorded stage keeps both lines');
    const waits = await page.evaluate(late => { const item = JSON.parse(sessionStorage.getItem('ipcos_registrations')).find(r => r.id === 'JOURNAL'); return [caseWaitHtml(item), caseWaitHtml({...item, note:late})]; },
        JSON.stringify([{role:'mhs', sender:'Uji', time:day(40), message:'Pendaftaran', status:'Pending'}, {role:'admin', sender:'Admin', time:day(31), status:'Revision', message:'Perbaiki.'}]));
    assert.match(waits[0], /disarankan dikirim dalam 7 hari/); assert.match(waits[1], /Revisi diminta 31 hari lalu · sudah lewat dari saran 7 hari, kirim secepatnya/);
    pass('The stage map shows one clear status, and an overdue correction no longer suggests a deadline that has passed');
    await page.evaluate(() => switchTab(null, 'skripsi'));
    const box = await page.locator('#skripsi .preparation-item input[type=checkbox]').first().evaluate(node => { const a = node.getBoundingClientRect(), b = node.closest('.preparation-item').querySelector('label').getBoundingClientRect(); return [Math.round(a.width), a.right <= b.left]; });
    assert.deepEqual(box, [22, true], 'checklist checkboxes keep their size and do not cover their text');
    await page.evaluate(() => { const list = JSON.parse(sessionStorage.getItem('ipcos_registrations')); const item = list.find(r => r.id === 'JOURNAL'); const logs = JSON.parse(item.note); logs.unshift({role:'mhs', documents:[{url:'https://drive.google.com/file/d/j1/view', label:'LoA Jurnal', fileName:'loa.pdf', version:1}, {url:'https://drive.google.com/file/d/j2/view', label:'Draft Jurnal', fileName:'draft.pdf', version:1}]}); item.note = JSON.stringify(logs); sessionStorage.setItem('ipcos_registrations', JSON.stringify(list)); switchTab(null, 'student-files'); });
    await page.waitForSelector('.file-center-card');
    assert.match(await page.locator('#file-center-overview').textContent(), /1 perlu perbaikan/, 'a document named in an open correction request counts as needing correction');
    assert.equal(await page.locator('.file-center-card').first().locator('[data-state=revision]').count(), 1, 'it is listed first');
    pass('Checklist checkboxes no longer overlap their text, and Pusat Berkas counts documents the admin asked to fix');

    // ---------- Admin ----------
    const admin = await context.newPage();
    admin.on('pageerror', error => errors.push(error.message)); admin.on('dialog', dialog => dialog.accept());
    await login(admin, 'admin');
    const emptyHome = await admin.evaluate(() => { const saved = sessionStorage.getItem('ipcos_registrations'); isDbLoaded = false; sessionStorage.setItem('ipcos_registrations', '[]'); renderTaskHome();
        const state = [document.querySelectorAll('#task-home .task-empty[data-loading]').length, [...document.querySelectorAll('#admin-today .admin-today-tile strong')].map(node => node.textContent).join(''), document.getElementById('task-home').textContent.includes('sudah ditindaklanjuti')];
        isDbLoaded = true; sessionStorage.setItem('ipcos_registrations', saved); renderTaskHome(); return state; });
    assert.deepEqual(emptyHome, [1, '…'.repeat(5), false], 'before the first sync the admin home says it is loading instead of showing zeros');
    assert.equal(await admin.locator('#task-home [data-loading]').count(), 0);
    pass('Admin home shows a loading state until requests arrive');
    await admin.setViewportSize({width:390, height:844});
    assert.equal(await admin.locator('#admin-bottom-nav').isVisible(), true, 'admins get a bottom bar on phones');
    assert.equal(await admin.locator('#student-bottom-nav').isVisible(), false);
    await admin.locator('#admin-bottom-nav [data-bottom-target="admin-data"]').click();
    assert.equal(await admin.evaluate(() => document.querySelector('.tab-content.active').id), 'admin-data');
    await admin.evaluate(() => switchTab(null, 'dashboard'));
    await admin.setViewportSize({width:1365, height:900});
    assert.equal(await admin.locator('#admin-bottom-nav').isVisible(), false, 'the bar is for phones only');
    pass('Admins on phones reach Home, the queue, notifications and the menu from a bottom bar');
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
    assert.equal(await admin.evaluate(() => document.getElementById('case-detail-content').dataset.activeDocumentIndex), undefined, 'an archive that cannot be previewed is not fetched automatically');
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
    await admin.evaluate(() => { if (currentLang !== 'id') toggleLanguage(); });
    assert.match(await admin.evaluate(() => window.IPCOSAcademic.caseHtml({id:'X', nim:'222', jenis:'Outline', status:'Accepted'})), /data-stage-gap/, 'an approved request without its stage recorded is flagged for the admin');
    await admin.locator('#table-admin-reg [data-case-id="Q2"]').click();
    await admin.waitForFunction(() => document.getElementById('case-detail-content').dataset.activeDocumentIndex === '0');
    await admin.evaluate(() => caseDetailAction('dospem'));
    await admin.selectOption('#case-supervisor', {index:1});
    await admin.locator('#btn-case-submit').click();
    await admin.waitForSelector('#decision-mark-stage');
    assert.equal(await admin.isChecked('#decision-mark-stage'), false, 'recording the stage is never automatic');
    await admin.check('#decision-mark-stage');
    assert.equal(await admin.locator('#admin-decision-summary').count(), 1, 'ticking the stage keeps the summary open');
    await admin.locator('#btn-case-submit').click();
    await admin.waitForFunction(() => window.IPCOSAcademic.progress('222').level === 1);
    const stageCall = calls.find(c => c.action === 'save_academic_progress');
    assert.deepEqual([stageCall.nim, stageCall.level, stageCall.revision], ['222', 1, 0]);
    assert(calls.findIndex(c => c.action === 'update' && c.id === 'Q2') < calls.indexOf(stageCall), 'the stage is recorded only after the approval succeeds');
    await admin.evaluate(() => closeModal('modal-case-detail', true));
    pass('Wide screens open the first file automatically; approving can also record the completed stage in the same step');

    const documentOptions = await admin.evaluate(() => [caseDocumentOptions({jenis:'Pendadaran', note:'[]'}).length, caseDocumentOptions({jenis:'Pendadaran', note:JSON.stringify([{role:'mhs', documents:[{label:'Berkas Pendadaran', version:1}]}])})]);
    assert.deepEqual(documentOptions, [12, ['Berkas Pendadaran']], 'new defense requests list 12 documents; older archive requests keep their single document');
    await admin.evaluate(() => { const list = JSON.parse(sessionStorage.getItem('ipcos_registrations')); list.push({id:'PDD', date:new Date().toISOString(), nim:'555', nama:'Uji Pendadaran', jenis:'Pendadaran', detail:'<b>Judul:</b> P', link:'', status:'Pending', note:'[]'}); sessionStorage.setItem('ipcos_registrations', JSON.stringify(list)); openCaseDetail('PDD'); caseDetailAction('revision'); });
    const boxes = admin.locator('#case-action-panel [name="revision-document"]');
    assert.equal(await boxes.count(), 13, 'admin can pick any of the 12 documents or the request details');
    for (let i = 0; i < 6; i++) await boxes.nth(i).check();
    await admin.fill('#case-revision-note', 'Scan ulang.');
    await admin.locator('#btn-case-submit').click();
    assert.match(await admin.locator('#case-action-feedback').textContent(), /maksimal 5 berkas/);
    assert.equal(calls.filter(c => c.action === 'update' && c.id === 'PDD').length, 0);
    await boxes.nth(5).uncheck(); await admin.locator('#btn-case-submit').click();
    await admin.waitForSelector('#admin-decision-summary');
    await admin.evaluate(() => { document.getElementById('case-action-panel').dataset.dirty = 'false'; cancelCaseAction(); closeModal('modal-case-detail', true); const list = JSON.parse(sessionStorage.getItem('ipcos_registrations')).filter(r => r.id !== 'PDD'); sessionStorage.setItem('ipcos_registrations', JSON.stringify(list)); });
    pass('Admins can request up to 5 defense documents per correction round, matching what a student can send');
    await admin.evaluate(() => { switchTab(null, 'admin-master'); });
    assert.deepEqual(await admin.locator('#admin-master .master-section').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => node.id)), ['master-students-section'], 'Master Data shows one section at a time');
    const gapOption = await admin.locator('#master-stage-filter option[value=gap]').textContent();
    assert.match(gapOption, /^Disetujui, tahap belum dicatat \(1\)$/i);
    await admin.selectOption('#master-stage-filter', 'gap');
    assert.deepEqual(await admin.locator('#table-master-mhs tr[data-master-student]').evaluateAll(rows => rows.map(row => row.dataset.masterStudent)), ['444']);
    assert.match(await admin.locator('#table-master-mhs [data-master-gap]').textContent(), /^Outline sudah disetujui, tahap belum dicatat$/);
    await admin.selectOption('#master-stage-filter', 'all');
    pass('Master Data lists students whose approved request still has no recorded stage');
    await admin.evaluate(() => { window.IPCOSMaster.show('services'); });
    assert.deepEqual(await admin.locator('#admin-master .master-section').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => node.id)), ['master-services-section']);
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
