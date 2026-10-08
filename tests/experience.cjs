const {chromium, reportFailure} = require('./browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {pdf} = require('./fixtures.cjs');

// Every academic/API request is intercepted. These fixtures never contact Google
// or publish real SOP text, upload documents, or change a student's record.
const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const calls = [], errors = [], checks = [];
const clone = value => structuredClone(value);
const pass = label => {checks.push(label);console.log('PASS '+label);};
const records = Array.from({length:13},(_,i)=>({id:'queue-'+i,nim:i%2 ? 'B':'A',nama:'Mahasiswa Pemeriksaan '+i,jenis:'Proposal',status:'Pending',date:new Date(Date.UTC(2026,9,1+i,1)).toISOString(),detail:'<b>Judul:</b> Pemeriksaan pengajuan mahasiswa '+i+'<p>'+('Rincian akademik untuk pemeriksaan. '.repeat(50))+'</p>',link:'<a href="https://example.com/acc.pdf">ACC Sempro</a>',note:'[]'}));
records.push({id:'excluded-type',nim:'B',nama:'Mahasiswa Di Luar Filter',jenis:'Outline',status:'Pending',date:'2026-10-19T01:00:00Z',detail:'Pengajuan lain',link:'',note:'[]'},
    {id:'excluded-status',nim:'A',nama:'Mahasiswa Pemeriksaan A',jenis:'Proposal',status:'Accepted',date:'2026-10-20T01:00:00Z',detail:'Selesai',link:'',note:'[]'},
    {id:'correction-A',nim:'A',nama:'Mahasiswa Internasional Uji',jenis:'Pendadaran',status:'Revision',date:'2026-10-18T01:00:00Z',detail:'Judul untuk diperbaiki',link:'<a href="https://example.com/defense.pdf">Berkas Pendadaran</a>',note:JSON.stringify([{sender:'Admin Uji',role:'admin',time:'2026-10-19T01:00:00Z',message:'Berkas yang perlu diperbaiki:\n- Berkas Pendadaran\n\nInstruksi:\n'+('Unggah kembali dokumen yang ditandatangani. '.repeat(25))}])});
const sopTypes = ['sop_magang','sop_tugas_akhir'];
const sopDocs = new Map(sopTypes.map(type=>[type,{schema:1,type,revision:1,updatedAt:'2026-10-08T01:00:00Z',title:type==='sop_magang'?'SOP Magang':'SOP Tugas Akhir',titleEn:type==='sop_magang'?'Internship SOP':'Final Project SOP',intro:'Panduan pengujian akademik.',introEn:'Academic test guidance.',sections:Array.from({length:8},(_,i)=>({id:'section-'+i,title:'Tahap '+(i+1)+' · '+('Panduan akademik '.repeat(i===2?6:1)),titleEn:'Step '+(i+1)+' · '+('Academic guidance '.repeat(i===2?6:1)),body:('Instruksi lengkap untuk mahasiswa.\n'.repeat(30)),bodyEn:('Complete instructions for students.\n'.repeat(30)),links:[],files:i===0?[{id:'fixture-guide',fileName:'guide.pdf',mimeType:'application/pdf',size:pdf('guide').length}]:[]}))}]));
let nextUpdate = '', nextCreate = '', nextSopSave = '', nextRead = false, heldUpdate, heldCreate;
const requests = new Map();
function gate() {
    let enter,release,finish;
    return {entered:new Promise(resolve=>enter=resolve),wait:new Promise(resolve=>release=resolve),done:new Promise(resolve=>finish=resolve),enter:()=>enter(),release:()=>release(),finish:()=>finish()};
}
async function mock(context) {
    await context.route('**/*',async route=>{
        const url = route.request().url();
        if(url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON();if(await require('./next-mock.cjs')(route,data))return;calls.push(data);let result,held;
            if(data.action==='admin_login') result={status:'success',token:'admin'};
            else if(data.action==='student_login') result={status:'success',token:'student',nama:'Mahasiswa Internasional Pengujian Dengan Nama Panjang'};
            else if(data.action==='get_data') {if(nextRead){nextRead=false;result={status:'error',message:'Gangguan pembacaan uji'};}else result={status:'success',registrations:clone(data.token==='admin'?records:records.filter(item=>item.nim==='A')),students:[],dosens:[{Nama:'Dosen Uji',Terpakai:0,Maksimal:5}],contents:[],announcements:[],services:[],journeySupported:true,journey:{checks:{},revision:1,updatedAt:'2026-10-08T01:00:00Z'}};}
            else if(data.action==='get_journey') result={status:'success',journey:{checks:{},revision:1,updatedAt:'2026-10-08T01:00:00Z'}};
            else if(data.action==='get_sop') {assert(sopTypes.includes(data.type));result={status:'success',document:clone(sopDocs.get(data.type))};}
            else if(data.action==='get_sop_file') result={status:'success',fileName:'guide.pdf',mimeType:'application/pdf',base64:pdf('guide').toString('base64')};
            else if(data.action==='save_sop') {
                assert.equal(data.token,'admin');assert(sopTypes.includes(data.type));
                if(nextSopSave) {nextSopSave='';result={status:'error',message:'Gangguan penyimpanan SOP uji'};}
                else if(requests.has(data.requestId)) result=clone(requests.get(data.requestId));
                else {
                    const doc=clone(data.document);doc.revision=sopDocs.get(data.type).revision+1;doc.updatedAt='2026-10-08T02:00:00Z';
                    for(const section of doc.sections) for(const file of section.files) {const upload=(data.uploads||[]).find(upload=>upload.id===file.id);if(upload){file.id='saved-'+upload.id;file.fileName=upload.fileName;file.mimeType=upload.mimeType;file.size=Buffer.from(upload.base64,'base64').length;}}
                    sopDocs.set(data.type,doc);result={status:'success',document:clone(doc)};requests.set(data.requestId,clone(result));
                }
            } else if(data.action==='update') {
                held=heldUpdate;heldUpdate=null;if(held){held.enter();await held.wait;}
                if(nextUpdate){nextUpdate='';result={status:'error',message:'Gangguan penyimpanan pengajuan uji'};}
                else {const item=records.find(item=>item.id===data.id);assert(item);if(data.token==='student')assert.equal(item.nim,'A');item.status=data.status;const notes=JSON.parse(item.note);notes.push({sender:'Pengujian',role:data.token==='admin'?'admin':'mhs',time:'2026-10-08T03:00:00Z',message:data.noteText});item.note=JSON.stringify(notes);result={status:'success'};}
            } else if(data.action==='create') {
                assert.equal(data.token,'student');held=heldCreate;heldCreate=null;if(held){held.enter();await held.wait;}
                if(nextCreate){nextCreate='';result={status:'error',message:'Gangguan pengiriman pengajuan uji'};}
                else {const item={id:'created-experience',nim:'A',nama:'Mahasiswa Pengujian',jenis:data.jenis,status:'Pending',date:'2026-10-08T04:00:00Z',detail:data.detail,link:'',note:'[]'};records.push(item);result={status:'success',id:item.id,date:item.date};}
            } else if(data.action==='logout') result={status:'success'};
            else throw Error('Unexpected academic request '+data.action);
            await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});held?.finish();return;
        }
        if(url.startsWith(origin)) return route.continue();
        if(url.includes('chart.js')) return route.fulfill({contentType:'text/javascript',body:'window.Chart=class {static defaults={font:{}};destroy(){};constructor(){}};'});
        return route.abort();
    });
}
async function login(browser,role,options={}) {
    const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce',...options});await mock(context);
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.permitLeave=false;page.on('dialog',dialog=>page.permitLeave?dialog.accept():dialog.dismiss());
    await page.goto(origin);
    if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}
    else {await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');}
    await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success');return page;
}
async function activeTab(page,id) {await page.waitForFunction(id=>document.querySelector('.tab-content.active')?.id===id,id);}
async function frames(page) {await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function layout(page,label) {
    const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...document.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,.nav-item,.user-subtext,.request-state-next,.request-state-owner')].filter(el=>el.getClientRects().length&&el.clientWidth>0&&!el.closest('table,.sop-format-toolbar')).filter(el=>el.scrollWidth>el.clientWidth+3).map(el=>({id:el.id,text:el.textContent.trim().slice(0,100)}))}));
    assert.equal(state.overflow,false,label+' viewport overflow');assert.deepEqual(state.clipped,[],label+' clipped text');
}
async function visibleAction(page,selector,label) {
    const result=await page.locator(selector).evaluate(el=>{const box=el.getBoundingClientRect();const x=Math.max(0,Math.min(innerWidth-1,box.left+box.width/2)),y=Math.max(0,Math.min(innerHeight-1,box.top+box.height/2));const hit=document.elementFromPoint(x,y),modal=el.closest('.overlay'),card=el.closest('.modal-card'),cardBox=card?.getBoundingClientRect();const rect=value=>value?{left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width,height:value.height}:null;return {visible:box.width>0&&box.height>0&&box.left>=-1&&box.right<=innerWidth+1&&box.top>=-1&&box.bottom<=innerHeight+1,unobscured:!!hit&&(hit===el||el.contains(hit)),diagnostics:{action:rect(box),card:rect(cardBox),layoutViewport:{width:innerWidth,height:innerHeight},visualViewport:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetTop:visualViewport.offsetTop,offsetLeft:visualViewport.offsetLeft,scale:visualViewport.scale}:null,reviewHeight:modal?getComputedStyle(modal).getPropertyValue('--review-viewport-height').trim():'',keyboardCompact:modal?.classList.contains('case-keyboard-open')||false,focusedControl:{tag:document.activeElement?.tagName,id:document.activeElement?.id},hitControl:{tag:hit?.tagName,id:hit?.id},cardStyle:card?{height:getComputedStyle(card).height,maxHeight:getComputedStyle(card).maxHeight,padding:getComputedStyle(card).padding}:null}};});
    assert.equal(result.visible,true,label+' visible within viewport '+JSON.stringify(result.diagnostics));assert.equal(result.unobscured,true,label+' receives taps '+JSON.stringify(result.diagnostics));
}
const section=(page,id)=>page.locator('#sop-editor-sections [data-section-id="'+id+'"]');
async function openSop(page,type='sop_magang') {await page.evaluate(type=>switchTab(null,type==='sop_magang'?'sop-magang':'sop-tugas-akhir'),type);await page.waitForSelector('#'+type+'-view .sop-section');}
async function editSop(page) {await openSop(page);await page.evaluate(()=>IPCOSSop.edit('sop_magang'));await page.waitForSelector('#modal-sop-editor',{state:'visible'});}

