const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, reportFailure} = require('./browser.cjs');
const fixture = require('./next-backend.fixture.cjs');
const {previewPdf} = require('./fixtures.cjs');

// Every account, document, API response and academic mutation is synthetic.
// Unknown external requests are blocked; revise_request uses the isolated backend fixture.
const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const errors = [], violations = [], checks = [];
const recovery = '#student-correction-draft-recovery';
const restore = '[data-correction-draft-restore]';
const discard = '[data-correction-draft-discard]';
const draftStatus = '#student-correction-draft-status';
const reminders = '[data-correction-draft-file]';
const draftKey = 'ipcos_student_correction_drafts';
const title = 'Judul privat eCommerce O’Connor <img src=x onerror=alert(1)>';
const explanation = 'DRAF PRIVAT A: tanda tangan dan judul diperbaiki. Literal <img> & O’Connor tetap teks.';
const documentUrl = 'https://drive.google.com/file/d/student-correction-draft-transcript/view';
const selectedFile = {name: 'Transkrip-privat-eCommerce-O’Connor-nama-berkas-panjang.pdf', mimeType: 'application/pdf', buffer: previewPdf('PRIVATE FILE BYTES MUST NEVER BE STORED')};
const pass = name => {checks.push(name); console.log('PASS ' + name);};

function gate() {
    let enter, release;
    return {entered: new Promise(resolve => enter = resolve), wait: new Promise(resolve => release = resolve), enter: () => enter(), release: () => release()};
}

function harness({fieldsOnly = false, supervisors = false} = {}) {
    const f = fixture(), requested = fieldsOnly ? ['Isian pengajuan'] : ['Transkrip', 'Isian pengajuan'];
    const note = JSON.stringify([
        {role: 'mhs', message: 'Synthetic original document', documents: [{url: documentUrl, label: 'Transkrip', fileName: 'Transkrip-asli.pdf', version: 1}]},
        {kind: 'document_review', role: 'system', reviews: [{url: documentUrl, label: 'Transkrip', status: 'revision', note: 'Lengkapi tanda tangan eCommerce O’Connor.'}]},
        {role: 'admin', message: 'Berkas yang perlu diperbaiki:\n' + requested.map(label => '- ' + label).join('\n') + '\n\nInstruksi:\nPerbaiki bagian yang diminta.'}
    ]);
    for (const row of f.rows.slice(1)) {
        row[4] = supervisors ? 'Pergantian Pembimbing' : 'Outline';
        row[5] = supervisors ? '<b>Dosen Lama:</b> Dosen Lama<br><b>Dosen Baru:</b> Dosen Usulan<br><b>Alasan:</b> Alasan awal' : '<b>Judul:</b> Judul awal eCommerce';
        row[6] = fieldsOnly ? '' : '<a href="' + documentUrl + '">Transkrip</a>';
        row[7] = 'Revision';
        row[8] = note;
    }
    return {f, calls: [], nextFields: null, nextSend: null, nextDocument: null, failSend: false};
}

const writes = h => h.calls.filter(call => ['revise_request', 'update', 'save_document_review', 'create', 'archive_request', 'save_progress'].includes(call.action));

async function mock(context, h) {
    await context.route('**/*', async route => {
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON();
            h.calls.push(data);
            let result;
            try {
                if (data.action === 'student_login') result = {status: 'success', token: 'student-' + data.nim, nama: 'Mahasiswa Data Uji ' + data.nim};
                else if (data.action === 'get_data') result = {status: 'success', registrations: h.f.records().filter(item => item.nim === String(data.token).slice(-1)).map(item => ({...item, reviewVersion: h.f.ctx.nextRevisionVersion(item)})), students: [], dosens: [], contents: [], announcements: [], services: []};
                else if (data.action === 'get_revision_form') {
                    result = h.f.ctx.nextDispatch(data);
                    const held = h.nextFields; h.nextFields = null;
                    if (held) {held.enter(); await held.wait;}
                } else if (['get_review_capabilities', 'get_document_review'].includes(data.action)) result = h.f.ctx.nextDispatch(data);
                else if (data.action === 'get_document') {
                    const record = h.f.records().find(item => item.id === data.id);
                    assert(record && record.nim === String(data.token).slice(-1), 'Only an owned synthetic document may load');
                    assert.equal(data.url, documentUrl);
                    const held = h.nextDocument; h.nextDocument = null;
                    if (held) {held.enter(); await held.wait;}
                    result = {status: 'success', fileName: 'Transkrip-asli.pdf', mimeType: 'application/pdf', base64: previewPdf('Synthetic original transcript').toString('base64')};
                } else if (data.action === 'revise_request') {
                    const held = h.nextSend; h.nextSend = null;
                    if (held) {held.enter(); await held.wait;}
                    if (h.failSend) throw Error('Gangguan simpan perbaikan data uji.');
                    result = h.f.ctx.nextDispatch(data);
                } else if (data.action === 'logout') result = {status: 'success'};
                else if (['update', 'save_document_review', 'create', 'archive_request', 'save_progress'].includes(data.action)) {
                    violations.push(data.action); throw Error('Unexpected academic mutation ' + data.action);
                } else if (await require('./next-mock.cjs')(route, data)) return;
                else {violations.push(data.action); throw Error('Unexpected academic action ' + data.action);}
            } catch (error) {result = {status: 'error', message: error.message};}
            return route.fulfill({contentType: 'application/json', body: JSON.stringify(result)});
        }
        if (url.startsWith(origin)) return route.continue();
        if (url.includes('chart.js')) return route.fulfill({contentType: 'text/javascript', body: 'window.Chart=class{static defaults={font:{}};destroy(){}};'});
        return route.abort();
    });
}

