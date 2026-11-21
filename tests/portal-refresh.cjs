// Student and admin experience PRD (21 Nov 2026): reader space, upload working list, sign-in, history,
// admin counts, search aliases and announcement subjects.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,reportFailure}=require('./browser.cjs');
const nextMock=require('./next-mock.cjs');
const {previewPdf,pdf}=require('./fixtures.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
const checks=[],errors=[],calls=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
const day=n=>new Date(Date.now()-n*86400000).toISOString();
const hash=value=>{let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
const UPLOAD='Unggah berkas Pendadaran satu per satu. PDF, JPG, atau PNG dengan total maksimal 20 MB.';
const announcements=[{date:day(1),message:UPLOAD,type:'info'}];
const noticeMeta={schema:1,notices:{[hash('notice:'+UPLOAD)]:{subject:'Unggah berkas Pendadaran satu per satu',service:'Pendadaran',expires:'2099-12-31'}}};
const rec=(id,nim,nama,jenis,status,d,labels,versions=[])=>{const docs=labels.map((label,i)=>({url:`https://drive.google.com/file/d/${id}${i}/view`,label,fileName:`${id.toLowerCase()}-${i}.pdf`,version:1}));const older=versions.map((label,i)=>({url:`https://drive.google.com/file/d/${id}old${i}/view`,label,fileName:`${id.toLowerCase()}-old-${i}.pdf`,version:1}));const newer=older.map((doc,i)=>({...docs[i],version:2}));
 return {id,date:day(d),nim,nama,jenis,detail:'<b>Judul:</b> Analisis Diplomasi Digital',link:[...docs,...older].map(doc=>`<a href="${doc.url}">${doc.label}</a>`).join('<br>'),status,note:JSON.stringify([{role:'mhs',sender:nama,time:day(d+1),message:'Pendaftaran',status:'Pending',documents:older.length?older:docs},...(older.length?[{role:'mhs',sender:nama,time:day(d),message:'Perbaikan',status:'Resubmitted',documents:newer.concat(docs.slice(older.length))}]:[])])};};
const records=[rec('R1','A','Mahasiswa Uji','Outline','Accepted',3,['Transkrip','Draft Proposal'],['Transkrip','Draft Proposal']),rec('R0','A','Mahasiswa Uji','Skripsi Jurnal','Accepted',30,['LoA Jurnal']),
 rec('Q2','2022012','Budi Santoso','Proposal','Pending',2,['Form ACC Seminar Proposal dengan nama berkas yang sangat panjang sekali untuk uji tata letak'])];
const dosens=[['Dr. Alpha',2,10],['Dr. Beta',4,5],['Dr. Gamma',5,5],['Dr. Delta',7,6],['Dr. Epsilon',8,10],['Dr. Zeta',0,0],['Dr. Eta',1,2]].map(([Nama,Terpakai,Maksimal])=>({Nama,Terpakai,Maksimal}));
const services=['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'].map(type=>({type,enabled:true,open:'',close:'',adminDays:3,studentDays:7}));
async function context(browser,viewport){
 const ctx=await browser.newContext({viewport,reducedMotion:'reduce'});
 await ctx.route('**/*',async route=>{const url=route.request().url();
  if(url.includes('script.google.com/macros/')){const data=route.request().postDataJSON();calls.push(data);let result;
   if(data.action==='admin_login')result={status:'success',token:'admin'};
   else if(data.action==='student_login')result={status:'success',token:'student-A',nama:'Mahasiswa Uji'};
   else if(data.action==='get_data'){const student=String(data.token).startsWith('student-');result={status:'success',registrations:structuredClone(student?records.filter(r=>r.nim==='A'):records),students:[],announcements:structuredClone(announcements),contents:[{Tipe:'notice_meta',DataJSON:JSON.stringify(noticeMeta)}],services,dosens:structuredClone(dosens)};}
   else if(data.action==='get_document')result={status:'success',fileName:'d.pdf',mimeType:'application/pdf',base64:previewPdf('Dokumen uji',4).toString('base64')};
   else if(data.action==='get_document_review')result={status:'success',version:'',reviews:[],archived:false};
   else if(data.action==='get_journey')result={status:'success',journey:{checks:{},revision:1}};
   else if(await nextMock(route,data))return;
   else result={status:'success'};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});}
  if(url.startsWith(origin))return route.continue();return route.abort();});
 const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());return page;
}
async function login(page,role){
 await page.goto(origin);
 if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}
 else{await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');}
 await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success'&&!!window.IPCOSNotifications);
 await page.evaluate(()=>document.getElementById('toast-container')?.replaceChildren());
}
const barTop=page=>page.evaluate(()=>{const bar=[...document.querySelectorAll('#student-bottom-nav,#admin-bottom-nav')].find(node=>node.getClientRects().length);return bar?bar.getBoundingClientRect().top:innerHeight;});
const rect=(page,selector)=>page.locator(selector).first().evaluate(node=>node.getBoundingClientRect().toJSON());

