// IPCOS transaction improvements. Existing sheet columns and authentication stay intact.
const IPCOS_TYPES = ['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'];
function featureLabels(type) {
  return ({Outline:['Transkrip','Draft Proposal'],Proposal:['Form ACC Seminar Proposal'],Pendadaran:['Berkas Pendadaran'],'Skripsi Jurnal':['LoA Jurnal','Draft Jurnal'],'Pergantian Pembimbing':['Surat Permohonan Ganti Dosen']})[type] || [];
}
function featureConfig() {
  let data; try { data = JSON.parse(PropertiesService.getScriptProperties().getProperty('IPCOS_SERVICE_CONFIG') || '{}'); } catch (_) { data = {}; }
  return IPCOS_TYPES.map(type => Object.assign({type:type,enabled:true,open:'',close:'',adminDays:3,studentDays:7},data[type] || {}));
}
function featureSaveConfig(data) {
  const result = {};
  if (!Array.isArray(data.services) || data.services.length !== IPCOS_TYPES.length) throw new Error('Lengkapi pengaturan lima layanan.');
  data.services.forEach(item => {
    if (!IPCOS_TYPES.includes(item.type) || result[item.type]) throw new Error('Jenis layanan tidak valid.');
    const validDate = value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value);
    if (!validDate(item.open) || !validDate(item.close) || (item.open && item.close && item.open > item.close)) throw new Error('Tanggal periode tidak valid.');
    const adminDays = Number(item.adminDays), studentDays = Number(item.studentDays);
    if (![adminDays,studentDays].every(n => Number.isInteger(n) && n >= 1 && n <= 365)) throw new Error('Target internal harus 1–365 hari.');
    result[item.type] = {enabled:item.enabled === true,open:item.open || '',close:item.close || '',adminDays:adminDays,studentDays:studentDays};
  });
  PropertiesService.getScriptProperties().setProperty('IPCOS_SERVICE_CONFIG',JSON.stringify(result));
  return {status:'success',services:featureConfig()};
}
function featureRegistrations() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_REGISTRASI);
  return sheet ? getSheetData(sheet) : [];
}
function featureCheckCreate(data) {
  const existing = featureRegistrations().find(r => String(r.nim).trim() === String(data.nim).trim() && r.jenis === data.jenis && ['Pending','Revision','Resubmitted'].includes(r.status));
  if (existing) return {status:'duplicate',id:String(existing.id),message:'Pengajuan sejenis masih berjalan. Lanjutkan pengajuan yang sudah ada.'};
  if (Array.isArray(data.files)) featureCheckSubmissionFiles(data.files,data.jenis);
  const config = featureConfig().find(c => c.type === data.jenis);
  const today = Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd');
  if (!config || !config.enabled || (config.open && today < config.open) || (config.close && today > config.close)) throw new Error('Pendaftaran layanan ini sedang ditutup. Pengajuan yang sudah berjalan tetap dapat dilanjutkan.');
  return null;
}
function featureLogs(note) { try { const logs=JSON.parse(String(note || '[]')); return Array.isArray(logs) ? logs : []; } catch (_) { return []; } }
function featureLinkUrls(html) { return Array.from(String(html || '').matchAll(/href=["']([^"']+)["']/g)).map(m=>m[1].replace(/&amp;/g,'&')); }
function featureDocumentMetadata(files, links, logs, type) {
  const urls = featureLinkUrls(links);
  if (urls.length !== files.length) throw new Error('Pencatatan versi berkas gagal.');
  return files.map((file,index) => {
    const versions = logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]).filter(doc=>doc.label===file.label).map(doc=>Number(doc.version)||1);
    return {label:file.label,fileName:file.fileName,url:urls[index],version:Math.max(0,...versions)+1};
  });
}
function featureValidateRevision(data,row) {
  if (data.senderRole !== 'mhs') return;
  const allowed = featureLabels(row.jenis);
  const files = Array.isArray(data.files) ? data.files : [];
  const labels = files.map(f=>String(f.label || ''));
  if (labels.some(label=>!allowed.includes(label)) || new Set(labels).size !== labels.length) throw new Error('Pilih jenis dokumen yang berbeda untuk setiap berkas perbaikan.');
  const lastAdmin = featureLogs(row.note).slice().reverse().find(log=>log.role==='admin');
  const text = String(lastAdmin && lastAdmin.message || '').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'');
  const match = text.match(/Berkas yang perlu diperbaiki:\s*\n([\s\S]*?)\n\nInstruksi:/);
  const requested = match ? match[1].split('\n').map(s=>s.replace(/^-\s*/,'').trim()).filter(s=>allowed.includes(s)) : [];
  if (requested.some(label=>!labels.includes(label))) throw new Error('Unggah setiap dokumen yang diminta admin.');
}
function featureReceipt(session,id) {
  const row = featureRegistrations().find(r=>String(r.id)===String(id));
  if (!row || (session.role !== 'admin' && String(row.nim).trim() !== String(session.nim))) throw new Error('Pengajuan tidak ditemukan atau akses ditolak.');
  const html = '<html><head><meta charset="UTF-8"></head><body style="font-family:Arial;padding:32px"><h1>IPCOS</h1><h2>Bukti penerimaan pengajuan</h2><p>Nomor: '+auditHtml(row.id)+'</p><p>Mahasiswa: '+auditHtml(row.nama)+' ('+auditHtml(row.nim)+')</p><p>Layanan: '+auditHtml(row.jenis)+'</p><p>Dikirim: '+auditHtml(row.date)+'</p><p>Status saat diunduh: '+auditHtml(row.status)+'</p><hr><p>Bukti ini menyatakan pengajuan tercatat, bukan persetujuan akademik.</p></body></html>';
  const pdf = Utilities.newBlob(html,'text/html','receipt.html').getAs('application/pdf');
  return {status:'success',fileName:'IPCOS-'+String(row.id).replace(/[^a-zA-Z0-9_-]/g,'')+'.pdf',base64:Utilities.base64Encode(pdf.getBytes())};
}
function featureBackupStatus() {
  const p=PropertiesService.getScriptProperties();
  let result; try { result=JSON.parse(p.getProperty('IPCOS_BACKUP_STATUS') || '{}'); } catch (_) { result={}; }
  try { result.scheduled = ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='scheduledBackup'); } catch (_) { result.scheduled=false; result.state='failed'; }
  const jobRaw=p.getProperty('IPCOS_BACKUP_JOB');
  result.running = !!jobRaw;
  if (jobRaw) { try { const job=JSON.parse(jobRaw); result.copied=job.cursor; } catch (_) {} }
  return result;
}
function setupBackups() {
  const triggers=ScriptApp.getProjectTriggers();
  if (!triggers.some(t=>t.getHandlerFunction()==='scheduledBackup')) ScriptApp.newTrigger('scheduledBackup').timeBased().everyDays(1).atHour(4).inTimezone('Asia/Jakarta').create();
  if (!triggers.some(t=>t.getHandlerFunction()==='continueBackup')) ScriptApp.newTrigger('continueBackup').timeBased().everyMinutes(10).create();
  scheduledBackup();
}
function scheduledBackup() {
  const lock=LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  try {
    const p=PropertiesService.getScriptProperties(); if (p.getProperty('IPCOS_BACKUP_JOB')) return;
    let rootId=p.getProperty('IPCOS_BACKUP_ROOT');
    if (!rootId) { rootId=DriveApp.createFolder('IPCOS - Cadangan Privat').getId(); p.setProperty('IPCOS_BACKUP_ROOT',rootId); }
    const folder=DriveApp.getFolderById(rootId).createFolder(Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd HH-mm-ss'));
    const copy=featurePrivateFile(DriveApp.getFileById(SHEET_ID).makeCopy('Database IPCOS',folder));
    const sheet=SpreadsheetApp.openById(copy.getId()).getSheetByName(SHEET_REGISTRASI);
    const records=sheet ? getSheetData(sheet) : [];
    const ids=[...new Set(records.flatMap(r=>featureLinkUrls(r.link)).map(url=>(url.match(/\/d\/([\w-]+)/)||url.match(/[?&]id=([\w-]+)/)||[])[1]).filter(Boolean).concat(sopBackupFiles()))];
    const manifest={created:new Date().toISOString(),database:copy.getId(),config:featureConfig(),preparation:journeyBackup(),files:ids.map(id=>({originalId:id})),errors:[]};
    const manifestFile=folder.createFile('manifest.json',JSON.stringify(manifest),MimeType.PLAIN_TEXT);
    p.setProperty('IPCOS_BACKUP_JOB',JSON.stringify({folder:folder.getId(),manifest:manifestFile.getId(),cursor:0}));
    p.setProperty('IPCOS_BACKUP_STATUS',JSON.stringify({state:'running',started:manifest.created}));
  } catch(error) { PropertiesService.getScriptProperties().setProperty('IPCOS_BACKUP_STATUS',JSON.stringify({state:'failed',time:new Date().toISOString(),message:'Cadangan belum selesai. Periksa log eksekusi backend.'})); throw error; }
  finally { lock.releaseLock(); }
  continueBackup();
}
function continueBackup() {
  const lock=LockService.getScriptLock(); if (!lock.tryLock(1000)) return;
  try {
    const p=PropertiesService.getScriptProperties(), raw=p.getProperty('IPCOS_BACKUP_JOB'); if (!raw) return;
    const job=JSON.parse(raw), folder=DriveApp.getFolderById(job.folder), file=DriveApp.getFileById(job.manifest);
    const manifest=JSON.parse(file.getBlob().getDataAsString()), stop=Date.now()+120000;
    let count=0;
    while (job.cursor<manifest.files.length && count<100 && Date.now()<stop) {
      const entry=manifest.files[job.cursor], name=entry.originalId;
      try { const previous=folder.getFilesByName(name); entry.copyId=(previous.hasNext()?previous.next():featurePrivateFile(DriveApp.getFileById(entry.originalId).makeCopy(name,folder))).getId(); }
      catch(error) { manifest.errors.push({originalId:entry.originalId,message:'Berkas tidak dapat disalin.'}); }
      job.cursor++; count++;
    }
    file.setContent(JSON.stringify(manifest));
    if (job.cursor>=manifest.files.length) {
      p.setProperty('IPCOS_BACKUP_STATUS',JSON.stringify({state:manifest.errors.length?'partial':'success',time:new Date().toISOString(),files:manifest.files.length,errors:manifest.errors.length,folderId:job.folder}));
      p.deleteProperty('IPCOS_BACKUP_JOB');
    } else p.setProperty('IPCOS_BACKUP_JOB',JSON.stringify(job));
  } catch(error) { PropertiesService.getScriptProperties().setProperty('IPCOS_BACKUP_STATUS',JSON.stringify({state:'failed',time:new Date().toISOString(),message:'Cadangan belum selesai. Periksa log eksekusi backend.'})); throw error; }
  finally { lock.releaseLock(); }
}
function featureDispatch(data) {
  const session=getSession(data.token);
  if (!session) throw new Error('Sesi tidak valid atau berakhir.');
  if (['get_sop','save_sop','get_sop_file'].includes(data.action)) return sopDispatch(data,session);
  if (data.action==='get_receipt') return featureReceipt(session,data.id);
  if (data.action==='get_document') return featureDocument(session,data);
  if (session.role!=='admin') throw new Error('Akses admin diperlukan.');
  if (data.action==='save_services') return featureSaveConfig(data);
  if (data.action==='backup_status') return {status:'success',backup:featureBackupStatus()};
  throw new Error('Aksi tidak valid.');
}

function featurePrivateFile(file) {
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
  file.getEditors().forEach(user=>file.removeEditor(user));
  file.getViewers().forEach(user=>file.removeViewer(user));
  return file;
}

// Owner-only diagnostic, never exposed by the web API and never logs student data.
function verifyFeatureDeployment() {
  continueBackup();
  const data=getDataForSession({role:'admin'});
  const pdf=Utilities.newBlob('<html><body><h1>IPCOS</h1><p>Bukti penerimaan pengajuan - Uji</p></body></html>','text/html','test.html').getAs('application/pdf');
  const header=pdf.getBytes().slice(0,5).map(b=>String.fromCharCode((b+256)%256)).join('');
  const backup=featureBackupStatus();
  let document=null, receipt=null;
  const record=data.registrations.find(r=>featureLinkUrls(r.link).some(url=>/^https:\/\/(drive|docs)\.google\.com\//i.test(url)));
  if(record) { const url=featureLinkUrls(record.link).find(url=>/^https:\/\/(drive|docs)\.google\.com\//i.test(url)); const result=featureDocument({role:'admin'},{id:record.id,url:url}); document={available:!!result.base64,mime:result.mimeType}; receipt=featureReceipt({role:'admin'},record.id).status==='success'; }
  console.log(JSON.stringify({api:data.status,services:data.services.length,pdf:header==='%PDF-',pdfBytes:pdf.getBytes().length,document:document,receipt:receipt,backup:backup}));
}

function featureDocument(session,data) {
  const row=featureRegistrations().find(r=>String(r.id)===String(data.id));
  if (!row || (session.role!=='admin' && String(row.nim).trim()!==String(session.nim))) throw new Error('Pengajuan tidak ditemukan atau akses ditolak.');
  const url=String(data.url || '');
  if (!featureLinkUrls(row.link).includes(url) || !/^https:\/\/(drive|docs)\.google\.com\//i.test(url)) throw new Error('Berkas tidak termasuk dalam pengajuan ini.');
  const id=(url.match(/\/d\/([\w-]+)/)||url.match(/[?&]id=([\w-]+)/)||[])[1];
  if (!id) throw new Error('Tautan berkas tidak valid.');
  const key=(url.match(/[?&]resourcekey=([^&]+)/)||[])[1];
  const file=key?DriveApp.getFileByIdAndResourceKey(id,decodeURIComponent(key)):DriveApp.getFileById(id);
  if (file.getSize()>10*1024*1024) throw new Error('Berkas terlalu besar untuk diunduh melalui IPCOS. Hubungi admin.');
  const native=String(file.getMimeType()).startsWith('application/vnd.google-apps.');
  const blob=native?file.getAs('application/pdf'):file.getBlob(), bytes=blob.getBytes();
  if (bytes.length>10*1024*1024) throw new Error('Berkas terlalu besar untuk diunduh melalui IPCOS. Hubungi admin.');
  return {status:'success',fileName:file.getName()+(native?'.pdf':''),mimeType:native?'application/pdf':file.getMimeType(),base64:Utilities.base64Encode(bytes)};
}

// SOP authoring helpers. Stored in existing KontenWeb rows; student records stay untouched.
const IPCOS_SOP_TYPES = ['sop_magang','sop_tugas_akhir'];
const IPCOS_SOP_MIMES = {pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
function sopType(value) {
  if (!IPCOS_SOP_TYPES.includes(value)) throw new Error('Jenis SOP tidak valid.');
  return value;
}
function sopText(value,max,label,required) {
  if (value===undefined || value===null) value='';
  if (typeof value!=='string' || value.length>max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error(label+' tidak valid atau terlalu panjang.');
  value=value.trim();
  if (required && !value) throw new Error(label+' wajib diisi.');
  return value;
}
function sopIdentifier(value,label) {
  if (typeof value!=='string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw new Error(label+' tidak valid.');
  return value;
}
function sopFileName(value) {
  const name=sopText(value,255,'Nama berkas',true);
  if (/[\\/\r\n\t]/.test(name) || !IPCOS_SOP_MIMES[name.split('.').pop().toLowerCase()]) throw new Error('Format lampiran SOP harus PDF, DOC, DOCX, JPG, atau PNG.');
  return name;
}
function sopLink(value) {
  const url=sopText(value,2048,'Tautan',true);
  if (!/^https?:\/\/(?:[a-z\d](?:[a-z\d.-]*[a-z\d])?|\[[a-f\d:]+\])(?::\d{1,5})?(?:[/?#][^\s<>"\\]*)?$/i.test(url)) throw new Error('Tautan SOP harus menggunakan alamat http atau https yang valid.');
  return url;
}
function sopEmpty(type) {
  return {schema:1,type:sopType(type),revision:0,updatedAt:'',title:type==='sop_magang'?'SOP Magang':'SOP Tugas Akhir',titleEn:type==='sop_magang'?'Internship SOP':'Final Project SOP',intro:'',introEn:'',sections:[],lastRequestId:''};
}
function sopSheet() {
  const sheet=SpreadsheetApp.openById(SHEET_ID).getSheetByName('KontenWeb');
  if (!sheet) throw new Error('Penyimpanan SOP belum tersedia. Hubungi admin.');
  return sheet;
}
function sopStorage(type) {
  sopType(type);
  const sheet=sopSheet(), rows=sheet.getDataRange().getValues();
  const headers=rows[0] || [], typeColumn=headers.indexOf('Tipe'), dataColumn=headers.indexOf('DataJSON');
  if (typeColumn<0 || dataColumn<0) throw new Error('Struktur penyimpanan SOP belum sesuai.');
  const matches=[];
  for (let index=1;index<rows.length;index++) if (String(rows[index][typeColumn])===type) matches.push(index);
  if (matches.length>1) throw new Error('Data SOP ganda. Hubungi admin sebelum menyimpan.');
  const row=matches.length?matches[0]:-1;
  return {sheet:sheet,rows:rows,typeColumn:typeColumn,dataColumn:dataColumn,row:row};
}
function sopValidate(document,type,allowNew) {
  sopType(type);
  if (!document || typeof document!=='object' || Array.isArray(document) || document.schema!==1 || document.type!==type || !Number.isInteger(document.revision) || document.revision<0 || document.revision>1000000000) throw new Error('Struktur atau versi SOP tidak valid.');
  if (JSON.stringify(document).length>45000) throw new Error('Konten SOP terlalu panjang. Maksimal 45.000 karakter.');
  const result={schema:1,type:type,revision:document.revision,updatedAt:sopText(document.updatedAt,40,'Waktu SOP',false),
    title:sopText(document.title,200,'Judul SOP',true),titleEn:sopText(document.titleEn,200,'Judul English',false),
    intro:sopText(document.intro,2000,'Pengantar SOP',false),introEn:sopText(document.introEn,2000,'Pengantar English',false),sections:[],lastRequestId:sopText(document.lastRequestId,80,'ID penyimpanan',false)};
  if (result.updatedAt && isNaN(Date.parse(result.updatedAt))) throw new Error('Waktu SOP tidak valid.');
  if (!Array.isArray(document.sections) || document.sections.length>20) throw new Error('SOP maksimal memiliki 20 bagian.');
  const sectionIds=new Set(), fileIds=new Set(), linkIds=new Set();
  document.sections.forEach(section=>{
    if (!section || typeof section!=='object' || Array.isArray(section)) throw new Error('Bagian SOP tidak valid.');
    const id=sopIdentifier(section.id,'ID bagian');
    if (id.length>80 || sectionIds.has(id)) throw new Error('ID bagian SOP ganda atau terlalu panjang.');
    sectionIds.add(id);
    const item={id:id,title:sopText(section.title,200,'Judul bagian',false),titleEn:sopText(section.titleEn,200,'Judul bagian English',false),body:sopText(section.body,6000,'Isi bagian',false),bodyEn:sopText(section.bodyEn,6000,'Isi bagian English',false),links:[],files:[]};
    if (!Array.isArray(section.links) || section.links.length>6 || !Array.isArray(section.files)) throw new Error('Setiap bagian maksimal memiliki enam tautan.');
    section.links.forEach(link=>{
      if (!link || typeof link!=='object' || Array.isArray(link)) throw new Error('Tautan bagian tidak valid.');
      const linkId=sopIdentifier(link.id,'ID tautan');
      if (linkIds.has(linkId)) throw new Error('ID tautan SOP ganda.');
      linkIds.add(linkId);
      item.links.push({id:linkId,label:sopText(link.label,200,'Nama tautan',true),labelEn:sopText(link.labelEn,200,'Nama tautan English',false),url:sopLink(link.url)});
    });
    section.files.forEach(file=>{
      if (!file || typeof file!=='object' || Array.isArray(file)) throw new Error('Lampiran SOP tidak valid.');
      const fileId=sopIdentifier(file.id,'ID lampiran'), fileName=sopFileName(file.fileName), mimeType=IPCOS_SOP_MIMES[fileName.split('.').pop().toLowerCase()];
      const newFile=/^new-[A-Za-z0-9_-]{8,80}$/.test(fileId);
      if (fileIds.has(fileId) || (!allowNew && newFile) || (!newFile && !/^[A-Za-z0-9_-]{10,120}$/.test(fileId)) || !Number.isInteger(file.size) || file.size<1 || file.size>5*1024*1024 || file.mimeType!==mimeType) throw new Error('Metadata lampiran SOP tidak valid atau ukuran lebih dari 5 MB.');
      fileIds.add(fileId);
      item.files.push({id:fileId,fileName:fileName,mimeType:mimeType,size:file.size});
    });
    result.sections.push(item);
  });
  if (fileIds.size>6) throw new Error('SOP maksimal memiliki enam lampiran.');
  if (JSON.stringify(result).length>45000) throw new Error('Konten SOP terlalu panjang. Maksimal 45.000 karakter.');
  return result;
}
function sopParse(raw,type) {
  let data;
  try { data=JSON.parse(String(raw)); } catch (_) { throw new Error('Konten SOP belum dapat dibaca. Data lama tetap dipertahankan.'); }
  return sopValidate(data,type,false);
}
function sopRead(type) {
  const storage=sopStorage(type);
  return storage.row<0?sopEmpty(type):sopParse(storage.rows[storage.row][storage.dataColumn],type);
}
function sopPrivateFolder() {
  const properties=PropertiesService.getScriptProperties(), saved=properties.getProperty('IPCOS_SOP_FOLDER');
  if (saved) return featurePrivateFile(DriveApp.getFolderById(saved));
  const folder=DriveApp.createFolder('IPCOS - SOP Privat');
  try { featurePrivateFile(folder);properties.setProperty('IPCOS_SOP_FOLDER',folder.getId());return folder; }
  catch(error) { try { folder.setTrashed(true); } catch (_) {} throw error; }
}
function sopPreparedUploads(uploads,next,previous) {
  if (!Array.isArray(uploads) || uploads.length>6) throw new Error('Daftar unggahan SOP tidak valid.');
  const known=new Map(previous.sections.flatMap(section=>section.files).map(file=>[file.id,file])), required=new Map(), prepared=[], seen=new Set();
  next.sections.forEach(section=>section.files.forEach((file,index)=>{
    if (file.id.startsWith('new-')) required.set(file.id,{section:section,file:file});
    else {
      if (!known.has(file.id)) throw new Error('Lampiran tidak termasuk SOP yang sedang diedit.');
      section.files[index]=Object.assign({},known.get(file.id));
    }
  }));
  let total=0;
  uploads.forEach(upload=>{
    if (!upload || typeof upload!=='object' || Array.isArray(upload) || seen.has(upload.id) || !required.has(upload.id)) throw new Error('Unggahan SOP ganda atau tidak termasuk bagian yang dipublikasikan.');
    const expected=required.get(upload.id), name=sopFileName(upload.fileName), mime=IPCOS_SOP_MIMES[name.split('.').pop().toLowerCase()];
    if (upload.blockId!==expected.section.id || name!==expected.file.fileName || upload.mimeType!==mime || typeof upload.base64!=='string' || upload.base64.length>6990508 || !/^[A-Za-z0-9+/]+={0,2}$/.test(upload.base64) || upload.base64.length%4!==0) throw new Error('Format unggahan SOP tidak valid.');
    const bytes=Utilities.base64Decode(upload.base64);
    total+=bytes.length;
    if (!bytes.length || bytes.length>5*1024*1024 || bytes.length!==expected.file.size || total>12*1024*1024) throw new Error('Lampiran maksimal 5 MB per berkas dan total unggahan 12 MB.');
    const problem=documentStructureIssue(bytes,name);
    if (problem) throw new Error(problem);
    prepared.push({id:upload.id,blockId:upload.blockId,fileName:name,mimeType:mime,bytes:bytes,size:bytes.length});
    seen.add(upload.id);
  });
  if (required.size!==seen.size) throw new Error('Pilih ulang seluruh lampiran baru sebelum menyimpan SOP.');
  return prepared;
}
function sopWrite(storage,document) {
  const json=JSON.stringify(document);
  if (json.length>45000) throw new Error('Konten SOP terlalu panjang. Maksimal 45.000 karakter.');
  if (storage.row>=0) storage.sheet.getRange(storage.row+1,storage.dataColumn+1).setValue(json);
  else { const row=new Array(storage.rows[0].length).fill('');row[storage.typeColumn]=document.type;row[storage.dataColumn]=json;storage.sheet.appendRow(row); }
  if (typeof SpreadsheetApp.flush==='function') SpreadsheetApp.flush();
}
function sopSave(data,session) {
  if (session.role!=='admin') throw new Error('Hanya admin dapat mengubah SOP.');
  const type=sopType(data.type), requestId=sopText(data.requestId,80,'ID penyimpanan',true), revision=data.revision===undefined?data.document && data.document.revision:data.revision;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId) || !Number.isInteger(revision) || revision<0) throw new Error('ID atau versi penyimpanan SOP tidak valid.');
  const lock=LockService.getScriptLock(), created=[];
  if (!lock.tryLock(10000)) throw new Error('SOP sedang disimpan admin lain. Coba kembali.');
  try {
    const storage=sopStorage(type), previous=storage.row<0?sopEmpty(type):sopParse(storage.rows[storage.row][storage.dataColumn],type);
    if (previous.lastRequestId===requestId) return {status:'success',document:previous};
    if (revision!==previous.revision) throw new Error('SOP telah diperbarui admin lain. Muat versi terbaru sebelum menyimpan.');
    const next=sopValidate(data.document,type,true);
    if (!next.intro && !next.sections.length) throw new Error('Tambahkan pengantar atau bagian SOP sebelum menerbitkan.');
    if (next.sections.some(section=>!section.title || (!section.body && !section.files.length && !section.links.length))) throw new Error('Setiap bagian SOP wajib memiliki judul dan teks, tautan, atau lampiran.');
    const prepared=sopPreparedUploads(data.uploads || [],next,previous);
    if (next.revision!==revision) throw new Error('Versi draf SOP tidak sesuai.');
    const resolved=new Map();
    if (prepared.length) {
      const folder=sopPrivateFolder();
      prepared.forEach(upload=>{
        const file=folder.createFile(Utilities.newBlob(upload.bytes,upload.mimeType,upload.fileName));
        created.push(file);featurePrivateFile(file);
        resolved.set(upload.id,{id:file.getId(),fileName:upload.fileName,mimeType:upload.mimeType,size:upload.size});
      });
    }
    next.sections.forEach(section=>{section.files=section.files.map(file=>resolved.get(file.id) || file);});
    next.revision=previous.revision+1;next.updatedAt=new Date().toISOString();next.lastRequestId=requestId;
    const published=sopValidate(next,type,false);
    try { sopWrite(storage,published); }
    catch(error) {
      // If the sheet commit succeeded before an acknowledgement failed, preserve its files.
      let committed=null;try { committed=sopRead(type); } catch (_) {}
      if (committed && committed.lastRequestId===requestId && committed.revision===published.revision) return {status:'success',document:committed};
      throw error;
    }
    return {status:'success',document:published};
  } catch(error) { created.forEach(file=>{try {file.setTrashed(true);} catch (_) {}});throw error; }
  finally { lock.releaseLock(); }
}
function sopFile(data) {
  const document=sopRead(sopType(data.type)), id=sopIdentifier(data.fileId,'ID lampiran');
  const metadata=document.sections.flatMap(section=>section.files).find(file=>file.id===id);
  if (!metadata) throw new Error('Lampiran tidak termasuk SOP yang dipublikasikan.');
  const file=DriveApp.getFileById(id);
  if (file.getSize()>5*1024*1024) throw new Error('Lampiran SOP terlalu besar. Hubungi admin.');
  const bytes=file.getBlob().getBytes();
  if (!bytes.length || bytes.length>5*1024*1024 || bytes.length!==metadata.size || file.getMimeType()!==metadata.mimeType) throw new Error('Lampiran SOP berubah atau tidak valid. Hubungi admin.');
  const problem=documentStructureIssue(bytes,metadata.fileName);
  if (problem) throw new Error(problem);
  return {status:'success',fileName:metadata.fileName,mimeType:metadata.mimeType,base64:Utilities.base64Encode(bytes)};
}
function sopDispatch(data,verifiedSession) {
  const session=verifiedSession || getSession(data.token);
  if (!session || !['admin','mhs'].includes(session.role)) throw new Error('Sesi tidak valid atau berakhir.');
  if (data.action==='get_sop') return {status:'success',document:sopRead(sopType(data.type))};
  if (data.action==='save_sop') return sopSave(data,session);
  if (data.action==='get_sop_file') return sopFile(data);
  throw new Error('Aksi SOP tidak valid.');
}
function sopBackupFiles() {
  const sheet=SpreadsheetApp.openById(SHEET_ID).getSheetByName('KontenWeb');
  if (!sheet) return [];
  const rows=getSheetData(sheet), seen=new Set(), ids=[];
  rows.forEach(row=>{
    if (!IPCOS_SOP_TYPES.includes(row.Tipe)) return;
    if (seen.has(row.Tipe)) throw new Error('Data SOP ganda. Cadangan belum lengkap.');
    seen.add(row.Tipe);
    sopParse(row.DataJSON,row.Tipe).sections.forEach(section=>section.files.forEach(file=>ids.push(file.id)));
  });
  return Array.from(new Set(ids));
}

// Owner-only, read-only check. It never prints content, file IDs, sessions or secrets.
function verifySopDeployment() {
  const result={headersValid:false,internshipReadable:false,finalProjectReadable:false,studentWriteDenied:false,anonymousDenied:false};
  try { const storage=sopStorage('sop_magang');result.headersValid=storage.typeColumn>=0 && storage.dataColumn>=0; } catch (_) {}
  try { result.internshipReadable=sopRead('sop_magang').type==='sop_magang'; } catch (_) {}
  try { result.finalProjectReadable=sopRead('sop_tugas_akhir').type==='sop_tugas_akhir'; } catch (_) {}
  try { sopSave({type:'sop_magang'}, {role:'mhs'}); } catch (_) { result.studentWriteDenied=true; }
  try { sopDispatch({action:'get_sop',type:'sop_magang',token:''}); } catch (_) { result.anonymousDenied=true; }
  console.log(JSON.stringify(result));
  return result;
}

// Academic journey helpers
// Shared, dependency-free structural checks. No document content leaves the browser.
function documentStructureIssue(source, name) {
    const bytes = source instanceof Uint8Array ? source : Uint8Array.from(source, value => (value + 256) % 256);
    const ext = String(name).split('.').pop().toLowerCase();
    const starts = signature => signature.every((value, i) => bytes[i] === value);
    const text = (start, end) => Array.from(bytes.slice(start, end), value => String.fromCharCode(value)).join('');
    const mismatch = 'Isi berkas tidak sesuai format .' + ext + '. Pilih dokumen asli; mengganti nama ekstensi tidak mengubah format.';
    if (ext === 'pdf') {
        if (!/%PDF-[12]\.\d/.test(text(0, Math.min(1024, bytes.length)))) return mismatch;
        if (!/%%EOF/.test(text(Math.max(0, bytes.length - 2048), bytes.length))) return 'PDF tampaknya belum lengkap. Simpan atau ekspor ulang dokumen lalu pilih kembali.';
    } else if (ext === 'doc') {
        if (bytes.length < 512 || !starts([208,207,17,224,161,177,26,225])) return mismatch;
    } else if (ext === 'zip' || ext === 'docx') {
        const names = documentZipEntries(bytes);
        if (!names) return 'Struktur ' + ext.toUpperCase() + ' tidak terbaca atau belum lengkap. Buat ulang berkas sebelum mengirim.';
        if (ext === 'docx' && (!names.includes('[Content_Types].xml') || !names.includes('word/document.xml'))) return mismatch;
    } else if (ext === 'rar') {
        if (bytes.length < 16 || !starts([82,97,114,33,26,7]) || ![0,1].includes(bytes[6])) return mismatch;
    } else if (ext === 'png') {
        if (!starts([137,80,78,71,13,10,26,10]) || text(12,16) !== 'IHDR' || text(bytes.length-8,bytes.length-4) !== 'IEND') return mismatch;
    } else if (ext === 'jpg' || ext === 'jpeg') {
        if (!starts([255,216,255]) || bytes[bytes.length-2] !== 255 || bytes[bytes.length-1] !== 217) return mismatch;
    } else return 'Format dokumen belum didukung.';
    return '';
}

function documentZipEntries(bytes) {
    const u16 = i => bytes[i] + bytes[i+1] * 256;
    const u32 = i => (bytes[i] + bytes[i+1]*256 + bytes[i+2]*65536 + bytes[i+3]*16777216) >>> 0;
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (u32(i) === 0x06054b50 && i + 22 + u16(i+20) === bytes.length) { end = i; break; }
    }
    if (end < 0 || u16(end+4) || u16(end+6)) return null;
    const count = u16(end+10), size = u32(end+12), offset = u32(end+16);
    if (!count || count > 2000 || count !== u16(end+8) || offset + size !== end) return null;
    let cursor = offset;
    const names = [];
    for (let i = 0; i < count; i++) {
        if (cursor + 46 > end || u32(cursor) !== 0x02014b50) return null;
        const length = u16(cursor+28), extra = u16(cursor+30), comment = u16(cursor+32), local = u32(cursor+42);
        if (!length || cursor + 46 + length + extra + comment > end || local + 30 > offset || u32(local) !== 0x04034b50) return null;
        if (local + 30 + u16(local+26) + u16(local+28) + u32(cursor+20) > offset) return null;
        names.push(Array.from(bytes.slice(cursor+46,cursor+46+length), value => String.fromCharCode(value)).join(''));
        cursor += 46 + length + extra + comment;
    }
    return cursor === end ? names : null;
}
if (typeof module !== 'undefined') module.exports = { documentStructureIssue, documentZipEntries };

// Per-student preparation is separate from the existing academic sheets.
function journeyPropertyKey(nim) {
  const hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(nim).trim()).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  return 'IPCOS_PROGRESS_'+hash;
}
function journeyRead(nim) {
  const raw=PropertiesService.getScriptProperties().getProperty(journeyPropertyKey(nim));
  if (!raw) return {exists:false,checks:{},revision:0,updatedAt:''};
  const saved=JSON.parse(raw);
  if (!saved || !saved.checks || !Number.isInteger(saved.revision)) throw new Error('Catatan persiapan belum dapat dibaca.');
  return {exists:true,checks:saved.checks,revision:saved.revision,updatedAt:saved.updatedAt || ''};
}
function journeySnapshot(session) {
  if (session.role!=='mhs') return {journeySupported:true};
  try { return {journeySupported:true,journey:journeyRead(session.nim)}; }
  catch (_) { return {journeySupported:true,journeyUnavailable:true}; }
}
function journeyAllowedIds(nim) {
  const data=getDataForSession({role:'mhs',nim:String(nim)});
  const defaults={magang:['m1','m2','m3','m4','m5','m6'],skripsi:['s1','s2','s3','s4','s5','s6','s7','s8','s9']};
  return ['magang','skripsi'].flatMap(type=>{
    const content=(data.contents || []).find(item=>item.Tipe===type);
    if (!content) return defaults[type];
    const groups=JSON.parse(content.DataJSON);
    if (!Array.isArray(groups) || groups.some(group=>!Array.isArray(group.items))) throw new Error('Ketentuan persiapan belum dapat dibaca.');
    return groups.flatMap(group=>group.items.map(item=>String(item.id || '').replace(/[^a-zA-Z0-9_-]/g,'')));
  }).filter(id=>id && id.length<=64);
}
function journeyDispatch(data) {
  const session=getSession(data.token);
  if (!session || !['mhs','admin'].includes(session.role)) throw new Error('Sesi tidak valid atau berakhir.');
  const nim=session.role==='mhs'?String(session.nim).trim():String(data.nim || '').trim();
  if (!nim || (session.role==='mhs' && data.nim && String(data.nim).trim()!==nim)) throw new Error('Akses catatan mahasiswa lain ditolak.');
  if (session.role==='admin' && !auditStudent(nim) && !featureRegistrations().some(row=>String(row.nim).trim()===nim)) throw new Error('Mahasiswa tidak ditemukan.');
  if (data.action==='get_journey') return {status:'success',journey:journeyRead(nim)};
  if (data.action!=='save_progress' || session.role!=='mhs') throw new Error('Hanya mahasiswa pemilik dapat mengubah persiapan.');
  if (!auditStudent(nim)) throw new Error('Akses mahasiswa sudah tidak aktif.');
  const changes=data.changes;
  if (!changes || typeof changes!=='object' || Array.isArray(changes) || !Object.keys(changes).length || Object.keys(changes).length>100) throw new Error('Perubahan persiapan tidak valid.');
  const allowed=new Set(journeyAllowedIds(nim));
  if (Object.entries(changes).some(([id,value])=>!allowed.has(id) || typeof value!=='boolean')) throw new Error('Poin persiapan tidak sesuai ketentuan.');
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Progres sedang disimpan. Coba kembali.');
  try {
    const previous=journeyRead(nim), checks={};
    for (const id of allowed) if (typeof previous.checks[id]==='boolean') checks[id]=previous.checks[id];
    Object.assign(checks,changes);
    const next={checks:checks,revision:previous.revision+1,updatedAt:new Date().toISOString()};
    const json=JSON.stringify(next);
    if (Utilities.newBlob(json).getBytes().length>8000) throw new Error('Catatan persiapan terlalu besar. Hubungi admin.');
    PropertiesService.getScriptProperties().setProperty(journeyPropertyKey(nim),json);
    return {status:'success',journey:Object.assign({exists:true},next)};
  } finally { lock.releaseLock(); }
}
function journeyBackup() {
  const all=PropertiesService.getScriptProperties().getProperties(), result={};
  for (const key of Object.keys(all)) if (key.startsWith('IPCOS_PROGRESS_')) result[key]=JSON.parse(all[key]);
  return result;
}
function featureCheckDocumentBytes(file) {
  const problem=documentStructureIssue(file.bytes,file.fileName);
  if (problem) throw new Error(problem);
}
function featureCheckSubmissionFiles(files,type) {
  const extensions={Outline:[['pdf'],['pdf','doc','docx']],Proposal:[['pdf']],Pendadaran:[['pdf','zip','rar']],'Skripsi Jurnal':[['pdf'],['pdf','doc','docx']],'Pergantian Pembimbing':[['pdf']]};
  const allowed=extensions[type];
  if (!allowed || files.length!==allowed.length || files.some((file,i)=>!allowed[i].includes(file.fileName.split('.').pop().toLowerCase()))) throw new Error('Format berkas tidak sesuai persyaratan jenis pengajuan.');
}
// Owner-only release check: temporary preference data, never academic records.
function verifyJourneyDeployment() {
  const key=journeyPropertyKey('__IPCOS_JOURNEY_RELEASE_TEST__'), p=PropertiesService.getScriptProperties(), before=p.getProperty(key);
  let saved=false;
  try {
    p.setProperty(key,JSON.stringify({checks:{m1:true},revision:1,updatedAt:new Date().toISOString()}));
    saved=journeyRead('__IPCOS_JOURNEY_RELEASE_TEST__').checks.m1===true;
  } finally { if (before===null) p.deleteProperty(key); else p.setProperty(key,before); }
  let denied=false, invalidRejected=false;
  try { journeyDispatch({action:'get_journey',token:''}); } catch (_) { denied=true; }
  try { featureCheckSubmissionFiles([{fileName:'renamed.docx'}],'Proposal'); } catch (_) { invalidRejected=true; }
  const data=getDataForSession({role:'admin'});
  const checks={cloudRoundTrip:saved,unauthenticatedDenied:denied,wrongServiceFormatDenied:invalidRejected,renamedPdfDenied:!!documentStructureIssue([65,66,67],'fake.pdf'),transactionDataReadable:data.status==='success',journeyApiEnabled:data.journeySupported===true};
  console.log(JSON.stringify(checks));
  if (Object.values(checks).some(value=>value!==true)) throw new Error('Pemeriksaan rilis belum lulus.');
}