async function authenticate(page, nim = 'A') {
    await page.fill('#input-nim', nim);
    await page.locator('#input-nim').press('Enter');
    await page.waitForSelector('#welcome-modal', {state: 'hidden'});
    await page.waitForFunction(() => syncPhase === 'success' && !!window.IPCOSStudentCorrections);
}

async function login(browser, h) {
    const context = await browser.newContext({viewport: {width: 1365, height: 900}, reducedMotion: 'reduce'});
    await mock(context, h);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(origin);
    await authenticate(page);
    return page;
}

async function open(page, {id = 'fields', waitFields = true} = {}) {
    await page.evaluate(id => openCaseDetail(id), id);
    await page.locator('.correction-instruction [data-correction-target]').first().click();
    await page.waitForSelector('#student-correction-workspace', {state: 'visible'});
    if (waitFields) await page.waitForSelector('[data-correction-field]', {state: 'attached'});
}

async function task(page, index) {
    const tab = page.locator('[data-correction-workspace-view="editor"]');
    if (await tab.isVisible()) await tab.click();
    await page.locator('[data-correction-workspace-task="' + index + '"]').click();
}

async function upload(page, file = selectedFile) {
    await task(page, 0);
    await page.setInputFiles('[data-correction-workspace-upload]', file);
    await page.waitForFunction(name => [...document.getElementById('case-reply-files').files].some(file => file.name === name) && !document.querySelector('[data-correction-workspace-upload]')?.disabled, file.name);
}

async function complete(page) {
    const count = await page.locator('[data-correction-workspace-task]').count();
    for (let index = 0; index < count; index++) {
        await task(page, index);
        await page.locator('[name=correction-complete]').nth(index).check();
    }
}

async function editor(page) {
    return page.evaluate(() => ({
        note: document.getElementById('case-reply-note')?.value || '',
        fields: Object.fromEntries([...document.querySelectorAll('[data-correction-field]')].map(node => [node.dataset.correctionField, node.value])),
        checked: [...document.querySelectorAll('[name=correction-complete]')].map(node => node.checked),
        task: document.querySelector('[data-correction-workspace-task][aria-pressed=true]')?.dataset.correctionWorkspaceTask,
        files: document.getElementById('case-reply-files')?.files.length || 0
    }));
}

async function saved(page, marker = explanation) {
    await page.waitForFunction(({key, marker}) => (sessionStorage.getItem(key) || '').includes(marker), {key: draftKey, marker});
    await page.waitForFunction(() => {
        const status = document.getElementById('student-correction-draft-status')?.textContent || '';
        return /tersimpan|saved/i.test(status) && !/belum (?:dapat|bisa|tersimpan)|gagal|could not|cannot|unable|not saved|unsaved/i.test(status);
    });
    return page.evaluate(key => ({key, raw: sessionStorage.getItem(key)}), draftKey);
}

async function draftEntries(page) {
    return page.evaluate(key => ({[key]: sessionStorage.getItem(key)}), draftKey);
}

const primary = (stored, id = 'fields') => JSON.parse(stored.raw).requests[id].saved;

async function reload(page, options = {}) {
    await page.reload();
    await page.waitForFunction(() => syncPhase === 'success' && !!window.IPCOSStudentCorrections);
    await open(page, options);
    await page.waitForSelector(recovery, {state: 'visible'});
}

async function idle(page) {
    await page.waitForFunction(() => !isPreparingCorrection && !activeUpdateIds.size && !document.querySelector('#btn-case-submit')?.disabled);
}

async function setBasicDraft(page, {withFile = true} = {}) {
    if (withFile) await upload(page);
    await task(page, withFile ? 1 : 0);
    await page.fill('#correction-title', title);
    await page.fill('#case-reply-note', explanation);
    await complete(page);
    await saved(page);
}

