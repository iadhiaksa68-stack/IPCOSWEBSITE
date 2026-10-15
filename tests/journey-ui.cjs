const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, reportFailure} = require('./browser.cjs');
const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const calls = [], errors = [], checks = [];
const pass = label => { checks.push(label); console.log('PASS '+label); };
const name = 'Mahasiswa Internasional Pengujian O’Connor dengan nama lengkap yang harus tetap terbaca pada layar ponsel';
const title = 'eCommerce dan partisipasi mahasiswa internasional — '+ 'Komunikasi digital dan penelitian lintas budaya '.repeat(5);
const record = (id,type,status,date,times=[],nim='A') => ({id,nim,nama:nim.trim()==='A'?name:'FOREIGN PRIVATE NAME',jenis:type,status,date,detail:'<b>Judul:</b> '+(nim.trim()==='A'?title:'FOREIGN PRIVATE TITLE'),link:'',note:JSON.stringify(times.map(time=>({role:'admin',sender:'Admin Uji',time,message:'Perbaiki halaman bertanda tangan. Pertahankan eCommerce dan nama lengkap mahasiswa.'})))});
const baseline = [
    record('J-ACCEPTED','Outline','Accepted','2026-10-01T01:00:00Z'),
    record('J-REV-OLDER','Proposal','Revision','2026-10-13T01:00:00Z',['2026-10-14T01:00:00Z']),
    record('J-REV-LATEST','Proposal',' ReViSiOn ','2026-10-12T01:00:00Z',['2026-10-16T01:00:00Z','invalid-activity','2026-10-11T01:00:00Z'],' A '),
    record('J-PENDING','Pendadaran','Pending','2026-10-15T01:00:00Z'),
    record('J-FOREIGN','Proposal','Revision','2027-01-01T01:00:00Z',[],'B')
];
let records=structuredClone(baseline),academic={exists:true,level:1,revision:2,updatedAt:'2026-10-15T01:00:00Z',events:[]};
let supported=true,unavailable=false,academicByNim=null,nextRead=null,nextPreparationRead=null,failRead=false;
const preparation={exists:true,checks:{m1:true,s1:true},revision:1,updatedAt:'2026-10-15T01:00:00Z'};
const contents=[{Tipe:'magang',DataJSON:JSON.stringify([{title:'Persiapan magang lintas negara dengan ketentuan akademik yang perlu dibaca secara lengkap',items:[{id:'m1',text:'Siapkan persyaratan internasional',sub:''},{id:'m2',text:'Periksa kelengkapan dokumen',sub:''}]}])}];
function gate(){let enter,release;return {entered:new Promise(resolve=>enter=resolve),wait:new Promise(resolve=>release=resolve),enter:()=>enter(),release:()=>release()};}
function snapshot(token){
    const data={status:'success',registrations:structuredClone(records),students:[],dosens:[],announcements:[],contents:structuredClone(contents),services:[],journeySupported:true,journey:structuredClone(preparation)};
    if(supported){data.academicSupported=true;if(unavailable)data.academicUnavailable=true;else if(academic)data.academic=structuredClone(academic);if(token==='admin')data.academicByNim=structuredClone(academicByNim||{A:academic,B:{exists:true,level:3,revision:1,events:[]}});}
    return data;
}
async function mode(page,width,lang,dark){await page.setViewportSize({width,height:900});await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();if(document.body.classList.contains('dark-mode')!==dark)toggleDarkMode();},{lang,dark});}
async function map(page,expected){assert.deepEqual(await page.locator('#journey-academic-map li[data-journey-stage]').evaluateAll(nodes=>nodes.map(node=>({stage:node.dataset.journeyStage,state:node.dataset.stageState,complete:node.classList.contains('is-complete'),current:node.getAttribute('aria-current')==='step'}))),['Outline','Proposal','Pendadaran'].map((stage,index)=>({stage,state:expected[index],complete:expected[index]==='complete',current:expected[index]==='next'})));}
async function hero(page,action,id){const button=page.locator('#journey-next-action [data-journey-action]');assert.equal(await button.count(),1,'The hero has exactly one primary next action');assert.equal(await button.getAttribute('data-journey-action'),action);if(id)assert.equal(await button.getAttribute(action==='case'?'data-case-id':'data-start-service'),id);return button;}
async function layout(page,label){
    const result=await page.locator('#academic-journey-content').evaluate(root=>{
        const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&!node.closest('[hidden],details:not([open])>:not(summary)');
        const clipped=[...root.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,dt,strong')].filter(node=>visible(node)&&node.clientWidth&&!node.classList.contains('sr-only')).filter(node=>node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).textOverflow!=='ellipsis').map(node=>({id:node.id,text:node.textContent.trim().slice(0,90)}));
        const controls=[...root.querySelectorAll('button,summary')].filter(visible).map(node=>({text:node.textContent.trim().slice(0,70),box:node.getBoundingClientRect().toJSON()}));
        const stages=[...root.querySelectorAll('#journey-academic-map li[data-journey-stage]')].map(node=>node.getBoundingClientRect().toJSON());
        return {overflow:document.documentElement.scrollWidth>innerWidth+2,clipped,controls,stages};
    });
    assert.equal(result.overflow,false,label+' viewport overflow');assert.deepEqual(result.clipped,[],label+' clipped text');
    for(const {text,box} of result.controls){assert(box.height>=43.99,label+' 44px control: '+text);assert(box.left>=-1&&box.right<=page.viewportSize().width+1,label+' control fits horizontally: '+text);}
    for(let a=0;a<result.stages.length;a++)for(let b=a+1;b<result.stages.length;b++){const x=result.stages[a],y=result.stages[b];assert(!(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1),label+' official stage cards overlap');}
}
async function matrix(page,label){for(const width of [320,390,768,1365])for(const lang of ['id','en'])for(const dark of [false,true]){await mode(page,width,lang,dark);await layout(page,`${label} ${width}/${lang}/${dark}`);}}
async function sync(page){await page.evaluate(()=>syncDatabase());await page.waitForFunction(()=>syncPhase==='success');}
async function login(browser,role='mhs',nim='A'){
    const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
    await context.route('**/*',async route=>{
        const url=route.request().url();
        if(url.includes('script.google.com/macros/')){
            const data=route.request().postDataJSON();calls.push(data);let result;
            if(data.action==='student_login')result={status:'success',token:'student-'+data.nim,nama:data.nim==='A'?name:'NEW ACCOUNT C'};
            else if(data.action==='admin_login')result={status:'success',token:'admin'};
            else if(data.action==='get_data'){
                result=snapshot(data.token);const held=nextRead;nextRead=null;if(held){held.enter();await held.wait;}
                if(failRead){failRead=false;result={status:'error',message:'Gangguan baca pengujian.'};}
            }else if(data.action==='get_journey'){
                assert.equal(data.token,'admin');assert.equal(String(data.nim).trim(),'A');result={status:'success',journey:structuredClone(preparation)};
                const held=nextPreparationRead;nextPreparationRead=null;if(held){held.enter();await held.wait;}
            }else if(data.action==='logout')result={status:'success'};
            else if(await require('./next-mock.cjs')(route,data))return;
            else throw Error('Unexpected journey UI API '+data.action);
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if(url.startsWith(origin))return route.continue();if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.goto(origin);
    if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}
    else{await page.fill('#input-nim',nim);await page.locator('#input-nim').press('Enter');}
    await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success');return page;
}

(async()=>{
    const browser=await chromium.launch(),student=await login(browser);await student.evaluate(()=>switchTab(null,'academic-journey'));
    for(const id of ['journey-overview','journey-next-action','journey-academic-map','journey-preparation'])assert.equal(await student.locator('#'+id).count(),1,'One '+id);
    await map(student,['complete','next','waiting']);await hero(student,'case','J-REV-LATEST');
    assert(!(await student.locator('#academic-journey-content').textContent()).includes('FOREIGN PRIVATE'));
    assert.equal(await student.locator('#academic-journey-content .journey-history-item').count(),0,'Student request history belongs in My Requests');
    assert.equal(await student.locator('#academic-journey-content [data-journey-status]').count(),1);
    assert.equal(await student.locator('#journey-journal-path').count(),1,'Journal pathway stays distinct from the three verified stages');
    await matrix(student,'student revision');
    pass('A single revision action follows normalized own records and latest valid activity; verified map, journal alternative, privacy and long content fit all 16 modes');

    await mode(student,390,'id',true);
    const disclosure=student.locator('[data-journey-disclosure=magang]'),summary=disclosure.locator('summary');await summary.focus();await summary.press('Enter');assert(await disclosure.evaluate(node=>node.open));
    const summaryId=await summary.getAttribute('id');assert(summaryId);await student.evaluate(()=>toggleLanguage());assert(await disclosure.evaluate(node=>node.open));assert.equal(await student.evaluate(()=>document.activeElement.id),summaryId);
    await sync(student);assert(await disclosure.evaluate(node=>node.open));assert.equal(await student.evaluate(()=>document.activeElement.id),summaryId);
    await summary.press('Enter');assert(!(await disclosure.evaluate(node=>node.open)));
    const revision=await hero(student,'case','J-REV-LATEST');await revision.click();await student.waitForSelector('#modal-case-detail',{state:'visible'});assert.equal(await student.evaluate(()=>selectedCaseId),'J-REV-LATEST');
    await student.locator('#modal-case-detail .case-close').click();await student.waitForSelector('#modal-case-detail',{state:'hidden'});
    await student.locator('[data-journey-status]').click();assert.equal(await student.evaluate(()=>document.querySelector('.tab-content.active')?.id),'student-status');
    await student.evaluate(()=>switchTab(null,'academic-journey'));
    records=[record('J-ACTIVE','Proposal',' rEsUbMiTtEd ','2026-10-15T01:00:00Z'),baseline[0],baseline.at(-1)];await sync(student);await hero(student,'case','J-ACTIVE');
    records[0].status='Pending';await sync(student);await hero(student,'case','J-ACTIVE');
    records=[baseline[0],baseline.at(-1)];academic={exists:true,level:0,revision:3,events:[]};await sync(student);await map(student,['next','waiting','waiting']);assert.equal(await student.locator('#journey-academic-map .is-complete').count(),0,'Accepted documents cannot complete an academic exam');
    pass('Keyboard disclosures and focus survive language/sync; revision and active actions open real cases, while accepted documents never imply exam completion');

    records=[baseline.at(-1)];
    for(const level of [0,1,2,3]){
        academic={exists:true,level,revision:level+4,events:[]};await sync(student);await map(student,['Outline','Proposal','Pendadaran'].map((_,index)=>index<level?'complete':index===level?'next':'waiting'));
        if(level<3)await hero(student,'service',['Outline','Proposal','Pendadaran'][level]);else{assert.equal(await student.locator('#journey-next-action [data-start-service]').count(),0);assert.equal(await student.locator('#journey-academic-map [aria-current=step]').count(),0);}
    }
    academic={exists:false,level:0,revision:0,events:[]};await sync(student);await map(student,['unknown','unknown','unknown']);
    assert.equal(await student.locator('#journey-academic-map .is-complete').count(),0);
    academic=null;await sync(student);await map(student,['unknown','unknown','unknown']);
    unavailable=true;await sync(student);await map(student,['unknown','unknown','unknown']);await matrix(student,'academic unavailable');
    unavailable=false;supported=false;await sync(student);await map(student,['unknown','unknown','unknown']);await matrix(student,'legacy empty');
    pass('All four official levels drive truthful next stages; missing, unavailable and unsupported records stay unknown across 32 additional layouts');

    supported=true;academic={exists:true,level:2,revision:10,events:[]};records=structuredClone(baseline);const admin=await login(browser,'admin');
    await admin.evaluate(()=>{switchTab(null,'admin-data');openCaseDetail('J-REV-LATEST');});await admin.waitForSelector('#modal-case-detail',{state:'visible'});await admin.locator('[data-open-journey]').click();
    await admin.waitForFunction(()=>adminJourneyProgress!==null);await map(admin,['complete','complete','next']);
    assert((await admin.locator('#academic-journey-content .journey-heading').textContent()).includes(name));assert(!(await admin.locator('#academic-journey-content').textContent()).includes('FOREIGN PRIVATE'));
    assert.equal(await admin.locator('#journey-preparation input[type=checkbox]').count(),0,'Admin reads preparation without changing it');
    assert.equal(await admin.locator('#journey-preparation [data-start-service]').count(),0,'Admin cannot enter a student registration');
    const history=admin.locator('[data-journey-disclosure=history]');assert.equal(await history.count(),1);await history.locator('summary').click();assert(await history.evaluate(node=>node.open));
    await matrix(admin,'admin context');
    academicByNim={A:{unavailable:true}};await sync(admin);await map(admin,['unknown','unknown','unknown']);
    academicByNim={};await sync(admin);await map(admin,['unknown','unknown','unknown']);
    academicByNim=null;await sync(admin);await map(admin,['complete','complete','next']);
    const back=admin.locator('#academic-journey-content').getByRole('button',{name:/Back to queue|Kembali ke antrean/i});assert.equal(await back.count(),1);await back.click();assert.equal(await admin.evaluate(()=>document.querySelector('.tab-content.active')?.id),'admin-data');
    pass('Admin context uses the selected student’s official progress, provides read-only preparation and history, and returns to the queue across 16 layouts');

    const latePreparation=gate();nextPreparationRead=latePreparation;await admin.evaluate(()=>{window.lateJourneyContext=openAcademicJourney('A');});await latePreparation.entered;
    await admin.evaluate(()=>logoutUser());await admin.waitForSelector('#welcome-modal',{state:'visible'});latePreparation.release();await admin.evaluate(()=>window.lateJourneyContext);assert.equal(await admin.locator('#academic-journey-content').textContent(),'');
    await student.bringToFront();await student.evaluate(()=>switchTab(null,'academic-journey'));await sync(student);await map(student,['complete','complete','next']);const late=gate();nextRead=late;await student.evaluate(()=>{window.oldJourneySync=syncDatabase();});await late.entered;
    await student.evaluate(()=>logoutUser());await student.waitForSelector('#welcome-modal',{state:'visible'});late.release();await student.evaluate(()=>window.oldJourneySync);assert.equal(await student.locator('#academic-journey-content').textContent(),'');
    academic=null;records=[baseline.at(-1)];failRead=true;
    await student.fill('#input-nim','C');await student.locator('#input-nim').press('Enter');await student.waitForSelector('#welcome-modal',{state:'hidden'});await student.waitForFunction(()=>syncPhase==='error');await student.evaluate(()=>switchTab(null,'academic-journey'));
    await map(student,['unknown','unknown','unknown']);assert(!(await student.locator('#academic-journey-content').textContent()).includes(name));assert(!(await student.locator('#academic-journey-content').textContent()).includes('FOREIGN PRIVATE'));
    assert.equal(calls.filter(data=>['create','update','revise_request','save_progress','save_academic_progress','change_request_type','save_document_review'].includes(data.action)).length,0);assert.deepEqual(errors,[]);
    pass('Late admin preparation and student database responses cannot restore private journey content after logout or leak official progress into a failed new-account session');
    fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/journey-ui-results.json',JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(reportFailure);
