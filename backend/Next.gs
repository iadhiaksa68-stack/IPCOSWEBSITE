// Optional workflow extensions. No new spreadsheet, column, credential or public file.
const NEXT_ACTIONS = ['get_form_draft','save_form_draft','get_revision_form','revise_request','report_health','get_health','get_review_capabilities','get_document_review','save_document_review','archive_request','restore_request','get_academic_progress','save_academic_progress','change_request_type','get_internationalization','preview_international_excel','import_international_excel','save_international_record'];
const NEXT_DRAFT_FIELDS = ['reg-jenis-utama','reg-judul','reg-dosen-lama','reg-dosen-baru','reg-alasan-ganti'];
function nextHash(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value)).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join(''); }
function nextRequestId(value) { if(typeof value!=='string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw new Error('ID penyimpanan tidak valid.'); return value; }
function nextOwner(session) { if(session.role!=='mhs' || !auditStudent(String(session.nim))) throw new Error('Hanya mahasiswa aktif pemilik dapat mengubah pengajuan atau draf.'); }
function nextLock(fn) { const lock=LockService.getScriptLock(); if(!lock.tryLock(10000)) throw new Error('Penyimpanan sedang diproses. Coba kembali.'); try { return fn(); } finally { lock.releaseLock(); } }
function nextText(value,max) { if(typeof value!=='string' || value.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('Isian tidak valid atau terlalu panjang.'); return value.trim(); }
function nextDraftKey(nim) { return 'IPCOS_DRAFT_'+nextHash(String(nim).trim()); }
function nextDraftRead(nim) {
  const raw=PropertiesService.getScriptProperties().getProperty(nextDraftKey(nim));
  if(!raw) return {exists:false,fields:{},revision:0,updatedAt:''};
  const saved=JSON.parse(raw);
  if(!saved || !Number.isInteger(saved.revision) || saved.revision<0 || !saved.fields || typeof saved.fields!=='object' || Array.isArray(saved.fields) || !Number.isFinite(Date.parse(saved.updatedAt)) || Object.keys(saved.fields).some(key=>!NEXT_DRAFT_FIELDS.includes(key) || typeof saved.fields[key]!=='string' || saved.fields[key].length>(key==='reg-alasan-ganti'?2000:500)) || (saved.fields['reg-jenis-utama'] && !IPCOS_TYPES.includes(saved.fields['reg-jenis-utama']))) throw new Error('Draf cloud belum dapat dibaca.');
  const expired=Date.now()-Date.parse(saved.updatedAt)>14*86400000;
  return Object.assign({},saved,{exists:!expired && Object.keys(saved.fields).length>0,fields:expired?{}:saved.fields});
}
function nextDraftSave(session,data) {
  nextOwner(session); const requestId=nextRequestId(data.requestId),fields=data.fields;
  if(!fields || typeof fields!=='object' || Array.isArray(fields) || Object.keys(fields).some(key=>!NEXT_DRAFT_FIELDS.includes(key))) throw new Error('Draf tidak valid.');
  const normalized={};
  for(const key of Object.keys(fields)) normalized[key]=nextText(fields[key],key==='reg-alasan-ganti'?2000:500);
  const type=normalized['reg-jenis-utama'];
  if(type && !IPCOS_TYPES.includes(type)) throw new Error('Jenis draf tidak valid.');
  if(!Number.isInteger(data.revision) || data.revision<0) throw new Error('Versi draf tidak valid.');
  return nextLock(()=>{
    const previous=nextDraftRead(session.nim);
    if(previous.requestId===requestId) return {status:'success',draft:previous};
    if(previous.revision!==data.revision) return {status:'conflict',draft:previous,message:'Draf berubah di perangkat lain. Pilih draf yang ingin dilanjutkan.'};
    const next={fields:normalized,revision:previous.revision+1,updatedAt:new Date().toISOString(),requestId:requestId};
    const json=JSON.stringify(next); if(Utilities.newBlob(json).getBytes().length>8000) throw new Error('Draf terlalu besar.');
    PropertiesService.getScriptProperties().setProperty(nextDraftKey(session.nim),json);
    const p=PropertiesService.getScriptProperties(),key=nextDraftKey(session.nim);let pruned=0;
    for(const name of Object.keys(p.getProperties())) if(name!==key && /^IPCOS_DRAFT_[a-f0-9]{64}$/.test(name) && pruned<20) { try {const old=JSON.parse(p.getProperty(name));if(Number.isFinite(Date.parse(old.updatedAt))&&Date.now()-Date.parse(old.updatedAt)>14*86400000){p.deleteProperty(name);pruned++;}}catch(_){} }
    return {status:'success',draft:Object.assign({exists:Object.keys(normalized).length>0},next)};
  });
}
function nextRevisionRow(session,id) {
  nextOwner(session);
  const sheet=SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_REGISTRASI),rows=sheet.getDataRange().getValues(),headers=rows[0].map(h=>String(h).toLowerCase().trim());
  const keys=['id','nim','nama','jenis','detail','status','note','link'];
  if(keys.some(key=>!headers.includes(key))) throw new Error('Kolom pengajuan tidak lengkap.');
  const index=rows.findIndex((row,i)=>i>0 && String(row[headers.indexOf('id')])===String(id));
  if(index<1) throw new Error('Pengajuan tidak ditemukan.');
  const row=rows[index].slice(),item=Object.fromEntries(headers.map((key,i)=>[key,row[i]]));
  if(String(item.nim).trim()!==String(session.nim).trim()) throw new Error('Akses pengajuan mahasiswa lain ditolak.');
  return {sheet:sheet,index:index,row:row,headers:headers,item:item};
}
function nextRevisionRequested(item) {
  const last=featureLogs(item.note).slice().reverse().find(log=>log.role==='admin');
  const note=String(last && last.message || '').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'');
  return /Berkas yang perlu diperbaiki:\s*\n[\s\S]*?- Isian pengajuan(?:\n|$)/.test(note.split('\n\nInstruksi:')[0]);
}
function nextRevisionVersion(item) { return nextHash(JSON.stringify([String(item.id),String(item.status),String(item.detail),String(item.note),String(item.link)])); }
function nextDecode(value) { return String(value).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'); }
function nextRevisionFields(item) {
  const detail=String(item.detail || ''),parts=detail.replace(/<br\s*\/?\s*>/gi,'\n').split(/\n(?=<b>)/);
  const find=label=>{ const part=parts.find(part=>part.startsWith('<b>'+label+':</b>')); return part ? nextDecode(part.slice(('<b>'+label+':</b>').length).trim()) : ''; };
  return item.jenis==='Pergantian Pembimbing'?{oldSupervisor:find('Dosen Lama'),newSupervisor:find('Dosen Baru'),reason:find('Alasan')}:{title:find('Judul') || nextDecode(detail.replace(/<[^>]*>/g,''))};
}
function nextRevisionForm(session,data) {
  const record=nextRevisionRow(session,data.id),item=record.item;
  if(item.status!=='Revision' || !nextRevisionRequested(item)) throw new Error('Pengajuan ini tidak meminta revisi isian.');
  return {status:'success',version:nextRevisionVersion(item),fields:nextRevisionFields(item)};
}
function nextRevise(session,data) {
  nextOwner(session); const requestId=nextRequestId(data.requestId);
  return nextLock(()=>{
    const record=nextRevisionRow(session,data.id),item=record.item,logs=featureLogs(item.note);
    const signature=nextHash(JSON.stringify([data.fields,data.noteText,(Array.isArray(data.files)?data.files:[]).map(file=>[file.label,file.fileName,nextHash(file.base64)])]));
    const prior=logs.find(log=>log.requestId===requestId && log.role==='mhs');
    if(prior) {if(prior.requestSignature!==signature)throw new Error('Perbaikan sebelumnya sudah tercatat. Segarkan untuk melihat hasilnya.');return {status:'success',id:String(item.id),detail:item.detail,note:item.note,recordStatus:item.status};}
    if(item.status!=='Revision' || !nextRevisionRequested(item)) throw new Error('Status berubah atau isian tidak diminta diperbaiki. Segarkan pengajuan.');
    if(data.version!==nextRevisionVersion(item)) throw new Error('Pengajuan berubah. Segarkan sebelum mengirim perbaikan.');
    const expected=nextRevisionFields(item),fields=data.fields;
    if(!fields || Array.isArray(fields) || Object.keys(fields).length!==Object.keys(expected).length || Object.keys(fields).some(key=>!Object.prototype.hasOwnProperty.call(expected,key))) throw new Error('Isian perbaikan tidak valid.');
    const corrected={}; for(const key of Object.keys(expected)) { corrected[key]=nextText(fields[key],key==='reason'?2000:500); if(!corrected[key]) throw new Error('Lengkapi isian perbaikan.'); }
    if(corrected.oldSupervisor && corrected.oldSupervisor.normalize('NFKC').toLowerCase()===corrected.newSupervisor.normalize('NFKC').toLowerCase()) throw new Error('Pilih dosen yang berbeda.');
    const note=nextText(data.noteText,5000); if(!note) throw new Error('Jelaskan perbaikan Anda.');
    const files=auditFiles(data.files,5,0,item.jenis==='Pendadaran');
    featureValidateRevision({senderRole:'mhs',files:files},item);
    const changes=Object.keys(expected).filter(key=>corrected[key]!==expected[key]).map(key=>({field:key,before:expected[key],after:corrected[key]}));
    if(!changes.length && !files.length) throw new Error('Belum ada isian atau berkas yang diperbaiki.');
    const detail=item.jenis==='Pergantian Pembimbing'?'<b>Dosen Lama:</b> '+auditHtml(corrected.oldSupervisor)+'<br><b>Dosen Baru:</b> '+auditHtml(corrected.newSupervisor)+'<br><b>Alasan:</b> '+auditHtml(corrected.reason):'<b>Judul:</b> '+auditHtml(corrected.title);
    const created=[];
    try {
      const links=auditUpload(files,item.nim,item.nama,'[REVISI] ',created);
      const log={sender:session.nama || item.nama,role:'mhs',time:new Date().toISOString(),message:note,status:'Resubmitted',requestId:requestId,requestSignature:signature,fieldChanges:changes};
      if(links.length) log.documents=featureDocumentMetadata(files,links.join('<br>'),logs.concat([{documents:featureLabels(item.jenis).map(label=>({label:label,version:1}))}]),item.jenis);
      logs.push(log);
      record.row[record.headers.indexOf('detail')]=detail;record.row[record.headers.indexOf('status')]='Resubmitted';record.row[record.headers.indexOf('note')]=JSON.stringify(logs);
      if(links.length) record.row[record.headers.indexOf('link')]=(item.link?item.link+'<br>':'')+links.join('<br>');
      record.sheet.getRange(record.index+1,1,1,record.row.length).setValues([record.row]);
      return {status:'success',id:String(item.id),detail:record.row[record.headers.indexOf('detail')],note:record.row[record.headers.indexOf('note')],recordStatus:record.row[record.headers.indexOf('status')]};
    } catch(error) {
      // A lost acknowledgement after a successful commit must not trash referenced files.
      let committed=false; try { committed=featureLogs(nextRevisionRow(session,data.id).item.note).some(log=>log.requestId===requestId); } catch(_) {}
      if(committed) return {status:'success',id:String(item.id),detail:record.row[record.headers.indexOf('detail')],note:record.row[record.headers.indexOf('note')],recordStatus:record.row[record.headers.indexOf('status')]};
      auditDiscard(created); throw error;
    }
  });
}
function nextHealthReport(session,data) {
  if(session.role==='mhs') nextOwner(session);
  const codes=['javascript','network','api_response','api_timeout','module'];
  const actions=['create','update','revise_request','get_document','get_receipt','get_data','get_sop','save_sop','get_sop_file','save_form_draft','get_form_draft','save_progress','get_journey','module','runtime'];
  if(!codes.includes(data.code) || !actions.includes(data.operation)) throw new Error('Jenis gangguan tidak valid.');
  const cache=CacheService.getScriptCache(),rateKey='IPCOS_HEALTH_RATE_'+nextHash(data.token);
  if(cache.get(rateKey)) return {status:'success'};
  cache.put(rateKey,'1',30);
  return nextLock(()=>{
    const p=PropertiesService.getScriptProperties(),day=Utilities.formatDate(new Date(),'UTC','yyyy-MM-dd'),key='IPCOS_HEALTH_'+day;
    const saved=JSON.parse(p.getProperty(key) || '{}');let bucket=data.code+':'+data.operation+':'+session.role;
    if(!saved[bucket] && Object.keys(saved).length>=50) bucket='api_response:runtime:'+session.role;
    const old=saved[bucket] || {count:0};saved[bucket]={count:Math.min(100000,old.count+1),lastSeen:new Date().toISOString()};
    p.setProperty(key,JSON.stringify(saved));
    const cutoff=Date.now()-7*86400000;for(const name of Object.keys(p.getProperties())) if(/^IPCOS_HEALTH_\d{4}-\d{2}-\d{2}$/.test(name) && Date.parse(name.slice(13))<cutoff) p.deleteProperty(name);
    return {status:'success'};
  });
}
function nextHealthRead(session) {
  if(session.role!=='admin') throw new Error('Akses admin diperlukan.');
  const properties=PropertiesService.getScriptProperties().getProperties(),events=[];
  for(const key of Object.keys(properties)) if(/^IPCOS_HEALTH_\d{4}-\d{2}-\d{2}$/.test(key) && Date.parse(key.slice(13))>=Date.now()-7*86400000) {
    const buckets=JSON.parse(properties[key]);for(const bucket of Object.keys(buckets)) { const parts=bucket.split(':');events.push({day:key.slice(13),code:parts[0],operation:parts[1],role:parts[2],count:buckets[bucket].count,lastSeen:buckets[bucket].lastSeen}); }
  }
  return {status:'success',events:events.sort((a,b)=>String(b.lastSeen).localeCompare(String(a.lastSeen)))};
}
function nextDispatch(data) {
  const session=getSession(data.token); if(!session || !['mhs','admin'].includes(session.role)) throw new Error('Sesi tidak valid atau berakhir.');
  if(INTERNATIONAL_ACTIONS.includes(data.action))return internationalDispatch(session,data);
  if(ACADEMIC_ACTIONS.includes(data.action))return academicDispatch(session,data);
  if(data.action==='get_review_capabilities')return {status:'success',documentReviewSupported:true,archiveSupported:true,notePageReferences:true};
  if(data.action==='get_form_draft') { nextOwner(session);return {status:'success',draft:nextDraftRead(session.nim)}; }
  if(data.action==='save_form_draft') return nextDraftSave(session,data);
  if(data.action==='get_revision_form') return nextRevisionForm(session,data);
  if(data.action==='revise_request') return nextRevise(session,data);
  if(data.action==='report_health') return nextHealthReport(session,data);
  if(data.action==='get_health') return nextHealthRead(session);
  if(['get_document_review','save_document_review','archive_request','restore_request'].includes(data.action)) return nextReviewDispatch(session,data);
  throw new Error('Aksi tidak valid.');
}

// Review and archival events use the existing request history, so backups retain
// them and no sheets, columns, accounts or file permissions need to change.
function nextReviewRow(session,id) {
  const sheet=SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_REGISTRASI);
  if(!sheet)throw new Error('Pengajuan belum tersedia.');
  const rows=sheet.getDataRange().getValues(),headers=rows[0]||[];
  if(['id','nim','status','note','link'].some(key=>!headers.includes(key)))throw new Error('Struktur pengajuan belum dapat dibaca.');
  const index=rows.findIndex((row,i)=>i>0&&String(row[headers.indexOf('id')])===String(id));
  if(index<1)throw new Error('Pengajuan tidak ditemukan.');
  const row=rows[index].slice(),item=Object.fromEntries(headers.map((key,i)=>[key,row[i]]));
  if(session.role!=='admin'&&(String(item.nim).trim()!==String(session.nim).trim()||!auditStudent(String(session.nim))))throw new Error('Akses pengajuan ditolak.');
  return {sheet:sheet,index:index,headers:headers,row:row,item:item};
}
function nextReviewState(item) {
  const logs=featureLogs(item.note),last=logs.slice().reverse().find(log=>['document_review','request_type_change'].includes(log.kind)),archive=logs.slice().reverse().find(log=>log.kind==='archive');
  const links=featureLinkUrls(item.link),metadata=logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]);
  const latest=new Map();metadata.forEach(doc=>{if(links.includes(doc.url)&&(!latest.has(doc.label)||Number(doc.version)>Number(latest.get(doc.label).version)))latest.set(doc.label,doc);});
  const review=last&&Array.isArray(last.reviews)?last.reviews.filter(review=>links.includes(review.url)&&(!latest.has(review.label)||latest.get(review.label).url===review.url)):[];
  return {version:nextRevisionVersion(item),reviews:review,archived:!!(archive&&archive.archived),archive:archive||null};
}
function nextReviewPageReference(value,document) {
  if(value===undefined||value===null)return null;
  if(typeof value!=='object'||Array.isArray(value)||!Number.isInteger(value.page)||!Number.isInteger(value.pages)||value.page<1||value.pages<1||value.page>100000||value.pages>100000||value.page>value.pages||typeof value.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(value.fingerprint)||!Number.isInteger(value.version)||value.version<0)throw new Error('Rujukan halaman PDF tidak valid. Pilih ulang halaman pada berkas.');
  const version=Number(document&&document.version),currentVersion=Number.isInteger(version)&&version>0&&typeof (document&&document.label)==='string'&&document.label.trim()?version:0;
  if(value.version!==currentVersion)throw new Error('Versi berkas rujukan halaman berubah. Pilih ulang halaman pada berkas terbaru.');
  return {page:value.page,pages:value.pages,fingerprint:value.fingerprint,version:value.version};
}
function nextReviewDispatch(session,data) {
  if(data.action==='get_document_review') {const record=nextReviewRow(session,data.id);return Object.assign({status:'success'},nextReviewState(record.item));}
  if(session.role!=='admin')throw new Error('Hanya admin dapat menyimpan pemeriksaan atau mengelola arsip.');
  const requestId=nextRequestId(data.requestId);
  return nextLock(()=>{
    const record=nextReviewRow(session,data.id),item=record.item,logs=featureLogs(item.note),state=nextReviewState(item);
    if(!logs.length&&String(item.note||'').trim()&&String(item.note).trim()!=='[]')logs.push({role:'system',sender:'Sistem',time:String(item.date||new Date().toISOString()),message:String(item.note)});
    const signature=nextHash(JSON.stringify([data.action,data.reviews||null,data.reason||'']));
    const replay=logs.find(log=>log.reviewRequestId===requestId);
    if(replay){if(replay.reviewSignature!==signature)throw new Error('ID penyimpanan sudah digunakan untuk perubahan berbeda.');return Object.assign({status:'success',note:item.note},state);}
    if(data.version!==state.version)throw new Error('Pengajuan berubah. Segarkan sebelum menyimpan.');
    const event={kind:data.action==='save_document_review'?'document_review':'archive',sender:String(session.nama||'Admin'),role:'system',time:new Date().toISOString(),reviewRequestId:requestId,reviewSignature:signature};
    if(data.action==='save_document_review') {
      if(!['Pending','Resubmitted'].includes(String(item.status))||state.archived)throw new Error('Pemeriksaan hanya dapat disimpan untuk pengajuan yang menunggu admin.');
      if(!Array.isArray(data.reviews)||!data.reviews.length||data.reviews.length>20)throw new Error('Daftar pemeriksaan tidak valid.');
      const links=featureLinkUrls(item.link),seen=new Set(),metadata=logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]);
      event.reviews=data.reviews.map(review=>{
        if(!review||typeof review.url!=='string'||!links.includes(review.url)||seen.has(review.url)||!['pending','accepted','revision'].includes(review.status))throw new Error('Berkas pemeriksaan tidak termasuk pengajuan atau status tidak valid.');
        seen.add(review.url);const label=nextText(review.label,255),note=nextText(review.note||'',2000);
        if(!label||(review.status==='revision'&&!note))throw new Error('Lengkapi alasan untuk setiap berkas yang perlu diperbaiki.');
        const doc=metadata.slice().reverse().find(doc=>doc.url===review.url);
        if(doc&&doc.label!==label)throw new Error('Jenis berkas pemeriksaan tidak cocok.');
        const latest=metadata.filter(doc=>doc.label===label).sort((a,b)=>Number(b.version)-Number(a.version))[0];
        if(latest&&latest.url!==review.url)throw new Error('Periksa versi berkas terbaru.');
        const result={url:review.url,label:label,status:review.status,note:note},pageRef=nextReviewPageReference(review.pageRef,doc);
        if(pageRef)result.pageRef=pageRef;
        return result;
      });event.message='Pemeriksaan per berkas disimpan.';
    } else {
      if(String(item.status)!=='Accepted')throw new Error('Hanya pengajuan selesai yang dapat diarsipkan atau dipulihkan.');
      event.archived=data.action==='archive_request';
      if(state.archived===event.archived)throw new Error(event.archived?'Pengajuan sudah berada di arsip.':'Pengajuan sudah aktif.');
      event.reason=nextText(data.reason||'',500);if(!event.reason)throw new Error('Isi alasan perubahan arsip.');
      event.message=event.archived?'Pengajuan dipindahkan ke arsip.':'Pengajuan dipulihkan dari arsip.';
    }
    logs.push(event);const note=JSON.stringify(logs);if(Utilities.newBlob(note).getBytes().length>45000)throw new Error('Riwayat terlalu panjang. Hubungi pengelola.');
    record.row[record.headers.indexOf('note')]=note;
    try {record.sheet.getRange(record.index+1,1,1,record.row.length).setValues([record.row]);}
    catch(error){const saved=nextReviewRow(session,data.id).item;if(!featureLogs(saved.note).some(log=>log.reviewRequestId===requestId&&log.reviewSignature===signature))throw error;}
    return Object.assign({status:'success',note:note},nextReviewState(Object.assign({},item,{note:note})));
  });
}
function verifyNextDeployment() {
  let denied=0;for(const action of NEXT_ACTIONS) try { nextDispatch({action:action,token:''}); } catch(_) { denied++; }
  const p=PropertiesService.getScriptProperties(),key=nextDraftKey('__IPCOS_NEXT_RELEASE_TEST__'),before=p.getProperty(key);
  let roundTrip=false;try {p.setProperty(key,JSON.stringify({fields:{'reg-jenis-utama':'Outline'},revision:1,updatedAt:new Date().toISOString()}));roundTrip=nextDraftRead('__IPCOS_NEXT_RELEASE_TEST__').fields['reg-jenis-utama']==='Outline';} finally {if(before===null || before===undefined)p.deleteProperty(key);else p.setProperty(key,before);}
  const checks={anonymousActionsDenied:denied===NEXT_ACTIONS.length,draftRoundTrip:roundTrip,htmlEscaped:auditHtml('<script>')==='&lt;script&gt;',sha256Available:nextHash('release').length===64};
  console.log(JSON.stringify(checks));if(Object.values(checks).some(value=>value!==true))throw new Error('Pemeriksaan rilis belum lulus.');
}


