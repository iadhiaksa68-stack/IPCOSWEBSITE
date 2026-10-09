// Small-service transaction tools, with authorization enforced again by the API.
let serviceSettings = [];
let serviceSettingsEditing = false;
let latestBackup = null;
const SERVICE_TYPES = ['Outline','Proposal','Pendadaran','Skripsi Jurnal','Pergantian Pembimbing'];
function serviceSetting(type) {
    return serviceSettings.find(s => s.type === type) || {type, enabled:true, open:'', close:'', adminDays:3, studentDays:7};
}
function serviceAvailability(type) {
    const setting = serviceSetting(type);
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if (!setting.enabled) return uxText('Layanan sedang ditutup oleh admin.', 'This service is currently closed by admin.');
    if (setting.open && today < setting.open) return `${uxText('Pendaftaran dibuka','Registration opens')} ${formatDate(setting.open)} (WIB, UTC+7).`;
    if (setting.close && today > setting.close) return `${uxText('Periode pendaftaran berakhir','Registration closed on')} ${formatDate(setting.close)} (WIB, UTC+7).`;
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
    banner.innerHTML = existing ? `<strong>${uxText('Pengajuan Anda masih berjalan:', 'Your request is still active:')} ${escapeHtml(systemText(type))}.</strong><p>${uxText('Lanjutkan pengajuan tersebut agar dokumen dan riwayat tetap dalam satu tempat.', 'Continue the existing request to keep documents and history in one place.')}</p><button type="button" class="btn-primary" data-case-id="${escapeHtml(existing.id)}">${uxText('Lanjutkan Pengajuan','Continue request')}</button>`
        : reason ? `<strong>${escapeHtml(reason)}</strong><p>${uxText('Revisi pengajuan yang sudah masuk tetap dapat dilanjutkan.', 'You can still submit corrections for existing requests.')}</p>`
        : `<strong>${uxText('Pendaftaran dibuka','Registration is open')}</strong>${serviceSetting(type).close ? `<p>${uxText('Batas pengiriman:', 'Submission deadline:')} ${escapeHtml(serviceSetting(type).close)} 23:59 WIB (UTC+7).</p>` : ''}`;
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
    return wait ? `<p class="waiting-badge ${wait.overdue?'waiting-overdue':''}">${uxText('Menunggu','Waiting for')} ${wait.role === 'mahasiswa' ? uxText('mahasiswa','student') : 'admin'}: ${wait.days} ${uxText('hari',wait.days === 1 ? 'day' : 'days')} · ${uxText('target internal','internal target')} ${wait.target} ${uxText('hari','days')}${wait.overdue ? uxText(' · Perlu perhatian',' · Needs attention') : ''}</p>` : '';
}
function caseDocumentOptions(item) { return registrationSpecs(item.jenis).map(([,label])=>label); }
function renderRevisionAssociations() {
    const item=currentCase(), input=document.getElementById('case-reply-files');
    if (!item || !input) return;
    let box=document.getElementById('revision-associations');
    if (!box) { box=document.createElement('div'); box.id='revision-associations'; input.insertAdjacentElement('afterend',box); }
    const options=caseDocumentOptions(item);
    const requested=getRevisionInstructions(item).files.filter(label=>options.includes(label));
    box.innerHTML=[...input.files].map((file,index)=>`<label class="revision-association">${escapeHtml(file.name)}<select id="revision-label-${index}" required aria-label="${uxText('Jenis dokumen untuk','Document type for')} ${escapeHtml(file.name)}"><option value="">${systemText('Pilih dokumen yang diperbaiki')}</option>${options.map(label=>`<option value="${escapeHtml(label)}" ${((requested.length===1 && input.files.length===1 && requested[0]===label) || (options.length===1 && options[0]===label))?'selected':''}>${escapeHtml(systemText(label))}</option>`).join('')}</select></label>`).join('');
    bindLanguageBlock(box);
}

