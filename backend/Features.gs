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
    const ids=[...new Set(records.flatMap(r=>featureLinkUrls(r.link)).map(url=>(url.match(/\/d\/([\w-]+)/)||url.match(/[?&]id=([\w-]+)/)||[])[1]).filter(Boolean))];
    const manifest={created:new Date().toISOString(),database:copy.getId(),config:featureConfig(),files:ids.map(id=>({originalId:id})),errors:[]};
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
  if (data.action==='get_receipt') return featureReceipt(session,data.id);
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
  console.log(JSON.stringify({api:data.status,services:data.services.length,pdf:header==='%PDF-',pdfBytes:pdf.getBytes().length,backup:backup}));
}
