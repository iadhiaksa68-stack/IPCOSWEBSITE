// Small-service transaction tools, with authorization enforced again by the API.
let serviceSettings = [];
let serviceSettingsEditing = false;
const SERVICE_TYPES = ['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'];
function serviceSetting(type) {
    return serviceSettings.find(s => s.type === type) || {type, enabled:true, open:'', close:'', adminDays:3, studentDays:7};
}
function serviceAvailability(type) {
    const setting = serviceSetting(type);
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if (!setting.enabled) return 'Layanan sedang ditutup oleh admin.';
    if (setting.open && today < setting.open) return `Pendaftaran dibuka ${setting.open}.`;
    if (setting.close && today > setting.close) return `Periode pendaftaran berakhir ${setting.close}.`;
    return '';
}
function activeSameType(type) {
    return readStoredJSON(sessionStorage,'ipcos_registrations',[]).find(r => String(r.nim) === String(currentUser.nim) && r.jenis === type && ['pending','revision','resubmitted'].includes(String(r.status).toLowerCase()));
}
function refreshServiceAvailability() {
    const banner = document.getElementById('service-availability');
    if (!banner) return;
    const type = document.getElementById('reg-jenis-utama').value;
    const existing = currentUser.role === 'mhs' && type && activeSameType(type);
    const reason = type ? serviceAvailability(type) : '';
    banner.hidden = !type;
    banner.innerHTML = existing ? `<strong>Pengajuan ${escapeHtml(type)} Anda masih berjalan.</strong><p>Lanjutkan pengajuan tersebut agar dokumen dan riwayat tetap dalam satu tempat.</p><button type="button" class="btn-primary" data-case-id="${escapeHtml(existing.id)}">Lanjutkan Pengajuan</button>`
        : reason ? `<strong>${escapeHtml(reason)}</strong><p>Revisi pengajuan yang sudah masuk tetap dapat dilanjutkan.</p>`
        : `<strong>Pendaftaran dibuka</strong>${serviceSetting(type).close ? `<p>Batas pengiriman: ${escapeHtml(serviceSetting(type).close)} pukul 23.59 WIB.</p>` : ''}`;
    const review = document.getElementById('btn-review-registration');
    if (review && !isSubmittingRegistration) review.disabled = !!(existing || reason);
    renderAcademicStages();
    renderRegistrationReadiness();
}
function registrationServiceAllowed() {
    const type = document.getElementById('reg-jenis-utama').value;
    const existing = activeSameType(type);
    if (existing) { refreshServiceAvailability(); openCaseDetail(existing.id); return false; }
    const reason = serviceAvailability(type);
    if (reason) { refreshServiceAvailability(); showToast(reason,'error'); return false; }
    return true;
}
function caseWaiting(item) {
    const status=String(item.status).toLowerCase();
    if (!['pending','revision','resubmitted'].includes(status)) return null;
    let logs=[]; try { logs=JSON.parse(item.note || '[]'); } catch (_) {}
    const last=Array.isArray(logs) ? logs.slice().reverse().find(log => log.status === item.status || (status==='revision' ? log.role==='admin' : log.role==='mhs')) : null;
    const start=new Date(last?.time || item.date).getTime();
    const days=Number.isFinite(start) ? Math.max(0,Math.floor((Date.now()-start)/86400000)) : 0;
    const target=Number(serviceSetting(item.jenis)[status==='revision'?'studentDays':'adminDays']);
    return {days,target,overdue:days>=target,role:status==='revision'?'mahasiswa':'admin'};
}
function waitingHtml(item) {
    const wait=caseWaiting(item);
    return wait ? `<p class="waiting-badge ${wait.overdue?'waiting-overdue':''}">Menunggu ${wait.role}: ${wait.days} hari · target internal ${wait.target} hari${wait.overdue?' · Perlu perhatian':''}</p>` : '';
}
function caseDocumentOptions(item) { return registrationSpecs(item.jenis).map(([,label])=>label); }
function renderRevisionAssociations() {
    const item=currentCase(), input=document.getElementById('case-reply-files');
    if (!item || !input) return;
    let box=document.getElementById('revision-associations');
    if (!box) { box=document.createElement('div'); box.id='revision-associations'; input.insertAdjacentElement('afterend',box); }
    const options=caseDocumentOptions(item);
    const requested=getRevisionInstructions(item).files.filter(label=>options.includes(label));
    box.innerHTML=[...input.files].map((file,index)=>`<label class="revision-association">${escapeHtml(file.name)}<select id="revision-label-${index}" required aria-label="Jenis dokumen untuk ${escapeHtml(file.name)}"><option value="">Pilih dokumen yang diperbaiki</option>${options.map(label=>`<option value="${escapeHtml(label)}" ${((requested.length===1 && input.files.length===1 && requested[0]===label) || (options.length===1 && options[0]===label))?'selected':''}>${escapeHtml(label)}</option>`).join('')}</select></label>`).join('');
}
function revisionFileLabels(files,item) {
    const labels=files.map((file,index)=>document.getElementById('revision-label-'+index)?.value || '');
    const allowed=caseDocumentOptions(item);
    if (labels.some(label=>!allowed.includes(label)) || new Set(labels).size!==labels.length) throw new Error('Pilih jenis dokumen yang berbeda untuk setiap berkas perbaikan.');
    const requested=getRevisionInstructions(item).files.filter(label=>allowed.includes(label));
    if (requested.some(label=>!labels.includes(label))) throw new Error('Unggah setiap dokumen yang diminta admin.');
    return labels;
}
function renderServiceSettings() {
    const container=document.getElementById('service-settings');
    if (!container || currentUser.role!=='admin' || serviceSettingsEditing) return;
    container.innerHTML=SERVICE_TYPES.map((type,index)=>{ const s=serviceSetting(type); return `<fieldset class="service-setting"><legend>${escapeHtml(type)}</legend><label class="service-enabled"><input type="checkbox" id="service-enabled-${index}" ${s.enabled?'checked':''}> Aktif</label><div class="service-setting-fields"><label>Dibuka (WIB)<input type="date" id="service-open-${index}" value="${escapeHtml(s.open)}"></label><label>Ditutup (WIB)<input type="date" id="service-close-${index}" value="${escapeHtml(s.close)}"></label><label>Target admin (hari)<input type="number" min="1" max="365" id="service-admin-${index}" value="${Number(s.adminDays)}"></label><label>Target revisi (hari)<input type="number" min="1" max="365" id="service-student-${index}" value="${Number(s.studentDays)}"></label></div></fieldset>`; }).join('');
    container.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{serviceSettingsEditing=true;}));
}
async function saveServiceSettings(event) {
    event.preventDefault();
    if (currentUser.role!=='admin') return;
    const services=SERVICE_TYPES.map((type,index)=>({type,enabled:document.getElementById('service-enabled-'+index).checked,open:document.getElementById('service-open-'+index).value,close:document.getElementById('service-close-'+index).value,adminDays:Number(document.getElementById('service-admin-'+index).value),studentDays:Number(document.getElementById('service-student-'+index).value)}));
    if (services.some(s=>s.open && s.close && s.open>s.close)) { showToast('Tanggal tutup harus sesudah atau sama dengan tanggal buka.','error'); return; }
    const button=document.getElementById('save-service-settings'); button.disabled=true;
    const epoch=sessionEpoch;
    try { const response=await apiPost(GAS_URL,{method:'POST',body:JSON.stringify({action:'save_services',services}),headers:{'Content-Type':'text/plain;charset=utf-8'}}); const result=await readApiResult(response); if (epoch!==sessionEpoch) return; if(result.status!=='success') throw new Error(result.message); serviceSettings=result.services; serviceSettingsEditing=false; renderServiceSettings(); filterAdminData(); showToast('Periode dan target layanan tersimpan.','success'); }
    catch(error) { if(epoch===sessionEpoch) showToast(error.message || 'Pengaturan belum tersimpan.','error'); }
    finally { if(epoch===sessionEpoch && button.isConnected) button.disabled=false; }
}
function renderBackupStatus(backup) {
    const el=document.getElementById('backup-status'); if(!el || currentUser.role!=='admin') return;
    const labels={success:'Cadangan lengkap',partial:'Cadangan sebagian — ada berkas yang belum tersalin',failed:'Cadangan gagal — periksa log backend',running:'Cadangan sedang diproses'};
    el.textContent=`${backup.scheduled?'Jadwal harian aktif (sekitar 04.00 WIB)':'Jadwal belum aktif'}. ${labels[backup.state] || 'Belum ada cadangan'}${backup.time?' · '+new Date(backup.time).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):''}${Number.isInteger(backup.files)?' · '+backup.files+' berkas':''}${backup.running && Number.isInteger(backup.copied)?' · '+backup.copied+' berkas sudah diproses':''}.`;
    const link=document.getElementById('backup-folder');
    link.hidden=!backup.folderId;
    if(backup.folderId) link.href='https://drive.google.com/drive/folders/'+encodeURIComponent(backup.folderId);
    else link.removeAttribute('href');
}
async function refreshBackupStatus() {
    if(currentUser.role!=='admin') return;
    const epoch=sessionEpoch;
    try { const response=await apiPost(GAS_URL,{method:'POST',body:JSON.stringify({action:'backup_status'}),headers:{'Content-Type':'text/plain;charset=utf-8'}}); const result=await readApiResult(response); if(epoch!==sessionEpoch) return; if(result.status!=='success') throw new Error(result.message); renderBackupStatus(result.backup); }
    catch(error) { if(epoch===sessionEpoch) showToast(error.message || 'Status cadangan belum tersedia.','error'); }
}
async function downloadReceipt(id,button) {
    if (!['admin','mhs'].includes(currentUser.role)) return;
    const epoch=sessionEpoch;
    if(button) button.disabled=true;
    try {
        const response=await apiPost(GAS_URL,{method:'POST',body:JSON.stringify({action:'get_receipt',id:String(id)}),headers:{'Content-Type':'text/plain;charset=utf-8'}});
        const result=await readApiResult(response); if(epoch!==sessionEpoch) return;
        if(result.status!=='success') throw new Error(result.message);
        if(typeof result.base64!=='string' || result.base64.length>7000000) throw new Error('Bukti belum dapat diunduh.');
        const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
        if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-') throw new Error('Bukti PDF belum valid. Coba lagi.');
        const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
        const link=document.createElement('a'); link.href=url; link.download=String(result.fileName || 'IPCOS.pdf').replace(/[^a-zA-Z0-9_.-]/g,'_'); document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),10000);
    } catch(error) { if(epoch===sessionEpoch) showToast(error.message || 'Bukti belum dapat diunduh.','error'); }
    finally { if(epoch===sessionEpoch && button?.isConnected) button.disabled=false; }
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-receipt-id]'); if(button) downloadReceipt(button.dataset.receiptId,button);});
document.addEventListener('change',event=>{if(event.target.id==='case-reply-files') renderRevisionAssociations();});