function revisionFileLabels(files,item) {
    const labels=files.map((file,index)=>document.getElementById('revision-label-'+index)?.value || '');
    const allowed=caseDocumentOptions(item);
    if (labels.some(label=>!allowed.includes(label)) || new Set(labels).size!==labels.length) throw new Error(systemText('Pilih jenis dokumen yang berbeda untuk setiap berkas perbaikan.'));
    const requested=getRevisionInstructions(item).files.filter(label=>allowed.includes(label));
    if (requested.some(label=>!labels.includes(label))) throw new Error(systemText('Unggah setiap dokumen yang diminta admin.'));
    return labels;
}
function renderServiceSettings() {
    const container=document.getElementById('service-settings');
    if (!container || currentUser.role!=='admin' || serviceSettingsEditing) return;
    container.innerHTML=SERVICE_TYPES.map((type,index)=>{ const s=serviceSetting(type); return `<fieldset class="service-setting"><legend>${escapeHtml(systemText(type))}</legend><label class="service-enabled"><input type="checkbox" id="service-enabled-${index}" ${s.enabled?'checked':''}> ${systemText('Aktif')}</label><div class="service-setting-fields"><label>${systemText('Dibuka (WIB)')}<input type="date" id="service-open-${index}" value="${escapeHtml(s.open)}"></label><label>${systemText('Ditutup (WIB)')}<input type="date" id="service-close-${index}" value="${escapeHtml(s.close)}"></label><label>${systemText('Target admin (hari)')}<input type="number" min="1" max="365" id="service-admin-${index}" value="${Number(s.adminDays)}"></label><label>${systemText('Target revisi (hari)')}<input type="number" min="1" max="365" id="service-student-${index}" value="${Number(s.studentDays)}"></label></div></fieldset>`; }).join('');
    bindLanguageBlock(container);
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
    latestBackup = backup;
    const labels={success:uxText('Cadangan lengkap','Backup complete'),partial:uxText('Cadangan sebagian — ada berkas yang belum tersalin','Partial backup — some files were not copied'),failed:uxText('Cadangan gagal — periksa log backend','Backup failed — check the backend log'),running:uxText('Cadangan sedang diproses','Backup in progress')};
    el.textContent=`${backup.scheduled ? uxText('Jadwal harian aktif (sekitar 04.00 WIB)','Daily schedule active (around 04:00 WIB, UTC+7)') : uxText('Jadwal belum aktif','Schedule is not active')}. ${labels[backup.state] || uxText('Belum ada cadangan','No backup yet')}${backup.time?' · '+new Date(backup.time).toLocaleString(currentLang === 'id' ? 'id-ID' : 'en-GB',{timeZone:'Asia/Jakarta'}):''}${Number.isInteger(backup.files)?' · '+backup.files+' '+uxText('berkas','files'):''}${backup.running && Number.isInteger(backup.copied)?' · '+backup.copied+' '+uxText('berkas sudah diproses','files processed'):''}.`;
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
    window.IPCOSDocuments?.reset(document.getElementById('case-file-preview'));
    window.IPCOSDocuments?.clearLocal();
    const modal=document.getElementById('modal-case-detail');if(modal){modal.classList.remove('has-document-preview','has-document-comparison');delete modal.dataset.workspaceView;}
}
async function accessCaseDocument(index,preview=false,button=null) {
    const item=currentCase(), file=item && getCaseFiles(item)[index];
    if(!file || !isPrivateDriveUrl(file.url)) return;
    if(preview)clearCaseBlobUrls();
    const epoch=sessionEpoch, id=String(item.id), version=preview?++documentRequestVersion:0, contextVersion=caseDocumentEpoch;
    const panel=document.getElementById('case-file-preview');
    if(preview) { window.IPCOSDocuments.reset(panel);panel.hidden=false; panel.querySelector('p').textContent=uxText('Memuat berkas melalui sesi IPCOS…','Loading the file through your IPCOS session…'); panel.querySelector('iframe').src='about:blank'; }
    if(button) button.disabled=true;
    try {
        const response=await apiPost(GAS_URL,{method:'POST',body:JSON.stringify({action:'get_document',id,url:file.url}),headers:{'Content-Type':'text/plain;charset=utf-8'}});
        const result=await readApiResult(response);
        if(epoch!==sessionEpoch || selectedCaseId!==id || contextVersion!==caseDocumentEpoch || (preview && version!==documentRequestVersion) || document.getElementById('modal-case-detail').style.display==='none') return;
        if(result.status!=='success') throw new Error(result.message || 'Berkas belum dapat dibaca.');
        if(typeof result.base64!=='string' || result.base64.length>13981016) throw new Error('Ukuran berkas tidak valid.');
        const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
        if(!bytes.length)throw new Error(uxText('Berkas kosong.','The file is empty.'));
        const mime=window.IPCOSDocuments.trustedMime(bytes,String(result.mimeType || 'application/octet-stream'),result.fileName);
        const url=URL.createObjectURL(new Blob([bytes],{type:mime})); caseBlobUrls.add(url);
        const name=String(result.fileName || 'dokumen').replace(/[\\/\x00-\x1f]/g,'_');
        if(preview) {
            window.IPCOSDocuments.render(panel,url,mime,name);
            window.IPCOSReviewTools?.previewReady();
        } else {
            const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
        }
    } catch(error) { if(epoch===sessionEpoch && contextVersion===caseDocumentEpoch && (!preview || version===documentRequestVersion)) { showToast(error.message || 'Berkas belum dapat dibaca.','error'); if(preview && panel.isConnected) panel.querySelector('p').textContent=uxText('Berkas belum dapat dimuat. Coba lagi atau hubungi admin.','The file could not be loaded. Try again or contact admin.'); } }
    finally { if(epoch===sessionEpoch && button?.isConnected) button.disabled=false; }
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-document-index]');if(button)accessCaseDocument(Number(button.dataset.documentIndex),false,button);});

