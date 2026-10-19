const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,reportFailure}=require('./browser.cjs'),{previewPdf}=require('./fixtures.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766',errors=[],calls=[],checks=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const transcript='https://example.com/transcript.pdf',proposal='https://example.com/proposal.pdf';
const note=JSON.stringify([{kind:'document_review',role:'system',reviews:[{url:transcript,status:'revision',note:'Lengkapi tanda tangan pada halaman terakhir. <img src=x onerror=alert(1)>'},{url:proposal,status:'revision',note:'Sesuaikan judul eCommerce O’Connor dengan formulir.'}]},{role:'admin',message:'Berkas yang perlu diperbaiki:\n- Transkrip\n- Draft Proposal\n- Isian pengajuan\n\nInstruksi:\nPeriksa tanda tangan, judul proposal, dan judul pada formulir.'}]);
const record={id:'mine',nim:'A',nama:'Mahasiswa Uji',jenis:'Outline',status:'Revision',date:new Date().toISOString(),detail:'<b>Judul:</b> Judul awal eCommerce',note,link:'<a href="'+transcript+'">Transkrip</a><a href="'+proposal+'">Draft Proposal</a>'};
let fail=true;
(async()=>{
 const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{
  const url=route.request().url();if(url.includes('script.google.com/macros/')){
   const data=route.request().postDataJSON();calls.push(data);let result;
   if(data.action==='student_login')result={status:'success',token:'student-A',nama:'Mahasiswa Pengujian'};
   else if(data.action==='get_data')result={status:'success',registrations:[record,{...record,id:'foreign',nim:'B'}],students:[],dosens:[],contents:[],announcements:[],services:[]};
   else if(data.action==='get_revision_form')result={status:'success',fields:{title:'Judul awal eCommerce'},version:'a'.repeat(64)};
   else if(data.action==='revise_request'){
    assert.equal(data.id,'mine');assert.deepEqual(data.files.map(file=>file.label),['Transkrip','Draft Proposal']);assert.equal(data.fields.title,'Judul baru eCommerce O’Connor');
    if(fail)result={status:'error',message:'Gangguan simpan data uji'};
    else {record.status='Resubmitted';record.detail='<b>Judul:</b> '+data.fields.title;result={status:'success',detail:record.detail,note:record.note,recordStatus:record.status};}
   }else if(data.action==='logout')result={status:'success'};
   else if(await require('./next-mock.cjs')(route,data))return;
   else throw Error('Unexpected corrections API '+data.action);
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  }
  if(url.startsWith(origin))return route.continue();if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 await page.goto(origin);await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');await page.waitForFunction(()=>syncPhase==='success');
 await page.evaluate(()=>openCaseDetail('mine'));assert.equal(await page.locator('.correction-instruction').count(),3);
 assert.match(await page.locator('.correction-instruction').first().textContent(),/tanda tangan/);assert.equal(await page.locator('.correction-instructions img').count(),0);
 await page.locator('.correction-instruction [data-correction-target="Isian pengajuan"]').click();await page.waitForSelector('#correction-title');await page.fill('#correction-title','Judul baru eCommerce O’Connor');
 assert.equal(await page.evaluate(()=>selectedCaseId),'mine');pass('Instruction cards connect literal admin notes to the requested documents and open the same owned correction editor');
 const a={name:'transkrip-eCommerce.pdf',mimeType:'application/pdf',buffer:previewPdf('Signed transcript')},b={name:'proposal-OConnor.pdf',mimeType:'application/pdf',buffer:previewPdf('Corrected proposal')};
 await page.setInputFiles('#case-reply-files',[a,b]);await page.selectOption('#revision-label-0','Transkrip');await page.selectOption('#revision-label-1','Draft Proposal');
 await page.locator('#case-reply-files-selection [data-upload-action=remove]').first().click();assert.equal(await page.inputValue('#revision-label-0'),'Draft Proposal');
 await page.evaluate(()=>{window.keptCorrectionFile=document.getElementById('case-reply-files').files[0];});
 await page.evaluate(()=>renderRevisionAssociations());assert.equal(await page.inputValue('#revision-label-0'),'Draft Proposal');
 await page.evaluate(()=>toggleLanguage());assert.equal(await page.inputValue('#revision-label-0'),'Draft Proposal');assert(await page.evaluate(()=>document.getElementById('case-reply-files').files[0]===window.keptCorrectionFile));assert.equal(await page.locator('#revision-associations [data-revision-filename]').textContent(),'proposal-OConnor.pdf');
 await page.setInputFiles('#case-reply-files',[a,b]);await page.selectOption('#revision-label-0','Transkrip');await page.selectOption('#revision-label-1','Draft Proposal');
 for(const box of await page.locator('[name=correction-complete]').all())await box.check();await page.fill('#case-reply-note','Tanda tangan dan judul eCommerce O’Connor sudah diperbaiki.');
 pass('Removing one attachment, refreshing associations, and switching language preserve the other exact file and its document label');
 const writes=()=>calls.filter(call=>call.action==='revise_request'||call.action==='update');
 await page.evaluate(()=>{const file=document.getElementById('case-reply-files').files[0],read=file.arrayBuffer.bind(file);documentInspections=new WeakMap();file.arrayBuffer=async()=>{await new Promise(resolve=>window.releaseCorrectionInspection=resolve);file.arrayBuffer=read;return read();};});
 await page.click('#btn-case-submit');await page.waitForFunction(()=>isPreparingCorrection&&typeof window.releaseCorrectionInspection==='function');assert(await page.locator('#case-reply-note').isDisabled());assert(await page.locator('#revision-label-0').isDisabled());assert(await page.locator('#correction-title').isDisabled());await page.evaluate(()=>window.releaseCorrectionInspection());
 await page.waitForSelector('#correction-summary');await page.waitForFunction(()=>!isPreparingCorrection);assert.equal(writes().length,0);
 assert.match(await page.locator('#correction-summary').textContent(),/Judul awal eCommerce/);assert.match(await page.locator('#correction-summary').textContent(),/Judul baru eCommerce O’Connor/);
 for(const width of [320,390,768,1365])for(const lang of ['id','en'])for(const dark of [false,true]){
  await page.setViewportSize({width,height:900});await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();if(document.body.classList.contains('dark-mode')!==dark)toggleDarkMode();},{lang,dark});
  const layout=await page.locator('#modal-case-detail').evaluate(root=>({overflow:document.documentElement.scrollWidth>innerWidth+2,clipped:[...root.querySelectorAll('.correction-instruction h4,.correction-task button,.correction-summary h3,.correction-summary p,.correction-summary span')].filter(node=>node.getClientRects().length&&node.clientWidth&&node.scrollWidth>node.clientWidth+3).map(node=>node.textContent)}));assert.equal(layout.overflow,false);assert.deepEqual(layout.clipped,[]);
  assert.equal(await page.inputValue('#revision-label-0'),'Transkrip');assert.match(await page.locator('#correction-summary').textContent(),/Judul baru eCommerce O’Connor/);
 }
 await page.setViewportSize({width:1365,height:900});await page.evaluate(()=>{if(currentLang!=='id')toggleLanguage();if(document.body.classList.contains('dark-mode'))toggleDarkMode();});await page.locator('#correction-summary').evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:'test-results/corrections-summary-desktop-data-uji.png'});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>toggleDarkMode());await page.locator('#correction-summary').evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:'test-results/corrections-summary-mobile-data-uji.png'});
 pass('Review displays exact before/after fields, file associations, and notes without a write, across 16 width/language/theme layouts');
 await page.locator('[data-correction-edit]').click();await page.fill('#case-reply-note','Penjelasan diperbarui eCommerce O’Connor.');assert.equal(await page.locator('#correction-summary').count(),0);await page.click('#btn-case-submit');await page.waitForSelector('#correction-summary');await page.waitForFunction(()=>!isPreparingCorrection);assert.equal(writes().length,0);
 record.note=JSON.stringify([...JSON.parse(note),{role:'admin',message:'Instruksi admin yang baru.'}]);await page.evaluate(()=>syncDatabase());await page.click('#btn-case-submit');await page.waitForFunction(()=>!isPreparingCorrection);assert.equal(writes().length,0);assert.match(await page.locator('#case-action-feedback').textContent(),/berubah/);assert.equal(await page.inputValue('#correction-title'),'Judul baru eCommerce O’Connor');record.note=note;await page.evaluate(()=>syncDatabase());
 await page.click('#btn-case-submit');await page.waitForFunction(()=>!isPreparingCorrection&&!activeUpdateIds.size);assert.equal(writes().length,1);assert.equal(await page.inputValue('#revision-label-0'),'Transkrip');assert.equal(await page.inputValue('#revision-label-1'),'Draft Proposal');assert.equal(await page.evaluate(()=>document.getElementById('case-reply-files').files.length),2);
 pass('Edits invalidate the preview; a failed confirmed send preserves fields, files, associations, and the correction summary for retry');
 fail=false;await page.locator('#btn-case-submit').evaluate(button=>{button.click();button.click();});await page.waitForFunction(()=>!isPreparingCorrection&&!activeUpdateIds.size);assert.equal(record.status,'Resubmitted');assert.equal(writes().length,2);assert.equal(await page.locator('.correction-instructions [data-correction-target]').count(),0);
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/corrections-ui-results.json',JSON.stringify({checks,layoutModes:16,errors,syntheticAPI:true},null,2));pass('Only explicit confirmation writes; repeated confirmation sends once and completed corrections remove editing shortcuts');await browser.close();
})().catch(reportFailure);
