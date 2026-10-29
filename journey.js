// Academic preparation follows the existing editable checklist and upload rules.
function stageServiceGuide(type, items) {
    const ids = items.map(item => item.id);
    const service = type === 'skripsi' && (ids.includes('s1') ? 'Outline' : ids.includes('s3') ? 'Proposal' : ids.includes('s5') ? 'Pendadaran' : '');
    if (!service) return '';
    return `<div class="stage-service" data-stage-service="${service}"></div>`;
}

function renderAcademicStages() {
    if (typeof window !== 'undefined' && window.IPCOSPreparation) { window.IPCOSPreparation.render(); return; }
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
    window.IPCOSRegistration?.refresh();
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
    const resume = select.value === type;
    if (select.value && select.value !== type && registrationDirty && !confirm(uxText('Ada isian pengajuan lain yang belum dikirim. Beralih ke jenis pengajuan ini?', 'Another request has unsent inputs. Switch to this request type?'))) return;
    if (!switchTab(null, 'pendaftaran')) return;
    if (!document.getElementById('pendaftaran').classList.contains('active')) return;
    if (!resume) {
        select.value = type;
        toggleExamForm();
        saveFormDraft();
        registrationDirty = true;
    }
    const target = !document.getElementById('registration-review').hidden
        ? document.getElementById('review-heading')
        : document.getElementById(registrationRequirements(type).find(item => !item.ready)?.id) || select;
    if(target?.id!=='review-heading'&&window.IPCOSRegistration)window.IPCOSRegistration.focus(target.id);
    else {target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});}
}

document.addEventListener('click', event => {
    const start = event.target.closest('[data-start-service]');
    if (start) openStageRegistration(start.dataset.startService);
    const target = event.target.closest('[data-requirement-field]');
    if (target) { window.IPCOSRegistration?.focus(target.dataset.requirementField); }
});
['input', 'change'].forEach(name => document.addEventListener(name, event => {
    if (event.target.closest('#registration-fields') || event.target.id === 'reg-jenis-utama') renderRegistrationReadiness();
}));

