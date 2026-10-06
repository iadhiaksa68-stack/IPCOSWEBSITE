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