// Compare only versions already attached to this accessible request.
function comparableCaseFiles(item,label) {
    let logs=[];try{logs=JSON.parse(item.note||'[]');}catch(_){}
    const metadata=Array.isArray(logs)?logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]):[],seen=new Set();
    return getCaseFiles(item).flatMap((file,index)=>{
        const doc=metadata.find(doc=>doc.url===file.url);
        if(!doc||doc.label!==label||!Number.isInteger(Number(doc.version))||Number(doc.version)<1||!isPrivateDriveUrl(file.url)||seen.has(file.url))return [];
        seen.add(file.url);return [{...file,index,version:Number(doc.version),fileName:String(doc.fileName||file.label)}];
    }).sort((a,b)=>a.version-b.version);
}
async function compareCaseDocuments(label,oldIndex=null,newIndex=null) {
    const item=currentCase();if(!item||!['admin','mhs'].includes(currentUser.role))return;
    const versions=comparableCaseFiles(item,label);if(versions.length<2)return;
    const before=versions.find(file=>file.index===oldIndex)||versions.at(-2),after=versions.find(file=>file.index===newIndex)||versions.at(-1);
    if(before.url===after.url){showToast(uxText('Pilih dua versi berkas yang berbeda.','Choose two different file versions.'),'error');return;}
    clearCaseBlobUrls();const epoch=sessionEpoch,id=String(item.id),context=caseDocumentEpoch,request=++documentRequestVersion;
    const panel=document.getElementById('case-file-preview');panel.hidden=false;panel.querySelector('p').textContent=uxText('Bandingkan isi dua versi. Tampilan ini tidak menilai atau menyetujui perubahan secara otomatis.','Compare the two versions. This view does not evaluate or approve changes automatically.');
    const shell=document.createElement('div');shell.className='document-comparison';
    for(const [side,file] of [['before',before],['after',after]]){
        const column=document.createElement('section');column.className='comparison-column';
        const heading=document.createElement('h4');heading.dataset.documentId=side==='before'?'Versi Pembanding':'Versi yang Ditinjau';heading.dataset.documentEn=side==='before'?'Comparison Version':'Version Being Reviewed';heading.textContent=uxText(heading.dataset.documentId,heading.dataset.documentEn);
        const select=document.createElement('select');select.dataset.compareSide=side;select.dataset.preserveCase='true';select.setAttribute('aria-label',heading.textContent);
        for(const version of versions){const option=document.createElement('option');option.value=String(version.index);option.dataset.documentId='Versi '+version.version+' · '+version.fileName;option.dataset.documentEn='Version '+version.version+' · '+version.fileName;option.textContent=uxText(option.dataset.documentId,option.dataset.documentEn);option.selected=version.index===file.index;select.append(option);}
        const viewer=document.createElement('div');viewer.className='comparison-panel';viewer.innerHTML='<p class="field-helper"></p>';
        viewer.querySelector('p').textContent=uxText('Memuat berkas melalui sesi IPCOS…','Loading the file through your IPCOS session…');column.append(heading,select,viewer);shell.append(column);
        select.addEventListener('change',()=>compareCaseDocuments(label,Number(shell.querySelector('[data-compare-side=before]').value),Number(shell.querySelector('[data-compare-side=after]').value)));
    }
    const close=document.createElement('button');close.type='button';close.className='btn-secondary comparison-tools';close.dataset.documentId='Tutup Perbandingan';close.dataset.documentEn='Close Comparison';close.textContent=uxText(close.dataset.documentId,close.dataset.documentEn);close.addEventListener('click',()=>{clearCaseBlobUrls();panel.hidden=true;document.querySelector('[data-compare-label]')?.focus();});
    panel.prepend(close,shell);document.getElementById('modal-case-detail').classList.add('has-document-comparison');window.IPCOSReviewTools?.previewReady();
    const active=()=>epoch===sessionEpoch&&selectedCaseId===id&&context===caseDocumentEpoch&&request===documentRequestVersion&&shell.isConnected&&document.getElementById('modal-case-detail').style.display!=='none';
    // Sequential fetches avoid doubling Apps Script requests and peak decoding memory.
    for(const [index,file] of [before,after].entries()){
        const target=shell.children[index].querySelector('.comparison-panel');
        try{
            const response=await apiPost(GAS_URL,{method:'POST',body:JSON.stringify({action:'get_document',id,url:file.url}),headers:{'Content-Type':'text/plain;charset=utf-8'}}),result=await readApiResult(response);
            if(!active())return;if(result.status!=='success')throw new Error(result.message||uxText('Berkas belum dapat dibaca.','The file could not be read.'));
            if(typeof result.base64!=='string'||result.base64.length>13981016)throw new Error(uxText('Ukuran berkas tidak valid.','Invalid file size.'));
            const bytes=Uint8Array.from(atob(result.base64),char=>char.charCodeAt(0));if(!bytes.length)throw new Error(uxText('Berkas kosong.','The file is empty.'));
            const mime=window.IPCOSDocuments.trustedMime(bytes,String(result.mimeType||'application/octet-stream'),result.fileName),url=URL.createObjectURL(new Blob([bytes],{type:mime}));caseBlobUrls.add(url);
            window.IPCOSDocuments.render(target,url,mime,String(result.fileName||file.fileName).replace(/[\\/\x00-\x1f]/g,'_'));
        }catch(error){if(active())target.querySelector('p').textContent=systemText(error.message||uxText('Berkas gagal dimuat. Pilih ulang versi untuk mencoba lagi.','The file failed to load. Select the version again to retry.'));}
    }
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-compare-label]');if(button)compareCaseDocuments(button.dataset.compareLabel);});
