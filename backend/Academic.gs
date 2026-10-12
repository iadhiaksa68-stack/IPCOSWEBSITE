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
