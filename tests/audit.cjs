const assert = require('node:assert/strict'), fs = require('node:fs');
const {chromium,reportFailure} = require('./browser.cjs');
const origin = 'http://127.0.0.1:8766', calls=[], requests=[], errors=[], checks=[];
const pass = name => { checks.push(name); console.log('PASS '+name); };
let holdRead=false, release;
const calendar=[{title:'Periode Baru',titleEn:'New Period',items:[{id:'new',text:'19 Okt 2030',sub:''}]}];
const templates=[{title:'Dokumen',items:[{id:'empty',text:'Empty',sub:''},{id:'placeholder',text:'Placeholder',sub:'#'},{id:'unsafe',text:'Unsafe',sub:'javascript:alert(1)'},{id:'valid',text:'Official',sub:'https://example.com/template.pdf'}]}];
(async()=>{
    const browser=await chromium.launch(), context=await browser.newContext({timezoneId:'America/Los_Angeles',viewport:{width:1365,height:900},reducedMotion:'reduce'});
    await context.route('**/*',async route=>{
        const url=route.request().url();
        if(url.includes('script.google.com/macros/')) {
            const data=route.request().postDataJSON();calls.push(data);let result;
            if(data.action==='student_login')result={status:'success',token:'audit-student',nama:'Audit Student'};
            else if(data.action==='get_data') {
                if(holdRead) {holdRead=false;await new Promise(resolve=>release=resolve);}
                result={status:'success',registrations:[],students:[],dosens:[],announcements:[],contents:[{Tipe:'kalender',DataJSON:JSON.stringify(calendar)},{Tipe:'template_berkas',DataJSON:JSON.stringify(templates)}]};
            } else if(await require('./next-mock.cjs')(route,data))return;
            else result={status:'success'};
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if(url.startsWith(origin)){requests.push(new URL(url).pathname);return route.continue();}
        return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.goto(origin);
    assert.equal(await page.locator('script[src]').count(),1);assert.equal(await page.locator('link[rel=stylesheet]').evaluateAll(links=>links.filter(link=>link.href.startsWith(location.origin)).length),1);
    assert.equal(requests.filter(url=>/\.js$/.test(url)).length,1);assert(!requests.some(url=>/pdfjs|\/sop-|\/admin-export-/.test(url)));
    for(const id of ['modal-chat-timeline','modal-doc-preview','modal-revision','modal-dospem','modal-reply'])assert.equal(await page.locator('#'+id).count(),0);
    assert.equal(await page.evaluate(()=>typeof openChatTimeline),'undefined');
    pass('Production loads one JS/one CSS asset; obsolete modals are absent and PDF/SOP/export remain deferred');
    assert(await page.locator('#main-workspace').evaluate(el=>el.inert));assert(await page.locator('#main-sidebar').evaluate(el=>el.inert));assert.equal(await page.evaluate(()=>countdownTimer),null);
    for(let i=0;i<12;i++) {await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('#welcome-modal')));}
    pass('Login keeps background controls inert and keyboard focus inside the dialog; countdown has no unauthenticated timer');
    assert.equal(await page.evaluate(()=>displayDate('2026-10-09 12:00:00').toISOString()),'2026-10-09T05:00:00.000Z');assert.equal(await page.evaluate(()=>timeAgo('invalid')),'-');
    pass('Timezone-less server timestamps use WIB even when the browser is in Los Angeles; invalid dates have a safe fallback');
    await page.fill('#input-nim','AUDIT');await page.locator('#input-nim').press('Enter');await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success');assert.equal(await page.locator('#main-workspace').evaluate(el=>el.inert),false);
    await page.evaluate(()=>switchTab(null,'templates-faq'));assert.equal(await page.locator('#template_berkas-content-container a').count(),1);assert.equal(await page.locator('#template_berkas-content-container a').getAttribute('href'),'https://example.com/template.pdf');assert.equal(await page.locator('#template_berkas-content-container .field-helper').count(),3);
    pass('Empty/hash/unsafe template links display availability text; valid document URLs still work');
    const countdown=await page.evaluate(()=>{
        const before=Date.parse('2030-10-19T23:59:58+07:00'),after=Date.parse('2030-10-20T00:00:00+07:00');
        const deadline=nearestAcademicDeadline(before);renderAcademicCountdown(before);
        const display=document.querySelector('.countdown-timer-display').textContent;
        const exhausted=nearestAcademicDeadline(after);renderAcademicCountdown(after);
        return {day:deadline.day,end:deadline.end,display,exhausted,disabled:document.querySelector('[data-countdown-reminder]').disabled};
    });
    assert.equal(countdown.day,'2030-10-19');assert.equal(countdown.end,Date.parse('2030-10-19T16:59:59Z'));assert(countdown.display.endsWith('1s'));assert.equal(countdown.exhausted,null);assert(countdown.disabled);
    await page.evaluate(()=>switchTab(null,'kalender'));assert((await page.locator('#kalender [data-countdown-label]').textContent()).includes('Periode Baru'));assert.notEqual(await page.evaluate(()=>countdownTimer),null);
    await page.evaluate(()=>toggleLanguage());assert((await page.locator('#kalender [data-countdown-label]').textContent()).includes('New Period'));
    const [download]=await Promise.all([page.waitForEvent('download'),page.click('[data-countdown-reminder]')]);assert.equal(download.suggestedFilename(),'IPCOS-calendar-20301019.ics');
    const ics=fs.readFileSync(await download.path(),'utf8');assert(ics.includes('DTSTART;VALUE=DATE:20301019'));assert(!ics.includes('20261019'));
    await page.evaluate(()=>switchTab(null,'templates-faq'));assert.equal(await page.evaluate(()=>countdownTimer),null);
    pass('Countdown and downloaded reminder follow edited dates in WIB, translate the period and stop offscreen; expired schedules disable the reminder');
    holdRead=true;const beforeReads=calls.filter(call=>call.action==='get_data').length;
    await page.evaluate(()=>{syncDatabase();syncDatabase();syncDatabase();});await page.waitForFunction(()=>syncPhase==='syncing');
    while(!release)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls.filter(call=>call.action==='get_data').length-beforeReads,1);release();await page.waitForFunction(()=>syncPhase==='success');
    pass('Repeated refresh clicks share one data request and apply the confirmed snapshot');
    const bodyTimeout=await page.evaluate(async origin=>{
        const timeoutOriginal=window.setTimeout;
        window.setTimeout=(fn,delay,...args)=>timeoutOriginal(fn,delay===120000?80:delay,...args);
        try {
            const result=readApiResult(await apiPost(origin+'/__test/stalled-json',{method:'POST',body:JSON.stringify({action:'get_data'})})).then(()=>({ok:false,reason:'Unexpected success'}),error=>({ok:error.name==='AbortError',name:error.name,message:error.message}));
            return await Promise.race([result,new Promise(resolve=>timeoutOriginal(()=>resolve({ok:false,reason:'Deadline did not abort body'}),1000))]);
        } finally {window.setTimeout=timeoutOriginal;}
    },origin);assert.equal(bodyTimeout.ok,true,JSON.stringify(bodyTimeout));
    pass('An API response with headers but a stalled JSON body still times out instead of locking the interface indefinitely');
    const table=await page.evaluate(()=>{
        const students=[{NIM:'1',Nama:'First'},{NIM:'2',Nama:'Second'}];renderMasterMahasiswa(students);renderMasterMahasiswa(students);
        return {source:students.map(student=>student.NIM),rows:[...document.querySelectorAll('#table-master-mhs tr')].map(row=>row.firstElementChild.textContent)};
    });assert.deepEqual(table.source,['1','2']);assert.deepEqual(table.rows,['2','1']);
    pass('Repeated master table rendering preserves the supplied array and stable newest-first ordering');
    for(const path of ['/backend/Next.gs','/tests/audit.cjs','/.env','/package.json','/script.js'])assert.equal((await page.request.get(origin+path)).status(),404);
    const headers=JSON.parse(fs.readFileSync('vercel.json','utf8')).headers;
    assert(headers.find(rule=>rule.source==='/(.*)').headers.some(header=>header.key==='X-Frame-Options'&&header.value==='DENY'));
    const immutable=headers.filter(rule=>rule.headers.some(header=>header.value.includes('immutable')));assert.equal(immutable.length,4);assert(immutable.every(rule=>rule.source.includes(':hash')));
    const report=JSON.parse(fs.readFileSync('test-results/build-report.json','utf8'));assert.equal(report.initialRequests.after,2);assert(report.js.after.gzip<report.js.before.gzip);assert(report.css.after.gzip<report.css.before.gzip);
    pass('Built output excludes backend/tests/env/uncompiled sources; immutable caching targets only fingerprinted assets and compressed sizes shrink');
    await page.evaluate(()=>logoutUser());await page.waitForSelector('#welcome-modal',{state:'visible'});assert(await page.locator('#main-workspace').evaluate(el=>el.inert));assert.equal(await page.evaluate(()=>countdownTimer),null);
    assert.deepEqual(errors,[]);pass('Logout restores background isolation and stops countdown activity; no runtime errors');
    fs.writeFileSync('test-results/audit-results.json',JSON.stringify({checks,errors,requests,build:report},null,2));await browser.close();
})().catch(reportFailure);
