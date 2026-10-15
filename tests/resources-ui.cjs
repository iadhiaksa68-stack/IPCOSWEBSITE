const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,reportFailure}=require('./browser.cjs');
const {pdf}=require('./fixtures.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
const calls=[],errors=[],checks=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
const safePdf='https://files.example.test/transcript.pdf';
const safeDocx='https://files.example.test/proposal.docx';
const drive='https://drive.google.com/file/d/resource-template/view';
const safeHtml='https://files.example.test/signed-form.pdf';
const html='<img src=x onerror="window.resourceAttack=true">';
const long='Persyaratan dokumen akademik untuk mahasiswa internasional dan penelitian komunikasi digital lintas budaya '.repeat(3);
const initialTemplates=[
 {title:'Outline & Proposal',titleEn:'Outline & Proposal',items:[
  {id:'duplicate',text:'Transkrip Nilai (.pdf)',textEn:'Transcript (.pdf)',sub:safePdf},
  {id:'duplicate',text:'Draf Proposal (.docx)',textEn:'Proposal Draft (.docx)',sub:safeDocx},
  {id:'模板',text:'Panduan Outline eCommerce',textEn:'eCommerce Outline Guide',sub:drive}
 ]},
 {title:'Magang',titleEn:'Internship',items:[
  {id:'missing',text:'Template Logbook belum tersedia',textEn:'Logbook Template Unavailable',sub:'#'},
  {id:'missing',text:'Tautan tidak aman',textEn:'Unsafe Link',sub:'javascript:window.resourceAttack=true'},
  {id:'data',text:'Tautan data tidak aman',textEn:'Unsafe Data Link',sub:'data:text/html,<script>window.resourceAttack=true</script>'},
  {id:'raw',text:'Tautan belum diisi dengan benar',textEn:'Incomplete Link',sub:'bukan-tautan'},
  {id:'安全',text:html+' '+long,textEn:html+' '+long,sub:safeHtml}
 ]}
];
const firstQuestion='Bagaimana menyiapkan Transkrip Nilai?';
const firstQuestionEn='How do I prepare my transcript?';
const stableQuestion='Bagaimana merevisi draf Proposal?';
const stableQuestionEn='How do I revise my proposal draft?';
const initialFaq=[
 {title:'Outline & Proposal',titleEn:'Outline & Proposal',items:[
  {id:'duplicate',text:firstQuestion,textEn:firstQuestionEn,sub:'Gunakan dokumen asli dan periksa nama serta tanda tangan. '+long,subEn:'Use the original document and check the name and signature. '+long},
  {id:'duplicate',text:stableQuestion,textEn:stableQuestionEn,sub:'Tulis catatan eCommerce secara tepat. '+html,subEn:'Keep the exact eCommerce capitalization. '+html},
  {id:'問題',text:'Bagaimana mempersiapkan Outline?',textEn:'How do I prepare an Outline?',sub:'Baca persyaratan Outline terlebih dahulu.',subEn:'Read the Outline requirements first.'}
 ]},
 {title:'Magang',titleEn:'Internship',items:[{id:'duplicate',text:'Kapan logbook Magang dilengkapi?',textEn:'When should I complete my internship logbook?',sub:'Ikuti jadwal dan ketentuan program studi.',subEn:'Follow the schedule and program requirements.'}]},
 {title:'Pertanyaan Umum',titleEn:'General Questions',items:[{id:'問題',text:html+' '+long,textEn:html+' '+long,sub:html,subEn:html}]}
];
let templates=structuredClone(initialTemplates),faq=structuredClone(initialFaq),nextRead=null;
function gate(){let enter,release;return{entered:new Promise(resolve=>enter=resolve),wait:new Promise(resolve=>release=resolve),enter:()=>enter(),release:()=>release()};}
const sourceContents=()=>[{Tipe:'template_berkas',DataJSON:JSON.stringify(templates)},{Tipe:'faq',DataJSON:JSON.stringify(faq)}];
async function mode(page,width,lang,dark){await page.setViewportSize({width,height:900});await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();if(document.body.classList.contains('dark-mode')!==dark)toggleDarkMode();},{lang,dark});}
async function counts(page,documents,questions){
 await page.waitForFunction(({documents,questions})=>{const count=selector=>[...document.querySelectorAll(selector)].filter(node=>node.getClientRects().length&&!node.closest('[hidden]')).length;return count('#template_berkas-content-container [data-resource-template]')===documents&&count('#faq-content-container [data-resource-faq]')===questions;},{documents,questions},{timeout:5000});
 for(const[id,expected]of[['resource-template-count',documents],['resource-faq-count',questions]])assert.equal(Number((await page.locator('#'+id).textContent()).match(/\d+/)?.[0]),expected,id+' reflects filtered entries');
 assert.deepEqual(((await page.locator('#resource-result-count').textContent()).match(/\d+/g)||[]).map(Number),[documents,questions],'The shared live count agrees with both panels');
}
async function rawUnchanged(page){assert.deepEqual(await page.evaluate(()=>({templates:getChecklistData('template_berkas'),faq:getChecklistData('faq')})),{templates,faq},'Filtering and presentation never rewrite source content');}
async function layout(page,label){
 const state=await page.locator('#templates-faq').evaluate(root=>{
  const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&!node.closest('[hidden],details:not([open])>:not(summary)');
  const clipped=[...root.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,a,strong')].filter(node=>visible(node)&&node.clientWidth&&!node.classList.contains('sr-only')).filter(node=>node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).textOverflow!=='ellipsis').map(node=>({id:node.id,text:node.textContent.trim().slice(0,90)}));
  const controls=[...root.querySelectorAll('button,summary,a[data-resource-open]')].filter(visible).map(node=>({text:node.textContent.trim().slice(0,70),box:node.getBoundingClientRect().toJSON()}));
  return{overflow:document.documentElement.scrollWidth>innerWidth+2,clipped,controls};
 });
 assert.equal(state.overflow,false,label+' viewport overflow');assert.deepEqual(state.clipped,[],label+' clipped labels');
 for(const{text,box}of state.controls){assert(box.height>=43.99,label+' 44px control '+text);assert(box.left>=-1&&box.right<=page.viewportSize().width+1,label+' control fits horizontally '+text);}
}
async function matrix(page,label){for(const width of[320,390,768,1365])for(const lang of['id','en'])for(const dark of[false,true]){await mode(page,width,lang,dark);await layout(page,`${label} ${width}/${lang}/${dark}`);await rawUnchanged(page);}}
const question=(page,text)=>page.locator('#faq-content-container [data-resource-faq]').filter({hasText:text});
async function templateCategory(page,label){const value=await page.locator('#resource-category optgroup').evaluateAll((nodes,label)=>nodes.filter(node=>/template/i.test(node.label)).flatMap(node=>[...node.querySelectorAll('option')]).find(option=>option.textContent.includes(label))?.value,label);assert(value,'The source template category is selectable: '+label);await page.selectOption('#resource-category',value);}
async function sameRegistration(page){assert.equal(await page.inputValue('#reg-judul'),'eCommerce dan partisipasi mahasiswa O’Connor');assert.equal(await page.inputValue('#reg-jenis-utama'),'Outline');assert(await page.evaluate(()=>window.resourcesRegistrationFiles.every(({id,input,file})=>input===document.getElementById(id)&&file===document.getElementById(id).files[0])),'The same input nodes and exact File objects survive the guide detour');assert.equal(await page.evaluate(()=>registrationDirty),true);}
async function login(browser,role='mhs',nim='A'){
 const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{const url=route.request().url();if(url.includes('script.google.com/macros/')){const data=route.request().postDataJSON();calls.push(data);let result;
  if(data.action==='student_login')result={status:'success',token:'student-'+data.nim,nama:'Mahasiswa Internasional O’Connor'};
  else if(data.action==='admin_login')result={status:'success',token:'admin'};
  else if(data.action==='get_data'){result={status:'success',registrations:[],students:[],dosens:[],announcements:[],services:[],contents:sourceContents()};const held=nextRead;nextRead=null;if(held){held.enter();await held.wait;}}
  else if(data.action==='get_journey')result={status:'success',journey:{exists:true,checks:{},revision:1}};
  else if(data.action==='logout')result={status:'success'};
  else if(await require('./next-mock.cjs')(route,data))return;
  else throw Error('Unexpected resources UI API '+data.action);
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 }if(url.startsWith(origin))return route.continue();if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});return route.abort();});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.goto(origin);
 if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}else{await page.fill('#input-nim',nim);await page.locator('#input-nim').press('Enter');}
 await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success');await page.evaluate(()=>switchTab(null,'templates-faq'));return page;
}