(async()=>{
    const browser=await chromium.launch();const student=await login(browser,'mhs'),admin=await login(browser,'admin');
    for(const target of [student,admin]) {
        await target.bringToFront();assert(await target.locator('#workspace-profile').isVisible());assert.equal(await target.locator('#workspace-profile').getAttribute('open'),null);
        assert(await target.locator('#student-header').isHidden(),'The large identity panel only opens when the profile is requested');
        const summary=target.locator('#workspace-profile > summary');await summary.focus();await summary.press('Enter');assert(await target.locator('#student-header').isVisible());assert((await target.locator('#header-subtext').textContent()).includes(target===student?'NIM':'Administrator'));
        await summary.press('Enter');assert(await target.locator('#student-header').isHidden());
        const dimensions=await target.locator('#workspace-profile').boundingBox();assert(dimensions.height<=80,'Closed profile keeps the workspace header compact');
        const visibleTargets=await target.locator('#main-sidebar .nav-item').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).display!=='none').map(node=>node.dataset.navTarget));
        assert(visibleTargets.includes(target===student?'student-status':'admin-data'));assert(!visibleTargets.includes(target===student?'admin-data':'student-status'),'Navigation exposes only authorized role links');
        await target.locator('#main-sidebar details[data-nav-group="academic"] > summary').focus();await target.locator('#main-sidebar details[data-nav-group="academic"] > summary').press('Enter');assert(await target.locator('#main-sidebar details[data-nav-group="academic"]').getAttribute('open')!==null);
        const link=target.locator('#main-sidebar [data-nav-target="kalender"]');await link.focus();await link.press('Enter');await activeTab(target,'kalender');assert.equal(await link.getAttribute('aria-current'),'page');
        await target.evaluate(()=>toggleLanguage());assert.equal(await link.getAttribute('aria-current'),'page');assert((await target.locator('#main-sidebar details[data-nav-group="academic"] > summary').textContent()).includes('Academic'));
        await target.evaluate(()=>toggleLanguage());await target.evaluate(()=>switchTab(null,'dashboard'));
    }
    pass('Compact identity opens accessibly on demand; navigation follows each role, groups disclose by keyboard and active location survives language switching');

    // Check painted hit targets before clicking: isVisible alone misses a
    // dropdown clipped by its ancestor's overflow rule.
    for(const target of [student,admin]) {
        await target.bringToFront();
        for(const width of [1365,768,390,320]) for(const lang of ['id','en']) {
            await target.setViewportSize({width,height:900});
            await target.evaluate(lang=>{if(currentLang!==lang)toggleLanguage();},lang);
            await target.locator('#profile-initials').click();await frames(target);
            assert(await target.locator('#workspace-profile').evaluate(el=>el.open));
            await visibleAction(target,'#student-header .btn-print','Painted profile refresh '+width+' '+lang);
            await visibleAction(target,'#student-header .btn-logout','Painted profile logout '+width+' '+lang);
            const reads=calls.filter(call=>call.action==='get_data').length;
            await target.locator('#student-header .btn-print').click();
            await target.waitForFunction(()=>syncPhase==='success');
            assert(calls.filter(call=>call.action==='get_data').length>reads,'Profile refresh actually reaches the existing read handler');
            assert(await target.locator('#workspace-profile').evaluate(el=>el.open));
            await target.locator('#profile-initials').click();assert(!await target.locator('#workspace-profile').evaluate(el=>el.open));
        }
        await target.setViewportSize({width:1365,height:900});await target.evaluate(()=>{if(currentLang!=='id')toggleLanguage();});
        await target.locator('#profile-summary-name').click();await visibleAction(target,'#student-header .btn-logout','Profile name opens a usable menu');
        await target.locator('#task-home h2').click();assert(!await target.locator('#workspace-profile').evaluate(el=>el.open));
    }
    fs.mkdirSync('../qa-profile',{recursive:true});
    for(const role of ['mhs','admin']) {
        const touch=await login(browser,role,{viewport:{width:390,height:844},hasTouch:true});await touch.bringToFront();
        await touch.locator('#profile-initials').tap();await frames(touch);
        await visibleAction(touch,'#student-header .btn-print','Touch profile refresh '+role);
        await visibleAction(touch,'#student-header .btn-logout','Touch profile logout '+role);
        await touch.locator('#student-header .btn-print').tap();await touch.waitForFunction(()=>syncPhase==='success');
        await touch.screenshot({path:'../qa-profile/'+role+'-menu-fixed.png'});
        await touch.locator('#student-header .btn-logout').tap();assert.equal(await touch.evaluate(()=>currentUser.role),role,'Cancelling logout keeps the account active');
        touch.permitLeave=true;await touch.locator('#student-header .btn-logout').tap();await touch.waitForSelector('#welcome-modal',{state:'visible'});
        assert(await touch.locator('#workspace-profile').isHidden());await touch.context().close();
    }
    pass('Profile menus are painted and clickable at four widths in both languages; mouse and touch refresh/logout work for students and admins');

    await student.bringToFront();await student.setViewportSize({width:390,height:844});assert(await student.locator('#student-bottom-nav').isVisible());assert.equal(await student.locator('#student-bottom-nav [data-bottom-target]').count(),4);
    const requestNav=student.locator('#student-bottom-nav [data-bottom-target="student-status"]');await requestNav.focus();await requestNav.press('Enter');await activeTab(student,'student-status');assert.equal(await requestNav.getAttribute('aria-current'),'page');
    const sopNav=student.locator('#student-bottom-nav [data-bottom-target="sop-magang"]');await sopNav.focus();await sopNav.press('Space');await student.waitForSelector('#sop-picker[open]');await student.click('[data-sop-destination="sop-tugas-akhir"]');await activeTab(student,'sop-tugas-akhir');await sopNav.click();await student.click('[data-sop-destination="remidial"]');await activeTab(student,'remidial');await sopNav.click();await student.locator('[data-picker-close]').press('Enter');assert(!await student.locator('#sop-picker').evaluate(el=>el.open));await sopNav.click();await student.click('[data-sop-destination="sop-magang"]');await activeTab(student,'sop-magang');assert.equal(await sopNav.getAttribute('aria-current'),'page');
    const menuNav=student.locator('#student-bottom-nav [data-bottom-target="menu"]');await menuNav.click();assert.equal(await menuNav.getAttribute('aria-expanded'),'true');assert(await student.locator('#main-sidebar').evaluate(el=>el.classList.contains('active')));
    await student.locator('#main-sidebar details[data-nav-group="help"] > summary').click();await student.locator('#main-sidebar [data-nav-target="templates-faq"]').click();await activeTab(student,'templates-faq');assert.equal(await menuNav.getAttribute('aria-expanded'),'false');assert(!await student.locator('#main-sidebar').evaluate(el=>el.classList.contains('active')));
    await menuNav.click();await student.locator('#nav-backdrop').click({position:{x:385,y:600}});assert.equal(await menuNav.getAttribute('aria-expanded'),'false');
    await student.setViewportSize({width:1365,height:900});assert(await student.locator('#student-bottom-nav').isHidden());await admin.bringToFront();await admin.setViewportSize({width:390,height:844});assert(await admin.locator('#student-bottom-nav').isHidden());await admin.click('.mobile-nav-toggle');assert(await admin.locator('#main-sidebar').evaluate(el=>el.classList.contains('active')));await admin.locator('#main-sidebar details[data-nav-group="management"] > summary').click();await admin.locator('#main-sidebar [data-nav-target="admin-dosen"]').click();await activeTab(admin,'admin-dosen');assert(!await admin.locator('#main-sidebar').evaluate(el=>el.classList.contains('active')));await admin.click('.mobile-nav-toggle');await admin.keyboard.press('Escape');assert(!await admin.locator('#main-sidebar').evaluate(el=>el.classList.contains('active')));assert.equal(await admin.locator('.mobile-nav-toggle').getAttribute('aria-expanded'),'false');await admin.setViewportSize({width:1365,height:900});await student.evaluate(()=>switchTab(null,'dashboard'));
    pass('Mobile student navigation supports keyboard/active state and a dismissible menu; desktop and admin views never receive the student bottom bar');

    await admin.bringToFront();await admin.evaluate(()=>switchTab(null,'admin-data'));await admin.selectOption('#admin-status-filter','ACTION_REQUIRED');await admin.evaluate(()=>document.getElementById('queue-advanced').open=true);await admin.selectOption('#admin-type-filter','Proposal');
    const expected=await admin.evaluate(()=>adminFilteredData.map(item=>String(item.id)));assert.equal(expected.length,13);assert(!expected.includes('excluded-type'));assert(!expected.includes('excluded-status'));
    await admin.evaluate(id=>openCaseDetail(id),expected[0]);assert(await admin.locator('#case-review-prev').isDisabled());assert.equal(await admin.locator('#case-review-next').isDisabled(),false);
    await admin.locator('#case-review-next').focus();await admin.locator('#case-review-next').press('Enter');assert.equal(await admin.evaluate(()=>selectedCaseId),expected[1]);
    await admin.evaluate(id=>openCaseDetail(id),expected[9]);await admin.click('#case-review-next');assert.equal(await admin.evaluate(()=>selectedCaseId),expected[10],'Review navigation crosses paginated queue boundaries');
    assert((await admin.locator('#case-review-position').textContent()).includes('13'));await admin.evaluate(id=>openCaseDetail(id),expected.at(-1));assert(await admin.locator('#case-review-next').isDisabled());
    await admin.click('#case-review-prev');assert.equal(await admin.evaluate(()=>selectedCaseId),expected.at(-2));
    pass('Admin previous/next follows the complete active sorted/filtered queue, crosses pages, supports Enter and disables both boundaries');

    await admin.evaluate(id=>openCaseDetail(id),expected[0]);await admin.evaluate(()=>caseDetailAction('revision'));await admin.check('[name="revision-document"][value="Isian pengajuan"]');await admin.fill('#case-revision-note','Instruksi admin tidak boleh hilang');
    await admin.click('#case-review-next');assert.equal(await admin.evaluate(()=>selectedCaseId),expected[0]);assert.equal(await admin.inputValue('#case-revision-note'),'Instruksi admin tidak boleh hilang');assert(await admin.isChecked('[name="revision-document"][value="Isian pengajuan"]'));
    nextUpdate='failure';const busy=gate();heldUpdate=busy;const updatesBefore=calls.filter(call=>call.action==='update').length;await admin.click('#btn-case-submit');await busy.entered;
    await admin.evaluate(()=>IPCOSReview.navigate(1));assert.equal(await admin.evaluate(()=>selectedCaseId),expected[0]);assert.equal(calls.filter(call=>call.action==='update').length,updatesBefore+1);assert(await admin.locator('#btn-case-submit').isDisabled());
    const progress=await admin.locator('#case-action-feedback-steps').getAttribute('data-stage');assert.equal(progress,'sending');assert(!(await admin.locator('#case-action-feedback-steps').textContent()).includes('berhasil'));
    busy.release();await busy.done;await admin.waitForFunction(()=>!isPreparingCorrection&&!activeUpdateIds.size);assert.equal(await admin.inputValue('#case-revision-note'),'Instruksi admin tidak boleh hilang');assert.equal(await admin.locator('#case-action-feedback-steps').getAttribute('data-stage'),'uncertain');assert((await admin.locator('#case-action-feedback').textContent()).trim());
    await admin.locator('#case-revision-note').evaluate(el=>{el.focus();el.setSelectionRange(3,14,'forward');});
    const caseFocus=await admin.evaluate(()=>({id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}));
    const filteredBeforeLanguage=await admin.evaluate(()=>adminFilteredData.map(item=>item.id)),filterValuesBefore=await admin.locator('#admin-type-filter option').evaluateAll(options=>options.map(option=>option.value));
    await admin.evaluate(()=>toggleLanguage());assert.equal(await admin.inputValue('#admin-type-filter'),'Proposal','Translated service options retain canonical filter values');assert.deepEqual(await admin.locator('#admin-type-filter option').evaluateAll(options=>options.map(option=>option.value)),filterValuesBefore,'Every translated admin service option keeps its original data value');assert.deepEqual(await admin.evaluate(()=>adminFilteredData.map(item=>item.id)),filteredBeforeLanguage,'English preserves the exact filtered queue and its order');assert.equal(await admin.inputValue('#case-revision-note'),'Instruksi admin tidak boleh hilang');assert(await admin.isChecked('[name="revision-document"][value="Isian pengajuan"]'));assert.deepEqual(await admin.evaluate(()=>({id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd})),caseFocus,'Language refresh preserves case editor focus and selection');assert((await admin.locator('#case-action-feedback-steps').textContent()).includes('confirmation'),'Correction delivery progress translates without resetting its uncertainty stage');assert((await admin.locator('#case-action-feedback').textContent()).includes('confirmed'),'The correction failure explains the current state in English');await admin.evaluate(()=>toggleLanguage());assert.deepEqual(await admin.evaluate(()=>adminFilteredData.map(item=>item.id)),filteredBeforeLanguage);assert.deepEqual(await admin.evaluate(()=>({id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd})),caseFocus);
    admin.permitLeave=true;await admin.click('#case-review-next');assert.equal(await admin.evaluate(()=>selectedCaseId),expected[1]);admin.permitLeave=false;
    pass('Dirty review navigation cancellation and busy guards preserve admin inputs; failed writes remain unconfirmed and retain editable feedback across languages');

    await admin.evaluate(id=>openCaseDetail(id),expected[0]);await admin.evaluate(()=>caseDetailAction('accept'));await admin.click('#btn-case-submit');await admin.waitForFunction(()=>!isPreparingCorrection&&!activeUpdateIds.size);assert.equal(records.find(item=>item.id===expected[0]).status,'Accepted');
    await admin.click('#case-review-next');assert.equal(await admin.evaluate(()=>selectedCaseId),expected[1],'Successful case leaving the active filter continues at the next surviving queue neighbor');
    await admin.evaluate(()=>closeModal('modal-case-detail',true));await student.bringToFront();await student.evaluate(()=>openCaseDetail('correction-A'));
    assert.equal(await student.locator('#case-review-navigation').count(),0,'Student does not receive administrative queue controls');const studentCase=await student.evaluate(()=>selectedCaseId);await student.evaluate(()=>IPCOSReview.navigate(1));assert.equal(await student.evaluate(()=>selectedCaseId),studentCase);
    await student.evaluate(()=>caseDetailAction('reply'));const originalStudentSubmit=await student.locator('#btn-case-submit').elementHandle();
    await student.evaluate(()=>openCaseDetail('excluded-type'));assert.equal(await student.evaluate(()=>selectedCaseId),studentCase,'Student cannot open another student request');assert.equal(await student.evaluate(button=>button.isConnected&&document.getElementById('case-review-action-footer').contains(button)&&document.getElementById('btn-case-submit')===button,originalStudentSubmit),true,'Rejecting a foreign case preserves the original action node in its visible footer');await visibleAction(student,'#btn-case-submit','Original student action after a rejected foreign request');
    const state=student.locator('#case-detail-content .request-state');assert.equal(await state.count(),1);assert((await state.locator('.request-state-owner').textContent()).includes('Anda'));assert((await state.locator('.request-state-next').textContent()).trim());assert.equal(await state.locator('.request-state-details').count(),1);
    await student.evaluate(()=>toggleLanguage());assert((await student.locator('#case-detail-content .request-state-owner').textContent()).includes('You'));await student.evaluate(()=>toggleLanguage());
    pass('Completed cases retain safe queue continuity; students cannot navigate other students and receive one clear status/owner/next-step block');

    await admin.bringToFront();await admin.evaluate(()=>switchTab(null,'admin-data'));nextRead=true;await admin.evaluate(()=>syncDatabase());assert.equal(await admin.evaluate(()=>syncPhase),'error');assert((await admin.locator('#admin-data .operation-feedback[data-state="error"]').textContent()).includes('terakhir'));const cached=await admin.evaluate(()=>adminFilteredData.map(item=>item.id));assert(cached.length>0);
    await admin.waitForTimeout(4500);assert(await admin.locator('#admin-data .operation-feedback[data-state="error"]').isVisible(),'Inline failure remains after transient toast disappears');await admin.evaluate(()=>syncDatabase());assert.equal(await admin.evaluate(()=>syncPhase),'success');
    pass('Refresh failure keeps the current queue and presents a persistent error in the current page after the toast expires');

    for(const target of [admin,student]) {
        await target.bringToFront();await target.evaluate(()=>openCaseDetail(currentUser.role==='admin'?'queue-11':'correction-A'));await target.evaluate(()=>caseDetailAction(currentUser.role==='admin'?'revision':'reply'));
        for(const width of [320,390,768,1365]) {
            await target.setViewportSize({width,height:width===320?568:900});
            if(width===320){await frames(target);const frame=await target.locator('#modal-case-detail').evaluate(el=>{el.style.setProperty('--review-viewport-height','900px');const rect=el.querySelector('.case-detail-card').getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,height:rect.height,viewport:innerHeight,reviewHeight:getComputedStyle(el).getPropertyValue('--review-viewport-height').trim()};});assert.equal(frame.reviewHeight,'900px','The resize regression deliberately retains an outdated visual viewport measurement');assert(frame.top>=-1&&frame.bottom<=frame.viewport+1,'The request frame must remain within320x568 even while its last measured viewport is900px '+JSON.stringify(frame));}
            for(const position of [0,0.5,1]) {await target.locator('#case-detail-content').evaluate((el,position)=>el.scrollTop=(el.scrollHeight-el.clientHeight)*position,position);await frames(target);await visibleAction(target,'#btn-case-submit',(target===admin?'admin':'student')+' case action '+width+' at '+position);}
            await layout(target,(target===admin?'admin':'student')+' long case '+width);
        }
        await target.evaluate(()=>closeModal('modal-case-detail',true));
    }
    pass('Long admin review and student correction details keep the primary action accessible on mobile without hiding content');

    for(const target of [admin,student]) {
        await target.bringToFront();await target.setViewportSize({width:390,height:844});await target.evaluate(()=>{openCaseDetail(currentUser.role==='admin'?'queue-11':'correction-A');caseDetailAction(currentUser.role==='admin'?'revision':'reply');const field=document.getElementById(currentUser.role==='admin'?'case-revision-note':'case-reply-note');field.focus();window.__experienceVisualHeightDescriptor=Object.getOwnPropertyDescriptor(window.visualViewport,'height');Object.defineProperty(window.visualViewport,'height',{configurable:true,value:260});window.visualViewport.dispatchEvent(new Event('resize'));});
        await frames(target);await target.waitForFunction(()=>document.getElementById('modal-case-detail').classList.contains('case-keyboard-open') && parseFloat(getComputedStyle(document.getElementById('case-detail-content')).minHeight)>=100);assert(await target.locator('#modal-case-detail').evaluate(el=>el.classList.contains('case-keyboard-open')));
        const keyboard=await target.evaluate(()=>{const content=document.getElementById('case-detail-content'),identity=document.getElementById('case-review-identity'),action=document.getElementById('btn-case-submit');const identityBox=identity.getBoundingClientRect(),actionBox=action.getBoundingClientRect();return {contentHeight:content.clientHeight,contentBox:content.getBoundingClientRect().toJSON(),contentWidth:content.clientWidth,contentScrollWidth:content.scrollWidth,contentStyle:{minHeight:getComputedStyle(content).minHeight,overflowX:getComputedStyle(content).overflowX,overflowY:getComputedStyle(content).overflowY,padding:getComputedStyle(content).padding},viewport:{height:innerHeight,visualHeight:visualViewport.height},identityVisible:identityBox.top>=0&&identityBox.bottom<=visualViewport.height,actionVisible:actionBox.top>=0&&actionBox.bottom<=visualViewport.height,editable:document.activeElement.matches('textarea')&&!document.activeElement.disabled};});
        assert(keyboard.contentHeight>=100,'Software keyboard leaves at least100px of editable request content '+JSON.stringify(keyboard));assert.equal(keyboard.identityVisible,true,'Selected request identity remains visible with the software keyboard');assert.equal(keyboard.actionVisible,true,'Primary action remains within the reduced visual viewport');assert.equal(keyboard.editable,true);await visibleAction(target,'#btn-case-submit','Keyboard '+(target===admin?'admin':'student')+' action');
        await target.evaluate(()=>{if(window.__experienceVisualHeightDescriptor)Object.defineProperty(window.visualViewport,'height',window.__experienceVisualHeightDescriptor);else delete window.visualViewport.height;delete window.__experienceVisualHeightDescriptor;window.visualViewport.dispatchEvent(new Event('resize'));closeModal('modal-case-detail',true);});
    }
    pass('A reduced visual viewport keeps request identity, editable content and confirmation controls reachable when a mobile keyboard opens');

    await student.bringToFront();await openSop(student);const toc=student.locator('#sop_magang-view .sop-toc');assert.equal(await toc.locator('[data-sop-action="jump"]').count(),8);
    assert.equal(await student.locator('#sop_magang-view .sop-contents').evaluate(el=>el.open),false);await student.click('#sop_magang-view .sop-contents>summary');const beforeUrl=student.url();await toc.locator('[data-sop-action="jump"]').last().focus();await toc.locator('[data-sop-action="jump"]').last().press('Enter');await frames(student);
    assert.equal(student.url(),beforeUrl,'SOP jump does not create a fragment that corrupts browser reload/navigation');assert((await student.evaluate(()=>document.activeElement.textContent)).includes('Tahap 8'));
    await student.evaluate(()=>toggleLanguage());assert((await student.locator('#sop_magang-view .sop-toc').textContent()).includes('Step 8'));await student.evaluate(()=>toggleLanguage());
    pass('SOP table of contents navigates by keyboard, focuses the requested section and translates without changing the application URL');

    await admin.bringToFront();await admin.setViewportSize({width:1365,height:900});await editSop(admin);
    await section(admin,'section-0').locator('[data-section-field="body"]').fill('Draf asli tetap tersedia setelah bagian dilipat.');await section(admin,'section-0').locator('input.sop-add-files').setInputFiles({name:'retained.pdf',mimeType:'application/pdf',buffer:pdf('retained')});await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);
    const toggle=section(admin,'section-0').locator('[data-sop-action="toggle-section"]');assert.equal(await toggle.getAttribute('aria-expanded'),'true');const controls=await toggle.getAttribute('aria-controls');assert(controls);await toggle.press('Enter');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert(await section(admin,'section-0').locator('.sop-edit-section-content').isHidden());
    await admin.evaluate(()=>toggleLanguage());assert.equal(await section(admin,'section-0').locator('[data-sop-action="toggle-section"]').getAttribute('aria-expanded'),'false');await admin.evaluate(()=>toggleLanguage());
    await section(admin,'section-0').locator('[data-sop-action="toggle-section"]').click();assert.equal(await section(admin,'section-0').locator('[data-section-field="body"]').inputValue(),'Draf asli tetap tersedia setelah bagian dilipat.');assert((await section(admin,'section-0').textContent()).includes('retained.pdf'));
    await section(admin,'section-0').locator('[data-section-field="body"]').evaluate(el=>{el.focus();el.setSelectionRange(5,14,'forward');});
    const focusBefore=await admin.evaluate(()=>({id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,value:document.activeElement.value}));await admin.evaluate(()=>toggleLanguage());assert.deepEqual(await admin.evaluate(()=>({id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd,value:document.activeElement.value})),focusBefore);await admin.evaluate(()=>toggleLanguage());
    await admin.click('#sop-fold-sections');assert.equal(await admin.locator('#sop-editor-sections [data-sop-action="toggle-section"][aria-expanded="false"]').count(),8);await admin.click('#sop-fold-sections');assert.equal(await admin.locator('#sop-editor-sections [data-sop-action="toggle-section"][aria-expanded="true"]').count(),8);
    pass('SOP section disclosure is keyboard accessible and preserves drafts, attachments, collapse states and caret position during language changes');

    for(const width of [320,390,768,1365]) {
        await admin.setViewportSize({width,height:width===320?568:900});
        for(const position of [0,0.5,1]) {await admin.locator('.sop-editor-scroll').evaluate((el,position)=>el.scrollTop=(el.scrollHeight-el.clientHeight)*position,position);await frames(admin);await visibleAction(admin,'#sop-save','SOP save '+width+' at '+position);await visibleAction(admin,'#sop-preview','SOP preview '+width+' at '+position);}
        await layout(admin,'SOP editor '+width);
    }
    const scrollBefore=await admin.locator('.sop-editor-scroll').evaluate(el=>el.scrollTop);await admin.click('#sop-preview');assert(await admin.locator('#sop-preview-output').isVisible());await visibleAction(admin,'#sop-save','SOP preview save');await admin.click('#sop-preview');await frames(admin);assert(Math.abs((await admin.locator('.sop-editor-scroll').evaluate(el=>el.scrollTop))-scrollBefore)<3,'Returning from preview preserves editor position');
    await section(admin,'section-1').locator('[data-section-field="title"]').fill('');await section(admin,'section-1').locator('[data-sop-action="toggle-section"]').click();
    const savesBefore=calls.filter(call=>call.action==='save_sop').length;await admin.click('#sop-preview');await admin.click('#sop-save');assert.equal(calls.filter(call=>call.action==='save_sop').length,savesBefore,'Collapsed invalid section must not reach publication API');assert.equal(await section(admin,'section-1').locator('[data-sop-action="toggle-section"]').getAttribute('aria-expanded'),'true');assert.equal(await admin.evaluate(()=>document.activeElement.dataset.sectionField),'title');assert(await section(admin,'section-1').locator('[data-section-field="title"]').isVisible());
    await section(admin,'section-1').locator('[data-section-field="title"]').fill('Tahap kedua diperbaiki');
    await section(admin,'section-0').locator('[data-sop-action="toggle-section"]').click();assert.equal(await section(admin,'section-0').locator('[data-sop-action="toggle-section"]').getAttribute('aria-expanded'),'false');
    nextSopSave='failure';await admin.click('#sop-save');await admin.waitForFunction(()=>!document.getElementById('sop-save').disabled);assert(await admin.locator('#modal-sop-editor').isVisible());assert.equal(await section(admin,'section-0').locator('[data-section-field="body"]').inputValue(),'Draf asli tetap tersedia setelah bagian dilipat.');assert((await admin.locator('#sop-editor-status').textContent()).includes('Gangguan'));
    assert((await section(admin,'section-0').textContent()).includes('retained.pdf'));await admin.click('#sop-save');await admin.waitForSelector('#modal-sop-editor',{state:'hidden'});assert.equal(sopDocs.get('sop_magang').sections[0].body,'Draf asli tetap tersedia setelah bagian dilipat.');assert(sopDocs.get('sop_magang').sections[0].files.some(file=>file.fileName==='retained.pdf'));
    pass('SOP preview/save remain reachable at four widths; failed publication preserves text/files and retry only publishes after acknowledgement');

    await student.bringToFront();await student.setViewportSize({width:390,height:844});await student.evaluate(()=>switchTab(null,'pendaftaran'));await student.selectOption('#reg-jenis-utama','Outline');await student.fill('#reg-judul','Judul pengajuan pengujian dengan tema komunikasi');
    await student.setInputFiles('#file-transkrip',{name:'transcript.pdf',mimeType:'application/pdf',buffer:pdf('transcript')});await student.setInputFiles('#file-proposal',{name:'proposal.pdf',mimeType:'application/pdf',buffer:pdf('proposal')});await student.click('#btn-review-registration');assert(await student.locator('#registration-review').isVisible());
    nextCreate='failure';const createGate=gate();heldCreate=createGate;await student.click('#btn-submit-registration');await createGate.entered;assert.equal(await student.locator('#form-submit-status-steps').getAttribute('data-stage'),'sending');assert(await student.locator('#btn-submit-registration').isDisabled());assert.equal(await student.locator('#modal-submission-receipt').isVisible(),false);
    createGate.release();await createGate.done;await student.waitForFunction(()=>!isSubmittingRegistration);assert.equal(await student.locator('#form-submit-status-steps').getAttribute('data-stage'),'uncertain');assert.equal(await student.inputValue('#reg-judul'),'Judul pengajuan pengujian dengan tema komunikasi');assert.equal(await student.locator('#file-transkrip').evaluate(el=>el.files[0].name),'transcript.pdf');
    await student.evaluate(()=>toggleLanguage());assert.equal(await student.inputValue('#reg-judul'),'Judul pengajuan pengujian dengan tema komunikasi');assert((await student.locator('#form-submit-status-steps').textContent()).includes('confirmation'));assert((await student.locator('#form-submit-status').textContent()).includes('could not be confirmed'),'The submission uncertainty explanation translates to English');await student.evaluate(()=>toggleLanguage());
    await student.click('#btn-submit-registration');await student.waitForSelector('#modal-submission-receipt',{state:'visible'});assert.equal(await student.locator('#form-submit-status-steps').getAttribute('data-stage'),'confirmed');await student.evaluate(()=>closeModal('modal-submission-receipt',true));
    pass('Student submission reports actual pending/failure/confirmation states, keeps its text/files after failed delivery and issues a receipt only on server success');

    for(const target of [student,admin]) {
        await target.bringToFront();
        const tabs=target===student?['dashboard','student-status','academic-journey','sop-magang','pendaftaran']:['dashboard','admin-data','admin-dosen','admin-master','sop-magang'];
        for(const width of [320,390,768,1365]) for(const lang of ['id','en']) for(const dark of [false,true]) {
            await target.setViewportSize({width,height:width===320?568:900});
            await target.evaluate(({lang,dark})=>{registrationDirty=false;if(currentLang!==lang)toggleLanguage();document.body.classList.toggle('dark-mode',dark);},{lang,dark});
            for(const tab of tabs){await target.evaluate(tab=>switchTab(null,tab),tab);await frames(target);await layout(target,(target===student?'student':'admin')+' '+tab+' '+width+' '+lang+' '+dark);}
            if(target===student&&width<768){await target.evaluate(()=>switchTab(null,'dashboard'));for(const button of await target.locator('#student-bottom-nav button').all())assert((await button.boundingBox()).height>=44,'Mobile navigation must keep comfortable touch targets');}
        }
        await target.evaluate(()=>{registrationDirty=false;switchTab(null,'dashboard');});
        for(const setting of ['no-preference','reduce']) {
            await target.emulateMedia({reducedMotion:setting});
            const motion=await target.locator('.tab-content.active').evaluate(el=>{const style=getComputedStyle(el);return {animation:style.animationDuration.split(',').map(value=>parseFloat(value)),transition:style.transitionDuration.split(',').map(value=>parseFloat(value))};});
            assert(motion.animation.every(duration=>duration<=(setting==='reduce'?0.01:0.25)),'View animation respects '+setting);assert(motion.transition.every(duration=>duration<=(setting==='reduce'?0.01:0.25)),'View transition respects '+setting);
            if(setting==='reduce'){await target.evaluate(()=>triggerConfetti());assert.equal(await target.locator('#confetti-canvas').isVisible(),false,'Reduced motion suppresses celebration animation');assert.equal(await target.evaluate(()=>confettiAnimationId),null,'Reduced motion leaves no pending celebration frame');}
        }
        await target.emulateMedia({reducedMotion:'reduce'});
    }
    pass('Role layouts fit 320/390/mobile/tablet/desktop, both languages and themes; navigation touch targets and reduced-motion preferences remain accessible');
    fs.mkdirSync('../qa-experience',{recursive:true});await admin.bringToFront();await admin.setViewportSize({width:1365,height:900});await admin.evaluate(()=>switchTab(null,'admin-data'));await admin.evaluate(()=>openCaseDetail('queue-10'));await admin.screenshot({path:'../qa-experience/admin-review-desktop.png'});await admin.evaluate(()=>closeModal('modal-case-detail',true));
    await student.bringToFront();await student.setViewportSize({width:390,height:844});await openSop(student);await frames(student);await student.evaluate(()=>{if(currentLang!=='en')toggleLanguage();scrollTo({top:0,behavior:'instant'});});await frames(student);await student.screenshot({path:'../qa-experience/student-sop-mobile.png'});
    const namesBeforeLogout=new Map();for(const target of [admin,student])namesBeforeLogout.set(target,await target.evaluate(()=>String(currentUser.nama||'')));
    admin.permitLeave=true;student.permitLeave=true;await admin.evaluate(()=>logoutUser());await admin.waitForSelector('#welcome-modal',{state:'visible'});assert.equal(await admin.locator('#case-detail-content').textContent(),'');await student.evaluate(()=>logoutUser());await student.waitForSelector('#welcome-modal',{state:'visible'});
    for(const target of [admin,student]){assert(await target.locator('#workspace-profile').isHidden());for(const id of ['profile-summary-name','profile-initials','display-greeting','header-subtext'])assert.equal(await target.locator('#'+id).textContent(),'','Logout clears profile text '+id);const name=namesBeforeLogout.get(target);if(name)assert(!(await target.locator('#workspace-profile > summary').getAttribute('aria-label')).includes(name),'Logout clears private identity from the accessible profile label');}
    assert.deepEqual(errors,[]);pass('Both roles complete the new experience flows and logout without JavaScript errors or restored private views');
    fs.writeFileSync('test-results/experience-results.json',JSON.stringify({checks,errors,apiRequests:calls.length,transactionRequests:calls.filter(call=>['create','update','save_sop'].includes(call.action)).length},null,2));await browser.close();
})().catch(reportFailure);
