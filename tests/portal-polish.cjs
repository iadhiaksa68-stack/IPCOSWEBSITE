const {chromium,reportFailure} = require('./browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.IPCOS_TEST_BASE_URL || 'http://127.0.0.1:8766';
const errors = [], calls = [];
const records = [{id:'request-A',nim:'A',nama:'Mahasiswa Uji',jenis:'Proposal',status:'Pending',date:'2026-01-01T01:00:00Z',detail:'Judul penelitian mahasiswa',link:'',note:'[]'}];
let announcements = [{Id:'announcement-one',Pesan:'Pengumuman akademik untuk mahasiswa.\n'+('Periksa kembali dokumen dan jadwal akademik Anda. '.repeat(5)),Tipe:'info'}];
let failPost = false, holdPost = false, releasePost, holdRead = false, releaseRead;
async function mock(context) {
    await context.route('**/*',async route => {
        const url = route.request().url();
        if (url.includes('script.google.com/macros/')) {
            const data = route.request().postDataJSON();
            if (await require('./next-mock.cjs')(route,data)) return;
            calls.push(data); let result;
            if (data.action === 'admin_login') result = {status:'success',token:'admin'};
            else if (data.action === 'student_login') result = {status:'success',token:'student-A',nama:'Mahasiswa Uji'};
            else if (data.action === 'get_data') {
                if (holdRead) {holdRead=false; await new Promise(resolve => releaseRead=resolve);}
                result = {status:'success',registrations:structuredClone(records),students:[{NIM:'A',Nama:'Mahasiswa Uji',Status:'Aktif'}],dosens:[],contents:[],announcements:structuredClone(announcements),services:[]};
            } else if (data.action === 'post_announcement') {
                if (holdPost) {holdPost=false; await new Promise(resolve => releasePost=resolve);}
                if (failPost) {failPost=false; result={status:'error',message:'Gangguan pengiriman uji'};}
                else {announcements.push({Id:'announcement-'+announcements.length,Pesan:data.message,Tipe:data.type});result={status:'success'};}
            } else if (data.action === 'get_journey') result={status:'success',journey:{checks:{},revision:1}};
            else if (data.action === 'get_backup_status') result={status:'success',lastBackup:null};
            else if (data.action === 'logout') result={status:'success'};
            else throw Error('Unexpected mocked API action '+data.action);
            return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
        }
        if (url.startsWith(origin)) return route.continue();
        if (url.includes('chart.js')) return route.fulfill({contentType:'text/javascript',body:'window.Chart=class {static defaults={font:{}};destroy(){};constructor(){}};'});
        return route.abort();
    });
}
async function login(page,role) {
    await page.goto(origin);
    if (role === 'admin') {await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}
    else {await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');}
    await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(() => syncPhase === 'success');
}
async function presentation(page,selector) {
    return page.locator(selector).evaluate(node => {
        const rgba = value => {const values=value.match(/[\d.]+/g)?.map(Number)||[];return [values[0]||0,values[1]||0,values[2]||0,values.length>3?values[3]:1];};
        const luminance = rgb => rgb.slice(0,3).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}).reduce((total,value,index)=>total+value*[.2126,.7152,.0722][index],0);
        const style=getComputedStyle(node),fg=rgba(style.color);let bg=rgba(style.backgroundColor),ancestor=node.parentElement;
        while (bg[3]<1 && ancestor) {const behind=rgba(getComputedStyle(ancestor).backgroundColor),alpha=bg[3]+behind[3]*(1-bg[3]);if(alpha>0)bg=[...bg.slice(0,3).map((value,index)=>(value*bg[3]+behind[index]*behind[3]*(1-bg[3]))/alpha),alpha];ancestor=ancestor.parentElement;}
        if (bg[3]<1) bg=[...bg.slice(0,3).map(value=>value*bg[3]+255*(1-bg[3])),1];
        const l1=luminance(fg),l2=luminance(bg),box=node.getBoundingClientRect();
        return {contrast:(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),height:box.height,clipped:node.scrollWidth>node.clientWidth+2,color:style.color,background:style.backgroundColor};
    });
}
async function layout(page,label) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth+1),false,label+' viewport overflow');
    const clipped=await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,label,button,summary,.request-state-next')].filter(node=>node.getClientRects().length&&!node.closest('table')&&!node.classList.contains('sr-only')).filter(node=>node.scrollWidth>node.clientWidth+3).map(node=>node.textContent.trim().slice(0,80)));
    assert.deepEqual(clipped,[],label+' clipped text');
}
async function noTiming(page,tab) {
    await page.evaluate(tab => switchTab(null,tab),tab);
    if (tab === 'dashboard') await page.evaluate(() => document.querySelector('.dashboard-secondary').open=true);
    assert.equal(await page.locator('.tab-content.active :is(.request-state-details,.request-state-target,.request-state-owner,.waiting-badge,.waiting-overdue)').count(),0,tab+' has no timing details or duplicate owner labels');
    assert.equal(await page.locator('.tab-content.active').evaluate(node => /Rincian waktu|Timing details/.test(node.textContent)),false);
}
(async () => {
    const browser=await chromium.launch(), context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});await mock(context);
    const admin=await context.newPage();admin.on('pageerror',error=>errors.push(error.message));admin.on('dialog',dialog=>dialog.accept());await login(admin,'admin');
    for (const width of [320,390,1365]) for (const lang of ['id','en']) for (const dark of [false,true]) {
        await admin.setViewportSize({width,height:900});await admin.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();document.body.classList.toggle('dark-mode',dark);},{lang,dark});
        for (const tab of ['dashboard','admin-master']) {
            await noTiming(admin,tab);await layout(admin,'admin '+tab+' '+width+' '+lang+' '+dark);
            const selector=tab==='dashboard'?'#input-broadcast-dashboard':'#input-broadcast',state=await presentation(admin,selector),button=await presentation(admin,tab==='dashboard'?'.card-broadcast-admin .announcement-submit':'.announcement-management .announcement-submit');
            assert(state.contrast>=4.5,'Broadcast text contrast: '+JSON.stringify(state));assert(button.contrast>=4.5,'Broadcast button contrast: '+JSON.stringify(button));assert(button.height>=43.99);
        }
    }
    fs.mkdirSync('test-results',{recursive:true});await admin.setViewportSize({width:390,height:844});await admin.evaluate(()=>{document.getElementById('toast-container').replaceChildren();if(currentLang!=='id')toggleLanguage();document.body.classList.add('dark-mode');switchTab(null,'admin-master');});await admin.fill('#input-broadcast','Pengumuman akademik tetap terbaca dalam mode gelap.');await admin.locator('.announcement-management').screenshot({path:'test-results/broadcast-dark-mobile.png'});
    await admin.setViewportSize({width:1365,height:900});await admin.evaluate(()=>{switchTab(null,'dashboard');document.querySelector('.dashboard-secondary').open=true;});await admin.locator('.card-broadcast-admin').screenshot({path:'test-results/broadcast-dark-desktop.png'});
    console.log('PASS Admin broadcast composers have readable contrast, labels and 44px controls at three widths in both languages and themes');

    await admin.fill('#input-broadcast-dashboard','Pesan gagal tetap tersedia.');failPost=true;await admin.locator('#input-broadcast-dashboard').press('Enter');await admin.waitForFunction(()=>!postingAnnouncement);assert.equal(await admin.inputValue('#input-broadcast-dashboard'),'Pesan gagal tetap tersedia.');
    holdPost=true;releasePost=null;await admin.evaluate(()=>{window.announcementTest=postAnnouncementFromDashboard();});await admin.waitForFunction(()=>postingAnnouncement);while(!releasePost)await new Promise(resolve=>setTimeout(resolve,10));assert(await admin.locator('.card-broadcast-admin .announcement-submit').isDisabled());
    const postCount=calls.filter(call=>call.action==='post_announcement').length;await admin.evaluate(()=>postAnnouncementFromDashboard());assert.equal(calls.filter(call=>call.action==='post_announcement').length,postCount);
    await admin.evaluate(()=>document.getElementById('input-broadcast-dashboard').value='Draf berikutnya tetap tersedia.');releasePost();await admin.evaluate(()=>window.announcementTest);assert.equal(await admin.inputValue('#input-broadcast-dashboard'),'Draf berikutnya tetap tersedia.');assert(!await admin.locator('.card-broadcast-admin .announcement-submit').isDisabled());
    await admin.evaluate(()=>switchTab(null,'admin-master'));await admin.fill('#input-broadcast','Pengumuman penting uji.');await admin.check('#check-important-broadcast');await admin.locator('.announcement-management .announcement-submit').click();await admin.waitForFunction(()=>!postingAnnouncement);assert.equal(calls.filter(call=>call.action==='post_announcement').at(-1).type,'important');assert.equal(await admin.inputValue('#input-broadcast'),'');assert.equal(await admin.isChecked('#check-important-broadcast'),false);
    console.log('PASS Keyboard submission, duplicate prevention, failed-message retention, edited draft retention, and important broadcasts use mocked API acknowledgements');

    await admin.evaluate(()=>switchTab(null,'dashboard'));await admin.fill('#input-broadcast-dashboard','Pesan sesi lama.');holdRead=true;releaseRead=null;await admin.evaluate(()=>{window.oldAnnouncementTest=postAnnouncementFromDashboard();});while(!releaseRead)await new Promise(resolve=>setTimeout(resolve,10));await admin.evaluate(()=>logoutUser());await admin.waitForSelector('#welcome-modal',{state:'visible'});assert(!await admin.locator('.announcement-submit').first().isDisabled());await login(admin,'admin');await admin.evaluate(()=>document.querySelector('.dashboard-secondary').open=true);await admin.fill('#input-broadcast-dashboard','Draf sesi baru.');releaseRead();await admin.evaluate(()=>window.oldAnnouncementTest);assert.equal(await admin.inputValue('#input-broadcast-dashboard'),'Draf sesi baru.');
    console.log('PASS A late acknowledgement or refresh from a previous session cannot erase the new admin draft or keep publish controls disabled');

    announcements=[{Id:'readability-announcement',Pesan:'Pengumuman akademik untuk seluruh mahasiswa.\n'+('Simpan dokumen Anda dan periksa jadwal akademik. '.repeat(4)),Tipe:'info'}];
    const student=await context.newPage();student.on('pageerror',error=>errors.push(error.message));student.on('dialog',dialog=>dialog.accept());await login(student,'mhs');
    for (const width of [320,390,1365]) for (const lang of ['id','en']) for (const dark of [false,true]) {
        await student.setViewportSize({width,height:900});await student.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();document.body.classList.toggle('dark-mode',dark);},{lang,dark});
        for (const tab of ['dashboard','student-status']) {await noTiming(student,tab);await layout(student,'student '+tab+' '+width+' '+lang+' '+dark);}
        const banner=await presentation(student,'#announcement-text');assert(banner.contrast>=4.5,'Announcement contrast '+JSON.stringify(banner));
    }
    const beforeStudentPost=calls.filter(call=>call.action==='post_announcement').length;await student.evaluate(()=>postAnnouncement('Unauthorized fixture','info'));assert.equal(calls.filter(call=>call.action==='post_announcement').length,beforeStudentPost);
    await student.locator('.announcement-dismiss').click();await student.evaluate(()=>syncDatabase());assert(await student.locator('#announcement-banner').isHidden());
    await student.evaluate(()=>openCaseDetail('request-A'));assert.equal(await student.locator('#case-detail-content :is(.request-state-details,.request-state-target,.request-state-owner,.waiting-badge,.waiting-overdue)').count(),0);await student.evaluate(()=>closeModal('modal-case-detail',true));
    await admin.evaluate(()=>{switchTab(null,'admin-data');openCaseDetail('request-A');});assert.equal(await admin.locator('#case-detail-content :is(.request-state-details,.request-state-target,.request-state-owner,.waiting-badge,.waiting-overdue)').count(),0);await admin.evaluate(()=>closeModal('modal-case-detail',true));await noTiming(admin,'admin-data');
    console.log('PASS Student announcements remain readable and dismissed banners stay dismissed; both roles have concise status cards and student broadcast calls are rejected');
    assert.deepEqual(errors,[]);await browser.close();
})().catch(reportFailure);
