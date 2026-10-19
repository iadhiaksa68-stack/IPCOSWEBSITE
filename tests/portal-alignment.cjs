const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,reportFailure}=require('./browser.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766',errors=[],calls=[];
const doc=type=>({schema:1,type,revision:1,title:'Panduan Akademik',titleEn:'Academic Guide',intro:'Panduan terbit untuk pengujian tampilan portal.',introEn:'Published guidance for portal layout testing.',sections:[{id:'prepare',title:'Persiapan Dokumen',titleEn:'Document Preparation',body:'Periksa kelengkapan dokumen sebelum mengirim pengajuan.',bodyEn:'Check your documents before submitting a request.',links:[],files:[]}]});
async function login(browser,role){
 const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{
  const url=route.request().url();if(url.includes('script.google.com/macros/')){
   const data=route.request().postDataJSON();calls.push(data);if(await require('./next-mock.cjs')(route,data))return;let result;
   if(data.action==='student_login')result={status:'success',token:'student',nama:'Mahasiswa Pengujian'};
   else if(data.action==='admin_login')result={status:'success',token:'admin'};
   else if(data.action==='get_data')result={status:'success',registrations:[{id:'REQ-01',nim:'A',nama:'Mahasiswa Pengujian',jenis:'Outline',status:'Pending',date:'2026-10-18',detail:'Judul penelitian eCommerce',note:'[]',link:''}],students:[{NIM:'A',Nama:'Mahasiswa Pengujian',Status:'Aktif'}],dosens:[],contents:[],announcements:[],services:[]};
   else if(data.action==='get_sop')result={status:'success',document:doc(data.type)};
   else if(data.action==='get_journey')result={status:'success',journey:{checks:{},revision:1}};
   else if(data.action==='get_backup_status')result={status:'success',lastBackup:null};
   else if(data.action==='get_internationalization')result={status:'success',records:[]};
   else if(data.action==='logout')result={status:'success'};
   else throw Error('Unexpected alignment API '+data.action);
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  }
  if(url.startsWith(origin))return route.continue();
  if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.dismiss());await page.goto(origin);
 if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}
 else{await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');}
 await page.waitForFunction(()=>syncPhase==='success');return page;
}
async function layout(page,label,width){
 const state=await page.locator('.tab-content.active').evaluate(root=>{
  const visible=node=>node.getClientRects().length&&node.checkVisibility()&&!node.closest('details:not([open])>:not(summary)');
  const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number),lum=value=>value.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const contrast=node=>{let bg=rgb(getComputedStyle(node).backgroundColor),parent=node.parentElement;while((bg[3]??1)<1&&parent){const behind=rgb(getComputedStyle(parent).backgroundColor),alpha=bg[3]+(behind[3]??1)*(1-bg[3]);if(alpha)bg=[...bg.slice(0,3).map((v,i)=>(v*bg[3]+behind[i]*(behind[3]??1)*(1-bg[3]))/alpha),alpha];parent=parent.parentElement;}const a=lum(rgb(getComputedStyle(node).color)),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  const box=node=>node.getBoundingClientRect().toJSON(),h=root.querySelector('h1'),style=getComputedStyle(h);
  const header=h.closest('header,.page-intro,.student-requests-heading,.supervisor-heading,.resources-heading,.agenda-heading,.notification-heading,.help-heading,.journey-heading,.preparation-heading,.reference-header,.sop-heading');
  return{overflow:document.documentElement.scrollWidth>innerWidth+2,title:{size:parseFloat(style.fontSize),line:parseFloat(style.lineHeight),letter:style.letterSpacing},
   faintHeadings:[...root.querySelectorAll('h1,h2,h3,h4')].filter(visible).filter(n=>contrast(n)<4.5).map(n=>({text:n.textContent.slice(0,70),contrast:contrast(n)})),
   clipped:[...root.querySelectorAll('h1,h2,h3,p,label,button,summary')].filter(n=>visible(n)&&n.clientWidth&&!n.closest('table')&&n.scrollWidth>n.clientWidth+3).map(n=>n.textContent.trim().slice(0,90)),
   fields:[...root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]),select,textarea')].filter(visible).map(n=>({id:n.id,font:parseFloat(getComputedStyle(n).fontSize)})),
   actions:[...root.querySelectorAll('.btn-primary,.btn-secondary')].filter(visible).map(n=>({id:n.id,box:box(n)})),
   titleBox:box(h),headerActions:header?[...header.querySelectorAll('button')].filter(visible).map(box):[]};
 });
 assert.equal(state.overflow,false,label+' viewport overflow');assert.deepEqual(state.clipped,[],label+' clipped text');
 assert.deepEqual(state.faintHeadings,[],label+' heading contrast after theme changes');
 assert.equal(state.title.size,width<=600?26:30,label+' shared title size');assert(Math.abs(state.title.line/state.title.size-1.3)<.01,label+' shared title leading');
 if(width<=600)for(const field of state.fields)assert(field.font>=16,label+' native field zoom '+JSON.stringify(field));
 for(const action of state.actions)assert(action.box.height>=43.99,label+' touch target '+JSON.stringify(action));
 for(const action of state.headerActions){const h=state.titleBox;assert(h.right<=action.left+.5||h.left>=action.right-.5||h.bottom<=action.top+.5||h.top>=action.bottom-.5,label+' title overlaps header action');}
}
(async()=>{
 const browser=await chromium.launch();fs.mkdirSync('test-results',{recursive:true});let layouts=0;
 for(const role of ['mhs','admin']){
  const page=await login(browser,role),tabs=['dashboard',...(role==='admin'?['admin-data','admin-dosen','admin-master','internationalization']:['student-status','pendaftaran','academic-journey']),'magang','skripsi','kurikulum','sop-magang','sop-tugas-akhir','remidial','kalender','templates-faq','feedback','notifications'];
  for(const width of [320,390,768,1365])for(const lang of ['id','en'])for(const dark of [false,true]){
   await page.setViewportSize({width,height:900});await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();document.body.classList.toggle('dark-mode',dark);},{lang,dark});
   await page.waitForFunction(dark=>getComputedStyle(document.body).backgroundColor===(dark?'rgb(17, 20, 27)':'rgb(246, 247, 249)'),dark);
   for(const tab of tabs){await page.evaluate(tab=>switchTab(null,tab),tab);if(tab.startsWith('sop-'))await page.waitForSelector('.tab-content.active .sop-heading');await layout(page,`${role}/${tab}/${width}/${lang}/${dark}`,width);layouts++;}
  }
  await page.setViewportSize({width:1365,height:900});await page.evaluate(role=>{if(currentLang!=='id')toggleLanguage();document.body.classList.remove('dark-mode');switchTab(null,role==='admin'?'admin-data':'dashboard');},role);
  await page.waitForFunction(()=>getComputedStyle(document.body).color==='rgb(48, 52, 65)');
  await page.evaluate(()=>document.getElementById('toast-container').replaceChildren());
  await page.screenshot({path:`test-results/alignment-${role}-desktop.png`});
  await page.setViewportSize({width:390,height:844});await page.evaluate(role=>{document.body.classList.add('dark-mode');switchTab(null,role==='admin'?'admin-data':'feedback');},role);
  await page.waitForFunction(()=>getComputedStyle(document.body).color==='rgb(217, 221, 230)');
  await page.screenshot({path:`test-results/alignment-${role}-mobile.png`});
  // Shared controls retain visible focus and validation in both themes.
  await page.evaluate(()=>{switchTab(null,'feedback');document.getElementById('help-description').focus();document.getElementById('help-description').setAttribute('aria-invalid','true');});
  for(const dark of [false,true]){
   await page.evaluate(dark=>document.body.classList.toggle('dark-mode',dark),dark);
   await page.waitForFunction(dark=>getComputedStyle(document.getElementById('help-description')).borderColor===(dark?'rgb(255, 182, 197)':'rgb(165, 42, 62)'),dark);
   const field=await page.locator('#help-description').evaluate(n=>({font:getComputedStyle(n).fontSize,border:getComputedStyle(n).borderInlineStartWidth,color:getComputedStyle(n).borderColor}));
   assert.equal(field.font,'16px');assert.equal(field.border,'3px');assert.equal(field.color,dark?'rgb(255, 182, 197)':'rgb(165, 42, 62)');
   for(const state of ['busy','error','success']){
    await page.evaluate(state=>IPCOSExperience.feedback('Pesan pengujian tampilan portal',state),state);
    const feedback=await page.locator('#feedback .operation-feedback').evaluate(n=>({state:n.dataset.state,border:getComputedStyle(n).borderInlineStartWidth,font:getComputedStyle(n).fontSize,text:n.textContent}));
    assert.equal(feedback.state,state);assert.equal(feedback.border,'3px');assert.equal(feedback.font,'14px');assert(feedback.text.includes('pengujian'));
   }
  }
  await page.context().close();
 }
 assert.deepEqual(errors,[]);assert(!calls.some(c=>['create','update','update_content','post_announcement','save_sop'].includes(c.action)));
 console.log(`PASS ${layouts} portal layouts share title hierarchy, readable native fields and reachable actions across both roles, four widths, two languages and two themes`);
 console.log('PASS Focus, validation and persistent operation states remain visible in both themes; no academic writes or browser errors');
 await browser.close();
})().catch(reportFailure);
