// Optional workflow extensions. No new spreadsheet, column, credential or public file.
const NEXT_ACTIONS = ['get_form_draft','save_form_draft','get_revision_form','revise_request','report_health','get_health'];
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
  if(data.action==='get_form_draft') { nextOwner(session);return {status:'success',draft:nextDraftRead(session.nim)}; }
  if(data.action==='save_form_draft') return nextDraftSave(session,data);
  if(data.action==='get_revision_form') return nextRevisionForm(session,data);
  if(data.action==='revise_request') return nextRevise(session,data);
  if(data.action==='report_health') return nextHealthReport(session,data);
  if(data.action==='get_health') return nextHealthRead(session);
  throw new Error('Aksi tidak valid.');
}
function verifyNextDeployment() {
  let denied=0;for(const action of NEXT_ACTIONS) try { nextDispatch({action:action,token:''}); } catch(_) { denied++; }
  const p=PropertiesService.getScriptProperties(),key=nextDraftKey('__IPCOS_NEXT_RELEASE_TEST__'),before=p.getProperty(key);
  let roundTrip=false;try {p.setProperty(key,JSON.stringify({fields:{'reg-jenis-utama':'Outline'},revision:1,updatedAt:new Date().toISOString()}));roundTrip=nextDraftRead('__IPCOS_NEXT_RELEASE_TEST__').fields['reg-jenis-utama']==='Outline';} finally {if(before===null || before===undefined)p.deleteProperty(key);else p.setProperty(key,before);}
  const checks={anonymousActionsDenied:denied===NEXT_ACTIONS.length,draftRoundTrip:roundTrip,htmlEscaped:auditHtml('<script>')==='&lt;script&gt;',sha256Available:nextHash('release').length===64};
  console.log(JSON.stringify(checks));if(Object.values(checks).some(value=>value!==true))throw new Error('Pemeriksaan rilis belum lulus.');
}
