let documentInspections = new WeakMap(), preflightBusy = false;
function inspectDocument(file) {
    if (!file) return Promise.resolve({error:'',hash:''});
    const cached = documentInspections.get(file);
    if (cached) return cached.promise;
    const result = {pending:true,error:'',hash:'',promise:null};
    documentInspections.set(file,result);
    result.promise = (async () => {
        try {
            if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return result;
            const bytes = await file.arrayBuffer();
            result.error = documentStructureIssue(new Uint8Array(bytes),file.name);
            if (!result.error && crypto.subtle) result.hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
        } catch (_) { result.error = 'Berkas tidak dapat dibaca. Pilih kembali dari perangkat Anda.'; }
        finally { result.pending = false; }
        return result;
    })();
    return result.promise;
}
function registrationTextIssue(id) {
    const value = document.getElementById(id).value.trim();
    if (!value) return uxText('Isian ini wajib diisi.', 'This field is required.');
    if (value.length > (id === 'reg-alasan-ganti' ? 2000 : 500) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return uxText('Isian terlalu panjang atau berisi karakter yang tidak terbaca.', 'The field is too long or contains unreadable characters.');
    if (id === 'reg-dosen-baru' && normalizedAcademicText(value) === normalizedAcademicText(document.getElementById('reg-dosen-lama').value)) return uxText('Pilih dosen yang berbeda.', 'Choose a different supervisor.');
    return '';
}
function normalizedAcademicText(value) { return String(value).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase(); }
function registrationWarnings() {
    const type = document.getElementById('reg-jenis-utama').value;
    const seen = new Set(), warnings = [];
    for (const [id] of registrationSpecs(type)) {
        const file = document.getElementById(id).files[0], hash = file && documentInspections.get(file)?.hash;
        if (hash && seen.has(hash)) warnings.push(uxText('Dua persyaratan memakai berkas yang sama. Pastikan dokumen tersebut memang memenuhi keduanya.', 'Two requirements use the same file. Make sure it meets both requirements.'));
        if (hash) seen.add(hash);
        if (file && /\.(zip|rar)$/i.test(file.name)) warnings.push(uxText('Isi arsip tetap diperiksa admin. Pastikan seluruh dokumen wajib ada di dalamnya.', 'Admin will check the archive contents. Include every required document.'));
    }
    return [...new Set(warnings)];
}
async function inspectRegistrationDocuments() {
    const type = document.getElementById('reg-jenis-utama').value;
    await Promise.all(registrationSpecs(type).map(([id]) => inspectDocument(document.getElementById(id).files[0])));
}
document.addEventListener('change', async event => {
    const input = event.target;
    if (!input.matches('#registration-fields input[type="file"]')) return;
    const epoch = sessionEpoch, file = input.files[0];
    inspectDocument(file);
    renderRegistrationReadiness();
    await inspectDocument(file);
    if (epoch !== sessionEpoch || input.files[0] !== file) return;
    if (file) setFieldError(input.id,fileProblem(file,input.accept));
    renderRegistrationReadiness();
});
