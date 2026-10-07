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
