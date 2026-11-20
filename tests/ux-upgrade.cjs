// UI/UX upgrade PRD (20 Nov 2026): inbox, phone header, resume, admin queue and review acceptance checks.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,reportFailure}=require('./browser.cjs');
const nextMock=require('./next-mock.cjs');
const {previewPdf}=require('./fixtures.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
const checks=[],errors=[],calls=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
// Same identity function as the portal (FNV-1a over code points).
const hash=value=>{let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
const noticeKey=body=>hash('notice:'+String(body).replace(/\s+/g,' ').trim());
const day=n=>new Date(Date.now()-n*86400000).toISOString();
const A1={date:day(2),message:'Unggah berkas Pendadaran satu per satu. PDF, JPG, atau PNG · total maksimal 20 MB.',type:'info'};
const A2={date:day(1),message:'Batas pendaftaran periode Agustus: 31 Agustus.',type:'important'};
const A3={date:day(110),message:'Tutorial ZIP lama: gabungkan semua berkas.',type:'info'};
const A4={date:day(10),message:'Jadwal bimbingan minggu depan diumumkan dosen.',type:'info'};
const A5={date:day(15),message:'Libur akademik: kampus tutup sementara.',type:'info'};
const announcements=[A3,A5,A4,A1,A2];
let noticeMeta={schema:1,notices:{[noticeKey(A1.message)]:{subject:'Unggah berkas Pendadaran satu per satu',service:'Pendadaran'},[noticeKey(A2.message)]:{expires:'2026-08-31'},[noticeKey(A3.message)]:{archived:true}}};
const PDD=['Blangko Pendadaran','Sertifikat KKN','Sertifikat BTA'];
const rec=(id,nim,nama,jenis,status,d,labels)=>{const docs=labels.map((label,i)=>({url:`https://drive.google.com/file/d/${id}${i}/view`,label,fileName:'d'+i+'.pdf',version:1}));return {id,date:day(d),nim,nama,jenis,detail:'<b>Judul:</b> Analisis Diplomasi Digital',link:docs.map(doc=>`<a href="${doc.url}">${doc.label}</a>`).join('<br>'),status,note:JSON.stringify([{role:'mhs',sender:nama,time:day(d),message:'Pendaftaran',status:'Pending',documents:docs}])};};
const records=[rec('R1','A','Mahasiswa Uji','Outline','Accepted',3,['Transkrip']),rec('Q1','2022011','Rina Putri','Pendadaran','Pending',8,PDD),rec('Q2','2022012','Budi Santoso','Proposal','Pending',2,['Form ACC']),rec('Q3','2022013','Siti Aminah','Proposal','Accepted',20,['Form ACC'])];
const services=['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'].map(type=>({type,enabled:true,open:'',close:'',adminDays:3,studentDays:7}));
let failRead=false;
async function context(browser,viewport){
 const ctx=await browser.newContext({viewport,reducedMotion:'reduce'});
 await ctx.route('**/*',async route=>{const url=route.request().url();
  if(url.includes('script.google.com/macros/')){const data=route.request().postDataJSON();calls.push(data);let result;
   if(data.action==='admin_login')result={status:'success',token:'admin'};
   else if(data.action==='student_login')result={status:'success',token:'student-A',nama:'Mahasiswa Uji'};
   else if(data.action==='get_data'){if(failRead)result={status:'error',message:'Gangguan uji'};else{const student=String(data.token).startsWith('student-');result={status:'success',registrations:structuredClone(student?records.filter(r=>r.nim==='A'):records),students:[],announcements:structuredClone(announcements),contents:[{Tipe:'notice_meta',DataJSON:JSON.stringify(noticeMeta)}],services,dosens:[{Nama:'Dr. Beta',Terpakai:1,Maksimal:5}]};}}
   else if(data.action==='update_content'){if(data.type==='notice_meta')noticeMeta=JSON.parse(data.content);result={status:'success'};}
   else if(data.action==='get_document')result={status:'success',fileName:'d.pdf',mimeType:'application/pdf',base64:previewPdf('Dokumen uji',1).toString('base64')};
   else if(data.action==='get_document_review')result={status:'success',version:'',reviews:[],archived:false};
   else if(data.action==='get_journey')result={status:'success',journey:{checks:{},revision:1}};
   else if(data.action==='get_sop')result={status:'success',document:{schema:1,type:data.type,revision:0,title:'',titleEn:'',intro:'',introEn:'',updatedAt:'',sections:[]}};
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
const openProfile=async page=>{if(!(await page.locator('#workspace-profile').evaluate(node=>node.open)))await page.locator('#workspace-profile>summary').click();};
const box=(page,selector)=>page.locator(selector).first().evaluate(node=>node.getBoundingClientRect().toJSON());
const rowFor=(page,body)=>page.locator(`#notification-center-list [data-notification-key]`).filter({hasText:body});

(async()=>{
 const browser=await chromium.launch();
 // 1. Inbox geometry and content at the three review sizes.
 const student=await context(browser,{width:390,height:844});await login(student,'mhs');
 await student.evaluate(()=>IPCOSNotifications.visit());await student.waitForSelector('#notification-center-list [data-notification-key]');
 const rows=student.locator('#notification-center-list [data-notification-key]');
 assert.equal(await rows.count(),4,'Expired and archived notices stay out of the default inbox');
 assert.equal(await student.locator('#notif-badge').textContent(),'4','Only active notices count as unread');
 assert.equal(await rows.nth(0).locator('.notification-subject span').first().textContent(),'Unggah berkas Pendadaran satu per satu','The authored subject leads the newest row');
 assert.equal(await rows.nth(0).locator('.notification-excerpt').textContent(),A1.message,'The full message follows a saved subject');
 assert.match(await rows.nth(0).locator('.notification-row-meta').textContent(),/Belum dibaca.*Pengumuman.*Ujian Pendadaran/,'Unread state, kind and related service are labelled');
 assert.match(await rows.nth(1).locator('.notification-subject').textContent(),/Pengajuan Outline Skripsi disetujui/,'A request row names its result');
 let bar=await barTop(student);const second=await box(student,'#notification-center-list [data-notification-key]:nth-child(2) .notification-subject');
 assert(second.bottom<=bar,`390×844: two subjects and the second open target sit above the bottom bar (${second.bottom} ≤ ${bar})`);
 assert(!(await student.locator('#notification-mark-all').isVisible()),'Mark all waits behind More');
 await student.setViewportSize({width:320,height:740});await student.evaluate(()=>scrollTo(0,0));bar=await barTop(student);
 const first=await box(student,'#notification-center-list [data-notification-key]:first-child .notification-subject'),state=await box(student,'#notification-center-list [data-notification-key]:first-child .notification-state');
 assert(first.bottom<=bar&&state.bottom<=bar,`320×740: first subject, unread state and open target fit above the bottom bar (${first.bottom} ≤ ${bar})`);
 const header=await student.evaluate(()=>{const search=document.querySelector('.workspace-toolbar .header-search').getBoundingClientRect();return {search:[search.width,search.height],quick:!!document.querySelector('.workspace-quick-toggles')?.getClientRects().length,menu:!!document.querySelector('.mobile-nav-toggle')?.getClientRects().length,overflow:document.documentElement.scrollWidth>innerWidth+1};});
 assert.deepEqual(header,{search:[44,44],quick:false,menu:false,overflow:false},'320 px header: full 44 px search, no duplicate menu, language and theme moved into the account menu');
 await openProfile(student);await student.locator('#profile-language').click();
 assert.equal(await student.evaluate(()=>currentLang),'en','Language switches from the account menu');
 assert.equal(await student.locator('#main-sidebar').getAttribute('aria-label'),'Main navigation','The navigation landmark is translated');
 assert.equal(await rows.nth(0).locator('.notification-subject span').first().getAttribute('lang'),'id','Indonesian notices are marked in the English interface');
 assert.equal(await student.evaluate(()=>document.title),'Notifications · IPCOS UMY','The tab title names the page');
 await openProfile(student);await student.locator('#profile-theme').click();
 assert.equal(await student.locator('#profile-theme').getAttribute('aria-pressed'),'true');assert(await student.evaluate(()=>document.body.classList.contains('dark-mode')));
 assert.match(await student.locator('#notification-filter').evaluate(node=>getComputedStyle(node).backgroundImage),/linear-gradient/,'The type filter shows a caret in the dark theme');
 await student.evaluate(()=>{toggleDarkMode();toggleLanguage();});assert.equal(await student.evaluate(()=>document.title),'Notifikasi · IPCOS UMY');
 await student.setViewportSize({width:1280,height:800});await student.evaluate(()=>scrollTo(0,0));
 const visibleRows=await student.evaluate(()=>[...document.querySelectorAll('#notification-center-list [data-notification-key]')].filter(row=>row.getBoundingClientRect().bottom<=innerHeight).length);
 assert(visibleRows>=3,`1280×800: at least three complete rows are visible (${visibleRows})`);
 assert(await student.locator('.workspace-quick-toggles').isVisible(),'Desktop keeps language and theme in the top bar');
 pass('Inbox rows fit the 320, 390 and 1280 px acceptance views with subjects, unread labels and services; the phone header fits; language, theme, title and landmarks follow the interface language');

 // 2. Expiry, archive, bell agreement and the failed-refresh state.
 assert.equal(await student.locator('#announcement-banner').isVisible(),false,'An expired important notice is never re-announced as a banner');
 assert.equal(await student.locator('#modal-important-announcement').isVisible(),false);
 await student.selectOption('#notification-filter','archive');await student.waitForFunction(()=>document.querySelectorAll('#notification-center-list [data-notification-key]').length===2);
 assert.match(await rowFor(student,'Tutorial ZIP lama').locator('.notification-row-meta').textContent(),/Diarsipkan/);assert.match(await rowFor(student,'Batas pendaftaran').locator('.notification-row-meta').textContent(),/Kedaluwarsa/);
 assert.doesNotMatch(await rowFor(student,'Batas pendaftaran').textContent(),/Penting/,'An expired notice is no longer marked Important');
 await student.fill('#notification-search','ZIP');await student.waitForFunction(()=>document.querySelectorAll('#notification-center-list [data-notification-key]').length===1);
 await student.locator('#notification-reset').click();
 await student.locator('.notification-toggle').click();const bellKey=await student.locator('#notif-list-container [data-notification-key]').first().getAttribute('data-notification-key');
 assert.equal(await student.locator('#notif-list-container [data-notification-key]').first().locator('strong').textContent(),await student.locator(`#notification-center-list [data-notification-key="${bellKey}"] .notification-subject span`).first().textContent(),'Bell and inbox show the same subject');
 await student.keyboard.press('Escape');
 failRead=true;await student.evaluate(()=>syncDatabase().catch(()=>{}));await student.waitForFunction(()=>syncPhase==='error');failRead=false;
 assert(await student.locator('#notification-refresh-error').isVisible(),'A failed refresh is explained in the inbox');assert.equal(await rows.count(),4,'Last loaded rows stay readable');
 await student.locator('#notification-refresh-retry').click();await student.waitForFunction(()=>syncPhase==='success');assert(await student.locator('#notification-refresh-error').isHidden());
 pass('Expired and archived notices move to a searchable Archive without Important or banner prompts; the bell and inbox agree; a failed refresh keeps rows and offers Try Again');

 // 3. Back returns to the notification that left the inbox; Forward lands on the destination heading.
 const requestKey=await rowFor(student,'Pengajuan Outline').getAttribute('data-notification-key');
 await rowFor(student,'Pengajuan Outline').locator('[data-notification-action=open]').click();await student.waitForSelector('#modal-case-detail',{state:'visible'});
 assert.equal(await student.evaluate(()=>document.querySelector('.tab-content.active').id),'student-status');
 await student.evaluate(()=>closeModal('modal-case-detail',true));await student.waitForSelector('#modal-case-detail',{state:'hidden'});
 await student.goBack();await student.waitForFunction(()=>document.querySelector('.tab-content.active')?.id==='notifications');
 await student.waitForFunction(key=>document.activeElement?.closest('[data-notification-key]')?.dataset.notificationKey===key&&document.activeElement.dataset.notificationAction==='open',requestKey);
 await student.goForward();await student.waitForFunction(()=>document.querySelector('.tab-content.active')?.id==='student-status');
 await student.waitForFunction(()=>document.activeElement?.matches('#student-status h1'));
 assert.equal(await student.evaluate(()=>document.title),'Status Pengajuanku · IPCOS UMY');
 pass('Back restores focus to the notification that opened a request; Forward focuses the destination heading and the title follows');

 // 4. Resume a saved Pendadaran draft at its files step.
 await student.setViewportSize({width:390,height:844});
 await student.evaluate(()=>{sessionStorage.setItem('ipcos_form_draft',JSON.stringify({ownerNim:'A','reg-jenis-utama':'Pendadaran','reg-judul':'Analisis Diplomasi Digital',savedAt:new Date().toISOString()}));switchTab(null,'dashboard');});
 assert.equal(await student.locator('#student-next-title').textContent(),'Draf Ujian Pendadaran','The home card names the service of the draft');
 const resume=student.locator('#task-home .student-next-step button').first();assert.match(await resume.textContent(),/Lanjutkan ke Berkas|Lanjutkan ke berkas/);
 await resume.click();await student.waitForFunction(()=>window.IPCOSRegistration?.current()==='files');
 assert.equal(await student.inputValue('#reg-judul'),'Analisis Diplomasi Digital');assert.equal(await student.evaluate(()=>document.activeElement.id),'file-pdd-blangko','The next missing file has focus');
 assert.match(await student.locator('#pendadaran-upload-total').textContent(),/Berkas wajib: 0\/11 · Total 0 MB dari 20 MB/,'Required files are counted apart from the title-inclusive readiness');
 assert.match(await student.locator('#registration-readiness .stage-progress').textContent(),/1\/12 syarat wajib siap/);
 assert.match(await student.locator('#pendadaran-upload-intro').textContent(),/PDF, JPG, atau PNG, maksimal 10 MB per berkas dan 20 MB/,'Shared format and size limits are stated once');
 assert.equal(await student.locator('#req-pendadaran .upload-format:visible').count(),0,'Slots no longer repeat the shared format line');
 assert.equal(await student.locator('#reg-jenis-utama').getAttribute('aria-hidden'),'true','The service cards are the only picker');
 await student.evaluate(()=>{registrationDirty=false;});
 pass('A saved draft names its service on Beranda and resumes at the next missing file; limits appear once and required files are counted separately');

 // 5. Admin: notice editing, phone queue, phone home and the review footer.
 const admin=await context(browser,{width:390,height:844});await login(admin,'admin');
 const home=await admin.evaluate(()=>{const panel=document.getElementById('admin-today'),home=document.getElementById('task-home');return {last:home.lastElementChild===panel,first:home.firstElementChild===panel};});
 assert.equal(home.last,true,'On a phone the work list comes before today\'s figures');
 await admin.evaluate(()=>switchTab(null,'admin-data'));await admin.waitForSelector('#admin-mobile-list [data-queue-case="Q1"]');
 assert.equal(await admin.locator('#admin-mobile-list [data-queue-case="Q1"] .queue-open-request').textContent(),'Periksa Pengajuan →');
 await admin.selectOption('#admin-status-filter','ALL').catch(async()=>{await admin.evaluate(()=>{document.getElementById('admin-status-filter').value='ALL';filterAdminData();});});
 await admin.waitForSelector('#admin-mobile-list [data-queue-case="Q3"]');assert.equal(await admin.locator('#admin-mobile-list [data-queue-case="Q3"] .queue-open-request').textContent(),'Lihat Rincian →','Completed work is opened as details, not a review');
 assert.equal(await admin.locator('#admin-mobile-list [data-queue-case="Q3"] [data-bulk-id]').getAttribute('aria-label'),'Pilih Siti Aminah · Q3','Each selection names the student and request');
 await admin.evaluate(()=>{document.getElementById('admin-status-filter').value='ACTION_REQUIRED';filterAdminData();scrollTo(0,0);});
 assert.equal(await admin.locator('#queue-saved-views').isVisible(),false,'Shortcuts and saved views wait inside Filter & Sort on a phone');
 const firstCase=await admin.locator('#admin-mobile-list .queue-request-card').first().locator('.queue-open-request').evaluate(node=>node.getBoundingClientRect().bottom);
 assert(firstCase<=await barTop(admin),'The first case and its full review target sit above the bottom bar');
 await admin.locator('#queue-advanced>summary').click();assert(await admin.locator('#queue-saved-views').isVisible());await admin.locator('#queue-advanced>summary').click();
 await admin.locator('#admin-mobile-list [data-queue-case="Q1"] .queue-open-request').click();await admin.waitForSelector('#case-review-action-footer [data-review-continue]');
 assert.match(await admin.locator('#review-continue .review-continue-note').textContent(),/Berikutnya: Blangko Pendadaran · 3 belum diperiksa/);
 assert.equal(await admin.locator('#case-review-action-footer [role=group][aria-label="Keputusan pengajuan"]').count(),1,'The decision buttons keep their own labelled group');
 assert.equal(calls.filter(call=>call.action==='update'&&call.id==='Q1').length,0,'Opening a case never commits a decision');
 await admin.locator('[data-review-continue]').click();await admin.waitForFunction(()=>document.getElementById('case-detail-content').dataset.activeDocumentIndex==='0');
 await admin.evaluate(()=>closeModal('modal-case-detail',true));
 await admin.setViewportSize({width:1365,height:900});await admin.evaluate(()=>switchTab(null,'dashboard'));
 assert.equal(await admin.evaluate(()=>document.getElementById('task-home').firstElementChild?.id),'admin-today','Desktop keeps today\'s figures first');
 await admin.evaluate(()=>{switchTab(null,'admin-master');IPCOSMaster.show('announcements');});await admin.waitForSelector('#notice-manager');
 await admin.locator('#notice-manager>summary').click();const key=noticeKey(A4.message);await admin.locator(`[data-notice-edit="${key}"]`).click();
 await admin.fill('#notice-edit-subject','Jadwal bimbingan');await admin.fill('#notice-edit-expires','2026-01-01');await admin.locator('[data-notice-save]').click();
 await admin.waitForFunction(()=>/tersimpan/.test(document.getElementById('notice-manager-message').textContent));
 assert.deepEqual([noticeMeta.notices[key].subject,noticeMeta.notices[key].expires],['Jadwal bimbingan','2026-01-01'],'The edited details are saved through update_content');
 assert(noticeMeta.notices[noticeKey(A1.message)],'Other notices keep their details');
 await admin.evaluate(()=>IPCOSNotifications.visit());await admin.selectOption('#notification-filter','archive');
 await admin.waitForFunction(()=>[...document.querySelectorAll('#notification-center-list .notification-subject')].some(node=>node.textContent.includes('Jadwal bimbingan')));
 pass('Admins edit a published notice\'s subject and end date; phone queue, home and review put the next case and next check first while desktop keeps its layout');

 assert.deepEqual(errors,[]);
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/ux-upgrade-results.json',JSON.stringify({checks,errors},null,2));
 await browser.close();
})().catch(reportFailure);
