const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,reportFailure}=require('./browser.cjs');
const origin=process.env.IPCOS_TEST_BASE_URL||'http://127.0.0.1:8766';
const calls=[],errors=[],checks=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
const fixed='2026-10-19T03:00:00Z'; // 10:00 WIB; the simulated browser is still on October 18.
const attack='<img src=x onerror="window.calendarAttack=true">';
const long='Ketentuan pendaftaran wisuda untuk mahasiswa internasional dan penelitian komunikasi lintas budaya. '.repeat(4).trim();
const original=[
 {title:'Periode eCommerce; O’Connor, 東京\\Paris',titleEn:'eCommerce Period; O’Connor, 東京\\Paris',items:[{id:'future-late',text:'30 Oktober 2026',textEn:'30 October 2026',sub:'1–12 November 2026 · '+long,subEn:'1–12 November 2026 · '+long}]},
 {title:'Periode Hari Ini eCommerce',titleEn:'Today’s eCommerce Period',items:[{id:'today',text:'19 Okt 2026',textEn:'19 Oct 2026',sub:'20–30 Oktober 2026',subEn:'20–30 October 2026'}]},
 {title:'Periode Berikutnya',titleEn:'Next Period',items:[{id:'future-soon',text:'2026-10-20',sub:'Periksa persyaratan pendaftaran wisuda.',subEn:'Check graduation registration requirements.'}]},
 {title:'Periode Sebelumnya',titleEn:'Previous Period',items:[{id:'past',text:'18 Oktober 2026',textEn:'18 October 2026',sub:'Wisuda lama yang tetap dapat dibaca.',subEn:'Past ceremony information remains readable.'}]},
 {title:'Periode Tanggal ISO',titleEn:'ISO Date Period',items:[{id:'iso-wib',text:'2026-10-18T17:00:00Z',sub:'Timestamp ini menunjukkan 19 Oktober di WIB.',subEn:'This timestamp is October 19 in WIB.'}]},
 {title:'Periode Tahun Kabisat',titleEn:'Leap Year Period',items:[{id:'leap',text:'29 Februari 2028',textEn:'29 February 2028',sub:'Ketentuan tahun kabisat dari admin.',subEn:'Admin’s leap-year requirements.'}]},
 {title:'Informasi Belum Lengkap '+attack,titleEn:'Incomplete Information '+attack,items:[
  {id:'empty',text:'',sub:'Tanggal belum diterbitkan admin.',subEn:'Admin has not published a date.'},
  {id:'invalid-leap',text:'29 Februari 2027',sub:'Tanggal tidak valid tidak boleh menjadi tenggat.',subEn:'An invalid date must never become a deadline.'},
  {id:'range',text:'20–30 Oktober 2026',sub:'Rentang adalah keterangan, bukan satu tenggat.',subEn:'A range is information, not a single deadline.'},
  {id:'invalid-iso',text:'2026-10-19Tgarbage',sub:attack,subEn:attack}
 ]}
];
let calendar=structuredClone(original),nextRead=null;
function gate(){let enter,release;return{entered:new Promise(resolve=>enter=resolve),wait:new Promise(resolve=>release=resolve),enter:()=>enter(),release:()=>release()};}
function bounded(promise,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),10000);})]).finally(()=>clearTimeout(timer));}
async function entry(page,id){const value=await page.evaluate(id=>window.IPCOSCalendar.entries().find(item=>item.rawItem?.id===id),id);assert(value,'The published calendar entry is available: '+id);return value;}
const row=(page,key)=>page.locator('[data-calendar-entry="'+key+'"]');
const exportButton=(page,key)=>page.locator('#kalender-content-container [data-calendar-export="'+key+'"]');
async function expectedRows(page,ids){const keys=await page.locator('#kalender [data-calendar-entry]').evaluateAll(nodes=>nodes.map(node=>node.dataset.calendarEntry));const expected=await Promise.all(ids.map(async id=>(await entry(page,id)).key));assert.deepEqual(keys.slice().sort(),expected.slice().sort(),'The displayed calendar rows match the selected source items');}
async function snapshotUnchanged(page){assert.deepEqual(await page.evaluate(()=>getChecklistData('kalender')),calendar,'Calendar filters and exports never rewrite authored content');}
async function mode(page,width,lang,dark){await page.setViewportSize({width,height:900});await page.evaluate(({lang,dark})=>{if(currentLang!==lang)toggleLanguage();if(document.body.classList.contains('dark-mode')!==dark)toggleDarkMode();},{lang,dark});}
async function layout(page,label){
 const result=await page.locator('#kalender').evaluate(root=>{
  const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&!node.closest('[hidden],details:not([open])>:not(summary)');
  const clipped=[...root.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,strong')].filter(node=>visible(node)&&node.clientWidth&&!node.classList.contains('sr-only')).filter(node=>node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).textOverflow!=='ellipsis').map(node=>({id:node.id,text:node.textContent.trim().slice(0,90)}));
  const controls=[...root.querySelectorAll('button,input,select,summary')].filter(visible).map(node=>({text:node.textContent.trim().slice(0,65),box:node.getBoundingClientRect().toJSON()}));
  return{overflow:document.documentElement.scrollWidth>innerWidth+2,clipped,controls};
 });
 assert.equal(result.overflow,false,label+' viewport overflow');assert.deepEqual(result.clipped,[],label+' clipped text');
 for(const{text,box}of result.controls){assert(box.height>=43.99,label+' 44px control '+text);assert(box.left>=-1&&box.right<=page.viewportSize().width+1,label+' control fits horizontally '+text);}
}
async function matrix(page,label){for(const width of[320,390,768,1365])for(const lang of['id','en'])for(const dark of[false,true]){await mode(page,width,lang,dark);await layout(page,`${label} ${width}/${lang}/${dark}`);await snapshotUnchanged(page);}}
async function sync(page){await page.evaluate(()=>syncDatabase());await page.waitForFunction(()=>syncPhase==='success');}
async function setTime(page,time){await page.clock.setFixedTime(new Date(time));await page.evaluate(()=>renderYudisiumCountdown());}
async function download(page,action){const waiting=page.waitForEvent('download');await action();const file=await waiting,bytes=fs.readFileSync(await file.path()),raw=bytes.toString('utf8'),unfolded=raw.replace(/\r\n[ \t]/g,'');assert(raw.split('\r\n').every(line=>Buffer.byteLength(line,'utf8')<=75),'Calendar physical lines fit the 75-byte UTF-8 limit');assert(unfolded.includes('BEGIN:VCALENDAR\r\n'));assert(unfolded.includes('END:VCALENDAR'));return{raw,unfolded,uid:unfolded.match(/^UID:(.+)$/m)?.[1].trim()};}
async function login(browser,role='mhs',nim='A'){
 const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce',timezoneId:'America/Los_Angeles',acceptDownloads:true});
 await context.route('**/*',async route=>{const url=route.request().url();if(url.includes('script.google.com/macros/')){const data=route.request().postDataJSON();calls.push(data);let result;
  if(data.action==='student_login')result={status:'success',token:'student-'+data.nim,nama:'Mahasiswa '+data.nim};
  else if(data.action==='admin_login')result={status:'success',token:'admin'};
  else if(data.action==='get_data'){result={status:'success',registrations:[],students:[],dosens:[],announcements:[],services:[],contents:[{Tipe:'kalender',DataJSON:JSON.stringify(calendar)}]};const held=nextRead;nextRead=null;if(held){held.enter();await held.wait;}}
  else if(data.action==='update_content'){assert.equal(data.token,'admin');assert.equal(data.type,'kalender');calendar=JSON.parse(data.content);result={status:'success'};}
  else if(data.action==='logout')result={status:'success'};
  else if(await require('./next-mock.cjs')(route,data))return;
  else throw Error('Unexpected calendar fixture API '+data.action);
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 }if(url.startsWith(origin))return route.continue();if(url.includes('chart.js'))return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{static defaults={font:{}};destroy(){}};'});return route.abort();});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.clock.setFixedTime(new Date(fixed));await page.goto(origin);
 if(role==='admin'){await page.click('#tab-admin');await page.fill('#input-admin-user','fixture');await page.fill('#input-admin-pass','fixture');await page.locator('#input-admin-pass').press('Enter');}else{await page.fill('#input-nim',nim);await page.locator('#input-nim').press('Enter');}
 await page.waitForSelector('#welcome-modal',{state:'hidden'});await page.waitForFunction(()=>syncPhase==='success'&&!!window.IPCOSCalendar);await page.evaluate(()=>switchTab(null,'kalender'));return page;
}

(async()=>{
 const browser=await chromium.launch(),student=await login(browser);
 const valid=[['19 Okt 2026','2026-10-19'],['19 October 2026','2026-10-19'],['2026-10-19','2026-10-19'],['2026-10-18T17:00:00Z','2026-10-19'],['2026-10-20T01:00:00+09:00','2026-10-19'],['29 Februari 2028','2028-02-29'],['2028-02-29','2028-02-29']];
 const invalid=['','31 April 2026','29 Februari 2027','2026-02-30','2026-13-01','20–30 Oktober 2026','2026-10-19Tgarbage','2026-10-19T25:00:00Z','2026-10-19T12:60:00Z','2026-02-30T00:00:00Z','2026-10-19T00:00:00+99:00'];
 for(const[input,expected]of valid)assert.equal(await student.evaluate(input=>academicCalendarDate(input)?.toISOString().slice(0,10),input),expected,'Civil WIB date parsed from '+input);
 for(const input of invalid)assert.equal(await student.evaluate(input=>academicCalendarDate(input),input),null,'Malformed date is unavailable: '+input);
 assert.equal(await student.evaluate(()=>new Date().getDate()),18,'The browser timezone intentionally differs from WIB');
 for(const id of['calendar-title','calendar-nearest','calendar-search','calendar-period','calendar-result-count'])assert.equal(await student.locator('#'+id).count(),1,'One '+id);
 const nearest=await student.locator('#calendar-nearest [data-calendar-nearest]').getAttribute('data-calendar-nearest'),nearestEntry=await student.evaluate(key=>window.IPCOSCalendar.entries().find(item=>item.key===key),nearest);assert.equal(nearestEntry.date,'2026-10-19','The nearest date is chosen from unsorted published periods');assert((await student.locator('#calendar-nearest').textContent()).includes(nearestEntry.title));assert.equal(await student.locator('#calendar-past').evaluate(node=>node.open),false,'Past periods start collapsed');
 await expectedRows(student,original.flatMap(group=>group.items.map(item=>item.id)));
 for(const id of['empty','invalid-leap','range','invalid-iso'])assert(await exportButton(student,(await entry(student,id)).key).isDisabled(),'Unknown date never exports: '+id);
 assert.equal(await student.locator('#kalender img,#kalender script').count(),0);assert((await student.locator('#kalender').textContent()).includes(attack));assert.equal(await student.evaluate(()=>window.calendarAttack),undefined);await snapshotUnchanged(student);
 await matrix(student,'published calendar');
 const isoKey=(await entry(student,'future-soon')).key;for(const dateQuery of ['20 October 2026','20 Oktober 2026']){await student.fill('#calendar-search',dateQuery);assert(await row(student,isoKey).isVisible(),'The published ISO deadline is searchable by its localized date: '+dateQuery);}await student.fill('#calendar-search','20 November 2026');assert.equal(await row(student,isoKey).count(),0,'A different month does not match the ISO deadline');await student.locator('#calendar-reset').click();
 pass('Localized dates, ISO timestamps, leap days and malformed/range dates follow WIB; the honest nearest period and escaped published content fit all 16 modes');

 await mode(student,390,'id',true);const heroExport=student.locator('#calendar-nearest [data-calendar-export]'),heroKey=await heroExport.getAttribute('data-calendar-export');await heroExport.focus();await student.evaluate(()=>toggleLanguage());await sync(student);assert.equal(await student.evaluate(()=>document.activeElement.closest('#calendar-nearest')?.id),'calendar-nearest','The nearest deadline action retains keyboard focus after language and sync');assert.equal(await student.evaluate(()=>document.activeElement.dataset.calendarExport),heroKey);await student.evaluate(()=>toggleLanguage());const hero=await student.locator('#calendar-nearest').textContent();
 const selectedPeriod=await student.locator('#calendar-period option').evaluateAll((nodes,title)=>nodes.find(node=>node.textContent===title)?.value,original[0].title);assert(selectedPeriod,'The original source period is selectable');await student.selectOption('#calendar-period',selectedPeriod);await expectedRows(student,['future-late']);assert.equal(await student.locator('#calendar-nearest').textContent(),hero,'Filters do not change the truthful nearest deadline');
 await student.locator('#calendar-period').focus();await student.evaluate(()=>toggleLanguage());await sync(student);assert.equal(await student.evaluate(()=>document.activeElement.id),'calendar-period');assert.equal(await student.inputValue('#calendar-period'),selectedPeriod);await student.locator('#calendar-reset').click();
 await student.fill('#calendar-search','Wisuda lama');assert.equal(await student.locator('#calendar-past').evaluate(node=>node.open),true,'Searching past information reveals its collapsed section');await expectedRows(student,['past']);
 await student.locator('#calendar-search').press('End');const caret=await student.locator('#calendar-search').evaluate(node=>node.selectionStart);await student.evaluate(()=>toggleLanguage());await sync(student);assert.equal(await student.evaluate(()=>document.activeElement.id),'calendar-search');assert.equal(await student.inputValue('#calendar-search'),'Wisuda lama');assert.equal(await student.locator('#calendar-search').evaluate(node=>node.selectionStart),caret);await expectedRows(student,['past']);
 await student.locator('#calendar-reset').click();const past=student.locator('#calendar-past');if(!(await past.evaluate(node=>node.open)))await past.locator('summary').click();await past.locator('summary').focus();await student.evaluate(()=>toggleLanguage());await sync(student);assert(await past.evaluate(node=>node.open));assert.equal(await student.evaluate(()=>document.activeElement.closest('details')?.id),'calendar-past');await matrix(student,'expanded past periods');
 pass('Period/search filters retain focus and caret through language/sync, reveal relevant past periods, preserve disclosure state and never alter the global nearest deadline');

 await mode(student,1365,'id',false);await setTime(student,fixed);await student.selectOption('#calendar-alarm-days','0');const future=(await entry(student,'future-late')).key;
 const noAlarm=await download(student,()=>exportButton(student,future).click());assert(noAlarm.unfolded.includes('DTSTART;VALUE=DATE:20261030'));assert(noAlarm.unfolded.includes('DTEND;VALUE=DATE:20261031'));assert(!noAlarm.unfolded.includes('BEGIN:VALARM'));assert(noAlarm.unfolded.includes('eCommerce\\; O’Connor\\, 東京\\\\Paris'),'Authored punctuation and Unicode survive valid ICS escaping');assert(noAlarm.uid);
 for(const[days,trigger]of[[1,'20261029T020000Z'],[3,'20261027T020000Z'],[7,'20261023T020000Z']]){await student.selectOption('#calendar-alarm-days',String(days));const file=await download(student,()=>exportButton(student,future).click());assert(file.unfolded.includes('DTSTART;VALUE=DATE:20261030'));assert(file.unfolded.includes('DTEND;VALUE=DATE:20261031'));assert(file.unfolded.includes('BEGIN:VALARM'));assert(file.unfolded.includes('TRIGGER;VALUE=DATE-TIME:'+trigger),'Alarm is 09:00 WIB on H-'+days+' regardless of the browser timezone');assert.equal(file.uid,noAlarm.uid,'Repeated imports identify the same event rather than duplicating it');}
 await student.evaluate(()=>toggleLanguage());const english=await download(student,()=>exportButton(student,future).click());assert.equal(english.uid,noAlarm.uid);assert(english.unfolded.includes('eCommerce Period'));await student.selectOption('#calendar-alarm-days','1');const today=(await entry(student,'today')).key,expiredAlarm=await download(student,()=>exportButton(student,today).click());assert(!expiredAlarm.unfolded.includes('BEGIN:VALARM'),'A past alarm is never promised or written');assert.match(await student.locator('#toast-container').textContent(),/already passed|sudah lewat/i);await snapshotUnchanged(student);
 pass('Downloaded ICS bytes preserve civil dates, escaped text and stable event identity; H-1/H-3/H-7 alarms use explicit 09:00 WIB and expired alarms are reported honestly');

 await setTime(student,'2026-10-19T16:59:58Z');assert.equal((await student.evaluate(()=>nearestYudisiumDeadline())).dateText,'19 Okt 2026');
 await setTime(student,'2026-10-19T17:00:00Z');assert((await student.locator('#calendar-nearest').textContent()).includes(original[2].titleEn));
 calendar=[structuredClone(original[3])];await sync(student);assert.equal(await student.evaluate(()=>nearestYudisiumDeadline()),null);assert.equal(await student.locator('#calendar-nearest [data-next-yudisium-reminder]:enabled').count(),0);assert.doesNotMatch(await student.locator('#calendar-nearest').textContent(),/NaN|Invalid Date|1970/);
 calendar=[structuredClone(original[6])];await sync(student);assert.equal(await student.evaluate(()=>nearestYudisiumDeadline()),null);for(const button of await student.locator('[data-calendar-export]').all())assert(await button.isDisabled());
 calendar=[];await sync(student);assert.equal(await student.locator('[data-calendar-entry]').count(),0);assert.equal(await student.evaluate(()=>nearestYudisiumDeadline()),null);assert.equal(await student.locator('#calendar-nearest [data-next-yudisium-reminder]:enabled').count(),0);await matrix(student,'no published dates');
 pass('The WIB midnight boundary advances the nearest deadline; past-only, unknown-only and explicitly empty calendars never invent an upcoming date or usable reminder');

 calendar=[{title:'Periode Identitas Lama',titleEn:'Legacy Identity Period',items:[{id:'shared-legacy-id',text:'30 Oktober 2026',textEn:'30 October 2026',sub:'Syarat A eCommerce',subEn:'Requirement A eCommerce'},{id:'shared-legacy-id',text:'30 Oktober 2026',textEn:'30 October 2026',sub:'Syarat B eCommerce',subEn:'Requirement B eCommerce'}]}];await sync(student);const legacyEntries=await student.evaluate(()=>IPCOSCalendar.entries());assert.equal(legacyEntries.length,2);assert.equal(new Set(legacyEntries.map(item=>item.key)).size,2,'Repeated legacy IDs do not merge separate published entries');await student.selectOption('#calendar-alarm-days','0');const legacyFiles=[];for(const item of legacyEntries)legacyFiles.push(await download(student,()=>exportButton(student,item.key).click()));assert.notEqual(legacyFiles[0].uid,legacyFiles[1].uid,'Distinct published entries with the same date have separate calendar identities');await student.evaluate(()=>toggleLanguage());await sync(student);assert.deepEqual(await student.evaluate(()=>IPCOSCalendar.entries().map(item=>item.key)),legacyEntries.map(item=>item.key));assert.equal((await download(student,()=>exportButton(student,legacyEntries[0].key).click())).uid,legacyFiles[0].uid);await snapshotUnchanged(student);
 pass('Repeated legacy item IDs keep distinct stable entries and calendar identities across language changes and sync');

 calendar=structuredClone(original);const admin=await login(browser,'admin');await admin.locator('#kalender [onclick="openContentEditor(\'kalender\')"]').click();await admin.waitForSelector('#modal-edit-content',{state:'visible'});const category=admin.locator('#editor-ui-container input[oninput="editorTempData[0].title = this.value"]');await category.fill('Admin changed eCommerce title');await category.focus();await admin.evaluate(()=>toggleLanguage());assert.equal(await category.inputValue(),'Admin changed eCommerce title');await admin.evaluate(()=>saveContentChanges());await admin.waitForSelector('#modal-edit-content',{state:'hidden'});assert.equal(calls.filter(data=>data.action==='update_content').length,1);assert.equal(calendar[0].title,'Admin changed eCommerce title');assert.equal(calendar[0].items[0].text,'30 Oktober 2026');await snapshotUnchanged(admin);
 await student.bringToFront();await student.evaluate(()=>openContentEditor('kalender'));assert.equal(await student.locator('#modal-edit-content').isVisible(),false,'Students cannot open the calendar publisher');
 await student.fill('#calendar-search','account A calendar filter');const old=gate();nextRead=old;await student.evaluate(()=>{window.oldCalendarSync=syncDatabase();});await bounded(old.entered,'The delayed calendar fixture read was not started');await student.evaluate(()=>logoutUser());await student.waitForSelector('#welcome-modal',{state:'visible'});old.release();await student.evaluate(()=>window.oldCalendarSync);assert.equal(await student.inputValue('#calendar-search'),'');assert.equal(await student.locator('[data-calendar-entry]').count(),0);for(const id of ['calendar-current-list','calendar-past-list','calendar-nearest'])assert.equal(await student.locator('#'+id).textContent(),'');
 await student.fill('#input-nim','B');await student.locator('#input-nim').press('Enter');await student.waitForSelector('#welcome-modal',{state:'hidden'});await student.waitForFunction(()=>syncPhase==='success');await student.evaluate(()=>switchTab(null,'kalender'));assert.equal(await student.inputValue('#calendar-search'),'');assert.equal(await student.inputValue('#calendar-period'),'all');assert.equal(await student.locator('#kalender .admin-only:visible').count(),0);
 assert.equal(calls.filter(data=>['create','update','manage_student','manage_dosen','save_progress','save_academic_progress','post_announcement','save_document_review'].includes(data.action)).length,0);assert.deepEqual(errors,[]);
 pass('The existing admin editor preserves authored schema and focused drafts; students cannot publish, and late reads/logout cannot restore filters or private role controls');
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/calendar-ui-results.json',JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(reportFailure);
