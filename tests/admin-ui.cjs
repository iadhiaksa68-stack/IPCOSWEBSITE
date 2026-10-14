const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, reportFailure} = require('./browser.cjs');
const fixture = require('./next-backend.fixture.cjs');
const {previewPdf} = require('./fixtures.cjs');

const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const f = fixture(), calls = [], errors = [], checks = [];
const documentUrl = 'https://drive.google.com/file/d/admin-ui-private/view';
const documentLabel = 'Form ACC Seminar Proposal';
const pdfText = 'Admin UI private document evidence';
const fileNote = 'Please retain the signed page, the full student name, and this exact eCommerce capitalization.';
const statuses = ['ACTION_REQUIRED','Resubmitted','Revision','ALL'];
const widths = [320,390,768,1365];
let nextDocumentGate=null;
function holdDocument() {let started,release;return {entered:new Promise(resolve=>started=resolve),wait:new Promise(resolve=>release=resolve),enter:()=>started(),release:()=>release()};}
const row = (id,nim,name,type,status,date,hasFile=false) => [
    id,date,nim,name,type,
    '<b>Judul:</b> Examining long student-authored titles, international collaboration, and eCommerce communication without changing capitalization',
    hasFile ? `<a href="${documentUrl}">${documentLabel}</a>` : '',status,
    hasFile ? JSON.stringify([{role:'mhs',sender:name,time:date,message:'Original upload',documents:[{url:documentUrl,label:documentLabel,fileName:'signed-form.pdf',version:1}]}]) : '[]'
];
f.rows.splice(1, f.rows.length-1,
    row('qa-pending','A','Queue Alpha — Mahasiswa dengan nama panjang untuk pemeriksaan antarmuka','Proposal','Pending','2026-10-01T01:00:00Z',true),
    row('qa-returned','B','Queue Bravo','Outline','Resubmitted','2026-10-02T01:00:00Z'),
    row('qa-revision','A','Queue Charlie','Proposal','Revision','2026-10-03T01:00:00Z'),
    row('qa-complete','B','Queue Delta','Pendadaran','Accepted','2026-10-04T01:00:00Z'),
    row('qa-journal','A','Queue Echo','Skripsi Jurnal','Pending','2026-10-05T01:00:00Z')
);

