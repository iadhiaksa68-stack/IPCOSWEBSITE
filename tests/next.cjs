const {chromium,reportFailure}=require('./browser.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),fixture=require('./next-backend.fixture.cjs'),{pdf}=require('./fixtures.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766',f=fixture(),calls=[],errors=[],checks=[],assets=[];
let dropSave=false,delaySave=null,delayDraft=null;
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const saved=()=>f.ctx.nextDraftRead('A');
const serviceTypes=['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'];
for(let i=0;i<13;i++)f.rows.push(['queue-'+i,new Date(Date.UTC(2026,9,1+i,1)).toISOString(),'A','Mahasiswa Uji '+i,i%2?'Pendadaran':'Proposal','<b>Judul:</b> Judul Uji '+i,'',i===12?'Accepted':'Pending','[]']);
async function mock(context) {
    await context.route('**/*',async route=>{
        const url=route.request().url();
        if(url.includes('script.google.com/macros/')){
            const data=route.request().postDataJSON();calls.push(data);let result;
            try {
                if(['get_form_draft','save_form_draft','get_revision_form','revise_request','report_health','get_health'].includes(data.action)) {
                    if(data.action==='get_form_draft'&&delayDraft){const pending=delayDraft;delayDraft=null;await pending;}
                    result=f.ctx.nextDispatch(data);
                    if(data.action==='save_form_draft'&&dropSave){dropSave=false;await route.abort();return;}
                    if(data.action==='save_form_draft'&&delaySave){const pending=delaySave;delaySave=null;await pending;}
                } else if(data.action==='student_login')result={status:'success',token:'student-'+data.nim,nama:'International Student O’Connor'};
                else if(data.action==='admin_login')result={status:'success',token:'admin'};
                else if(data.action==='get_data')result={status:'success',registrations:f.records().filter(record=>data.token==='admin'||record.nim===data.token.slice(-1)),students:[],dosens:[{Nama:'Dosen Uji',Terpakai:0,Maksimal:5}],contents:[],announcements:[],services:serviceTypes.map(type=>({type,enabled:true,open:'',close:'2030-12-31',adminDays:type==='Outline'?10:3,studentDays:7}))};
                else if(data.action==='get_sop')result={status:'success',document:{schema:1,type:data.type,revision:1,updatedAt:'2026-10-08T01:00:00Z',title:'SOP tugas akhir asli admin',titleEn:'Admin-authored final project SOP',intro:'Panduan Asli',introEn:'Original guidance',sections:[{id:'section-guide',title:'Contoh asli admin',titleEn:'Admin-authored example',body:'Baca contoh dokumen sebelum mengirim.',bodyEn:'Read the document example before submission.',links:[],files:[]}]}};
                else if(data.action==='create'){const id='created-next',date=new Date().toISOString();f.rows.push([id,date,data.token.slice(-1),'International Student O’Connor',data.jenis,data.detail,'','Pending','[]']);result={status:'success',id,date};}
                else if(data.action==='logout')result={status:'success'};
                else throw Error('Unexpected fixture action '+data.action);
            }catch(error){result={status:'error',message:error.message};}
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if(url.startsWith(origin)){assets.push(new URL(url).pathname);return route.continue();}
        if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class {static defaults={font:{}};destroy(){};constructor(){}};'});
        return route.abort();
    });
}
async function login(browser,role='mhs',nim='A') {
    const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1365,height:1000}});await mock(context);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin);
    if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}
    else{await page.fill('#input-nim',nim);await page.locator('#input-nim').press('Enter');}
    await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success');if(role==='mhs')await page.waitForFunction(()=>!document.getElementById('form-draft-status').textContent.includes('Memeriksa'));
    return page;
}
async function layout(page,label) {
    const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...document.querySelectorAll('h1,h2,h3,h4,label,button,summary')].filter(el=>el.getClientRects().length&&el.clientWidth&&!el.closest('table,.sop-format-toolbar')).filter(el=>el.scrollWidth>el.clientWidth+3).map(el=>({id:el.id,text:el.textContent.trim().slice(0,90)}))}));
    assert.equal(result.overflow,false,label+' overflow');assert.deepEqual(result.clipped,[],label+' clipped labels');
}
(async()=>{
    const browser=await chromium.launch(),student=await login(browser);await student.bringToFront();
    assert(!assets.includes('/sop.js'));assert(!assets.includes('/admin-export.js'));
    await student.evaluate(()=>switchTab(null,'pendaftaran'));await student.selectOption('#reg-jenis-utama','Outline');await student.fill('#reg-judul','Original student title: eCommerce & IPCOS');
    await student.evaluate(()=>IPCOSNext.flushDraft());await student.waitForFunction(()=>document.getElementById('form-draft-status').textContent.includes('tersimpan di cloud'));
    assert.equal(saved().fields['reg-judul'],'Original student title: eCommerce & IPCOS');assert.equal(saved().revision,1);
    const second=await login(browser);await second.bringToFront();await second.waitForFunction(()=>document.getElementById('reg-judul').value==='Original student title: eCommerce & IPCOS');await second.evaluate(()=>switchTab(null,'pendaftaran'));assert.equal(await second.inputValue('#reg-jenis-utama'),'Outline');
    pass('Private text drafts restore on a second device; student names/titles preserve their exact original capitalization and files are not uploaded');

    await student.bringToFront();await student.fill('#reg-judul','Device one title');await student.evaluate(()=>IPCOSNext.flushDraft());await student.waitForFunction(()=>document.getElementById('form-draft-status').textContent.includes('tersimpan di cloud'));
    await second.bringToFront();await second.fill('#reg-judul','Device two title');await second.evaluate(()=>IPCOSNext.flushDraft());await second.waitForSelector('[data-draft-choice="local"]');assert.equal(await second.inputValue('#reg-judul'),'Device two title');assert.equal(saved().fields['reg-judul'],'Device one title');
    await second.click('[data-draft-choice="local"]');await second.waitForSelector('[data-draft-choice="local"]',{state:'hidden'});assert.equal(saved().fields['reg-judul'],'Device two title');assert.equal(saved().revision,3);
    pass('Conflicting device saves preserve both choices and do not silently overwrite the cloud draft');

    dropSave=true;await second.fill('#reg-judul','Retry without duplicate draft');await second.evaluate(()=>IPCOSNext.flushDraft());await second.waitForSelector('[data-draft-choice="retry"]');const request=calls.filter(data=>data.action==='save_form_draft').at(-1);assert.equal(saved().revision,4);assert.equal(await second.inputValue('#reg-judul'),'Retry without duplicate draft');
    await second.click('[data-draft-choice="retry"]');await second.waitForSelector('[data-draft-choice="retry"]',{state:'hidden'});assert.equal(calls.filter(data=>data.action==='save_form_draft').at(-1).requestId,request.requestId);assert.equal(saved().revision,4);
    pass('A lost save acknowledgement retains the draft and retries the same request without another revision');

    await second.setInputFiles('#file-transkrip',{name:'Transcript eCommerce.pdf',mimeType:'application/pdf',buffer:pdf('transcript')});await second.setInputFiles('#file-proposal',{name:'Original Proposal.pdf',mimeType:'application/pdf',buffer:pdf('proposal')});
    await second.click('#file-proposal-guidance [data-guide="sop-tugas-akhir"]');await second.waitForSelector('#sop_tugas_akhir-view .sop-section');assert(assets.includes('/sop.js'));assert.equal((await second.locator('#sop_tugas_akhir-view h1').textContent()).trim(),'SOP tugas akhir asli admin');
    await second.click('[data-guide-return]');assert.equal(await second.inputValue('#reg-judul'),'Retry without duplicate draft');assert.equal(await second.locator('#file-transkrip').evaluate(input=>input.files[0].name),'Transcript eCommerce.pdf');
    await second.click('#file-transkrip-guidance [data-guide="templates-faq"]');await second.click('[data-guide-return]');assert.equal(await second.locator('#file-proposal').evaluate(input=>input.files[0].name),'Original Proposal.pdf');
    pass('Contextual SOP/template detours load SOP on demand and return to the same form with selected files and authored guidance unchanged');

    for(const days of [3,1]){
        await second.selectOption('#service-reminder-days',String(days));const downloaded=second.waitForEvent('download');await second.click('[data-service-reminder]');const file=await downloaded,calendar=fs.readFileSync(await file.path(),'utf8'),unfolded=calendar.replace(/\r\n /g,'');
        assert(unfolded.includes('DTSTART:20301231T165900Z'));assert(unfolded.includes('TRIGGER:-P'+days+'D'));assert(unfolded.includes('BEGIN:VALARM'));assert(unfolded.includes('Outline'));assert(unfolded.includes('23:59 WIB'));assert(calendar.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
    }
    pass('Service deadline downloads use 23:59 WIB correctly, include H-3/H-1 alarms and valid folded calendar lines');

    await second.click('#btn-review-registration');const cleared=second.waitForResponse(response=>response.request().postData()?.includes('save_form_draft')&&response.request().postDataJSON().fields&&Object.keys(response.request().postDataJSON().fields).length===0);await second.click('#btn-submit-registration');await second.waitForSelector('#modal-submission-receipt',{state:'visible'});await cleared;assert.equal(saved().exists,false);
    await second.evaluate(()=>closeModal('modal-submission-receipt',true));
    pass('Confirmed submission clears the cloud text draft without storing or pre-uploading documents');

    await second.evaluate(()=>openCaseDetail('fields'));await second.evaluate(()=>caseDetailAction('reply'));await second.waitForSelector('[data-correction-field="title"]');assert.equal(await second.inputValue('#correction-title'),'Judul awal');await second.check('[name="correction-complete"]');await second.fill('#correction-title','Corrected eCommerce thesis title');await second.fill('#case-reply-note','Title only; no documents changed.');
    await second.evaluate(()=>toggleLanguage());assert.equal(await second.inputValue('#correction-title'),'Corrected eCommerce thesis title');assert((await second.locator('#case-revision-fields legend').textContent()).includes('Correct Request Details'));
    await second.click('#btn-case-submit');await second.waitForFunction(()=>!isPreparingCorrection&&!activeUpdateIds.size);assert.equal(f.rows[1][7],'Resubmitted');assert.equal(f.rows[1][5],'<b>Judul:</b> Corrected eCommerce thesis title');assert.equal(f.state.created.length,0);assert((await second.locator('.field-change-list').textContent()).includes('Judul awal'));assert((await second.locator('.field-change-list').textContent()).includes('Corrected eCommerce thesis title'));
    await second.evaluate(()=>closeModal('modal-case-detail',true));
    pass('Students can correct only the requested fields without a file, preserving inputs through language changes and showing before/after history in the same request');

    const admin=await login(browser,'admin');await admin.bringToFront();await admin.evaluate(()=>switchTab(null,'admin-data'));await admin.selectOption('#admin-status-filter','ALL');await admin.selectOption('#admin-type-filter','Proposal');await admin.fill('#admin-date-from','2026-10-01');await admin.fill('#admin-date-to','2026-10-09');await admin.selectOption('#admin-queue-order','oldest');await admin.click('.data-management>summary');
    const filtered=await admin.evaluate(()=>adminFilteredData.map(item=>item.id));assert(filtered.includes('fields'));assert(!filtered.includes('queue-12'));assert(!filtered.includes('queue-1'));assert((await admin.locator('#queue-date-error').textContent()).trim()==='');
    let download=admin.waitForEvent('download');await admin.evaluate(()=>exportAdminDataCSV());let csv=fs.readFileSync(await (await download).path(),'utf8');assert(assets.includes('/admin-export.js'));assert.equal(csv.split('\r\n').length,filtered.length+1);for(const id of filtered)assert(csv.includes('"'+id+'"'));assert(!csv.includes('"queue-12"'));assert(csv.includes('Menunggu (Hari)'));
    await admin.selectOption('#admin-export-scope','all');download=admin.waitForEvent('download');await admin.evaluate(()=>exportAdminDataCSV());csv=fs.readFileSync(await (await download).path(),'utf8');assert.equal(csv.split('\r\n').length,f.rows.length);assert(csv.includes('"other"'));
    await admin.selectOption('#admin-queue-order','overdue');const scores=await admin.evaluate(()=>adminFilteredData.map(item=>{const wait=caseWaiting(item);return wait?wait.days-wait.target:-Infinity;}));assert(scores.every((score,index)=>index===0||score<=scores[index-1]));
    await admin.reload();await admin.waitForFunction(()=>syncPhase==='success');await admin.evaluate(()=>switchTab(null,'admin-data'));assert.equal(await admin.inputValue('#admin-queue-order'),'overdue');assert.equal(await admin.inputValue('#admin-date-to'),'2026-10-09');
    await admin.fill('#admin-date-from','2026-10-10');await admin.evaluate(()=>filterAdminData());assert((await admin.locator('#queue-date-error').textContent()).trim());assert.equal(await admin.evaluate(()=>adminFilteredData.length),0);await admin.fill('#admin-date-from','2026-10-01');
    pass('Admin oldest/overdue sorting and Jakarta date filters persist; CSV exports all matching rows across pages or explicitly all requests and invalid ranges remain empty');

    assert.equal(await second.evaluate(()=>canAccessTab('admin-data')),false);await admin.click('.health-management>summary');await admin.click('[data-health-refresh]');await admin.waitForFunction(()=>document.getElementById('health-results').textContent.includes('Koneksi'));assert((await admin.locator('#health-results').textContent()).includes('Koneksi'));
    const reports=calls.filter(data=>data.action==='report_health');assert(reports.length);assert(reports.every(data=>Object.keys(data).every(key=>['action','token','code','operation'].includes(key))));assert(!JSON.stringify(f.ctx.nextHealthRead({role:'admin'})).includes('Retry without duplicate'));
    pass('Admin can inspect anonymous aggregate issue metadata; telemetry excludes titles, filenames, student IDs, messages and credentials from stored metadata');

    for(const page of [second,admin]){
        await page.bringToFront();await page.evaluate(()=>switchTab(null,currentUser.role==='admin'?'admin-data':'pendaftaran'));
        for(const width of [320,390,768,1365]){await page.setViewportSize({width,height:900});for(const lang of ['id','en']){await page.evaluate(lang=>{if(currentLang!==lang)toggleLanguage();},lang);for(const dark of [false,true]){await page.evaluate(dark=>document.body.classList.toggle('dark-mode',dark),dark);await layout(page,(page===admin?'admin':'student')+' '+width+' '+lang+' '+dark);}}}
    }
    await admin.evaluate(()=>{if(currentLang!=='en')toggleLanguage();});assert.equal(await admin.locator('label[for="admin-queue-order"]').textContent(),'Queue Order');assert.equal(await admin.locator('[data-health-refresh]').textContent(),'Load Summary');assert(!/Perlu Ditinjau|Baru Masuk|Perbaikan Masuk|Menunggu Mahasiswa/.test(await admin.locator('#admin-queue-summary').textContent()));
    assert.equal(await admin.locator('#admin-type-filter option[value="Pergantian Pembimbing"]').getAttribute('value'),'Pergantian Pembimbing');
    fs.mkdirSync('../qa-next',{recursive:true});await admin.screenshot({path:'../qa-next/admin-new-tools.png'});await second.screenshot({path:'../qa-next/student-new-tools.png'});
    pass('New controls fit four widths in both themes/languages; system labels use consistent capitals while canonical enums and authored text remain unchanged');

    await student.bringToFront();let release;delaySave=new Promise(resolve=>release=resolve);await student.fill('#reg-judul','Late save must not restore private data');await student.evaluate(()=>{IPCOSNext.flushDraft();});await student.waitForFunction(()=>document.getElementById('form-draft-status').textContent.includes('Menyimpan'));
    // Reset is exercised directly while a save is in flight; logout keeps the same reset path.
    await student.evaluate(()=>logoutUser());release();await student.waitForSelector('#welcome-modal',{state:'visible'});assert.equal(await student.locator('#draft-controls').textContent(),'');assert.equal(await student.inputValue('#reg-judul'),'');
    assert.deepEqual(errors,[]);pass('Logout clears private draft controls/fields and a delayed save cannot restore an old session; no JavaScript errors');
    fs.writeFileSync('test-results/next-results.json',JSON.stringify({checks,errors,apiRequests:calls.length,realAcademicWrites:0},null,2));await browser.close();
})().catch(reportFailure);
