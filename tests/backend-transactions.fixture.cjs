function handleUpdate(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateSheet(ss, SHEET_REGISTRASI, ['id','date','nim','nama','jenis','detail','link','status','note']);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) throw new Error('Data kosong.');
  const headers = rows[0].map(h => String(h).toLowerCase().trim());
  const idx = name => headers.indexOf(name);
  const idIdx=idx('id'), statIdx=idx('status'), noteIdx=idx('note'), detIdx=idx('detail'), nimIdx=idx('nim'), namaIdx=idx('nama'), jenisIdx=idx('jenis');
  const linkIdx = headers.findIndex(h => h.includes('link'));
  if ([idIdx,statIdx,noteIdx,detIdx,nimIdx,namaIdx,jenisIdx,linkIdx].some(i => i < 0)) throw new Error('Kolom pengajuan tidak lengkap.');
  const rowIndex = rows.findIndex((r,i) => i > 0 && String(r[idIdx]).trim() === String(data.id).trim());
  if (rowIndex < 1) throw new Error('Data tidak ditemukan.');
  const row = rows[rowIndex].slice();
  const current = String(row[statIdx]).trim();
  featureValidateRevision(data,{jenis:String(row[jenisIdx]),note:row[noteIdx]});
  if (data.senderRole === 'mhs') {
    if (current !== 'Revision' || data.status !== 'Resubmitted') throw new Error('Pengajuan ini tidak lagi menunggu perbaikan. Silakan muat ulang.');
  } else if (data.senderRole === 'admin') {
    if (!['Pending','Resubmitted'].includes(current) || !['Accepted','Revision'].includes(data.status)) throw new Error('Status telah berubah. Silakan muat ulang sebelum memproses.');
  } else throw new Error('Akses ditolak.');
  const text = String(data.noteText || '').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').trim().slice(0,5000);
  if (['Revision','Resubmitted'].includes(data.status) && !text) throw new Error('Catatan perbaikan wajib diisi.');
  const files = auditFiles(data.files, 5, data.status === 'Resubmitted' ? 1 : 0, String(row[jenisIdx]) === 'Pendadaran');
  if (data.senderRole === 'admin' && files.length) throw new Error('Unggahan revisi hanya untuk mahasiswa.');
  const quotaChanges = [];
  const needsSupervisor = data.status === 'Accepted' && ['Outline','Pergantian Pembimbing'].includes(String(row[jenisIdx]));
  if (needsSupervisor && !String(data.dospem || '').trim()) throw new Error('Pilih dosen pembimbing.');
  if (data.dospem && data.status === 'Accepted' && !String(row[detIdx]).includes('Dosen Pembimbing:')) {
    const dosenSheet = ss.getSheetByName(SHEET_DOSEN);
    if (!dosenSheet) throw new Error('Data dosen tidak tersedia.');
    const dRows = dosenSheet.getDataRange().getValues();
    const selected = dRows.findIndex((r,i) => i > 0 && String(r[0]).trim() === String(data.dospem).trim());
    if (selected < 1) throw new Error('Dosen tidak ditemukan.');
    const q = auditQuota(dRows[selected][1],dRows[selected][2]);
    let previousName = '';
    if (String(row[jenisIdx]) === 'Pergantian Pembimbing') {
      const prior = rows.slice(1).filter(r => r !== rows[rowIndex] && String(r[nimIdx]) === String(row[nimIdx]) && String(r[statIdx]) === 'Accepted' && ['Outline','Pergantian Pembimbing'].includes(String(r[jenisIdx]))).sort((a,b) => new Date(b[idx('date')]) - new Date(a[idx('date')]));
      for (const previous of prior) {
        const match = String(previous[detIdx]).match(/Dosen Pembimbing:<\/b>\s*([^<]+)/);
        if (match) { previousName = match[1].trim().replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"'); break; }
      }
    }
    if (previousName !== String(data.dospem).trim()) {
      if (q.used >= q.max) throw new Error('Kuota dosen penuh. Pilih dosen lain.');
      quotaChanges.push({sheet:dosenSheet,row:selected+1,before:q.used,after:q.used+1});
      const old = dRows.findIndex((r,i) => i > 0 && String(r[0]).trim() === previousName);
      if (previousName && old > 0) { const oldQ = auditQuota(dRows[old][1],dRows[old][2]); quotaChanges.push({sheet:dosenSheet,row:old+1,before:oldQ.used,after:Math.max(0,oldQ.used-1)}); }
    }
    row[detIdx] = String(row[detIdx] || '') + "<br><br><b style='color:#E03F4F;'>Dosen Pembimbing:</b> " + auditHtml(data.dospem);
  }
  let logs; try { logs = JSON.parse(String(row[noteIdx] || '[]')); } catch (_) { logs = []; }
  if (!Array.isArray(logs)) logs = [];
  logs.push({sender:data.senderName,role:data.senderRole,time:new Date().toISOString(),message:text || 'Status pengajuan diperbarui.',status:data.status});
  row[noteIdx] = JSON.stringify(logs); row[statIdx] = data.status;
  const created = []; const applied = [];
  try {
    const links = auditUpload(files,row[nimIdx],row[namaIdx],'[REVISI] ',created);
    if (links.length) { logs[logs.length-1].documents = featureDocumentMetadata(files,links.join('<br>'),logs.concat([{documents:featureLabels(String(row[jenisIdx])).map(label=>({label:label,version:1}))}]),String(row[jenisIdx])); row[noteIdx] = JSON.stringify(logs); }
    if (links.length) row[linkIdx] = (row[linkIdx] ? row[linkIdx] + '<br>' : '') + links.join('<br>');
    quotaChanges.forEach(change => { change.sheet.getRange(change.row,2).setValue(change.after); applied.push(change); });
    sheet.getRange(rowIndex+1,1,1,row.length).setValues([row]);
    return {status:'success'};
  } catch (error) {
    applied.reverse().forEach(change => { try { change.sheet.getRange(change.row,2).setValue(change.before); } catch (_) {} });
    auditDiscard(created); throw error;
  }
}
function auditHtml(value) { return String(value || '').replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function auditStudent(nim) {
  const students = getSheetData(SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_MAHASISWA));
  return students.find(s => String(s.NIM).trim() === String(nim).trim() && !/^(nonaktif|non aktif|tidak aktif|inactive)$/i.test(String(s.Status || '').trim()));
}
function auditFiles(files, maxCount, requiredCount, archives) {
  if (!Array.isArray(files)) files = [];
  if (files.length < requiredCount || files.length > maxCount) throw new Error('Jumlah berkas tidak sesuai persyaratan.');
  const mime = {pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',zip:'application/zip',rar:'application/vnd.rar'};
  let total = 0;
  return files.map(f => {
    if (!f || typeof f.fileName !== 'string' || f.fileName.length > 255 || typeof f.base64 !== 'string') throw new Error('Berkas tidak valid.');
    const ext = f.fileName.split('.').pop().toLowerCase();
    if (!mime[ext] || (!archives && ['zip','rar'].includes(ext)) || !/^[A-Za-z0-9+/]+={0,2}$/.test(f.base64) || f.base64.length % 4 !== 0 || f.base64.length > 13981016) throw new Error('Format atau ukuran berkas tidak valid.');
    const bytes = Utilities.base64Decode(f.base64);
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Berkas harus berisi data dan maksimal 10 MB.');
    total += bytes.length;
    if (total > 20 * 1024 * 1024) throw new Error('Total berkas maksimal 20 MB.');
    featureCheckDocumentBytes({bytes:bytes,fileName:f.fileName});
    return {fileName:f.fileName, label:f.label || f.fileName, bytes:bytes, mimeType:mime[ext]};
  });
}
function auditUpload(files, nim, nama, prefix, created) {
  if (!files.length) return [];
  const parent = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const folders = parent.getFoldersByName(String(nim) + ' - ' + String(nama));
  const folder = folders.hasNext() ? folders.next() : parent.createFolder(String(nim) + ' - ' + String(nama));
  return files.map(f => {
    const file = folder.createFile(Utilities.newBlob(f.bytes, f.mimeType, prefix + f.fileName));
    created.push(file);
    return '<a href="' + auditHtml(file.getUrl()) + '" target="_blank" rel="noopener noreferrer">📄 ' + auditHtml(prefix === '[REVISI] ' ? prefix + f.fileName : f.label) + '</a>';
  });
}
function auditDiscard(files) { files.forEach(f => { try { f.setTrashed(true); } catch (_) {} }); }
function auditQuota(used, max) {
  if (String(used).trim() === '' || String(max).trim() === '') throw new Error('Kuota wajib diisi.');
  used = Number(used); max = Number(max);
  if (!Number.isInteger(used) || !Number.isInteger(max) || used < 0 || max < 1 || used > max) throw new Error('Kuota harus bilangan bulat: terpakai 0 sampai maksimal, maksimal minimal 1.');
  return {used:used,max:max};
}
function doPost(e) {
  let lock;
  try {
    const data = JSON.parse(e && e.postData && e.postData.contents || '{}');
    if (['create','update','manage_student','manage_dosen','post_announcement','update_content','delete_all_registrations','save_services'].includes(data.action)) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) throw new Error('Server sedang memproses pengajuan lain. Silakan coba kembali.');
    }
    if (['save_services','get_receipt','get_document','backup_status'].includes(data.action)) return ContentService.createTextOutput(JSON.stringify(featureDispatch(data))).setMimeType(ContentService.MimeType.JSON);
    if (['get_journey','save_progress'].includes(data.action)) return ContentService.createTextOutput(JSON.stringify(journeyDispatch(data))).setMimeType(ContentService.MimeType.JSON);
    return dispatchPost(e);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status:'error',message:String(error)})).setMimeType(ContentService.MimeType.JSON);
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