function pass(message) { checks.push(message); console.log('PASS '+message); }
async function mock(context) {
    await context.route('**/*', async route => {
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON(); calls.push(data);
            let result;
            if (data.action==='admin_login') result={status:'success',token:'admin'};
            else if (data.action==='get_data') result={status:'success',registrations:f.records(),students:[{NIM:'A',Nama:'Queue Alpha',Status:'Aktif'},{NIM:'B',Nama:'Queue Bravo',Status:'Aktif'}],dosens:[{Nama:'Dosen Uji',Terpakai:0,Maksimal:5}],contents:[],announcements:[],services:[]};
            else if (data.action==='get_review_capabilities') result={status:'success',documentReviewSupported:true,archiveSupported:true};
            else if (data.action==='get_document') {
                assert.equal(data.token,'admin'); assert.equal(data.id,'qa-pending'); assert.equal(data.url,documentUrl);
                const held=nextDocumentGate;nextDocumentGate=null;if(held){held.enter();await held.wait;}
                result={status:'success',fileName:'signed-form.pdf',mimeType:'application/pdf',base64:previewPdf(pdfText,2).toString('base64')};
            } else if (['get_document_review','save_document_review'].includes(data.action)) {
                try { result=f.ctx.nextDispatch(data); } catch (error) { result={status:'error',message:error.message}; }
            } else if (data.action==='logout') result={status:'success'};
            else if (await require('./next-mock.cjs')(route,data)) return;
            else throw Error('Unexpected admin UI fixture action '+data.action);
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if (url.startsWith(origin)) return route.continue();
        if (url.includes('chart.js')) return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){};constructor(){}};'});
        return route.abort();
    });
}
async function mode(page,width,lang,dark) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(({lang,dark})=>{
        if ((currentLang==='en') !== (lang==='en')) toggleLanguage();
        if (document.body.classList.contains('dark-mode') !== dark) toggleDarkMode();
    },{lang,dark});
    await page.waitForFunction(({lang,dark})=>currentLang===lang&&document.body.classList.contains('dark-mode')===dark,{lang,dark});
}
async function layout(page,scope,label) {
    const result = await page.locator(scope).evaluate(root=>{
        const visible=node=>node.getClientRects().length&&!node.closest('[hidden],details:not([open]) > :not(summary)')&&getComputedStyle(node).visibility!=='hidden';
        const clipped=[...root.querySelectorAll('h1,h2,h3,h4,label,summary,button')]
            .filter(node=>visible(node)&&node.clientWidth&&!node.closest('table,.pdf-format-toolbar,.sr-only'))
            .filter(node=>node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).textOverflow!=='ellipsis')
            .map(node=>({id:node.id,text:node.textContent.trim().slice(0,100)}));
        return {overflow:document.documentElement.scrollWidth>innerWidth+2,clipped};
    });
    assert.equal(result.overflow,false,label+' page overflow');
    assert.deepEqual(result.clipped,[],label+' clipped control text');
}
async function selected(page,value) {
    assert.equal(await page.inputValue('#admin-status-filter'),value);
    const pressed = await page.locator('#admin-queue-summary [aria-pressed="true"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.queueStatus));
    assert.deepEqual(pressed,statuses.includes(value)?[value]:[]);
}
async function matrix(page,scope,label) {
    for (const width of widths) for (const lang of ['id','en']) for (const dark of [false,true]) {
        await mode(page,width,lang,dark);
        await layout(page,scope,`${label} ${width}/${lang}/${dark?'dark':'light'}`);
    }
}
async function visibleRequest(page,id) {
    const controls=page.locator(`#admin-data [data-case-id="${id}"]:visible`);
    assert.equal(await controls.count(),1,'One visible request action across desktop/mobile representations');
    return controls;
}
async function footerReachable(page) {
    const footer=page.locator('#case-review-action-footer');
    assert.equal(await footer.count(),1);
    const bounds=await footer.boundingBox(), viewport=page.viewportSize();
    assert(bounds&&bounds.x>=-1&&bounds.x+bounds.width<=viewport.width+1,'Review footer fits the viewport horizontally');
    assert(bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1,'Review footer is reachable without scrolling the document');
    const buttons=footer.locator('button:visible'); assert(await buttons.count()>0);
    for (const button of await buttons.all()) {
        await button.focus(); assert(await button.evaluate(node=>document.activeElement===node));
    }
}

(async () => {
    const browser=await chromium.launch();
    const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
    await mock(context);
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message)); page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin); await page.click('#tab-admin');
    await page.fill('#input-admin-user','fixture'); await page.fill('#input-admin-pass','fixture');
    await page.locator('#input-admin-pass').press('Enter');
    await page.waitForSelector('#welcome-modal',{state:'hidden'});
    await page.waitForFunction(()=>syncPhase==='success'&&window.IPCOSReviewTools.supported()===true);
    await page.locator('[data-nav-target="admin-data"]').click();

    assert.deepEqual(await page.locator('#admin-queue-summary [data-queue-status]').evaluateAll(nodes=>nodes.map(node=>node.dataset.queueStatus)),statuses);
    assert.equal(await page.locator('.queue-presets').count(),0,'Legacy preset row is removed');
    assert.equal(await page.getByRole('searchbox',{name:'Cari Nama / NIM',exact:true}).count(),1);
    assert.equal(await page.locator('#queue-advanced').evaluate(node=>node.open),false);
    assert.equal(await page.locator('#queue-tools').evaluate(node=>node.open),false);
    assert.equal(await page.locator('#admin-status-filter').isVisible(),false,'Native status selection stays inside the disclosed filters');
    await selected(page,'ACTION_REQUIRED');
    await page.locator('[data-queue-status="Resubmitted"]').focus();
    await page.locator('[data-queue-status="Resubmitted"]').press('Enter');
    await selected(page,'Resubmitted');
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.queueStatus),'Resubmitted');
    assert.deepEqual(await page.evaluate(()=>adminFilteredData.map(item=>item.id)),['qa-returned']);
    await page.locator('[data-queue-status="Revision"]').press('Space');
    await selected(page,'Revision');
    assert.deepEqual(await page.evaluate(()=>adminFilteredData.map(item=>item.id)),['qa-revision']);
    await page.locator('[data-queue-status="ALL"]').click();
    await selected(page,'ALL'); assert.equal(await page.evaluate(()=>adminFilteredData.length),5);
    pass('The four queue status controls work with keyboard and expose one selected state without a duplicate preset row');

    await page.fill('#admin-search-input','Queue Alpha');
    await page.waitForFunction(()=>adminFilteredData.length===1&&adminFilteredData[0].id==='qa-pending');
    await page.locator('#queue-advanced>summary').focus(); await page.locator('#queue-advanced>summary').press('Enter');
    assert.equal(await page.locator('#queue-advanced').evaluate(node=>node.open),true);
    await page.selectOption('#admin-status-filter','Pending'); await selected(page,'Pending');
    await page.selectOption('#admin-type-filter','Proposal');
    await page.fill('#admin-date-from','2026-10-09'); await page.fill('#admin-date-to','2026-10-08');
    await page.waitForFunction(()=>!!document.getElementById('queue-date-error').textContent.trim());
    assert.equal(await page.evaluate(()=>adminFilteredData.length),0);
    await page.fill('#admin-date-from','2026-10-01'); await page.fill('#admin-date-to','2026-10-07');
    await page.waitForFunction(()=>adminFilteredData.length===1&&adminFilteredData[0].id==='qa-pending');
    await page.locator('[data-clear-filter="admin-search-input"]').press('Enter');
    assert.equal(await page.inputValue('#admin-search-input'),'');
    await page.locator('[data-clear-all]').press('Enter');
    await selected(page,'ALL'); assert.equal(await page.evaluate(()=>adminFilteredData.length),5);
    assert.equal(await page.inputValue('#admin-type-filter'),''); assert.equal(await page.inputValue('#admin-date-from'),'');
    assert.equal(await page.locator('#queue-advanced').evaluate(node=>node.open),false);
    await page.locator('#queue-advanced>summary').press('Enter');
    await page.locator('#admin-type-filter').focus(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#queue-advanced').evaluate(node=>node.open),false);
    assert(await page.locator('#queue-advanced>summary').evaluate(node=>node===document.activeElement));
    pass('Search, disclosed native status/service/date filters and keyboard removal chips preserve the combined filter behavior');

    await matrix(page,'#admin-data','Admin queue');
    await mode(page,320,'id',false); await visibleRequest(page,'qa-pending');
    await page.waitForFunction(()=>!document.querySelector('#toast-container .toast'));
    await page.screenshot({path:'test-results/admin-ui-queue-mobile.png',fullPage:true,animations:'disabled'});
    await mode(page,1365,'en',true); await visibleRequest(page,'qa-pending');
    await page.locator('#admin-activity-heading .queue-sort-button').press('Enter');
    assert.equal(await page.getAttribute('#admin-activity-heading','aria-sort'),'ascending');
    const ascending=await page.evaluate(()=>adminFilteredData.map(item=>displayDate(getCaseEventTime(item)).getTime()));
    assert(ascending.every((time,index)=>index===0||time>=ascending[index-1]));
    await page.locator('#admin-activity-heading .queue-sort-button').press('Space');
    assert.equal(await page.getAttribute('#admin-activity-heading','aria-sort'),'descending');
    await page.screenshot({path:'test-results/admin-ui-queue-desktop.png',fullPage:true,animations:'disabled'});
    pass('Queue titles, filters and action text fit 320/390/768/1365 widths in both languages and themes');

    await (await visibleRequest(page,'qa-pending')).click();
    await page.waitForSelector('#modal-case-detail.admin-review-mode');
    assert.equal(await page.locator('.admin-review-workspace').count(),1);
    assert.equal(await page.locator('.admin-document-navigation').count(),1);
    assert.equal(await page.locator('.admin-review-rail').count(),1);
    await page.setViewportSize({width:390,height:900});
    const held=holdDocument();nextDocumentGate=held;
    await page.locator('[data-preview-index="0"]').click();
    await held.entered;
    assert.equal(await page.locator('#modal-case-detail').getAttribute('data-workspace-view'),'documents');
    assert(await page.locator('.admin-document-stage').isVisible());
    assert(await page.locator('.admin-review-rail').isHidden(),'The loading document never displays both mobile panes');
    await page.locator('button[data-workspace-view="review"]').click();
    held.release();
    await page.waitForFunction(()=>document.querySelector('#case-file-preview canvas')?.dataset.rendered==='true');
    assert.equal(await page.locator('#modal-case-detail').getAttribute('data-workspace-view'),'review','A late document response does not replace the selected review view');
    assert(await page.locator('.admin-review-rail').isVisible());
    await page.locator('button[data-workspace-view="documents"]').click();
    assert((await page.locator('#case-file-preview .pdf-accessible-text').textContent()).includes(pdfText));
    assert(await page.locator('#case-file-preview canvas').evaluate(canvas=>{
        const context=canvas.getContext('2d'),data=context.getImageData(0,0,canvas.width,canvas.height).data;
        for(let i=0;i<data.length;i+=4)if(data[i]<230&&data[i+1]<230&&data[i+2]<230)return true;
        return false;
    }),'Private PDF contains rendered ink, rather than only a blob URL');
    assert.equal(calls.filter(data=>data.action==='get_document').length,1);
    await page.setViewportSize({width:390,height:900});
    await page.locator('button[data-workspace-view="review"]').press('Enter');
    assert.equal(await page.locator('button[data-workspace-view="review"]').getAttribute('aria-pressed'),'true');
    await page.selectOption('[data-review-status="0"]','revision'); await page.fill('[data-review-note="0"]',fileNote);
    await page.locator('[data-review-note="0"]').evaluate(node=>{node.focus();node.setSelectionRange(7,19);});
    await page.evaluate(()=>toggleLanguage());
    assert.deepEqual(await page.locator('[data-review-note="0"]').evaluate(node=>({value:node.value,focused:node===document.activeElement,start:node.selectionStart,end:node.selectionEnd})),{value:fileNote,focused:true,start:7,end:19});
    await page.locator('button[data-workspace-view="documents"]').press('Enter');
    assert.equal(await page.locator('button[data-workspace-view="documents"]').getAttribute('aria-pressed'),'true');
    assert(await page.locator('#case-file-preview canvas').isVisible());
    await page.locator('button[data-workspace-view="review"]').press('Enter');
    assert.equal(await page.inputValue('[data-review-note="0"]'),fileNote);
    pass('The private PDF renders actual text and pixels; mobile document/review views and language changes retain file notes and caret');

    for(const width of widths)for(const lang of ['id','en'])for(const dark of [false,true]) {
        await mode(page,width,lang,dark);
        if(width<=768)await page.locator('button[data-workspace-view="review"]').click();
        await layout(page,'#modal-case-detail',`Admin workspace ${width}/${lang}/${dark?'dark':'light'}`);
        await footerReachable(page);
        assert.equal(await page.inputValue('[data-review-note="0"]'),fileNote);
    }
    await mode(page,390,'en',true); await page.locator('button[data-workspace-view="review"]').click();
    await page.locator('#case-review-action-footer button[onclick="caseDetailAction(\'revision\')"]').click();
    await page.fill('#case-revision-note','Keep this unsent correction instruction while navigating the review workspace.');
    await footerReachable(page);
    assert(await page.locator('#btn-case-submit').evaluate(node=>!!node.closest('#case-review-action-footer')));
    await page.screenshot({path:'test-results/admin-ui-review-mobile.png',animations:'disabled'});
    pass('The review footer remains visible and keyboard reachable at all four widths while unsent file and action notes remain intact');

    await page.locator('.case-close').click(); await page.waitForSelector('#modal-case-detail',{state:'hidden'});
    await page.waitForFunction(()=>document.activeElement?.dataset.caseId==='qa-pending');
    assert.equal(await page.inputValue('#admin-status-filter'),'ALL');
    await (await visibleRequest(page,'qa-pending')).click();
    await page.locator('button[data-workspace-view="review"]').click();
    await page.locator('[data-restore-review-draft]').click();
    assert.equal(await page.inputValue('[data-review-note="0"]'),fileNote);
    await page.locator('[data-restore-action-draft]').click();
    assert.equal(await page.inputValue('#case-revision-note'),'Keep this unsent correction instruction while navigating the review workspace.');
    assert.equal(await page.locator('#case-review-action-footer').count(),1);
    assert.equal(calls.filter(data=>['save_document_review','update','create','revise_request','archive_request'].includes(data.action)).length,0);
    assert.equal(f.records().find(item=>item.id==='qa-pending').status,'Pending');
    pass('Closing returns focus to the same queue request; reopening restores private notes explicitly without sending a decision');

    await page.evaluate(()=>logoutUser()); await page.waitForSelector('#welcome-modal',{state:'visible'});
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('ipcos_admin_review_drafts')),null);
    assert.equal(await page.evaluate(()=>caseBlobUrls.size),0); assert.deepEqual(errors,[]);
    fs.writeFileSync('test-results/admin-ui-results.json',JSON.stringify({checks,errors,privateReads:calls.filter(data=>data.action==='get_document').length},null,2));
    await browser.close();
})().catch(reportFailure);
