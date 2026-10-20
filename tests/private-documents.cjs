const {chromium,reportFailure}=require('./browser.cjs');
const assert=require('node:assert/strict');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
const firstUrl='https://drive.google.com/file/d/owned/view',secondUrl='https://drive.google.com/file/d/second/view';
const externalUrl='https://example.com/private-original.pdf';
const record={id:'mine',nim:'A',nama:'Mahasiswa Uji',jenis:'Proposal',status:'Pending',date:new Date().toISOString(),detail:'Judul',link:`<a href="${firstUrl}">Form ACC</a><a href="${secondUrl}">Dokumen Kedua</a><a href="${externalUrl}">Berkas Eksternal</a>`,note:'[]'};
const errors=[],calls=[];let nextGate=null,failReader=true,readerRetries=0,externalReads=0;
function gate(error=false){let release,entered;return {error,wait:new Promise(resolve=>release=resolve),entered:new Promise(resolve=>entered=resolve),release:()=>release(),enter:()=>entered()};}
(async()=>{
    const browser=await chromium.launch(),context=await browser.newContext({reducedMotion:'reduce'});
    await context.route('**/*',async route=>{
        const url=route.request().url();
        if(url.includes('/vendor/pdfjs/pdf.min.mjs')){if(failReader){failReader=false;return route.abort();}if(url.includes('?retry='))readerRetries++;return route.continue();}
        if(url===externalUrl){externalReads++;return route.abort();}
        if(url===firstUrl)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Original test document</title><p>Original owned document fixture</p>'});
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
    held.release();await page.waitForSelector('[data-document-retry]:not([hidden])');assert.equal(await page.locator('#case-file-preview canvas[data-rendered=true]').count(),0);assert((await page.locator('#case-file-preview>.field-helper:not(.pdf-search-status)').textContent()).includes('could not load'));
    await page.locator('[data-document-retry]').click();await rendered();assert.equal(readerRetries,1);assert.equal(calls.length,requestCount,'Reloading the reader reuses authenticated bytes');assert(!await page.locator('[data-preview-index="0"]').isDisabled());assert.equal(await page.evaluate(()=>caseBlobUrls.size),1);
    console.log('PASS A failed PDF module load recovers on Reload Preview without a page refresh or another private API request');
    assert.equal(await page.locator('[data-preview-index="0"]').getAttribute('aria-busy'),null);await page.evaluate(()=>toggleLanguage());
    const download=page.waitForEvent('download');await page.locator('[data-document-index="0"]').click();assert.equal((await download).suggestedFilename(),'private.pdf');assert.equal(calls.length,requestCount+1,'Download keeps its separate authenticated request');
    console.log('PASS Repeated private preview intent sends one authenticated request; busy controls survive language changes, recover and keep downloads separate');

    held=await heldPreview(0,true);held.release();await page.waitForFunction(()=>!document.querySelector('[data-preview-index="0"]').disabled);
    assert.equal(await page.evaluate(()=>caseBlobUrls.size),0);assert((await page.locator('#case-file-preview>.field-helper:not(.pdf-search-status)').textContent()).includes('belum dapat dimuat'));
    assert.equal(await page.locator('.case-preview-context a').getAttribute('href'),firstUrl);assert.equal(await page.locator('.case-preview-context a').getAttribute('rel'),'noopener noreferrer');assert(await page.locator('[data-case-preview-retry]').isVisible());assert.equal(await page.locator('#case-file-preview').getAttribute('aria-busy'),'false');
    const originalPage=context.waitForEvent('page');await page.locator('.case-preview-context a').click();const opened=await originalPage;await opened.waitForSelector('p');assert.equal(await opened.locator('p').textContent(),'Original owned document fixture');assert.equal(opened.url(),firstUrl);await opened.close();
    for(const width of [320,390,768,1365])for(const lang of ['id','en'])for(const dark of [false,true]){
        await page.setViewportSize({width,height:900});await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();document.body.classList.toggle('dark-mode',dark);},{lang,dark});
        const layout=await page.locator('.case-preview-context').evaluate(root=>({overflow:document.documentElement.scrollWidth>innerWidth+2,clipped:[...root.querySelectorAll('h4,a,button')].filter(n=>n.checkVisibility()&&n.scrollWidth>n.clientWidth+3).map(n=>n.textContent),heights:[...root.querySelectorAll('a,button')].filter(n=>n.checkVisibility()).map(n=>n.getBoundingClientRect().height)}));
        assert.equal(layout.overflow,false);assert.deepEqual(layout.clipped,[]);assert(layout.heights.every(height=>height>=43.99));
    }
    await page.evaluate(()=>{if(currentLang!=='id')toggleLanguage();});
    await page.evaluate(()=>toggleLanguage());assert((await page.locator('#case-file-preview>.field-helper:not(.pdf-search-status)').textContent()).includes('could not be loaded'));assert.equal(await page.locator('[data-case-preview-retry]').textContent(),'Try Again');await page.evaluate(()=>toggleLanguage());
    await page.locator('[data-case-preview-retry]').click();await rendered();assert.equal(await page.evaluate(()=>caseBlobUrls.size),1);
    console.log('PASS Failed previews release busy state and allow a clean retry without retained private URLs');
    console.log('PASS Original-file action opens the correct owned source in a new tab; recovery text and touch controls fit 16 screen/language/theme combinations');
    require('node:fs').mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/case-preview-desktop.png'});
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.body.classList.add('dark-mode'));await page.screenshot({path:'test-results/case-preview-mobile.png'});await page.setViewportSize({width:1365,height:900});
    const countBeforeExternal=calls.length;await page.locator('[data-preview-index="2"]').click();assert.equal(calls.length,countBeforeExternal);assert.equal(await page.locator('.case-preview-context a').getAttribute('href'),externalUrl);assert.equal(await page.locator('#case-file-preview iframe').getAttribute('src'),'about:blank');assert.equal(externalReads,0);assert.equal(await page.locator('#case-file-preview .case-preview-context').count(),1);
    console.log('PASS External files offer their exact original source without attempting a blocked embedded viewer');

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