// Verified academic stages are independent of request/document approval.
const ACADEMIC_ACTIONS=['get_academic_progress','save_academic_progress','change_request_type'];
function academicKey(nim){return 'IPCOS_ACADEMIC_'+nextHash(String(nim).trim());}
function academicRead(nim,properties){
  const raw=properties?properties[academicKey(nim)]:PropertiesService.getScriptProperties().getProperty(academicKey(nim));
  if(!raw)return {exists:false,level:0,revision:0,updatedAt:'',events:[]};
  const value=JSON.parse(raw);
  if(!value||!Number.isInteger(value.level)||value.level<0||value.level>3||!Number.isInteger(value.revision)||value.revision<1||!Array.isArray(value.events))throw new Error('Status akademik belum dapat dibaca. Hubungi admin.');
  return Object.assign({exists:true},value);
}
function academicStudent(nim){
  const sheet=SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_MAHASISWA);
  const students=sheet?getSheetData(sheet):[];
  return students.find(row=>String(row.NIM??row.nim??'').trim()===String(nim).trim())||featureRegistrations().find(row=>String(row.nim??row.NIM??'').trim()===String(nim).trim());
}
function academicOwner(session,nim){
  nim=nextText(String(nim||''),30);if(!nim)throw new Error('Pilih mahasiswa.');
  if(session.role==='mhs'&&(nim!==String(session.nim).trim()||!auditStudent(nim)))throw new Error('Akses status mahasiswa lain ditolak.');
  if(!academicStudent(nim))throw new Error('Mahasiswa tidak ditemukan.');return nim;
}
function academicSnapshot(session){
  if(session.role==='mhs'){try{return {academicSupported:true,academic:academicRead(session.nim)};}catch(_){return {academicSupported:true,academicUnavailable:true};}}
  const students=getSheetData(SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_MAHASISWA)),academicByNim={};
  const nims=new Set(students.map(row=>String(row.NIM??row.nim??'').trim()).filter(Boolean));
  featureRegistrations().forEach(row=>nims.add(String(row.nim??row.NIM??'').trim()));
  const properties=PropertiesService.getScriptProperties().getProperties();for(const nim of nims){try{const value=academicRead(nim,properties);academicByNim[nim]={exists:value.exists,level:value.level,revision:value.revision,updatedAt:value.updatedAt};}catch(_){academicByNim[nim]={unavailable:true};}}
  return {academicSupported:true,academicByNim:academicByNim};
}
function academicCheckCreate(data){
  if(!['Outline','Proposal','Pendadaran'].includes(data.jenis))return;
  const progress=academicRead(data.nim),level=progress.level;
  if((data.jenis==='Outline'&&level>=1)||(data.jenis==='Proposal'&&level>=2)||(data.jenis==='Pendadaran'&&level>=3))throw new Error('Tahap ini sudah selesai. Pilih tahap berikutnya.');
  if(data.jenis==='Proposal'&&level<1)throw new Error('Outline belum ditandai selesai oleh admin. Hubungi admin untuk verifikasi tahapan sebelumnya.');
  if(data.jenis==='Pendadaran'&&level<2)throw new Error('Sempro belum ditandai selesai oleh admin. Hubungi admin untuk verifikasi tahapan sebelumnya.');
}
function academicSave(session,data){
  if(session.role!=='admin')throw new Error('Hanya admin dapat mengubah status akademik.');
  const nim=academicOwner(session,data.nim),level=data.level,reason=nextText(data.reason||'',500),requestId=nextRequestId(data.requestId);
  if(!Number.isInteger(level)||level<0||level>3||!Number.isInteger(data.revision)||data.revision<0||!reason)throw new Error('Pilih tahap selesai dan tulis keterangan perubahan.');
  const signature=nextHash(JSON.stringify([nim,level,reason]));
  return nextLock(()=>{
    const previous=academicRead(nim),replay=previous.events.find(event=>event.requestId===requestId);
    if(replay){if(replay.signature!==signature)throw new Error('ID penyimpanan sudah dipakai untuk perubahan berbeda.');return {status:'success',academic:previous};}
    if(previous.revision!==data.revision)throw new Error('Status akademik berubah di sesi lain. Muat ulang sebelum menyimpan.');
    const time=new Date().toISOString(),event={from:previous.exists?previous.level:null,to:level,reason:reason,actor:String(session.nama||'Admin'),time:time,requestId:requestId,signature:signature};
    const next={level:level,revision:previous.revision+1,updatedAt:time,events:previous.events.concat(event)},json=JSON.stringify(next);
    if(Utilities.newBlob(json).getBytes().length>8000)throw new Error('Riwayat status akademik terlalu panjang. Hubungi pengelola.');
    const props=PropertiesService.getScriptProperties(),key=academicKey(nim);
    try{props.setProperty(key,json);}catch(error){let confirmed;try{confirmed=academicRead(nim).events.some(item=>item.requestId===requestId&&item.signature===signature);}catch(_){}if(!confirmed)throw error;}
    return {status:'success',academic:Object.assign({exists:true},next)};
  });
}
function academicChangeType(session,data){
  if(session.role!=='admin')throw new Error('Hanya admin dapat mengubah jenis pengajuan.');
  const type=data.type,reason=nextText(data.reason||'',500),requestId=nextRequestId(data.requestId);
  if(!['Outline','Proposal','Pendadaran'].includes(type)||!reason)throw new Error('Pilih jenis pengajuan dan isi alasan perubahan.');
  return nextLock(()=>{
    const record=nextReviewRow(session,data.id),item=record.item,logs=featureLogs(item.note),signature=nextHash(JSON.stringify([type,reason]));
    const replay=logs.find(log=>log.typeChangeRequestId===requestId);
    if(replay){if(replay.typeChangeSignature!==signature)throw new Error('ID perubahan sudah dipakai.');return {status:'success',id:String(item.id)};}
    if(data.version!==nextRevisionVersion(item))throw new Error('Pengajuan berubah. Muat ulang sebelum mengganti jenis.');
    if(!['Pending','Revision','Resubmitted'].includes(String(item.status).trim())||nextReviewState(item).archived)throw new Error('Hanya pengajuan aktif yang dapat dikoreksi jenisnya.');
    if(type===item.jenis)throw new Error('Jenis pengajuan belum berubah.');
    academicCheckCreate({nim:item.nim,jenis:type});
    if(featureRegistrations().some(row=>String(row.id)!==String(item.id)&&String(row.nim).trim()===String(item.nim).trim()&&row.jenis===type&&['Pending','Revision','Resubmitted'].includes(String(row.status).trim())))throw new Error('Mahasiswa sudah memiliki pengajuan aktif untuk jenis ini.');
    const allLinks=featureLinkUrls(item.link),metadata=logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]),latest=new Map();for(const doc of metadata)if(allLinks.includes(doc.url)&&(!latest.has(doc.label)||Number(doc.version)>=Number(latest.get(doc.label).version)))latest.set(doc.label,doc);const current=featureLabels(item.jenis).map(label=>latest.get(label)?.url).filter(Boolean),links=current.length?current:allLinks,labels=featureLabels(type);
    if(type!=='Pendadaran'&&links.some(url=>/\.(zip|rar|7z)$/i.test((metadata.slice().reverse().find(doc=>doc.url===url)||{}).fileName||'')))throw new Error('Arsip hanya didukung untuk Pendadaran. Minta dokumen sesuai jenis tujuan.');
    if(links.length!==labels.length)throw new Error('Jumlah berkas belum sesuai jenis tujuan. Minta mahasiswa melengkapi berkas terlebih dahulu.');
    // A type correction preserves URLs/files and records their new requirement
    // association. It never approves the files or marks an exam as completed.
    logs.push({kind:'request_type_change',status:'Pending',role:'system',sender:String(session.nama||'Admin'),time:new Date().toISOString(),message:reason,fromType:item.jenis,toType:type,typeChangeRequestId:requestId,typeChangeSignature:signature,documents:links.map((url,index)=>({url:url,label:labels[index],fileName:(logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]).slice().reverse().find(doc=>doc.url===url)||{}).fileName||labels[index],version:1}))});
    const note=JSON.stringify(logs);if(Utilities.newBlob(note).getBytes().length>45000)throw new Error('Riwayat pengajuan terlalu panjang.');
    record.row[record.headers.indexOf('jenis')]=type;record.row[record.headers.indexOf('status')]='Pending';record.row[record.headers.indexOf('note')]=note;
    try{record.sheet.getRange(record.index+1,1,1,record.row.length).setValues([record.row]);}catch(error){const saved=nextReviewRow(session,data.id).item;if(!featureLogs(saved.note).some(log=>log.typeChangeRequestId===requestId&&log.typeChangeSignature===signature))throw error;}
    return {status:'success',id:String(item.id)};
  });
}
function academicDispatch(session,data){
  if(session.role==='mhs'&&data.nim&&String(data.nim).trim()!==String(session.nim).trim())throw new Error('Akses status mahasiswa lain ditolak.');
  if(data.action==='get_academic_progress')return {status:'success',academic:academicRead(academicOwner(session,session.role==='mhs'?session.nim:data.nim))};
  if(data.action==='save_academic_progress')return academicSave(session,data);
  return academicChangeType(session,data);
}

