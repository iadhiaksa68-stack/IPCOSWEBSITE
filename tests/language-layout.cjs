const {chromium,reportFailure} = require('./browser.cjs');
const assert = require('node:assert/strict');
const {pdf} = require('./fixtures.cjs');
const fs = require('node:fs');
let records = [], calls = [], errors = [], checks = [];
const pass = text => { checks.push(text); console.log('PASS ' + text); };
const revision = {id:'revision',nim:'A',nama:'Mahasiswa Uji Internasional',jenis:'Pendadaran',status:'Revision',date:'2026-10-01',detail:'<b>Judul:</b> Judul asli mahasiswa tetap utuh',link:'<a href="https://example.com/defense.pdf">Berkas Pendadaran</a>',note:JSON.stringify([{role:'admin',sender:'Admin',time:'2026-10-02',message:'Berkas yang perlu diperbaiki:\n- Berkas Pendadaran\n\nInstruksi:\nInstruksi asli dari admin, jangan diubah.'}])};
async function mock(context) {
    await context.route('**/*',async route=>{
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON(); calls.push(data); let result;
            if (data.action === 'student_login') result = data.nim === 'invalid' ? {status:'error',message:'NIM tidak terdaftar.'} : {status:'success',nama:'Mahasiswa Uji Internasional',token:'student'};
            else if (data.action === 'admin_login') result = {status:'success',token:'admin'};
            else if (data.action === 'get_data') result = {status:'success',registrations:structuredClone(data.token === 'admin' ? records : records.filter(item=>item.nim === 'A')),students:[{NIM:'A',Nama:'Mahasiswa Uji Internasional',Status:'Aktif'}],dosens:[{Nama:'Dosen Uji',Terpakai:0,Maksimal:5}],contents:[],announcements:[],services:[]};
            else if (data.action === 'create') {
                const item = {id:'created',nim:'A',nama:'Mahasiswa Uji Internasional',jenis:data.jenis,detail:data.detail,date:data.date,status:'Pending',link:'',note:'[]'};
                records.push(item); result = {status:'success',id:item.id,date:item.date};
            } else if (data.action === 'update') {
                const item = records.find(item=>item.id === data.id); item.status = data.status;
                const logs = JSON.parse(item.note); logs.push({role:data.token === 'admin' ? 'admin' : 'mhs',sender:'Test',message:data.noteText,time:new Date().toISOString()}); item.note = JSON.stringify(logs);
                result = {status:'success'};
            } else if (data.action === 'update_content') result = {status:'success'};
            else if (data.action === 'logout') result = {status:'success'};
            else throw Error('Unexpected request '+data.action);
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if (url.startsWith('http://127.0.0.1:8766')) return route.continue();
        if (url.includes('chart.js')) return route.fulfill({contentType:'text/javascript',body:'window.Chart=class {static defaults={font:{}};destroy(){};constructor(){}};'});
        return route.abort();
    });
}
async function layout(page,label) {
    const result = await page.evaluate(()=>({
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        clipped:[...document.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,.nav-item,.user-subtext')].filter(el=>el.getClientRects().length && el.clientWidth>0 && !el.closest('table')).filter(el=>el.scrollWidth>el.clientWidth+3).map(el=>({id:el.id,tag:el.tagName,text:el.textContent.trim().slice(0,90),width:el.clientWidth,scroll:el.scrollWidth}))
    }));
    assert.equal(result.overflow,false,label+' page overflow'); assert.deepEqual(result.clipped,[],label+' clipped text');
}
(async()=>{
    const browser = await chromium.launch();
    const context = await browser.newContext({reducedMotion:'reduce',viewport:{width:1365,height:1000}}); await mock(context);
    const page = await context.newPage(); page.on('pageerror',error=>errors.push(error.message)); page.on('dialog',dialog=>dialog.accept());
    await page.goto('http://127.0.0.1:8766');
    assert.equal((await page.locator('#login-theme-toggle').textContent()).trim(),'');
    await page.click('#login-language-toggle'); await page.reload();
    assert.equal(await page.getAttribute('html','lang'),'en'); assert.equal(await page.locator('#login-language-toggle').textContent(),'EN');
    assert((await page.getAttribute('#login-theme-toggle','aria-label')).includes('Dark')); assert((await page.getAttribute('#login-theme-toggle','title')).includes('dark'));
    await page.fill('#input-nim','invalid'); await page.locator('#input-nim').press('Enter'); await page.waitForFunction(()=>!loginBusy);
    assert((await page.locator('#error-msg-mhs').textContent()).includes('student ID is not registered'));
    pass('Icon-only theme is accessible; landing language survives reload and login errors are in English');
    for (const width of [320,390,768,1365]) {
        await page.setViewportSize({width,height:width===320?568:900});
        for (const dark of [false,true]) { await page.evaluate(dark=>document.body.classList.toggle('dark-mode',dark),dark); await layout(page,'landing '+width+' '+dark); }
    }
    pass('Landing fits narrow, tablet and desktop screens in light and dark modes');
    await page.setViewportSize({width:1365,height:1000}); await page.fill('#input-nim','A'); await page.locator('#input-nim').press('Enter');
    await page.waitForSelector('#welcome-modal',{state:'hidden'}); await page.waitForFunction(()=>syncPhase === 'success');
    assert.equal(await page.getAttribute('html','lang'),'en');
    assert((await page.evaluate(()=>caseFileListHtml({link:'<a href="https://example.com/draft.pdf">Proposal</a>',note:'[]'}))).includes('Proposal draft'));
    await page.evaluate(()=>switchTab(null,'skripsi'));
    assert((await page.locator('#skripsi-checklist-container').textContent()).includes('Attend at least five proposal supervision sessions'));
    await page.evaluate(()=>switchTab(null,'academic-journey'));
    await page.locator('#academic-journey [data-start-service="Proposal"]').click(); assert.equal(await page.inputValue('#reg-jenis-utama'),'Proposal');
    await page.evaluate(()=>{document.getElementById('reg-jenis-utama').value='';toggleExamForm();});
    pass('English academic guidance and journey shortcuts keep canonical service values');
    for (const type of ['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing']) {
        await page.selectOption('#reg-jenis-utama',type);
        if (type === 'Pergantian Pembimbing') { await page.fill('#reg-dosen-lama','Dosen Lama Asli'); await page.fill('#reg-dosen-baru','Dosen Baru Asli'); await page.fill('#reg-alasan-ganti','Alasan mahasiswa tetap asli'); }
        else await page.fill('#reg-judul','Judul asli mahasiswa tetap utuh');
        const specs = await page.evaluate(()=>registrationSpecs(document.getElementById('reg-jenis-utama').value));
        for (const [id,label] of specs) await page.setInputFiles('#'+id,{name:id+'.pdf',mimeType:'application/pdf',buffer:pdf(label)});
        await page.click('#btn-review-registration'); assert(await page.locator('#registration-review').isVisible());
        const text = await page.locator('#registration-review').textContent();
        assert(text.includes('Review before sending')); assert(!/Dosen sekarang|Usulan dosen|Draft Jurnal|Berkas Pendadaran|Surat Permohonan/.test(text));
        if(type === 'Pergantian Pembimbing') assert(text.includes('Dosen Lama Asli'));
        await page.evaluate(()=>toggleLanguage()); assert.equal(await page.getAttribute('html','lang'),'id');
        assert.equal(await page.inputValue('#reg-jenis-utama'),type);
        for (const [id] of specs) assert.equal(await page.locator('#'+id).evaluate(el=>el.files.length),1);
        await page.evaluate(()=>toggleLanguage()); assert((await page.locator('#registration-review').textContent()).includes('Review before sending'));
        await page.click('#btn-edit-registration');
    }
    pass('All five English request summaries preserve entered text, selected files and backend enums across language changes');
    await page.selectOption('#reg-jenis-utama','Outline');
    await page.setInputFiles('#file-transkrip',{name:'fake.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')});
    await page.click('#btn-review-registration'); assert((await page.locator('#file-transkrip-error').textContent()).includes('do not match'));
    await page.setInputFiles('#file-transkrip',{name:'transcript.pdf',mimeType:'application/pdf',buffer:pdf('transcript')});
    await page.setInputFiles('#file-proposal',{name:'proposal.pdf',mimeType:'application/pdf',buffer:pdf('proposal')});
    await page.click('#btn-review-registration'); await page.click('#btn-submit-registration');
    await page.waitForSelector('#modal-submission-receipt',{state:'visible'}); assert((await page.locator('#submission-receipt-content').textContent()).includes('Request ID'));
    const create = calls.find(call=>call.action === 'create'); assert.equal(create.jenis,'Outline'); assert.deepEqual(create.files.map(file=>file.label),['Transkrip','Proposal']); assert(create.detail.startsWith('<b>Judul:</b>'));
    await page.evaluate(()=>closeModal('modal-submission-receipt',true));
    pass('English document errors and confirmed receipt work; submission payloads retain the existing database format');
    records.push(revision); await page.evaluate(()=>syncDatabase()); await page.waitForFunction(()=>syncPhase === 'success');
    await page.evaluate(()=>openCaseDetail('revision')); assert((await page.locator('#case-detail-content').textContent()).includes('Thesis defense'));
    assert((await page.locator('#case-detail-content').textContent()).includes('Instruksi asli dari admin, jangan diubah.'));
    await page.evaluate(()=>caseDetailAction('reply')); await page.check('[name="correction-complete"]');
    await page.setInputFiles('#case-reply-files',{name:'defense-corrected.pdf',mimeType:'application/pdf',buffer:pdf('corrected')}); await page.fill('#case-reply-note','Catatan asli mahasiswa');
    assert.equal(await page.inputValue('#revision-label-0'),'Berkas Pendadaran');
    await page.evaluate(()=>toggleLanguage()); await page.evaluate(()=>toggleLanguage());
    assert.equal(await page.inputValue('#case-reply-note'),'Catatan asli mahasiswa'); assert.equal(await page.locator('#case-reply-files').evaluate(el=>el.files[0].name),'defense-corrected.pdf');
    assert(await page.isChecked('[name="correction-complete"]')); assert((await page.locator('#case-action-panel h3').textContent()).includes('Corrections')); assert((await page.locator('#revision-label-0').textContent()).includes('Thesis defense documents'));
    await page.click('#btn-case-submit'); await page.waitForFunction(()=>!activeUpdateIds.size && !isPreparingCorrection);
    const correction = calls.find(call=>call.action === 'update'); assert.equal(correction.files[0].label,'Berkas Pendadaran'); assert.equal(correction.noteText,'Catatan asli mahasiswa');
    await page.evaluate(()=>closeModal('modal-case-detail',true));
    pass('Student corrections survive language switching; filenames, admin instructions and submitted notes remain intact');
    await page.evaluate(()=>{openGlobalSearch();renderSearchResults('internship');}); assert((await page.locator('#global-search-results').textContent()).includes('Internship')); await page.evaluate(()=>closeModal('modal-global-search',true));
    await page.evaluate(()=>{localStorage.setItem('ipcos_content_magang',JSON.stringify([{title:'Kategori admin asli',titleEn:'Custom English category',items:[{id:'custom',text:'Instruksi admin asli',textEn:'Custom English instruction',sub:'Detail admin asli',subEn:'Custom English details'}]}]));renderDynamicContent();switchTab(null,'magang');});
    assert((await page.locator('#magang-checklist-container').textContent()).includes('Custom English instruction'));
    await page.evaluate(()=>toggleLanguage()); assert((await page.locator('#magang-checklist-container').textContent()).includes('Instruksi admin asli')); assert((await page.evaluate(()=>localStorage.getItem('ipcos_content_magang'))).includes('Detail admin asli'));
    await page.evaluate(()=>{localStorage.removeItem('ipcos_content_magang');renderDynamicContent();toggleLanguage();});
    pass('English search and bilingual custom guidance work without replacing admin-authored source content');
    const calendarDownload = page.waitForEvent('download'); await page.evaluate(()=>downloadICS('Periode II (Des 2026)','19 Okt 2026'));
    const calendar = await calendarDownload, calendarText = fs.readFileSync(await calendar.path(),'utf8');
    assert(calendarText.includes('DTSTART;VALUE=DATE:20261019')); assert(calendarText.includes('DTEND;VALUE=DATE:20261020')); assert(calendarText.includes('Graduation clearance deadline')); assert(calendarText.includes('Period II (December 2026)'));
    assert.equal(await page.evaluate(()=>academicCalendarDate('31 Feb 2026')),null);
    pass('Calendar reminders accept Indonesian month names, export the correct day and use English descriptions');
    const admin = await context.newPage(); await admin.bringToFront(); admin.on('pageerror',error=>errors.push(error.message)); admin.on('dialog',dialog=>dialog.accept());
    await admin.goto('http://127.0.0.1:8766'); await admin.click('#tab-admin'); await admin.fill('#input-admin-user','test'); await admin.fill('#input-admin-pass','test'); await admin.locator('#input-admin-pass').press('Enter');
    await admin.waitForSelector('#welcome-modal',{state:'hidden'}); await admin.waitForFunction(()=>syncPhase === 'success');
    await admin.evaluate(()=>openCaseDetail('created')); await admin.evaluate(()=>caseDetailAction('revision'));
    await admin.check('[name="revision-document"][value="Transkrip"]'); await admin.fill('#case-revision-note','Instruksi admin asli');
    await admin.evaluate(()=>toggleLanguage()); await admin.evaluate(()=>toggleLanguage()); assert.equal(await admin.inputValue('#case-revision-note'),'Instruksi admin asli'); assert(await admin.isChecked('[value="Transkrip"]')); assert((await admin.locator('#case-action-panel').textContent()).includes('Select files needing corrections'));
    await admin.evaluate(()=>closeModal('modal-case-detail',true));
    await admin.evaluate(()=>switchTab(null,'admin-master')); await admin.locator('.service-management').first().locator('summary').click(); await admin.fill('#service-admin-0','19'); await admin.evaluate(()=>toggleLanguage()); await admin.evaluate(()=>toggleLanguage()); assert.equal(await admin.inputValue('#service-admin-0'),'19');
    pass('Admin correction drafts and unsaved service settings survive language changes');
    await admin.evaluate(()=>openContentEditor('faq'));
    await admin.locator('.editor-translation-label input').fill('English FAQ');
    await admin.locator('.editor-translations summary').first().click();
    await admin.locator('.editor-translations input').first().fill('Custom English question'); await admin.locator('.editor-translations textarea').first().fill('Custom English answer'); await admin.locator('.editor-translations textarea').first().press('Tab');
    await admin.evaluate(()=>toggleLanguage()); await admin.evaluate(()=>toggleLanguage());
    assert.equal(await admin.locator('.editor-translations input').first().inputValue(),'Custom English question');
    for (const width of [320,390,768,1365]) { await admin.setViewportSize({width,height:1000}); await layout(admin,'English content editor '+width); }
    await admin.locator('#modal-edit-content button').filter({hasText:'Save changes'}).click(); await admin.waitForSelector('#modal-edit-content',{state:'hidden'});
    const contentCall = calls.find(call=>call.action === 'update_content'), content = JSON.parse(contentCall.content);
    assert.equal(contentCall.type,'faq'); assert.equal(content[0].items[0].id,'f1'); assert.equal(content[0].items[0].text,'Bagaimana jika file PDF saya lebih dari 10MB?'); assert.equal(content[0].items[0].textEn,'Custom English question'); assert.equal(content[0].items[0].subEn,'Custom English answer');
    await page.bringToFront(); await page.evaluate(()=>{renderDynamicContent();switchTab(null,'templates-faq');}); assert((await page.locator('#faq-content-container').textContent()).includes('Custom English question'));
    pass('Admin can publish optional English guidance while preserving original content and the existing JSON schema');
    const pages = [{page,tabs:['dashboard','magang','skripsi','kurikulum','remidial','kalender','pendaftaran','student-status','academic-journey','templates-faq','feedback']},{page:admin,tabs:['dashboard','admin-data','admin-dosen','admin-master']}];
    for (const {page:target,tabs} of pages) {
        await target.bringToFront();
        for (const width of [320,390,768,1365]) {
            await target.setViewportSize({width,height:1000});
            for (const lang of ['id','en']) for (const dark of [false,true]) {
                await target.evaluate(({lang,dark})=>{registrationDirty=false;if(currentLang!==lang)toggleLanguage();document.body.classList.toggle('dark-mode',dark);},{lang,dark});
                for(const tab of tabs) { await target.evaluate(tab=>{switchTab(null,tab);document.querySelectorAll('#'+tab+' details').forEach(el=>el.open=true);},tab); await layout(target,await target.evaluate(()=>currentUser.role)+' '+tab+' '+width+' '+lang+' '+dark); }
                await target.evaluate(()=>switchTab(null,'dashboard'));
                assert(await target.locator('.dashboard-secondary>summary').evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft)>=16),'Disclosure text needs real horizontal padding');
            }
        }
    }
    pass('Both languages and both themes fit all student/admin pages at four widths; disclosure text has adequate padding');
    await page.bringToFront(); await page.evaluate(()=>logoutUser()); await page.waitForSelector('#welcome-modal',{state:'visible'}); assert.equal(await page.getAttribute('html','lang'),'en'); assert.equal(await page.locator('#case-detail-content').textContent(),''); assert.equal(await page.locator('#academic-journey-content').textContent(),'');
    assert.deepEqual(errors,[]); pass('Logout retains language preference, clears private views and has no JavaScript errors');
    fs.writeFileSync('test-results/language-layout-results.json',JSON.stringify({checks,errors},null,2)); await browser.close();
})().catch(reportFailure);
