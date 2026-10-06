// Academic preparation follows the existing editable checklist and upload rules.
function stageServiceGuide(type, items) {
    const ids = items.map(item => item.id);
    const service = type === 'skripsi' && (ids.includes('s1') ? 'Outline' : ids.includes('s3') ? 'Proposal' : ids.includes('s5') ? 'Pendadaran' : '');
    if (!service) return '';
    return `<div class="stage-service" data-stage-service="${service}"></div>`;
}

function renderAcademicStages() {
    document.querySelectorAll('.academic-stage').forEach(stage => {
        const checks = [...stage.querySelectorAll('input[type="checkbox"]')];
        const completed = checks.filter(input => input.checked).length;
        const label = stage.querySelector('.stage-progress');
        label.textContent = `${completed}/${checks.length} ${uxText('disiapkan', 'prepared')}`;
        label.classList.toggle('is-ready', checks.length > 0 && completed === checks.length);
        const next = checks.find(input => !input.checked);
        const text = next?.nextElementSibling?.querySelector('span')?.textContent || '';
        stage.querySelector('.stage-next').textContent = currentUser.role === 'mhs'
            ? next ? uxText('Berikutnya: ', 'Next: ') + text : uxText('Persiapan tahap ini sudah Anda tandai lengkap.', 'You have marked this stage as prepared.')
            : uxText('Daftar persiapan mahasiswa pada tahap ini.', 'Student preparation for this stage.');
        const guide = stage.querySelector('.stage-service');
        if (!guide) return;
        const service = guide.dataset.stageService;
        const existing = currentUser.role === 'mhs' && activeSameType(service);
        const documents = registrationSpecs(service).map(([, title]) => systemText(title)).join(' · ');
        guide.innerHTML = `<p><strong>${uxText('Berkas pengajuan', 'Submission documents')}</strong><span>${escapeHtml(documents)}</span></p>
            <button type="button" class="btn-secondary" data-start-service="${service}">${existing ? uxText('Lanjutkan pengajuan', 'Continue request') : uxText('Siapkan pengajuan', 'Prepare request')}</button>`;
    });
    document.querySelectorAll('#magang .student-only > p, #skripsi .student-only > p').forEach(note => {
        note.textContent = journeyCloud.supported ? uxText('Centang persiapan Anda. Catatan tersimpan di cloud; hasil verifikasi admin ditampilkan terpisah di Perjalanan Akademik.', 'Check your preparation. It is saved in the cloud; admin verification appears separately in Academic Journey.') : uxText('Centang persiapan yang sudah Anda selesaikan. Catatan ini tersimpan di perangkat ini; hasil verifikasi admin ada di Status Pengajuan Saya.', 'Check the preparation you have completed. This checklist is stored on this device; admin decisions appear in My Requests.');
    });
}

function registrationRequirements(type) {
    if (!SERVICE_TYPES.includes(type)) return [];
    const fields = registrationTextSpecs(type).map(([id, title]) => {
        const value = document.getElementById(id).value.trim();
        const sameSupervisor = id === 'reg-dosen-baru' && value && normalizedAcademicText(value) === normalizedAcademicText(document.getElementById('reg-dosen-lama').value);
        return {id, title, ready: !registrationTextIssue(id), hint: sameSupervisor ? uxText('Pilih dosen yang berbeda.', 'Choose a different supervisor.') : value ? registrationTextIssue(id) || uxText('Sudah diisi', 'Completed field') : uxText('Wajib diisi', 'Required field')};
    });
    return fields.concat(registrationSpecs(type).map(([id, title]) => {
        const input = document.getElementById(id), file = input.files[0];
        const problem = fileProblem(file, input.accept);
        const inspection = file && documentInspections.get(file);
        return {id, title, ready: !problem && inspection?.pending === false, hint: file ? problem || `${file.name} · ${formatFileSize(file.size)} · ${inspection?.pending === false ? uxText('format diperiksa', 'format checked') : uxText('memeriksa format...', 'checking format...')}` : `${input.accept.replaceAll(',', ' / ')} · ${uxText('maks. 10 MB', 'max. 10 MB')}`};
    }));
}

