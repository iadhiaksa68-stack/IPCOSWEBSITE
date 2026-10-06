function handleRegistration(data) {
  const duplicate = featureCheckCreate(data); if (duplicate) return duplicate;
  if (!['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'].includes(data.jenis) || !String(data.detail || '').trim()) throw new Error('Jenis atau isian pengajuan tidak valid.');
  if (String(data.detail).includes('Dosen Pembimbing:')) throw new Error('Dosen pembimbing hanya ditetapkan oleh admin.');
  const required = ['Outline','Skripsi Jurnal'].includes(data.jenis) ? 2 : 1;
  const files = auditFiles(data.files, required, required, data.jenis === 'Pendadaran');
  files.forEach((file,index) => { file.label = featureLabels(data.jenis)[index]; });
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateSheet(ss, SHEET_REGISTRASI, ['id','date','nim','nama','jenis','detail','link','status','note']);
  const created = [];
  try {
    const links = auditUpload(files, data.nim, data.nama, '[' + String(data.jenis).toUpperCase() + '] ', created);
    sheet.appendRow([data.id,data.date,data.nim,data.nama,data.jenis,data.detail,links.join('<br>'),'Pending',JSON.stringify([{sender:data.nama,role:'mhs',time:data.date,message:'Pendaftaran ' + data.jenis + ' berhasil dikirim.',status:'Pending',documents:featureDocumentMetadata(files,links.join('<br>'),[],data.jenis)}])]);
    return {status:'success',id:data.id,date:data.date};
  } catch (error) { auditDiscard(created); throw error; }
}
