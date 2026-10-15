const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, reportFailure} = require('./browser.cjs');
const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const calls = [], errors = [], checks = [];
const pass = message => { checks.push(message); console.log('PASS ' + message); };
const statuses = ['all','revision','processing','completed'];
const longTitle = 'eCommerce   partisipasi mahasiswa internasional O’Connor — ' + 'Komunikasi digital dan penelitian lintas budaya '.repeat(4);
const row = (id, jenis, status, date, times=[], nim='A', detail=longTitle) => ({
    id, nim, nama:'Mahasiswa Internasional Pengujian O’Connor', jenis, status, date,
    detail:'<b>Judul:</b> '+detail, link:'',
    note:JSON.stringify(times.map(time => ({role:'admin',sender:'Admin Uji',time,message:'Periksa halaman bertanda tangan dan nama lengkap.'})))
});
let records = [
    row('CASE-REV','Proposal','Revision','2026-10-01T01:00:00Z',['2026-10-13T01:00:00Z']),
    row('CASE-PENDING','Outline','Pending','2026-10-10T01:00:00Z'),
    row('CASE-RESUB','Skripsi Jurnal','  rEsUbMiTtEd  ','2026-10-05T01:00:00Z',['2026-10-14T01:00:00Z','invalid-log-date','2026-10-06T01:00:00Z'],' A '),
    row('CASE-DONE','Pendadaran','Accepted','2026-10-08T01:00:00Z',['2026-10-09T01:00:00Z']),
    row('CASE-SUPERVISOR','Pergantian Pembimbing','Pending','2026-10-11T01:00:00Z',['2026-10-12T01:00:00Z']),
    row('CASE-INVALID','Proposal','Pending','invalid-submission-date',['invalid-activity-date']),
    row('PRIVATE-FOREIGN','Proposal','Revision','2026-12-31T01:00:00Z',[],'B','Judul Rahasia Mahasiswa B')
];
const activity = ['CASE-RESUB','CASE-REV','CASE-SUPERVISOR','CASE-PENDING','CASE-DONE','CASE-INVALID'];
const submitted = ['CASE-SUPERVISOR','CASE-PENDING','CASE-DONE','CASE-RESUB','CASE-REV','CASE-INVALID'];
let nextRead = null, failRead = false;
function gate() { let enter,release; return {entered:new Promise(resolve=>enter=resolve),wait:new Promise(resolve=>release=resolve),enter:()=>enter(),release:()=>release()}; }
async function mode(page,width,lang,dark) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();if(document.body.classList.contains('dark-mode')!==dark)toggleDarkMode();},{lang,dark});
}
async function selected(page,value) {
    assert.deepEqual(await page.locator('#student-request-summary [aria-pressed=true]').evaluateAll(nodes=>nodes.map(node=>node.dataset.studentStatus)),[value]);
}
async function expectedRows(page,expected) {
    await page.waitForFunction(expected=>{
        const ids=[...document.querySelectorAll('#student-status [data-case-id]')].filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden').map(node=>node.dataset.caseId);
        return JSON.stringify(ids)===JSON.stringify(expected);
    },expected);
    for (const scope of ['#table-my-status','#student-mobile-list']) {
        assert.deepEqual(await page.locator(scope+' [data-case-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.caseId)),expected,scope+' uses the same filtered order');
    }
    for (const id of expected) assert.equal(await page.locator('#student-status [data-case-id="'+id+'"]:visible').count(),1,'Exactly one responsive CTA for '+id);
    const count=await page.locator('#student-request-count').textContent();
    assert.equal(Number(count.match(/\d+/)?.[0]),expected.length,'Live result count matches visible records');
}
async function counts(page,expected) {
    const values=await page.locator('#student-request-summary [data-student-status]').evaluateAll(nodes=>nodes.map(node=>({status:node.dataset.studentStatus,count:Number(node.textContent.match(/\d+/g)?.at(-1))})));
    assert.deepEqual(values,statuses.map((status,index)=>({status,count:expected[index]})),'Status counts combine search but exclude the selected status');
}
async function layout(page,label) {
    const state=await page.locator('#student-status').evaluate(root=>{
        const visible=node=>node.getClientRects().length&&!node.closest('[hidden],details:not([open])>:not(summary)')&&getComputedStyle(node).visibility!=='hidden';
        const controls=[...root.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,dt')].filter(node=>visible(node)&&node.clientWidth&&!node.classList.contains('sr-only'));
        const clipped=controls.filter(node=>node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).textOverflow!=='ellipsis').map(node=>({id:node.id,text:node.textContent.trim().slice(0,90)}));
        const buttons=[...root.querySelectorAll('#student-request-summary button')].map(node=>({status:node.dataset.studentStatus,box:node.getBoundingClientRect().toJSON()}));
        return {overflow:document.documentElement.scrollWidth>innerWidth+2,clipped,buttons};
    });
    assert.equal(state.overflow,false,label+' page overflow'); assert.deepEqual(state.clipped,[],label+' clipped labels or controls');
    assert.equal(state.buttons.length,4);
    for (const {status,box} of state.buttons) {
        assert(box.width>0&&box.height>=43.99,label+' usable status target '+status);
        assert(box.left>=-1&&box.right<=page.viewportSize().width+1,label+' status inside viewport '+status);
    }
    for (let a=0;a<state.buttons.length;a++) for (let b=a+1;b<state.buttons.length;b++) {
        const x=state.buttons[a].box,y=state.buttons[b].box;
        assert(!(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1),label+' overlapping status controls');
    }
}
async function matrix(page,label,expected) {
    for (const width of [320,390,768,1365]) for (const lang of ['id','en']) for (const dark of [false,true]) {
        await mode(page,width,lang,dark); await expectedRows(page,expected); await layout(page,`${label} ${width}/${lang}/${dark}`);
    }
}
async function login(page,nim='A') {
    await page.goto(origin); await page.fill('#input-nim',nim); await page.locator('#input-nim').press('Enter');
    await page.waitForSelector('#welcome-modal',{state:'hidden'}); await page.waitForFunction(()=>syncPhase==='success');
    await page.evaluate(()=>switchTab(null,'student-status'));
}

(async()=>{
    const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
    await context.route('**/*',async route=>{
        const url=route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data=route.request().postDataJSON(); calls.push(data); let result;
            if (data.action==='student_login') result={status:'success',token:'student-'+data.nim,nama:'Mahasiswa Internasional Pengujian O’Connor'};
            else if (data.action==='get_data') {
                const held=nextRead;nextRead=null;if(held){held.enter();await held.wait;}
                // Deliberately include foreign records to exercise the client role filter.
                if(failRead){failRead=false;result={status:'error',message:'Gangguan refresh pengujian.'};}
                else result={status:'success',registrations:structuredClone(records),students:[],dosens:[],contents:[],announcements:[],services:[]};
            } else if (data.action==='get_journey') result={status:'success',journey:{checks:{},revision:1}};
            else if (data.action==='logout') result={status:'success'};
            else if (await require('./next-mock.cjs')(route,data)) return;
            else throw Error('Unexpected student request fixture API '+data.action);
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if(url.startsWith(origin))return route.continue();
        if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});
        return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await login(page);
    assert.deepEqual(await page.locator('#student-request-summary [data-student-status]').evaluateAll(nodes=>nodes.map(node=>node.dataset.studentStatus)),statuses);
    for(const id of ['student-request-search','student-request-order'])assert(await page.locator('#'+id).evaluate(node=>!!(node.labels?.length||node.getAttribute('aria-label')||node.getAttribute('aria-labelledby'))),id+' has an accessible label');
    assert.equal(await page.getAttribute('#student-request-count','aria-live'),'polite');
    await selected(page,'all');await expectedRows(page,activity);await counts(page,[6,1,4,1]);
    assert(!(await page.locator('#student-status').textContent()).includes('PRIVATE-FOREIGN'));assert(!(await page.locator('#student-status').textContent()).includes('Judul Rahasia Mahasiswa B'));
    await matrix(page,'all requests',activity);
    pass('Owned requests, normalized NIM/status, real status counts, latest valid activity sorting, long titles and responsive single actions fit all 16 screen/language/theme modes');

    await mode(page,1365,'id',false);
    for(const [status,ids] of [['revision',['CASE-REV']],['processing',['CASE-RESUB','CASE-SUPERVISOR','CASE-PENDING','CASE-INVALID']],['completed',['CASE-DONE']]]){
        const button=page.locator('[data-student-status="'+status+'"]');await button.focus();await button.press('Enter');await selected(page,status);await expectedRows(page,ids);await counts(page,[6,1,4,1]);
    }
    await page.locator('[data-student-status=all]').click();
    await page.selectOption('#student-request-order','submitted');await expectedRows(page,submitted);
    await page.selectOption('#student-request-order','activity');await expectedRows(page,activity);
    for(const [query,ids] of [['  UJIAN   SEMINAR PROPOSAL  ',['CASE-REV','CASE-INVALID']],['  proposal   SEMINAR  ',['CASE-REV','CASE-INVALID']],['case-resub',['CASE-RESUB']],[' eCommerce   partisipasi ',activity]]){
        await page.fill('#student-request-search',query);await expectedRows(page,ids);
    }
    await page.fill('#student-request-search','PROPOSAL seminar');await page.locator('[data-student-status=processing]').click();await expectedRows(page,['CASE-INVALID']);await counts(page,[2,1,1,0]);
    await page.evaluate(()=>toggleLanguage());await selected(page,'processing');await expectedRows(page,['CASE-INVALID']);assert.equal(await page.inputValue('#student-request-search'),'PROPOSAL seminar');
    await page.locator('#student-request-reset').click();await expectedRows(page,activity);await selected(page,'all');assert.equal(await page.inputValue('#student-request-search'),'');assert.equal(await page.inputValue('#student-request-order'),'activity');
    pass('Keyboard status filters, both date orders, bilingual service/title/ID search, combined counts and reset use the same truthful dataset');

    await mode(page,390,'id',true);
    for(const [id,label] of [['CASE-REV','Lihat Perbaikan'],['CASE-PENDING','Lihat Detail'],['CASE-RESUB','Lihat Detail'],['CASE-DONE','Lihat Hasil']]){
        const button=page.locator('#student-status [data-case-id="'+id+'"]:visible');assert.equal((await button.textContent()).replace(/\s+/g,' ').trim(),label);
        await button.focus();await button.press('Enter');await page.waitForSelector('#modal-case-detail',{state:'visible'});assert.equal(await page.evaluate(()=>selectedCaseId),id,'Action opens its actual record');
        await page.locator('#modal-case-detail .case-close').click();await page.waitForSelector('#modal-case-detail',{state:'hidden'});
        await page.waitForFunction(id=>document.activeElement?.dataset.caseId===id,id);
    }
    assert.equal(calls.filter(data=>['create','update','revise_request','save_document_review'].includes(data.action)).length,0);
    await page.locator('#student-status [data-case-id="CASE-PENDING"]:visible').focus();
    records.find(record=>record.id==='CASE-PENDING').detail+=' Data diperbarui melalui sinkronisasi pengujian.';
    await page.evaluate(()=>syncDatabase());await expectedRows(page,activity);
    await page.waitForFunction(()=>document.activeElement?.dataset.caseId==='CASE-PENDING');
    pass('Each status has one clear CTA that opens the correct owned record, returns keyboard focus, and never submits a request or decision');

    await page.fill('#student-request-search',' eCommerce  partisipasi ');await page.selectOption('#student-request-order','submitted');await page.locator('[data-student-status=processing]').click();
    await page.locator('#student-request-search').focus();await page.locator('#student-request-search').press('End');
    const caret=await page.locator('#student-request-search').evaluate(node=>node.selectionStart);
    await page.evaluate(()=>syncDatabase());await expectedRows(page,['CASE-SUPERVISOR','CASE-PENDING','CASE-RESUB','CASE-INVALID']);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'student-request-search','An unchanged sync preserves the live search control');
    const pending=gate();nextRead=pending;await page.evaluate(()=>{window.studentStatusSync=syncDatabase();});await pending.entered;
    assert.equal(await page.inputValue('#student-request-search'),' eCommerce  partisipasi ');await selected(page,'processing');await expectedRows(page,['CASE-SUPERVISOR','CASE-PENDING','CASE-RESUB','CASE-INVALID']);
    records.push(row('CASE-NEW','Outline','Pending','2026-10-15T01:00:00Z'));pending.release();await page.evaluate(()=>window.studentStatusSync);
    await expectedRows(page,['CASE-NEW','CASE-SUPERVISOR','CASE-PENDING','CASE-RESUB','CASE-INVALID']);assert.equal(await page.evaluate(()=>document.activeElement.id),'student-request-search');assert.equal(await page.locator('#student-request-search').evaluate(node=>node.selectionStart),caret);
    assert.equal(await page.inputValue('#student-request-order'),'submitted');await selected(page,'processing');
    failRead=true;await page.evaluate(()=>syncDatabase());assert.equal(await page.evaluate(()=>syncPhase),'error');
    await expectedRows(page,['CASE-NEW','CASE-SUPERVISOR','CASE-PENDING','CASE-RESUB','CASE-INVALID']);
    assert.equal(await page.inputValue('#student-request-search'),' eCommerce  partisipasi ');assert.equal(await page.inputValue('#student-request-order'),'submitted');await selected(page,'processing');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'student-request-search');assert.equal(await page.locator('#student-request-search').evaluate(node=>node.selectionStart),caret);
    await page.evaluate(()=>syncDatabase());assert.equal(await page.evaluate(()=>syncPhase),'success');
    await page.evaluate(()=>toggleLanguage());assert.equal(await page.inputValue('#student-request-search'),' eCommerce  partisipasi ');await selected(page,'processing');
    await page.locator('#student-request-reset').click();await page.locator('[data-student-status=revision]').click();
    const original=page.locator('#student-status [data-case-id="CASE-REV"]:visible');await original.focus();await original.press('Enter');await page.waitForSelector('#modal-case-detail',{state:'visible'});
    records.find(record=>record.id==='CASE-REV').status='Accepted';await page.evaluate(()=>syncDatabase());
    await page.locator('#modal-case-detail .case-close').click();await page.waitForSelector('#modal-case-detail',{state:'hidden'});await expectedRows(page,[]);
    assert(await page.evaluate(()=>!!document.activeElement?.closest('#student-status')&&document.activeElement.getClientRects().length>0&&!document.activeElement.closest('[hidden],[inert]')),'Closing a filtered-away record restores focus to a visible request control');
    pass('Unchanged, pending and failed sync retain rows, filters, order, search focus/caret; language and closing a filtered-away record preserve usable controls');

    await page.locator('[data-student-status=all]').click();await page.fill('#student-request-search','nothing matches this request');await expectedRows(page,[]);
    await matrix(page,'no matching requests',[]);assert(await page.locator('#student-request-reset').isVisible());
    await page.locator('#student-request-reset').click();assert((await page.locator('#student-status [data-case-id]:visible').count())>0);
    await page.fill('#student-request-search','remember only within this account');await page.locator('[data-student-status=completed]').click();await page.selectOption('#student-request-order','submitted');
    await page.evaluate(()=>logoutUser());await page.waitForSelector('#welcome-modal',{state:'visible'});await login(page,'C');
    await selected(page,'all');assert.equal(await page.inputValue('#student-request-search'),'');assert.equal(await page.inputValue('#student-request-order'),'activity');await expectedRows(page,[]);await counts(page,[0,0,0,0]);
    await matrix(page,'no request history',[]);
    const newRequest=page.locator('#student-request-empty [data-student-new-request]:visible');assert.equal(await newRequest.count(),1,'Empty history offers a visible registration CTA');await newRequest.click();assert.equal(await page.evaluate(()=>document.querySelector('.tab-content.active')?.id),'pendaftaran');
    assert.equal(calls.filter(data=>['create','update','revise_request','save_document_review','post_announcement'].includes(data.action)).length,0);assert.deepEqual(errors,[]);
    pass('No-results and no-history states fit 32 more layouts, offer reset or new registration appropriately, and account changes clear all private filter state without academic writes');
    fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/student-status-results.json',JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(reportFailure);