function renderRegistrationReadiness() {
    const panel = document.getElementById('registration-readiness');
    if (!panel) return;
    const type = document.getElementById('reg-jenis-utama').value;
    const requirements = currentUser.role === 'mhs' ? registrationRequirements(type) : [];
    panel.hidden = !requirements.length;
    if (!requirements.length) { panel.textContent = ''; delete panel.dataset.signature; return; }
    const complete = requirements.filter(item => item.ready).length;
    const allReady = complete === requirements.length;
    // Keep keyboard focus while typing and only rebuild when readiness changes.
    const signature = JSON.stringify([currentLang, type, requirements]);
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    panel.innerHTML = `<div class="readiness-heading"><h3 id="readiness-heading">${uxText('Persyaratan pengajuan', 'Request requirements')}</h3><span class="stage-progress ${allReady ? 'is-ready' : ''}">${complete}/${requirements.length} ${uxText('siap', 'ready')}</span></div>
        <p class="readiness-status" role="status">${allReady ? uxText('Isian dan berkas siap diperiksa. Pilih Periksa Ringkasan sebelum mengirim.', 'Fields and files are ready for review. Select Review Summary before sending.') : uxText('Lengkapi poin berikut sebelum memeriksa ringkasan.', 'Complete the following items before reviewing the summary.')}</p>
        <ul class="requirement-list">${requirements.map(item => `<li class="${item.ready ? 'requirement-ready' : ''}"><span class="requirement-state">${item.ready ? uxText('Siap', 'Ready') : uxText('Belum', 'Missing')}</span><button type="button" data-requirement-field="${item.id}"><strong>${escapeHtml(systemText(item.title))}</strong><span>${escapeHtml(item.hint)}</span></button></li>`).join('')}</ul>
        ${registrationWarnings().map(message=>`<p class="preflight-warning">${escapeHtml(message)}</p>`).join('')}<p class="form-helper">${uxText('Pemeriksaan format tidak menilai isi atau tanda tangan. Kelengkapan akademik diperiksa admin setelah dikirim.', 'Format checks do not verify contents or signatures. Admin will verify academic requirements after submission.')}</p>`;
}

function openStageRegistration(type) {
    if (currentUser.role !== 'mhs' || !SERVICE_TYPES.includes(type) || isSubmittingRegistration) return;
    const existing = activeSameType(type);
    if (existing) { openCaseDetail(existing.id); return; }
    const select = document.getElementById('reg-jenis-utama');
    if (select.value && select.value !== type && registrationDirty && !confirm(uxText('Ada isian pengajuan lain yang belum dikirim. Beralih ke jenis pengajuan ini?', 'Another request has unsent inputs. Switch to this request type?'))) return;
    switchTab(null, 'pendaftaran');
    if (!document.getElementById('pendaftaran').classList.contains('active')) return;
    select.value = type;
    toggleExamForm();
    saveFormDraft();
    registrationDirty = true;
    document.getElementById('readiness-heading')?.scrollIntoView({block:'start'});
    select.focus({preventScroll:true});
}

document.addEventListener('click', event => {
    const start = event.target.closest('[data-start-service]');
    if (start) openStageRegistration(start.dataset.startService);
    const target = event.target.closest('[data-requirement-field]');
    if (target) { const field = document.getElementById(target.dataset.requirementField); field?.scrollIntoView({block:'center'}); field?.focus({preventScroll:true}); }
});
['input', 'change'].forEach(name => document.addEventListener(name, event => {
    if (event.target.closest('#registration-fields') || event.target.id === 'reg-jenis-utama') renderRegistrationReadiness();
}));

