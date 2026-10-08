const { chromium } = require('./browser.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const pdf = {name:'berkas-uji.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nTEST ONLY\n%%EOF')};
(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({reducedMotion:"reduce",viewport:{width:1365,height:900}});
    let records = [], contents = [], calls = [], errors = [], permit = true;
    await context.route('**/*', async route => {
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON();if(await require('./next-mock.cjs')(route,data))return; calls.push(data);
            let result;
            if (data.action === 'student_login') result = {status:'success',token:'student-'+data.nim,nama:'Mahasiswa Uji'};
            else if (data.action === 'admin_login') result = {status:'success',token:'admin'};
            else if (data.action === 'get_data') result = {status:'success',registrations:data.token==='admin'?records:records.filter(item=>data.token==='student-'+item.nim),students:[],dosens:[],announcements:[],contents};
            else if (data.action === 'logout') result = {status:'success'};
            else throw new Error('Unexpected mutation in journey test: '+data.action);
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if (url.startsWith('http://127.0.0.1:8766')) return route.continue();
        return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e=>errors.push(e.message));
    page.on('dialog', d=>permit?d.accept():d.dismiss());
    async function login(nim) {
        await page.fill('#input-nim',nim); await page.locator('#input-nim').press('Enter');
        await page.waitForSelector('#welcome-modal',{state:'hidden'}); await page.waitForFunction(()=>syncPhase==='success');
    }
    await page.goto('http://127.0.0.1:8766'); await login('A');
    await page.evaluate(()=>switchTab(null,'magang'));
    assert.equal(await page.locator('#magang .academic-stage').count(),3);
    assert.equal(await page.locator('#magang [data-start-service]').count(),0,'No invented internship upload service');
    await page.check('#m1'); assert.equal(await page.locator('#magang .stage-progress').first().textContent(),'1/1 disiapkan');
    await page.reload(); await page.waitForSelector('#welcome-modal',{state:'hidden'});
    await page.evaluate(()=>switchTab(null,'magang')); assert(await page.isChecked('#m1'));
    await page.evaluate(()=>switchTab(null,'skripsi'));
    assert.equal(await page.locator('#skripsi .academic-stage').count(),4);
    assert((await page.locator('#skripsi .student-only > p').textContent()).includes('verifikasi admin'));
    console.log('PASS Internship/thesis stages use existing requirements; preparation persists and is separate from admin verification');

    await page.screenshot({path:path.join(__dirname,'../test-results/stage-overview-desktop.png'),fullPage:true});
    await page.click('[data-start-service="Outline"]');
    assert.equal(await page.inputValue('#reg-jenis-utama'),'Outline');
    assert.equal(await page.locator('#registration-readiness .stage-progress').textContent(),'0/3 siap');
    await page.click('[data-requirement-field="reg-judul"]'); assert.equal(await page.evaluate(()=>document.activeElement.id),'reg-judul');
    await page.fill('#reg-judul','Judul yang dipulihkan');
    await page.setInputFiles('#file-transkrip',pdf); await page.setInputFiles('#file-proposal',pdf);
    await page.waitForFunction(()=>document.querySelector('#registration-readiness .stage-progress').textContent==='3/3 siap');
    await page.evaluate(()=>clearSelectedFile('file-transkrip','name-transkrip-badge'));
    assert.equal(await page.locator('#registration-readiness .stage-progress').textContent(),'2/3 siap');
    await page.reload(); await page.waitForSelector('#welcome-modal',{state:'hidden'});
    await page.evaluate(()=>switchTab(null,'pendaftaran'));
    assert.equal(await page.inputValue('#reg-judul'),'Judul yang dipulihkan');
    assert.equal(await page.locator('#registration-readiness .stage-progress').textContent(),'1/3 siap','Draft restore should refresh readiness while files are missing');
    console.log('PASS Stage shortcut, field focus, file removal and draft restore keep readiness accurate');

    const types = [['Outline',3],['Proposal',2],['Pendadaran',2],['Skripsi Jurnal',3],['Pergantian Pembimbing',4]];
    for (const [type,total] of types) {
        await page.selectOption('#reg-jenis-utama',type);
        if (type==='Pergantian Pembimbing') {
            await page.fill('#reg-dosen-lama','Dosen A');await page.fill('#reg-dosen-baru',' dosen a ');await page.fill('#reg-alasan-ganti','Perubahan topik');
            assert.equal(await page.locator('[data-requirement-field="reg-dosen-baru"] span').textContent(),'Pilih dosen yang berbeda.');
            await page.fill('#reg-dosen-baru','Dosen B');
        } else await page.fill('#reg-judul','Judul uji');
        const fileIds = await page.evaluate(type=>registrationSpecs(type).map(([id])=>id),type);
        for (const id of fileIds) await page.setInputFiles('#'+id,pdf);
        await page.waitForFunction(total=>document.querySelector('#registration-readiness .stage-progress').textContent===`${total}/${total} siap`,total);
        await page.click('#btn-review-registration');assert(await page.locator('#registration-review').isVisible());
        await page.click('#btn-edit-registration');
    }
    await page.selectOption('#reg-jenis-utama','Proposal');
    await page.setInputFiles('#file-acc-sempro',{name:'kosong.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(0)});
    assert.equal(await page.locator('#registration-readiness .stage-progress').textContent(),'1/2 siap');
    await page.click('#btn-review-registration'); assert(await page.locator('#registration-fields').isVisible());
    assert.equal(calls.filter(c=>c.action==='create').length,0);
    console.log('PASS All five services share validated readiness; missing/empty documents cannot reach submission');

    records = [{id:'ongoing',nim:'A',nama:'Mahasiswa Uji',jenis:'Outline',status:'Revision',date:new Date().toISOString(),detail:'Judul uji',link:'',note:'[]'}];
    await page.evaluate(()=>syncDatabase());
    permit=true;await page.evaluate(()=>switchTab(null,'skripsi'));
    assert.equal(await page.locator('[data-start-service="Outline"]').textContent(),'Lanjutkan pengajuan');
    await page.click('[data-start-service="Outline"]'); await page.waitForSelector('#modal-case-detail',{state:'visible'});
    assert((await page.locator('#case-detail-content').textContent()).includes('Judul uji'));
    await page.click('.case-close'); await page.waitForSelector('#modal-case-detail',{state:'hidden'});
    console.log('PASS Ongoing request opens its revision case instead of creating a duplicate');

    contents = [{Tipe:'magang',DataJSON:JSON.stringify([{title:'Tahap khusus <img src=x onerror=alert(1)>',items:[{id:'custom',text:'Persyaratan baru dari admin',sub:'Ketentuan yang berlaku'}]}])}];
    await page.evaluate(()=>syncDatabase());await page.evaluate(()=>switchTab(null,'magang'));
    assert.equal(await page.locator('#magang .academic-stage').count(),1);
    assert.equal(await page.locator('#magang .academic-stage img').count(),0);
    assert((await page.locator('#magang .stage-next').textContent()).includes('Persyaratan baru dari admin'));
    await page.check('#custom');assert.equal(await page.locator('#magang .stage-progress').textContent(),'1/1 disiapkan');
    console.log('PASS Admin-edited academic content updates stages and safely displays text');

    await page.evaluate(()=>switchTab(null,'pendaftaran'));await page.selectOption('#reg-jenis-utama','Proposal');
    for (const width of [320,390,768,1365]) {
        await page.setViewportSize({width,height:900});
        for (const dark of [false,true]) {
            await page.evaluate(dark=>{if(document.body.classList.contains('dark-mode')!==dark)toggleDarkMode();},dark);
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
            assert(await page.locator('#registration-readiness').evaluate(el=>el.scrollWidth<=el.clientWidth));
            const sizes=await page.locator('[data-requirement-field]').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));assert(sizes.every(h=>h>=44));
        }
    }
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.querySelector('.main-content').getBoundingClientRect().x===0);
    await page.screenshot({path:path.join(__dirname,'../test-results/requirements-mobile.png'),fullPage:true});
    await page.evaluate(()=>{currentLang='en';applyDynamicLanguage();});assert((await page.locator('#registration-readiness').textContent()).includes('Request Requirements'));
    console.log('PASS Readiness fits four screen sizes in light/dark themes with accessible controls and translated guidance');

    await page.evaluate(()=>logoutUser());await page.waitForSelector('#welcome-modal',{state:'visible'});
    assert.equal(await page.locator('#registration-readiness').textContent(),'');
    await login('B');await page.evaluate(()=>switchTab(null,'magang'));assert(!await page.isChecked('#custom'));
    assert((await page.locator('#magang .stage-progress').textContent()).includes('0/1'));
    await page.evaluate(()=>logoutUser());await page.waitForSelector('#welcome-modal',{state:'visible'});
    await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');await page.waitForSelector('#welcome-modal',{state:'hidden'});
    await page.evaluate(()=>openStageRegistration('Outline'));assert.equal(await page.inputValue('#reg-jenis-utama'),'');
    assert.deepEqual(errors,[]);
    console.log('PASS Logout/account change clear private readiness and checklist views; admin cannot use student shortcuts; no runtime errors');
    await browser.close();
})().catch(require('./browser.cjs').reportFailure);
