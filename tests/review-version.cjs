const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {chromium,reportFailure}=require('./browser.cjs'),fixture=require('./next-backend.fixture.cjs');
const origin=process.env.IPCOS_TEST_ORIGIN||'http://127.0.0.1:8766',f=fixture(),calls=[],errors=[];
const link='https://drive.google.com/file/d/review-fixture/view';
f.rows[1][7]='Resubmitted';f.rows[1][5]="<b>Judul:</b> Judul uji<br><br><b style='color:#E03F4F;'>Dosen Pembimbing:</b> Supervisor";f.rows[1][6]=`<a href="${link}">Form ACC Seminar Proposal</a>`;f.rows[1][8]=JSON.stringify([{role:'mhs',message:'Revised file',documents:[{url:link,label:'Form ACC Seminar Proposal',fileName:'form.pdf',version:1}]}]);
Object.assign(f.ctx,{SHEET_MAHASISWA:'Mahasiswa',SHEET_PENGUMUMAN:'Pengumuman',SHEET_KONTEN:'KontenWeb',journeySnapshot:()=>({}),featureBackupStatus:()=>null});
vm.runInContext(fs.readFileSync('backend/SessionData.gs','utf8'),f.ctx);
async function mock(context){await context.route('**/*',async route=>{
 const target=route.request().url();if(target.includes('script.google.com/macros/')){
  const data=route.request().postDataJSON();calls.push(data);let result;
  try{
   if(data.action==='admin_login')result={status:'success',token:'admin'};
   else if(data.action==='student_login')result={status:'success',token:'student-A',nama:'Student Test'};
   else if(data.action==='get_data')result={...f.ctx.getDataForSession(f.ctx.getSession(data.token)),students:[],dosens:[],contents:[],announcements:[]};
   else if(['get_review_capabilities','get_document_review','save_document_review'].includes(data.action))result=f.ctx.nextDispatch(data);
   else if(data.action==='update')result=f.ctx.handleUpdate({...data,senderRole:f.ctx.getSession(data.token).role,senderName:'Admin Test'});
   else if(data.action==='logout')result={status:'success'};
   else if(await require('./next-mock.cjs')(route,data))return;
   else throw Error('Unexpected action '+data.action);
  }catch(error){result={status:'error',message:error.message};}
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 }
 if(target.startsWith(origin))return route.continue();if(target.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){};constructor(){}};'});return route.abort();
});}
async function login(browser,admin=true){const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});await mock(context);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.goto(origin);if(admin){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}else{await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');}await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success'&&window.IPCOSReviewTools.supported()===true);return page;}
(async()=>{
 const browser=await chromium.launch(),admin=await login(browser);await admin.evaluate(()=>openCaseDetail('fields'));
 const displayed=await admin.evaluate(()=>currentCase());assert.equal(displayed.detail,'<b>Judul:</b> Judul uji');assert.equal(displayed.reviewVersion,f.ctx.nextRevisionVersion(f.records()[0]));
 await admin.selectOption('[data-review-status="0"]','revision');await admin.fill('[data-review-note="0"]','Please upload the signed document.');await admin.click('#case-detail-actions .btn-secondary');await admin.fill('#case-revision-note','Upload the signed form and payment receipt.');await admin.click('#btn-case-submit');await admin.waitForFunction(()=>currentCase()?.status==='Revision');
 assert.equal(f.rows[1][7],'Revision');assert.equal(JSON.parse(f.rows[1][8]).filter(log=>log.kind==='document_review').length,1);assert(JSON.parse(f.rows[1][8]).at(-1).message.includes('Upload the signed form and payment receipt.'));assert.equal(calls.filter(call=>call.action==='update').length,1);console.log('PASS Real session formatting, per-file save and correction request complete without a false version conflict');
 const student=await login(browser,false);await student.evaluate(()=>openCaseDetail('fields'));assert((await student.locator('#case-detail-content').textContent()).includes('Upload the signed form and payment receipt.'));assert.equal(await student.locator('[data-save-document-review]').count(),0);assert.equal(await student.locator('[data-review-note]').count(),0);assert((await student.locator('#document-review-tools').textContent()).includes('Please upload the signed document.'));console.log('PASS Student receives the confirmed revision instruction and file comment with read-only review access');
 assert.deepEqual(errors,[]);await admin.screenshot({path:'test-results/review-version-admin.png'});fs.writeFileSync('test-results/review-version.json',JSON.stringify({errors,updates:1,status:f.rows[1][7]},null,2));await browser.close();
})().catch(reportFailure);
