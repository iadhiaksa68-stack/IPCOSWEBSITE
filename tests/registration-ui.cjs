const {selectService, showFiles} = require('./registration-helpers.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, reportFailure} = require('./browser.cjs');
const {pdf} = require('./fixtures.cjs');

// All academic requests are intercepted, including autosaved drafts. No real
// student record, uploaded document, or administrative decision is changed.
const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const services = {
    Outline: ['file-transkrip', 'file-proposal'],
    Proposal: ['file-acc-sempro'],
    Pendadaran: ['file-folder-pendadaran'],
    'Skripsi Jurnal': ['file-loa-jurnal', 'file-draft-jurnal'],
    'Pergantian Pembimbing': ['file-surat-ganti']
};
const steps = ['service', 'data', 'files', 'review'];
const calls = [], errors = [], checks = [], records = [];
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const createCalls = () => calls.filter(data => data.action === 'create');
const title = 'eCommerce, komunikasi digital & partisipasi mahasiswa internasional O’Connor';
let nextCreate = null;

function gate() {
    let enter, release;
    return {entered: new Promise(resolve => enter = resolve), wait: new Promise(resolve => release = resolve), enter: () => enter(), release: () => release()};
}
async function mode(page, width, lang, dark) {
    await page.setViewportSize({width, height:900});
    await page.evaluate(({lang, dark}) => {
        if (currentLang !== lang) toggleLanguage();
        if (document.body.classList.contains('dark-mode') !== dark) toggleDarkMode();
    }, {lang, dark});
}
async function currentStep(page, expected) {
    const current = page.locator('#registration-stepper [aria-current="step"]');
    assert.equal(await current.count(), 1, 'Exactly one registration step is current');
    assert.equal(await current.getAttribute('data-registration-step'), expected);
    for(const [step,id] of Object.entries({service:'registration-service-step',data:'registration-data-step',files:'registration-document-step',review:'registration-review'})) {
        assert.equal(await page.locator('#'+id).isVisible(),step===expected,'Only '+expected+' is visible; '+step+' panel');
    }
    assert.equal(await page.locator('#btn-submit-registration').isVisible(),expected==='review','Final confirmation is only visible during review');
    assert.equal(await page.locator('#registration-data-next').isVisible(),expected==='data');
    assert.equal(await page.locator('#btn-review-registration').isVisible(),expected==='files');
}
async function rememberFiles(page, ids) {
    await page.evaluate(ids => {
        window.registrationUITestSelection = ids.map(id => ({id, input:document.getElementById(id), file:document.getElementById(id).files[0]}));
    }, ids);
}
async function sameFiles(page, label) {
    assert.deepEqual(await page.evaluate(() => window.registrationUITestSelection.map(({id, input, file}) => ({id, sameInput:input === document.getElementById(id), sameFile:file === document.getElementById(id).files[0]}))),
        await page.evaluate(() => window.registrationUITestSelection.map(({id}) => ({id, sameInput:true, sameFile:true}))), label);
}
async function layout(page, label) {
    const state = await page.locator('#pendaftaran').evaluate(root => {
        const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[hidden],details:not([open])>:not(summary)');
        const clipped = [...root.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,dt')]
            .filter(node => visible(node) && node.clientWidth && !node.classList.contains('sr-only'))
            .filter(node => node.scrollWidth > node.clientWidth + 3 && getComputedStyle(node).textOverflow !== 'ellipsis')
            .map(node => ({id:node.id, text:node.textContent.trim().slice(0,90)}));
        const buttons = [...root.querySelectorAll('#registration-stepper button,#registration-service-next,#registration-actions>button,.upload-file-actions button')].filter(visible).map(node => ({
            name:node.dataset.registrationStep||node.id||node.textContent, rect:node.getBoundingClientRect().toJSON(), clipped:node.scrollWidth > node.clientWidth + 3
        }));
        return {overflow:document.documentElement.scrollWidth > innerWidth + 2, clipped, buttons};
    });
    assert.equal(state.overflow, false, label + ' viewport overflow');
    assert.deepEqual(state.clipped, [], label + ' clipped text');
    assert(state.buttons.length >= 5);
    for (const button of state.buttons) {
        assert(button.rect.width > 0 && button.rect.height >= 43.99, label + ' usable step ' + button.name);
        assert(button.rect.left >= -1 && button.rect.right <= (await page.viewportSize()).width + 1, label + ' step inside viewport ' + button.name);
        assert.equal(button.clipped, false, label + ' complete step label ' + button.name);
    }
    for (let a=0; a<state.buttons.length; a++) for (let b=a+1; b<state.buttons.length; b++) {
        const x=state.buttons[a].rect,y=state.buttons[b].rect;
        assert(!(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1 && Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1), label + ' overlapping steps');
    }
}
async function fill(page, type) {
    await page.locator('[data-registration-step="data"]').click();
    if (type === 'Pergantian Pembimbing') {
        await page.fill('#reg-dosen-lama', 'Dr. Pembimbing Sekarang O’Connor');
        await page.fill('#reg-dosen-baru', 'Dr. Usulan Pembimbing Internasional');
        await page.fill('#reg-alasan-ganti', 'Penyesuaian bidang kajian eCommerce dan komunikasi digital.');
    } else await page.fill('#reg-judul', title + ' — ' + type);
    await page.locator('[data-registration-files-next]').click();
    await currentStep(page,'files');
    for (const id of services[type]) await page.setInputFiles('#' + id, {
        name: id + '-dokumen-pengajuan-mahasiswa-internasional-eCommerce.pdf', mimeType:'application/pdf', buffer:pdf(type + ' ' + id)
    });
    await page.waitForFunction(() => [...document.querySelectorAll('#registration-fields input[type=file]')].every(input => !input.files[0] || documentInspections.get(input.files[0])?.pending === false));
    await rememberFiles(page, services[type]);
}

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({viewport:{width:1365,height:900}, reducedMotion:'reduce'});
    await context.route('**/*', async route => {
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON(); calls.push(data); let result;
            if (data.action === 'student_login') result = {status:'success', token:'registration-student-A', nama:'Mahasiswa Internasional Pengujian O’Connor'};
            else if (data.action === 'get_data') result = {status:'success', registrations:structuredClone(records), students:[], dosens:[], contents:[], announcements:[], services:Object.keys(services).map(type => ({type,enabled:true,open:'',close:'',adminDays:3,studentDays:7}))};
            else if (data.action === 'get_journey') result = {status:'success', journey:{checks:{},revision:1}};
            else if (data.action === 'get_sop') result = {status:'success', document:{schema:1,type:data.type,revision:1,updatedAt:'2026-10-15T01:00:00Z',title:'Panduan Pendaftaran Uji',titleEn:'Registration Test Guide',intro:'Baca contoh sebelum mengirim.',introEn:'Read the example before submitting.',sections:[{id:'registration-guide',title:'Persyaratan berkas',titleEn:'Document requirements',body:'Periksa isi dan tanda tangan.',bodyEn:'Check the contents and signatures.',links:[],files:[]}]}};
            else if (data.action === 'create') {
                assert.equal(data.token, 'registration-student-A');
                const held = nextCreate; nextCreate = null;
                if (held) { held.enter(); await held.wait; result={status:'error',message:'Gangguan pengiriman khusus pengujian.'}; }
                else {
                    const record={id:'registration-ui-created',nim:'A',nama:'Mahasiswa Pengujian',jenis:data.jenis,status:'Pending',date:'2026-10-15T02:00:00Z',detail:data.detail,link:'',note:'[]'};
                    records.push(record); result={status:'success',id:record.id,date:record.date};
                }
            } else if (data.action === 'logout') result = {status:'success'};
            else if (await require('./next-mock.cjs')(route,data)) return;
            else throw Error('Unexpected registration UI API ' + data.action);
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if (url.startsWith(origin)) return route.continue();
        if (url.includes('chart.js')) return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});
        return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(origin); await page.fill('#input-nim','A'); await page.locator('#input-nim').press('Enter');
    await page.waitForSelector('#welcome-modal',{state:'hidden'}); await page.waitForFunction(() => syncPhase === 'success');
    await page.evaluate(() => switchTab(null,'pendaftaran'));
    assert.deepEqual(await page.locator('#registration-stepper [data-registration-step]').evaluateAll(nodes => nodes.map(node => node.dataset.registrationStep)), steps);
    await currentStep(page,'service');
    for (const step of steps.slice(1)) assert(await page.locator('[data-registration-step="' + step + '"]').isDisabled(), 'No empty-service navigation to ' + step);
    for (const width of [320,390,768,1365]) for (const lang of ['id','en']) for (const dark of [false,true]) {
        await mode(page,width,lang,dark); await layout(page,`empty ${width}/${lang}/${dark}`);
    }
    await page.selectOption('#reg-jenis-utama','Outline');
    await currentStep(page,'service');assert(await page.locator('#registration-service-next').isEnabled());
    await page.locator('#registration-service-next').focus();await page.locator('#registration-service-next').press('Enter');
    await currentStep(page,'data');await page.fill('#reg-judul',title);
    await page.locator('#reg-judul').press('Enter');await currentStep(page,'files');
    await page.locator('#registration-back').click();await currentStep(page,'data');
    assert.equal(await page.inputValue('#reg-judul'),title);await page.locator('#registration-back').click();await currentStep(page,'service');
    assert.equal(await page.inputValue('#reg-jenis-utama'),'Outline');assert.equal(createCalls().length,0);
    pass('Selecting a service stays on its panel; explicit Continue and Enter advance one stage, and Back retains the title without sending');
    pass('Empty registration exposes four accessible steps and requires service selection in all 16 screen/language/theme combinations');

    for (const type of Object.keys(services)) {
        await mode(page,1365,'id',false); await selectService(page,type);
        assert.deepEqual(await page.locator('#registration-fields input[type=file]').evaluateAll(nodes => nodes.filter(node => node.required).map(node => node.id).sort()), [...services[type]].sort(), type + ' only requires its own files');
        assert(await page.locator('#registration-companion #registration-readiness').isVisible());
        assert(await page.locator('#registration-data-step').isVisible()); assert(await page.locator('#registration-document-step').isHidden());
        await page.locator('[data-registration-step="data"]').focus(); await page.locator('[data-registration-step="data"]').press('Enter');
        await currentStep(page,'data');
        assert.equal(await page.evaluate(() => document.activeElement.id), type === 'Pergantian Pembimbing' ? 'reg-dosen-lama' : 'reg-judul');
        if (type === 'Outline') {
            await page.fill('#reg-judul',''); await page.locator('[data-registration-files-next]').click();
            await currentStep(page,'data'); assert.equal(await page.getAttribute('#reg-judul','aria-invalid'),'true');
            assert.equal(await page.evaluate(() => document.activeElement.id),'reg-judul');
            await page.fill('#reg-judul',title); await page.locator('[data-registration-files-next]').click(); await currentStep(page,'files');
            await page.locator('[data-registration-step="review"]').click(); await page.waitForFunction(() => !preflightBusy);
            assert(await page.locator('#registration-review').isHidden()); assert.equal(await page.getAttribute('#file-transkrip','aria-invalid'),'true');
            assert.equal(await page.evaluate(() => document.activeElement.id),'file-transkrip'); await currentStep(page,'files');
        }
        await fill(page,type);
        await page.locator('[data-registration-step="files"]').click(); await currentStep(page,'files');
        const visibleFiles=await page.locator('#registration-fields input[type=file]').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length&&!node.closest('[hidden]')).map(node=>node.id).sort());
        assert.deepEqual(visibleFiles,[...services[type]].sort(),type+' shows exactly its own file fields');
        if(type==='Outline') {
            await page.evaluate(()=>{serviceSettings.find(item=>item.type==='Outline').enabled=false;refreshServiceAvailability();});
            assert(await page.locator('#service-availability').isVisible(),'A service closing during entry remains visible');
            assert(await page.locator('#btn-review-registration').isDisabled());await sameFiles(page,'Closing service retains selected files');
            await page.locator('#registration-back').click();await currentStep(page,'data');
            assert(await page.locator('#service-availability').isVisible());
            await page.locator('#registration-back').click();await currentStep(page,'service');
            await page.evaluate(()=>{serviceSettings.find(item=>item.type==='Outline').enabled=true;refreshServiceAvailability();});
            await page.locator('#registration-service-next').click();await page.locator('[data-registration-files-next]').click();await currentStep(page,'files');
        }
        assert.equal(await page.evaluate(() => document.activeElement.id), services[type][0]);
        for (const width of [320,390,768,1365]) for (const lang of ['id','en']) for (const dark of [false,true]) {
            await mode(page,width,lang,dark); await layout(page,`${type} fields ${width}/${lang}/${dark}`);
            await sameFiles(page,type + ' selected files survive language/theme/width changes');
        }
        if(type==='Outline') {
            await mode(page,1365,'id',false);await page.waitForFunction(()=>!document.querySelector('#toast-container .toast'));await page.locator('#pendaftaran').screenshot({path:'test-results/registration-single-stage-files-desktop.png'});
            await mode(page,390,'id',true);await page.locator('#registration-main').screenshot({path:'test-results/registration-single-stage-files-mobile-dark.png'});
        }
        await page.locator('#registration-back').click();await currentStep(page,'data');
        await sameFiles(page,type+' back to details retains exact files');
        assert.equal(await page.locator('#form-submit-status').textContent(),'','Resolved validation messages clear after completing the details');
        for(const width of [320,390,768,1365])for(const lang of ['id','en'])for(const dark of [false,true]) {
            await mode(page,width,lang,dark);await layout(page,`${type} details ${width}/${lang}/${dark}`);await currentStep(page,'data');
        }
        if(type==='Outline') {await mode(page,390,'id',false);await page.locator('#registration-main').screenshot({path:'test-results/registration-single-stage-data-mobile.png'});}

        await page.locator('#registration-back').click();await currentStep(page,'service');
        await sameFiles(page,type+' back to service retains exact files');
        await page.locator('#registration-service-next').click();await page.locator('[data-registration-files-next]').click();await currentStep(page,'files');
        await page.locator('[data-registration-step="review"]').click(); await page.waitForSelector('#review-heading');
        assert(await page.locator('#registration-fields').isHidden()); await currentStep(page,'review');
        assert.equal(await page.locator('#registration-review .review-files li').count(), services[type].length);
        for (const width of [320,390,768,1365]) for (const lang of ['id','en']) for (const dark of [false,true]) {
            await mode(page,width,lang,dark); await layout(page,`${type} review ${width}/${lang}/${dark}`);
            await sameFiles(page,type + ' summary preserves selected File identities');
        }
        await mode(page,320,'id',false);
        await page.locator('#registration-back').click();await currentStep(page,'files');await sameFiles(page,type+' review-back retains exact files');
        await page.locator('#btn-review-registration').click();await page.waitForSelector('#review-heading');
        await page.locator('#btn-edit-registration').focus();await page.locator('#btn-edit-registration').press('Enter');assert(await page.locator('#registration-fields').isVisible());
        const editField=type==='Pergantian Pembimbing'?'reg-dosen-lama':'reg-judul';
        assert.equal(await page.evaluate(()=>document.activeElement.id),editField,'Editing returns focus to the visible first detail field');
        const editBounds=await page.locator('#'+editField).boundingBox();assert(editBounds&&editBounds.y>=0&&editBounds.y+editBounds.height<=900,'The focused edit field is within the mobile viewport');
        await sameFiles(page,type + ' edit retains input nodes and exact File objects');
        await page.locator('[data-registration-step="service"]').click(); await currentStep(page,'service');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'reg-jenis-utama');
        assert.equal(createCalls().length, 0, 'Navigation/review must never submit ' + type);
    }
    pass('All five services show only their requirements; keyboard navigation, summary/edit, and 240 populated details/files/review layouts preserve exact File objects without creating a request');

    await mode(page,390,'id',true); await selectService(page,'Outline'); await fill(page,'Outline');
    await page.locator('#file-proposal-guidance [data-guide="sop-tugas-akhir"]').click();
    await page.waitForSelector('#sop_tugas_akhir-view .sop-section'); await page.locator('[data-guide-return]').click();
    assert.equal(await page.inputValue('#reg-judul'), title + ' — Outline'); await sameFiles(page,'SOP detour preserves exact original file objects');
    await page.locator('#file-transkrip-guidance [data-guide="templates-faq"]').click(); await page.locator('[data-guide-return]').click();
    await sameFiles(page,'Template detour preserves exact original file objects'); assert.equal(createCalls().length,0);
    pass('Contextual SOP and template detours return to the same in-progress registration with text, files and no academic writes');

    await selectService(page,'Pergantian Pembimbing'); await fill(page,'Pergantian Pembimbing');
    await page.locator('[data-registration-step="data"]').click(); await page.fill('#reg-dosen-baru','  Dr. Pembimbing Sekarang O’Connor  '); await page.locator('[data-registration-step="review"]').click();
    await page.waitForFunction(() => !preflightBusy); assert(await page.locator('#registration-review').isHidden());
    assert.equal(await page.getAttribute('#reg-dosen-baru','aria-invalid'),'true');
    assert.equal(await page.evaluate(() => document.activeElement.id),'reg-dosen-baru');
    assert((await page.getAttribute('#reg-dosen-baru','aria-describedby')).includes('reg-dosen-baru-error'));
    await page.fill('#reg-dosen-baru','Dr. Dosen Berbeda'); assert.equal(await page.getAttribute('#reg-dosen-baru','aria-invalid'),'false');
    await sameFiles(page,'Inline correction preserves selected letter'); assert.equal(createCalls().length,0);
    pass('The review step uses real field validation and focuses an accessible inline supervisor error without losing the selected document');

    await page.evaluate(() => {
        const original = File.prototype.arrayBuffer;
        window.registrationSlowReadEntered = false;
        File.prototype.arrayBuffer = function() {
            if (this.name.startsWith('registration-delayed-preflight-')) {
                window.registrationSlowReadEntered = true;
                return new Promise(resolve => window.registrationReleaseSlowRead = resolve).then(() => original.call(this));
            }
            return original.call(this);
        };
    });
    for (const change of ['text','file','service','service-roundtrip']) {
        await selectService(page,'Proposal'); await page.fill('#reg-judul',title); await showFiles(page);
        await page.evaluate(() => window.registrationSlowReadEntered=false);
        await page.setInputFiles('#file-acc-sempro',{name:'registration-delayed-preflight-'+change+'.pdf',mimeType:'application/pdf',buffer:pdf('delayed preflight '+change)});
        await page.waitForFunction(() => window.registrationSlowReadEntered);
        await page.locator('[data-registration-step="review"]').click(); await page.waitForFunction(() => preflightBusy);
        if (change === 'text') await page.evaluate(value=>{const field=document.getElementById('reg-judul');field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));},title+' — diperbarui saat pemeriksaan');
        else if (change === 'file') await page.setInputFiles('#file-acc-sempro',{name:'replacement-after-preflight.pdf',mimeType:'application/pdf',buffer:pdf('replacement file')});
        else {
            await page.evaluate(roundtrip=>{const select=document.getElementById('reg-jenis-utama');select.value='Pendadaran';toggleExamForm();if(roundtrip){select.value='Proposal';toggleExamForm();}},change==='service-roundtrip');
        }
        await page.evaluate(() => window.registrationReleaseSlowRead()); await page.waitForFunction(() => !preflightBusy);
        assert(await page.locator('#registration-review').isHidden(), 'Stale '+change+' preflight must not advance');
        assert.equal(await page.inputValue('#reg-jenis-utama'),change === 'service' ? 'Pendadaran' : 'Proposal');
        if (change === 'text') assert.equal(await page.inputValue('#reg-judul'),title+' — diperbarui saat pemeriksaan');
        else if (change === 'file') assert.equal(await page.locator('#file-acc-sempro').evaluate(node=>node.files[0].name),'replacement-after-preflight.pdf');
        else {await currentStep(page,'service');await page.locator('#registration-service-next').click();await showFiles(page);assert(await page.locator(change === 'service' ? '#file-folder-pendadaran' : '#file-acc-sempro').isVisible());}
        assert.equal(createCalls().length,0);
    }
    pass('Delayed preflights cannot open stale summaries after text/file/service changes, including service A to B to A');

    await selectService(page,'Outline'); await fill(page,'Outline'); await page.locator('[data-registration-step="review"]').click();
    await page.waitForSelector('#review-heading'); await rememberFiles(page,services.Outline);
    const pending=gate(); nextCreate=pending; await page.locator('#btn-submit-registration').click(); await pending.entered;
    assert(await page.locator('#btn-submit-registration').isDisabled()); assert(await page.locator('#btn-edit-registration').isDisabled());
    await mode(page,390,'en',true);
    assert(await page.locator('#btn-edit-registration').isDisabled(),'Changing language must not unlock the regenerated editing control during upload');
    assert(await page.locator('#registration-back').isDisabled());await sameFiles(page,'Pending upload keeps the original selection across language changes');
    await mode(page,390,'id',false);
    for (const step of steps) assert(await page.locator('[data-registration-step="'+step+'"]').isDisabled(), 'Pending upload visibly disables '+step+' navigation');
    assert(await page.locator('#registration-review').isVisible()); await currentStep(page,'review'); await sameFiles(page,'Pending request retains selected files');
    await page.evaluate(() => submitForm(new Event('submit',{cancelable:true}))); assert.equal(createCalls().length,1,'Busy guard rejects duplicate submission');
    pending.release(); await page.waitForFunction(() => !isSubmittingRegistration);
    assert(await page.locator('#registration-review').isVisible()); assert(await page.locator('#registration-fields').isHidden());
    assert(!(await page.locator('#btn-submit-registration').isDisabled())); await sameFiles(page,'Failed request retains exact File objects');
    for (const step of steps) assert(!(await page.locator('[data-registration-step="'+step+'"]').isDisabled()), 'Failed upload restores '+step+' navigation');
    assert.equal(await page.inputValue('#reg-judul'),title + ' — Outline'); await currentStep(page,'review');
    const first=createCalls()[0]; assert.equal(first.jenis,'Outline'); assert.deepEqual(first.files.map(file=>file.label),['Transkrip','Proposal']);
    assert(first.files.every(file=>Buffer.from(file.base64,'base64').subarray(0,5).toString() === '%PDF-'));
    await page.locator('#btn-submit-registration').click(); await page.waitForSelector('#modal-submission-receipt',{state:'visible'});
    assert.equal(createCalls().length,2); assert.equal(createCalls()[1].requestId,first.requestId,'Retry uses the same idempotency key'); assert.equal(records.length,1);
    await page.evaluate(() => closeModal('modal-submission-receipt',true));
    assert.equal(await page.inputValue('#reg-jenis-utama'),''); await currentStep(page,'service');
    for (const step of steps.slice(1)) assert(await page.locator('[data-registration-step="'+step+'"]').isDisabled());
    assert.equal(await page.locator('#registration-fields input[type=file]').evaluateAll(nodes=>nodes.reduce((count,node)=>count+node.files.length,0)),0);
    pass('Pending/failed submission preserves the review and exact files, blocks duplicates, retries idempotently and resets all steps only after confirmation');

    assert.deepEqual(errors,[]); assert.equal(calls.filter(data=>['update','revise_request','save_document_review','post_announcement'].includes(data.action)).length,0);
    fs.mkdirSync('test-results',{recursive:true}); fs.writeFileSync('test-results/registration-ui-results.json',JSON.stringify({checks,errors},null,2));
    await browser.close();
})().catch(reportFailure);