let journeyCloud = {supported:false,available:false,unavailable:false,checks:{},revision:0,pending:{},saving:false,error:false,updatedAt:''};
let journeySaveTimer, journeyGeneration = 0, journeyOwner = '', adminJourneyProgress = null, adminJourneyRequest = 0;
let journeyViewOwner = '', journeyViewHtml = '';
function resetAcademicJourney() {
    clearTimeout(journeySaveTimer);
    journeyCloud = {supported:false,available:false,unavailable:false,checks:{},revision:0,pending:{},saving:false,error:false,updatedAt:''};
    journeyOwner = ''; adminJourneyProgress = null; adminJourneyRequest++;
    journeyViewOwner = ''; journeyViewHtml = '';
    sessionStorage.removeItem('ipcos_progress_pending');
    document.getElementById('academic-journey-content').textContent = '';
    if (typeof window !== 'undefined') window.IPCOSPreparation?.reset();
}
function journeyPreparationState() {
    if (!journeyCloud.supported) return journeyCloud.localChecks !== undefined ? journeyCloud.localChecks : readStoredJSON(localStorage,`progress_${currentUser.nim}`,{});
    return Object.assign({},journeyCloud.checks,Object.fromEntries(Object.entries(journeyCloud.pending).map(([id,item])=>[id,item.value])));
}
function persistJourneyPending() {
    sessionStorage.setItem('ipcos_progress_pending',JSON.stringify({owner:currentUser.nim,pending:journeyCloud.pending}));
}
function validJourneyProgress(saved) {
    return !!saved && typeof saved.exists === 'boolean' && Number.isInteger(saved.revision) && saved.revision >= 0
        && !!saved.checks && typeof saved.checks === 'object' && !Array.isArray(saved.checks)
        && Object.values(saved.checks).every(value=>typeof value === 'boolean');
}
function journeyAllowedPreparationIds(data) {
    const counts = new Map();
    for (const type of ['magang','skripsi']) {
        const content = (data.contents || []).find(item=>item.Tipe===type);
        let groups; try { groups = content ? JSON.parse(content.DataJSON) : getChecklistData(type); } catch (_) { groups = []; }
        if (!Array.isArray(groups)) continue;
        for (const group of groups) for (const item of Array.isArray(group?.items) ? group.items : []) {
            const id = String(item?.id ?? '');
            const existing = typeof document !== 'undefined' ? document.getElementById?.(id) : null;
            const canonicalCheckbox = existing?.tagName === 'INPUT' && existing.type === 'checkbox' && typeof existing.matches === 'function' && existing.matches('.chk-magang, .chk-skripsi');
            if (/^[A-Za-z0-9_-]{1,64}$/.test(id) && !/^prep-(?:magang|skripsi)-/.test(id) && (!existing || canonicalCheckbox)) counts.set(id,(counts.get(id)||0)+1);
        }
    }
    return new Set([...counts].filter(([,count])=>count===1).map(([id])=>id));
}
function applyJourneySnapshot(data) {
    if (data.journeySupported !== true) return;
    const first = !journeyCloud.available;
    journeyCloud.supported = true;
    if (currentUser.role !== 'mhs') { renderAcademicStages(); return; }
    const saved = data.journey;
    if (data.journeyUnavailable || !validJourneyProgress(saved)) {
        journeyCloud.unavailable = true; journeyCloud.error = true; renderAcademicJourney(); return;
    }
    journeyCloud.available = true; journeyCloud.unavailable = false; journeyCloud.error = false;
    if (saved.revision >= journeyCloud.revision) {
        journeyCloud.checks = saved.checks; journeyCloud.revision = saved.revision; journeyCloud.updatedAt = saved.updatedAt || '';
    }
    if (first) {
        journeyCloud.error = false;
        const allowed = journeyAllowedPreparationIds(data), pending = readStoredJSON(sessionStorage,'ipcos_progress_pending',{});
        if (String(pending.owner ?? '').trim() === String(currentUser.nim).trim()) {
            for (const [id,item] of Object.entries(pending.pending || {})) if (allowed.has(id) && typeof item?.value === 'boolean') journeyCloud.pending[id] = {value:item.value,generation:++journeyGeneration};
        }
        if (!saved.exists) {
            const legacy = readStoredJSON(localStorage,`progress_${currentUser.nim}`,{});
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
    if (journeyCloud.supported && (!journeyCloud.available || journeyCloud.unavailable)) {
        input.checked = journeyPreparationState()[input.id] === true; renderAcademicJourney(); return;
    }
    if (journeyCloud.supported) {
        journeyCloud.pending[input.id] = {value:input.checked,generation:++journeyGeneration};
        journeyCloud.error = false; persistJourneyPending();
        clearTimeout(journeySaveTimer); journeySaveTimer = setTimeout(saveJourneyProgress,350);
    }
    updateProgress();
}
async function saveJourneyProgress() {
    if (currentUser.role !== 'mhs' || journeyCloud.saving) return;
    if (!journeyCloud.supported) { if (journeyCloud.localError) updateProgress(); return; }
    clearTimeout(journeySaveTimer);
    if (!journeyCloud.available || journeyCloud.unavailable) {
        if (isOffline) { journeyCloud.error = true; renderAcademicJourney(); return; }
        await syncDatabase(); return;
    }
    if (!Object.keys(journeyCloud.pending).length) return;
    if (isOffline) { journeyCloud.error = true; renderAcademicJourney(); return; }
    const epoch = sessionEpoch, revision = journeyCloud.revision, sent = {...journeyCloud.pending};
    journeyCloud.saving = true; journeyCloud.error = false; renderAcademicJourney();
    try {
        const result = await apiPostSuccess(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'save_progress',changes:Object.fromEntries(Object.entries(sent).map(([id,item])=>[id,item.value]))})});
        if (epoch !== sessionEpoch) return;
        if (!validJourneyProgress(result.journey) || !result.journey.exists || result.journey.revision <= revision
            || Object.entries(sent).some(([id,item])=>!Object.prototype.hasOwnProperty.call(result.journey.checks,id) || result.journey.checks[id] !== item.value)) throw new Error('Progres belum terkonfirmasi.');
        if (result.journey.revision >= journeyCloud.revision) { journeyCloud.checks = result.journey.checks; journeyCloud.revision = result.journey.revision; journeyCloud.updatedAt = result.journey.updatedAt; }
        for (const [id,item] of Object.entries(sent)) if (journeyCloud.pending[id]?.generation === item.generation) delete journeyCloud.pending[id];
        persistJourneyPending(); localStorage.removeItem(`progress_${currentUser.nim}`);
        loadProgressData();
    } catch (error) { if (epoch === sessionEpoch && !error.staleSession) journeyCloud.error = true; }
    finally {
        if (epoch === sessionEpoch) {
            journeyCloud.saving = false; renderAcademicJourney();
            if (!journeyCloud.error && Object.keys(journeyCloud.pending).length) { clearTimeout(journeySaveTimer); journeySaveTimer = setTimeout(saveJourneyProgress,100); }
        }
    }
}
function journeySyncText() {
    if (!journeyCloud.supported && journeyCloud.localError) return uxText('Perubahan persiapan belum tersimpan di perangkat. Pilihan masih tersedia selama tab ini dibuka. Coba simpan lagi.', 'Preparation changes are not saved on this device. Your choices remain available while this tab is open. Retry saving.');
    if (!journeyCloud.supported) return uxText('Persiapan masih tersimpan di perangkat ini.', 'Preparation is still saved on this device.');
    if (!journeyCloud.available || journeyCloud.unavailable) return uxText('Catatan persiapan cloud belum dapat dimuat. Periksa koneksi lalu coba muat lagi.', 'Cloud preparation could not be loaded. Check your connection and retry loading.');
    if (journeyCloud.error) return uxText('Perubahan persiapan belum tersimpan di cloud. Periksa koneksi lalu coba lagi.', 'Preparation changes are not saved in the cloud. Check your connection and retry.');
    if (journeyCloud.saving || Object.keys(journeyCloud.pending).length) return uxText('Menyimpan persiapan ke cloud...', 'Saving preparation to the cloud...');
    return uxText('Persiapan tersimpan di cloud dan tersedia saat berganti perangkat.', 'Preparation is saved in the cloud and available on other devices.');
}
function journeyRecords(nim) {
    const owner = String(nim ?? '').trim();
    if (!owner || !getSessionToken() || currentUser.role !== 'admin' && (currentUser.role !== 'mhs' || owner !== String(currentUser.nim).trim())) return [];
    return readStoredJSON(sessionStorage,'ipcos_registrations',[]).filter(item=>String(item.nim ?? '').trim() === owner)
        .sort((a,b)=>{const ta=journeyActivity(a),tb=journeyActivity(b);return (ta===tb?0:ta>tb?-1:1)||String(a.id).localeCompare(String(b.id));});
}
function journeyActivity(item) {
    const timestamp=value=>{const number=displayDate(value).getTime();return Number.isFinite(number)?number:-Infinity;};
    let logs=[];try{logs=JSON.parse(item.note||'[]');}catch(_){}
    return Math.max(timestamp(item.date),...(Array.isArray(logs)?logs.map(log=>timestamp(log?.time)):[]));
}
function journeyCaseState(item) { return String(item?.status || '').trim().toLowerCase(); }
function journeyServiceRecord(type,records) {
    const cases=records.filter(item=>item.jenis===type);
    return cases.find(item=>['revision','pending','resubmitted'].includes(journeyCaseState(item))) || cases[0];
}
function journeyDocumentState(item) {
    const status=journeyCaseState(item);
    return !item ? uxText('Belum ada pengajuan berkas','No document request yet')
        : status==='accepted' ? uxText('Berkas disetujui admin','Documents approved by admin')
        : status==='revision' ? uxText('Berkas perlu perbaikan','Documents need corrections')
        : status==='resubmitted' ? uxText('Perbaikan menunggu pemeriksaan','Corrections awaiting review')
        : status==='pending' ? uxText('Berkas menunggu pemeriksaan','Documents awaiting review')
        : uxText('Status berkas belum tersedia','Document status unavailable');
}
function journeyProgress(nim) {
    const value=window.IPCOSAcademic?.progress?.(nim);
    const known=value?.available===true && value.exists===true && Number.isInteger(value.level) && value.level>=0 && value.level<=3;
    return {supported:value?.supported===true,available:value?.available===true,exists:value?.exists===true,level:known?value.level:null};
}
function journeyStageHtml(type,records,progress,index) {
    const known=progress.level!==null,complete=known&&progress.level>index,next=known&&progress.level===index;
    const state=!known?'unknown':complete?'complete':next?'next':'waiting';
    const label=type==='Outline'?'Outline':type==='Proposal'?uxText('Seminar Proposal','Proposal Seminar'):uxText('Pendadaran','Thesis Defense');
    const text=!known?uxText('Belum diverifikasi','Not verified'):complete?uxText('Selesai diverifikasi','Verified complete'):next?uxText('Tahap berikutnya','Next stage'):uxText('Tahap selanjutnya','Later stage');
    return `<li class="journey-map-step ${complete?'is-complete':''}" data-journey-stage="${type}" data-stage-state="${state}" ${next?'aria-current="step"':''}><span class="journey-map-marker" aria-hidden="true">${complete?'✓':index+1}</span><div><h3>${label}</h3><p class="journey-map-state">${text}</p><p class="journey-map-request">${journeyDocumentState(journeyServiceRecord(type,records))}</p></div></li>`;
}
function journeyNextAction(records,progress,admin) {
    const nextType=progress.level!==null?['Outline','Proposal','Pendadaran'][progress.level]:'';
    const active=records.filter(item=>['revision','pending','resubmitted'].includes(journeyCaseState(item)));
    const actionable=admin ? active.find(item=>['resubmitted','pending'].includes(journeyCaseState(item))) || active[0]
        : active.find(item=>journeyCaseState(item)==='revision') || active.find(item=>item.jenis===nextType) || active[0];
    if(actionable) return {kind:'case',item:actionable,label:admin?uxText('Buka Pengajuan','Open Request'):journeyCaseState(actionable)==='revision'?uxText('Lihat Perbaikan','View Corrections'):uxText('Lihat Pengajuan','View Request'),title:admin?uxText('Tindak lanjut pengajuan','Request follow-up'):journeyCaseState(actionable)==='revision'?uxText('Ada berkas yang perlu diperbaiki','Your documents need corrections'):uxText('Pengajuan Anda sedang diproses','Your request is being processed'),description:systemText(actionable.jenis)+' · '+caseNextStep(actionable)};
    const current=nextType&&journeyServiceRecord(nextType,records);
    if(current&&journeyCaseState(current)==='accepted') return {kind:'case',item:current,label:uxText('Lihat Hasil Pengajuan','View Request Result'),title:uxText('Berkas disetujui admin','Documents approved by admin'),description:uxText('Lanjutkan kegiatan akademik sesuai arahan program studi. Admin mencatat penyelesaian tahap secara terpisah.','Follow your program’s academic instructions. Admin records stage completion separately.')};
    if(!admin&&nextType&&!serviceAvailability(nextType)) return {kind:'service',type:nextType,label:uxText('Siapkan Pengajuan','Prepare Request'),title:systemText(nextType),description:uxText('Periksa persyaratan, lalu lengkapi data dan berkas pengajuan.','Check the requirements, then prepare your request details and files.')};
    if(admin) return records.length ? {kind:'case',item:records[0],label:uxText('Lihat Pengajuan Terakhir','View Latest Request'),title:uxText('Riwayat pengajuan mahasiswa','Student request history'),description:uxText('Periksa dokumen dan catatan mahasiswa tanpa mengubah persiapan pribadinya.','Review the student’s documents and notes without changing their personal preparation.')}
        : {kind:'queue',label:uxText('Kembali ke Antrean','Back to Queue'),title:uxText('Belum ada pengajuan tercatat','No requests recorded yet'),description:uxText('Pilih pengajuan lain dari antrean untuk melanjutkan pemeriksaan.','Choose another request from the queue to continue reviewing.')};
    if(progress.level===3&&records.length) return {kind:'status',label:uxText('Lihat Status Pengajuanku','View My Requests'),title:uxText('Tahap Pendadaran telah diverifikasi','Thesis defense stage verified'),description:uxText('Dokumen dan hasil pengajuan tetap tersedia. Ikuti ketentuan program studi untuk penyelesaian akademik berikutnya.','Your documents and request results remain available. Follow program rules for further academic requirements.')};
    if(progress.level===3) return {kind:'preparation',type:'skripsi',label:uxText('Lihat Ketentuan Skripsi','View Thesis Requirements'),title:uxText('Tahap Pendadaran telah diverifikasi','Thesis defense stage verified'),description:uxText('Ikuti ketentuan program studi untuk penyelesaian akademik berikutnya.','Follow program rules for further academic requirements.')};
    return {kind:'preparation',type:'skripsi',label:uxText('Lihat Persiapan Skripsi','View Thesis Preparation'),title:uxText('Siapkan langkah berikutnya','Prepare your next step'),description:nextType&&serviceAvailability(nextType)||uxText('Periksa persyaratan dan hubungi admin bila tahap yang sudah Anda lalui belum dicatat.','Review the requirements and contact admin if a completed stage has not been recorded.')};
}
function journeyActionHtml(action) {
    const target=action.kind==='case'?`data-case-id="${escapeHtml(action.item.id)}"`:action.kind==='service'?`data-start-service="${escapeHtml(action.type)}"`:action.kind==='status'?'data-journey-status':action.kind==='queue'?'data-journey-back-queue':`data-journey-preparation-target="${action.type}"`;
    return `<button id="journey-next-button" type="button" class="btn-primary" data-journey-action="${action.kind}" ${target}>${action.label}<span aria-hidden="true"> →</span></button>`;
}
function updateJourneyView(container,html,owner) {
    if(journeyViewOwner===owner&&journeyViewHtml===html&&container.firstElementChild)return;
    const sameOwner=journeyViewOwner===owner,opened=new Map(sameOwner?[...container.querySelectorAll('[data-journey-disclosure]')].map(node=>[node.dataset.journeyDisclosure,node.open]):[]);
    const active=sameOwner&&container.contains(document.activeElement)?document.activeElement:null;
    const focus=active?{id:active.id,caseId:active.dataset.caseId,disclosure:active.closest('[data-journey-disclosure]')?.dataset.journeyDisclosure,prep:active.dataset.journeyPreparationTarget,status:active.hasAttribute('data-journey-status')}:null;
    journeyViewOwner=owner;journeyViewHtml=html;container.innerHTML=html;
    container.querySelectorAll('[data-journey-disclosure]').forEach(node=>{if(opened.has(node.dataset.journeyDisclosure))node.open=opened.get(node.dataset.journeyDisclosure);});
    if(focus){const scope=focus.disclosure?[...container.querySelectorAll('[data-journey-disclosure]')].find(node=>node.dataset.journeyDisclosure===focus.disclosure)||container:container;
        let target=focus.id?document.getElementById(focus.id):focus.caseId?[...scope.querySelectorAll('[data-case-id]')].find(node=>node.dataset.caseId===focus.caseId):focus.prep?[...scope.querySelectorAll('[data-journey-preparation-target]')].find(node=>node.dataset.journeyPreparationTarget===focus.prep):focus.status?scope.querySelector('[data-journey-status]'):null;
        if(!target?.getClientRects().length)target=focus.disclosure?[...container.querySelectorAll('[data-journey-disclosure]')].find(node=>node.dataset.journeyDisclosure===focus.disclosure)?.querySelector('summary'):document.getElementById('journey-next-button');
        if(target?.getClientRects().length&&!target.closest('[inert]'))target.focus({preventScroll:true});}
}
function renderAcademicJourney() {
    renderAcademicStages();
    const container = document.getElementById('academic-journey-content');
    if (!container || !['admin','mhs'].includes(currentUser.role) || !getSessionToken()) { if (container) container.textContent = '';journeyViewOwner='';journeyViewHtml=''; return; }
    const admin = currentUser.role === 'admin', nim = String(admin ? journeyOwner : currentUser.nim).trim();
    const records = journeyRecords(nim), name = records[0]?.nama || (admin ? '' : currentUser.nama);
    const owner=`${sessionEpoch}:${currentUser.role}:${nim}`;
    if (admin && !nim) { updateJourneyView(container,`<h1>${uxText('Perjalanan Akademik', 'Academic Journey')}</h1><p>${uxText('Buka pengajuan mahasiswa, lalu pilih Lihat Perjalanan Akademik.', 'Open a student request, then select View Academic Journey.')}</p><button id="journey-back-queue" type="button" class="btn-secondary" data-journey-back-queue>${uxText('Kembali ke Antrean','Back to Queue')}</button>`,owner); return; }
    const progress=journeyProgress(nim),action=journeyNextAction(records,progress,admin);
    const levels=[uxText('Belum menyelesaikan Outline','Outline not completed'),uxText('Outline selesai','Outline completed'),uxText('Sempro selesai','Proposal seminar completed'),uxText('Pendadaran selesai','Thesis defense completed')];
    const position=progress.level!==null?levels[progress.level]:progress.available?uxText('Tahap belum dicatat admin','Stage not yet recorded by admin'):progress.supported?uxText('Status akademik belum dapat dimuat','Academic status could not be loaded'):uxText('Tahap akademik belum tersedia','Academic stages are not available yet');
    const state = admin ? adminJourneyProgress?.checks || {} : journeyPreparationState();
    const groups = ['magang','skripsi'].map(type=>({type,groups:displayChecklistData(type)}));
    const journal=journeyServiceRecord('Skripsi Jurnal',records);
    // Before a first request, lead with preparation and fold the empty stage map.
    const fresh=!admin&&!records.length;
    container.classList.toggle('journey-fresh',fresh);
    const history=admin?records.map(item=>`<article class="journey-history-item"><div><strong>${escapeHtml(systemText(item.jenis))}</strong><span>${escapeHtml(item.id)} · ${escapeHtml(Number.isFinite(journeyActivity(item))?formatDate(new Date(journeyActivity(item))):'—')}</span>${getStatusBadge(journeyCaseState(item))}</div><button type="button" class="btn-secondary" data-case-id="${escapeHtml(item.id)}">${uxText('Dokumen & riwayat','Documents & history')}</button></article>`).join(''):'';
    const html=`<header class="journey-heading"><div><h1>${uxText('Perjalanan Akademik','Academic Journey')}</h1><p>${escapeHtml(name)}${admin?` · ${escapeHtml(nim)}`:''}</p></div>${admin&&action.kind!=='queue'?`<button id="journey-back-queue" type="button" class="btn-secondary" data-journey-back-queue>${uxText('Kembali ke Antrean','Back to Queue')}</button>`:''}</header>
        <section id="journey-overview" aria-labelledby="journey-position-title"><div class="journey-position"><span class="eyebrow">${uxText('TAHAP TERVERIFIKASI ADMIN','ADMIN-VERIFIED STAGE')}</span><h2 id="journey-position-title">${position}</h2><p>${uxText('Tahap akademik dicatat admin. Persetujuan berkas dan persiapan pribadi ditampilkan terpisah.','Admin records academic stages. Document approvals and personal preparation are shown separately.')}</p></div><div id="journey-next-action"><span class="eyebrow">${uxText('LANGKAH BERIKUTNYA','NEXT STEP')}</span><h3>${escapeHtml(action.title)}</h3><p>${escapeHtml(action.description)}</p>${journeyActionHtml(action)}</div></section>
        ${fresh?`<details class="journey-fresh-map" data-journey-disclosure="map"><summary><strong>${uxText('Peta tahap akademik','Academic stage map')}</strong><span>${uxText('Outline → Proposal → Pendadaran · belum ada pengajuan','Outline → Proposal → Defense · no requests yet')}</span></summary>`:''}<section class="journey-map-section" aria-labelledby="journey-map-title"><div class="journey-section-title"><h2 id="journey-map-title">${uxText('Peta tahap akademik','Academic stage map')}</h2><p>${uxText('Penyelesaian tahap mengikuti verifikasi admin, bukan jumlah berkas yang disetujui.','Stage completion follows admin verification, not the number of approved documents.')}</p></div><ol id="journey-academic-map">${['Outline','Proposal','Pendadaran'].map((type,index)=>journeyStageHtml(type,records,progress,index)).join('')}</ol></section>
        <section id="journey-journal-path" aria-labelledby="journey-journal-title"><div><span class="eyebrow">${uxText('JALUR LAYANAN TERSENDIRI','SEPARATE SERVICE PATH')}</span><h2 id="journey-journal-title">${uxText('Skripsi Jurnal','Journal-Based Thesis')}</h2><p>${uxText('Persyaratan dan proses jalur jurnal mengikuti ketentuan program studi.','Requirements and the journal-based process follow your program’s rules.')}</p></div><span class="journey-document-status">${journeyDocumentState(journal)}</span></section>${fresh?'</details>':''}
        <section id="journey-preparation" aria-labelledby="journey-preparation-title"><div class="journey-section-title"><h2 id="journey-preparation-title">${uxText('Persiapan pribadi','Personal preparation')}</h2><p>${uxText('Catatan mahasiswa untuk menyiapkan persyaratan.','Student notes for preparing the requirements.')}</p></div><p class="journey-cloud-status" role="status">${admin?adminJourneyProgress?uxText('Catatan persiapan dari cloud. Admin tidak mengubah checklist mahasiswa.','Preparation from the cloud. Admin cannot edit student checks.'):uxText('Catatan persiapan cloud belum tersedia.','Cloud preparation is not available yet.'):journeySyncText()}</p>${!admin&&journeyCloud.error?`<button id="journey-retry-progress" type="button" class="btn-secondary" data-retry-progress>${uxText('Coba simpan lagi','Retry saving')}</button>`:''}<div class="journey-preparation-disclosures">${groups.map(({type,groups})=>{const items=groups.flatMap(group=>group.items||[]),complete=items.filter(item=>state[item.id]===true).length,available=!admin||!!adminJourneyProgress;return `<details id="journey-preparation-${type}" data-journey-disclosure="${type}"${fresh?' open':''}><summary id="journey-preparation-${type}-summary"><strong>${type==='magang'?uxText('Magang','Internship'):uxText('Skripsi','Thesis')}</strong><span>${available?`${complete}/${items.length} ${uxText('disiapkan','prepared')}`:uxText('Belum tersedia','Unavailable')}</span></summary><div class="journey-preparation-body">${groups.map(group=>{const items=group.items||[],complete=items.filter(item=>state[item.id]===true).length;return `<div class="journey-preparation-group"><strong>${escapeHtml(group.title)}</strong><span>${available?`${complete}/${items.length} ${uxText('disiapkan','prepared')}`:'—'}</span></div>`;}).join('')}<button id="journey-preparation-${type}-open" type="button" class="btn-secondary" data-journey-preparation-target="${type}">${admin?uxText('Lihat Ketentuan','View Requirements'):uxText('Perbarui Persiapan','Update Preparation')}</button></div></details>`;}).join('')}</div></section>
        ${admin?`<details id="journey-admin-history" data-journey-disclosure="history"><summary id="journey-admin-history-summary"><strong>${uxText('Pengajuan & dokumen mahasiswa','Student requests & documents')}</strong><span>${records.length} ${uxText('pengajuan','requests')}</span></summary><div class="journey-history">${history||`<p>${uxText('Belum ada pengajuan tercatat.','No requests recorded yet.')}</p>`}</div></details>`:`<section class="journey-request-link"><div><h2>${uxText('Pengajuan & dokumen','Requests & documents')}</h2><p>${uxText('Lihat status, dokumen, dan tindak lanjut seluruh pengajuan Anda.','View the status, documents and next steps for all your requests.')}</p></div><button id="journey-request-history" type="button" class="btn-secondary" data-journey-status>${uxText('Buka Status Pengajuanku','Open My Requests')}</button></section>`}`;
    updateJourneyView(container,html,owner);
}
async function openAcademicJourney(nim) {
    if (!['mhs','admin'].includes(currentUser.role)) return;
    const owner=String(nim ?? '').trim();
    if (!owner || !getSessionToken() || currentUser.role === 'mhs' && owner !== String(currentUser.nim).trim()) return;
    if (!confirmLeaveCase()) return;
    const previousOwner=journeyOwner,previousProgress=adminJourneyProgress;
    journeyOwner = owner; adminJourneyProgress = null;
    if(!switchTab(null,'academic-journey')){journeyOwner=previousOwner;adminJourneyProgress=previousProgress;return;}
    closeModal('modal-case-detail',true);
    const epoch = sessionEpoch, version = ++adminJourneyRequest;
    if (currentUser.role !== 'admin' || !journeyCloud.supported) return;
    try {
        const result = await apiPostSuccess(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'get_journey',nim:journeyOwner})});
        if (epoch !== sessionEpoch || version !== adminJourneyRequest || journeyOwner !== owner || currentUser.role!=='admin') return;
        if (!validJourneyProgress(result.journey)) throw new Error('Catatan persiapan belum terkonfirmasi.');
        adminJourneyProgress = result.journey; renderAcademicJourney();
    } catch (error) { if (epoch === sessionEpoch && version === adminJourneyRequest && !error.staleSession) showToast(uxText('Catatan persiapan belum dapat dimuat. Riwayat pengajuan tetap tersedia.', 'Preparation could not be loaded. Request history is still available.'),'error'); }
}
document.addEventListener('click',event=>{
    const button = event.target.closest('[data-open-journey]');
    if (button) openAcademicJourney(button.dataset.openJourney);
    if (event.target.closest('[data-retry-progress]')) saveJourneyProgress();
    if(!getSessionToken())return;
    const preparation=event.target.closest('[data-journey-preparation-target]');
    if(preparation&&['magang','skripsi'].includes(preparation.dataset.journeyPreparationTarget)) {
        if (window.IPCOSPreparation) window.IPCOSPreparation.open(preparation.dataset.journeyPreparationTarget,{fromJourney:true});
        else switchTab(null,preparation.dataset.journeyPreparationTarget);
    }
    if(currentUser.role==='mhs'&&event.target.closest('[data-journey-status]'))switchTab(null,'student-status');
    if(currentUser.role==='admin'&&event.target.closest('[data-journey-back-queue]'))switchTab(null,'admin-data');
});
window.addEventListener('online',()=>{if (journeyCloud.error) saveJourneyProgress();});