const caseBlobUrls = new Set();
let documentRequestVersion = 0;
let caseDocumentEpoch = 0;
function isPrivateDriveUrl(url) { try { return ['drive.google.com','docs.google.com'].includes(new URL(url).hostname); } catch (_) { return false; } }
function clearCaseBlobUrls() {
    documentRequestVersion++; caseDocumentEpoch++;
    caseBlobUrls.forEach(url=>URL.revokeObjectURL(url)); caseBlobUrls.clear();
    const iframe=document.querySelector('#case-file-preview iframe'); if(iframe) iframe.src='about:blank';
}
async function accessCaseDocument(index,preview=false,button=null) {
    const item=currentCase(), file=item && getCaseFiles(item)[index];
    if(!file || !isPrivateDriveUrl(file.url)) return;
    const epoch=sessionEpoch, id=String(item.id), version=preview?++documentRequestVersion:0, contextVersion=caseDocumentEpoch;
    const panel=document.getElementById('case-file-preview');
    if(preview) { panel.hidden=false; panel.querySelector('p').textContent='Memuat berkas melalui sesi IPCOS...'; panel.querySelector('iframe').src='about:blank'; }
    if(button) button.disabled=true;
    try {
        const response=await apiPost(GAS_URL,{method:'POST',body:JSON.stringify({action:'get_document',id,url:file.url}),headers:{'Content-Type':'text/plain;charset=utf-8'}});
        const result=await readApiResult(response);
        if(epoch!==sessionEpoch || selectedCaseId!==id || contextVersion!==caseDocumentEpoch || (preview && version!==documentRequestVersion) || document.getElementById('modal-case-detail').style.display==='none') return;
        if(result.status!=='success') throw new Error(result.message || 'Berkas belum dapat dibaca.');
        if(typeof result.base64!=='string' || result.base64.length>13981016) throw new Error('Ukuran berkas tidak valid.');
        const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
        const mime=String(result.mimeType || 'application/octet-stream');
        const url=URL.createObjectURL(new Blob([bytes],{type:mime})); caseBlobUrls.add(url);
        const name=String(result.fileName || 'dokumen').replace(/[\\/\x00-\x1f]/g,'_');
        if(preview && ['application/pdf','image/png','image/jpeg'].includes(mime)) {
            panel.querySelector('iframe').src=url; panel.querySelector('iframe').title='Pratinjau: '+name;
            panel.querySelector('p').textContent='Pratinjau berkas privat. Gunakan Unduh Berkas jika pratinjau tidak tersedia.';
        } else {
            const link=document.createElement('a'); link.href=url; link.download=name; document.body.appendChild(link);link.click();link.remove();
            if(preview) panel.querySelector('p').textContent='Format ini diunduh agar dapat dibuka di perangkat Anda.';
        }
    } catch(error) { if(epoch===sessionEpoch && contextVersion===caseDocumentEpoch && (!preview || version===documentRequestVersion)) { showToast(error.message || 'Berkas belum dapat dibaca.','error'); if(preview && panel.isConnected) panel.querySelector('p').textContent='Berkas belum dapat dimuat. Coba lagi atau hubungi admin.'; } }
    finally { if(epoch===sessionEpoch && button?.isConnected) button.disabled=false; }
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-document-index]');if(button)accessCaseDocument(Number(button.dataset.documentIndex),false,button);});