(async()=>{
 const browser=await chromium.launch();
 // 1. The admin reader keeps at least half of every viewport for the document.
 for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024]]){
  const admin=await context(browser,{width,height});await login(admin,'admin');await admin.evaluate(()=>switchTab(null,'admin-data'));
  await admin.evaluate(()=>openCaseDetail('Q2'));await admin.waitForSelector('#case-detail-content [data-preview-index]');
  assert.equal(await admin.locator('#case-review-navigation').isVisible(),false,`${width}×${height}: previous/next wait behind Details`);
  await admin.locator('#case-details-toggle').click();assert(await admin.locator('#case-review-navigation').isVisible());assert.match(await admin.locator('.case-review-reference').textContent(),/Nomor Q2/);
  await admin.locator('#case-details-toggle').click();
  await admin.locator('#case-detail-content [data-preview-index]').first().click();await admin.waitForFunction(()=>document.querySelector('#case-file-preview .pdf-canvas-viewer canvas'));
  assert.equal(await admin.evaluate(()=>document.getElementById('modal-case-detail').dataset.mobileFiles),'hidden','The file list steps aside once a document opens');
  assert(await admin.locator('#case-file-preview [data-change-file]').isVisible(),'Ganti Berkas stays visible');
  const space=await admin.evaluate(()=>{const content=document.getElementById('case-detail-content'),card=document.querySelector('#modal-case-detail .case-detail-card'),renderer=document.querySelector('#case-file-preview > .document-renderer').getBoundingClientRect();
   const scrolling=getComputedStyle(content).overflowY==='auto';return {workspace:scrolling?content.clientHeight:innerHeight,visible:Math.max(0,Math.min(innerHeight,renderer.bottom)-Math.max(0,renderer.top)),cardScroll:getComputedStyle(card).overflowY};});
  assert(space.workspace>=height/2,`${width}×${height}: the document workspace gets at least half the viewport ${JSON.stringify(space)}`);
  if(height<=500)assert(space.visible>=height/2,`${width}×${height}: on a short screen the document itself fills at least half the view ${JSON.stringify(space)}`);
  assert.equal(await admin.locator('#case-review-action-footer #case-detail-actions').isVisible(),false,'The decision group lives in Pemeriksaan');
  await admin.locator('#case-file-preview .pdf-preview-toolbar button').nth(1).click();await admin.waitForFunction(()=>/2 \/ 4/.test(document.querySelector('#case-file-preview .pdf-preview-toolbar')?.textContent||''));
  const pageBefore=await admin.locator('#case-file-preview .pdf-preview-toolbar').textContent();assert.match(pageBefore,/2 \/ 4/);
  await admin.locator('[data-review-pane]').click();assert.equal(await admin.evaluate(()=>document.getElementById('modal-case-detail').dataset.workspaceView),'review');
  assert(await admin.locator('#case-detail-actions button').first().isVisible(),'Pemeriksaan shows the decision group');
  await admin.locator('#workspace-view-toggle [data-workspace-view="documents"]').click();
  assert.equal(await admin.locator('#case-file-preview .pdf-preview-toolbar').textContent(),pageBefore,'Returning keeps the same file and page');
  await admin.locator('#case-file-preview [data-change-file]').click();assert(await admin.locator('#admin-file-navigation').isVisible(),'Ganti Berkas brings the list back');
  assert.equal(calls.filter(call=>call.action==='update').length,0,'Opening, paging and switching panes never commit a decision');
  await admin.context().close();
 }
 pass('The admin reader gives the document at least half of 320×568, 390×844, 844×390 and 768×1024; Details, Ganti Berkas and the route to Pemeriksaan keep every action one tap away');

 // 2. Sign-in and the Pendadaran working list on a phone.
 const student=await context(browser,{width:390,height:844});await student.goto(origin);
 const nim=await rect(student,'#input-nim');assert(nim.top<=360,`The NIM field starts within the top 360 px (${nim.top})`);
 assert.equal(await student.getAttribute('#input-nim','inputmode'),'numeric');assert.equal(await student.getAttribute('#input-nim','type'),'text');assert.equal(await student.getAttribute('#input-nim','autocomplete'),'username');
 assert.equal((await student.locator('label[for="input-nim"]').textContent()).trim(),'Nomor Induk Mahasiswa (NIM)');
 await login(student,'mhs');
 assert.equal(await student.locator('#announcement-text').textContent(),'Unggah berkas Pendadaran satu per satu · berlaku sampai 31 Des 2099','The banner shows the approved subject and its end date');
 await student.locator('#announcement-read').click();await student.waitForSelector('#modal-notification-announcement',{state:'visible'});assert.equal(await student.locator('#notification-reader-body').textContent(),UPLOAD);
 await student.locator('#notification-reader-close').click();await student.waitForFunction(()=>document.activeElement?.id==='announcement-read');
 await student.evaluate(()=>{sessionStorage.setItem('ipcos_form_draft',JSON.stringify({ownerNim:'A','reg-jenis-utama':'Pendadaran','reg-judul':'Analisis Diplomasi Digital',savedAt:new Date().toISOString()}));switchTab(null,'dashboard');});
 assert.match(await student.locator('.student-next-step').textContent(),/Draf tersimpan\. Berikutnya, pilih Blangko Pendadaran\./,'The home card names the next document');
 assert.match(await student.locator('.student-next-context').textContent(),/Berkas wajib 0\/11/,'The home card shows real draft progress');
 await student.locator('[data-student-home-action]').click();await student.waitForFunction(()=>window.IPCOSRegistration?.current()==='files');await student.waitForTimeout(100);
 const bar=await barTop(student),picker=await rect(student,'#file-pdd-blangko-selection .upload-choose'),limits=await rect(student,'#pendadaran-upload-intro');
 assert(picker.bottom<=bar&&limits.top>=0,`One action shows the first complete picker and the shared limits above the bottom bar (${limits.top}–${picker.bottom} ≤ ${bar})`);
 assert.equal(await student.locator('#req-pendadaran .upload-row-toggle[aria-expanded="true"]').count(),1,'Only the first missing document is open');
 assert.match(await student.locator('#file-pdd-kkn-row .upload-row-toggle').textContent(),/Sertifikat KKN.*Belum dipilih/i);
 await student.locator('#file-pdd-blangko-guidance [data-guide="templates-faq"]').click();
 assert(await student.locator('#file-pdd-blangko-template').isVisible(),'The template opens in place with one activation');
 await student.locator('#file-pdd-blangko-template [data-template-close]').click();assert.equal(await student.evaluate(()=>document.activeElement.dataset.guide),'templates-faq');
 await student.locator('#file-pdd-kkn-row .upload-row-toggle').click();await student.setInputFiles('#file-pdd-kkn',{name:'kkn.pdf',mimeType:'application/pdf',buffer:pdf('kkn')});
 await student.setInputFiles('#file-pdd-bta',{name:'besar.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(11*1024*1024,1)});
 await student.waitForFunction(()=>document.querySelector('#file-pdd-bta-row .upload-row-toggle')?.getAttribute('aria-expanded')==='true');
 assert.match(await student.locator('#file-pdd-bta-row .upload-row-toggle').textContent(),/Perlu diganti/i,'An oversized file opens its own row');
 await student.setInputFiles('#file-pdd-bta',{name:'bta.pdf',mimeType:'application/pdf',buffer:pdf('bta')});await student.waitForFunction(()=>/Siap/i.test(document.querySelector('#file-pdd-bta-row .upload-row-state')?.textContent||''));
 await student.waitForFunction(()=>/Berkas wajib: 2\/11/.test(document.getElementById('pendadaran-upload-total').textContent));
 const kept=await student.evaluate(()=>window.__keep=document.getElementById('file-pdd-kkn').files[0]);
 await student.evaluate(()=>IPCOSRegistration.focus('file-pdd-toefl'));assert.equal(await student.evaluate(()=>document.activeElement.id),'file-pdd-toefl','Focusing a document opens its row');
 assert(await student.evaluate(()=>document.getElementById('file-pdd-kkn').files[0]===window.__keep),'Same-tab selections stay intact');
 await student.evaluate(()=>{registrationDirty=false;});
 pass('Sign-in starts high with a numeric NIM hint; the banner names the notice; the draft card names the next file; the files step is one working list with in-place templates and any-order selection');

 // 3. Request history rows and the file count.
 await student.evaluate(()=>switchTab(null,'student-status'));await student.waitForSelector('#student-mobile-list .student-history-card');
 const first=await rect(student,'#student-mobile-list .student-history-card [data-case-id]');assert(first.bottom<=await barTop(student),'The first result action fits above the bottom bar');
 assert.equal(await student.locator('#student-request-toolbar').isVisible(),false,'Search and sort open on demand');await student.locator('#student-request-tools-toggle').click();assert(await student.locator('#student-request-search').isVisible());
 await student.evaluate(()=>openCaseDetail('R1'));await student.waitForSelector('#student-files-title');
 assert.match(await student.locator('#student-files-title + span').textContent(),/2 dokumen terbaru · 2 versi sebelumnya/);
 await student.evaluate(()=>closeModal('modal-case-detail',true));
 pass('Request history is a compact list with the result action above the bottom bar; details count latest documents and earlier versions separately');

 // 4. Search aliases lead to the service without discarding a draft.
 await student.evaluate(()=>{document.getElementById('reg-jenis-utama').value='Pendadaran';registrationDirty=true;openGlobalSearch();});
 for(const term of ['sempro','Seminar Proposal']){await student.fill('#global-search-input',term);await student.waitForSelector('[data-search-group="services"]');
  assert.match(await student.locator('#global-search-results [data-search-key]').first().textContent(),/^\s*Ujian Seminar Proposal/,`"${term}" puts the service first`);}
 await student.locator('#global-search-results [data-search-key]').first().click();await student.waitForFunction(()=>document.querySelector('.tab-content.active')?.id==='pendaftaran');
 assert.equal(await student.inputValue('#reg-jenis-utama'),'Pendadaran','Opening another service keeps the existing draft');
 await student.evaluate(()=>{registrationDirty=false;});
 // 5. Drawer navigation focuses the destination heading.
 await student.locator('#student-bottom-nav [data-bottom-target="menu"]').click();await student.locator('#main-sidebar [data-nav-target="student-files"]').click();
 await student.waitForFunction(()=>document.activeElement?.matches('#student-files h1'));
 pass('Sempro and Seminar Proposal find the service first and keep an existing draft; a page chosen from the drawer focuses its heading');

 // 6. The critical-capacity tile opens exactly its records.
 const admin=await context(browser,{width:1365,height:900});await login(admin,'admin');
 await admin.locator('#admin-today button.admin-today-tile').click();await admin.waitForFunction(()=>document.getElementById('supervisor-availability')?.value==='critical');
 const names=await admin.locator('#table-admin-dosen tr strong').allTextContents();
 assert.deepEqual(names,['Dr. Delta','Dr. Gamma','Dr. Beta','Dr. Eta'],'Only positive-capacity supervisors with one or fewer places, tightest first');
 assert.match(await admin.locator('#supervisor-show-all').textContent(),/Lihat Semua 7 Dosen/);await admin.locator('#supervisor-show-all').click();assert.equal(await admin.locator('#table-admin-dosen tr').count(),7);
 await admin.evaluate(()=>switchTab(null,'dashboard'));await admin.locator('#admin-today button.admin-today-tile').click();await admin.waitForFunction(()=>document.getElementById('supervisor-availability')?.value==='critical');
 await admin.locator('.nav-item[data-nav-target="admin-dosen"]').click();assert.equal(await admin.inputValue('#supervisor-availability'),'all','Ordinary entry from the menu shows every supervisor');
 pass('The critical-capacity tile opens only its four matching supervisors, tightest first, with a route to all; menu entry still shows everyone');

 assert.deepEqual(errors,[]);
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/portal-refresh-results.json',JSON.stringify({checks,errors},null,2));
 await browser.close();
})().catch(reportFailure);