async function noClip(page, label) {
    const result = await page.locator(recovery).evaluate(root => {
        const visible = node => node.getClientRects().length && !node.closest('[hidden]') && !node.closest('details:not([open]) .student-correction-draft-contents');
        return {
            overflow: document.documentElement.scrollWidth > innerWidth + 2,
            clipped: [...root.querySelectorAll('h3,h4,p,label,button,strong,span,summary')].filter(visible).filter(node => node.clientWidth && node.scrollWidth > node.clientWidth + 3).map(node => node.textContent),
            heights: [...root.querySelectorAll('button')].filter(visible).map(node => node.getBoundingClientRect().height)
        };
    });
    assert.equal(result.overflow, false, label + ' overflow');
    assert.deepEqual(result.clipped, [], label + ' clipped text');
    assert(result.heights.length >= 2);
    assert(result.heights.every(height => height >= 43.99), label + ' touch targets');
}

(async () => {
    const browser = await chromium.launch();
    fs.mkdirSync('test-results', {recursive: true});
    const h = harness(), page = await login(browser, h);
    await open(page);
    await setBasicDraft(page);
    await task(page, 0);
    await page.waitForFunction(key => {
        try {return JSON.parse(sessionStorage.getItem(key) || '{}').requests?.fields?.saved?.activeLabel === 'Transkrip';} catch (_) {return false;}
    }, draftKey);
    const before = await editor(page), stored = await saved(page);
    assert.equal(before.task, '0');
    assert.equal(before.files, 1);
    assert(stored.raw.includes(selectedFile.name));
    assert(!stored.raw.includes(selectedFile.buffer.toString('base64')), 'File bytes must not be stored');
    assert(!stored.raw.includes('student-A'), 'Authentication tokens must not be stored with drafts');
    assert(!stored.raw.includes(documentUrl), 'Private document URLs must not be stored with drafts');
    const checkPrivateShape = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            assert(!/^(?:base64|bytes|buffer|blob|url|token)$/i.test(key), 'Draft must not persist ' + key);
            checkPrivateShape(child);
        }
    };
    checkPrivateShape(JSON.parse(stored.raw));
    const envelope = JSON.parse(stored.raw);
    assert.equal(envelope.version, 1);
    assert.equal(envelope.owner, 'A');
    assert.equal(typeof envelope.scope, 'string');
    assert(envelope.scope.length >= 16);
    assert.deepEqual(primary(stored).fields, {title});
    assert.deepEqual(primary(stored).checks, ['Transkrip', 'Isian pengajuan']);
    assert.equal(primary(stored).activeLabel, 'Transkrip');
    assert.equal(primary(stored).files.length, 1);
    assert.deepEqual(Object.keys(primary(stored).files[0]).sort(), ['label', 'lastModified', 'name', 'size', 'type']);
    assert.equal(primary(stored).files[0].label, 'Transkrip');
    assert.equal(primary(stored).files[0].name, selectedFile.name);
    assert.equal(primary(stored).files[0].size, selectedFile.buffer.length);
    assert.equal(primary(stored).files[0].type, selectedFile.mimeType);
    assert(Number.isFinite(primary(stored).files[0].lastModified));
    assert.equal(await page.evaluate(marker => Object.values(localStorage).some(value => value.includes(marker)), explanation), false);
    assert.equal(writes(h).length, 0);

    await reload(page);
    const fresh = await editor(page);
    assert.equal(fresh.note, '');
    assert.equal(fresh.fields.title, 'Judul awal eCommerce');
    assert.deepEqual(fresh.checked, [false, false]);
    assert.equal(fresh.files, 0);
    assert((await page.locator(recovery).textContent()).includes(explanation));
    assert.equal(await page.locator(recovery + ' img').count(), 0);
    assert.equal(writes(h).length, 0);
    pass('A real reload offers escaped, private recovery without restoring any field, completion choice, or selected file before an explicit click');

    let layouts = 0;
    for (const width of [320, 390, 768, 1365]) for (const lang of ['id', 'en']) for (const dark of [false, true]) {
        await page.setViewportSize({width, height: 900});
        await page.evaluate(({lang, dark}) => {
            if (currentLang !== lang) toggleLanguage();
            if (document.body.classList.contains('dark-mode') !== dark) toggleDarkMode();
        }, {lang, dark});
        await page.locator('[data-correction-draft-contents]').evaluate(node => {node.open = true;});
        await noClip(page, width + '/' + lang + '/' + dark);
        assert.deepEqual(await editor(page), fresh);
        assert((await page.locator(recovery).textContent()).includes(explanation));
        layouts++;
    }
    await page.setViewportSize({width: 1365, height: 900});
    await page.evaluate(() => {if (currentLang !== 'id') toggleLanguage(); if (document.body.classList.contains('dark-mode')) toggleDarkMode();});
    await page.locator(recovery).evaluate(node => node.scrollIntoView({block: 'start', behavior: 'instant'}));
    await page.locator('#modal-case-detail').screenshot({path: 'test-results/student-correction-drafts-recovery-desktop.png'});
    pass('Recovery remains readable and preserves the untouched editor across 16 width, language, and theme layouts with 44-pixel actions');

    const formBeforeRestore = await page.evaluate(() => ({original: document.getElementById('case-revision-fields').dataset.originalFields, version: IPCOSNext.correctionPayload().version, requestId: IPCOSNext.correctionPayload().requestId}));
    await page.locator(restore).click();
    await page.waitForFunction(value => document.getElementById('case-reply-note')?.value === value, explanation);
    const restored = await editor(page);
    assert.deepEqual(restored, {...before, files: 0});
    assert.deepEqual(await page.evaluate(() => ({original: document.getElementById('case-revision-fields').dataset.originalFields, version: IPCOSNext.correctionPayload().version, requestId: IPCOSNext.correctionPayload().requestId})), formBeforeRestore);
    assert.equal(await page.locator(reminders).count(), 1);
    assert((await page.locator(reminders).textContent()).includes(selectedFile.name));
    assert.match(await page.locator('[data-correction-draft-reminders]').textContent(), /berkas|file|pilih|select/i);
    await page.locator('#btn-case-submit').click();
    await idle(page);
    assert.equal(await page.locator('#correction-summary').count(), 0);
    assert.equal(writes(h).length, 0);
    assert.match(await page.locator('#case-action-feedback').textContent(), /berkas|file|pilih|select|dokumen|unggah|document|upload/i);
    await page.setViewportSize({width: 390, height: 900});
    await page.evaluate(() => toggleDarkMode());
    await page.locator(draftStatus).evaluate(node => node.scrollIntoView({block: 'start', behavior: 'instant'}));
    await page.locator('#modal-case-detail').screenshot({path: 'test-results/student-correction-drafts-restored-mobile-dark.png'});
    pass('Explicit restore recovers text, checklist, and the active task, keeps FileList empty, and blocks sending until remembered files are reselected');

    await upload(page);
    await complete(page);
    assert.equal(await page.locator(reminders).count(), 0);
    await saved(page);
    // Hold the genuine local format inspection; the draft must survive both stages.
    await page.evaluate(() => {
        const file = document.getElementById('case-reply-files').files[0], read = file.arrayBuffer.bind(file);
        documentInspections = new WeakMap();
        file.arrayBuffer = async () => {
            await new Promise(resolve => window.releaseDraftInspection = resolve);
            file.arrayBuffer = read;
            return read();
        };
    });
    await page.locator('#btn-case-submit').click();
    await page.waitForFunction(() => isPreparingCorrection && typeof releaseDraftInspection === 'function');
    assert(await page.locator('#case-reply-note').isDisabled());
    assert(await page.locator('#correction-title').isDisabled());
    assert.equal(writes(h).length, 0);
    assert((await saved(page)).raw.includes(explanation));
    await page.evaluate(() => releaseDraftInspection());
    await page.waitForSelector('#correction-summary', {state: 'visible'});
    await idle(page);
    assert.equal(writes(h).length, 0);
    assert((await saved(page)).raw.includes(explanation));

    h.failSend = true;
    await page.locator('#btn-case-submit').click();
    await idle(page);
    assert.equal(writes(h).length, 1);
    assert.equal(h.f.rows[1][7], 'Revision');
    assert.equal((await editor(page)).files, 1);
    assert((await saved(page)).raw.includes(explanation));
    const failed = h.calls.filter(call => call.action === 'revise_request').at(-1);
    h.failSend = false;
    const sending = gate(); h.nextSend = sending;
    await page.locator('#btn-case-submit').evaluate(button => {button.click(); button.click();});
    await sending.entered;
    assert(await page.locator('#case-reply-note').isDisabled());
    assert.equal(writes(h).length, 2);
    assert((await saved(page)).raw.includes(explanation));
    sending.release();
    await page.waitForFunction(() => currentCase()?.status === 'Resubmitted');
    await idle(page);
    assert.equal(h.calls.filter(call => call.action === 'revise_request').at(-1).requestId, failed.requestId);
    assert.equal(h.f.state.created.length, 1);
    assert.equal(JSON.parse(h.f.rows[1][8]).filter(log => log.role === 'mhs' && log.requestId).length, 1);
    assert.equal(JSON.stringify(await draftEntries(page)).includes(explanation), false);
    assert.equal(await page.locator(recovery).count(), 0);
    const successful = h.calls.filter(call => call.action === 'revise_request').at(-1);
    assert.equal(h.f.ctx.nextDispatch(successful).status, 'success');
    assert.equal(h.f.state.created.length, 1);
    assert.equal(JSON.parse(h.f.rows[1][8]).filter(log => log.role === 'mhs' && log.requestId).length, 1);
    pass('Inspection and confirmation retain recovery; failed sends keep files and the draft, repeated retries commit once, and a confirmed success clears recovery');

    const pendingHarness = harness({fieldsOnly: true}), pending = await login(browser, pendingHarness);
    await open(pending);
    await setBasicDraft(pending, {withFile: false});
    await reload(pending);
    const savedBeforeFreshInput = await saved(pending);
    const freshNote = 'Catatan baru yang belum menggantikan draf privat lama.';
    await pending.fill('#case-reply-note', freshNote);
    await pending.fill('#correction-title', 'Judul baru yang sedang diedit');
    await task(pending, 0);
    await pending.locator('[name=correction-complete]').check();
    assert.deepEqual(primary(await saved(pending)), primary(savedBeforeFreshInput));
    await pending.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    assert.deepEqual(primary(await saved(pending)), primary(savedBeforeFreshInput));
    assert.equal(await pending.inputValue('#case-reply-note'), freshNote);
    await pending.locator(discard).click();
    await pending.waitForSelector(recovery, {state: 'hidden'});
    assert.equal(await pending.inputValue('#case-reply-note'), freshNote);
    assert.equal(await pending.inputValue('#correction-title'), 'Judul baru yang sedang diedit');
    assert.equal(JSON.stringify(await draftEntries(pending)).includes(explanation), false);
    assert.equal(writes(pendingHarness).length, 0);
    pass('Fresh edits and unload cannot overwrite an unreviewed saved draft; discarding recovery preserves the current editor without an academic write');

    const twoCopiesHarness = harness({fieldsOnly: true}), twoCopies = await login(browser, twoCopiesHarness);
    await open(twoCopies);
    await setBasicDraft(twoCopies, {withFile: false});
    await reload(twoCopies);
    const newerNote = 'DRAF PRIVAT B: salinan baru tetap dapat dipulihkan setelah draf lama diabaikan.';
    const newerTitle = 'Judul baru untuk salinan B yang disimpan terpisah';
    await twoCopies.fill('#case-reply-note', newerNote);
    await twoCopies.fill('#correction-title', newerTitle);
    await complete(twoCopies);
    const bothCopies = JSON.parse((await saved(twoCopies, newerNote)).raw).requests.fields;
    assert.equal(bothCopies.saved.note, explanation);
    assert.equal(bothCopies.working.note, newerNote);
    await reload(twoCopies);
    const pristineSecondReload = await editor(twoCopies);
    assert.equal(pristineSecondReload.note, '');
    assert.equal(pristineSecondReload.fields.title, 'Judul awal eCommerce');
    await twoCopies.locator(discard).click();
    await twoCopies.waitForFunction(({key, note}) => {
        try {const value = JSON.parse(sessionStorage.getItem(key) || '{}').requests?.fields; return value?.saved?.note === note && !value.working;} catch (_) {return false;}
    }, {key: draftKey, note: newerNote});
    assert(await twoCopies.locator(recovery).isVisible());
    assert.deepEqual(await editor(twoCopies), pristineSecondReload);
    assert((await twoCopies.locator(recovery).textContent()).includes(newerNote));
    assert.equal((await twoCopies.locator(recovery).textContent()).includes(explanation), false);
    await twoCopies.locator(restore).click();
    await twoCopies.waitForFunction(note => document.getElementById('case-reply-note')?.value === note, newerNote);
    assert.equal((await editor(twoCopies)).fields.title, newerTitle);
    assert.deepEqual((await editor(twoCopies)).checked, [true]);
    assert.equal(writes(twoCopiesHarness).length, 0);
    pass('After both copies survive reload, discarding the old offer promotes the newer private copy and keeps it explicitly restorable');

    const failedDiscardHarness = harness({fieldsOnly: true}), failedDiscard = await login(browser, failedDiscardHarness);
    await open(failedDiscard);
    await setBasicDraft(failedDiscard, {withFile: false});
    await reload(failedDiscard);
    const beforeFailedDiscard = await saved(failedDiscard), editorBeforeFailedDiscard = await editor(failedDiscard);
    await failedDiscard.evaluate(key => {
        const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
        window.restoreDiscardStorage = () => {Storage.prototype.setItem = set; Storage.prototype.removeItem = remove;};
        Storage.prototype.setItem = function(name, value) {
            if (this === sessionStorage && name === key) throw new DOMException('Synthetic failed discard', 'QuotaExceededError');
            return set.call(this, name, value);
        };
        Storage.prototype.removeItem = function(name) {
            if (this === sessionStorage && name === key) throw new DOMException('Synthetic failed discard', 'SecurityError');
            return remove.call(this, name);
        };
    }, draftKey);
    await failedDiscard.locator(discard).click();
    await failedDiscard.waitForFunction(() => document.getElementById('student-correction-draft-status')?.dataset.state === 'error');
    assert(await failedDiscard.locator(recovery).isVisible());
    assert((await failedDiscard.locator(recovery).textContent()).includes(explanation));
    assert.deepEqual(await editor(failedDiscard), editorBeforeFailedDiscard);
    assert.equal((await failedDiscard.evaluate(key => sessionStorage.getItem(key), draftKey)), beforeFailedDiscard.raw);
    await failedDiscard.evaluate(() => restoreDiscardStorage());
    await failedDiscard.locator(discard).click();
    await failedDiscard.waitForSelector(recovery, {state: 'hidden'});
    assert.equal(JSON.stringify(await draftEntries(failedDiscard)).includes(explanation), false);
    assert.equal(writes(failedDiscardHarness).length, 0);
    pass('A failed storage discard keeps saved recovery visible and the live editor intact until a successful retry');

    const replaceHarness = harness(), replace = await login(browser, replaceHarness);
    await open(replace);
    await setBasicDraft(replace);
    await reload(replace);
    const freshFile = {name: 'Transkrip-baru-yang-masih-dipilih.pdf', mimeType: 'application/pdf', buffer: previewPdf('Fresh live file must remain the exact object')};
    await upload(replace, freshFile);
    await replace.fill('#case-reply-note', 'Catatan yang sedang diedit sebelum memilih pemulihan.');
    await replace.evaluate(() => window.freshRecoveryFile = document.getElementById('case-reply-files').files[0]);
    let replacementPrompts = 0, acceptReplacement = false;
    const acceptDialogs = replace.listeners('dialog')[0];
    replace.removeListener('dialog', acceptDialogs);
    replace.on('dialog', dialog => {replacementPrompts++; return acceptReplacement ? dialog.accept() : dialog.dismiss();});
    const beforeCancelledRestore = await editor(replace);
    await replace.locator(restore).click();
    assert.equal(replacementPrompts, 1);
    assert.deepEqual(await editor(replace), beforeCancelledRestore);
    assert(await replace.evaluate(() => document.getElementById('case-reply-files').files[0] === freshRecoveryFile));
    assert(await replace.locator(recovery).isVisible());
    acceptReplacement = true;
    await replace.locator(restore).click();
    await replace.waitForFunction(value => document.getElementById('case-reply-note')?.value === value, explanation);
    assert.equal(replacementPrompts, 2);
    assert(await replace.evaluate(() => document.getElementById('case-reply-files').files[0] === freshRecoveryFile));
    assert.equal(await replace.inputValue('#revision-label-0'), 'Transkrip');
    assert.equal((await editor(replace)).fields.title, title);
    assert.equal(writes(replaceHarness).length, 0);
    pass('Restoring over fresh edits respects cancellation and preserves the exact currently selected File object and its document label after confirmation');

    const delayedHarness = harness({fieldsOnly: true, supervisors: true}), delayed = await login(browser, delayedHarness);
    await open(delayed);
    const supervisorFields = {oldSupervisor: 'Dosen Lama O’Connor', newSupervisor: 'Dosen Baru eCommerce', reason: 'Alasan privat\nLiteral <img src=x onerror=alert(1)> & nama internasional.'};
    for (const [name, value] of Object.entries(supervisorFields)) await delayed.fill('[data-correction-field="' + name + '"]', value);
    await delayed.fill('#case-reply-note', explanation);
    await complete(delayed);
    await saved(delayed);
    const loading = gate(); delayedHarness.nextFields = loading;
    await reload(delayed, {waitFields: false});
    await loading.entered;
    assert.equal(await delayed.locator('[data-correction-field]').count(), 0);
    await delayed.locator(restore).click();
    assert.equal(writes(delayedHarness).length, 0);
    loading.release();
    await delayed.waitForFunction(value => document.querySelector('[data-correction-field="reason"]')?.value === value, supervisorFields.reason);
    assert.deepEqual((await editor(delayed)).fields, supervisorFields);
    assert.equal((await editor(delayed)).note, explanation);
    assert.deepEqual((await editor(delayed)).checked, [true]);
    assert.equal((await editor(delayed)).task, '0');
    assert.equal(await delayed.locator('#case-action-panel img').count(), 0);
    assert.equal(writes(delayedHarness).length, 0);
    pass('Explicit restore waits for delayed authoritative form fields and recovers every supervisor-change field, literal text, and completion choice');

    await saved(delayed);
    const cancelledLoading = gate(); delayedHarness.nextFields = cancelledLoading;
    await reload(delayed, {waitFields: false});
    await cancelledLoading.entered;
    await delayed.locator(restore).click();
    await delayed.fill('#case-reply-note', 'Catatan baru diketik saat pemulihan masih menunggu isian.');
    cancelledLoading.release();
    await delayed.waitForSelector('[data-correction-field="reason"]', {state: 'attached'});
    assert.equal((await editor(delayed)).note, 'Catatan baru diketik saat pemulihan masih menunggu isian.');
    assert.deepEqual((await editor(delayed)).fields, {oldSupervisor: 'Dosen Lama', newSupervisor: 'Dosen Usulan', reason: 'Alasan awal'});
    assert.equal(writes(delayedHarness).length, 0);
    pass('Typing while restore waits for authoritative fields cancels the pending restore and prevents a late overwrite');

    const staleHarness = harness({fieldsOnly: true}), stale = await login(browser, staleHarness);
    await open(stale);
    await setBasicDraft(stale, {withFile: false});
    await saved(stale);
    staleHarness.f.rows[1][8] = JSON.stringify([...JSON.parse(staleHarness.f.rows[1][8]), {role: 'admin', message: 'Berkas yang perlu diperbaiki:\n- Isian pengajuan\n\nInstruksi:\nInstruksi terbaru dari admin data uji.'}]);
    staleHarness.f.rows[1][5] = '<b>Judul:</b> Judul terbaru dari admin';
    await reload(stale);
    const originalStale = await saved(stale);
    assert.match(await stale.locator(recovery).textContent(), /berubah|changed|hanya.*baca|read.only/i);
    if (await stale.locator(restore).count()) assert(await stale.locator(restore).isDisabled());
    assert((await stale.locator(recovery).textContent()).includes(explanation));
    assert.equal((await editor(stale)).fields.title, 'Judul terbaru dari admin');
    assert.equal((await editor(stale)).note, '');
    await stale.fill('#case-reply-note', 'Perbaikan baru untuk instruksi yang telah berubah.');
    await stale.fill('#correction-title', 'Judul perbaikan mengikuti instruksi terbaru');
    await complete(stale);
    await stale.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    assert.deepEqual(primary(await saved(stale)), primary(originalStale));
    assert.equal(writes(staleHarness).length, 0);
    await stale.locator(discard).click();
    assert.equal((await editor(stale)).note, 'Perbaikan baru untuk instruksi yang telah berubah.');
    assert.equal(writes(staleHarness).length, 0);
    pass('Changed request snapshots expose saved contents read-only, retain the latest authoritative fields, and cannot overwrite the unreviewed old draft');

    const storageHarness = harness({fieldsOnly: true}), unavailable = await login(browser, storageHarness);
    await open(unavailable);
    await unavailable.evaluate(() => {
        const original = Storage.prototype.setItem;
        window.restoreDraftStorage = () => {Storage.prototype.setItem = original;};
        Storage.prototype.setItem = function(key, value) {
            if (this === sessionStorage && /correction.*draft/.test(key)) throw new DOMException('Synthetic unavailable storage', 'QuotaExceededError');
            return original.call(this, key, value);
        };
    });
    await unavailable.fill('#correction-title', title);
    await unavailable.fill('#case-reply-note', explanation);
    await complete(unavailable);
    await unavailable.waitForFunction(() => /belum (?:dapat|bisa|tersimpan)|gagal|tidak.*(?:bisa|dapat|tersedia)|could not|cannot|unable/i.test(document.getElementById('student-correction-draft-status')?.textContent || ''));
    assert.equal((await editor(unavailable)).note, explanation);
    assert.equal((await editor(unavailable)).fields.title, title);
    assert.equal(writes(storageHarness).length, 0);
    await unavailable.evaluate(() => restoreDraftStorage());
    await unavailable.fill('#case-reply-note', explanation + ' Setelah penyimpanan tersedia.');
    await saved(unavailable, 'Setelah penyimpanan tersedia.');
    pass('Unavailable session storage reports a save failure while preserving the live editor, and a later edit resumes private recovery');

    const lifecycleHarness = harness({fieldsOnly: true}), lifecycle = await login(browser, lifecycleHarness);
    await open(lifecycle);
    await setBasicDraft(lifecycle, {withFile: false});
    const lateFields = gate(); lifecycleHarness.nextFields = lateFields;
    await reload(lifecycle, {waitFields: false});
    await lateFields.entered;
    await lifecycle.locator(restore).click();
    await lifecycle.evaluate(() => logoutUser());
    await lifecycle.waitForSelector('#welcome-modal', {state: 'visible'});
    assert.equal(JSON.stringify(await draftEntries(lifecycle)).includes(explanation), false);
    await authenticate(lifecycle, 'B');
    await open(lifecycle, {id: 'other'});
    await lifecycle.fill('#case-reply-note', 'DRAF PRIVAT B: milik akun kedua.');
    await lifecycle.fill('#correction-title', 'Judul akun B');
    await complete(lifecycle);
    await saved(lifecycle, 'DRAF PRIVAT B');
    const lateResponse = lifecycle.waitForResponse(response => {
        if (!response.url().includes('script.google.com/macros/')) return false;
        try {const data = response.request().postDataJSON(); return data.action === 'get_revision_form' && data.token === 'student-A';} catch (_) {return false;}
    });
    lateFields.release();
    await (await lateResponse).finished();
    await lifecycle.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await lifecycle.waitForFunction(() => document.querySelector('[data-correction-field="title"]')?.value === 'Judul akun B');
    assert.equal((await editor(lifecycle)).note, 'DRAF PRIVAT B: milik akun kedua.');
    assert.equal((await editor(lifecycle)).fields.title, 'Judul akun B');
    assert(await lifecycle.locator(recovery).isHidden());
    assert.equal(JSON.stringify(await draftEntries(lifecycle)).includes(explanation), false);
    await lifecycle.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    assert.equal(JSON.stringify(await draftEntries(lifecycle)).includes(explanation), false);
    await lifecycle.evaluate(() => logoutUser());
    await lifecycle.waitForSelector('#welcome-modal', {state: 'visible'});
    assert.equal(JSON.stringify(await draftEntries(lifecycle)).includes('DRAF PRIVAT B'), false);
    await authenticate(lifecycle, 'A');
    await open(lifecycle);
    assert(await lifecycle.locator(recovery).isHidden());
    assert.equal((await editor(lifecycle)).note, '');
    assert.equal(writes(lifecycleHarness).length, 0);
    pass('Logout clears private recovery; account changes and a late form callback cannot restore or save another student’s draft');

    const lateSendHarness = harness({fieldsOnly: true}), lateSendPage = await login(browser, lateSendHarness);
    await open(lateSendPage);
    await setBasicDraft(lateSendPage, {withFile: false});
    await lateSendPage.locator('#btn-case-submit').click();
    await lateSendPage.waitForSelector('#correction-summary', {state: 'visible'});
    await idle(lateSendPage);
    const lateSend = gate(); lateSendHarness.nextSend = lateSend;
    await lateSendPage.locator('#btn-case-submit').click();
    await lateSend.entered;
    await lateSendPage.evaluate(() => logoutUser());
    await lateSendPage.waitForSelector('#welcome-modal', {state: 'visible'});
    await authenticate(lateSendPage, 'B');
    await open(lateSendPage, {id: 'other'});
    await lateSendPage.fill('#case-reply-note', 'DRAF PRIVAT B: tetap ada setelah kiriman lama selesai.');
    await lateSendPage.fill('#correction-title', 'Judul B setelah akun A keluar');
    await complete(lateSendPage);
    const secondAccountDraft = await saved(lateSendPage, 'DRAF PRIVAT B');
    const lateSendResponse = lateSendPage.waitForResponse(response => {
        if (!response.url().includes('script.google.com/macros/')) return false;
        try {return response.request().postDataJSON().action === 'revise_request';} catch (_) {return false;}
    });
    lateSend.release();
    await (await lateSendResponse).finished();
    await lateSendPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await saved(lateSendPage, 'DRAF PRIVAT B')).raw, secondAccountDraft.raw);
    assert.equal((await editor(lateSendPage)).note, 'DRAF PRIVAT B: tetap ada setelah kiriman lama selesai.');
    assert.equal((await editor(lateSendPage)).fields.title, 'Judul B setelah akun A keluar');
    assert.equal(await lateSendPage.evaluate(() => currentUser.nim), 'B');
    assert.equal(lateSendHarness.f.rows[1][7], 'Resubmitted');
    assert.equal(lateSendHarness.f.rows[2][7], 'Revision');
    assert.equal(writes(lateSendHarness).length, 1);
    pass('A confirmed send completing after logout cannot clear or alter the next account’s private draft');

    assert.deepEqual(violations, []);
    assert.deepEqual(errors, []);
    fs.writeFileSync('test-results/student-correction-drafts.json', JSON.stringify({checks, layouts, errors, unexpectedAcademicActions: violations, syntheticAPI: true}, null, 2));
    await browser.close();
})().catch(reportFailure);
