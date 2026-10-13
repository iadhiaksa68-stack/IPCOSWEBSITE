const {chromium,reportFailure} = require('./browser.cjs');
const assert = require('node:assert/strict');
const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const errors = [];
async function mock(context) {
    await context.route('**/*',async route => {
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON();
            if (await require('./next-mock.cjs')(route,data)) return;
            let result;
            if (data.action === 'student_login') result = {status:'success',token:'student',nama:'Mahasiswa Uji'};
            else if (data.action === 'admin_login') result = {status:'success',token:'admin'};
            else if (data.action === 'get_data') result = {status:'success',registrations:[],students:[],dosens:[{Nama:'Dosen Uji',Terpakai:0,Maksimal:5}],contents:[],announcements:[],services:[]};
            else if (data.action === 'get_journey') result = {status:'success',journey:{checks:{},revision:1}};
            else if (data.action === 'get_backup_status') result = {status:'success',lastBackup:null};
            else throw new Error('Unexpected request '+data.action);
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if (url.startsWith(origin)) return route.continue();
        return route.abort();
    });
}
async function focused(page,selector) { assert(await page.locator(selector).evaluate(node => node === document.activeElement),'Focus should be on '+selector); }
async function boundary(page,selector) {
    const ids = await page.locator(selector).evaluate(modal => [...modal.querySelectorAll('button,a[href],input,textarea,select,summary,iframe,[tabindex]')].filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && !node.closest('[hidden],[inert]')).map(node => node.id || (node.id = 'focus-test-'+Math.random().toString(36).slice(2))));
    assert(ids.length > 0);
    await page.locator('#'+ids.at(-1)).focus(); await page.keyboard.press('Tab'); await focused(page,'#'+ids[0]);
    await page.keyboard.press('Shift+Tab'); await focused(page,'#'+ids.at(-1));
}
(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await mock(context); const page = await context.newPage(); page.on('pageerror',error => errors.push(error.message));
    page.on('requestfailed',request => {if(request.url().startsWith(origin)) console.error('LOCAL RESOURCE FAILURE',request.url(),request.failure()?.errorText);});
    await page.goto(origin);
    assert((await page.locator('#tab-mhs').boundingBox()).height >= 43.99,JSON.stringify(await page.locator('#tab-mhs').evaluate(node => ({height:node.getBoundingClientRect().height,minHeight:getComputedStyle(node).minHeight}))));
    await boundary(page,'#welcome-modal');
    await page.click('#tab-admin'); await page.fill('#input-admin-user','fixture'); await page.fill('#input-admin-pass','fixture'); await page.locator('#input-admin-pass').press('Enter');
    await page.waitForSelector('#welcome-modal',{state:'hidden'}); await page.waitForFunction(() => syncPhase === 'success');
    const searchTrigger = page.locator('.workspace-utilities>button');
    await searchTrigger.click(); await page.waitForSelector('#modal-global-search',{state:'visible'});
    await focused(page,'#global-search-input');
    assert.equal(await page.locator('#modal-global-search').getAttribute('role'),'dialog');
    assert.equal(await page.locator('#global-search-input').getAttribute('aria-label'),'Cari menu, formulir, atau panduan');
    await page.fill('#global-search-input','sop');
    assert(await page.locator('#global-search-results button.search-result').count() > 0);
    await boundary(page,'#modal-global-search');
    assert(await page.locator('#main-workspace').evaluate(node => node.inert));
    await page.keyboard.press('Escape'); await page.waitForSelector('#modal-global-search',{state:'hidden'});
    assert(await searchTrigger.evaluate(node => node === document.activeElement));
    assert.equal(await page.locator('#main-workspace').evaluate(node => node.inert),false);
    console.log('PASS Search controls are named, keyboard accessible, trap focus, and return focus to their trigger');

    await page.evaluate(() => {switchTab(null,'admin-dosen');document.getElementById('add-dosen-nama').focus();openEditDosen('Dosen Uji',0,5);});
    await page.waitForSelector('#modal-edit-dosen',{state:'visible'}); await page.fill('#edit-dosen-terpakai','2');
    assert.equal(await page.locator('label[for="edit-dosen-terpakai"]').count(),1); await boundary(page,'#modal-edit-dosen');
    await page.keyboard.press('Control+k'); await page.waitForSelector('#modal-global-search',{state:'visible'});
    await boundary(page,'#modal-global-search'); await page.keyboard.press('Escape'); await page.waitForSelector('#modal-global-search',{state:'hidden'});
    assert(await page.locator('#modal-edit-dosen').isVisible()); assert.equal(await page.inputValue('#edit-dosen-terpakai'),'2');
    assert(await page.locator('#modal-edit-dosen').evaluate(node => node.contains(document.activeElement)));
    await page.keyboard.press('Escape'); await page.waitForSelector('#modal-edit-dosen',{state:'hidden'}); await focused(page,'#add-dosen-nama');
    console.log('PASS Nested modal Escape closes only the top layer and preserves quota drafts and original focus');

    await page.evaluate(() => {openEditDosen('Dosen Uji',0,5);document.querySelector('#modal-edit-dosen .modal-card').classList.add('document-expanded');document.getElementById('modal-doc-preview').showModal();});
    await page.waitForSelector('#modal-doc-preview',{state:'visible'}); await boundary(page,'#modal-doc-preview');
    await page.keyboard.press('Escape'); await page.waitForSelector('#modal-doc-preview',{state:'hidden'});
    assert(await page.locator('.document-expanded').evaluate(node => node.contains(document.activeElement)));
    assert(await page.locator('#modal-edit-dosen').isVisible());
    await page.evaluate(() => {document.querySelector('#modal-edit-dosen .modal-card').classList.remove('document-expanded');closeModal('modal-edit-dosen',true);});
    await page.waitForSelector('#modal-edit-dosen',{state:'hidden'});
    assert.equal(await page.locator('#main-workspace').evaluate(node => node.inert),false);
    assert.equal(await page.locator('#main-sidebar').evaluate(node => node.inert),true,'The closed mobile drawer keeps its original inert state');
    console.log('PASS Native dialogs take focus above an expanded panel; closing nested layers restores background and drawer accessibility');

    await page.evaluate(() => toggleLanguage()); await searchTrigger.click();
    assert.equal(await page.locator('#global-search-input').getAttribute('aria-label'),'Search menus, forms, or guides');
    assert.equal(await page.locator('.modal-icon-close').first().getAttribute('aria-label'),'Close search');
    await page.keyboard.press('Escape'); await page.waitForSelector('#modal-global-search',{state:'hidden'});
    await page.locator('.notification-toggle').click(); assert.equal(await page.locator('.notification-toggle').getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape'); await focused(page,'.notification-toggle'); assert.equal(await page.locator('.notification-toggle').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('#wa-float-btn').evaluate(node => node.tagName),'A');
    assert.equal(await page.locator('#iframe-doc-viewer').getAttribute('title'),'Document preview');
    assert.equal(await page.evaluate(() => systemText('Draft Proposal')),'Proposal Draft');
    await page.evaluate(() => toggleLanguage());
    assert.equal(await page.evaluate(() => systemText('Draft Proposal')),'Draf Proposal');
    assert.equal(await page.evaluate(() => systemText('Transkrip')),'Transkrip Nilai');
    assert.deepEqual(errors,[]);
    console.log('PASS English accessibility labels, notification Escape, and native contact links work without page errors');
    await browser.close();
})().catch(reportFailure);
