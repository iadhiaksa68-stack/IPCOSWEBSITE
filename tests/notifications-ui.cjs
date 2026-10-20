const {selectService} = require('./registration-helpers.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,reportFailure}=require('./browser.cjs');
const {pdf}=require('./fixtures.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
const calls=[],errors=[],checks=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
const attack='<img src=x onerror="window.notificationAttack=true">';
const longText=('Pengumuman akademik eCommerce O’Connor — '+('Persiapan dokumen mahasiswa internasional dan penelitian komunikasi lintas budaya. ').repeat(5)).trim();
const sameDate='2026-10-15T01:00:00Z';
const sameA={date:sameDate,message:'Simultan A: jadwal bimbingan eCommerce.',type:'info'};
const sameB={date:sameDate,message:'Simultan B: ketentuan dokumen O’Connor.',type:'info'};
const undated={message:'Tanpa tanggal: informasi tetap dapat dibaca.',type:'info'};
const lower={id:'lowercase-announcement-id',date:'2026-10-14T01:00:00Z',message:'Pengumuman ID kecil yang tepat.',type:'info'};
const legacy={Id:'legacy-announcement-id',Tanggal:'2026-10-13T01:00:00Z',Pesan:'Pengumuman format lama: jangan ubah eCommerce.',Tipe:'info'};
const escaped={Id:'literal-html-announcement',date:'2026-10-12T01:00:00Z',message:attack+'\n'+longText,type:'info'};
let announcements=[...Array.from({length:108},(_,index)=>({id:'bulk-'+index,date:'2026-09-01T01:00:00Z',message:'Pengumuman '+String(index).padStart(3,'0')+' eCommerce untuk mahasiswa.',type:'info'})),sameA,sameB,undated,lower,legacy,escaped,{date:'invalid-date',message:'   ',type:'info'}];
let records=[
 {id:'CASE-REV-LATEST',nim:' A ',nama:'Mahasiswa A',jenis:'Proposal',status:' ReViSiOn ',date:'2026-10-01T01:00:00Z',detail:'<b>Judul:</b> eCommerce dan partisipasi mahasiswa',link:'',note:JSON.stringify([{role:'admin',sender:'Admin',time:'2026-10-16T03:00:00Z',message:'Perbaiki dokumen bertanda tangan.'},{role:'system',time:'invalid-date',message:'Invalid date must not break ordering.'},{role:'system',time:'2026-10-02T01:00:00Z',message:'Older last row.'}])},
 {id:'CASE-REV-SECOND',nim:'A',nama:'Mahasiswa A',jenis:'Skripsi Jurnal',status:'Revision',date:'2026-10-03T01:00:00Z',detail:'<b>Judul:</b> Penelitian kedua',link:'',note:'[]'},
 {id:'CASE-ACCEPTED',nim:'A',nama:'Mahasiswa A',jenis:'Pendadaran',status:'Accepted',date:'2026-10-04T01:00:00Z',detail:'<b>Judul:</b> Pengajuan selesai',link:'',note:'[]'},
 {id:'CASE-PENDING',nim:'A',nama:'Mahasiswa A',jenis:'Outline',status:'Pending',date:'2026-10-05T01:00:00Z',detail:'<b>Judul:</b> Menunggu admin',link:'',note:'[]'},
 {id:'CASE-FOREIGN-PRIVATE',nim:'B',nama:'PRIVATE FOREIGN STUDENT',jenis:'Proposal',status:'Revision',date:'2027-01-01T01:00:00Z',detail:'PRIVATE FOREIGN TITLE',link:'',note:'[]'},
 {id:'CASE-ADMIN-CORRECTIONS',nim:'B',nama:'Mahasiswa B',jenis:'Proposal',status:' ReSuBmItTeD ',date:'2026-10-06T01:00:00Z',detail:'Berkas diperbaiki',link:'',note:'[]'}
];
let nextRead=null;
function gate(){let enter,release;return{entered:new Promise(resolve=>enter=resolve),wait:new Promise(resolve=>release=resolve),enter:()=>enter(),release:()=>release()};}
function bounded(promise,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),10000);})]).finally(()=>clearTimeout(timer));}
function snapshot(){return{status:'success',registrations:structuredClone(records),announcements:structuredClone(announcements),students:[],dosens:[],contents:[],services:[]};}
async function announcementKey(page,announcement){return page.evaluate(announcement=>window.IPCOSNotifications.keyForAnnouncement(announcement),announcement);}
const card=(page,key,scope='#notification-center-list')=>page.locator(scope+' [data-notification-key="'+key+'"]');
async function rowKeys(page,scope='#notification-center-list'){return page.locator(scope+' [data-notification-key]').evaluateAll(nodes=>nodes.map(node=>node.dataset.notificationKey));}
async function shown(page,count){await page.waitForFunction(count=>document.querySelectorAll('#notification-center-list [data-notification-key]').length===count,count,{timeout:5000});assert.equal(Number((await page.locator('#notification-result-count').textContent()).match(/\d+/)?.[0]),count);}
async function select(page,value){await page.selectOption('#notification-filter',value);assert.equal(await page.inputValue('#notification-filter'),value);}
async function mode(page,width,lang,dark){await page.setViewportSize({width,height:900});await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();if(document.body.classList.contains('dark-mode')!==dark)toggleDarkMode();},{lang,dark});}
async function layout(page,scope,label){
 const result=await page.locator(scope).evaluate(root=>{
  const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&!node.closest('[hidden],details:not([open])>:not(summary)');
  const clipped=[...root.querySelectorAll('h1,h2,h3,p,label,button,strong')].filter(node=>visible(node)&&node.clientWidth&&!node.classList.contains('sr-only')).filter(node=>node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).textOverflow!=='ellipsis').map(node=>({id:node.id,text:node.textContent.trim().slice(0,90)}));
  const controls=[...root.querySelectorAll('button,input,select')].filter(visible).map(node=>({text:node.textContent.trim().slice(0,65),box:node.getBoundingClientRect().toJSON()}));
  return{overflow:document.documentElement.scrollWidth>innerWidth+2,clipped,controls};
 });
 assert.equal(result.overflow,false,label+' viewport overflow');assert.deepEqual(result.clipped,[],label+' clipped text');
 for(const{text,box}of result.controls){assert(box.height>=43.99,label+' usable 44px control '+text);assert(box.left>=-1&&box.right<=page.viewportSize().width+1,label+' control fits horizontally '+text);}
}
async function sync(page){await page.evaluate(()=>syncDatabase());await page.waitForFunction(()=>syncPhase==='success');}
async function login(browser,role='mhs',nim='A'){
 const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{const url=route.request().url();if(url.includes('script.google.com/macros/')){const data=route.request().postDataJSON();calls.push(data);let result;
  if(data.action==='student_login')result={status:'success',token:'student-'+data.nim,nama:'Mahasiswa '+data.nim};
  else if(data.action==='admin_login')result={status:'success',token:'admin'};
  else if(data.action==='get_data'){result=snapshot();const held=nextRead;nextRead=null;if(held){held.enter();await held.wait;}}
  else if(data.action==='logout')result={status:'success'};
  else if(await require('./next-mock.cjs')(route,data))return;
  else throw Error('Unexpected notification fixture API '+data.action);
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 }if(url.startsWith(origin))return route.continue();if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});return route.abort();});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>page.notificationPermit===false?dialog.dismiss():dialog.accept());await page.goto(origin);
 if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}else{await page.fill('#input-nim',nim);await page.locator('#input-nim').press('Enter');}
 await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success'&&!!window.IPCOSNotifications);return page;
}

