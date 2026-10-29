/* Evaluation follow-ups: admin home numbers, bulk queue actions, editable revision templates and early-stage preparation. */
(() => {
    'use strict';
    const t = (id, en) => uxText(id, en), el = id => document.getElementById(id);
    const state = item => String(item?.status || '').trim().toLowerCase();
    const jakartaDay = value => { const date = displayDate(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-CA', {timeZone:'Asia/Jakarta'}) : ''; };
    const logs = item => { try { const value = JSON.parse(item.note || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
    const acceptedAt = item => logs(item).slice().reverse().find(log => log.status === 'Accepted')?.time || '';
    const records = () => readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    const archived = item => window.IPCOSReviewTools?.archived?.(item) === true;

    /* ---------- Admin home: today at a glance ---------- */
    function adminStats() {
        const all = records().filter(item => !archived(item)), today = jakartaDay(new Date());
        const incoming = all.filter(item => jakartaDay(item.date) === today).length;
        const doneToday = all.filter(item => state(item) === 'accepted' && jakartaDay(acceptedAt(item)) === today).length;
        const monthAgo = Date.now() - 30 * 86400000;
        const durations = all.filter(item => state(item) === 'accepted').map(item => {
            const start = displayDate(item.date).getTime(), end = displayDate(acceptedAt(item)).getTime();
            return Number.isFinite(start) && Number.isFinite(end) && end >= start && end >= monthAgo ? (end - start) / 86400000 : null;
        }).filter(value => value !== null);
        const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;
        const waiting = all.filter(item => ['pending','resubmitted'].includes(state(item)));
        const overdue = waiting.filter(item => caseWaiting(item)?.overdue).length;
        const dosens = readStoredJSON(sessionStorage, 'ipcos_dosens', []);
        const critical = dosens.filter(row => { const max = Number(row.Maksimal), used = Number(row.Terpakai); return Number.isFinite(max) && max > 0 && Number.isFinite(used) && max - used <= 1; });
        return {incoming, doneToday, average, durations:durations.length, waiting:waiting.length, overdue, critical};
    }
    function renderAdminHome() {
        const home = el('task-home'), subtitle = el('admin-home-subtitle');
        if (currentUser.role !== 'admin' || !home) return;
        const s = adminStats();
        if (subtitle) subtitle.textContent = s.waiting
            ? `${s.waiting} ${t('pengajuan menunggu tinjauan', s.waiting === 1 ? 'request awaiting review' : 'requests awaiting review')}${s.overdue ? ` · ${s.overdue} ${t('lewat target', 'past target')}` : ''}.`
            : t('Tidak ada pengajuan yang menunggu tinjauan.', 'No requests are awaiting review.');
        let panel = el('admin-today');
        if (!panel) { panel = document.createElement('section'); panel.id = 'admin-today'; panel.setAttribute('aria-label', t('Kondisi hari ini', 'Today at a glance')); }
        if (panel.parentNode !== home) home.prepend(panel);
        const tile = (value, label, extra = '', tone = '') => `<div class="admin-today-tile${tone ? ' ' + tone : ''}"><strong>${value}</strong><span>${label}</span>${extra ? `<small>${extra}</small>` : ''}</div>`;
        const avg = s.average === null ? '—' : (s.average < 10 ? s.average.toFixed(1) : Math.round(s.average)) + ' ' + t('hari', 'days');
        panel.innerHTML = tile(s.incoming, t('Masuk hari ini', 'Received today'))
            + tile(s.doneToday, t('Selesai hari ini', 'Completed today'))
            + tile(avg, t('Rata-rata waktu proses', 'Average processing time'), s.durations ? t(`${s.durations} pengajuan · 30 hari`, `${s.durations} requests · 30 days`) : t('Belum ada data 30 hari', 'No data in 30 days'))
            + tile(s.overdue, t('Lewat target', 'Past target'), t(`dari ${s.waiting} menunggu`, `of ${s.waiting} waiting`), s.overdue ? 'alert' : '')
            + `<button type="button" class="admin-today-tile${s.critical.length ? ' alert' : ''}" onclick="switchTab(null,'admin-dosen')"><strong>${s.critical.length}</strong><span>${t('Kuota dosen kritis', 'Supervisors near capacity')}</span><small>${s.critical.length ? escapeHtml(s.critical.slice(0, 2).map(row => String(row.Nama || row.nama || '').split(',')[0]).join(', ')) + (s.critical.length > 2 ? '…' : '') : t('Semua masih tersedia', 'All have capacity')}</small></button>`;
    }

    /* ---------- Student home: preparation first for early-stage students ---------- */
    function renderStudentPreparation() {
        const home = el('task-home');
        if (currentUser.role !== 'mhs' || !home || typeof displayChecklistData !== 'function') return;
        const mine = records().filter(isStudentOwner);
        el('home-preparation')?.remove();
        if (mine.some(item => state(item) === 'accepted')) return;
        const checks = typeof journeyPreparationState === 'function' ? journeyPreparationState() : {};
        const rows = ['skripsi', 'magang'].map(type => {
            const items = displayChecklistData(type).flatMap(group => group.items || []);
            const done = items.filter(item => checks[item.id] === true).length, percent = items.length ? Math.round(done / items.length * 100) : 0;
            return `<div class="home-preparation-row"><div><strong>${type === 'magang' ? t('Magang', 'Internship') : t('Skripsi', 'Thesis')}</strong><span>${done}/${items.length} ${t('disiapkan', 'prepared')}</span></div><div class="home-preparation-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div><button type="button" class="btn-secondary" data-home-preparation="${type}">${done ? t('Lanjutkan', 'Continue') : t('Mulai', 'Start')}</button></div>`;
        }).join('');
        const section = document.createElement('section');
        section.id = 'home-preparation'; section.className = 'home-preparation';
        section.setAttribute('aria-labelledby', 'home-preparation-title');
        section.innerHTML = `<div class="student-section-heading"><h2 id="home-preparation-title">${t('Persiapan Anda', 'Your preparation')}</h2></div><p>${t('Centang persyaratan yang sudah siap sebelum mengirim pengajuan.', 'Tick the requirements you have ready before submitting a request.')}</p>${rows}`;
        const anchor = home.querySelector('.student-section-heading');
        anchor ? anchor.before(section) : home.append(section);
    }
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-home-preparation]');
        if (button && currentUser.role === 'mhs') window.IPCOSPreparation?.open(button.dataset.homePreparation);
    });

    const originalRenderTaskHome = window.renderTaskHome;
    if (typeof originalRenderTaskHome === 'function') {
        window.renderTaskHome = function () {
            const result = originalRenderTaskHome.apply(this, arguments);
            try { if (currentUser.role === 'admin') renderAdminHome(); else renderStudentPreparation(); } catch (_) {}
            return result;
        };
    }

    /* ---------- Bulk queue actions ---------- */
    const selected = new Set();
    let busy = false, confirming = '';
    const byId = () => new Map(records().map(item => [String(item.id), item]));
    const approvable = item => item && ['pending','resubmitted'].includes(state(item)) && !['Outline','Pergantian Pembimbing'].includes(item.jenis) && getCaseFiles(item).length > 0 && !archived(item);
    const archivable = item => item && state(item) === 'accepted' && !archived(item);
    function prune() { const map = byId(); for (const id of [...selected]) if (!map.has(id) || archived(map.get(id))) selected.delete(id); }
    function bar() {
        let node = el('bulk-actions');
        if (!node) {
            const table = document.querySelector('#admin-data .case-desktop-table') || el('admin-mobile-list');
            if (!table) return null;
            node = document.createElement('div'); node.id = 'bulk-actions'; node.className = 'bulk-actions'; node.setAttribute('role', 'region'); node.setAttribute('aria-label', t('Aksi massal', 'Bulk actions'));
            el('admin-mobile-list')?.before(node);
            if (!node.isConnected) table.before(node);
        }
        return node;
    }
    function renderBar(message = '') {
        prune();
        const node = bar(); if (!node) return;
        const map = byId(), chosen = [...selected].map(id => map.get(id)).filter(Boolean);
        node.hidden = !chosen.length && !message;
        const canApprove = chosen.filter(approvable).length, canArchive = chosen.filter(archivable).length;
        node.innerHTML = `<strong>${chosen.length} ${t('dipilih', 'selected')}</strong>`
            + (confirming === 'approve'
                ? `<span class="bulk-confirm">${t(`Setujui ${canApprove} pengajuan tanpa membuka satu per satu?`, `Approve ${canApprove} requests without opening each one?`)}</span><button type="button" class="btn-primary" data-bulk="approve-confirm" ${busy ? 'disabled' : ''}>${t('Ya, setujui', 'Yes, approve')}</button><button type="button" class="btn-secondary" data-bulk="cancel" ${busy ? 'disabled' : ''}>${t('Batal', 'Cancel')}</button>`
                : confirming === 'archive'
                ? `<label class="bulk-confirm" for="bulk-archive-reason">${t('Alasan arsip', 'Archive reason')}</label><input id="bulk-archive-reason" type="text" maxlength="500" value="${escapeHtml(t('Arsip massal oleh admin.', 'Bulk archive by admin.'))}"><button type="button" class="btn-primary" data-bulk="archive-confirm" ${busy ? 'disabled' : ''}>${t(`Arsipkan ${canArchive}`, `Archive ${canArchive}`)}</button><button type="button" class="btn-secondary" data-bulk="cancel" ${busy ? 'disabled' : ''}>${t('Batal', 'Cancel')}</button>`
                : `<button type="button" class="btn-primary" data-bulk="approve" ${busy || !canApprove ? 'disabled' : ''} title="${escapeHtml(t('Hanya pengajuan menunggu admin yang berkas lengkap dan tidak perlu dosen pembimbing.', 'Only waiting requests with files that do not need a supervisor.'))}">${t('Setujui', 'Approve')} (${canApprove})</button><button type="button" class="btn-secondary" data-bulk="archive" ${busy || !canArchive || window.IPCOSReviewTools?.supported?.() !== true ? 'disabled' : ''}>${t('Arsipkan', 'Archive')} (${canArchive})</button><button type="button" class="btn-secondary" data-bulk="export" ${busy || !chosen.length ? 'disabled' : ''}>${t('Ekspor CSV', 'Export CSV')}</button><button type="button" class="btn-secondary" data-bulk="clear" ${busy ? 'disabled' : ''}>${t('Batal pilih', 'Clear')}</button>`)
            + `<span class="bulk-message" role="status">${escapeHtml(message)}</span>`;
        syncChecks();
    }
    function syncChecks() {
        document.querySelectorAll('input[data-bulk-id]').forEach(input => { input.checked = selected.has(input.dataset.bulkId); input.disabled = busy; });
        const all = el('bulk-select-page');
        if (all) {
            const ids = [...document.querySelectorAll('#table-admin-reg input[data-bulk-id]')].map(input => input.dataset.bulkId);
            all.checked = ids.length > 0 && ids.every(id => selected.has(id));
            all.indeterminate = !all.checked && ids.some(id => selected.has(id));
            all.disabled = busy || !ids.length;
        }
    }
    async function bulkApprove() {
        const map = byId(), targets = [...selected].map(id => map.get(id)).filter(approvable), epoch = sessionEpoch;
        if (!targets.length) return;
        busy = true; let done = 0; const failed = [];
        renderBar(t('Memproses…', 'Processing…'));
        for (const item of targets) {
            if (epoch !== sessionEpoch) return;
            try {
                const result = await readApiResult(await apiPost(GAS_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'update', id:item.id, status:'Accepted', noteText:escapeHtml('Berkas telah disetujui dan terverifikasi.'), files:[], dospem:null})}));
                if (result.status !== 'success') throw Error(result.message || 'Gagal');
                done++; selected.delete(String(item.id));
            } catch (error) { if (error.staleSession) return; failed.push(item.nama || item.id); }
            renderBar(t(`Disetujui ${done}/${targets.length}`, `Approved ${done}/${targets.length}`));
        }
        busy = false; confirming = '';
        await syncDatabase();
        if (epoch !== sessionEpoch) return;
        const message = failed.length ? t(`${done} disetujui. Gagal: ${failed.join(', ')}. Buka pengajuan untuk memeriksa.`, `${done} approved. Failed: ${failed.join(', ')}. Open the requests to check.`) : t(`${done} pengajuan disetujui.`, `${done} requests approved.`);
        showToast(message, failed.length ? 'error' : 'success'); renderBar(message);
    }
    async function bulkArchive() {
        const reason = (el('bulk-archive-reason')?.value || '').trim();
        if (!reason) { renderBar(t('Isi alasan arsip.', 'Enter an archive reason.')); return; }
        const map = byId(), targets = [...selected].map(id => map.get(id)).filter(archivable), epoch = sessionEpoch;
        busy = true; let done = 0; const failed = [];
        renderBar(t('Mengarsipkan…', 'Archiving…'));
        for (const item of targets) {
            if (epoch !== sessionEpoch) return;
            try {
                const version = await window.IPCOSReviewTools.version(item);
                const result = await readApiResult(await apiPost(GAS_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'archive_request', id:item.id, reason, version, requestId:crypto.randomUUID()})}));
                if (result.status !== 'success') throw Error(result.message || 'Gagal');
                done++; selected.delete(String(item.id));
            } catch (error) { if (error.staleSession) return; failed.push(item.nama || item.id); }
            renderBar(t(`Diarsipkan ${done}/${targets.length}`, `Archived ${done}/${targets.length}`));
        }
        busy = false; confirming = '';
        await syncDatabase();
        if (epoch !== sessionEpoch) return;
        const message = failed.length ? t(`${done} diarsipkan. Gagal: ${failed.join(', ')}.`, `${done} archived. Failed: ${failed.join(', ')}.`) : t(`${done} pengajuan diarsipkan. Dapat dipulihkan dari Arsip.`, `${done} requests archived. They can be restored from the Archive.`);
        showToast(message, failed.length ? 'error' : 'success'); renderBar(message);
    }
    document.addEventListener('change', event => {
        if (currentUser.role !== 'admin' || busy) return;
        const input = event.target.closest('input[data-bulk-id]');
        if (input) { input.checked ? selected.add(input.dataset.bulkId) : selected.delete(input.dataset.bulkId); confirming = ''; renderBar(); return; }
        if (event.target.id === 'bulk-select-page') {
            document.querySelectorAll('#table-admin-reg input[data-bulk-id]').forEach(box => event.target.checked ? selected.add(box.dataset.bulkId) : selected.delete(box.dataset.bulkId));
            confirming = ''; renderBar();
        }
    });
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-bulk]');
        if (!button || currentUser.role !== 'admin' || busy) return;
        const action = button.dataset.bulk;
        if (action === 'clear') { selected.clear(); confirming = ''; renderBar(); }
        else if (action === 'cancel') { confirming = ''; renderBar(); }
        else if (action === 'approve' || action === 'archive') { confirming = action; renderBar(); (el('bulk-archive-reason') || document.querySelector('[data-bulk$="-confirm"]'))?.focus(); }
        else if (action === 'approve-confirm') bulkApprove();
        else if (action === 'archive-confirm') bulkArchive();
        else if (action === 'export') { const map = byId(); window.exportAdminDataCSV?.([...selected].map(id => map.get(id)).filter(Boolean)); }
    });
    window.addEventListener('ipcos:logout', () => { selected.clear(); busy = false; confirming = ''; el('bulk-actions')?.remove(); el('admin-today')?.remove(); });

    /* ---------- Editable revision templates (Master Data) ---------- */
    let templateDraft = null, templateSaving = false;
    function renderTemplateEditor(message = '') {
        const root = el('revision-template-editor');
        if (!root || currentUser.role !== 'admin') return;
        if (!templateDraft) templateDraft = revisionTemplates().map(item => ({label:item.label, text:item.text}));
        root.innerHTML = templateDraft.map((item, index) => `<fieldset class="revision-template-row"><legend>${t('Contoh', 'Example')} ${index + 1}</legend><label for="rt-label-${index}">${t('Judul singkat', 'Short title')}</label><input id="rt-label-${index}" data-rt-field="label" data-rt-index="${index}" maxlength="80" value="${escapeHtml(item.label)}"><label for="rt-text-${index}">${t('Instruksi', 'Instruction')}</label><textarea id="rt-text-${index}" data-rt-field="text" data-rt-index="${index}" rows="2" maxlength="1000">${escapeHtml(item.text)}</textarea><button type="button" class="btn-secondary" data-rt-remove="${index}" ${templateSaving ? 'disabled' : ''}>${t('Hapus', 'Remove')}</button></fieldset>`).join('')
            + `<div class="button-row"><button type="button" class="btn-secondary" data-rt-add ${templateSaving || templateDraft.length >= 20 ? 'disabled' : ''}>${t('Tambah Contoh', 'Add Example')}</button><button type="button" class="btn-primary" data-rt-save ${templateSaving ? 'disabled' : ''}>${templateSaving ? t('Menyimpan…', 'Saving…') : t('Simpan Template', 'Save Templates')}</button></div><p class="field-helper" role="status">${escapeHtml(message)}</p>`;
    }
    async function saveTemplates() {
        const clean = templateDraft.map(item => ({label:String(item.label || '').trim().slice(0, 80), text:String(item.text || '').trim().slice(0, 1000)})).filter(item => item.label && item.text);
        if (templateDraft.some(item => !String(item.label || '').trim() || !String(item.text || '').trim())) { renderTemplateEditor(t('Lengkapi judul dan instruksi, atau hapus contoh yang kosong.', 'Fill in each title and instruction, or remove empty examples.')); return; }
        const epoch = sessionEpoch, json = JSON.stringify(clean);
        templateSaving = true; renderTemplateEditor();
        try {
            const result = await readApiResult(await apiPost(GAS_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'update_content', type:'revision_templates', content:json})}));
            if (epoch !== sessionEpoch) return;
            if (result.status !== 'success') throw Error(result.message || '');
            cachePublishedContent('revision_templates', json); templateDraft = null; templateSaving = false;
            renderTemplateEditor(t('Template tersimpan. Dipakai saat meminta perbaikan.', 'Templates saved. They are used when requesting corrections.'));
        } catch (error) {
            if (epoch !== sessionEpoch || error.staleSession) return;
            templateSaving = false; renderTemplateEditor(t('Template belum tersimpan. Coba lagi.', 'Templates were not saved. Try again.'));
        }
    }
    document.addEventListener('input', event => {
        const field = event.target.closest('[data-rt-field]');
        if (field && templateDraft) templateDraft[Number(field.dataset.rtIndex)][field.dataset.rtField] = field.value;
    });
    document.addEventListener('click', event => {
        if (currentUser.role !== 'admin' || templateSaving) return;
        if (event.target.closest('[data-rt-add]')) { templateDraft.push({label:'', text:''}); renderTemplateEditor(); el('rt-label-' + (templateDraft.length - 1))?.focus(); }
        else if (event.target.closest('[data-rt-remove]')) { templateDraft.splice(Number(event.target.closest('[data-rt-remove]').dataset.rtRemove), 1); renderTemplateEditor(); }
        else if (event.target.closest('[data-rt-save]')) saveTemplates();
    });
    document.addEventListener('toggle', event => { if (event.target.id === 'revision-template-management' && event.target.open) { templateDraft = null; renderTemplateEditor(); } }, true);
    window.addEventListener('ipcos:logout', () => { templateDraft = null; templateSaving = false; });
    // Master Data groups its cards into sections; keep the template editor with the service settings.
    function placeTemplateEditor() { const card = el('revision-template-management'), services = el('master-services-section'); if (card && services && card.parentNode !== services) services.append(card); }
    placeTemplateEditor(); document.addEventListener('DOMContentLoaded', placeTemplateEditor);

    window.IPCOSUpgrades = Object.freeze({adminStats, renderBar, selected:() => [...selected]});
})();
