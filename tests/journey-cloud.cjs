const {chromium}=require('./browser.cjs'),assert=require('node:assert/strict');
const {pdf,zip}=require('./fixtures.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
async function verifyCloudAcknowledgements(){
    const source=fs.readFileSync(path.join(__dirname,'../journey.js'),'utf8');
    function fixture(){
        const local=new Map(),session=new Map(),timers=new Map(),calls=[],nodes=new Map([['academic-journey-content',{textContent:''}]]);let nextTimer=0,renders=0,reads=0,resets=0;
        const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
        const context=vm.createContext({currentUser:{role:'mhs',nim:'A'},sessionEpoch:1,isOffline:false,GAS_URL:'fixture',
            localStorage:storage(local),sessionStorage:storage(session),document:{getElementById:id=>nodes.get(id)||null},
            window:{IPCOSPreparation:{reset:()=>resets++}},uxText:value=>value,
            readStoredJSON:(store,key,fallback)=>{try{return JSON.parse(store.getItem(key))||fallback;}catch(_){return fallback;}},
            getChecklistData:type=>[{items:(type==='magang'?['m1','m2']:['s1']).map(id=>({id}))}],
            setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),
            renderAcademicJourney:()=>renders++,renderAcademicStages:()=>renders++,loadProgressData:()=>renders++,updateProgress:()=>{},
            syncDatabase:async()=>{reads++;},apiPostSuccess:async(url,options)=>{const data=JSON.parse(options.body);calls.push(data);return context.response(data);}});
        vm.runInContext(source.slice(source.indexOf('let journeyCloud ='),source.indexOf('function journeyRecords('))+';globalThis.probe={state:()=>journeyCloud,preparation:journeyPreparationState,apply:applyJourneySnapshot,change:recordPreparationChange,save:saveJourneyProgress,reset:resetAcademicJourney,text:journeySyncText};',context);
        context.response=()=>{throw Error('An acknowledgement fixture was not provided');};
        return{context,api:context.probe,local,session,timers,calls,nodes,renderCount:()=>renders,readCount:()=>reads,resetCount:()=>resets};
    }
    const saved=(checks={},revision=1,exists=true)=>({exists,checks,revision,updatedAt:'2026-10-17T01:00:00Z'});
    const initial=fixture();initial.local.set('progress_A',JSON.stringify({m1:true}));initial.api.apply({journeySupported:true,journeyUnavailable:true});
    assert.equal(initial.api.state().supported,true);assert.equal(initial.api.state().available,false);assert.equal(initial.api.state().unavailable,true);assert.equal(initial.api.state().error,true);assert.match(initial.api.text(),/cloud belum dapat dimuat/);
    const blocked={id:'m1',checked:true};initial.api.change(blocked);assert.equal(blocked.checked,false);assert.equal(Object.keys(initial.api.state().pending).length,0);assert(initial.local.has('progress_A'));
    await initial.api.save();assert.equal(initial.readCount(),1);assert.equal(initial.calls.length,0,'Retry an unavailable snapshot reads before attempting to write');
    initial.api.apply({journeySupported:true,journey:saved({m2:true})});assert.equal(initial.api.state().available,true);assert.equal(initial.api.state().unavailable,false);assert.equal(initial.api.state().error,false);assert.equal(initial.api.state().checks.m2,true);assert.equal(Object.keys(initial.api.state().pending).length,0,'A recovered existing cloud record wins over stale device preparation');
    initial.api.apply({journeySupported:true,journey:saved({m2:'true'},2)});assert.equal(initial.api.state().unavailable,true);assert.equal(initial.api.state().checks.m2,true,'An invalid read retains the last confirmed state without enabling edits');
    assert(initial.renderCount()>=4,'Every unavailable/recovery transition refreshes visible preparation state');
    console.log('PASS Unavailable or malformed cloud reads stay distinct from device storage, block fallback edits and recover through a read retry');

    const migration=fixture(),futureActionId='prep-magang-preparation-magang-id-m1-sop';migration.nodes.set('m1',{tagName:'INPUT',type:'checkbox',matches:()=>true});migration.nodes.set('prep-magang-search',{tagName:'INPUT',type:'search',matches:()=>false});migration.local.set('progress_A',JSON.stringify({m1:true,duplicate:true,invalid:true,'prep-magang-search':true,[futureActionId]:true}));migration.api.apply({journeySupported:true,journey:saved({},0,false),contents:[{Tipe:'magang',DataJSON:JSON.stringify([{items:[{id:futureActionId},{id:'m1'},{id:'duplicate'},{id:'inva!lid'},{id:'prep-magang-search'}]}])},{Tipe:'skripsi',DataJSON:JSON.stringify([{items:[{id:'duplicate'}]}])}]});
    assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(migration.api.state().pending))),['m1'],'Migration only writes canonical IDs that are unique across both preparation lists');
    console.log('PASS Legacy migration excludes duplicate, invalid and reserved DOM IDs while keeping actual canonical checkbox IDs');

    const localFailure=fixture();localFailure.local.set('progress_A',JSON.stringify({m2:true}));localFailure.api.state().localChecks={m1:true};localFailure.api.state().localError=true;assert.equal(localFailure.api.preparation().m1,true);assert.equal(localFailure.api.preparation().m2,undefined);assert.match(localFailure.api.text(),/belum tersimpan di perangkat/);let localRetries=0;localFailure.context.updateProgress=()=>{localRetries++;localFailure.api.state().localError=false;};await localFailure.api.save();assert.equal(localRetries,1);assert.equal(localFailure.calls.length,0,'A device-storage retry does not create a cloud mutation');localFailure.api.reset();assert.equal(localFailure.api.state().localChecks,undefined);assert.equal(localFailure.api.state().localError,undefined);
    console.log('PASS Failed device storage retains in-tab choices, reports the unsaved state and retries local persistence without a backend write');

    const malformed=[{exists:true,revision:5},{...saved({},5)},{...saved({m1:true},5)},{...saved({m1:false},4)},{...saved({m1:false},5,false)},{...saved({m1:false,other:'yes'},5)}];
    for(const acknowledgement of malformed){const test=fixture();test.api.apply({journeySupported:true,journey:saved({m1:true},4)});test.api.change({id:'m1',checked:false});test.local.set('progress_A','keep until confirmed');test.context.response=()=>({journey:acknowledgement});await test.api.save();assert.equal(test.api.state().pending.m1.value,false);assert.equal(test.api.state().checks.m1,true);assert.equal(test.api.state().error,true);assert.equal(test.api.state().saving,false);assert.equal(test.api.state().unavailable,false);assert(test.local.has('progress_A'));assert.equal(test.timers.size,0,'An already queued autosave cannot silently retry an invalid acknowledgement');}
    console.log('PASS Missing, mismatched and stale acknowledgements retain an unchecked false change, confirmed state and explicit retry without clearing device recovery');

    const concurrent=fixture();concurrent.api.apply({journeySupported:true,journey:saved({m1:true},1)});concurrent.api.change({id:'m1',checked:false});let release;concurrent.context.response=()=>new Promise(resolve=>release=resolve);const firstSave=concurrent.api.save();assert.equal(concurrent.api.state().saving,true);concurrent.api.change({id:'m1',checked:true});release({journey:saved({m1:false},2)});await firstSave;assert.equal(concurrent.api.state().checks.m1,false);assert.equal(concurrent.api.state().pending.m1.value,true,'An older valid acknowledgement cannot clear the newer checkbox generation');concurrent.context.response=()=>({journey:saved({m1:true},3)});await concurrent.api.save();assert.equal(Object.keys(concurrent.api.state().pending).length,0);assert.equal(concurrent.api.state().checks.m1,true);assert.equal(concurrent.api.state().error,false);
    concurrent.api.change({id:'m2',checked:true});concurrent.context.isOffline=true;const savesBefore=concurrent.calls.length;await concurrent.api.save();assert.equal(concurrent.calls.length,savesBefore);assert.equal(concurrent.api.state().pending.m2.value,true);assert.equal(concurrent.api.state().error,true);
    concurrent.context.isOffline=false;concurrent.context.response=()=>new Promise(resolve=>release=resolve);const lateSave=concurrent.api.save();concurrent.api.reset();concurrent.context.sessionEpoch++;release({journey:saved({m1:true,m2:true},4)});await lateSave;assert.equal(concurrent.api.state().supported,false);assert.equal(Object.keys(concurrent.api.state().pending).length,0);assert.equal(Object.keys(concurrent.api.state().checks).length,0);assert.equal(concurrent.resetCount(),1);assert.equal(concurrent.session.has('ipcos_progress_pending'),false);
    console.log('PASS Checkbox generations, offline retry and logout preserve latest intent while a late acknowledgement cannot restore old account state');
}
(async()=>{
    await verifyCloudAcknowledgements();
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
            if(url.startsWith(origin)) return route.continue();
            return route.abort();
        });
        const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
        await page.goto(origin);
        if(nim==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','test');await page.fill('#input-admin-pass','test');await page.locator('#input-admin-pass').press('Enter');}
        else{await page.fill('#input-nim',nim);await page.locator('#input-nim').press('Enter');}
        await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success');return page;
    }
    async function saved(page){await page.waitForFunction(()=>!journeyCloud.saving && !Object.keys(journeyCloud.pending).length && !journeyCloud.error);}
    const a=await newPage('A',{m1:true});await saved(a);assert.equal(cloud.get('A').checks.m1,true);
    await a.evaluate(()=>switchTab(null,'academic-journey'));
    assert((await a.locator('#academic-journey-content').textContent()).includes('Berkas disetujui admin'));
    assert(!(await a.locator('#academic-journey-content').textContent()).includes('PRIVAT MAHASISWA LAIN'));
    assert.equal(await a.locator('#academic-journey .journey-history-item').count(),0);
    await a.locator('#academic-journey [data-journey-status]').click();
    assert.equal(await a.locator('#table-my-status [data-case-id]').count(),2);
    assert.equal(await a.locator('#table-my-status [data-case-id="other"]').count(),0);
    await a.evaluate(()=>switchTab(null,'academic-journey'));
    console.log('PASS Unified journey shows own stages, links to complete owned request history and separates admin verification from self-reported preparation');
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
    await admin.locator('#journey-admin-history summary').click();
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
