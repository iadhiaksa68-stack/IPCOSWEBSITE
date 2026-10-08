const {chromium}=require('./browser.cjs'),assert=require('node:assert/strict');
const {pdf,zip}=require('./fixtures.cjs');
(async()=>{
    const browser=await chromium.launch(),cloud=new Map(),calls=[],errors=[];
    let failSave=false,holdSave=false,saveRelease,holdRead=false,readRelease;
    const records=[
        {id:'outline',nim:'A',nama:'Mahasiswa Uji',jenis:'Outline',status:'Accepted',date:'2026-10-01',detail:'Judul pertama',link:'',note:'[]'},
        {id:'proposal',nim:'A',nama:'Mahasiswa Uji',jenis:'Proposal',status:'Revision',date:'2026-10-02',detail:'Judul uji',link:'',note:'[]'},
        {id:'other',nim:'B',nama:'Mahasiswa Lain',jenis:'Pendadaran',status:'Pending',date:'2026-10-03',detail:'PRIVAT MAHASISWA LAIN',link:'',note:'[]'}
    ];
    const empty=()=>({exists:false,checks:{},revision:0,updatedAt:''});
    const contexts=[];
    async function newPage(nim,legacy={}) {
        const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1365,height:1000}});contexts.push(context);
        await context.addInitScript(({nim,legacy})=>{localStorage.setItem('progress_'+nim,JSON.stringify(legacy));},{nim,legacy});
        await context.route('**/*',async route=>{
            const url=route.request().url();
            if (url.includes('script.google.com/macros/')) {
                const data=route.request().postDataJSON();if(await require('./next-mock.cjs')(route,data))return;calls.push(data);let result;
                const owner=data.token?.replace('student-','');
                if(data.action==='student_login') result={status:'success',nama:'Mahasiswa Uji',token:'student-'+data.nim};
                else if(data.action==='admin_login') result={status:'success',token:'admin'};
                else if(data.action==='get_data') {
                    result={status:'success',journeySupported:true,journey:structuredClone(cloud.get(owner)||empty()),registrations:structuredClone(data.token==='admin'?records:records.filter(r=>r.nim===owner)),students:[],contents:[],dosens:[],announcements:[]};
                    if(holdRead){holdRead=false;await new Promise(resolve=>readRelease=resolve);}
                } else if(data.action==='save_progress') {
                    assert(!data.nim,'The student owner must come from the server session');
                    if(holdSave){holdSave=false;await new Promise(resolve=>saveRelease=resolve);}
                    if(failSave) result={status:'error',message:'Gangguan penyimpanan uji'};
                    else {const prior=cloud.get(owner)||empty();const next={exists:true,checks:{...prior.checks,...data.changes},revision:prior.revision+1,updatedAt:new Date().toISOString()};cloud.set(owner,next);result={status:'success',journey:structuredClone(next)};}
                } else if(data.action==='get_journey') {assert.equal(data.token,'admin');result={status:'success',journey:structuredClone(cloud.get(data.nim)||empty())};}
                else if(data.action==='logout') result={status:'success'};
                else throw Error('Unexpected mutation '+data.action);
                return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
            }
            if(url.startsWith('http://127.0.0.1:8766')) return route.continue();
            return route.abort();
        });
        const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
        await page.goto('http://127.0.0.1:8766');
        if(nim==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','test');await page.fill('#input-admin-pass','test');await page.locator('#input-admin-pass').press('Enter');}
        else{await page.fill('#input-nim',nim);await page.locator('#input-nim').press('Enter');}
        await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success');return page;
    }
    async function saved(page){await page.waitForFunction(()=>!journeyCloud.saving && !Object.keys(journeyCloud.pending).length && !journeyCloud.error);}
    const a=await newPage('A',{m1:true});await saved(a);assert.equal(cloud.get('A').checks.m1,true);
    await a.evaluate(()=>switchTab(null,'academic-journey'));
    assert((await a.locator('#academic-journey-content').textContent()).includes('Berkas disetujui admin'));
    assert(!(await a.locator('#academic-journey-content').textContent()).includes('PRIVAT MAHASISWA LAIN'));
    assert.equal(await a.locator('#academic-journey .journey-history-item').count(),2);
    console.log('PASS Unified journey shows own stages, all request history and separates admin verification from self-reported preparation');
    console.log('PASS Existing preparation migrates once to cloud without changing official status');
    const a2=await newPage('A',{m2:true});await a2.bringToFront();await a2.evaluate(()=>switchTab(null,'magang'));
    assert(await a2.isChecked('#m1'));assert(!(await a2.isChecked('#m2')));
    await a2.check('#m3');await saved(a2);await a.bringToFront();await a.evaluate(()=>syncDatabase());await a.waitForFunction(()=>syncPhase==='success');await a.evaluate(()=>switchTab(null,'magang'));assert(await a.isChecked('#m3'));
    console.log('PASS Independent device sessions share cloud preparation; stale local data cannot overwrite saved progress');
    holdSave=true;await a.uncheck('#m1');await a.waitForFunction(()=>journeyCloud.saving);await a.check('#m1');saveRelease();await saved(a);assert.equal(cloud.get('A').checks.m1,true);
    console.log('PASS Rapid checkbox changes during saving retain the most recent user choice');
    holdRead=true;await a.evaluate(()=>{silentSyncDatabase();});await a.waitForFunction(()=>syncPhase==='syncing');
    await a.uncheck('#m1');await saved(a);readRelease();await a.waitForFunction(()=>syncPhase==='success');assert(!(await a.isChecked('#m1')));
    console.log('PASS Older in-flight database snapshots cannot roll back newly saved cloud progress');
    failSave=true;await a.check('#m2');await a.waitForFunction(()=>journeyCloud.error);await a.evaluate(()=>switchTab(null,'academic-journey'));
    assert((await a.locator('.journey-cloud-status').textContent()).includes('belum tersimpan'));assert.equal(cloud.get('A').checks.m2,undefined);
    failSave=false;await a.click('[data-retry-progress]');await saved(a);assert.equal(cloud.get('A').checks.m2,true);
    console.log('PASS Failed saves remain visibly unconfirmed and retry preserves preparation without duplicate transactions');
    await a.evaluate(()=>switchTab(null,'pendaftaran'));await a.selectOption('#reg-jenis-utama','Pendadaran');await a.fill('#reg-judul','Judul uji');
    await a.setInputFiles('#file-folder-pendadaran',{name:'renamed.pdf',mimeType:'application/pdf',buffer:Buffer.from('ordinary text')});await a.click('#btn-review-registration');
    assert(await a.locator('#registration-fields').isVisible());assert((await a.locator('#file-folder-pendadaran-error').textContent()).includes('tidak sesuai'));
    await a.setInputFiles('#file-folder-pendadaran',{name:'cut.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\ntruncated')});await a.click('#btn-review-registration');assert((await a.locator('#file-folder-pendadaran-error').textContent()).includes('belum lengkap'));
    console.log('PASS Renamed files and interrupted PDFs cannot pass review or reach submission');
    await a.setInputFiles('#file-folder-pendadaran',{name:'documents.zip',mimeType:'application/zip',buffer:zip(['document.pdf'])});await a.click('#btn-review-registration');assert(await a.locator('#registration-review').isVisible());assert((await a.locator('#registration-review .preflight-warning').textContent()).includes('arsip'));await a.click('#btn-edit-registration');
    await a.selectOption('#reg-jenis-utama','Outline');await a.setInputFiles('#file-transkrip',{name:'trans.pdf',mimeType:'application/pdf',buffer:pdf()});await a.setInputFiles('#file-proposal',{name:'draft.pdf',mimeType:'application/pdf',buffer:pdf()});
    await a.evaluate(()=>inspectRegistrationDocuments());await a.evaluate(()=>renderRegistrationReadiness());assert((await a.locator('#registration-readiness .preflight-warning').textContent()).includes('berkas yang sama'));
    await a.setInputFiles('#file-proposal',{name:'draft.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:zip(['other.txt'])});await a.evaluate(()=>inspectRegistrationDocuments());assert((await a.locator('#file-proposal-error').textContent()).includes('tidak sesuai'));
    console.log('PASS Complete archives remain supported; repeated files are flagged and fake DOCX containers rejected');
    const b=await newPage('B');await b.bringToFront();await b.evaluate(()=>switchTab(null,'academic-journey'));assert(!(await b.locator('#academic-journey-content').textContent()).includes('Judul pertama'));await b.evaluate(()=>switchTab(null,'magang'));assert(!(await b.isChecked('#m3')));
    console.log('PASS Student preparation and academic history remain isolated between accounts');
    const admin=await newPage('admin');await admin.bringToFront();await admin.evaluate(()=>openCaseDetail('proposal'));await admin.click('[data-open-journey="A"]');await admin.waitForFunction(()=>adminJourneyProgress?.checks.m3===true);
    assert.equal(await admin.locator('#academic-journey input[type="checkbox"]').count(),0);assert((await admin.locator('#academic-journey-content').textContent()).includes('Admin tidak mengubah'));
    await admin.locator('#academic-journey [data-case-id="proposal"]').last().click();assert(await admin.locator('#modal-case-detail').isVisible());
    console.log('PASS Admin opens student context, reads cloud preparation without editing it and returns to the same request');
    await admin.click('[data-open-journey="A"]');await admin.waitForFunction(()=>adminJourneyProgress!==null);
    for(const width of [320,390,768,1365]){await admin.setViewportSize({width,height:1000});for(const dark of [false,true]){await admin.evaluate(dark=>document.body.classList.toggle('dark-mode',dark),dark);assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await admin.evaluate(()=>[...document.querySelectorAll('.journey-history-item>div strong')].every(el=>el.getBoundingClientRect().height<50)),'History labels must remain readable, not one letter per line');}}
    await a.bringToFront();await a.setViewportSize({width:1365,height:1000});await a.evaluate(()=>{registrationDirty=false;switchTab(null,'academic-journey');document.getAnimations().forEach(animation=>animation.finish());});await a.screenshot({path:'test-results/journey-cloud-desktop.png',fullPage:true});
    await a.setViewportSize({width:390,height:844});await a.screenshot({path:'test-results/journey-cloud-mobile.png',fullPage:true});
    console.log('PASS Journey layouts fit mobile, tablet and desktop in light and dark modes');
    holdSave=true;await a.evaluate(()=>switchTab(null,'magang'));await a.check('#m4');await a.waitForFunction(()=>journeyCloud.saving);await a.evaluate(()=>logoutUser());await a.waitForSelector('#welcome-modal',{state:'visible'});saveRelease();
    assert.equal(await a.locator('#academic-journey-content').textContent(),'');assert.equal(await a.evaluate(()=>Object.keys(journeyCloud.pending).length),0);
    assert.equal(calls.filter(data=>['create','update'].includes(data.action)).length,0);
    assert.deepEqual(errors,[]);
    console.log('PASS Late progress responses after logout cannot restore private content; no live or mock academic records were modified');
    await browser.close();
})().catch(require('./browser.cjs').reportFailure);
