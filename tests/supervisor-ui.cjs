const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,reportFailure}=require('./browser.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
const calls=[],errors=[],checks=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
const nearName='Dr. eCommerce O’Connor';
const unsafeName='Dr. <img src=x onerror="window.supervisorAttack=true">';
const longName='Prof. Pemeriksaan Komunikasi Digital dan Mahasiswa Internasional O’Connor '.repeat(3);
let dosens=[
    {Nama:'Dr. Alpha',Terpakai:'0',Maksimal:'8'},
    {Nama:nearName,Terpakai:4,Maksimal:5},
    {Nama:'Dr. Full',Terpakai:5,Maksimal:5},
    {Nama:'Dr. Over',Terpakai:7,Maksimal:5},
    {Nama:'Dr. Unknown',Terpakai:'not-a-number',Maksimal:5},
    {Nama:'Dr. Decimal',Terpakai:1.5,Maksimal:5},
    {Nama:'Dr. Duplicate',Terpakai:0,Maksimal:5},
    {Nama:'Dr. Duplicate',Terpakai:1,Maksimal:5},
    {Nama:unsafeName,Terpakai:0,Maksimal:3},
    {Nama:longName,Terpakai:2,Maksimal:6}
];
let nextManage=null;
const manages=()=>calls.filter(data=>data.action==='manage_dosen');
function gate(result='success'){let enter,release;return{result,entered:new Promise(resolve=>enter=resolve),wait:new Promise(resolve=>release=resolve),enter:()=>enter(),release:()=>release()};}
async function mode(page,width,lang,dark){await page.setViewportSize({width,height:900});await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();if(document.body.classList.contains('dark-mode')!==dark)toggleDarkMode();},{lang,dark});}
const edit=(page,name)=>page.locator('#admin-dosen [data-supervisor-edit]:visible').filter({hasNot:page.locator('[disabled]')}).filter({hasText:/Ubah Kuota|Edit Capacity/}).and(page.locator('[data-supervisor-name="'+name.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"]'));
async function idle(page){await page.waitForFunction(()=>!supervisorMutationBusy&&!IPCOSSupervisors.isBusy());}
async function counts(page,expected){assert.deepEqual(await page.locator('#supervisor-summary dd').allTextContents(),expected.map(String));}
async function layout(page,selector,label){
    const result=await page.locator(selector).evaluate(root=>{
        const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&!node.closest('[hidden],details:not([open])>:not(summary)');
        return{overflow:document.documentElement.scrollWidth>innerWidth+2,clipped:[...root.querySelectorAll('h1,h2,h3,p,label,button,summary,strong,dt,dd,th')].filter(node=>visible(node)&&node.clientWidth&&!node.classList.contains('sr-only')).filter(node=>node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).textOverflow!=='ellipsis').map(node=>({id:node.id,text:node.textContent.trim().slice(0,90)})),controls:[...root.querySelectorAll('button,summary')].filter(visible).map(node=>({text:node.textContent.trim(),box:node.getBoundingClientRect().toJSON()}))};
    });
    assert.equal(result.overflow,false,label+' viewport overflow');assert.deepEqual(result.clipped,[],label+' clipped text');
    for(const{text,box}of result.controls){assert(box.height>=43.99,label+' 44px target '+text);assert(box.left>=-1&&box.right<=page.viewportSize().width+1,label+' control fits '+text);}
}
async function matrix(page,selector,label){for(const width of[320,390,768,1365])for(const lang of['id','en'])for(const dark of[false,true]){await mode(page,width,lang,dark);await layout(page,selector,`${label} ${width}/${lang}/${dark}`);}}
async function login(page,role='admin',name='fixture'){
    if(page.url()==='about:blank')await page.goto(origin);
    if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user',name);await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}
    else{await page.click('#tab-mhs');await page.fill('#input-nim',name);await page.locator('#input-nim').press('Enter');}
    await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success');await page.evaluate(role=>switchTab(null,role==='admin'?'admin-dosen':'dashboard'),role);
}

(async()=>{
    const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
    await context.route('**/*',async route=>{
        const url=route.request().url();if(url.includes('script.google.com/macros/')){
            const data=route.request().postDataJSON();calls.push(data);let result;
            if(data.action==='admin_login')result={status:'success',token:'admin-'+(data.username||data.user||'fixture')};
            else if(data.action==='student_login')result={status:'success',token:'student-'+data.nim,nama:'Student Fixture'};
            else if(data.action==='get_data')result={status:'success',registrations:[],students:[],dosens:data.token.startsWith('admin-')?structuredClone(dosens):[],contents:[],announcements:[],services:[]};
            else if(data.action==='get_journey')result={status:'success',journey:{exists:false,checks:{},revision:0}};
            else if(data.action==='manage_dosen'){
                assert(data.token.startsWith('admin-'));const held=nextManage;nextManage=null;if(held){held.enter();await held.wait;}
                if(held?.result==='error')result={status:'error',message:'Gangguan penyimpanan khusus pengujian.'};
                else{if(data.method==='add'){assert(!dosens.some(row=>row.Nama===data.nama));assert(Number.isInteger(Number(data.maksimal))&&Number(data.maksimal)>0);dosens.push({Nama:data.nama,Terpakai:0,Maksimal:Number(data.maksimal)});}
                    else if(data.method==='update'){const row=dosens.find(row=>row.Nama===data.nama);assert(row);assert(Number(data.terpakai)>=0&&Number(data.terpakai)<=Number(data.maksimal));row.Terpakai=Number(data.terpakai);row.Maksimal=Number(data.maksimal);}
                    else if(data.method==='delete')dosens=dosens.filter(row=>row.Nama!==data.nama);else throw Error('Unexpected quota method '+data.method);result={status:'success'};}
            }else if(data.action==='logout')result={status:'success'};
            else if(await require('./next-mock.cjs')(route,data))return;
            else throw Error('Unexpected supervisor fixture API '+data.action);
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if(url.startsWith(origin))return route.continue();if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await login(page);
    await counts(page,[10,4,2,4]);assert.equal(await page.locator('#table-admin-dosen tr').count(),10);assert.equal(await page.locator('#supervisor-mobile-list .supervisor-card').count(),10);
    assert.equal(await page.locator('#admin-dosen img').count(),0);assert.equal(await page.evaluate(()=>window.supervisorAttack),undefined);
    assert.equal(await page.locator('#table-admin-dosen tr').first().locator('strong').textContent(),'Dr. Alpha');
    const invalid=page.locator('#table-admin-dosen tr').filter({hasText:'Dr. Unknown'});assert.match(await invalid.locator('.supervisor-workload').textContent(),/—/);assert.doesNotMatch(await invalid.locator('.supervisor-state').textContent(),/^Tersedia|Available$/i);
    assert.match(await page.locator('#table-admin-dosen tr').filter({hasText:'Dr. Over'}).textContent(),/2 di atas kuota/);
    assert.equal(await page.locator('#table-admin-dosen tr').filter({hasText:'Dr. Duplicate'}).locator('button:disabled').count(),2);
    await matrix(page,'#admin-dosen','capacity list');
    await mode(page,1365,'id',false);for(const[filter,total]of[['available',4],['near',1],['full',2],['review',4]]){await page.selectOption('#supervisor-availability',filter);assert.equal(await page.locator('#table-admin-dosen tr').count(),total);await counts(page,[10,4,2,4]);}
    await page.locator('#supervisor-reset').click();await page.fill('#supervisor-search','  ECOMMERCE   O’CONNOR ');assert.equal(await page.locator('#table-admin-dosen tr').count(),1);
    await page.locator('#supervisor-search').press('End');const caret=await page.locator('#supervisor-search').evaluate(node=>node.selectionStart);await page.fill('#add-dosen-nama','Draf Nama eCommerce');await page.fill('#add-dosen-max','12');await page.locator('#supervisor-search').focus();await page.locator('#supervisor-search').press('End');await page.evaluate(()=>syncDatabase());await page.evaluate(()=>toggleLanguage());
    assert.equal(await page.inputValue('#supervisor-search'),'  ECOMMERCE   O’CONNOR ');assert.equal(await page.locator('#supervisor-search').evaluate(node=>node.selectionStart),caret);assert.equal(await page.evaluate(()=>document.activeElement.id),'supervisor-search');assert.equal(await page.inputValue('#add-dosen-nama'),'Draf Nama eCommerce');assert.equal(await page.inputValue('#add-dosen-max'),'12');
    await page.fill('#supervisor-search','no matching supervisor');await matrix(page,'#admin-dosen','no matching capacity');await page.locator('#supervisor-reset').click();
    pass('Persisted quotas, invalid/duplicate data, availability filters, long names, escaped markup and search/draft preservation fit 32 populated/no-results modes');

    await mode(page,390,'id',true);await edit(page,nearName).focus();await edit(page,nearName).press('Enter');await page.waitForSelector('#modal-edit-dosen',{state:'visible'});assert.equal(await page.inputValue('#hidden-dosen-nama'),nearName);await page.fill('#edit-dosen-terpakai','2');await page.locator('#edit-dosen-terpakai').focus();await page.evaluate(()=>toggleLanguage());assert.equal(await page.evaluate(()=>document.activeElement.id),'edit-dosen-terpakai');assert.equal(await page.inputValue('#edit-dosen-terpakai'),'2');assert.equal(await page.locator('#edit-dosen-name-display').textContent(),nearName);
    await matrix(page,'#modal-edit-dosen','quota editor');dosens.find(row=>row.Nama===nearName).Terpakai=3;await page.evaluate(()=>syncDatabase());assert.equal(await page.inputValue('#edit-dosen-terpakai'),'2');assert(await page.locator('#supervisor-edit-source-status').isVisible());
    await page.keyboard.press('Escape');await page.waitForSelector('#modal-edit-dosen',{state:'hidden'});assert.equal(await edit(page,nearName).evaluate(node=>node===document.activeElement),true);
    await edit(page,nearName).click();await page.waitForSelector('#modal-edit-dosen',{state:'visible'});const retained=dosens.find(row=>row.Nama===nearName);dosens=dosens.filter(row=>row.Nama!==nearName);await page.evaluate(()=>syncDatabase());assert(await page.locator('#supervisor-edit-save').isDisabled());assert(await page.locator('#supervisor-edit-source-status').isVisible());await page.keyboard.press('Escape');await page.waitForSelector('#modal-edit-dosen',{state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement.id),'supervisor-search');dosens.push(retained);await page.evaluate(()=>syncDatabase());
    pass('Quota drafts, names, modal focus and source-change notices survive 16 editor modes; closing returns to the refreshed supervisor or search when removed');

    await mode(page,390,'id',true);await page.fill('#add-dosen-nama','');await page.fill('#add-dosen-max','0');await page.locator('#supervisor-add-submit').click();assert.equal(manages().length,0);assert.equal(await page.getAttribute('#add-dosen-nama','aria-invalid'),'true');assert.equal(await page.evaluate(()=>document.activeElement.id),'add-dosen-nama');
    await page.evaluate(()=>toggleLanguage());assert.match(await page.locator('#add-dosen-nama-error').textContent(),/Enter the supervisor/);assert.equal(await page.evaluate(()=>document.activeElement.id),'add-dosen-nama');await page.evaluate(()=>toggleLanguage());
    await page.fill('#add-dosen-nama','Dr. Alpha');await page.fill('#add-dosen-max','3');await page.locator('#supervisor-add-submit').click();assert.equal(manages().length,0);assert.match(await page.locator('#add-dosen-nama-error').textContent(),/sudah ada|already/i);
    await page.fill('#add-dosen-nama','Dr. New O’Connor');const addHeld=gate();nextManage=addHeld;await page.locator('#supervisor-add-submit').click();await addHeld.entered;assert(await page.locator('#supervisor-add-submit').isDisabled());await page.evaluate(()=>addDosenQuota());assert.equal(manages().length,1);await page.fill('#add-dosen-nama','Next Admin Draft');await page.fill('#add-dosen-max','6');addHeld.release();await idle(page);assert.equal(await page.inputValue('#add-dosen-nama'),'Next Admin Draft');assert.equal(await page.inputValue('#add-dosen-max'),'6');
    const addFailed=gate('error');nextManage=addFailed;await page.locator('#supervisor-add-submit').click();await addFailed.entered;addFailed.release();await idle(page);assert.equal(await page.inputValue('#add-dosen-nama'),'Next Admin Draft');assert(await page.locator('#supervisor-add-feedback').isVisible());await page.locator('#supervisor-add-submit').click();await idle(page);assert.equal(await page.inputValue('#add-dosen-nama'),'');assert(dosens.some(row=>row.Nama==='Next Admin Draft'));
    pass('Add validation blocks missing/duplicate names and invalid capacity; gated failures retain drafts and repeated clicks cannot duplicate writes');

    await edit(page,nearName).click();await page.waitForSelector('#modal-edit-dosen',{state:'visible'});const beforeUpdate=manages().length;await page.fill('#edit-dosen-terpakai','6');await page.fill('#edit-dosen-maksimal','5');await page.locator('#supervisor-edit-save').click();assert.equal(manages().length,beforeUpdate);assert.equal(await page.getAttribute('#edit-dosen-terpakai','aria-invalid'),'true');assert.equal(await page.evaluate(()=>document.activeElement.id),'edit-dosen-terpakai');await page.fill('#edit-dosen-terpakai','2');await page.fill('#edit-dosen-maksimal','6');
    const updateFailed=gate('error');nextManage=updateFailed;await page.locator('#supervisor-edit-save').click();await updateFailed.entered;assert(await page.locator('#supervisor-edit-save').isDisabled());assert(await page.locator('#edit-dosen-terpakai').isDisabled());await page.evaluate(()=>saveDosenQuota());assert.equal(manages().length,beforeUpdate+1);await page.keyboard.press('Escape');assert(await page.locator('#modal-edit-dosen').isVisible());updateFailed.release();await idle(page);assert.equal(await page.inputValue('#edit-dosen-terpakai'),'2');assert.equal(await page.inputValue('#edit-dosen-maksimal'),'6');assert(await page.locator('#supervisor-edit-feedback').isVisible());await page.locator('#supervisor-edit-save').click();await idle(page);await page.waitForSelector('#modal-edit-dosen',{state:'hidden'});assert.deepEqual(dosens.find(row=>row.Nama===nearName),{Nama:nearName,Terpakai:2,Maksimal:6});
    await edit(page,'Next Admin Draft').click();await page.waitForSelector('#modal-edit-dosen',{state:'visible'});await page.locator('#supervisor-delete>summary').click();const deleteFailed=gate('error');nextManage=deleteFailed;await page.locator('#supervisor-delete-button').click();await deleteFailed.entered;await page.keyboard.press('Escape');assert(await page.locator('#modal-edit-dosen').isVisible());deleteFailed.release();await idle(page);assert(await page.locator('#modal-edit-dosen').isVisible());assert(dosens.some(row=>row.Nama==='Next Admin Draft'));await page.locator('#supervisor-delete-button').click();await idle(page);await page.waitForSelector('#modal-edit-dosen',{state:'hidden'});assert(!dosens.some(row=>row.Nama==='Next Admin Draft'));
    pass('Quota edit and existing remove flow validate truthful values, retain failed edits, serialize writes, guard pending Escape and close only after mock confirmation');

    const changedRow=dosens.find(row=>row.Nama===nearName);changedRow.Terpakai=1;changedRow.Maksimal=5;await page.evaluate(()=>syncDatabase());
    await edit(page,nearName).click();await page.waitForSelector('#modal-edit-dosen',{state:'visible'});assert.equal(await page.inputValue('#edit-dosen-terpakai'),'1');await page.fill('#edit-dosen-maksimal','6');const beforeStale=manages().length;
    changedRow.Terpakai=2;await page.evaluate(()=>syncDatabase());assert.equal(await page.inputValue('#edit-dosen-terpakai'),'1');assert.equal(await page.inputValue('#edit-dosen-maksimal'),'6');assert(await page.locator('#supervisor-edit-save').isDisabled());assert.match(await page.locator('#supervisor-edit-source-status').textContent(),/Tutup dan buka kembali|Close and reopen/);
    await page.evaluate(()=>saveDosenQuota());assert.equal(manages().length,beforeStale,'Known newer workload cannot be overwritten by a stale quota editor');assert(await page.locator('#modal-edit-dosen').isVisible());
    await page.keyboard.press('Escape');await page.waitForSelector('#modal-edit-dosen',{state:'hidden'});await edit(page,nearName).click();await page.waitForSelector('#modal-edit-dosen',{state:'visible'});assert.equal(await page.inputValue('#edit-dosen-terpakai'),'2');assert.equal(await page.inputValue('#edit-dosen-maksimal'),'5');await page.fill('#edit-dosen-maksimal','6');await page.locator('#supervisor-edit-save').click();await idle(page);await page.waitForSelector('#modal-edit-dosen',{state:'hidden'});assert.equal(manages().length,beforeStale+1);assert.equal(manages().at(-1).terpakai,'2');assert.equal(manages().at(-1).maksimal,'6');assert.equal(changedRow.Terpakai,2);
    pass('A newer server workload blocks stale saves without clearing drafts; reopening uses the latest workload in the real mock API payload');

    const populated=structuredClone(dosens);dosens=[];await page.evaluate(()=>syncDatabase());await counts(page,[0,0,0,0]);assert(await page.locator('#supervisor-empty').isVisible());await matrix(page,'#admin-dosen','empty supervisor list');dosens=populated;await page.evaluate(()=>syncDatabase());
    await page.fill('#add-dosen-nama','Late Old Admin');await page.fill('#add-dosen-max','4');const late=gate();nextManage=late;await page.evaluate(()=>{window.supervisorOldMutation=addDosenQuota();});await late.entered;await page.evaluate(()=>logoutUser());await page.waitForSelector('#welcome-modal',{state:'visible'});await login(page,'admin','new-admin');await page.fill('#add-dosen-nama','New Admin Draft');await page.fill('#add-dosen-max','9');late.release();await page.evaluate(()=>window.supervisorOldMutation);assert.equal(await page.inputValue('#add-dosen-nama'),'New Admin Draft');assert.equal(await page.inputValue('#add-dosen-max'),'9');assert.equal(await page.evaluate(()=>IPCOSSupervisors.isBusy()),false);
    await page.evaluate(()=>logoutUser());await page.waitForSelector('#welcome-modal',{state:'visible'});await login(page,'mhs','A');const before=manages().length;await page.evaluate(()=>{addDosenQuota();saveDosenQuota();deleteDosen('Dr. Alpha');openEditDosen('Dr. Alpha',0,8);});assert.equal(manages().length,before);assert.equal(await page.locator('#table-admin-dosen tr').count(),0);assert.equal(await page.locator('#supervisor-mobile-list .supervisor-card').count(),0);assert.equal(await page.inputValue('#add-dosen-nama'),'');assert.equal(await page.inputValue('#hidden-dosen-nama'),'');assert(await page.locator('#modal-edit-dosen').isHidden());assert.deepEqual(errors,[]);assert.equal(calls.filter(data=>['create','update','manage_student','save_services','post_announcement'].includes(data.action)).length,0);
    pass('Empty states fit 16 more modes; logout clears private/busy state and stale acknowledgments cannot erase another admin’s draft or expose mutations to students');
    fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/supervisor-ui-results.json',JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(reportFailure);
