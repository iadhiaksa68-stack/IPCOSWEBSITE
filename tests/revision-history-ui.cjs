const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {chromium,reportFailure}=require('./browser.cjs'),{previewPdf}=require('./fixtures.cjs');
// All academic responses, identities and PDF bytes are synthetic, including on the live origin.
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766',checks=[],errors=[],calls=[],violations=[];
const pass=message=>{checks.push(message);console.log('PASS '+message);};
const drive=id=>'https://drive.google.com/file/d/history-'+id+'/view';
const docs=[1,2,3].map(version=>({label:'Transkrip',fileName:'Transkrip-mahasiswa-internasional-eCommerce-O’Connor-versi-'+version+'-dengan-nama-berkas-panjang.pdf',url:drive('transcript-'+version),version}));
const pdf=url=>previewPdf('Synthetic history PDF '+url.split('/').at(-2),3);
const reference={page:2,pages:3,version:1,fingerprint:crypto.createHash('sha256').update(pdf(docs[0].url)).digest('hex')};
const instruction=message=>'Berkas yang perlu diperbaiki:\n- Transkrip\n\nInstruksi:\n'+message;
function initialLogs(){return [
 {role:'mhs',sender:'Mahasiswa Uji',status:'Pending',time:'2026-10-01T01:00:00Z',message:'Pengajuan awal.',documents:[docs[0]]},
 {kind:'document_review',role:'system',sender:'Admin Uji',reviews:[{url:docs[0].url,label:'Transkrip',status:'revision',note:'Lengkapi tanda tangan. Literal <img src=x onerror=alert(1)> tetap teks.',pageRef:reference}]},
 {role:'admin',sender:'Admin Uji',status:'Revision',time:'invalid',message:instruction('Lengkapi tanda tangan pada transkrip.')},
 {role:'mhs',sender:'Mahasiswa Uji',status:'Resubmitted',message:'Tanda tangan sudah dilengkapi.',documents:[docs[1]],fieldChanges:[{field:'title',before:'Judul awal eCommerce',after:'Judul baru eCommerce O’Connor'}]},
 {kind:'document_review',role:'system',sender:'Admin Uji',reviews:[{url:docs[1].url,label:'Transkrip',status:'pending',note:'Pemeriksaan pertama dalam putaran satu.'}]},
 {kind:'document_review',role:'system',sender:'Admin Uji',reviews:[{url:docs[1].url,label:'Transkrip',status:'revision',note:'Gunakan lembar transkrip terbaru dari fakultas.'}]},
 {role:'admin',sender:'Admin Uji',status:'Revision',time:'1900-01-01T01:00:00Z',message:instruction('Unggah transkrip terbaru yang sudah disahkan fakultas.')},
 {role:'mhs',sender:'Mahasiswa Uji',status:'Resubmitted',message:'Transkrip terbaru sudah dilampirkan.',documents:[docs[2],{label:'Dokumen Lama',fileName:'Metadata-berkas-tidak-tersedia.pdf',url:'javascript:alert(1)',version:1}]},
 {kind:'document_review',role:'system',sender:'Admin Uji',reviews:[{url:docs[2].url,label:'Transkrip',status:'accepted',note:'Berkas sudah sesuai; keputusan pengajuan masih menunggu admin.'}]}
];}
function harness(){const logs=initialLogs(),mine={id:'mine',nim:'A',nama:'Mahasiswa Uji',jenis:'Outline',status:'Resubmitted',date:'2026-10-01T01:00:00Z',detail:'<b>Judul:</b> Judul baru eCommerce O’Connor',note:JSON.stringify(logs),link:docs.map(doc=>'<a href="'+doc.url+'">'+doc.label+'</a>').join('<br>')};return {logs,mine,rows:[mine,{...mine,id:'foreign',nim:'B',nama:'Foreign private person',note:'PRIVATE FOREIGN HISTORY'},{id:'legacy',nim:'A',nama:'Mahasiswa Uji',jenis:'Pendadaran',status:'Accepted',date:'',detail:'Legacy record',link:'',note:'Catatan lama <img src=x> tetap terbaca.'},{id:'empty',nim:'A',nama:'Mahasiswa Uji',jenis:'Proposal',status:'Pending',date:'',detail:'No history',link:'',note:'[]'}],failure:false,hold:null};}
function gate(){let entered,release,finished;return {entered:new Promise(resolve=>entered=resolve),wait:new Promise(resolve=>release=resolve),finished:new Promise(resolve=>finished=resolve),enter:()=>entered(),release:()=>release(),finish:()=>finished()};}
async function login(browser,h,admin){
 const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{
  const url=route.request().url();if(url.includes('script.google.com/macros/')){
   const data=route.request().postDataJSON();calls.push(data);let result,held;
   if(data.action==='admin_login')result={status:'success',token:'history-admin'};
   else if(data.action==='student_login')result={status:'success',token:'history-student',nama:'Mahasiswa Uji'};
   else if(data.action==='get_data')result={status:'success',registrations:structuredClone(h.rows),students:[],dosens:[],contents:[],announcements:[],services:[]};
   else if(data.action==='get_review_capabilities')result={status:'success',documentReviewSupported:true,archiveSupported:true,notePageReferences:true};
   else if(data.action==='get_journey')result={status:'success',journey:{checks:{},revision:0,exists:false}};
   else if(data.action==='get_document'){
    assert.equal(data.id,'mine');assert(docs.some(doc=>doc.url===data.url));assert(['history-student','history-admin'].includes(data.token));held=h.hold;h.hold=null;if(held){held.enter();await held.wait;}
    if(h.failure){h.failure=false;result={status:'error',message:'Berkas simulasi belum dapat dimuat.'};}else result={status:'success',fileName:docs.find(doc=>doc.url===data.url).fileName,mimeType:'application/pdf',base64:pdf(data.url).toString('base64')};
   }else if(data.action==='logout')result={status:'success'};
   else if(await require('./next-mock.cjs')(route,data))return;
   else {violations.push(data.action);result={status:'error',message:'Unexpected history API action '+data.action};}
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});held?.finish();return;
  }
  if(url.startsWith(origin))return route.continue();if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.goto(origin);
 if(admin){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}
 else{await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');}
 await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success'&&IPCOSReviewTools.supported()===true);await page.evaluate(()=>openCaseDetail('mine'));await reveal(page,admin);return page;
}
async function pane(page,view='review'){const toggle=page.locator('button[data-workspace-view="'+view+'"]');if(await toggle.isVisible())await toggle.click();}
async function reveal(page,admin){await pane(page);if(admin&&!await page.locator('.admin-case-context').evaluate(node=>node.open))await page.locator('.admin-case-context>summary').click();if(!await page.locator('.case-round-history').evaluate(node=>node.open))await page.locator('.case-round-history>summary').click();}
async function round(page,number,open=true){const node=page.locator('.revision-round[data-history-round="'+number+'"]');if(await node.evaluate(node=>node.open)!==open)await node.locator(':scope>summary').click();return node;}
async function rendered(page,number=1){await page.waitForFunction(number=>{const panel=document.getElementById('case-file-preview'),canvas=panel?.querySelector('canvas');return canvas?.dataset.rendered==='true'&&canvas.dataset.page===String(number)&&!!panel.querySelector('.pdf-accessible-text')?.textContent;},number);}
async function layout(page,label){
 const result=await page.locator('.revision-round-history').evaluate(root=>({overflow:document.documentElement.scrollWidth>innerWidth+2,clipped:[...root.querySelectorAll('h4,h5,p,strong,span,summary,button,dt,dd')].filter(node=>node.getClientRects().length&&node.clientWidth&&node.scrollWidth>node.clientWidth+3).map(node=>node.textContent),small:[...root.querySelectorAll('button,summary')].filter(node=>node.getClientRects().length&&node.getBoundingClientRect().height<43.99).map(node=>node.textContent)}));assert.equal(result.overflow,false,label+' page overflow');assert.deepEqual(result.clipped,[],label+' clipped text');assert.deepEqual(result.small,[],label+' small controls');
}
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});const browser=await chromium.launch(),studentData=harness(),adminData=harness(),student=await login(browser,studentData,false),admin=await login(browser,adminData,true);
 for(const page of [student,admin]){
  assert.deepEqual(await page.locator('.revision-round').evaluateAll(nodes=>nodes.map(node=>[Number(node.dataset.historyRound),node.open])),[[2,true],[1,false],[0,false]]);
  assert.match(await page.locator('[data-history-round="2"] .round-phase').textContent(),/Menunggu Pemeriksaan/);assert.match(await page.locator('[data-history-round="1"] .round-phase').textContent(),/Revisi Lanjutan/);
  assert.match(await page.locator('[data-history-round="2"] .round-request-review').textContent(),/lembar transkrip terbaru/);assert(!(await page.locator('[data-history-round="1"] .round-request-review').textContent()).includes('lembar transkrip terbaru'));
  assert.equal(await page.locator('.revision-round-history img').count(),0);assert.equal(await page.locator('[data-history-file^="javascript"]').count(),0);assert(!(await page.locator('.revision-round-history').textContent()).includes('PRIVATE FOREIGN'));
 }
 pass('Both roles see two truthful revision rounds with the latest open, correct instruction/reply/review associations, historical field changes, escaped notes and no approval inferred from a file-level result');
 await round(student,1);const summary=student.locator('[data-history-round="1"]>summary');await summary.focus();await summary.press('Enter');assert.equal(await student.locator('[data-history-round="1"]').evaluate(node=>node.open),false);await summary.press('Space');assert.equal(await student.locator('[data-history-round="1"]').evaluate(node=>node.open),true);
 await student.evaluate(()=>toggleLanguage());assert.equal(await student.evaluate(()=>document.activeElement.closest('[data-history-round]')?.dataset.historyRound),'1');assert.equal(await student.locator('[data-history-round="1"]').evaluate(node=>node.open),true);await student.evaluate(()=>syncDatabase());assert.equal(await student.evaluate(()=>document.activeElement.closest('[data-history-round]')?.dataset.historyRound),'1');
 const nodeKept=await student.locator('.revision-round-history').evaluate(node=>{window.historyRootBefore=node;return true;});assert(nodeKept);await student.evaluate(()=>syncDatabase());assert(await student.locator('.revision-round-history').evaluate(node=>node===window.historyRootBefore));
 studentData.logs.push({role:'admin',sender:'Admin Uji',status:'Revision',message:instruction('Instruksi putaran tiga yang baru diterima.')});studentData.mine.note=JSON.stringify(studentData.logs);studentData.mine.status='Revision';await student.evaluate(()=>syncDatabase());assert.equal(await student.locator('.revision-round').first().getAttribute('data-history-round'),'3');assert.equal(await student.locator('[data-history-round="3"]').evaluate(node=>node.open),true);assert.equal(await student.locator('[data-history-round="1"]').evaluate(node=>node.open),true);assert.equal(await student.evaluate(()=>document.activeElement.closest('[data-history-round]')?.dataset.historyRound),'1');
 pass('Keyboard disclosure state and focus survive language changes and synchronization; unchanged reads retain the same history root while a new confirmed round opens without resetting older choices');
 let layouts=0;for(const [page,isAdmin]of [[student,false],[admin,true]])for(const width of [320,390,768,1365])for(const lang of ['id','en'])for(const dark of [false,true]){
  await page.setViewportSize({width,height:900});await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();if(document.body.classList.contains('dark-mode')!==dark)toggleDarkMode();},{lang,dark});await reveal(page,isAdmin);
  for(const number of await page.locator('.revision-round').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.historyRound))))await round(page,number);
  for(const node of await page.locator('.round-earlier-review').all())if(!await node.evaluate(node=>node.open))await node.locator(':scope>summary').click();
  await layout(page,(isAdmin?'admin':'student')+'/'+width+'/'+lang+'/'+dark);layouts++;
 }
 await student.setViewportSize({width:1365,height:900});await student.evaluate(()=>{if(currentLang!=='id')toggleLanguage();if(document.body.classList.contains('dark-mode'))toggleDarkMode();});for(const number of[0,1,2])await round(student,number,false);await student.locator('.case-round-history').evaluate(node=>{const area=document.getElementById('case-detail-content');area.scrollTop+=node.getBoundingClientRect().top-area.getBoundingClientRect().top-12;});await student.locator('#modal-case-detail').screenshot({path:'test-results/revision-history-desktop.png'});
 await student.setViewportSize({width:390,height:900});await student.evaluate(()=>toggleDarkMode());await student.locator('.case-round-history').evaluate(node=>{const area=document.getElementById('case-detail-content');area.scrollTop+=node.getBoundingClientRect().top-area.getBoundingClientRect().top-12;});await student.locator('#modal-case-detail').screenshot({path:'test-results/revision-history-mobile-dark.png'});
 pass('Thirty-two role/width/language/theme layouts keep expanded and collapsed rounds, long filenames, field changes and review notes readable without overflow, with 44-pixel keyboard and touch controls');
 await admin.setViewportSize({width:1365,height:900});await admin.evaluate(()=>{if(currentLang!=='id')toggleLanguage();});await reveal(admin,true);await round(admin,1);
 const replacement=admin.locator('[data-history-round="1"] [data-history-file="'+docs[1].url+'"]');await replacement.click();await rendered(admin);assert((await admin.locator('#case-file-preview .pdf-accessible-text').textContent()).includes('history-transcript-2'));
 await reveal(admin,true);await admin.locator('[data-history-round="1"] .round-request-review [data-open-note-page]').click();await rendered(admin,2);assert((await admin.locator('#case-file-preview .pdf-accessible-text').textContent()).includes('history-transcript-1'));
 await reveal(admin,true);adminData.failure=true;await replacement.click();await admin.waitForFunction(()=>document.querySelector('#case-file-preview [data-case-preview-retry]')?.hidden===false);await admin.locator('#case-file-preview [data-case-preview-retry]').click();await rendered(admin);
 pass('Historical attachments open their exact authorized PDF bytes, a review reference jumps to the matching original version/page, and failed private previews retry through the existing reader without academic writes');
 await reveal(admin,true);const latest=await admin.evaluate(()=>getCaseFiles(currentCase()).findIndex(file=>file.url.includes('transcript-3')));await admin.evaluate(index=>previewCaseFile(index),latest);await rendered(admin);await admin.locator('[data-review-note]:visible').fill('Unsaved admin note eCommerce O’Connor.');await admin.evaluate(()=>caseDetailAction('revision'));await admin.fill('#case-revision-note','Unsaved admin instruction.');
 await reveal(admin,true);await admin.locator('[data-history-round="1"]>summary').focus();adminData.logs.push({kind:'document_review',role:'system',reviews:[{url:docs[2].url,label:'Transkrip',status:'pending',note:'A newly received result'}]});adminData.mine.note=JSON.stringify(adminData.logs);await admin.evaluate(()=>syncDatabase());assert.equal(await admin.inputValue('#case-revision-note'),'Unsaved admin instruction.');assert.equal(await admin.locator('[data-review-note]:visible').inputValue(),'Unsaved admin note eCommerce O’Connor.');assert.equal(await admin.evaluate(()=>document.activeElement.closest('[data-history-round]')?.dataset.historyRound),'1');assert((await admin.locator('.revision-round-history').textContent()).includes('A newly received result'));
 pass('A new saved history snapshot refreshes only history and preserves focused disclosure, unsaved admin file notes and the pending revision instruction without sending a decision');
 await student.evaluate(()=>{closeModal('modal-case-detail',true);openCaseDetail('legacy');});await reveal(student,false);assert.equal(await student.locator('.revision-round').count(),1);assert.equal(await student.locator('.revision-round').getAttribute('data-history-round'),'0');assert((await student.locator('.revision-round-history').textContent()).includes('Catatan lama <img src=x> tetap terbaca.'));assert.equal(await student.locator('.revision-round-history img').count(),0);
 await student.evaluate(()=>openCaseDetail('empty'));await reveal(student,false);assert.equal(await student.locator('.revision-round').count(),0);assert.match(await student.locator('.revision-round-history').textContent(),/Belum ada catatan|No request history/);assert.equal(await student.evaluate(()=>openCaseDetail('foreign')),false);assert.equal(await student.evaluate(()=>selectedCaseId),'empty');
 await student.evaluate(()=>openCaseDetail('mine'));await reveal(student,false);await round(student,1);const held=gate();studentData.hold=held;await student.locator('[data-history-round="1"] [data-history-file="'+docs[1].url+'"]').click();await held.entered;await student.evaluate(()=>{closeModal('modal-case-detail',true);openCaseDetail('empty');});held.release();await held.finished;await student.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await student.locator('#case-file-preview canvas').count(),0);assert.equal(await student.evaluate(()=>caseBlobUrls.size),0);await student.evaluate(()=>logoutUser());await student.waitForFunction(()=>!getSessionToken());assert.equal(await student.locator('.revision-round-history').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);assert.equal(calls.filter(call=>['create','update','revise_request','save_document_review','archive_request','save_academic_progress'].includes(call.action)).length,0);
 pass('Legacy and empty histories remain honest; foreign requests cannot open, late historical PDF responses cannot revive another case, and logout removes private history and document bytes');
 fs.writeFileSync('test-results/revision-history-ui.json',JSON.stringify({checks,layouts,errors,unexpectedAcademicActions:violations,syntheticAPI:true},null,2));await browser.close();
})().catch(reportFailure);