(async()=>{
 const browser=await chromium.launch(),student=await login(browser);
 for(const id of['resource-search','resource-category'])assert(await student.locator('#'+id).evaluate(node=>!!(node.labels?.length||node.getAttribute('aria-label')||node.getAttribute('aria-labelledby'))),id+' has an accessible label');
 await counts(student,8,5);await rawUnchanged(student);
 const links=await student.locator('#template_berkas-content-container a[data-resource-open]').evaluateAll(nodes=>nodes.map(node=>({href:node.href,target:node.target,rel:node.rel})));
 assert.deepEqual(links.map(link=>link.href).sort(),[safePdf,safeDocx,drive,safeHtml].sort(),'Only genuine safe external links are actionable');
 assert(links.every(link=>link.target==='_blank'&&link.rel.includes('noopener')&&link.rel.includes('noreferrer')));
 assert.equal(await student.locator('#template_berkas-content-container [data-resource-unavailable]').count(),4);
 assert.equal(await student.locator('#templates-faq img,#templates-faq script').count(),0);assert.equal(await student.evaluate(()=>window.resourceAttack),undefined);
 assert((await student.locator('#templates-faq').textContent()).includes(html),'Unsafe authored markup is shown literally');
 const pdfEntry=student.locator('[data-resource-template]').filter({has:student.locator('a[href="'+safePdf+'"]')});assert.match(await pdfEntry.locator('.resource-template-format').textContent(),/PDF/i);
 const docxEntry=student.locator('[data-resource-template]').filter({has:student.locator('a[href="'+safeDocx+'"]')});assert.match(await docxEntry.locator('.resource-template-format').textContent(),/DOCX/i);
 const unknown=student.locator('[data-resource-template]').filter({has:student.locator('a[href="'+drive+'"]')});assert.doesNotMatch(await unknown.locator('.resource-template-format').textContent(),/\b(PDF|DOCX?|ZIP|RAR)\b/i,'An opaque Drive URL must not imply a file format');
 const ids=await student.locator('#templates-faq [id]').evaluateAll(nodes=>nodes.map(node=>node.id));assert.equal(new Set(ids).size,ids.length,'Duplicate and non-Latin content IDs never create duplicate DOM IDs');
 await matrix(student,'populated resources');
 pass('Bilingual resources preserve source content, show honest formats/availability, escape authored HTML, and fit all 16 modes with safe links and unique IDs');

 await mode(student,1365,'id',false);await student.fill('#resource-search','  TRANSKRIP   nilai ');await counts(student,1,1);
 await student.fill('#resource-search','  HOW   DO I PREPARE MY TRANSCRIPT ');await counts(student,0,1);
 await student.fill('#resource-search','');await templateCategory(student,'Outline');await counts(student,3,0);
 await student.fill('#resource-search',' draf   PROPOSAL ');await counts(student,1,0);await student.locator('#resource-reset').click();await counts(student,8,5);
 assert.equal(await student.inputValue('#resource-search'),'');
 await student.fill('#resource-search','nothing matches resources');await counts(student,0,0);await matrix(student,'no results');await student.locator('#resource-reset').click();await counts(student,8,5);
 pass('Shared bilingual search, source categories, both panel counts and reset agree, including 16 no-results layouts');

 await mode(student,390,'id',true);const openQuestion=question(student,stableQuestion);assert.equal(await openQuestion.count(),1);await openQuestion.locator('summary').focus();await openQuestion.locator('summary').press('Enter');assert(await openQuestion.evaluate(node=>node.open));
 await student.evaluate(()=>toggleLanguage());assert(await question(student,stableQuestionEn).evaluate(node=>node.open));assert((await student.evaluate(()=>document.activeElement.textContent)).includes(stableQuestionEn));
 await student.evaluate(()=>syncDatabase());assert(await question(student,stableQuestionEn).evaluate(node=>node.open));assert((await student.evaluate(()=>document.activeElement.textContent)).includes(stableQuestionEn));
 await student.fill('#resource-search','  transcript ');await student.locator('#resource-search').press('End');const caret=await student.locator('#resource-search').evaluate(node=>node.selectionStart);await student.evaluate(()=>toggleLanguage());await student.evaluate(()=>syncDatabase());assert.equal(await student.evaluate(()=>document.activeElement.id),'resource-search');assert.equal(await student.locator('#resource-search').evaluate(node=>node.selectionStart),caret);assert.equal(await student.inputValue('#resource-search'),'  transcript ');
 await student.locator('#resource-reset').click();assert(await question(student,stableQuestion).evaluate(node=>node.open),'Filtering away a FAQ does not forget its disclosure state');
 await question(student,stableQuestion).locator('summary').focus();const inserted={id:'duplicate',text:'Pertanyaan baru sebelum pertanyaan yang dibuka',textEn:'New question before the open question',sub:'Jawaban baru.',subEn:'New answer.'};faq[0].items=[inserted,faq[0].items[0],faq[0].items[2],faq[0].items[1]];
 await student.evaluate(()=>syncDatabase());assert(await question(student,stableQuestion).evaluate(node=>node.open));assert((await student.evaluate(()=>document.activeElement.textContent)).includes(stableQuestion),'A changed dataset restores the same question rather than the new occupant of an index');
 assert(!(await question(student,'Pertanyaan baru sebelum').evaluate(node=>node.open)));await rawUnchanged(student);
 pass('FAQ disclosure, question identity, search caret and focus survive language/sync, filtering away and inserting/reordering duplicate-ID content');

 await student.evaluate(()=>switchTab(null,'pendaftaran'));await student.selectOption('#reg-jenis-utama','Outline');await student.fill('#reg-judul','eCommerce dan partisipasi mahasiswa O’Connor');
 for(const id of['file-transkrip','file-proposal'])await student.setInputFiles('#'+id,{name:id+'-eCommerce.pdf',mimeType:'application/pdf',buffer:pdf(id)});
 await student.waitForFunction(()=>['file-transkrip','file-proposal'].every(id=>documentInspections.get(document.getElementById(id).files[0])?.pending===false));
 await student.evaluate(()=>{window.resourcesRegistrationFiles=['file-transkrip','file-proposal'].map(id=>({id,input:document.getElementById(id),file:document.getElementById(id).files[0]}));});
 await student.locator('#file-transkrip-guidance [data-guide=templates-faq]').click();await student.waitForSelector('#templates-faq.active');assert.equal(await student.locator('#resource-context').getAttribute('data-service'),'Outline');assert.equal(await student.locator('#resource-context').getAttribute('data-field'),'file-transkrip');assert((await student.locator('#resource-context').textContent()).includes('Transkrip'));assert((await student.locator('[data-resource-match=true]').count())>0);
 assert.equal(await student.locator('#guide-back').count(),1);await student.locator('[data-guide-return]').click();await sameRegistration(student);assert.equal(await student.evaluate(()=>document.activeElement.id),'file-transkrip');
 await student.locator('#btn-review-registration').click();await student.waitForSelector('#registration-review:not([hidden])');
 await student.locator('#registration-review [data-guide=templates-faq][data-guide-field=file-proposal]').click();await student.waitForSelector('#templates-faq.active');assert.equal(await student.locator('#guide-back').count(),1);await student.evaluate(()=>toggleLanguage());await student.locator('[data-guide-return]').click();await sameRegistration(student);assert(await student.locator('#registration-review').isVisible());assert.equal(await student.evaluate(()=>document.activeElement.id),'review-heading');await student.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const reviewBounds=await student.locator('#review-heading').boundingBox();assert(reviewBounds&&reviewBounds.y>=0&&reviewBounds.y+reviewBounds.height<=900,'Review return restores a visibly focused heading: '+JSON.stringify(reviewBounds));
 await student.locator('#btn-edit-registration').click();await student.locator('#file-transkrip-guidance [data-guide=templates-faq]').click();templates=[{title:'Magang',titleEn:'Internship',items:[initialTemplates[1].items[0]]}];await student.evaluate(()=>syncDatabase());assert((await student.locator('#resource-context').textContent()).match(/Template khusus belum ditemukan|No specific template/i),'Missing exact context is explained honestly');assert.equal(await student.locator('[data-resource-match=true]').count(),0);await student.locator('[data-guide-return]').click();await sameRegistration(student);
 assert.equal(await student.locator('#guide-back').count(),0);
 pass('File and review guidance use the current service/field, explain missing templates, and return to the same text, exact File objects, draft state and review focus without duplicate back controls');

 templates=[];faq=[];await student.evaluate(()=>{registrationDirty=false;switchTab(null,'templates-faq');});await student.evaluate(()=>syncDatabase());await counts(student,0,0);await matrix(student,'empty resources');
 templates=structuredClone(initialTemplates);faq=structuredClone(initialFaq);const admin=await login(browser,'admin');await counts(admin,8,5);await matrix(admin,'admin resources');
 for(const type of['template_berkas','faq']){await admin.locator('#templates-faq [onclick="openContentEditor(\''+type+'\')"]').click();await admin.waitForSelector('#modal-edit-content',{state:'visible'});assert.equal(await admin.evaluate(()=>editorCurrentType),type);assert.deepEqual(await admin.evaluate(()=>editorTempData),type==='faq'?faq:templates);await admin.locator('#modal-edit-content .intl-close').click();await admin.waitForSelector('#modal-edit-content',{state:'hidden'});}
 pass('Empty states and admin controls fit 32 more modes; both existing content editors still open the unchanged source schema');

 // Older/default content has no explicit English fields. Search must include
 // the English text users actually read, even while the page is in Indonesian.
 templates=[{title:'Daftar Berkas',items:[{id:'legacy-approval',text:'Lembar Pengesahan Skripsi (.docx)',sub:safeDocx}]}];
 faq=[{title:'Daftar Pertanyaan',items:[
  {id:'legacy-pdf',text:'Bagaimana jika file PDF saya lebih dari 10MB?',sub:'Ekspor ulang dokumen dengan ukuran PDF yang lebih kecil, pastikan teks tetap terbaca, lalu periksa kembali sebelum mengunggah.'},
  {id:'legacy-deadline',text:'Kapan batas waktu revisi proposal?',sub:'Batas revisi ujian proposal adalah 1 (satu) bulan setelah ujian dilaksanakan.'}
 ]}];
 await student.bringToFront();await student.evaluate(()=>syncDatabase());await counts(student,1,2);
 for(const lang of['id','en']){
  await mode(student,390,lang,true);
  for(const[query,documents,questions]of[['approval sheet',1,0],['exceeds',0,1],['remains readable',0,1],['one month after',0,1],['pengesahan',1,0],['lebih dari',0,1],['tetap terbaca',0,1],['setelah ujian',0,1],['documents',1,0],['questions',0,2]]){
   await student.fill('#resource-search',query);await counts(student,documents,questions);await rawUnchanged(student);
  }
  await student.locator('#resource-reset').click();await counts(student,1,2);
 }
 assert((await student.locator('#template_berkas-content-container').textContent()).includes('Thesis approval sheet'));
 assert((await student.locator('#faq-content-container').textContent()).includes('What if my PDF exceeds 10 MB?'));
 templates=structuredClone(initialTemplates);faq=structuredClone(initialFaq);await student.evaluate(()=>syncDatabase());await counts(student,8,5);
 pass('Legacy content without explicit English fields remains searchable by displayed fallback titles, FAQ answers and categories in both language modes without rewriting the source');

 await student.bringToFront();await student.locator('#resource-search').fill('remember this search');await student.evaluate(()=>IPCOSResources.context({service:'Outline',field:'file-transkrip',label:'Transkrip Nilai'}));const late=gate();nextRead=late;await student.evaluate(()=>{window.resourcesLateRead=syncDatabase();});await late.entered;await student.evaluate(()=>logoutUser());await student.waitForSelector('#welcome-modal',{state:'visible'});late.release();await student.evaluate(()=>window.resourcesLateRead);
 assert.equal(await student.inputValue('#resource-search'),'');assert.equal(await student.locator('#resource-context').getAttribute('data-field'),null);assert.equal(await student.locator('#guide-back').count(),0);
 await student.fill('#input-nim','C');await student.locator('#input-nim').press('Enter');await student.waitForSelector('#welcome-modal',{state:'hidden'});await student.waitForFunction(()=>syncPhase==='success');await student.evaluate(()=>switchTab(null,'templates-faq'));assert.equal(await student.inputValue('#resource-search'),'');assert.equal(await student.locator('#resource-context').getAttribute('data-field'),null);
 assert.equal(calls.filter(data=>['create','update','revise_request','save_progress','save_academic_progress','change_request_type','update_content','save_document_review'].includes(data.action)).length,0);assert.deepEqual(errors,[]);await rawUnchanged(student);
 pass('Logout and delayed responses clear contextual guidance and filters before another account enters; browsing/edit previews produce no academic or content writes');
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/resources-ui-results.json',JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(reportFailure);
