/* Small workflow helpers. No extra dependency or server/database changes. */
let syncPhase = 'idle', lastSyncTime = '', syncTimer = null;
let queueRestored = false, registrationDirty = false;
function renderSyncStatus() {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.hidden = !getSessionToken();
    const time = lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString(currentLang === 'id' ? 'id-ID' : 'en-GB', {hour:'2-digit',minute:'2-digit'}) : '';
    el.dataset.state = syncPhase;
    el.textContent = isOffline ? uxText('Offline · data terakhir ditampilkan','Offline · showing cached data') : syncPhase === 'syncing' ? uxText('Sedang memperbarui…','Updating…') : syncPhase === 'error' ? uxText('Pembaruan gagal · gunakan Segarkan Data','Update failed · use Refresh Data') : time ? uxText('Terakhir diperbarui ','Last updated ')+time : uxText('Belum tersinkron','Not synced yet');
}
function setSyncPhase(phase) {
    syncPhase = phase;
    if (phase === 'success') { lastSyncTime = new Date().toISOString(); sessionStorage.setItem('ipcos_last_sync',lastSyncTime); }
    renderSyncStatus();
}
function saveQueueView() {
    if (currentUser.role !== 'admin') return;
    sessionStorage.setItem('ipcos_queue_view',JSON.stringify({search:document.getElementById('admin-search-input').value,status:document.getElementById('admin-status-filter').value,type:document.getElementById('admin-type-filter').value,overdue:document.getElementById('admin-overdue-filter').checked,page:currentAdminPage,desc:isAdminSortDesc}));
}
function restoreQueueView() {
    if (queueRestored || currentUser.role !== 'admin') return;
    queueRestored = true;
    const state = readStoredJSON(sessionStorage,'ipcos_queue_view',{});
    for (const [id,key] of [['admin-search-input','search'],['admin-status-filter','status'],['admin-type-filter','type']]) {
        const el=document.getElementById(id), value=state[key];
        if (typeof value==='string' && (el.tagName!=='SELECT' || [...el.options].some(o=>o.value===value))) el.value=value;
    }
    document.getElementById('admin-overdue-filter').checked=state.overdue===true;
    currentAdminPage=Number.isInteger(state.page) && state.page>0 ? state.page : 1;
    isAdminSortDesc=state.desc!==false;
    document.getElementById('admin-sort-icon').textContent=isAdminSortDesc?'↓':'↑';
}
const correctionTemplates = {
    certified:['Unggah dokumen yang sudah disahkan atau ditandatangani oleh pihak yang berwenang.','Upload a document certified or signed by the appropriate authority.'],
    readable:['Unggah ulang dokumen yang jelas dan lengkap. Pastikan semua halaman terbaca.','Upload a clear and complete document with all pages readable.'],
    format:['Sesuaikan dokumen dengan template pada menu Template & FAQ, lalu unggah versi perbaikannya.','Use the document format from Templates & FAQ, then upload the corrected version.'],
    details:['Periksa kembali isian pengajuan dan samakan dengan informasi pada dokumen pendukung.','Review the request details and match them with the supporting documents.']
};
function revisionTemplateHtml() {
    return `<label for="revision-template">${uxText('Gunakan contoh instruksi (opsional)','Use an instruction example (optional)')}</label><select id="revision-template" onchange="insertRevisionTemplate(this)"><option value="">${uxText('Pilih contoh…','Choose an example…')}</option><option value="certified">${uxText('Dokumen belum disahkan','Document not certified')}</option><option value="readable">${uxText('Dokumen kurang jelas atau lengkap','Document unclear or incomplete')}</option><option value="format">${uxText('Format dokumen','Document format')}</option><option value="details">${uxText('Isian perlu disesuaikan','Request details need correcting')}</option></select><p class="field-helper">${uxText('Contoh ditambahkan ke catatan. Edit agar sesuai pengajuan; pilih berkas secara terpisah.','The example is added to the note. Edit it to fit this request; select documents separately.')}</p>`;
}
function insertRevisionTemplate(select) {
    const text=correctionTemplates[select.value];
    if (!text) return;
    const note=document.getElementById('case-revision-note');
    note.value=[note.value.trim(),text[currentLang==='id'?0:1]].filter(Boolean).join('\n\n');
    document.getElementById('case-action-panel').dataset.dirty='true';
    select.value=''; note.focus();
}
function setSubmissionStage(target,stage) {
    const anchor=document.getElementById(target);
    if (!anchor) return;
    let el=document.getElementById(target+'-steps');
    if (!el) { el=document.createElement('div');el.id=target+'-steps';el.className='submission-steps';el.setAttribute('role','status');anchor.before(el); }
    const labels=[uxText('Menyiapkan','Preparing'),uxText('Mengirim','Sending'),uxText('Diterima sistem','Received by system')];
    el.dataset.stage=stage;
    const index={preparing:0,sending:1,confirmed:2}[stage];
    el.innerHTML=labels.map((label,i)=>`<span class="${i===index?'current':i<index?'done':''}">${i+1}. ${label}</span>`).join('');
    if (stage==='uncertain' || stage==='error') el.innerHTML+=`<p>${stage==='uncertain'?uxText('Belum ada konfirmasi. Periksa status pengajuan sebelum mengirim ulang.','No confirmation yet. Check the request status before retrying.'):uxText('Belum terkirim. Periksa isian dan berkas Anda.','Not sent. Check your inputs and files.')}</p>`;
}
function caseEditorDirty() {
    const panel=document.getElementById('case-action-panel');
    return !!panel && !panel.hidden && panel.dataset.dirty==='true' && document.getElementById('modal-case-detail').style.display!=='none';
}
function confirmLeaveCase() {
    if (isPreparingCorrection || activeUpdateIds.has(selectedCaseId)) { showToast(uxText('Tunggu konfirmasi pengiriman sebelum menutup.','Wait for submission confirmation before closing.'),'error');return false; }
    return !caseEditorDirty() || confirm(uxText('Catatan atau pilihan berkas belum dikirim. Tinggalkan isian ini?','Notes or selected files have not been sent. Leave these inputs?'));
}
function confirmLeaveRegistration() {
    if (isSubmittingRegistration) { showToast(uxText('Tunggu konfirmasi pengiriman sebelum berpindah.','Wait for submission confirmation before leaving.'),'error');return false; }
    return !registrationDirty || confirm(uxText('Pengajuan belum dikirim. Draf isian tetap ada di tab ini, tetapi berkas harus dipilih ulang setelah halaman dimuat ulang. Tetap berpindah?','The request has not been sent. Draft text remains in this tab, but files must be selected again after a reload. Leave anyway?'));
}
function resetWorkflowSession() {
    queueRestored=false;registrationDirty=false;syncPhase='idle';lastSyncTime='';
    ['ipcos_queue_view','ipcos_last_sync'].forEach(key=>sessionStorage.removeItem(key));
    const panel=document.getElementById('case-action-panel'); if(panel) panel.dataset.dirty='false';
    document.getElementById('admin-type-filter').value='';
    document.getElementById('admin-overdue-filter').checked=false;
    isAdminSortDesc=true;
    document.getElementById('form-submit-status-steps')?.remove();
    renderSyncStatus();
}
function scheduleActiveSync(immediate=false) {
    clearTimeout(syncTimer);syncTimer=null;
    if (document.hidden) return;
    if (immediate && syncPhase!=='syncing') silentSyncDatabase();
    syncTimer=setTimeout(()=>{if(syncPhase!=='syncing') silentSyncDatabase();scheduleActiveSync();},180000);
}
document.addEventListener('visibilitychange',()=>scheduleActiveSync(!document.hidden));
window.addEventListener('online',()=>{renderSyncStatus();scheduleActiveSync();});
window.addEventListener('offline',renderSyncStatus);
window.addEventListener('load',()=>{lastSyncTime=sessionStorage.getItem('ipcos_last_sync')||'';renderSyncStatus();scheduleActiveSync();});
document.addEventListener('input',workflowDirtyInput);
document.addEventListener('change',workflowDirtyInput);
function workflowDirtyInput(event) {
    if (currentUser.role==='mhs' && (event.target.closest('#registration-fields') || event.target.id==='reg-jenis-utama')) registrationDirty=true;
    const panel=event.target.closest('#case-action-panel');
    if(panel && event.target.matches('input,textarea,select')) panel.dataset.dirty='true';
}
window.addEventListener('beforeunload',event=>{
    if (!getSessionToken() || !(registrationDirty || caseEditorDirty() || isSubmittingRegistration || isPreparingCorrection || activeUpdateIds.size)) return;
    event.preventDefault();event.returnValue='';
});
