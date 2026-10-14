const {chromium,reportFailure}=require('./browser.cjs');
const assert=require('node:assert/strict');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
const firstUrl='https://drive.google.com/file/d/owned/view',secondUrl='https://drive.google.com/file/d/second/view';
const record={id:'mine',nim:'A',nama:'Mahasiswa Uji',jenis:'Proposal',status:'Pending',date:new Date().toISOString(),detail:'Judul',link:`<a href="${firstUrl}">Form ACC</a><a href="${secondUrl}">Dokumen Kedua</a>`,note:'[]'};
const errors=[],calls=[];let nextGate=null;
function gate(error=false){let release,entered;return {error,wait:new Promise(resolve=>release=resolve),entered:new Promise(resolve=>entered=resolve),release:()=>release(),enter:()=>entered()};}
(async()=>{
    const browser=await chromium.launch(),context=await browser.newContext({reducedMotion:'reduce'});
    await context.route('**/*',async route=>{
        const url=route.request().url();
        if(url.includes('script.google.com/macros/')){
            const data=route.request().postDataJSON();if(await require('./next-mock.cjs')(route,data))return;let result;
            if(data.action==='student_login')result={status:'success',token:'mhs',nama:'Mahasiswa Uji'};
            else if(data.action==='get_data')result={status:'success',registrations:[record],students:[],dosens:[],announcements:[],contents:[]};
            else if(data.action==='get_document'){
                assert.equal(data.id,'mine');assert([firstUrl,secondUrl].includes(data.url));calls.push(data);
                const held=nextGate;nextGate=null;if(held){held.enter();await held.wait;}
                result=held?.error?{status:'error',message:'Gangguan berkas uji'}:{status:'success',mimeType:'application/pdf',fileName:data.url===firstUrl?'private.pdf':'second.pdf',base64:require('./fixtures.cjs').previewPdf(data.url===firstUrl?'Private document test':'Second private document').toString('base64')};
            }else if(data.action==='logout')result={status:'success'};
            else throw Error('Unexpected '+data.action);
            return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)});
        }
        if(url.startsWith(origin))return route.continue();
        if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class {static defaults={font:{}};destroy(){};constructor(){}};'});
        return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin);await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>document.querySelector('#task-home [data-case-id]'));
    const open=async()=>{await page.locator('#task-home [data-case-id]').click();await page.waitForSelector('#modal-case-detail',{state:'visible'});};
    const rendered=()=>page.waitForFunction(()=>document.querySelector('#case-file-preview canvas')?.dataset.rendered==='true');
    const heldPreview=async(index,error=false)=>{const held=gate(error);nextGate=held;await page.locator(`[data-preview-index="${index}"]`).click();await held.entered;return held;};
    await open();let held=await heldPreview(0);const requestCount=calls.length;
    await page.evaluate(()=>{previewCaseFile(0);previewCaseFile(0);});await page.waitForTimeout(80);assert.equal(calls.length,requestCount);
    assert(await page.locator('[data-preview-index="0"]').isDisabled());assert.equal(await page.locator('[data-preview-index="0"]').getAttribute('aria-busy'),'true');
    await page.evaluate(()=>toggleLanguage());
    assert(await page.locator('[data-preview-index="0"]').isDisabled());assert.equal(await page.locator('[data-preview-index="0"]').getAttribute('aria-busy'),'true');assert.equal(calls.length,requestCount);
    held.release();await rendered();assert(!await page.locator('[data-preview-index="0"]').isDisabled());assert.equal(await page.evaluate(()=>caseBlobUrls.size),1);
    assert.equal(await page.locator('[data-preview-index="0"]').getAttribute('aria-busy'),null);await page.evaluate(()=>toggleLanguage());
    const download=page.waitForEvent('download');await page.locator('[data-document-index="0"]').click();assert.equal((await download).suggestedFilename(),'private.pdf');assert.equal(calls.length,requestCount+1,'Download keeps its separate authenticated request');
    console.log('PASS Repeated private preview intent sends one authenticated request; busy controls survive language changes, recover and keep downloads separate');

    held=await heldPreview(0,true);held.release();await page.waitForFunction(()=>!document.querySelector('[data-preview-index="0"]').disabled);
    assert.equal(await page.evaluate(()=>caseBlobUrls.size),0);assert((await page.locator('#case-file-preview>.field-helper').textContent()).includes('belum dapat dimuat'));
    await page.locator('[data-preview-index="0"]').click();await rendered();assert.equal(await page.evaluate(()=>caseBlobUrls.size),1);
    console.log('PASS Failed previews release busy state and allow a clean retry without retained private URLs');

    const oldFile=await heldPreview(0),newFile=await heldPreview(1);assert(!await page.locator('[data-preview-index="0"]').isDisabled());
    oldFile.release();await page.waitForTimeout(80);assert(await page.locator('[data-preview-index="1"]').isDisabled());assert.equal(await page.locator('#case-file-preview canvas').count(),0);
    newFile.release();await rendered();assert((await page.locator('#case-file-preview canvas').getAttribute('aria-label')).includes('second.pdf'));
    console.log('PASS Switching files replaces the pending preview; a late old response cannot render or unlock the new intent');

    held=await heldPreview(0);await page.locator('.case-close').click();await page.waitForSelector('#modal-case-detail',{state:'hidden'});assert.equal(await page.evaluate(()=>caseBlobUrls.size),0);assert.equal(await page.locator('#case-file-preview iframe').getAttribute('src'),'about:blank');
    await open();const reopened=await heldPreview(0);held.release();await page.waitForTimeout(80);assert(await page.locator('[data-preview-index="0"]').isDisabled());assert.equal(await page.locator('#case-file-preview canvas').count(),0);
    reopened.release();await rendered();await page.locator('.case-close').click();await page.waitForSelector('#modal-case-detail',{state:'hidden'});assert.equal(await page.evaluate(()=>caseBlobUrls.size),0);
    console.log('PASS Reopening the same request starts a fresh context; old pending data cannot revive or unlock the new preview');

    await open();held=gate();nextGate=held;await page.locator('[data-document-index="0"]').click();await held.entered;
    let downloads=0;page.on('download',()=>downloads++);await page.evaluate(()=>logoutUser());held.release();await page.waitForTimeout(150);
    assert.equal(downloads,0);assert.equal(await page.evaluate(()=>caseBlobUrls.size),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('ipcos_registrations')),null);assert.deepEqual(errors,[]);
    console.log('PASS Delayed private downloads cannot outlive logout; private data is cleared without runtime errors');
    await browser.close();
})().catch(reportFailure);
