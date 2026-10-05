const {chromium} = require('./browser.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const records = [
 {id:'pending',nim:'TEST123',nama:'Mahasiswa Uji',jenis:'Proposal',status:'Pending',date:'2026-10-05T08:00:00Z',detail:'<b>Judul:</b> Proposal Uji',link:'<a href="https://example.com/document.pdf">Form ACC</a>',note:'[]'},
 {id:'revision',nim:'TEST123',nama:'Mahasiswa Uji',jenis:'Pendadaran',status:'Revision',date:'2026-10-04T08:00:00Z',detail:'<b>Judul:</b> Pendadaran Uji',link:'<a href="https://example.com/document.pdf">Berkas Pendadaran</a>',note:JSON.stringify([{role:'admin',sender:'Admin',time:'2026-10-05T09:00:00Z',message:'Unggah berkas yang telah disahkan.'}])},
 {id:'resubmitted',nim:'OTHER456',nama:'Mahasiswa Lain',jenis:'Outline',status:'Resubmitted',date:'2026-10-03T08:00:00Z',detail:'<b>Judul:</b> Outline Uji',link:'<a href="https://example.com/document.pdf">Transkrip</a>',note:'[]'},
 {id:'accepted',nim:'OTHER456',nama:'Mahasiswa Lain',jenis:'Proposal',status:'Accepted',date:'2026-10-02T08:00:00Z',detail:'Selesai',link:'',note:'[]'}
];
const calls=[];let failCreate=false,failUpdate=false;
const errors=[];const checks=[];
function passed(name){checks.push(name); console.log('PASS '+name);}
async function dismissReceipt(page) {
 await page.locator('#modal-submission-receipt button[onclick="goToSubmittedCase()"]').click(); await page.waitForSelector('#modal-submission-receipt',{state:'hidden'});
 await page.locator('.case-close').click(); await page.waitForSelector('#modal-case-detail',{state:'hidden'});
 await page.evaluate(()=>switchTab(null,'pendaftaran'));
}
async function textHas(page,selector,text) {await page.waitForFunction(({selector,text}) => document.querySelector(selector)?.textContent.includes(text),{selector,text});}
(async()=>{
const browser=await chromium.launch({});
const context=await browser.newContext({viewport:{width:1365,height:1000}});
await context.route('**/*',async route=>{
 const url=route.request().url();
 if(url.includes('script.google.com/macros/')) {
  const body=route.request().postDataJSON(); calls.push(body);let result;
  if(body.action==='student_login') result=body.nim==='TEST123'?{status:'success',token:'student-token',nama:'Mahasiswa Uji'}:{status:'error',message:'NIM tidak terdaftar.'};
  else if(body.action==='admin_login') result={status:'success',token:'admin-token'};
  else if(body.action==='get_data') result={status:'success',registrations:structuredClone(body.token==='admin-token'?records:records.filter(r=>r.nim==='TEST123')),students:[],contents:[],announcements:[],dosens:[{Nama:'Dosen Tersedia',Terpakai:1,Maksimal:5},{Nama:'Dosen Penuh',Terpakai:5,Maksimal:5}]};
  else if(body.action==='create') {
   await new Promise(r=>setTimeout(r,200));
   if(failCreate) result={status:'error',message:'Gangguan uji sementara'};
   else {
    const id='created-'+records.length;
    const record={id,date:body.date,nim:'TEST123',nama:'Mahasiswa Uji',jenis:body.jenis,detail:body.detail,status:'Pending',link:body.files.map(f=>`<a href="https://example.com/${encodeURIComponent(f.fileName)}">${f.label}</a>`).join('<br>'),note:'[]'};
    records.push(record);result={status:'success',id,date:body.date};
   }
  } else if(body.action==='update') {
   await new Promise(r=>setTimeout(r,200));
   if(failUpdate) result={status:'error',message:'Gangguan uji sementara'};
   else {
    const record=records.find(r=>r.id===body.id);assert(record);
    record.status=body.status;if(body.dospem)record.dospem=body.dospem;
    const logs=JSON.parse(record.note);logs.push({role:body.token==='admin-token'?'admin':'mhs',sender:body.token==='admin-token'?'Admin':'Mahasiswa Uji',time:new Date().toISOString(),message:body.noteText});record.note=JSON.stringify(logs);
    if(body.files?.length) record.link+='<br>'+body.files.map(f=>`<a href="https://example.com/${encodeURIComponent(f.fileName)}">${f.fileName}</a>`).join('<br>');
    result={status:'success'};
   }
  } else if(body.action==='logout')result={status:'success'};
  else throw Error('Unexpected mutation '+body.action);
  await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)}); return;
 }
 if(url.startsWith('http://127.0.0.1:8766/'))return route.continue();
 if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class {static defaults={font:{}}; static getChart(){return {resize(){}}}; destroy(){}; constructor(){};};'});
 if(url.includes('example.com/'))return route.fulfill({contentType:'text/html',body:'<p>Test document preview</p>'});
 return route.abort();
});
const student=await context.newPage();student.on('pageerror',e=>errors.push('student: '+e.message));
await student.goto('http://127.0.0.1:8766/');await student.fill('#input-nim','TEST123');await student.click('#form-mhs button');await student.waitForSelector('#welcome-modal',{state:'hidden'});
await textHas(student,'#task-home','Perlu perbaikan Anda');assert.equal(await student.locator('#task-home [data-case-id]').first().getAttribute('data-case-id'),'revision');assert(! (await student.locator('#task-home').textContent()).includes('Mahasiswa Lain'));passed('Student task home and scoped revision priority');
await student.setViewportSize({width:390,height:844});await student.waitForFunction(()=>document.querySelector('.main-content').getBoundingClientRect().x===0);await student.screenshot({path:path.join(__dirname, '../test-results','student-home-mobile.png'),fullPage:true,animations:'disabled'});assert(await student.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await student.setViewportSize({width:1365,height:1000});
await student.locator('#task-home button').filter({hasText:'Buat Pengajuan'}).click();
await student.selectOption('#reg-jenis-utama','Proposal');assert(await student.locator('#btn-review-registration').isDisabled());assert((await student.locator('#service-availability').textContent()).includes('Lanjutkan Pengajuan'));passed('Duplicate active request directs student to existing case');records[0].status='Accepted';records[1].status='Accepted';await student.evaluate(()=>syncDatabase());await student.selectOption('#reg-jenis-utama','Proposal');await student.click('#btn-review-registration');await textHas(student,'#reg-judul-error','wajib');await textHas(student,'#file-acc-sempro-error','Pilih');assert.equal(calls.filter(c=>c.action==='create').length,0);
await student.fill('#reg-judul','Proposal Baru');await student.setInputFiles('#file-acc-sempro',{name:'wrong.exe',mimeType:'application/octet-stream',buffer:Buffer.from('wrong')});await textHas(student,'#file-acc-sempro-error','Format');assert.equal(await student.locator('#file-acc-sempro').evaluate(e=>e.files.length),0);
const pdf={name:'bukti.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nTEST DOCUMENT')};
await student.setInputFiles('#file-acc-sempro',pdf);await student.click('#btn-review-registration');await textHas(student,'#registration-review','bukti.pdf');assert(await student.locator('#registration-fields').isHidden());assert.equal(calls.filter(c=>c.action==='create').length,0);passed('Inline validation, invalid file rejection, summary before upload');
await student.click('#btn-edit-registration');assert.equal(await student.inputValue('#reg-judul'),'Proposal Baru');assert.equal(await student.locator('#file-acc-sempro').evaluate(e=>e.files.length),1);await student.click('#btn-review-registration');
failCreate=true;await student.click('#btn-submit-registration');await textHas(student,'#form-submit-status','Gangguan uji');assert.equal(await student.locator('#file-acc-sempro').evaluate(e=>e.files.length),1);assert(await student.locator('#btn-edit-registration').isEnabled());failCreate=false;
await student.locator('#btn-submit-registration').evaluate(button=>{button.click();button.click();});await student.waitForSelector('#modal-submission-receipt',{state:'visible'});await textHas(student,'#submission-receipt-content','Menunggu admin');assert.equal(calls.filter(c=>c.action==='create').length,2);assert.equal(calls.filter(c=>c.action==='create')[0].requestId,calls.filter(c=>c.action==='create')[1].requestId);passed('Send failure preserves files, retry reuses request ID, repeated click sends once');
await dismissReceipt(student);
const types=[['Outline',['file-transkrip','file-proposal']],['Pendadaran',['file-folder-pendadaran']],['Skripsi Jurnal',['file-loa-jurnal','file-draft-jurnal']],['Pergantian Pembimbing',['file-surat-ganti']]];
for(const [type,ids] of types){
 await student.selectOption('#reg-jenis-utama',type);
 if(type==='Pergantian Pembimbing') {await student.fill('#reg-dosen-lama','Dosen A');await student.fill('#reg-dosen-baru',' dosen a ');await student.fill('#reg-alasan-ganti','Perubahan topik');await student.setInputFiles('#file-surat-ganti',pdf);await student.click('#btn-review-registration');await textHas(student,'#reg-dosen-baru-error','berbeda');await student.fill('#reg-dosen-baru','Dosen B');}
 else await student.fill('#reg-judul','Judul '+type);
 for(const id of ids)await student.setInputFiles('#'+id,pdf);
 await student.click('#btn-review-registration');await student.click('#btn-submit-registration');await student.waitForSelector('#modal-submission-receipt',{state:'visible'});
 const sent=calls.filter(c=>c.action==='create').at(-1);assert.equal(sent.jenis,type);assert.equal(sent.files.length,ids.length);assert(sent.files.every(file=>Buffer.from(file.base64,'base64').toString().startsWith('%PDF')));
 await dismissReceipt(student);
}
passed('All five registration types submit expected fields and file payloads');
records[0].status='Pending';
const admin=await context.newPage();admin.on('pageerror',e=>errors.push('admin: '+e.message));await admin.goto('http://127.0.0.1:8766/');await admin.click('#tab-admin');await admin.fill('#input-admin-user','fixture-admin');await admin.fill('#input-admin-pass','fixture-password');await admin.click('#form-admin button');await admin.waitForSelector('#welcome-modal',{state:'hidden'});await textHas(admin,'#task-home','Antrean kerja Anda');assert.equal(await admin.locator('#task-home [data-case-id]').first().getAttribute('data-case-id'),'resubmitted');
await admin.locator('#task-home button').filter({hasText:'Buka Antrean'}).click();assert(await admin.locator('.data-management').evaluate(e=>!e.open));assert.equal(await admin.locator('#table-admin-reg .btn-acc').count(),0);passed('Admin task queue prioritizes resubmissions; data management stays collapsed');
await admin.locator('#table-admin-reg [data-case-id="pending"]').click();await admin.locator('#modal-case-detail button').filter({hasText:'Minta Revisi'}).click();await admin.click('#btn-case-submit');await textHas(admin,'#case-action-feedback','Pilih minimal');await admin.check('[name="revision-document"][value="Form ACC Seminar Proposal"]');await admin.fill('#case-revision-note','Unggah dokumen yang disahkan. <img src=x onerror=alert(1)>');await admin.click('#btn-case-submit');await textHas(admin,'#case-detail-content','Menunggu mahasiswa');assert(await admin.locator('#modal-case-detail').isVisible());assert(await admin.locator('#modal-revision').isHidden());assert.equal(await admin.locator('#case-detail-content img').count(),0);passed('Admin sends structured correction instructions within the case; user text is escaped');
await student.reload();await student.waitForSelector('#welcome-modal',{state:'hidden'});await textHas(student,'#task-home','Proposal');await student.locator('#task-home [data-case-id="pending"]').click();await textHas(student,'.revision-instructions','Form ACC Seminar Proposal');await student.locator('#modal-case-detail button').filter({hasText:'Upload Perbaikan'}).click();await student.click('#btn-case-submit');await textHas(student,'#case-action-feedback','Konfirmasi semua');await student.check('[name="correction-complete"]');
await student.setInputFiles('#case-reply-files',[pdf]);await student.fill('#case-reply-note','Dokumen sudah disahkan');failUpdate=true;await student.click('#btn-case-submit');await textHas(student,'#case-action-feedback','tetap tersedia');assert.equal(await student.inputValue('#case-reply-note'),'Dokumen sudah disahkan');assert.equal(await student.locator('#case-reply-files').evaluate(e=>e.files.length),1);failUpdate=false;
await student.locator('#btn-case-submit').evaluate(button=>{button.click();button.click();});await textHas(student,'#case-detail-content','Perbaikan menunggu admin');assert.equal(calls.filter(c=>c.action==='update'&&c.status==='Resubmitted').length,2);assert.equal(calls.filter(c=>c.action==='update'&&c.status==='Resubmitted').at(-1).files.length,1);passed('Student associates revised document, retains input after failure, and resubmits once');
await student.setViewportSize({width:390,height:844});await student.screenshot({path:path.join(__dirname, '../test-results','student-case-mobile.png'),fullPage:true,animations:'disabled'});assert(await student.locator('#modal-case-detail .case-detail-card').evaluate(e=>e.scrollWidth<=e.clientWidth));await student.locator('.case-close').click();await student.waitForSelector('#modal-case-detail',{state:'hidden'});
await admin.reload();await admin.waitForSelector('#welcome-modal',{state:'hidden'});await textHas(admin,'#task-home','Antrean');await admin.locator('#task-home [data-case-id="pending"]').click();await admin.locator('#modal-case-detail button').filter({hasText:'Terima Pengajuan'}).click();await admin.click('#btn-case-submit');await textHas(admin,'#case-detail-content .status-badge','Selesai');assert(await admin.locator('#modal-case-detail').isVisible());await admin.locator('.case-close').click();await admin.waitForSelector('#modal-case-detail',{state:'hidden'});
await admin.locator('#task-home [data-case-id="resubmitted"]').click();await admin.locator('#modal-case-detail button').filter({hasText:'Tunjuk Dosen'}).click();assert(await admin.locator('#case-supervisor option[value="Dosen Penuh"]').isDisabled());await admin.selectOption('#case-supervisor','Dosen Tersedia');await admin.click('#btn-case-submit');await textHas(admin,'#case-detail-content .status-badge','Selesai');await textHas(admin,'#case-detail-content','Dosen Tersedia');assert.equal(records.find(r=>r.id==='resubmitted').dospem,'Dosen Tersedia');passed('Approval and supervisor assignment stay in case detail; full supervisors are disabled');
await admin.locator('.case-close').click();await admin.waitForSelector('#modal-case-detail',{state:'hidden'});await admin.locator('#task-home button').filter({hasText:'Buka Antrean'}).click();await admin.fill('#admin-search-input','not-existing');await textHas(admin,'#table-admin-reg','Tidak ada data');await admin.fill('#admin-search-input','');await textHas(admin,'#table-admin-reg','Mahasiswa Uji');
await admin.setViewportSize({width:390,height:844});await admin.waitForFunction(()=>document.querySelector('.main-content').getBoundingClientRect().x===0);await admin.screenshot({path:path.join(__dirname, '../test-results','admin-queue-mobile.png'),fullPage:true,animations:'disabled'});assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));passed('Search and mobile queue layout have no horizontal page overflow');
await student.setViewportSize({width:1365,height:1000});await student.evaluate(()=>syncDatabase());await student.click('#lang-btn');await textHas(student,'#task-home','Your requests');await student.evaluate(()=>switchTab(null,'student-status'));await textHas(student,'#table-my-status','Completed');passed('Status display translates while backend status values are preserved');
student.on('dialog',dialog=>dialog.accept());await student.click('.btn-logout');await student.waitForSelector('#welcome-modal',{state:'visible'});assert.equal(await student.locator('#task-home').textContent(),'');assert.equal(await student.evaluate(()=>sessionStorage.getItem('ipcos_registrations')),null);passed('Logout clears private task and registration views');
assert.deepEqual(errors,[]);passed('No JavaScript runtime errors in both roles');
require('node:fs').writeFileSync(path.join(__dirname, '../test-results','transactions-results.json'),JSON.stringify({checks,errors,createRequests:calls.filter(c=>c.action==='create').length,updateRequests:calls.filter(c=>c.action==='update').length},null,2));
await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