(async()=>{
 const browser=await chromium.launch(),student=await login(browser);
 const announcementCount=announcements.filter(ann=>String(ann.Pesan||ann.message||'').trim()).length,total=announcementCount+3;
 const keys={sameA:await announcementKey(student,sameA),sameB:await announcementKey(student,sameB),undated:await announcementKey(student,undated),lower:await announcementKey(student,lower),legacy:await announcementKey(student,legacy),escaped:await announcementKey(student,escaped)};
 assert.notEqual(keys.sameA,keys.sameB,'Distinct same-time broadcasts have distinct identities');
 assert.equal(keys.lower,await student.evaluate(()=>notificationHash('announcement:lowercase-announcement-id')),'Lowercase id is authoritative');
 await student.locator('.notification-toggle').click();assert.equal(await student.locator('#notif-list-container [data-notification-key]').count(),6,'The compact list contains only six previews');assert.equal(await card(student,keys.sameA,'#notif-list-container').locator('.notification-preview-body').textContent(),sameA.message,'Compact preview preserves the exact authored eCommerce capitalization');await student.locator('#notification-view-all').click();
 assert.equal(await student.evaluate(()=>document.querySelector('.tab-content.active').id),'notifications');await shown(student,total);assert.equal(await student.evaluate(()=>document.activeElement.id),'notifications-title');
 assert.equal(new Set(await rowKeys(student)).size,total);assert(!(await student.locator('#notification-center-list').textContent()).includes('PRIVATE FOREIGN'));
 const latestKey=await student.evaluate(()=>notificationHash('CASE-REV-LATEST:revision:2026-10-16T03:00:00Z'));
 assert.equal((await rowKeys(student))[0],latestKey,'Maximum valid log time wins over invalid and older final logs');
 assert((await card(student,keys.escaped).textContent()).includes(attack));assert.equal(await student.locator('#notifications img,#notifications script').count(),0);assert.equal(await student.evaluate(()=>window.notificationAttack),undefined);
 assert.match(await card(student,keys.undated).locator('.notification-date').textContent(),/tidak tersedia|unavailable/i);
 assert((await card(student,keys.legacy).textContent()).includes(legacy.Pesan));
 await student.evaluate(()=>renderNotifications());await sync(student);assert.equal(await announcementKey(student,undated),keys.undated);assert.equal(await card(student,keys.undated).count(),1);
 pass('Compact six previews and the full owned snapshot use stable same-time/undated/legacy identities, valid activity ordering and escaped authored text');

 await select(student,'requests');await shown(student,3);await student.fill('#notification-search','  CASE-REV-LATEST  ');await shown(student,1);assert.equal((await rowKeys(student))[0],latestKey);
 await student.locator('#notification-reset').click();await shown(student,total);await select(student,'announcements');await shown(student,announcementCount);await student.fill('#notification-search','Simultan');await shown(student,2);
 await card(student,keys.sameA).locator('[data-notification-action=read]').click();assert(await card(student,keys.sameA).evaluate(node=>node.classList.contains('is-read')));assert(!(await card(student,keys.sameB).evaluate(node=>node.classList.contains('is-read'))),'Reading one timestamp sibling does not read the other');
 await student.locator('#notification-reset').click();await select(student,'unread');await shown(student,total-1);await student.fill('#notification-search','Simultan');await shown(student,1);
 await student.locator('#notification-mark-all').click();await shown(student,0);assert(await student.locator('#notification-mark-all').isDisabled());assert.equal(await student.locator('#notif-badge').isVisible(),false);assert((await student.evaluate(()=>getReadNotificationIds().length))>100,'Mark all retains more than 100 current identities');
 await student.locator('#notification-reset').click();await shown(student,total);assert.equal(await student.locator('#notification-center-list .is-read').count(),total);
 pass('All/unread/request/announcement filters, combined search and per-item read controls agree; Mark All clears every active notification beyond the old 100-item limit');

 await student.fill('#notification-search','  eCommerce 003  ');await shown(student,1);await student.locator('#notification-search').press('End');const caret=await student.locator('#notification-search').evaluate(node=>node.selectionStart);
 await student.evaluate(()=>toggleLanguage());await sync(student);assert.equal(await student.evaluate(()=>document.activeElement.id),'notification-search');assert.equal(await student.inputValue('#notification-search'),'  eCommerce 003  ');assert.equal(await student.locator('#notification-search').evaluate(node=>node.selectionStart),caret);await shown(student,1);assert.equal(await card(student,keys.sameA,'#notif-list-container').locator('.notification-preview-body').textContent(),sameA.message,'Language and sync never title-case authored preview text');
 await student.locator('#notification-reset').click();await select(student,'announcements');await student.locator('#notification-filter').focus();await student.evaluate(()=>toggleLanguage());await sync(student);assert.equal(await student.evaluate(()=>document.activeElement.id),'notification-filter');assert.equal(await student.inputValue('#notification-filter'),'announcements');
 await student.fill('#notification-search','jadwal bimbingan');await shown(student,1);const action=card(student,keys.sameA).locator('[data-notification-action=read]');await action.focus();await student.evaluate(()=>toggleLanguage());await sync(student);assert.equal(await student.inputValue('#notification-filter'),'announcements');assert.equal(await student.evaluate(()=>document.activeElement.closest('[data-notification-key]')?.dataset.notificationKey),keys.sameA);assert.equal(await student.evaluate(()=>document.activeElement.dataset.notificationAction),'read');
 await student.locator('#notification-reset').click();await card(student,keys.sameA).locator('[data-notification-action=open]').click();await student.waitForSelector('#modal-notification-announcement',{state:'visible'});assert.equal(await student.locator('#notification-reader-body').textContent(),sameA.message);await student.locator('#notification-reader-close').click();await student.waitForSelector('#modal-notification-announcement',{state:'hidden'});await student.waitForFunction(key=>document.activeElement?.closest('[data-notification-key]')?.dataset.notificationKey===key,keys.sameA);
 pass('Search caret, filter/read action focus and reader return focus survive language changes and synchronized list replacement');

 for(const width of[320,390,768,1365])for(const lang of['id','en'])for(const dark of[false,true]){
  await mode(student,width,lang,dark);await layout(student,'#notifications',`center ${width}/${lang}/${dark}`);
  await student.locator('.notification-toggle').click();await student.waitForSelector('#notif-dropdown',{state:'visible'});await layout(student,'#notif-dropdown',`preview ${width}/${lang}/${dark}`);await student.keyboard.press('Escape');await student.waitForSelector('#notif-dropdown',{state:'hidden'});
  await card(student,keys.escaped).locator('[data-notification-action=open]').click();await student.waitForSelector('#modal-notification-announcement',{state:'visible'});assert.equal(await student.locator('#notification-reader-body').textContent(),escaped.message);assert.equal(await student.locator('#notification-reader-body img').count(),0);await layout(student,'#modal-notification-announcement',`reader ${width}/${lang}/${dark}`);await student.locator('#notification-reader-close').click();await student.waitForSelector('#modal-notification-announcement',{state:'hidden'});
 }
 pass('Full center, compact preview and long exact announcement reader fit all 16 width/language/theme combinations with 44px actions and no text overflow');

 await mode(student,390,'id',false);await student.evaluate(()=>switchTab(null,'pendaftaran'));await selectService(student,'Pendadaran');await student.fill('#reg-judul','Notifikasi menjaga draf eCommerce O’Connor');
 for(const id of['file-folder-pendadaran'])await student.setInputFiles('#'+id,{name:id+'.pdf',mimeType:'application/pdf',buffer:pdf()});
 await student.evaluate(()=>{window.notificationDraftFiles=['file-folder-pendadaran'].map(id=>({id,input:document.getElementById(id),file:document.getElementById(id).files[0]}));});
 await student.locator('.notification-toggle').click();const compactKey=(await rowKeys(student,'#notif-list-container'))[0],compact=card(student,compactKey,'#notif-list-container').locator('[data-notification-action=open]');
 await student.evaluate(key=>{saveReadNotificationIds(getReadNotificationIds().filter(id=>id!==key));renderNotifications();},latestKey);student.notificationPermit=false;await compact.click();
 assert.equal(await student.evaluate(()=>document.querySelector('.tab-content.active').id),'pendaftaran');assert(!(await student.evaluate(key=>getReadNotificationIds().includes(key),latestKey)),'Denied dirty registration navigation stays unread');
 assert.equal(await student.locator('#modal-case-detail').isVisible(),false);assert.equal(await student.inputValue('#reg-judul'),'Notifikasi menjaga draf eCommerce O’Connor');
 // Opening a broadcast directly from its compact preview is a modal detour,
 // while the underlying request remains the active page with its exact files.
 await student.evaluate(({announcement})=>{const list=JSON.parse(sessionStorage.getItem('ipcos_announcements'));list.push({...announcement,id:'direct-announcement',date:'2099-01-01T00:00:00Z'});sessionStorage.setItem('ipcos_announcements',JSON.stringify(list));renderNotifications();window.directAnnouncementKey=IPCOSNotifications.keyForAnnouncement(list.at(-1));},{announcement:{message:'Pengumuman tepat saat draf belum dikirim.',type:'info'}});
 const directKey=await student.evaluate(()=>window.directAnnouncementKey);await card(student,directKey,'#notif-list-container').locator('[data-notification-action=open]').click();await student.waitForSelector('#modal-notification-announcement',{state:'visible'});
 assert.equal(await student.locator('#notification-reader-body').textContent(),'Pengumuman tepat saat draf belum dikirim.');assert.equal(await student.evaluate(()=>document.querySelector('.tab-content.active').id),'pendaftaran');assert.equal(await student.evaluate(()=>registrationDirty),true);assert(await student.evaluate(()=>notificationDraftFiles.every(({id,input,file})=>document.getElementById(id)===input&&input.files[0]===file)));
 await student.evaluate(()=>toggleLanguage());assert.equal(await student.inputValue('#reg-judul'),'Notifikasi menjaga draf eCommerce O’Connor');assert(await student.evaluate(()=>notificationDraftFiles.every(({id,input,file})=>document.getElementById(id)===input&&input.files[0]===file)));await student.locator('#notification-reader-close').click();await student.waitForSelector('#modal-notification-announcement',{state:'hidden'});await student.waitForFunction(()=>document.activeElement?.classList.contains('notification-toggle'));
 student.notificationPermit=true;await student.evaluate(()=>{registrationDirty=false;switchTab(null,'notifications');});
 await student.evaluate(()=>{saveReadNotificationIds(getReadNotificationIds().filter(id=>id!==notificationHash('CASE-REV-SECOND:revision:2026-10-03T01:00:00Z')));renderNotifications();});
 await student.evaluate(()=>{openCaseDetail('CASE-REV-LATEST');caseDetailAction('reply');});await student.fill('#case-reply-note','Catatan yang belum dikirim.');student.notificationPermit=false;
 const secondKey=await student.evaluate(()=>notificationHash('CASE-REV-SECOND:revision:2026-10-03T01:00:00Z'));assert.equal(await student.evaluate(key=>IPCOSNotifications.open(key),secondKey),false,'A denied dirty case transition reports failure');assert.equal(await student.evaluate(()=>selectedCaseId),'CASE-REV-LATEST');assert(!(await student.evaluate(key=>getReadNotificationIds().includes(key),secondKey)),'A denied case transition stays unread');assert.equal(await student.inputValue('#case-reply-note'),'Catatan yang belum dikirim.');student.notificationPermit=true;await student.evaluate(()=>{cancelCaseAction();closeModal('modal-case-detail',true);});
 pass('A direct announcement keeps dirty registration and exact files intact; denied request/case navigation keeps the notice unread and preserves unsent input');

 await student.evaluate(()=>{registrationDirty=false;switchTab(null,'notifications');});assert.equal(await student.inputValue('#notification-filter'),'all');assert.equal(await student.inputValue('#notification-search'),'');await student.reload();await student.waitForSelector('#welcome-modal',{state:'hidden'});await student.waitForFunction(()=>syncPhase==='success');await student.evaluate(()=>IPCOSNotifications.visit());assert(await card(student,keys.sameA).evaluate(node=>node.classList.contains('is-read')),'Read state survives a page reload in the same account');
 await student.fill('#notification-search','private filter from account A');await select(student,'announcements');const old=gate();nextRead=old;await student.evaluate(()=>{window.notificationOldSync=syncDatabase();});await bounded(old.entered,'The fixture refresh request was not started');await student.evaluate(()=>logoutUser());await student.waitForSelector('#welcome-modal',{state:'visible'});old.release();await student.evaluate(()=>window.notificationOldSync);assert.equal(await student.locator('#notification-center-list').textContent(),'');assert.equal(await student.locator('#notification-reader-body').textContent(),'');assert.equal(await student.inputValue('#notification-search'),'');
 await student.fill('#input-nim','C');await student.locator('#input-nim').press('Enter');await student.waitForSelector('#welcome-modal',{state:'hidden'});await student.waitForFunction(()=>syncPhase==='success');await student.evaluate(()=>IPCOSNotifications.visit());assert.equal(await student.inputValue('#notification-filter'),'all');assert.equal(await student.inputValue('#notification-search'),'');await shown(student,announcementCount);assert(!(await card(student,keys.sameA).evaluate(node=>node.classList.contains('is-read'))),'A new account has its own read state');assert(!(await student.locator('#notification-center-list').textContent()).includes('CASE-REV-LATEST'));
 const admin=await login(browser,'admin');await admin.evaluate(()=>IPCOSNotifications.visit());await select(admin,'requests');await shown(admin,2);assert.deepEqual((await rowKeys(admin)).sort(),await admin.evaluate(()=>[notificationHash('CASE-PENDING:pending:2026-10-05T01:00:00Z'),notificationHash('CASE-ADMIN-CORRECTIONS:resubmitted:2026-10-06T01:00:00Z')].sort()));assert((await admin.locator('#notification-center-list').textContent()).includes('Mahasiswa B'));
 assert.equal(calls.filter(data=>['create','update','revise_request','save_document_review','save_progress','save_academic_progress','manage_student','manage_dosen','post_announcement','update_content'].includes(data.action)).length,0);assert.deepEqual(errors,[]);
 pass('Read state survives refresh and remains account-scoped; late responses after logout cannot restore private content, while admin notices retain their own role-specific scope without academic writes');
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/notifications-ui-results.json',JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(reportFailure);
