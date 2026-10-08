const {chromium,reportFailure} = require('./browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {pdf} = require('./fixtures.cjs');

const clone = value => structuredClone(value);
const checks = [], calls = [], errors = [], contexts = [];
const pass = text => { checks.push(text); console.log('PASS ' + text); };
const types = ['sop_magang','sop_tugas_akhir'];
const pages = {sop_magang:'sop-magang',sop_tugas_akhir:'sop-tugas-akhir'};
const documentFor = type => ({schema:1,type,revision:1,updatedAt:'2026-10-07T01:00:00.000Z',
    title:type === 'sop_magang' ? 'SOP Magang Uji' : 'SOP Tugas Akhir Uji',
    titleEn:type === 'sop_magang' ? 'Internship SOP Test' : 'Final Project SOP Test',
    intro:'Panduan resmi untuk pengujian tanpa data nyata.',introEn:'Official test guidance without real academic data.',
    sections:[{id:'step-one',title:'Persiapan',titleEn:'Preparation',body:'Isi panduan pertama.\nBaris kedua tetap terbaca.',bodyEn:'First instruction.\nThe second line remains readable.',links:[{id:'official-link',label:'Panduan resmi',labelEn:'Official guidance',url:'https://example.com/guide'}],files:type === 'sop_magang' ? [{id:'stored-pdf',fileName:'guide.pdf',mimeType:'application/pdf',size:pdf('guide').length}] : []},
        {id:'step-two',title:'Pengajuan',titleEn:'Submission',body:'Isi panduan kedua.',bodyEn:'Second instruction.',links:[],files:[]}]});
const documents = new Map(types.map(type=>[type,documentFor(type)]));
const fileBytes = new Map([['stored-pdf',pdf('guide')]]);
const requestResults = new Map();
let nextSave = '', nextRead = '', heldSave = null, heldFile = null;
function deferred() { let entered,release,done; return {entered:new Promise(resolve=>entered=resolve),wait:new Promise(resolve=>release=resolve),done:new Promise(resolve=>done=resolve),enter:()=>entered(),release:()=>release(),finish:()=>done()}; }
function canonicalSave(data) {
    if(requestResults.has(data.requestId)) return clone(requestResults.get(data.requestId));
    const next = clone(data.document); next.type = data.type; next.schema = 1;
    const idMap = new Map((data.uploads || []).map((file,index)=>[file.id,'saved-'+data.requestId+'-'+index]));
    for(const section of next.sections) for(const file of section.files) {
        const upload = (data.uploads || []).find(upload=>upload.id === file.id);
        if(upload) {file.id=idMap.get(file.id);file.fileName=upload.fileName;file.mimeType=upload.mimeType;file.size=Buffer.from(upload.base64,'base64').length;fileBytes.set(file.id,Buffer.from(upload.base64,'base64'));}
    }
    next.revision=documents.get(data.type).revision+1; next.updatedAt=new Date().toISOString();
    documents.set(data.type,next); const result={status:'success',document:clone(next)}; requestResults.set(data.requestId,result); return clone(result);
}
async function mockedPage(browser,role) {
    const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1365,height:1000}}); contexts.push(context);
    await context.route('**/*',async route=>{
        const url=route.request().url();
        if(url.includes('script.google.com/macros/')) {
            const data=route.request().postDataJSON();if(await require('./next-mock.cjs')(route,data))return;calls.push(data);let result,gate;
            if(data.action === 'student_login') result={status:'success',nama:'Mahasiswa SOP Uji',token:'student'};
            else if(data.action === 'admin_login') result={status:'success',token:'admin'};
            else if(data.action === 'get_data') result={status:'success',registrations:[],students:[],dosens:[],contents:[],announcements:[],services:[]};
            else if(data.action === 'get_sop') {
                assert(types.includes(data.type));
                if(nextRead) {nextRead='';result={status:'error',message:'Gangguan pembacaan SOP uji'};}
                else result={status:'success',document:clone(documents.get(data.type))};
            } else if(data.action === 'save_sop') {
                assert.equal(data.token,'admin','Only an admin UI may request SOP publication'); assert(data.requestId); assert(types.includes(data.type));
                assert.equal(data.document.type,data.type); assert(Number.isInteger(data.revision));
                if(heldSave) {gate=heldSave;heldSave=null;gate.enter();await gate.wait;}
                const mode=nextSave;nextSave='';
                if(mode === 'failure') result={status:'error',message:'Gangguan penyimpanan SOP uji'};
                else if(mode === 'conflict') result={status:'error',code:'SOP_CONFLICT',message:'SOP berubah. Muat versi terbaru sebelum menyimpan.'};
                else {result=canonicalSave(data);if(mode === 'lost-response') {await route.abort('failed');gate?.finish();return;}}
            } else if(data.action === 'get_sop_file') {
                assert(types.includes(data.type));assert(documents.get(data.type).sections.some(section=>section.files.some(file=>file.id===data.fileId)),'Download must reference a file in its SOP');
                const file=documents.get(data.type).sections.flatMap(section=>section.files).find(file=>file.id===data.fileId);
                result={status:'success',fileName:file.fileName,mimeType:file.mimeType,base64:fileBytes.get(file.id).toString('base64')};
                if(heldFile) {gate=heldFile;heldFile=null;gate.enter();await gate.wait;}
            } else if(data.action === 'logout') result={status:'success'};
            else throw Error('Unexpected API request '+data.action);
            await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)});gate?.finish();return;
        }
        if(url.startsWith('http://127.0.0.1:8766')) return route.continue();
        if(url.includes('chart.js')) return route.fulfill({contentType:'text/javascript',body:'window.Chart=class {static defaults={font:{}};destroy(){};constructor(){}};'});
        return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>page.rejectNextDialog ? (page.rejectNextDialog=false,dialog.dismiss()) : dialog.accept());
    await page.goto('http://127.0.0.1:8766');
    if(role === 'admin') {await page.click('#tab-admin');await page.fill('#input-admin-user','test');await page.fill('#input-admin-pass','test');await page.locator('#input-admin-pass').press('Enter');}
    else {await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');}
    await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase === 'success');return page;
}
async function open(page,type,force=false) {
    await page.bringToFront(); await page.evaluate(({type,tab,force})=>{switchTab(null,tab);return IPCOSSop.open(type,force);},{type,tab:pages[type],force});
    await page.waitForSelector('#'+type+'-view');
}
async function edit(page,type) {await open(page,type);await page.evaluate(type=>IPCOSSop.edit(type),type);await page.waitForSelector('#modal-sop-editor',{state:'visible'});}
async function save(page) {await page.click('#sop-save');await page.waitForSelector('#modal-sop-editor',{state:'hidden'});}
async function cancel(page) {await page.evaluate(()=>IPCOSSop.cancel());await page.waitForSelector('#modal-sop-editor',{state:'hidden'});}
const section = (page,id) => page.locator('#sop-editor-sections [data-section-id="'+id+'"]');
async function layout(page,label) {
    const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...document.querySelectorAll('#sop-magang h1,#sop-tugas-akhir h1,.sop-section h2,.sop-section h3,#modal-sop-editor label,#modal-sop-editor button,#modal-sop-editor summary')].filter(el=>el.getClientRects().length && el.clientWidth>0).filter(el=>el.scrollWidth>el.clientWidth+3).map(el=>({id:el.id,text:el.textContent.slice(0,90)}))}));
    assert.equal(state.overflow,false,label+' page overflow');assert.deepEqual(state.clipped,[],label+' clipped control text');
}
(async()=>{
    const browser=await chromium.launch();const student=await mockedPage(browser,'student');
    await open(student,'sop_magang');assert((await student.locator('#sop_magang-view').textContent()).includes('SOP Magang Uji'));
    assert.equal(await student.locator('#sop_magang-view [data-sop-action="edit"]').count(),0);
    await student.evaluate(()=>IPCOSSop.edit('sop_magang'));assert(!(await student.locator('#modal-sop-editor').isVisible()));
    await open(student,'sop_tugas_akhir');assert((await student.locator('#sop_tugas_akhir-view').textContent()).includes('SOP Tugas Akhir Uji'));
    assert(!(await student.locator('#sop_tugas_akhir-view').textContent()).includes('guide.pdf'));
    pass('Students can read both separate SOPs and cannot open administrative editing controls');

    const admin=await mockedPage(browser,'admin');await edit(admin,'sop_magang');
    await section(admin,'step-one').locator('[data-section-field="body"]').fill('Perubahan langsung tanpa meninggalkan textarea.\nBaris lanjutan.');
    await admin.click('#sop-preview');assert((await admin.locator('#sop-preview-output').textContent()).includes('Perubahan langsung tanpa meninggalkan textarea.'));
    assert.equal(documents.get('sop_magang').sections[0].body,'Isi panduan pertama.\nBaris kedua tetap terbaca.');
    await admin.click('#sop-preview');
    await section(admin,'step-one').locator('[data-section-field="body"]').fill('Disimpan tanpa blur');await save(admin);
    assert.equal(documents.get('sop_magang').sections[0].body,'Disimpan tanpa blur');assert.equal(documents.get('sop_tugas_akhir').revision,1);
    pass('Live preview and save capture the latest textarea input without blur; preview never publishes and the other SOP remains unchanged');

    await edit(admin,'sop_magang');await section(admin,'step-one').locator('[data-section-field="title"]').fill('Isian tetap saat urutan berubah');
    await section(admin,'step-one').locator('input.sop-add-files').setInputFiles({name:'new-guide.pdf',mimeType:'',buffer:pdf('new guide')});
    await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);
    await admin.click('#sop-add-section');const added=admin.locator('#sop-editor-sections [data-section-id]').last();
    const addedId=await added.getAttribute('data-section-id');await added.locator('[data-section-field="title"]').fill('Bagian tambahan');await added.locator('[data-section-field="body"]').fill('Instruksi tambahan lengkap');
    await added.locator('[data-section-field="body"]').evaluate(el=>el.setSelectionRange(0,9));await added.locator('[data-format="bold"]').click();assert((await added.locator('[data-section-field="body"]').inputValue()).includes('**Instruksi**'));
    await added.locator('input.sop-add-files').setInputFiles({name:'discarded.pdf',mimeType:'application/pdf',buffer:pdf('discarded')});await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);
    await added.locator('[data-sop-action="remove-file"]').click();assert.equal(await added.locator('[data-sop-action="remove-file"]').count(),0);
    await added.locator('[data-sop-action="add-link"]').click();await added.locator('[data-link-field="label"]').fill('Tautan sementara');await added.locator('[data-link-field="url"]').fill('https://example.com/discarded');await added.locator('[data-sop-action="remove-link"]').click();assert.equal(await added.locator('[data-link-field="url"]').count(),0);
    await admin.click('#sop-add-section');const temporary=admin.locator('#sop-editor-sections [data-section-id]').last();await temporary.locator('[data-section-field="body"]').fill('Section dibuang');await temporary.locator('[data-sop-action="remove-section"]').click();assert.equal(await admin.locator('#sop-editor-sections [data-section-id]').count(),3);
    await section(admin,'step-one').locator('[data-sop-action="move-down"]').click();
    assert.equal(await section(admin,'step-one').locator('[data-section-field="title"]').inputValue(),'Isian tetap saat urutan berubah');
    assert((await section(admin,'step-one').textContent()).includes('new-guide.pdf'));
    await admin.evaluate(()=>document.querySelectorAll('#modal-sop-editor .editor-translations').forEach(el=>el.open=true));
    await admin.fill('#sop-title-en','Internship guidance for international students');await section(admin,'step-one').locator('[data-section-field="bodyEn"]').fill('English instructions retained across language changes');
    await section(admin,'step-one').locator('[data-section-field="bodyEn"]').evaluate(el=>{el.focus();el.setSelectionRange(8,20,'forward');});
    const focusBefore=await admin.evaluate(()=>({id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,value:document.activeElement.value,details:[...document.querySelectorAll('#modal-sop-editor details[data-sop-details][open]')].map(el=>el.dataset.sopDetails).sort()}));
    for(let change=0;change<2;change++) {
        await admin.evaluate(()=>toggleLanguage());
        const focusAfter=await admin.evaluate(()=>({id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,value:document.activeElement.value,details:[...document.querySelectorAll('#modal-sop-editor details[data-sop-details][open]')].map(el=>el.dataset.sopDetails).sort()}));
        assert.deepEqual(focusAfter,focusBefore,'Language redraw must preserve the active English textarea, caret range, value and expanded translation panels');
    }
    for(const direction of ['move-up','move-down']) {
        await section(admin,'step-one').locator('[data-sop-action="'+direction+'"]').click();
        assert.deepEqual(await admin.evaluate(()=>[...document.querySelectorAll('#modal-sop-editor details[data-sop-details][open]')].map(el=>el.dataset.sopDetails).sort()),focusBefore.details,'Reordering preserves expanded English panels');
        assert.equal(await section(admin,'step-one').locator('[data-section-field="bodyEn"]').inputValue(),focusBefore.value);
        assert((await section(admin,'step-one').textContent()).includes('new-guide.pdf'));
    }
    assert.equal(await admin.inputValue('#sop-title-en'),'Internship guidance for international students');
    assert.equal(await section(admin,'step-one').locator('[data-section-field="bodyEn"]').inputValue(),'English instructions retained across language changes');
    assert((await section(admin,'step-one').textContent()).includes('new-guide.pdf'));
    await save(admin);const published=documents.get('sop_magang');
    assert.deepEqual(published.sections.map(item=>item.id),['step-two','step-one',addedId]);
    const uploaded=published.sections.find(item=>item.id==='step-one').files.find(file=>file.fileName==='new-guide.pdf');assert(uploaded && !uploaded.id.startsWith('new-'));
    assert.equal(uploaded.mimeType,'application/pdf','PDF content receives a canonical MIME type even when its browser File.type is empty');
    const publishUpload=calls.filter(call=>call.action==='save_sop').at(-1).uploads;assert.equal(publishUpload.length,1);assert.equal(publishUpload[0].fileName,'new-guide.pdf');assert.equal(publishUpload[0].mimeType,'application/pdf');
    assert.equal(published.sections.find(item=>item.id==='step-one').title,'Isian tetap saat urutan berubah');
    pass('Adding and reordering sections preserve entered text, bilingual fields and pending files; publication uses server-confirmed file identifiers');

    await open(student,'sop_magang',true);await student.evaluate(()=>toggleLanguage());
    assert((await student.locator('#sop_magang-view').textContent()).includes('Internship guidance for international students'));
    assert((await student.locator('#sop_magang-view').textContent()).includes('English instructions retained across language changes'));
    assert((await student.locator('#sop_magang-view .sop-updated').textContent()).includes(String(published.revision)));
    const download=student.waitForEvent('download');await student.locator('#sop_magang-view [data-sop-action="download"][data-file-id="'+uploaded.id+'"]').click();
    const received=await download;assert.equal(received.suggestedFilename(),'new-guide.pdf');assert.deepEqual(fs.readFileSync(await received.path()),pdf('new guide'));
    const fileCall=calls.find(call=>call.action==='get_sop_file' && call.fileId===uploaded.id);assert.equal(fileCall.token,'student');assert.equal(fileCall.type,'sop_magang');
    pass('Students receive published English SOP content and download exact attachment bytes through the authenticated API');

    await edit(admin,'sop_tugas_akhir');const uploadInput=section(admin,'step-one').locator('input.sop-add-files');
    const invalid=[{name:'fake.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a real PDF')},{name:'program.exe',mimeType:'application/octet-stream',buffer:Buffer.from('MZ')},{name:'too-large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(5*1024*1024+1)}];
    for(const file of invalid) {await uploadInput.setInputFiles(file);await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);assert.equal(await section(admin,'step-one').locator('[data-sop-action="remove-file"]').count(),0,'Invalid file must not be attached');assert((await admin.locator('#sop-editor-status').textContent()).trim());}
    assert.equal(calls.filter(call=>call.action==='save_sop' && call.type==='sop_tugas_akhir').length,0);
    await uploadInput.setInputFiles(Array.from({length:7},(_,i)=>({name:'limit-'+i+'.pdf',mimeType:'application/pdf',buffer:pdf('file '+i)})));
    await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);
    await admin.click('#sop-preview');const previewText=await admin.locator('#sop-preview-output').textContent();
    assert((previewText.match(/limit-\d\.pdf/g)||[]).length<=6,'File count must never exceed six');await cancel(admin);
    await edit(admin,'sop_tugas_akhir');const bigPdf=Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(4*1024*1024,' '),Buffer.from('\n%%EOF')]);
    await section(admin,'step-one').locator('input.sop-add-files').setInputFiles(Array.from({length:3},(_,i)=>({name:'total-'+i+'.pdf',mimeType:'application/pdf',buffer:bigPdf})));await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);
    assert.equal(await admin.locator('#sop-editor-sections [data-sop-action="remove-file"]').count(),0,'Combined batch over 12 MB is rejected atomically');await cancel(admin);
    pass('Fake PDFs, executable extensions, oversized files and excessive attachment batches cannot bypass SOP upload limits');

    await edit(admin,'sop_tugas_akhir');await section(admin,'step-one').locator('[data-sop-action="add-link"]').click();
    const link=section(admin,'step-one').locator('[data-link-field="url"]').last();await link.fill('javascript:window.__sopInjected=true');
    const savesBefore=calls.filter(call=>call.action==='save_sop').length;await admin.click('#sop-save');
    assert(await admin.locator('#modal-sop-editor').isVisible());assert.equal(calls.filter(call=>call.action==='save_sop').length,savesBefore);
    await link.fill('https://example.com/final-project');await section(admin,'step-one').locator('[data-link-field="label"]').last().fill('Sumber resmi');
    await section(admin,'step-one').locator('[data-section-field="body"]').fill('<img src=x onerror="window.__sopInjected=true">\n<script>window.__sopInjected=true</script>');await save(admin);
    await open(student,'sop_tugas_akhir',true);await student.evaluate(()=>{if(currentLang!=='id')toggleLanguage();});
    assert((await student.locator('#sop_tugas_akhir-view').textContent()).includes('<img src=x'));
    assert.equal(await student.locator('#sop_tugas_akhir-view img,#sop_tugas_akhir-view script').count(),0);assert.equal(await student.evaluate(()=>window.__sopInjected),undefined);
    assert.equal(await student.locator('#sop_tugas_akhir-view a[href="https://example.com/final-project"]').count(),1);
    const validBefore=await student.locator('#sop_tugas_akhir-view').textContent(), malformedRevision=clone(documents.get('sop_tugas_akhir'));
    malformedRevision.revision='<img src=x onerror="window.__sopInjected=true">';malformedRevision.title='Malformed revision must never publish';
    await student.evaluate(doc=>IPCOSSop.receive([{Tipe:'sop_tugas_akhir',DataJSON:JSON.stringify(doc)}]),malformedRevision);
    assert.equal(await student.locator('#sop_tugas_akhir-view').textContent(),validBefore,'Invalid revision retains the last valid guidance');
    const malformedFiles=clone(documents.get('sop_tugas_akhir'));malformedFiles.revision=9999;malformedFiles.sections[0].files='bad';
    await student.evaluate(doc=>IPCOSSop.receive([{Tipe:'sop_tugas_akhir',DataJSON:JSON.stringify(doc)}]),malformedFiles);
    assert.equal(await student.locator('#sop_tugas_akhir-view').textContent(),validBefore,'Malformed attachment arrays cannot replace or poison the cached SOP');
    assert.equal(await student.locator('#sop_tugas_akhir-view img,#sop_tugas_akhir-view script').count(),0);assert.equal(await student.evaluate(()=>window.__sopInjected),undefined);
    const recoveredDocument=clone(documents.get('sop_tugas_akhir'));recoveredDocument.revision+=1;recoveredDocument.intro='Panduan valid setelah snapshot rusak';documents.set('sop_tugas_akhir',recoveredDocument);
    await student.evaluate(doc=>IPCOSSop.receive([{Tipe:'sop_tugas_akhir',DataJSON:JSON.stringify(doc)}]),recoveredDocument);
    assert((await student.locator('#sop_tugas_akhir-view').textContent()).includes('Panduan valid setelah snapshot rusak'),'A subsequent valid higher revision still renders after malformed snapshots');
    await admin.evaluate(doc=>IPCOSSop.receive([{Tipe:'sop_tugas_akhir',DataJSON:JSON.stringify(doc)}]),recoveredDocument);
    pass('Admin-authored text renders as text, unsafe link protocols cannot publish, and valid HTTPS resources remain usable');

    await edit(admin,'sop_tugas_akhir');await admin.fill('#sop-intro','Draft tetap utuh ketika server gagal');nextSave='failure';await admin.click('#sop-save');
    await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);assert(await admin.locator('#modal-sop-editor').isVisible());assert.equal(await admin.inputValue('#sop-intro'),'Draft tetap utuh ketika server gagal');
    assert.notEqual(documents.get('sop_tugas_akhir').intro,'Draft tetap utuh ketika server gagal');assert((await admin.locator('#sop-editor-status').textContent()).trim());
    await save(admin);assert.equal(documents.get('sop_tugas_akhir').intro,'Draft tetap utuh ketika server gagal');
    pass('Failed saves keep the draft visible and unpublished; retry publishes only after server confirmation');

    await edit(admin,'sop_tugas_akhir');await admin.fill('#sop-intro','Isian saat konflik tetap tersedia');nextSave='conflict';await admin.click('#sop-save');
    await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);assert(await admin.locator('#modal-sop-editor').isVisible());assert.equal(await admin.inputValue('#sop-intro'),'Isian saat konflik tetap tersedia');
    assert.notEqual(documents.get('sop_tugas_akhir').intro,'Isian saat konflik tetap tersedia');await cancel(admin);
    pass('Version conflicts keep admin input available and never silently replace the published SOP');

    await edit(admin,'sop_tugas_akhir');await admin.fill('#sop-intro','Respons terputus aman diulang');nextSave='lost-response';const lostAt=calls.length;await admin.click('#sop-save');
    await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);assert(await admin.locator('#modal-sop-editor').isVisible());await save(admin);
    const retryCalls=calls.slice(lostAt).filter(call=>call.action==='save_sop');assert.equal(retryCalls.length,2);assert.equal(retryCalls[0].requestId,retryCalls[1].requestId);
    assert.equal(documents.get('sop_tugas_akhir').intro,'Respons terputus aman diulang');
    pass('Retry after a lost acknowledgement reuses the publication request ID and cannot create duplicate SOP revisions');

    await edit(admin,'sop_tugas_akhir');await admin.fill('#sop-intro','Satu simpan saat klik berulang');const guard=deferred();heldSave=guard;const guardAt=calls.length;
    await admin.locator('#sop-save').evaluate(el=>{el.click();el.click();});await guard.entered;
    assert.equal(calls.slice(guardAt).filter(call=>call.action==='save_sop').length,1);assert(await admin.locator('#sop-save').isDisabled());guard.release();await guard.done;await admin.waitForSelector('#modal-sop-editor',{state:'hidden'});
    pass('Repeated save clicks while publication is pending produce one request and a clear busy state');

    await edit(admin,'sop_magang');await admin.fill('#sop-intro','Input tidak hilang saat refresh atau navigasi');
    const broadcast=clone(documents.get('sop_magang'));broadcast.revision+=1;broadcast.intro='Panduan baru dari sinkronisasi';broadcast.introEn='New guidance received automatically';documents.set('sop_magang',broadcast);
    const envelope={Tipe:'sop_magang',DataJSON:JSON.stringify(broadcast)};
    await student.evaluate(envelope=>IPCOSSop.receive([envelope]),envelope);
    assert((await student.locator('#sop_magang-view').textContent()).includes('Panduan baru dari sinkronisasi'),'New content envelope updates a previously loaded student SOP without manual refresh');
    assert((await student.locator('#sop_magang-view .sop-updated').textContent()).includes(String(broadcast.revision)));
    await student.evaluate(envelope=>IPCOSSop.receive([envelope]),{Tipe:'sop_magang',DataJSON:JSON.stringify(published)});
    assert((await student.locator('#sop_magang-view').textContent()).includes('Panduan baru dari sinkronisasi'),'An older content envelope cannot replace the newest SOP');
    await admin.evaluate(envelope=>IPCOSSop.receive([envelope]),envelope);
    assert.equal(await admin.inputValue('#sop-intro'),'Input tidak hilang saat refresh atau navigasi','Receiving a newer published SOP leaves the active admin draft intact');
    await admin.evaluate(()=>IPCOSSop.open('sop_magang',true));assert.equal(await admin.inputValue('#sop-intro'),'Input tidak hilang saat refresh atau navigasi');
    admin.rejectNextDialog=true;await admin.evaluate(()=>IPCOSSop.cancel());assert(await admin.locator('#modal-sop-editor').isVisible());assert.equal(await admin.inputValue('#sop-intro'),'Input tidak hilang saat refresh atau navigasi');await cancel(admin);
    nextRead='failure';await open(student,'sop_magang',true);assert((await student.locator('#sop_magang-view').textContent()).includes('Internship guidance') || (await student.locator('#sop_magang-view').textContent()).includes('SOP Magang Uji'));
    await open(student,'sop_magang',true);
    pass('Refreshing never overwrites an active draft; cancel confirmation protects input and read failures recover without blanking prior guidance');

    const long='SOP '+('Panduan lengkap untuk mahasiswa internasional dan administrator '.repeat(5));documents.get('sop_magang').title=long;documents.get('sop_magang').titleEn=long;
    documents.get('sop_magang').sections[0].title=long;documents.get('sop_magang').sections[0].titleEn=long;
    await open(student,'sop_magang',true);await open(admin,'sop_magang',true);await edit(admin,'sop_magang');
    for(const width of [320,390,768,1365]) for(const lang of ['id','en']) for(const dark of [false,true]) {
        for(const target of [student,admin]) {await target.bringToFront();await target.setViewportSize({width,height:1000});await target.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();document.body.classList.toggle('dark-mode',dark);},{lang,dark});await layout(target,(target===student?'reader':'editor')+' '+width+' '+lang+' '+dark);}
    }
    await admin.bringToFront();await cancel(admin);documents.get('sop_magang').title='SOP Magang Uji';documents.get('sop_magang').titleEn='Internship SOP';documents.get('sop_magang').sections[0].title='Pengajuan';documents.get('sop_magang').sections[0].titleEn='Submission';
    fs.mkdirSync('../qa-sop',{recursive:true});await open(admin,'sop_magang',true);await edit(admin,'sop_magang');await admin.setViewportSize({width:1365,height:1000});await admin.screenshot({path:'../qa-sop/sop-admin-desktop.png'});await cancel(admin);
    await open(student,'sop_magang',true);await student.setViewportSize({width:390,height:844});await student.screenshot({path:'../qa-sop/sop-student-mobile.png'});
    pass('SOP readers and editors fit mobile, tablet and desktop in both languages and themes, including unusually long headings');

    await admin.bringToFront();await edit(admin,'sop_magang');await admin.fill('#sop-intro','Konten dari sesi lama tidak kembali');const staleSave=deferred();heldSave=staleSave;await admin.click('#sop-save');await staleSave.entered;
    await admin.evaluate(()=>logoutUser());await admin.waitForSelector('#welcome-modal',{state:'visible'});staleSave.release();await staleSave.done;await admin.evaluate(()=>new Promise(requestAnimationFrame));
    assert(!(await admin.locator('#modal-sop-editor').isVisible()));assert.equal(await admin.locator('#sop_magang-view').textContent(),'');assert.equal(await admin.locator('#sop_tugas_akhir-view').textContent(),'');
    await student.bringToFront();const staleFile=deferred();heldFile=staleFile;let afterLogoutDownloads=0;student.on('download',()=>afterLogoutDownloads++);
    await student.locator('#sop_magang-view [data-sop-action="download"][data-file-id="'+uploaded.id+'"]').click();await staleFile.entered;await student.evaluate(()=>logoutUser());await student.waitForSelector('#welcome-modal',{state:'visible'});staleFile.release();await staleFile.done;await student.evaluate(()=>new Promise(requestAnimationFrame));
    assert.equal(afterLogoutDownloads,0);assert.equal(await student.locator('#sop_magang-view').textContent(),'');assert.equal(await student.locator('#sop_tugas_akhir-view').textContent(),'');
    assert(!calls.some(call=>['create','update','update_content'].includes(call.action)));assert.deepEqual(errors,[]);
    pass('Logout clears SOP content and drafts; delayed saves and attachment downloads cannot restore an old session');
    fs.writeFileSync('test-results/sop-results.json',JSON.stringify({checks,errors,publicationRequests:calls.filter(call=>call.action==='save_sop').length},null,2));await browser.close();
})().catch(reportFailure);
