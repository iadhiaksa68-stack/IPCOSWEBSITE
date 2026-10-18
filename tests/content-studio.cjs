const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,reportFailure}=require('./browser.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
const calls=[],errors=[],checks=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
const attack='<img src=x onerror="window.studioAttack=true">';
const long='eCommerce O’Connor '+('Panduan akademik internasional dengan judul panjang dan keterangan yang perlu dibaca lengkap. '.repeat(3));
const types=['magang','skripsi','kurikulum','remidial','kalender','template_berkas','faq'];
const published=new Map(types.map(type=>[type,[
 {title:'Kategori eCommerce O’Connor '+type,titleEn:'eCommerce O’Connor Category '+type,extra:{retained:true},items:[{id:type+'-first',text:type==='kalender'?'30 Oktober 2026':'First eCommerce O’Connor '+attack,textEn:type==='kalender'?'30 October 2026':'First English eCommerce O’Connor '+attack,sub:type==='template_berkas'?'https://example.com/guide.docx':long,subEn:'English '+long,unknown:{literal:attack}}, {id:type+'-second',text:type==='kalender'?'2026-11-10':'Second item',sub:type==='template_berkas'?'#':'Second description',service:'',templateId:'legacy-unavailable',sopSectionId:'legacy-unavailable'}]},
 {title:long,titleEn:long,items:[{id:type+'-third',text:type==='kalender'?'TBA':'Third item '+long,sub:type==='template_berkas'?'#':'Third description'}]}
]]));
let nextSave=null,nextRead=null;
function gate(result='success'){let enter,release;return{result,entered:new Promise(resolve=>enter=resolve),wait:new Promise(resolve=>release=resolve),enter:()=>enter(),release:()=>release()};}
const contents=()=>[...published].map(([Tipe,groups])=>({Tipe,DataJSON:JSON.stringify(groups)}));
async function login(browser,role='admin'){
 const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url.includes('script.google.com/macros/')){
   const data=route.request().postDataJSON();if(await require('./next-mock.cjs')(route,data))return;calls.push(data);let result;
   if(data.action==='admin_login')result={status:'success',token:'admin-test'};
   else if(data.action==='student_login')result={status:'success',token:'student-test',nama:'Student Fixture'};
   else if(data.action==='get_data'){result={status:'success',registrations:[],students:[],dosens:[],announcements:[],services:[],contents:contents(),journeySupported:false};const held=nextRead;nextRead=null;if(held){held.enter();await held.wait;}}
   else if(data.action==='update_content'){
    assert.equal(data.token,'admin-test');assert(types.includes(data.type));
    const held=nextSave;nextSave=null;if(held){held.enter();await held.wait;}
    if(held?.result==='error')result={status:'error',message:'Synthetic save rejected'};
    else{published.set(data.type,JSON.parse(data.content));result={status:'success'};}
   }else if(data.action==='logout')result={status:'success'};
   else throw Error('Unexpected academic request '+data.action);
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});return;
  }
  if(url.startsWith(origin))return route.continue();
  if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){};constructor(){}}'});
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.permit=false;page.on('dialog',dialog=>page.permit?dialog.accept():dialog.dismiss());
 await page.goto(origin);
 if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}
 else{await page.fill('#input-nim','A');await page.locator('#input-nim').press('Enter');}
 await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success');return page;
}
async function open(page,type){await page.evaluate(type=>openContentEditor(type),type);await page.waitForSelector('#modal-edit-content',{state:'visible'});}
async function close(page){await page.evaluate(()=>closeModal('modal-edit-content',true));}
const saves=()=>calls.filter(call=>call.action==='update_content');
const input=(page,g,i,key)=>page.locator('#studio-'+g+'-'+i+'-'+key);
async function layout(page,label){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const result=await page.locator('#modal-edit-content').evaluate(root=>{
  const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&!node.closest('[hidden],details:not([open])>:not(summary)');
  const rect=node=>node.getBoundingClientRect().toJSON();
  return{media:matchMedia('(max-width:850px)').matches,view:root.dataset.studioView,panelsDebug:[...root.querySelectorAll('.content-editor,.content-editor-body,.studio-layout,.studio-editor-scroll,.studio-preview')].map(node=>({class:node.className,box:rect(node),display:getComputedStyle(node).display,flex:getComputedStyle(node).flex,grid:getComputedStyle(node).gridTemplateColumns})),card:rect(root.querySelector('.content-editor')),footer:rect(root.querySelector('.intl-editor-footer')),width:innerWidth,height:innerHeight,
   clipped:[...root.querySelectorAll('h2,h3,h4,p,summary,label,button,strong')].filter(visible).filter(node=>node.clientWidth&&node.scrollWidth>node.clientWidth+3).map(node=>({id:node.id,text:node.textContent.slice(0,80),client:node.clientWidth,scroll:node.scrollWidth,display:getComputedStyle(node).display})),
   controls:[...root.querySelectorAll('button,summary,input,textarea,select')].filter(visible).map(node=>({id:node.id||node.getAttribute('aria-label')||node.textContent.slice(0,70),box:rect(node)})),
   panels:[...root.querySelectorAll('.studio-editor-scroll,.studio-preview')].filter(visible).map(node=>({width:node.clientWidth,scroll:node.scrollWidth}))};
 });
 if(result.clipped.length)console.error('STUDIO LAYOUT',JSON.stringify(result));
 assert(result.card.x>=-1&&result.card.right<=result.width+1,label+' card width');assert(result.card.y>=-1&&result.card.bottom<=result.height+1,label+' card height');assert(result.footer.y>=0&&result.footer.bottom<=result.height+1,label+' visible footer');assert.deepEqual(result.clipped,[],label+' clipped copy');
 for(const panel of result.panels)assert(panel.scroll<=panel.width+2,label+' horizontal panel overflow');
 for(const control of result.controls){assert(control.box.height>=43.9,label+' touch target '+control.id);assert(control.box.x>=-1&&control.box.right<=result.width+1,label+' control width '+control.id);}
}
(async()=>{
 const browser=await chromium.launch(),admin=await login(browser);
 const initial=structuredClone([...published]);
 for(const type of types){await open(admin,type);assert.deepEqual(await admin.evaluate(()=>editorTempData),published.get(type));assert.equal(await admin.locator('[data-studio-group]:visible').count(),1);assert.equal(await admin.locator('#studio-preview-content img,#studio-preview-content script').count(),0);assert.equal(await admin.evaluate(()=>window.studioAttack),undefined);
  if(type!=='kalender')assert((await admin.locator('#studio-preview-content').textContent()).includes(type==='template_berkas'?'https://example.com/guide.docx':type==='faq'?long:long));
  for(const width of[320,390,768,1365])for(const lang of['id','en'])for(const dark of[false,true]){await admin.setViewportSize({width,height:900});await admin.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();document.body.classList.toggle('dark-mode',dark);},{lang,dark});await layout(admin,`${type}/${width}/${lang}/${dark}/editor`);if(width<=850){await admin.click('#studio-view-preview');await layout(admin,`${type}/${width}/${lang}/${dark}/preview`);await admin.click('#studio-view-edit');}}
  await close(admin);
 }
 assert.equal(saves().length,0);assert.deepEqual([...published],initial);pass('Seven content types preserve authored schema and escaped text across 112 bilingual/theme/width layouts; editor/preview and fixed footer fit mobile without publishing');
 await admin.setViewportSize({width:1365,height:900});await admin.evaluate(()=>{if(currentLang!=='id')toggleLanguage();document.body.classList.remove('dark-mode');});await open(admin,'faq');
 const beforeFaq=structuredClone(published.get('faq'));
 await input(admin,0,0,'text').fill('Changed question eCommerce O’Connor '+attack);await input(admin,0,0,'sub').fill('Answer with\nnew line and original CASE.');await admin.selectOption('#studio-preview-language','en');assert((await admin.locator('#studio-preview-content').textContent()).includes('First English eCommerce'));
 await admin.locator('[data-studio-category="1"]').click();await input(admin,1,0,'text').fill('Another category draft');await admin.locator('[data-studio-category="0"]').click();assert.equal(await input(admin,0,0,'sub').inputValue(),'Answer with\nnew line and original CASE.');assert.equal(await admin.locator('#studio-preview-language').inputValue(),'en');
 await admin.locator('[data-studio-details="0:0:translation"] summary').click();await input(admin,0,0,'subEn').fill('English detail draft');await input(admin,0,0,'subEn').evaluate(node=>{node.focus();node.setSelectionRange(3,9);});await admin.evaluate(()=>toggleLanguage());assert.equal(await input(admin,0,0,'subEn').inputValue(),'English detail draft');assert(await input(admin,0,0,'subEn').evaluate(node=>document.activeElement===node&&node.selectionStart===3&&node.selectionEnd===9));assert(await admin.locator('[data-studio-details="0:0:translation"]').evaluate(node=>node.open));
 await admin.locator('[data-studio-move="0:0:1"]').click();const draft=await admin.evaluate(()=>structuredClone(editorTempData));assert.equal(draft[0].items[1].id,beforeFaq[0].items[0].id);assert.deepEqual(draft[0].items[1].unknown,beforeFaq[0].items[0].unknown);assert.equal(draft[0].items[1].subEn,'English detail draft');assert.equal(saves().length,0);
 await admin.click('#studio-close');assert(await admin.locator('#modal-edit-content').isVisible());assert.deepEqual(await admin.evaluate(()=>editorTempData),draft);pass('Category changes, preview language, translation disclosure/caret, item reordering and cancelled close preserve exact draft values, IDs and unknown metadata without writes');
 await close(admin);await open(admin,'template_berkas');await input(admin,0,0,'sub').fill('javascript:alert(1)');await admin.click('[onclick="saveContentChanges()"]');assert.equal(saves().length,0);assert.equal(await input(admin,0,0,'sub').getAttribute('aria-invalid'),'true');assert(await input(admin,0,0,'sub').evaluate(node=>document.activeElement===node));assert.equal(await admin.locator('#studio-preview-content a').count(),0);await input(admin,0,0,'sub').fill('https://example.com/new-guide.docx');assert.equal(await input(admin,0,0,'sub').getAttribute('aria-invalid'),null);
 await admin.click('#studio-add-category');await input(admin,2,-1,'title').fill('');await admin.click('[onclick="saveContentChanges()"]');assert.equal(saves().length,0);assert.equal(await input(admin,2,-1,'title').getAttribute('aria-invalid'),'true');await input(admin,2,-1,'title').fill('New exact category');await admin.locator('[onclick="addContentItem(2)"]').click();await admin.click('[onclick="saveContentChanges()"]');assert.equal(saves().length,0);assert.equal(await input(admin,2,0,'text').getAttribute('aria-invalid'),'true');await input(admin,2,0,'text').fill('New Document');await input(admin,2,0,'sub').fill('#');pass('Invalid new URLs and blank category/item titles block publishing, reveal the exact field, and recover while unavailable document placeholders remain explicit');
 const held=gate('error');nextSave=held;await admin.click('[onclick="saveContentChanges()"]');await held.entered;assert(await admin.locator('[onclick="saveContentChanges()"]').isDisabled());const locked=await admin.evaluate(()=>JSON.stringify(editorTempData));await admin.evaluate(()=>{addContentGroup();addContentItem(0);removeContentItem(0,0);openContentEditor('faq');saveContentChanges();});assert.equal(await admin.evaluate(()=>JSON.stringify(editorTempData)),locked);assert.equal(saves().length,1);held.release();await admin.waitForFunction(()=>!contentSaving);assert(await admin.locator('#studio-feedback').isVisible());assert(await admin.locator('#modal-edit-content').isVisible());assert.equal(await input(admin,2,0,'text').inputValue(),'New Document');
 await admin.evaluate(()=>{isOffline=true;});await admin.click('[onclick="saveContentChanges()"]');assert.equal(saves().length,1);assert((await admin.locator('#studio-feedback').textContent()).toLowerCase().includes('offline'));await admin.evaluate(()=>{isOffline=false;});await admin.click('[onclick="saveContentChanges()"]');await admin.waitForSelector('#modal-edit-content',{state:'hidden'});assert.equal(saves().length,2);assert.equal(published.get('template_berkas')[2].items[0].text,'New Document');assert.equal(published.get('template_berkas')[0].items[0].sub,'https://example.com/new-guide.docx');pass('Busy guards block duplicate/programmatic mutations; rejected and offline saves retain all fields; retry publishes the exact current draft only after API success');
 await open(admin,'faq');await input(admin,0,0,'sub').fill('My retained unsent answer');published.get('faq')[0].items[0].sub='A newer published answer';await admin.evaluate(()=>syncDatabase());await admin.waitForFunction(()=>syncPhase==='success');const count=saves().length;await admin.click('[onclick="saveContentChanges()"]');assert.equal(saves().length,count);assert.equal(await admin.locator('#studio-feedback').getAttribute('data-state'),'conflict');assert.equal(await input(admin,0,0,'sub').inputValue(),'My retained unsent answer');await admin.click('#studio-reload');assert.equal(await input(admin,0,0,'sub').inputValue(),'My retained unsent answer');admin.permit=true;await admin.click('#studio-reload');admin.permit=false;assert.equal(await input(admin,0,0,'sub').inputValue(),'A newer published answer');pass('A newly received published snapshot never overwrites the draft; conflict blocks stale publication and explicit reload requires confirmation');
 await close(admin);await open(admin,'kurikulum');await input(admin,0,0,'sub').fill('Newest confirmed curriculum');const staleRead=gate();nextRead=staleRead;await admin.evaluate(()=>{window.studioReadDone=false;syncDatabase().finally(()=>window.studioReadDone=true);});await staleRead.entered;await admin.click('[onclick="saveContentChanges()"]');await admin.waitForSelector('#modal-edit-content',{state:'hidden'});staleRead.release();await admin.waitForFunction(()=>window.studioReadDone);assert.equal(await admin.evaluate(()=>getChecklistData('kurikulum')[0].items[0].sub),'Newest confirmed curriculum');pass('A content read started before publication cannot replace the confirmed content after its delayed response arrives');
 await close(admin);await open(admin,'magang');await input(admin,0,0,'text').fill('Published despite unavailable device cache');await admin.evaluate(()=>{window.studioOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('ipcos_content_'))throw Error('Synthetic cache unavailable');return window.studioOriginalSet.call(this,key,value);};});await admin.click('[onclick="saveContentChanges()"]');await admin.waitForSelector('#modal-edit-content',{state:'hidden'});assert.equal(published.get('magang')[0].items[0].text,'Published despite unavailable device cache');assert.equal(await admin.evaluate(()=>getChecklistData('magang')[0].items[0].text),'Published despite unavailable device cache');await admin.evaluate(()=>{Storage.prototype.setItem=window.studioOriginalSet;});pass('Confirmed publication stays successful when device caching fails and the current session renders the confirmed content');
 const student=await login(browser,'mhs');await student.evaluate(()=>{openContentEditor('faq');addContentGroup();addContentItem(0);saveContentChanges();});assert.equal(await student.locator('#modal-edit-content').isVisible(),false);
 await open(admin,'faq');await input(admin,0,0,'sub').fill('Private admin draft to discard at logout');const late=gate();nextSave=late;await admin.evaluate(()=>{window.studioSaveDone=false;saveContentChanges().finally(()=>window.studioSaveDone=true);});await late.entered;await admin.evaluate(()=>{currentUser={role:'',nim:'',token:''};sessionStorage.removeItem('ipcos_session');clearPrivateCache();window.dispatchEvent(new Event('ipcos:logout'));});assert.equal(await admin.locator('#editor-ui-container').textContent(),'');assert.equal(await admin.locator('#studio-preview-content').textContent(),'');late.release();await admin.waitForFunction(()=>window.studioSaveDone);assert.equal(await admin.locator('#modal-edit-content').isVisible(),false);assert.equal(await admin.locator('#editor-ui-container').textContent(),'');assert.deepEqual(errors,[]);pass('Students cannot open or mutate the studio; logout clears editor/preview and delayed publication cannot restore the previous admin session');
 fs.writeFileSync('test-results/content-studio-results.json',JSON.stringify({checks,errors,layoutModes:112,types,syntheticApis:true},null,2));await browser.close();
})().catch(reportFailure);
