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
        const documents = registrationSpecs(service).map(([, title]) => title).join(' · ');
        guide.innerHTML = `<p><strong>${uxText('Berkas pengajuan', 'Submission documents')}</strong><span>${escapeHtml(documents)}</span></p>
            <button type="button" class="btn-secondary" data-start-service="${service}">${existing ? uxText('Lanjutkan pengajuan', 'Continue request') : uxText('Siapkan pengajuan', 'Prepare request')}</button>`;
    });
    document.querySelectorAll('#magang .student-only > p, #skripsi .student-only > p').forEach(note => {
        note.textContent = uxText('Centang persiapan yang sudah Anda selesaikan. Catatan ini tersimpan di perangkat ini; hasil verifikasi admin ada di Status Pengajuan Saya.', 'Check the preparation you have completed. This checklist is stored on this device; admin decisions appear in My Requests.');
    });
}

function registrationRequirements(type) {
    if (!SERVICE_TYPES.includes(type)) return [];
    const fields = registrationTextSpecs(type).map(([id, title]) => {
        const value = document.getElementById(id).value.trim();
        const sameSupervisor = id === 'reg-dosen-baru' && value && value.toLowerCase() === document.getElementById('reg-dosen-lama').value.trim().toLowerCase();
        return {id, title, ready: !!value && !sameSupervisor, hint: sameSupervisor ? uxText('Pilih dosen yang berbeda.', 'Choose a different supervisor.') : value ? uxText('Sudah diisi', 'Completed field') : uxText('Wajib diisi', 'Required field')};
    });
    return fields.concat(registrationSpecs(type).map(([id, title]) => {
        const input = document.getElementById(id), file = input.files[0];
        const problem = fileProblem(file, input.accept);
        return {id, title, ready: !problem, hint: file ? problem || `${file.name} · ${formatFileSize(file.size)}` : `${input.accept.replaceAll(',', ' / ')} · ${uxText('maks. 10 MB', 'max. 10 MB')}`};
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
        <ul class="requirement-list">${requirements.map(item => `<li class="${item.ready ? 'requirement-ready' : ''}"><span class="requirement-state">${item.ready ? uxText('Siap', 'Ready') : uxText('Belum', 'Missing')}</span><button type="button" data-requirement-field="${item.id}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.hint)}</span></button></li>`).join('')}</ul>
        <p class="form-helper">${uxText('Kelengkapan berkas diperiksa kembali oleh admin setelah dikirim.', 'Admin will verify the documents after submission.')}</p>`;
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