let journeyCloud = {supported:false,checks:{},revision:0,pending:{},saving:false,error:false,updatedAt:''};
let journeySaveTimer, journeyGeneration = 0, journeyOwner = '', adminJourneyProgress = null, adminJourneyRequest = 0;
function resetAcademicJourney() {
    clearTimeout(journeySaveTimer);
    journeyCloud = {supported:false,checks:{},revision:0,pending:{},saving:false,error:false,updatedAt:''};
    journeyOwner = ''; adminJourneyProgress = null; adminJourneyRequest++;
    sessionStorage.removeItem('ipcos_progress_pending');
    document.getElementById('academic-journey-content').textContent = '';
}
function journeyPreparationState() {
    if (!journeyCloud.supported) return readStoredJSON(localStorage,`progress_${currentUser.nim}`,{});
    return Object.assign({},journeyCloud.checks,Object.fromEntries(Object.entries(journeyCloud.pending).map(([id,item])=>[id,item.value])));
}
function persistJourneyPending() {
    sessionStorage.setItem('ipcos_progress_pending',JSON.stringify({owner:currentUser.nim,pending:journeyCloud.pending}));
}
function applyJourneySnapshot(data) {
    if (data.journeySupported !== true) return;
    if (data.journeyUnavailable) { journeyCloud.error = true; return; }
    const first = !journeyCloud.supported;
    journeyCloud.supported = true;
    if (currentUser.role !== 'mhs') return;
    const saved = data.journey;
    if (!saved || !saved.checks || !Number.isInteger(saved.revision)) return;
    if (saved.revision >= journeyCloud.revision) {
        journeyCloud.checks = saved.checks; journeyCloud.revision = saved.revision; journeyCloud.updatedAt = saved.updatedAt || '';
    }
    if (first) {
        journeyCloud.error = false;
        const pending = readStoredJSON(sessionStorage,'ipcos_progress_pending',{});
        if (pending.owner === currentUser.nim) {
            for (const [id,item] of Object.entries(pending.pending || {})) if (typeof item?.value === 'boolean') journeyCloud.pending[id] = {value:item.value,generation:++journeyGeneration};
        }
        if (!saved.exists) {
            const legacy = readStoredJSON(localStorage,`progress_${currentUser.nim}`,{});
            const allowed = new Set(['magang','skripsi'].flatMap(type=>{
                const content = (data.contents || []).find(item=>item.Tipe===type);
                let groups; try { groups = content ? JSON.parse(content.DataJSON) : getChecklistData(type); } catch (_) { groups = []; }
                return groups.flatMap(group=>(group.items || []).map(item=>String(item.id).replace(/[^a-zA-Z0-9_-]/g,'')));
            }));
            for (const [id,value] of Object.entries(legacy)) if (allowed.has(id) && value === true && !journeyCloud.pending[id]) journeyCloud.pending[id] = {value:true,generation:++journeyGeneration};
        }
        // Saved cloud data takes precedence over stale data from another device.
        if (!Object.keys(journeyCloud.pending).length) localStorage.removeItem(`progress_${currentUser.nim}`);
    }
    loadProgressData();
    if (Object.keys(journeyCloud.pending).length && !journeyCloud.saving && !journeyCloud.error) {
        persistJourneyPending(); clearTimeout(journeySaveTimer); journeySaveTimer = setTimeout(saveJourneyProgress,350);
    }
}
function recordPreparationChange(input) {
    if (currentUser.role !== 'mhs') { input.checked = false; return; }
    if (journeyCloud.supported) {
        journeyCloud.pending[input.id] = {value:input.checked,generation:++journeyGeneration};
        journeyCloud.error = false; persistJourneyPending();
        clearTimeout(journeySaveTimer); journeySaveTimer = setTimeout(saveJourneyProgress,350);
    }
    updateProgress();
}
async function saveJourneyProgress() {
    if (currentUser.role !== 'mhs' || !journeyCloud.supported || journeyCloud.saving || !Object.keys(journeyCloud.pending).length) return;
    if (isOffline) { journeyCloud.error = true; renderAcademicJourney(); return; }
    const epoch = sessionEpoch, sent = {...journeyCloud.pending};
    journeyCloud.saving = true; journeyCloud.error = false; renderAcademicJourney();
    try {
        const result = await apiPostSuccess(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'save_progress',changes:Object.fromEntries(Object.entries(sent).map(([id,item])=>[id,item.value]))})});
        if (epoch !== sessionEpoch) return;
        if (!result.journey || !Number.isInteger(result.journey.revision)) throw new Error('Progres belum terkonfirmasi.');
        if (result.journey.revision >= journeyCloud.revision) { journeyCloud.checks = result.journey.checks; journeyCloud.revision = result.journey.revision; journeyCloud.updatedAt = result.journey.updatedAt; }
        for (const [id,item] of Object.entries(sent)) if (journeyCloud.pending[id]?.generation === item.generation) delete journeyCloud.pending[id];
        persistJourneyPending(); localStorage.removeItem(`progress_${currentUser.nim}`);
        loadProgressData();
    } catch (error) { if (epoch === sessionEpoch && !error.staleSession) journeyCloud.error = true; }
    finally {
        if (epoch === sessionEpoch) {
            journeyCloud.saving = false; renderAcademicJourney();
            if (!journeyCloud.error && Object.keys(journeyCloud.pending).length) journeySaveTimer = setTimeout(saveJourneyProgress,100);
        }
    }
}
function journeySyncText() {
    if (!journeyCloud.supported) return uxText('Persiapan masih tersimpan di perangkat ini.', 'Preparation is still saved on this device.');
    if (journeyCloud.error) return uxText('Perubahan persiapan belum tersimpan di cloud. Periksa koneksi lalu coba lagi.', 'Preparation changes are not saved in the cloud. Check your connection and retry.');
    if (journeyCloud.saving || Object.keys(journeyCloud.pending).length) return uxText('Menyimpan persiapan ke cloud...', 'Saving preparation to the cloud...');
    return uxText('Persiapan tersimpan di cloud dan tersedia saat berganti perangkat.', 'Preparation is saved in the cloud and available on other devices.');
}
function journeyRecords(nim) {
    if (currentUser.role !== 'admin' && (currentUser.role !== 'mhs' || String(nim) !== String(currentUser.nim))) return [];
    return readStoredJSON(sessionStorage,'ipcos_registrations',[]).filter(item=>String(item.nim) === String(nim)).sort((a,b)=>(Date.parse(getCaseEventTime(b))||0)-(Date.parse(getCaseEventTime(a))||0));
}
function journeyStageHtml(type,records) {
    const cases = records.filter(item=>item.jenis===type);
    const item = cases.find(record=>['pending','revision','resubmitted'].includes(String(record.status).toLowerCase())) || cases[0];
    const status = item && String(item.status).toLowerCase();
    const text = !item ? uxText('Belum ada pengajuan', 'No request yet') : status === 'accepted' ? uxText('Berkas disetujui admin', 'Documents approved by admin') : status === 'revision' ? uxText('Perlu perbaikan Anda', 'Corrections needed') : uxText('Menunggu pemeriksaan admin', 'Waiting for admin review');
    return `<article class="journey-stage ${status === 'accepted' ? 'is-approved' : ''}"><div class="journey-stage-heading"><h3>${escapeHtml(systemText(type))}</h3><span class="journey-state">${text}</span></div><p>${item ? escapeHtml(caseNextStep(item)) : uxText('Siapkan persyaratan saat tahap ini sesuai dengan proses akademik Anda.', 'Prepare the requirements when this stage fits your academic process.')}</p><p class="form-helper">${escapeHtml(registrationSpecs(type).map(([,label])=>systemText(label)).join(' · '))}</p>${item ? `<button class="btn-secondary" type="button" data-case-id="${escapeHtml(item.id)}">${uxText('Buka pengajuan & dokumen', 'Open request & documents')}</button>` : currentUser.role === 'mhs' ? `<button class="btn-secondary" type="button" data-start-service="${escapeHtml(type)}">${uxText('Siapkan pengajuan', 'Prepare request')}</button>` : ''}${cases.length > 1 ? `<span class="form-helper">${cases.length} ${uxText('pengajuan tercatat di riwayat', 'requests in history')}</span>` : ''}</article>`;
}
function renderAcademicJourney() {
    const container = document.getElementById('academic-journey-content');
    if (!container || !['admin','mhs'].includes(currentUser.role)) { if (container) container.textContent = ''; return; }
    const admin = currentUser.role === 'admin', nim = admin ? journeyOwner : currentUser.nim;
    const records = journeyRecords(nim), name = records[0]?.nama || (admin ? '' : currentUser.nama);
    if (admin && !nim) { container.innerHTML = `<h1>${uxText('Perjalanan Akademik', 'Academic Journey')}</h1><p>${uxText('Buka pengajuan mahasiswa, lalu pilih Lihat Perjalanan Akademik.', 'Open a student request, then select View Academic Journey.')}</p>`; return; }
    const state = admin ? adminJourneyProgress?.checks || {} : journeyPreparationState();
    const groups = ['magang','skripsi'].map(type=>({type,groups:displayChecklistData(type)}));
    const history = records.map(item=>`<article class="journey-history-item"><div><strong>${escapeHtml(systemText(item.jenis))}</strong><span>${escapeHtml(formatDateTime(item.date).replace(/<[^>]*>/g,' '))}</span>${getStatusBadge(item.status)}</div><button type="button" class="btn-secondary" data-case-id="${escapeHtml(item.id)}">${uxText('Dokumen & riwayat', 'Documents & history')}</button></article>`).join('');
    container.innerHTML = `<div class="journey-heading"><div><p class="eyebrow">${uxText('Dari persiapan hingga verifikasi', 'From preparation to verification')}</p><h1>${uxText('Perjalanan Akademik', 'Academic Journey')}</h1><p>${escapeHtml(name)}${admin ? ` · ${escapeHtml(nim)}` : ''}</p></div><button type="button" class="btn-secondary" onclick="switchTab(null,'${admin ? 'admin-data' : 'pendaftaran'}')">${admin ? uxText('Kembali ke antrean', 'Back to queue') : uxText('Buat pengajuan', 'New request')}</button></div>
        <section class="journey-section"><h2>${uxText('Status pengajuan resmi', 'Official request status')}</h2><p>${uxText('Persetujuan di bawah menunjukkan berkas sudah diverifikasi admin. Kelulusan ujian dan penyelesaian akademik mengikuti ketentuan program studi.', 'Approval below means admin has verified the documents. Exam results and academic completion follow program rules.')}</p><div class="journey-stages">${['Outline','Proposal','Pendadaran','Skripsi Jurnal'].map(type=>journeyStageHtml(type,records)).join('')}</div></section>
        <section class="journey-section"><div class="readiness-heading"><h2>${uxText('Persiapan pribadi', 'Personal preparation')}</h2><span class="journey-state">${uxText('Ditandai mahasiswa', 'Marked by student')}</span></div><p class="journey-cloud-status" role="status">${admin ? adminJourneyProgress ? uxText('Catatan persiapan dari cloud. Admin tidak mengubah checklist mahasiswa.', 'Preparation from the cloud. Admin cannot edit student checks.') : uxText('Catatan persiapan cloud belum tersedia.', 'Cloud preparation is not available yet.') : journeySyncText()}</p>${!admin && journeyCloud.error ? `<button type="button" class="btn-secondary" data-retry-progress>${uxText('Coba simpan lagi', 'Retry saving')}</button>` : ''}<div class="journey-preparation">${groups.map(({type,groups})=>`<div><h3>${type === 'magang' ? uxText('Magang', 'Internship') : uxText('Skripsi', 'Thesis')}</h3>${groups.map(group=>{ const items = group.items || [], complete = items.filter(item=>state[item.id] === true).length; return `<div class="journey-preparation-group"><strong>${escapeHtml(group.title)}</strong><span>${complete}/${items.length} ${uxText('disiapkan', 'prepared')}</span></div>`; }).join('')}<button type="button" class="btn-secondary" onclick="switchTab(null,'${type}')">${admin ? uxText('Lihat ketentuan', 'View requirements') : uxText('Perbarui persiapan', 'Update preparation')}</button></div>`).join('')}</div></section>
        <section class="journey-section"><h2>${uxText('Semua pengajuan & dokumen', 'All requests & documents')} <span class="journey-count">${records.length}</span></h2><p>${uxText('Termasuk pengajuan terdahulu dan pergantian pembimbing. Buka pengajuan untuk melihat berkas terbaru, versi sebelumnya, serta percakapan dengan admin.', 'Includes earlier requests and supervisor changes. Open a request for current files, earlier versions and conversations with admin.')}</p><div class="journey-history">${history || `<p>${uxText('Belum ada pengajuan tercatat.', 'No requests recorded yet.')}</p>`}</div></section>`;
}
async function openAcademicJourney(nim) {
    if (!['mhs','admin'].includes(currentUser.role)) return;
    if (currentUser.role === 'mhs' && String(nim) !== String(currentUser.nim)) return;
    if (!confirmLeaveCase()) return;
    closeModal('modal-case-detail',true);
    journeyOwner = String(nim); adminJourneyProgress = null;
    switchTab(null,'academic-journey');
    if (currentUser.role !== 'admin' || !journeyCloud.supported) return;
    const epoch = sessionEpoch, version = ++adminJourneyRequest;
    try {
        const result = await apiPostSuccess(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'get_journey',nim:journeyOwner})});
        if (epoch !== sessionEpoch || version !== adminJourneyRequest || journeyOwner !== String(nim)) return;
        adminJourneyProgress = result.journey; renderAcademicJourney();
    } catch (error) { if (epoch === sessionEpoch && version === adminJourneyRequest && !error.staleSession) showToast(uxText('Catatan persiapan belum dapat dimuat. Riwayat pengajuan tetap tersedia.', 'Preparation could not be loaded. Request history is still available.'),'error'); }
}
document.addEventListener('click',event=>{
    const button = event.target.closest('[data-open-journey]');
    if (button) openAcademicJourney(button.dataset.openJourney);
    if (event.target.closest('[data-retry-progress]')) saveJourneyProgress();
});
window.addEventListener('online',()=>{if (journeyCloud.error) saveJourneyProgress();});