// Internationalization records and summaries are restricted to administrators.
const INTERNATIONAL_ACTIONS=['get_internationalization','preview_international_excel','import_international_excel','save_international_record'];
function intlMeta(){const raw=PropertiesService.getScriptProperties().getProperty('IPCOS_INTL_META');return raw?JSON.parse(raw):{exists:false,revision:0,parts:0,generation:'',updatedAt:''};}
function intlSource(){const meta=intlMeta(),props=PropertiesService.getScriptProperties(),rows=[];for(let i=0;i<meta.parts;i++){const raw=props.getProperty('IPCOS_INTL_ROWS_'+meta.generation+'_'+i);if(!raw)throw new Error('Data internasionalisasi belum lengkap. Coba muat ulang.');const part=JSON.parse(raw);if(!Array.isArray(part))throw new Error('Data internasionalisasi tidak valid.');rows.push(...part);}return {meta:meta,rows:rows};}
function intlOverrideKey(nim){return 'IPCOS_INTL_EDIT_'+nextHash(String(nim));}
function intlRows(){
 const source=intlSource(),map=new Map(source.rows.map(row=>[row.nim,Object.assign({},row)])),props=PropertiesService.getScriptProperties().getProperties();
 for(const key of Object.keys(props))if(key.startsWith('IPCOS_INTL_ROSTER_'))for(const row of intlNormalizeRows(JSON.parse(props[key])))if(!map.has(row.nim))map.set(row.nim,Object.assign({},row));
 const sheet=SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_MAHASISWA),students=sheet?getSheetData(sheet):[];
 for(const student of students){const nim=String(student.NIM??student.nim??'').trim(),year=Number(nim.slice(0,4)),name=String(student.Nama??student.nama??'').trim();if(year>=2024&&year<=2100&&nim&&name&&!map.has(nim))map.set(nim,{nim:nim,nama:name,angkatan:year,kelas:'',keterangan:'',status:''});}
 for(const key of Object.keys(props))if(key.startsWith('IPCOS_INTL_EDIT_')){const saved=JSON.parse(props[key]);if(saved.active!==false){const old=map.get(saved.record.nim)||saved.record;map.set(saved.record.nim,Object.assign({},old,{kelas:saved.record.kelas,keterangan:saved.record.keterangan,status:saved.record.status,manual:true,editRevision:saved.revision,updatedAt:saved.updatedAt}));}else if(map.has(saved.record.nim)){const row=map.get(saved.record.nim);row.editRevision=saved.revision;}}
 const rows=[...map.values()].map(row=>Object.assign({manual:false,editRevision:0},row));rows.sort((a,b)=>b.angkatan-a.angkatan||a.kelas.localeCompare(b.kelas)||a.nim.localeCompare(b.nim));return {meta:source.meta,rows:rows};
}
function intlSummary(rows){const groups=new Map();for(const row of rows){const key=row.angkatan+':'+row.kelas;if(!groups.has(key))groups.set(key,{angkatan:row.angkatan,kelas:row.kelas,total:0,withNotes:0});const group=groups.get(key);group.total++;if(row.keterangan.trim())group.withNotes++;}return [...groups.values()].sort((a,b)=>b.angkatan-a.angkatan||a.kelas.localeCompare(b.kelas));}
function intlResponse(session){if(session.role!=='admin')throw new Error('Data internasionalisasi hanya dapat diakses admin.');const data=intlRows(),result={status:'success',meta:{exists:data.meta.exists===true,revision:data.meta.revision,updatedAt:data.meta.updatedAt},summary:intlSummary(data.rows)};if(session.role==='admin'){result.rows=data.rows;result.meta.fileName=data.meta.fileName||'';result.meta.sourceUrl=data.meta.sourceUrl||'';}return result;}
function intlNormalizeRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>600)throw new Error('Data harus berisi 1–600 mahasiswa.');const seen=new Set();
 return rows.map(row=>{if(!row||typeof row!=='object')throw new Error('Baris data tidak valid.');const nim=nextText(String(row.nim||''),30),nama=nextText(row.nama||'',200),kelas=nextText(row.kelas||'',10),angkatan=Number(row.angkatan),keterangan=nextText(row.keterangan||'',1500),status=nextText(row.status||'',100);if(!/^[A-Za-z0-9_-]+$/.test(nim)||!nama||!Number.isInteger(angkatan)||angkatan<2000||angkatan>2100||!['','I','J'].includes(kelas)||seen.has(nim))throw new Error('NIM duplikat, nama, kelas, atau angkatan tidak valid.');seen.add(nim);return {nim:nim,nama:nama,angkatan:angkatan,kelas:kelas,keterangan:keterangan,status:status};});
}
function intlXml(text){if(typeof text!=='string'||text.length>2000000||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Struktur XML tidak didukung.');return XmlService.parse(text).getRootElement();}
function intlText(element){if(!element)return '';if(element.getName()==='t')return element.getText();return element.getChildren().map(intlText).join('');}
function intlZipBound(bytes){
 const b=bytes.map(v=>(v+256)%256),u16=i=>b[i]+b[i+1]*256,u32=i=>u16(i)+u16(i+2)*65536;let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===b.length){end=i;break;}
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10)||u16(end+10)>120)throw new Error('Paket XLSX tidak valid.');let cursor=u32(end+16),total=0;const names=new Set();
 for(let i=0;i<u16(end+10);i++){if(u32(cursor)!==0x02014b50||u16(cursor+8)&1)throw new Error('XLSX terenkripsi tidak didukung.');const size=u32(cursor+24),len=u16(cursor+28),extra=u16(cursor+30),comment=u16(cursor+32);if(cursor+46+len+extra+comment>end||size>2000000||(total+=size)>8000000)throw new Error('Isi XLSX terlalu besar.');const name=Utilities.newBlob(bytes.slice(cursor+46,cursor+46+len)).getDataAsString();if(names.has(name)||name.includes('..')||name.includes('vbaProject')||name.startsWith('xl/embeddings/'))throw new Error('Paket XLSX mengandung bagian tidak didukung.');names.add(name);cursor+=46+len+extra+comment;}
 if(!names.has('xl/workbook.xml')||!names.has('xl/_rels/workbook.xml.rels'))throw new Error('File bukan workbook XLSX.');
}
function intlParseExcel(data){
 if(typeof data.fileName!=='string'||!data.fileName.toLowerCase().endsWith('.xlsx')||typeof data.base64!=='string'||data.base64.length>2800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64))throw new Error('Pilih file XLSX hingga 2 MB.');
 const bytes=Utilities.base64Decode(data.base64);if(bytes.length<22||bytes.length>2*1024*1024)throw new Error('Ukuran XLSX tidak sesuai.');intlZipBound(bytes);
 const files=new Map(Utilities.unzip(Utilities.newBlob(bytes,'application/zip')).map(blob=>[blob.getName(),blob.getDataAsString()]));
 const ns=XmlService.getNamespace('http://schemas.openxmlformats.org/spreadsheetml/2006/main'),relNs=XmlService.getNamespace('http://schemas.openxmlformats.org/officeDocument/2006/relationships'),relationships=intlXml(files.get('xl/_rels/workbook.xml.rels'));
 const targets=new Map(relationships.getChildren().map(rel=>[rel.getAttribute('Id').getValue(),{target:rel.getAttribute('Target').getValue(),external:rel.getAttribute('TargetMode')?.getValue()==='External'}]));
 const shared=files.has('xl/sharedStrings.xml')?intlXml(files.get('xl/sharedStrings.xml')).getChildren('si',ns).map(intlText):[];if(shared.length>10000)throw new Error('Terlalu banyak isian XLSX.');
 const sheets=intlXml(files.get('xl/workbook.xml')).getChild('sheets',ns).getChildren('sheet',ns),records=[];
 for(const sheet of sheets){const name=sheet.getAttribute('name').getValue(),match=name.match(/20\d\d/);if(!match)continue;const target=targets.get(sheet.getAttribute('id',relNs).getValue());if(!target||target.external)throw new Error('Lembar eksternal tidak didukung.');const path=target.target.startsWith('/')?target.target.slice(1):'xl/'+target.target;if(!files.has(path))throw new Error('Lembar XLSX tidak ditemukan.');const rows=[];const sheetData=intlXml(files.get(path)).getChild('sheetData',ns);if(!sheetData)continue;
  for(const row of sheetData.getChildren('row',ns)){const cells=[];for(const cell of row.getChildren('c',ns)){const address=cell.getAttribute('r')?.getValue(),letters=address?.match(/^[A-Z]+/)?.[0];if(!letters)throw new Error('Alamat sel XLSX tidak valid.');let col=0;for(const char of letters)col=col*26+char.charCodeAt(0)-64;if(col>40)continue;const type=cell.getAttribute('t')?.getValue(),v=cell.getChild('v',ns)?.getText()||'';let value=type==='s'?shared[Number(v)]:type==='inlineStr'?intlText(cell.getChild('is',ns)):v;if(type==='s'&&value===undefined)throw new Error('Teks sel XLSX tidak ditemukan.');cells[col-1]=String(value||'').trim();}rows.push(cells);if(rows.length>2000)throw new Error('Terlalu banyak baris XLSX.');}
  for(let h=0;h<rows.length;h++)for(let c=0;c<rows[h].length;c++)if(rows[h][c]?.toLowerCase()==='nim'&&rows[h][c+1]?.toLowerCase()==='nama'&&rows[h][c+2]?.toLowerCase()==='keterangan'){
   let kelas='';for(let above=Math.max(0,h-3);above<h;above++)for(const caption of rows[above].slice(Math.max(0,c-1),c+3)){const group=String(caption||'').match(/kelas\s+([IJ])\b/i);if(group)kelas=group[1].toUpperCase();}
   for(let r=h+1;r<rows.length;r++){let nim=rows[r][c];if(!nim||nim.toLowerCase()==='nim')continue;if(/^\d+\.0+$/.test(nim))nim=nim.split('.')[0];records.push({nim:nim,nama:rows[r][c+1]||'',angkatan:Number(match[0]),kelas:kelas,keterangan:rows[r][c+2]||'',status:rows[h][c+3]?.toLowerCase()==='status'?rows[r][c+3]||'':''});}
  }
 }
 return intlNormalizeRows(records);
}
function intlImportRows(session,data,rows){
 if(session.role!=='admin')throw new Error('Hanya admin dapat mengimpor data.');rows=intlNormalizeRows(rows);const requestId=nextRequestId(data.requestId),signature=nextHash(JSON.stringify(rows));
 return nextLock(()=>{const previous=intlMeta();if(previous.requestId===requestId){if(previous.signature!==signature)throw new Error('ID impor sudah dipakai untuk data berbeda.');return intlResponse(session);}if(data.revision!==previous.revision)throw new Error('Data sumber berubah. Muat ulang sebelum impor.');
  const props=PropertiesService.getScriptProperties(),generation=requestId,parts=[],created=[];let batch=[];for(const row of rows){if(Utilities.newBlob(JSON.stringify(batch.concat(row))).getBytes().length>7000){parts.push(JSON.stringify(batch));batch=[];}batch.push(row);}if(batch.length)parts.push(JSON.stringify(batch));
  const existing=Object.values(props.getProperties()).reduce((sum,value)=>sum+Utilities.newBlob(String(value)).getBytes().length,0);if(existing+parts.reduce((sum,p)=>sum+Utilities.newBlob(p).getBytes().length,0)>450000)throw new Error('Penyimpanan hampir penuh. Hubungi pengelola sebelum impor.');
  const sourceUrl=String(data.sourceUrl||previous.sourceUrl||'');if(sourceUrl&&!/^https:\/\/umyac-my\.sharepoint\.com\//.test(sourceUrl))throw new Error('Alamat sumber SharePoint tidak valid.');
  const meta={exists:true,revision:previous.revision+1,generation:generation,parts:parts.length,fileName:nextText(data.fileName||'Data Internasionalisasi.xlsx',255),sourceUrl:sourceUrl,updatedAt:new Date().toISOString(),requestId:requestId,signature:signature};let confirmed=false;
  try{parts.forEach((part,i)=>{const key='IPCOS_INTL_ROWS_'+generation+'_'+i;created.push(key);props.setProperty(key,part);});props.setProperty('IPCOS_INTL_META',JSON.stringify(meta));confirmed=true;}catch(error){const saved=intlMeta();confirmed=saved.requestId===requestId&&saved.signature===signature;if(!confirmed){created.forEach(key=>{try{props.deleteProperty(key);}catch(_){}});throw error;}}
  if(confirmed&&previous.generation&&previous.generation!==generation)for(let i=0;i<previous.parts;i++){try{props.deleteProperty('IPCOS_INTL_ROWS_'+previous.generation+'_'+i);}catch(_){}}
  return intlResponse(session);
 });
}
function intlSave(session,data){
 if(session.role!=='admin')throw new Error('Hanya admin dapat mengubah data internasionalisasi.');const nim=nextText(data.nim||'',30),requestId=nextRequestId(data.requestId);return nextLock(()=>{const all=intlRows(),base=all.rows.find(row=>row.nim===nim);if(!base)throw new Error('Mahasiswa tidak ditemukan.');const props=PropertiesService.getScriptProperties(),key=intlOverrideKey(nim),oldRaw=props.getProperty(key),old=oldRaw?JSON.parse(oldRaw):{revision:0,events:[]};
 const fields={kelas:nextText(data.kelas||'',10),keterangan:nextText(data.keterangan||'',1500),status:nextText(data.recordStatus||'',100)};if(!['','I','J'].includes(fields.kelas))throw new Error('Kelas tidak valid.');const signature=nextHash(JSON.stringify([nim,fields,data.reset===true]));const replay=old.events.find(event=>event.requestId===requestId);if(replay){if(replay.signature!==signature)throw new Error('ID simpan sudah dipakai untuk perubahan berbeda.');return intlResponse(session);}if(data.revision!==old.revision||data.sourceRevision!==all.meta.revision)throw new Error('Data berubah di sesi lain. Muat ulang sebelum menyimpan.');
 const time=new Date().toISOString(),event={requestId:requestId,signature:signature,time:time,actor:String(session.nama||'Admin'),reset:data.reset===true,before:{kelas:base.kelas,keterangan:base.keterangan,status:base.status},after:fields};const saved={record:Object.assign({},base,fields),active:data.reset!==true,revision:old.revision+1,updatedAt:time,events:old.events.concat(event)};const json=JSON.stringify(saved);if(Utilities.newBlob(json).getBytes().length>8000)throw new Error('Riwayat perubahan terlalu panjang. Hubungi pengelola.');try{props.setProperty(key,json);}catch(error){const confirmed=props.getProperty(key);if(!confirmed||!JSON.parse(confirmed).events.some(item=>item.requestId===requestId&&item.signature===signature))throw error;}return intlResponse(session);
 });
}
function internationalDispatch(session,data){
 if(session.role!=='admin')throw new Error('Data internasionalisasi hanya dapat diakses admin.');
 if(data.action==='get_internationalization')return intlResponse(session);
 if(data.action==='save_international_record')return intlSave(session,data);
 const rows=intlParseExcel(data);if(data.action==='preview_international_excel')return {status:'success',rows:rows,summary:intlSummary(rows),signature:nextHash(JSON.stringify(rows))};return intlImportRows(session,data,rows);
}
function academicPrivateBackup(){const props=PropertiesService.getScriptProperties().getProperties(),result={};for(const key of Object.keys(props))if(key.startsWith('IPCOS_ACADEMIC_')||key.startsWith('IPCOS_INTL_'))result[key]=props[key];return result;}
