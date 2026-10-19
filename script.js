// Link Web App Google Apps Script Terbaru (Pastikan URL sesuai dengan deploy Anda)
const GAS_URL = "https://script.google.com/macros/s/AKfycbxzpIl1qKKLKVB-O6Jsv08OiK_zEztbGOkEIXUze1zsxL8gdC3-oZfQ2bJ6QaW-hoEE8Q/exec";

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function safeUrl(value) {
    try {
        const url = new URL(String(value), window.location.href);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
    } catch (_) { return '#'; }
}

function sanitizeRichHtml(value) {
    const source = new DOMParser().parseFromString(String(value ?? ''), 'text/html');
    const output = document.createElement('div');
    const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'BR', 'SPAN', 'DIV', 'P', 'UL', 'LI', 'A']);
    function copy(node, parent) {
        if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.textContent)); return; }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = allowed.has(node.tagName) ? node.tagName.toLowerCase() : 'span';
        const child = document.createElement(tag);
        if (tag === 'a') {
            child.href = safeUrl(node.getAttribute('href'));
            child.target = '_blank';
            child.rel = 'noopener noreferrer';
        }
        for (const nested of node.childNodes) copy(nested, child);
        parent.appendChild(child);
    }
    for (const node of source.body.childNodes) copy(node, output);
    return output.innerHTML;
}

// ==========================================
// 1. SISTEM NOTIFIKASI TOAST & FORMAT TANGGAL
// ==========================================
function showToast(message, type = 'success') {
    const overlay=[...document.querySelectorAll('.overlay,.overlay-dialog')].reverse().find(el=>el.id!=='welcome-modal'&&getComputedStyle(el).display!=='none');
    if(overlay?.id==='modal-edit-content'&&window.IPCOSContentStudio)return;
    if(overlay?.id==='modal-case-detail'&&window.IPCOSExperience?.feedback(message,type,overlay))return;
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = systemText(message);
    window.IPCOSExperience?.feedback(message,type);
    container.appendChild(toast);
    bindLanguageBlock(toast);
    while (container.children.length > 2) container.firstElementChild.remove();

    setTimeout(() => {
        toast.classList.add('fadeOut');
        setTimeout(() => toast.remove(), 180);
    }, 4000);
}

function showLoader(loadingText = null) {
    window.IPCOSExperience?.beginOperation(loadingText);
    if (isSubmittingRegistration || isPreparingCorrection || activeUpdateIds.size) return;
    const loaderEl = document.getElementById('loader');
    if (loaderEl) loaderEl.style.display = 'flex';

    const textEl = document.getElementById('loader-text');
    if (textEl) {
        if (loadingText) {
            textEl.innerText = systemText(loadingText);
        } else {
            textEl.innerText = currentLang === 'id' ? 'Memuat data...' : 'Loading data...';
        }
    }
}

function hideLoader() {
    window.IPCOSExperience?.finishOperation();
    const loaderEl = document.getElementById('loader');
    if (loaderEl) loaderEl.style.display = 'none';
}

// ==========================================
// 1.1 SKELETON LOADER HELPERS
// ==========================================
function renderTableSkeleton(tbodyId, rows = 4, cols = 5) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    let html = '';
    for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
            html += `<td><div class="skeleton skeleton-text" style="width: ${Math.floor(Math.random() * 40) + 50}%;"></div></td>`;
        }
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

function renderTimelineSkeleton(containerId, items = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let html = '';
    for (let i = 0; i < items; i++) {
        html += `
            <div style="position: relative; margin-bottom: 12px;">
                <span class="skeleton" style="position: absolute; left: -21px; top: 2px; width: 10px; height: 10px; border-radius: 50%;"></span>
                <div class="skeleton skeleton-text-sm" style="width: 30%;"></div>
                <div class="skeleton skeleton-text" style="width: 85%;"></div>
            </div>`;
    }
    container.innerHTML = html;
}

function displayDate(value) {
    if (value instanceof Date) return value;
    let source = String(value || '').trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(source)) source += '+07:00';
    return new Date(source);
}
function formatDate(dateString) {
    if (!dateString) return '-';
    const d = displayDate(dateString);
    if (isNaN(d)) return '-';
    return d.toLocaleDateString(currentLang === 'id' ? 'id-ID' : 'en-US', { timeZone:'Asia/Jakarta', day:'2-digit', month:'short', year:'numeric' });
}
function formatDateTime(dateString) {
    if (!dateString) return '-';
    const d = displayDate(dateString);
    if (isNaN(d)) return '-';
    const lang = currentLang === 'id' ? 'id-ID' : 'en-US';
    const date = formatDate(d);
    const time = d.toLocaleTimeString(lang, { timeZone:'Asia/Jakarta', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    return `${date}<br><span class="display-time">${time} WIB</span>`;
}

function timeAgo(dateString) {
    const date = displayDate(dateString);
    if (isNaN(date)) return '-';
    const now = new Date();
    const seconds = Math.max(0, Math.floor((now - date) / 1000));
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return currentLang === 'id' ? 'Baru saja' : 'Just now';
    if (minutes < 60) return currentLang === 'id' ? `${minutes} menit lalu` : `${minutes} mins ago`;
    if (hours < 24) return currentLang === 'id' ? `${hours} jam lalu` : `${hours} hours ago`;
    if (days < 7) return currentLang === 'id' ? `${days} hari lalu` : `${days} days ago`;
    return formatDate(dateString);
}

// ==========================================
// 1.5. NETWORK MONITORING (OFFLINE CACHE & RETRY)
// ==========================================
let isOffline = !navigator.onLine;

window.addEventListener('online', () => {
    isOffline = false;
    document.getElementById('offline-indicator').style.display = 'none';
    showToast(currentLang === 'id' ? "Koneksi internet pulih. Menyinkronkan data..." : "Connection restored. Syncing data...", "success");
    syncDatabase();
});

window.addEventListener('offline', () => {
    isOffline = true;
    document.getElementById('offline-indicator').style.display = 'block';
    showToast(currentLang === 'id' ? "Anda sedang offline. Beberapa fitur mungkin dibatasi." : "You are offline. Some features may be limited.", "error");
});

// ==========================================
// 2. GLOBAL SEARCH (CTRL + K)
// ==========================================
const searchDatabase = [
    { title: "Perjalanan Akademik", keywords: "perjalanan progres tahapan riwayat skripsi", tab: "academic-journey" },
    { title: "Dashboard Akademik", keywords: "beranda utama awal dashboard", tab: "dashboard" },
    { title: "Kewajiban Magang", keywords: "magang kerja praktik logbook", tab: "magang" },
    { title: "Kewajiban Skripsi", keywords: "skripsi tugas akhir ta outline pendadaran", tab: "skripsi" },
    { title: "Pusat Pendaftaran Ujian", keywords: "daftar ujian sempro proposal pendadaran jurnal", tab: "pendaftaran" },
    { title: "Status Pengajuan", keywords: "status riwayat revisi dokumen", tab: "student-status" },
    { title: "Template Dokumen & FAQ", keywords: "template download format faq tanya jawab", tab: "templates-faq" },
    { title: "Sebaran Mata Kuliah", keywords: "kurikulum mata kuliah sks", tab: "kurikulum" },
    { title: "SOP Remidial", keywords: "remidial sop perbaikan nilai", tab: "remidial" },
    { title: "SOP Magang", keywords: "sop magang internship procedure panduan lampiran", tab: "sop-magang" },
    { title: "SOP Tugas Akhir", keywords: "sop tugas akhir final project thesis procedure panduan", tab: "sop-tugas-akhir" },
    { title: "Kalender Yudisium", keywords: "kalender jadwal batas yudisium wisuda deadline", tab: "kalender" },
    { title: "Pusat Bantuan", keywords: "bantuan kendala kontak whatsapp admin hubungi help support", tab: "feedback" }
];

document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openGlobalSearch();
    }
});

function openGlobalSearch() {
    if (typeof window !== 'undefined' && window.IPCOSSearch) return window.IPCOSSearch.open();
    if (!getSessionToken() || !['mhs','admin'].includes(currentUser.role)) return;
    const modal = document.getElementById('modal-global-search');
    clearTimeout(modalCloseTimers.get(modal.id));
    modalCloseTimers.delete(modal.id);
    modal.style.display = 'flex';
    const input = document.getElementById('global-search-input');
    input.value = '';
    renderSearchResults('');
    setTimeout(() => {
        modal.style.opacity = '1';
        if (modal.style.display === 'flex' && !modal.contains(document.activeElement)) input.focus();
    }, 10);
}

document.getElementById('global-search-input')?.addEventListener('input', function (e) {
    renderSearchResults(e.target.value);
});

function renderSearchResults(query) {
    if (typeof window !== 'undefined' && window.IPCOSSearch) return window.IPCOSSearch.render(query);
    const container = document.getElementById('global-search-results');
    if (!container) return;

    if (query.trim() === '') {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; margin: 20px 0;">${currentLang === 'id' ? 'Ketikkan kata kunci (misal: "Magang", "Ujian", "Jadwal")...' : 'Type keywords (e.g., "Internship", "Exam", "Schedule")...'}</p>`;
        return;
    }

    const q = query.trim().toLowerCase();
    const results = searchDatabase.filter(item => canAccessTab(item.tab) && (
        item.title.toLowerCase().includes(q) || systemText(item.title).toLowerCase().includes(q) || item.keywords.toLowerCase().includes(q) || (searchEnglishKeywords[item.tab] || '').includes(q))
    );

    if (results.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; margin: 20px 0;">${uxText('Tidak ditemukan hasil untuk', 'No results for')} "<b>${escapeHtml(query)}</b>"</p>`;
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    results.forEach(item => {
        html += `
            <button type="button" class="search-result" onclick="executeSearchNavigation('${item.tab}')" style="width:100%; text-align:left; font:inherit; padding: 12px 16px; background: var(--item-bg); border: 1px solid var(--item-border); border-radius: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
                <span style="font-weight: 600; font-size: 14px; color: var(--heading-color);">${escapeHtml(systemText(item.title))}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function executeSearchNavigation(tabId) {
    if (switchTab(null, tabId)) closeModal('modal-global-search');
}

// ==========================================
// 4. INIT, LOGIN & DATABASE SYNC
// ==========================================
let DB_MAHASISWA = {};
let currentUser = { nim: '', nama: '', role: '', token: '' };
let sessionEpoch = 0;
let readVersion = 0;
let loginAttempt = 0;
let loginBusy = false;
const apiRequestContexts = new WeakMap();
const contentResponseVersions = new WeakMap();
let contentPublicationVersion = 0;
const modalCloseTimers = new Map();
let isDbLoaded = false;

function getSessionToken() {
    if (currentUser.token) return currentUser.token;
    try { return JSON.parse(sessionStorage.getItem('ipcos_session') || '{}').token || ''; }
    catch (_) { sessionStorage.removeItem('ipcos_session'); return ''; }
}

function staleRequestError() { const error = new Error('Permintaan dari sesi lama diabaikan.'); error.staleSession = true; return error; }
function readStoredJSON(storage, key, fallback) {
    try {
        const value = JSON.parse(storage.getItem(key) || JSON.stringify(fallback));
        if (Array.isArray(fallback) ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid cache');
        return value;
    } catch (_) { storage.removeItem(key); return fallback; }
}
function apiPost(url, options) {
    const payload = JSON.parse(options.body || '{}');
    const context = { token: getSessionToken(), epoch: sessionEpoch, action: payload.action };
    payload.token = context.token;
    const controller=new AbortController();let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},120000);
    const abort=()=>controller.abort();if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
    return fetch(url, { ...options, signal:controller.signal, body: JSON.stringify(payload) }).then(response => { apiRequestContexts.set(response, context); return response; }).catch(error=>{if(context.epoch===sessionEpoch)window.IPCOSNext?.report(timedOut?'api_timeout':'network',context.action);throw error;}).finally(()=>{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);});
}
async function readApiResult(response) {
    const context = apiRequestContexts.get(response);let result;
    try {result=await response.json();if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Invalid API response');}
    catch(error){if(context&&context.epoch===sessionEpoch)window.IPCOSNext?.report('api_response',context.action);throw error;}
    if (context && !['student_login', 'admin_login', 'logout'].includes(context.action)) {
        if (context.epoch !== sessionEpoch || context.token !== getSessionToken()) throw staleRequestError();
        if (result.status === 'error' && /sesi|session|token/i.test(result.message || '')) expireSession();
    }
    if(result.status==='error'&&context&&context.epoch===sessionEpoch)window.IPCOSNext?.report('api_response',context.action);
    return result;
}
async function apiPostSuccess(url, options) {
    const result = await readApiResult(await apiPost(url, options));
    if (result.status !== 'success') throw new Error(result.message || 'Permintaan gagal.');
    return result;
}
async function apiRead() {
    const version = ++readVersion;
    const publicationVersion = contentPublicationVersion;
    const epoch = sessionEpoch;
    setSyncPhase('syncing');
    try {
    const data = await readApiResult(await apiPost(GAS_URL, {
        method: 'POST', body: JSON.stringify({ action: 'get_data' }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    }));
    if (version !== readVersion) throw staleRequestError();
    if (data.status === 'error') throw new Error(data.message || 'Akses data ditolak.');
    contentResponseVersions.set(data,publicationVersion);
    return data;
    } catch (error) { if (epoch === sessionEpoch && version === readVersion && getSessionToken() && !error.staleSession) setSyncPhase('error'); throw error; }
}
function expireSession() {
    sessionStorage.removeItem('ipcos_session');
    currentUser = { nim: '', nama: '', role: '', token: '' };
    loginAttempt++; loginBusy = false;
    clearPrivateCache();
    document.getElementById('student-header').style.display = 'none';
    switchTab(null, 'dashboard');
    document.getElementById('welcome-modal').style.display = 'flex';
    document.getElementById('welcome-modal').style.opacity = '1';
    resetLoginButtons();
    showToast(uxText('Sesi berakhir. Silakan masuk lagi.', 'Session expired. Please log in again.'), 'error');
}

// ==========================================
// FUNGSI NORMALISASI DATA
// ==========================================
// ==========================================
// FUNGSI NORMALISASI DATA (ANTI-ERROR HURUF BESAR/KECIL)
// ==========================================
function normalizeData(registrations) {
    if (!registrations) return [];
    return registrations.map(r => {
        // --- FIX CASE-SENSITIVITY HEADER GOOGLE SHEETS ---
        if (r.Status !== undefined && r.status === undefined) r.status = r.Status;
        if (r.Note !== undefined && r.note === undefined) r.note = r.Note;
        if (r.Jenis !== undefined && r.jenis === undefined) r.jenis = r.Jenis;
        if (r.Detail !== undefined && r.detail === undefined) r.detail = r.Detail;
        if (r.Date !== undefined && r.date === undefined) r.date = r.Date;
        if (r.Id !== undefined && r.id === undefined) r.id = r.Id;
        if (r.Nim !== undefined && r.nim === undefined) r.nim = r.Nim;
        if (r.Nama !== undefined && r.nama === undefined) r.nama = r.Nama;
        if (r.Link !== undefined && r.link === undefined) r.link = r.Link;
        // -------------------------------------------------

        if (r.status) r.status = String(r.status).trim();
        const safeStatus = String(r.status || '').trim().toLowerCase();

        const isExplicitDecision = safeStatus === 'revision' || safeStatus === 'resubmitted';
        if (r.dospem && String(r.dospem).trim() !== '' && safeStatus !== 'accepted' && !isExplicitDecision) {
            r.status = 'Accepted';
        }
        return r;
    });
}

window.onload = function () {
    if (localStorage.getItem('ipcos_theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }

    initInterfaceLanguage();
    syncRegistrationFields();
    applyDynamicLanguage();
    startCountdownWidget();
    renderDynamicContent();

    const session = sessionStorage.getItem('ipcos_session');

    if (session) {
        try {
            currentUser = JSON.parse(session);
            if (currentUser.token) finalizeLogin(currentUser.nama, currentUser.nim, currentUser.role, currentUser.token);
            else { sessionStorage.removeItem('ipcos_session'); clearPrivateCache(); }
        } catch (_) {
            sessionStorage.removeItem('ipcos_session');
            clearPrivateCache();
        }
    } else {
        clearPrivateCache();
    }
};

function clearPrivateCache() {
    window.IPCOSAdminDrafts?.clear();
    window.IPCOSSop?.reset();
    window.IPCOSNext?.reset();
    window.IPCOSStudentRequests?.reset();
    window.IPCOSAcademic?.reset();
    window.IPCOSResources?.reset();
    window.IPCOSHelp?.reset();
    window.IPCOSFileCenter?.reset();
    window.IPCOSNotifications?.reset();
    window.IPCOSSupervisors?.reset();
    window.IPCOSMaster?.reset();
    window.IPCOSCalendar?.reset();
    window.IPCOSReferences?.reset();
    window.IPCOSSearch?.reset();
    window.IPCOSPreparation?.reset();
    masterMutationBusy = false; supervisorMutationBusy = false;
    window.IPCOSPolish?.reset();
    activeReceipt = null; latestBackup = null;
    languageBlocks.clear();
    resetAcademicJourney();
    documentInspections = new WeakMap(); preflightBusy = false;
    resetWorkflowSession();
    clearCaseBlobUrls();
    window.IPCOSReviewTools?.reset();
    ratioChartInstance?.destroy(); typeChartInstance?.destroy();
    ratioChartInstance = null; typeChartInstance = null;
    const chartStatus = document.getElementById('chart-load-status'); if (chartStatus) { chartStatus.hidden = true; chartStatus.textContent = ''; }
    serviceSettings = []; serviceSettingsEditing = false; savingServiceSettings = false; backupStatusBusy = false;
    document.getElementById('save-service-settings').disabled=false;
    const backupRefresh=document.querySelector('[onclick="refreshBackupStatus()"]');if(backupRefresh)backupRefresh.disabled=false;
    const backupStatus = document.getElementById('backup-status'); if (backupStatus) backupStatus.textContent = '';
    const backupFolder = document.getElementById('backup-folder'); if (backupFolder) { backupFolder.hidden = true; backupFolder.removeAttribute('href'); }
    const serviceFields = document.getElementById('service-settings'); if (serviceFields) serviceFields.innerHTML = '';
    sessionEpoch++; readVersion++;
    ['ipcos_students', 'ipcos_registrations', 'ipcos_dosens', 'ipcos_announcements', 'ipcos_form_draft', 'ipcos_pending_submission'].forEach(key => sessionStorage.removeItem(key));
    DB_MAHASISWA = {}; isDbLoaded = false; selectedCaseId = ''; lastSubmittedCaseId = '';
    currentAdminPage = 1; adminFilteredData = []; currentNotificationIds = [];
    isSubmittingRegistration = false; isPreparingCorrection = false; isPreparingReviewDecision = false; activeUpdateIds.clear(); postingAnnouncement = false; setAnnouncementBusy(false); hideLoader();
    ['btn-submit-registration', 'btn-edit-registration'].forEach(id => { const button = document.getElementById(id); if (button) button.disabled = false; });
    document.getElementById('btn-submit-registration').textContent = uxText('Konfirmasi & Kirim', 'Confirm & Send');
    document.getElementById('dynamic-exam-form').reset();
    document.getElementById('reg-jenis-utama').value = ''; document.getElementById('reg-jenis-utama').disabled = false;
    renderRegistrationReadiness();
    renderAcademicStages();
    document.getElementById('dynamic-exam-form').style.display = 'none';
    document.getElementById('registration-fields').hidden = false; document.getElementById('registration-review').hidden = true;
    document.getElementById('btn-review-registration').hidden = false; document.getElementById('btn-submit-registration').hidden = true;
    document.querySelectorAll('#registration-fields [id$="-badge"], .field-error, .form-submit-status, .form-draft-status').forEach(el => { el.textContent = ''; el.ipcosNotice=null; });
    document.querySelectorAll('#registration-fields [aria-invalid="true"]').forEach(el => setFieldError(el.id, ''));
    document.querySelectorAll('#form-mhs input,#form-admin input').forEach(el => el.removeAttribute('aria-invalid'));
    syncRegistrationFields();
    window.IPCOSRegistration?.reset();
    document.querySelectorAll('.overlay, .overlay-dialog').forEach(modal => { if (modal.id !== 'welcome-modal') closeModal(modal.id, true); });
    ['archive-list','archive-feedback','archive-count','table-admin-reg','table-master-mhs','table-admin-dosen','table-my-status','student-mobile-list','admin-mobile-list','task-home','notif-list-container','case-detail-content','submission-receipt-content','activity-timeline-container','chat-timeline-container'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
    ['notif-dropdown','notif-badge','announcement-banner','alert-revision-student','alert-checklist-reminder'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.admin-only, .student-only').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.chk-magang, .chk-skripsi').forEach(el => { el.checked = false; });
    renderAcademicStages();
    document.getElementById('admin-search-input').value = ''; document.getElementById('admin-status-filter').value = 'ACTION_REQUIRED';
    ['archive-from','archive-to','archive-search','archive-reason','archive-service','input-nim','input-admin-user','input-admin-pass','input-broadcast-dashboard','input-broadcast','add-nim','add-nama','add-dosen-nama','input-rev-note','input-reply-note','input-reply-file'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    editorTempData = [];
    contentCacheFallback.clear();
    window.IPCOSContentStudio?.reset();
    window.IPCOSReview?.reset();
    window.IPCOSExperience?.reset();
}
function renderCachedTransactions() {
    const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    if (currentUser.role === 'admin') { loadAdminData(); renderDashboardCharts(records); renderDosenTable(); renderMasterMahasiswa(readStoredJSON(sessionStorage, 'ipcos_students', [])); }
    else if (currentUser.role === 'mhs') { loadStudentStatus(); renderActivityTimeline(records); }
    renderNotifications();
}

function syncDatabase() {
    if (!getSessionToken()) return Promise.resolve();
    if (isOffline) {
        renderSyncStatus();
        const cachedRegs = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
        if (currentUser.role === 'admin') { loadAdminData(); renderDashboardCharts(cachedRegs); }
        else if (currentUser.role === 'mhs') { loadStudentStatus(); renderActivityTimeline(cachedRegs); }
        renderNotifications();
        return Promise.resolve();
    }

    if (currentUser.role === 'admin') {
        renderTableSkeleton('table-admin-reg', 5, 6);
        if(window.IPCOSMaster)window.IPCOSMaster.render();else renderTableSkeleton('table-master-mhs', 5, 4);
    } else if (currentUser.role === 'mhs') {
        if(window.IPCOSStudentRequests)window.IPCOSStudentRequests.render();
        else renderTableSkeleton('table-my-status', 3, 4);
        renderTimelineSkeleton('activity-timeline-container', 3);
    }
    return apiRead()
        .then(data => {

            applyDatabaseSnapshot(data);
        })
        .catch(error => {
            if (error.staleSession || !getSessionToken()) return;
            setSyncPhase('error');
            renderCachedTransactions();
            showToast(uxText('Gagal menyegarkan data. Data terakhir tetap ditampilkan.', 'Refresh failed. Showing the last available data.'), 'error');
        });
}

function applyDatabaseSnapshot(data) {
            applyJourneySnapshot(data);
            serviceSettings = Array.isArray(data.services) ? data.services : [];
            renderServiceSettings();
            if (data.backup && currentUser.role === 'admin') renderBackupStatus(data.backup);
            if (!Array.isArray(data.registrations || [])) throw new Error('Data pengajuan belum dapat dibaca.');
            data.registrations = normalizeData(data.registrations);

            sessionStorage.setItem('ipcos_registrations', JSON.stringify(data.registrations || []));
            window.IPCOSAcademic?.apply(data);
            window.IPCOSInternational?.apply(data);
            sessionStorage.setItem('ipcos_announcements', JSON.stringify(data.announcements || []));
            renderNotifications();
            refreshServiceAvailability();
            window.IPCOSNext?.refresh();
            window.IPCOSReviewTools?.refresh();

            if (data.dosens) {
                sessionStorage.setItem('ipcos_dosens', JSON.stringify(data.dosens));
                if (currentUser.role === 'admin') {
                    renderDosenTable();
                    populateDospemDropdown();
                }
            }

            DB_MAHASISWA = {};
            if (data.students) {
                sessionStorage.setItem('ipcos_students', JSON.stringify(data.students));
                data.students.forEach(m => { DB_MAHASISWA[String(m.NIM)] = m.Nama; });
                if (currentUser.role === 'admin') renderMasterMahasiswa(data.students);
            }
            isDbLoaded = true;

            if (data.announcements && data.announcements.length > 0) {
                const latest = data.announcements[data.announcements.length - 1];
                if (currentUser.role === 'mhs') {
                    const annType = latest.Tipe || latest.type;
                    const annId = latest.Id || latest.id || latest.date || latest.Tanggal || latest.Pesan || latest.message;
                    const bannerText = document.getElementById('announcement-text');
                    if (bannerText) {
                        bannerText.innerText = latest.Pesan || latest.message;
                        const banner = document.getElementById('announcement-banner');
                        banner.setAttribute('data-current-ann-id', annId);
                        banner.style.display = sessionStorage.getItem(announcementDismissalKey('banner', annId)) ? 'none' : 'flex';
                    }

                    const isHiddenPermanently = localStorage.getItem(announcementDismissalKey('hide', annId));
                    const isHiddenSession = sessionStorage.getItem(announcementDismissalKey('seen', annId));

                    if (annType === 'important' && !isHiddenPermanently && !isHiddenSession) {
                        document.getElementById('important-announcement-text').innerText = latest.Pesan || latest.message;
                        const modal = document.getElementById('modal-important-announcement');
                        if (modal && !(modal.style.display === 'flex' && modal.getAttribute('data-current-ann-id') === String(annId))) {
                            clearTimeout(modalCloseTimers.get(modal.id));
                            modalCloseTimers.delete(modal.id);
                            document.getElementById('chk-dont-show-announcement').checked = false;
                            modal.setAttribute('data-current-ann-id', annId);
                            modal.style.display = 'flex';
                            const epoch = sessionEpoch;
                            setTimeout(() => { if (epoch === sessionEpoch && modal.style.display === 'flex' && modal.getAttribute('data-current-ann-id') === String(annId)) modal.style.opacity = '1'; }, 10);
                        }
                    }
                }
            } else if (currentUser.role === 'mhs') {
                const banner = document.getElementById('announcement-banner');
                if (banner) banner.style.display = 'none';
            }

            if (data.contents && data.contents.length > 0) {
                window.IPCOSSop?.receive(data.contents);
                data.contents.forEach(item => {
                    if (['sop_magang','sop_tugas_akhir'].includes(item.Tipe)) return;
                    if(contentResponseVersions.has(data)&&contentResponseVersions.get(data)!==contentPublicationVersion)return;
                    cachePublishedContent(item.Tipe, item.DataJSON);
                });
                renderDynamicContent();
            }

            if (currentUser.role === 'admin') {
                loadAdminData();
                renderDashboardCharts(data.registrations || []);
            } else if (currentUser.role === 'mhs') {
                loadStudentStatus();
                renderActivityTimeline(data.registrations || []);
            }
            setSyncPhase('success');
}

function switchLoginMode(role) {
    loginAttempt++; loginBusy = false; resetLoginButtons();
    document.getElementById('error-msg-mhs').style.display = 'none';
    document.getElementById('error-msg-admin').style.display = 'none';
    document.querySelectorAll('#form-mhs input,#form-admin input').forEach(input => input.removeAttribute('aria-invalid'));
    document.getElementById('tab-mhs').setAttribute('aria-pressed', String(role !== 'admin'));
    document.getElementById('tab-admin').setAttribute('aria-pressed', String(role === 'admin'));

    if (role === 'admin') {
        document.getElementById('tab-admin').classList.add('active');
        document.getElementById('tab-mhs').classList.remove('active');
        document.getElementById('form-admin').style.display = 'block';
        document.getElementById('form-mhs').style.display = 'none';
    } else {
        document.getElementById('tab-mhs').classList.add('active');
        document.getElementById('tab-admin').classList.remove('active');
        document.getElementById('form-mhs').style.display = 'block';
        document.getElementById('form-admin').style.display = 'none';
    }
}

function resetLoginButtons() {
    const student = document.querySelector('#form-mhs button'); const admin = document.querySelector('#form-admin button');
    student.disabled = false; student.textContent = uxText('Masuk Portal', 'Enter Portal');
    admin.disabled = false; admin.textContent = uxText('Masuk sebagai Admin', 'Login as Admin');
}
function setLoginError(role, id, en) {
    const error = document.getElementById(role === 'mhs' ? 'error-msg-mhs' : 'error-msg-admin');
    error.ipcosLoginNotice = {id,en};
    error.textContent = en ? uxText(id,en) : systemText(id);
    error.style.display = 'block';
}
function refreshLoginErrors() {
    ['error-msg-mhs','error-msg-admin'].forEach(id => {
        const error = document.getElementById(id), notice = error.ipcosLoginNotice;
        if (notice && error.style.display !== 'none') error.textContent = notice.en ? uxText(notice.id,notice.en) : systemText(notice.id);
    });
}
async function performLogin(role) {
    if (loginBusy) return;
    const student = role === 'mhs';
    const errorMsg = document.getElementById(student ? 'error-msg-mhs' : 'error-msg-admin');
    const nim = document.getElementById('input-nim').value.trim();
    const username = document.getElementById('input-admin-user').value.trim();
    const password = document.getElementById('input-admin-pass').value;
    if (student ? !nim : !username || !password) {
        if (student) setLoginError(role, 'Mohon masukkan NIM Anda.', 'Please enter your student ID.');
        else setLoginError(role, 'Username dan password wajib diisi.', 'Username and password are required.');
        const missing = document.getElementById(student ? 'input-nim' : !username ? 'input-admin-user' : 'input-admin-pass');
        missing.setAttribute('aria-invalid', 'true'); missing.focus(); return;
    }
    if (isOffline) { setLoginError(role, 'Login membutuhkan koneksi internet.', 'Login requires an internet connection.'); return; }
    loginBusy = true; const attempt = ++loginAttempt;
    const button = document.querySelector(student ? '#form-mhs button' : '#form-admin button');
    button.disabled = true; button.textContent = uxText('Sedang masuk...', 'Logging in...'); errorMsg.style.display = 'none';
    try {
        const result = await readApiResult(await apiPost(GAS_URL, { method:'POST', body:JSON.stringify(student ? { action:'student_login', nim } : { action:'admin_login', username, password }), headers:{'Content-Type':'text/plain;charset=utf-8'} }));
        if (attempt !== loginAttempt) return;
        if (result.status !== 'success' || !result.token) throw new Error(result.message || uxText('Login gagal. Coba kembali.', 'Login failed. Try again.'));
        const user = { nim:student ? nim : 'ADMINISTRATOR', nama:student ? result.nama : 'Administrator IPCOS', role, token:result.token };
        clearPrivateCache();
        sessionStorage.setItem('ipcos_session', JSON.stringify(user));
        finalizeLogin(user.nama, user.nim, user.role, user.token);
        showToast(student ? uxText(`Selamat datang, ${user.nama}!`, `Welcome, ${user.nama}!`) : uxText('Berhasil login sebagai admin.', 'Logged in as admin.'), 'success');
    } catch (error) {
        if (attempt !== loginAttempt) return;
        if (error.message) setLoginError(role,error.message);
        else setLoginError(role,'Terjadi kesalahan jaringan. Coba kembali.','Network error. Try again.');
    } finally { if (attempt === loginAttempt) { loginBusy = false; resetLoginButtons(); } }
}
function loginMhs() { return performLogin('mhs'); }
function loginAdmin() { return performLogin('admin'); }
document.querySelectorAll('#form-mhs input, #form-admin input').forEach(input => {
    input.addEventListener('invalid', () => input.setAttribute('aria-invalid', 'true'));
    input.addEventListener('input', () => {
        input.removeAttribute('aria-invalid');
        const error = document.getElementById(input.form.id === 'form-mhs' ? 'error-msg-mhs' : 'error-msg-admin');
        error.textContent = ''; error.style.display = 'none'; error.ipcosLoginNotice = null;
    });
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        if (!loginBusy) input.form.requestSubmit();
    });
});

function finalizeLogin(displayName, displayNim, role, token) {
    sessionEpoch++;
    currentUser = { nim: displayNim, nama: displayName, role: role, token: token };
    switchTab(null, 'dashboard');
    const loginEpoch = sessionEpoch;
    const firstName = displayName.split(' ')[0];

    const greetings = currentLang === 'en' ? ['Hello', 'Welcome'] : ['Halo', 'Hai'];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    const elGreeting = document.getElementById('display-greeting');
    if (elGreeting) elGreeting.innerText = `${randomGreeting}, ${firstName}!`;

    document.querySelectorAll('.admin-only').forEach(el => {
        if (el.classList.contains('bento-grid')) {
            el.style.display = role === 'admin' ? 'grid' : 'none';
        } else if (el.classList.contains('nav-item')) {
            el.style.display = role === 'admin' ? 'flex' : 'none';
        } else {
            el.style.display = role === 'admin' ? 'inline-block' : 'none';
        }
    });

    document.querySelectorAll('.student-only').forEach(el => {
        if (role === 'mhs') {
            if (!el.classList.contains('alert-box')) {
                el.style.display = el.tagName === 'DIV' && el.classList.contains('bento-grid') ? 'grid' : 'flex';
            }
        } else {
            el.style.display = 'none';
        }
    });

    renderTaskHome();
    if (role === 'admin') {
        const statusLabel = document.getElementById('label-status-user');
        if (statusLabel) {
            statusLabel.setAttribute('data-id', 'Akses Superuser');
            statusLabel.setAttribute('data-en', 'Superuser Access');
        }
        if (document.getElementById('header-subtext')) document.getElementById('header-subtext').innerText = "Role: Administrator";

        loadAdminData();
        const cachedRecords = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
        renderDashboardCharts(cachedRecords);

    } else {
        const statusLabel = document.getElementById('label-status-user');
        if (statusLabel) {
            statusLabel.setAttribute('data-id', 'Mahasiswa Aktif');
            statusLabel.setAttribute('data-en', 'Active Student');
        }
        if (document.getElementById('header-subtext')) document.getElementById('header-subtext').innerText = `NIM: ${displayNim}`;

        loadProgressData();
        loadStudentStatus();
    }

    if (document.getElementById('student-header')) document.getElementById('student-header').style.display = 'flex';
    document.getElementById('welcome-modal').style.opacity = '0';

    setTimeout(() => {
        if (loginEpoch !== sessionEpoch || getSessionToken() !== token) return;
        document.getElementById('welcome-modal').style.display = 'none';
        syncDatabase();
        applyDynamicLanguage();
        window.IPCOSNext?.startDraft();
    }, 400);
}

function logoutUser() {
    const msg = currentLang === 'id' ? "Apakah Anda yakin ingin keluar?" : "Are you sure you want to log out?";
    if (confirm(msg + ((registrationDirty || caseEditorDirty() || contentEditorDirty() || window.IPCOSInternational?.dirty() || isSubmittingRegistration || isPreparingCorrection) ? uxText(' Isian yang belum dikirim akan ditinggalkan.',' Unsent inputs will be discarded.') : ''))) {
        loginAttempt++; loginBusy = false; resetLoginButtons();
        sessionStorage.removeItem('ipcos_session');
        apiPost(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'logout' }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }).catch(() => {});
        currentUser = { nim: '', nama: '', role: '', token: '' };
        clearPrivateCache();
        renderTaskHome();
        closeModal('modal-case-detail', true);
        selectedCaseId = '';
        if (document.getElementById('student-header')) document.getElementById('student-header').style.display = 'none';
        switchTab({ currentTarget: document.querySelector('.nav-tabs li') }, 'dashboard');
        const modal = document.getElementById('welcome-modal');
        modal.style.display = 'flex';
            setTimeout(() => { modal.style.opacity = '1'; }, 10);
    }
}

// ==========================================
// 5. NOTIFICATION & ACTIVITY TIMELINE
// ==========================================
function renderNotifications() {
    renderTaskHome();
    window.IPCOSFileCenter?.render();
    window.IPCOSSearch?.refresh();
    if (window.IPCOSNotifications) { window.IPCOSNotifications.render(); return; }
    const listContainer = document.getElementById('notif-list-container');
    const badgeEl = document.getElementById('notif-badge');
    if (!listContainer) return;

    const notifs = [];
    const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    records.forEach(rec => {
        const status = String(rec.status || '').toLowerCase();
        const isStudent = currentUser.role === 'mhs';
        if (isStudent && !isStudentOwner(rec)) return;
        if (isStudent && !['revision', 'accepted'].includes(status)) return;
        if (!isStudent && currentUser.role === 'admin' && !['pending', 'resubmitted'].includes(status)) return;
        if (!['mhs', 'admin'].includes(currentUser.role)) return;
        const date = getCaseEventTime(rec);
        notifs.push({
            key: notificationHash(`${rec.id}:${status}:${date}`), caseId: String(rec.id), date,
            type: status,
            title: isStudent ? (status === 'revision' ? `${uxText('Perlu Revisi','Corrections needed')}: ${systemText(rec.jenis)}` : `${uxText('Disetujui','Approved')}: ${systemText(rec.jenis)}`)
                : (status === 'resubmitted' ? `${uxText('Perbaikan Masuk','Corrections received')}: ${systemText(rec.jenis)}` : `${uxText('Pengajuan Baru','New request')}: ${systemText(rec.jenis)}`),
            text: isStudent ? caseNextStep(rec) : `${rec.nama} — ${caseNextStep(rec)}`,
            tab: isStudent ? 'student-status' : 'admin-data'
        });
    });

    const announcements = readStoredJSON(sessionStorage, 'ipcos_announcements', []);
    announcements.slice(-5).reverse().forEach(ann => {
        notifs.push({
            key: notificationHash(`announcement:${ann.Id || ann.date || ann.Tanggal || ann.Pesan || ann.message}`),
            type: 'broadcast',
            title: uxText('Pengumuman Akademik','Academic announcement'),
            text: ann.Pesan || ann.message || uxText('Pengumuman baru dari Administrator IPCOS','New announcement from IPCOS admin'),
            date: ann.date || ann.Tanggal || new Date().toISOString(),
            tab: 'dashboard'
        });
    });

    notifs.sort((a, b) => displayDate(b.date).getTime() - displayDate(a.date).getTime());
    currentNotificationIds = notifs.map(n => n.key);
    const readIds = getReadNotificationIds();
    const unreadCount = notifs.filter(n => !readIds.includes(n.key)).length;

    if (notifs.length === 0) {
        listContainer.innerHTML = `<div style="padding: 20px; font-size: 13px; color: var(--text-muted); text-align: center;" class="lang" data-id="Belum ada notifikasi baru." data-en="No new notifications.">Belum ada notifikasi baru.</div>`;
        if (badgeEl) badgeEl.style.display = 'none';
    } else {
        if (badgeEl) {
            badgeEl.innerText = unreadCount;
            badgeEl.style.display = unreadCount ? 'flex' : 'none';
        }
        listContainer.innerHTML = notifs.map(n => `
            <button type="button" class="notif-item ${readIds.includes(n.key) ? 'is-read' : ''}" onclick="openNotification(${escapeHtml(JSON.stringify(n.key))}, ${escapeHtml(JSON.stringify(n.caseId || ''))}, ${escapeHtml(JSON.stringify(n.tab))})">
                <div style="font-weight: 700; font-size: 13px; color: var(--heading-color); margin-bottom: 3px; display:flex; align-items:center; gap:6px;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${n.type === 'revision' ? 'var(--umy-maroon)' : n.type === 'accepted' ? 'var(--umy-green)' : 'var(--umy-gold)'};"></span>
                    ${escapeHtml(n.title)}
                </div>
                <div style="font-size: 12px; color: var(--text-color); margin-bottom: 4px; line-height: 1.4;">${escapeHtml(n.text)}</div>
                <div style="font-size: 10px; color: var(--text-muted);">${timeAgo(n.date)}</div>
            </button>
        `).join('');
    }
}

let currentNotificationIds = [];
function notificationHash(value) {
    let hash = 2166136261;
    for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16);
}
function notificationReadKey() { return `ipcos_read_${notificationHash(`${currentUser.role}:${currentUser.nim}`)}`; }
function getReadNotificationIds() {
    try { const ids = JSON.parse(localStorage.getItem(notificationReadKey()) || '[]'); return Array.isArray(ids) ? ids : []; }
    catch (_) { return []; }
}
function saveReadNotificationIds(ids) {
    try { localStorage.setItem(notificationReadKey(), JSON.stringify([...new Set(ids)].filter(id=>typeof id==='string'))); } catch (_) {}
}
function openNotification(key, caseId, tabName) {
    if (typeof window !== 'undefined' && window.IPCOSNotifications) return window.IPCOSNotifications.open(key);
    if (!switchTab(null, tabName)) return;
    saveReadNotificationIds([...getReadNotificationIds(), key]);
    renderNotifications();
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    if (caseId) openCaseDetail(caseId);
}

function toggleNotifDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none' || !dropdown.style.display;
        if (isHidden) window.IPCOSNotifications?.render();
        dropdown.style.display = isHidden ? 'block' : 'none';
    }
}

function markAllNotificationsRead() {
    if (!getSessionToken() || !['mhs','admin'].includes(currentUser.role)) return;
    saveReadNotificationIds([...getReadNotificationIds(), ...currentNotificationIds]);
    renderNotifications();
    showToast(currentLang === 'id' ? 'Semua notifikasi ditandai dibaca' : 'All notifications marked as read', 'success');
}

document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('notif-wrapper');
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown && wrapper && !wrapper.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function renderActivityTimeline(records) {
    if (currentUser.role !== 'mhs') return;
    const container = document.getElementById('activity-timeline-container');
    if (!container) return;

    const myRecords = records.filter(r => String(r.nim).trim() === String(currentUser.nim).trim());
    if (myRecords.length === 0) {
        container.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); text-align: center; margin-top: 20px;">${uxText('Belum ada aktivitas terekam.', 'No activity recorded yet.')}</div>`;
        return;
    }

    let html = '';
    myRecords.sort((a,b) => displayDate(getCaseEventTime(b))-displayDate(getCaseEventTime(a))).slice(0, 5).forEach(r => {
        let text = '';
        const stat = String(r.status).trim().toLowerCase();

        const service = escapeHtml(systemText(r.jenis));
        if (stat === 'accepted') text = `${uxText('Pengajuan','Your request for')} <b>${service}</b> ${uxText('sudah diverifikasi dan disetujui.', 'has been verified and approved.')}`;
        else if (stat === 'revision') text = `<b>${service}</b>: ${uxText('Perlu perbaikan. Baca instruksi admin.', 'Corrections needed. Read the admin instructions.')}`;
        else if (stat === 'resubmitted') text = `${uxText('Perbaikan sudah dikirim untuk', 'Corrections submitted for')} <b>${service}</b>.`;
        else text = `<b>${service}</b>: ${uxText('Pengajuan diterima dan menunggu pemeriksaan admin.', 'Request received and awaiting admin review.')}`;

        let bulletColor = 'var(--umy-gold)';
        if (stat === 'accepted') bulletColor = 'var(--umy-green)';
        if (stat === 'revision') bulletColor = 'var(--umy-maroon)';

        html += `
            <div style="position: relative;">
                <span style="position: absolute; left: -21px; top: 4px; width: 10px; height: 10px; background: ${bulletColor}; border-radius: 50%;"></span>
                <div style="font-size: 11px; color: var(--text-muted); font-weight: bold; margin-bottom: 2px;">${timeAgo(getCaseEventTime(r))}</div>
                <div style="font-size: 13.5px; line-height: 1.4; color: var(--text-color);">${sanitizeRichHtml(text)}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==========================================
// 6. FUNGSI DRAG & DROP SERTA VALIDASI FILE
// ==========================================
const MAX_FILE_SIZE_MB = 10;

function handleDragOver(e, el) { e.preventDefault(); el.classList.add('dragover'); }
function handleDragLeave(el) { el.classList.remove('dragover'); }

function handleDropZone(e, el, inputId, labelId) {
    e.preventDefault();
    el.classList.remove('dragover');
    const fileInput = document.getElementById(inputId);
    if (!fileInput || currentUser.role!=='mhs' || !getSessionToken() || isSubmittingRegistration || isPreparingCorrection || preflightBusy || fileInput.disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const transfer = new DataTransfer();
        const files = [...e.dataTransfer.files];
        (fileInput.multiple ? files : files.slice(0, 1)).forEach(file => transfer.items.add(file));
        fileInput.files = transfer.files;
        // Run the same inline and delegated validation/preflight as the file picker.
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function validateFile(input, labelId) {
    if (!labelId) return;
    const labelEl = document.getElementById(labelId);
    if (!labelEl) return;

    if (input.files && input.files.length > 0) {
        const file = input.files[0];
        const formattedSize = formatFileSize(file.size);
        const isOverSize = !!fileProblem(file, input.accept);
        setFieldError(input.id, fileProblem(file, input.accept));

        if (isOverSize) {
            showToast(fileProblem(file, input.accept), 'error');

            // KOSONGKAN FILE SECARA HARD-RESET
            input.value = "";
            try {
                // Untuk browser modern, gunakan DataTransfer untuk benar-benar mengosongkan antrean file
                input.files = new DataTransfer().files;
            } catch(e) {}

            labelEl.innerHTML = `<div class="dz-file-badge error">${escapeHtml(document.getElementById(input.id + '-error')?.textContent || 'Berkas tidak valid.')}</div>`;
        } else {
            labelEl.innerHTML = `
                <div class="dz-file-badge success">
                    📄 <span>${escapeHtml(file.name)}</span> <span style="opacity:0.8;">(${formattedSize})</span>
                    <button type="button" class="dz-remove-btn" onclick="clearSelectedFile('${input.id}', '${labelId}')">${uxText('Hapus File','Remove file')}</button>
                </div>`;
        }
    } else {
        labelEl.innerHTML = "";
    }
}

function clearSelectedFile(inputId, labelId) {
    const input = document.getElementById(inputId);
    if (input) { input.value = ""; setFieldError(inputId, ''); }
    const labelEl = document.getElementById(labelId);
    if (labelEl) labelEl.innerHTML = "";
    input?.dispatchEvent(new Event('change', { bubbles: true }));
    renderRegistrationReadiness();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// ==========================================
// AUTO-SAVE DRAFT FORMULIR PENDAFTARAN
// ==========================================
function saveFormDraft() {
    const fields = ['reg-jenis-utama', 'reg-judul', 'reg-dosen-lama', 'reg-dosen-baru', 'reg-alasan-ganti'];
    const draft = { ownerNim: currentUser.nim, savedAt: new Date().toISOString() };
    fields.forEach(id => { draft[id] = document.getElementById(id)?.value || ''; });
    sessionStorage.setItem('ipcos_form_draft', JSON.stringify(draft));
    const indicator = document.getElementById('form-draft-status');
    if (indicator && !window.IPCOSNext) indicator.textContent = systemText('Draf isian tersimpan di tab ini.');
    window.IPCOSNext?.changed();
}

function loadFormDraft() {
    // Returning from a guide preserves the live form, including its review step.
    if (!document.getElementById('registration-review').hidden || [...document.querySelectorAll('#registration-fields input[type="file"]')].some(input => input.files.length)) return;
    const saved = sessionStorage.getItem('ipcos_form_draft');
    if (!saved) return;
    try {
        const draft = JSON.parse(saved);
        if (draft.ownerNim && draft.ownerNim !== currentUser.nim) { clearFormDraft(); return; }
        const jenisEl = document.getElementById('reg-jenis-utama');
        const judulEl = document.getElementById('reg-judul');
        const jenis = draft['reg-jenis-utama'] || draft.jenis;
        if (jenis && jenisEl) { jenisEl.value = jenis; toggleExamForm(); }
        if (judulEl) judulEl.value = draft['reg-judul'] || draft.judul || '';
        ['reg-dosen-lama', 'reg-dosen-baru', 'reg-alasan-ganti'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = draft[id] || '';
        });
        const indicator = document.getElementById('form-draft-status');
        registrationDirty = true;
        if (indicator) indicator.textContent = systemText('Draf isian dipulihkan. Pilih ulang berkas sebelum mengirim.');
        refreshRegistrationFieldHints();
        renderRegistrationReadiness();
    } catch (e) { }
}

function clearFormDraft() {
    registrationDirty = false;
    window.IPCOSNext?.changed(true);
    sessionStorage.removeItem('ipcos_form_draft');
    const indicator = document.getElementById('form-draft-status');
    if (indicator) indicator.textContent = '';
}

// Transaction views use the existing registration and note fields.
function uxText(id, en) { return currentLang === 'en' ? en : id; }
function registrationSpecs(jenis) {
    return ({
        'Outline': [['file-transkrip', 'Transkrip'], ['file-proposal', 'Draft Proposal']],
        'Proposal': [['file-acc-sempro', 'Form ACC Seminar Proposal']],
        'Pendadaran': [['file-folder-pendadaran', 'Berkas Pendadaran']],
        'Skripsi Jurnal': [['file-loa-jurnal', 'LoA Jurnal'], ['file-draft-jurnal', 'Draft Jurnal']],
        'Pergantian Pembimbing': [['file-surat-ganti', 'Surat Permohonan Ganti Dosen']]
    })[jenis] || [];
}
function registrationTextSpecs(jenis) {
    return jenis === 'Pergantian Pembimbing'
        ? [['reg-dosen-lama', uxText('Dosen pembimbing sekarang', 'Current supervisor')], ['reg-dosen-baru', uxText('Usulan dosen pembimbing', 'Proposed supervisor')], ['reg-alasan-ganti', uxText('Alasan pergantian', 'Reason for change')]]
        : [['reg-judul', uxText('Judul skripsi / tugas akhir', 'Thesis title')]];
}
function fileProblem(file, accept) {
    if (!file) return uxText('Pilih berkas ini terlebih dahulu.', 'Choose this file first.');
    if (!file.size) return uxText('Berkas kosong. Pilih berkas yang berisi dokumen.', 'The file is empty. Choose a document.');
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return uxText('Ukuran berkas maksimal 10 MB.', 'Maximum file size is 10 MB.');
    const extensions = String(accept || '').split(',').map(ext => ext.trim().toLowerCase()).filter(Boolean);
    if (extensions.length && !extensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
        return uxText('Format berkas yang diizinkan: ', 'Allowed file formats: ') + extensions.join(', ');
    }
    return systemText(documentInspections.get(file)?.error || '');
}
function setFieldError(id, message) {
    const input = document.getElementById(id);
    if (!input) return;
    const errorId = id + '-error';
    let error = document.getElementById(errorId);
    if (!error) { error = document.createElement('p'); error.id = errorId; error.className = 'field-error'; input.insertAdjacentElement('afterend', error); }
    error.textContent = message;
    error.hidden = !message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    const descriptions=[document.getElementById(id+'-hint')?id+'-hint':'',document.getElementById(id+'-format')?id+'-format':'',message?errorId:''].filter(Boolean);
    if(descriptions.length)input.setAttribute('aria-describedby',descriptions.join(' '));else input.removeAttribute('aria-describedby');
}
function refreshRegistrationFieldHints() {
    ['reg-judul','reg-dosen-lama','reg-dosen-baru','reg-alasan-ganti'].forEach(id => {
        const input = document.getElementById(id), hint = document.getElementById(id+'-hint');
        if (!input || !hint) return;
        const limit = id === 'reg-alasan-ganti' ? 2000 : 500;
        hint.textContent = `${input.value.trim().length} / ${limit} ${uxText('karakter', 'characters')}`;
    });
}
function syncRegistrationFields() {
    const type = document.getElementById('reg-jenis-utama').value;
    const active = new Set(type ? [...registrationTextSpecs(type), ...registrationSpecs(type)].map(([id]) => id) : []);
    document.querySelectorAll('#registration-fields input,#registration-fields textarea').forEach(input => {
        input.required = active.has(input.id);
        if (!active.has(input.id) && input.getAttribute('aria-invalid') === 'true') setFieldError(input.id, '');
    });
    refreshRegistrationFieldHints();
}
function updateTextFieldFeedback(input) {
    refreshRegistrationFieldHints();
    const ids = registrationTextSpecs(document.getElementById('reg-jenis-utama').value).map(([id]) => id);
    for (const id of ids) {
        const field = document.getElementById(id);
        if ((id === input.id || id === 'reg-dosen-baru' && input.id === 'reg-dosen-lama') && field.getAttribute('aria-invalid') === 'true') setFieldError(id, registrationTextIssue(id));
    }
}
document.querySelectorAll('#registration-fields input[type="text"],#registration-fields textarea').forEach(input => {
    input.addEventListener('input', () => updateTextFieldFeedback(input));
});
function validateRegistration() {
    if (!registrationServiceAllowed()) return false;
    const jenis = document.getElementById('reg-jenis-utama').value;
    const ids = registrationTextSpecs(jenis).map(([id]) => id);
    let firstError = '';
    ids.forEach(id => {
        const error = registrationTextIssue(id);
        setFieldError(id, error); if (error && !firstError) firstError = id;
    });
    if (jenis === 'Pergantian Pembimbing') {
        const oldName = document.getElementById('reg-dosen-lama').value.trim().toLowerCase();
        const newName = document.getElementById('reg-dosen-baru').value.trim().toLowerCase();
        if (oldName && oldName === newName) { setFieldError('reg-dosen-baru', uxText('Usulkan dosen yang berbeda dari dosen sekarang.', 'Choose a different supervisor.')); firstError ||= 'reg-dosen-baru'; }
    }
    registrationSpecs(jenis).forEach(([id]) => {
        const input = document.getElementById(id);
        const file = input.files[0];
        const error = fileProblem(file, input.accept) || (documentInspections.get(file)?.pending !== false ? uxText('Tunggu pemeriksaan format atau pilih Periksa Ringkasan kembali.', 'Wait for the format check or select Review Summary again.') : '');
        setFieldError(id, error); if (error && !firstError) firstError = id;
    });
    if (firstError) { document.getElementById(firstError).focus(); return false; }
    return !!jenis;
}
async function reviewRegistration(event) {
    event.preventDefault();
    if (isSubmittingRegistration || preflightBusy || document.getElementById('registration-fields').hidden) return;
    const epoch = sessionEpoch, type = document.getElementById('reg-jenis-utama').value;
    const formGeneration=window.IPCOSRegistration?.revision();
    const textSnapshot=registrationTextSpecs(type).map(([id])=>[id,document.getElementById(id).value]);
    const fileSnapshot=registrationSpecs(type).map(([id])=>[id,document.getElementById(id).files[0]]);
    preflightBusy = true;
    window.IPCOSRegistration?.refresh();
    document.getElementById('form-submit-status').ipcosNotice=null;
    document.getElementById('form-submit-status-steps')?.remove();
    document.getElementById('form-submit-status').textContent = uxText('Memeriksa format berkas...', 'Checking document formats...');
    try { await inspectRegistrationDocuments(); } finally { if (epoch === sessionEpoch) {preflightBusy = false;window.IPCOSRegistration?.refresh();} }
    if (epoch !== sessionEpoch || type !== document.getElementById('reg-jenis-utama').value || formGeneration!==window.IPCOSRegistration?.revision()) return;
    if (textSnapshot.some(([id,value])=>document.getElementById(id).value!==value)||fileSnapshot.some(([id,file])=>document.getElementById(id).files[0]!==file)) {
        document.getElementById('form-submit-status').textContent=uxText('Isian atau berkas berubah saat diperiksa. Periksa ringkasan kembali.','Details or files changed during checking. Review the summary again.');
        return;
    }
    if (!validateRegistration()) {
        document.getElementById('form-submit-status').textContent = uxText('Lengkapi isian yang ditandai sebelum melanjutkan.', 'Complete the marked fields to continue.');
        return;
    }
    renderRegistrationReview();
    document.getElementById('registration-fields').hidden = true;
    document.getElementById('reg-jenis-utama').disabled = true;
    document.getElementById('registration-review').hidden = false;
    document.getElementById('btn-review-registration').hidden = true;
    document.getElementById('btn-submit-registration').hidden = false;
    document.getElementById('form-submit-status').textContent = '';
    window.IPCOSRegistration?.refresh();
    document.getElementById('review-heading').focus();
}
function renderRegistrationReview() {
    const jenis = document.getElementById('reg-jenis-utama').value;
    const detail = jenis === 'Pergantian Pembimbing'
        ? [['Dosen sekarang', 'reg-dosen-lama'], ['Usulan dosen', 'reg-dosen-baru'], ['Alasan', 'reg-alasan-ganti']]
        : [['Judul', 'reg-judul']];
    document.getElementById('registration-review').innerHTML = `<h3 tabindex="-1" id="review-heading">${uxText('Periksa sebelum mengirim', 'Review before sending')}</h3>
        <dl class="receipt-list"><dt>${uxText('Jenis pengajuan', 'Request type')}</dt><dd>${escapeHtml(systemText(jenis))}</dd>
        ${detail.map(([label,id]) => `<dt>${escapeHtml(systemText(label))}</dt><dd>${escapeHtml(document.getElementById(id).value.trim())}</dd>`).join('')}</dl>
        <h4>${uxText('Berkas siap dikirim', 'Files ready to send')}</h4><ul class="review-files">${registrationSpecs(jenis).map(([id,label]) => {
            const f = document.getElementById(id).files[0];
            return `<li><strong>${escapeHtml(systemText(label))}</strong><span>${escapeHtml(f.name)} · ${formatFileSize(f.size)}</span><button type="button" class="btn-secondary" data-local-preview="${id}">${uxText('Periksa Isi Berkas','Preview File Contents')}</button><button type="button" class="btn-secondary" data-guide="templates-faq" data-guide-field="${id}">${uxText('Lihat Template','View Templates')}</button></li>`;
        }).join('')}</ul>${registrationWarnings().map(message=>`<p class="preflight-warning">${escapeHtml(message)}</p>`).join('')}<p>${uxText('Format dasar berkas sudah diperiksa. Isi, tanda tangan, dan kelayakan akademik tetap diverifikasi admin.', 'Basic file formats have been checked. Admin will verify the contents, signatures and academic eligibility.')}</p><p>${uxText('Setelah dikirim, pengajuan akan masuk ke antrean admin.', 'Your request will enter the admin review queue after submission.')}</p>
        <button type="button" class="btn-secondary" id="btn-edit-registration" onclick="editRegistration();window.IPCOSRegistration?.navigate('data')">${uxText('Kembali Mengubah', 'Back to Editing')}</button>`;
}

function editRegistration() {
    if (isSubmittingRegistration) return;
    window.IPCOSDocuments?.clearLocal();
    document.getElementById('registration-fields').hidden = false;
    document.getElementById('reg-jenis-utama').disabled = false;
    document.getElementById('registration-review').hidden = true;
    document.getElementById('btn-review-registration').hidden = false;
    document.getElementById('btn-submit-registration').hidden = true;
    window.IPCOSRegistration?.refresh();
}
function getCaseFiles(item) {
    const doc = new DOMParser().parseFromString(String(item.link || ''), 'text/html');
    return [...doc.querySelectorAll('a')].filter(a => a.getAttribute('href') && !a.getAttribute('href').startsWith('#')).map(a => ({ label: a.textContent.trim() || uxText('Berkas', 'Document'), url: safeUrl(a.getAttribute('href')) })).filter(file => file.url !== '#');
}
function getRevisionInstructions(item) {
    let logs = [];
    try { logs = JSON.parse(item.note || '[]'); } catch (_) { return { files: [], instruction: String(item.note || '') }; }
    const note = Array.isArray(logs) ? [...logs].reverse().find(log => log.role === 'admin')?.message || '' : '';
    const doc = new DOMParser().parseFromString(sanitizeRichHtml(note).replace(/<br\s*\/?\s*>/gi, '\n'), 'text/html');
    const text = doc.body.textContent;
    const match = text.match(/^Berkas yang perlu diperbaiki:\s*\n([\s\S]*?)\n\nInstruksi:\s*\n([\s\S]*)$/);
    return match ? { files: match[1].split('\n').map(line => line.replace(/^-\s*/, '').trim()).filter(Boolean), instruction: match[2] }
        : { files: [], instruction: text };
}
function revisionInstructionsHtml(item) {
    const rev = getRevisionInstructions(item);
    if (!rev.instruction && !rev.files.length) return '';
    if(currentUser.role==='mhs'&&String(item.status).toLowerCase()==='revision'&&window.IPCOSCorrections)return window.IPCOSCorrections.instructions(item);
    const heading = String(item.status).toLowerCase() === 'resubmitted' ? uxText('Instruksi revisi sebelumnya', 'Previous correction instructions') : currentUser.role === 'admin' ? uxText('Instruksi untuk mahasiswa', 'Instructions for the student') : uxText('Yang perlu Anda perbaiki', 'Corrections requested');
    return `<section class="revision-instructions"><h3>${heading}</h3>
        ${rev.files.length ? `<ul>${rev.files.map(label => `<li>${escapeHtml(systemText(label))}</li>`).join('')}</ul>` : ''}
        <p class="preserve-lines">${escapeHtml(rev.instruction)}</p></section>`;
}
function isStudentOwner(item) {
    const nim=String(currentUser.nim ?? '').trim();
    return !!nim && String(item?.nim ?? '').trim()===nim;
}
function studentHomeAction(records = readStoredJSON(sessionStorage, 'ipcos_registrations', [])) {
    const mine = records.filter(isStudentOwner);
    const status = item => String(item.status || '').trim().toLowerCase();
    const active = mine.filter(item => ['revision','resubmitted','pending'].includes(status(item)))
        .sort((a,b) => ({revision:0,resubmitted:1,pending:2}[status(a)] - {revision:0,resubmitted:1,pending:2}[status(b)]) || displayDate(getCaseEventTime(a)) - displayDate(getCaseEventTime(b)));
    const revision = active.find(item => status(item) === 'revision');
    if (revision) return {kind:'revision', id:String(revision.id), label:uxText('Lanjutkan Revisi','Continue Corrections')};
    const draft = readStoredJSON(sessionStorage, 'ipcos_form_draft', {});
    const type = draft['reg-jenis-utama'] || draft.jenis;
    if (draft.ownerNim === currentUser.nim && SERVICE_TYPES.includes(type) && !active.some(item => item.jenis === type))
        return {kind:'draft', label:uxText('Lanjutkan Draf','Continue Draft')};
    if (active.length) return {kind:'case', id:String(active[0].id), label:uxText('Lihat Pengajuan','View Request')};
    return {kind:'new', label:uxText('Buat Pengajuan','New Request')};
}
function continueStudentHome() {
    if (currentUser.role !== 'mhs' || !getSessionToken()) return false;
    // Keep any open case editor or submission intact; the home button is inert
    // behind that modal, and programmatic callers must respect the same state.
    if (caseEditorDirty() || isPreparingCorrection || activeUpdateIds.has(selectedCaseId)) return false;
    const action = studentHomeAction();
    if (action.kind === 'new' || action.kind === 'draft') return switchTab(null, 'pendaftaran');
    if (!switchTab(null, 'student-status')) return false;
    const origin = [...document.querySelectorAll('#student-status [data-case-id]')].find(button => String(button.dataset.caseId) === action.id && !button.disabled && button.getClientRects().length);
    origin?.focus({preventScroll:true});
    openCaseDetail(action.id);
    const modal = document.getElementById('modal-case-detail');
    if (selectedCaseId !== action.id || modal.style.display !== 'flex') return false;
    if (action.kind === 'revision') caseDetailAction('reply');
    return true;
}
function studentRequestTitle(item) {
    const source=String(item.detail || '').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|div|li)>/gi,'\n');
    const doc = new DOMParser().parseFromString(source, 'text/html');
    return doc.body.textContent.replace(/^\s*(?:Judul|Title)\s*:\s*/i, '').trim();
}
function studentProgressHtml(item) {
    const status = String(item.status || '').trim().toLowerCase();
    const complete = status === 'accepted', correction = status === 'revision';
    const current = complete ? 2 : 1;
    const steps = [uxText('Terkirim','Submitted'), correction ? uxText('Perlu perbaikan','Corrections needed') : uxText('Pemeriksaan','Review'), uxText('Selesai','Completed')];
    return `<ol class="student-request-progress" aria-label="${uxText('Tahap pengajuan','Request stage')}">${steps.map((step,index)=>`<li class="${index < current || complete ? 'is-complete' : index === current ? 'is-current' : ''}" ${index === current ? 'aria-current="step"' : ''}><span aria-hidden="true">${index < current || complete ? '✓' : index + 1}</span>${step}</li>`).join('')}</ol>`;
}
function renderStudentHome(home, records) {
    const state = item => String(item.status || '').trim().toLowerCase();
    const rank = item => ({revision:0,resubmitted:1,pending:2,accepted:3}[state(item)] ?? 4);
    const sorted = records.slice().sort((a,b)=>rank(a)-rank(b) || (state(a)==='accepted' ? -1 : 1)*(displayDate(getCaseEventTime(a))-displayDate(getCaseEventTime(b))));
    const action = studentHomeAction(records), focus = records.find(item=>String(item.id) === action.id);
    const revisions = records.filter(item=>state(item)==='revision').length;
    const waiting = records.filter(item=>['pending','resubmitted'].includes(state(item))).length;
    const completed = records.filter(item=>state(item)==='accepted').length;
    const heading = action.kind==='revision' ? uxText('Ada perbaikan untuk Anda','Your corrections are needed') : action.kind==='draft' ? uxText('Draf Anda siap dilanjutkan','Your draft is ready to continue') : action.kind==='case' ? uxText('Pengajuan Anda sedang diperiksa','Your request is under review') : uxText('Siap untuk langkah berikutnya?','Ready for your next step?');
    const description = focus ? caseNextStep(focus) : action.kind==='draft' ? uxText('Lanjutkan isian yang tersimpan, lalu periksa kembali sebelum mengirim.','Continue your saved details, then review them before submitting.') : uxText('Pilih layanan akademik dan siapkan berkas sebelum mengirim pengajuan.','Choose an academic service and prepare your files before submitting a request.');
    home.classList.add('student-dashboard');
    home.innerHTML = `<section class="student-next-step" aria-labelledby="student-next-title"><div class="student-next-copy"><span class="student-eyebrow">${uxText('LANGKAH BERIKUTNYA','YOUR NEXT STEP')}</span><h2 id="student-next-title">${heading}</h2>${focus ? `<p class="student-focus-service">${escapeHtml(systemText(focus.jenis))}</p>` : ''}<p>${escapeHtml(description)}</p><button type="button" class="btn-primary" data-student-home-action onclick="continueStudentHome()">${action.label}<span aria-hidden="true"> →</span></button></div><div class="student-next-context">${focus ? studentProgressHtml(focus) : `<strong>${uxText('Satu tempat untuk progres Anda','One place for your progress')}</strong><p>${uxText('Pengajuan, berkas, dan catatan admin tetap terhubung.','Your requests, files, and admin notes stay connected.')}</p>`}</div></section>
    <dl class="student-overview" aria-label="${uxText('Ringkasan pengajuan','Request overview')}">${[[revisions,uxText('Perlu perbaikan','Needs corrections')],[waiting,uxText('Dalam pemeriksaan','Under review')],[completed,uxText('Selesai diverifikasi','Verified')]].map(([count,label])=>`<div><dt>${label}</dt><dd>${count}</dd></div>`).join('')}</dl>
    <div class="student-section-heading"><h2>${uxText('Pengajuan Anda','Your requests')}</h2><button type="button" class="task-history" onclick="switchTab(null,'student-status')">${uxText('Lihat Semua','View All')} (${records.length})</button></div>
    <div class="task-home-list">${sorted.length ? sorted.slice(0,3).map(item=>`<article class="task-card student-request-card"><div><p class="student-request-date">${escapeHtml(formatDate(getCaseEventTime(item)))}</p><h3>${escapeHtml(systemText(item.jenis))}</h3>${studentRequestTitle(item) ? `<p class="student-request-title">${escapeHtml(studentRequestTitle(item))}</p>` : ''}${window.IPCOSReview?.statusHtml(item,{compact:true}) || getStatusBadge(item.status)}</div><button type="button" class="btn-secondary" data-case-id="${escapeHtml(item.id)}">${state(item)==='revision' ? uxText('Lihat Perbaikan','View Corrections') : state(item)==='accepted' ? uxText('Lihat Hasil','View Result') : uxText('Detail Pengajuan','Request Details')}</button></article>`).join('') : `<div class="student-empty"><h3>${uxText('Belum ada pengajuan','No requests yet')}</h3><p>${uxText('Pengajuan yang Anda kirim akan tampil di sini, bersama status dan tindak lanjutnya.','Your submitted requests will appear here with their status and next steps.')}</p></div>`}</div>
    <nav class="student-shortcuts" aria-label="${uxText('Akses cepat akademik','Academic shortcuts')}"><button type="button" class="btn-secondary" onclick="switchTab(null,'pendaftaran')">${uxText('Pusat Pendaftaran','Submit a Request')}</button><button type="button" class="btn-secondary" onclick="switchTab(null,'academic-journey')">${uxText('Perjalanan Akademik','Academic Journey')}</button><button type="button" class="btn-secondary" onclick="switchTab(null,'sop-magang')">${uxText('Panduan & Persyaratan','Guidance & Requirements')}</button></nav>`;
}
function renderTaskHome() {
    renderAcademicJourney();
    const home = document.getElementById('task-home');
    if (!home) return;
    home.classList.remove('student-dashboard');
    if (!['admin','mhs'].includes(currentUser.role)) { home.innerHTML = ''; return; }
    const all = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    const admin = currentUser.role === 'admin';
    const records = admin ? all : all.filter(isStudentOwner);
    if (!admin) { renderStudentHome(home, records); return; }
    const priority = item => { const status = String(item.status).toLowerCase(); return admin ? ({resubmitted:0,pending:1,revision:2,accepted:3}[status] ?? 4) : ({revision:0,resubmitted:1,pending:2,accepted:3}[status] ?? 4); };
    const actionable = records.filter(item => admin ? ['pending','resubmitted'].includes(String(item.status).toLowerCase()) : String(item.status).toLowerCase() !== 'accepted');
    actionable.sort((a,b) => priority(a)-priority(b) || displayDate(getCaseEventTime(a))-displayDate(getCaseEventTime(b)));
    const visibleCases = actionable.length ? actionable.slice(0,3) : records.slice().sort((a,b) => displayDate(getCaseEventTime(b))-displayDate(getCaseEventTime(a))).slice(0,1);
    const revisions = records.filter(item => String(item.status).toLowerCase() === 'revision').length;
    const primaryAction = admin ? null : studentHomeAction(records);
    const title = admin ? uxText('Antrean kerja Anda', 'Your review queue') : uxText('Pengajuan Anda', 'Your requests');
    const subtitle = admin ? actionable.length ? `${actionable.length} ${uxText('pengajuan perlu ditinjau.', actionable.length === 1 ? 'request needs review.' : 'requests need review.')}` : uxText('Lihat riwayat atau buka antrean pengajuan.', 'View request history or open the review queue.')
        : revisions ? `${revisions} ${uxText('pengajuan membutuhkan perbaikan Anda.', revisions === 1 ? 'request needs your corrections.' : 'requests need your corrections.')}` : uxText('Lihat langkah berikutnya atau mulai pengajuan baru.', 'See your next step or start a new request.');
    home.innerHTML = `<div class="task-home-header"><div><h2>${title}</h2><p>${subtitle}</p></div>
        <button type="button" class="btn-primary" ${admin ? '' : 'data-student-home-action'} onclick="${admin ? "switchTab(null, 'admin-data');setAdminQueueFilter('ACTION_REQUIRED')" : 'continueStudentHome()'}">${admin ? uxText('Buka Antrean', 'Open Queue') : primaryAction.label}</button></div>
        <div class="task-home-list">${(admin ? actionable.length : visibleCases.length) ? visibleCases.map(item => `<article class="task-card"><div><h3>${escapeHtml(systemText(item.jenis))}</h3>${admin ? `<p>${escapeHtml(item.nama)} · ${escapeHtml(item.nim)}</p>` : ''}${window.IPCOSReview?.statusHtml(item,{compact:true}) || getStatusBadge(item.status)+`<p>${escapeHtml(caseNextStep(item))}</p>`}</div>
        <button type="button" class="btn-secondary" data-case-id="${escapeHtml(item.id)}">${admin ? uxText('Periksa Pengajuan','Review Request') : primaryAction.id === String(item.id) ? uxText('Detail Pengajuan','Request Details') : String(item.status).toLowerCase() === 'revision' ? uxText('Lanjutkan Perbaikan','Continue Corrections') : String(item.status).toLowerCase() === 'accepted' ? uxText('Lihat Hasil','View Result') : uxText('Lihat Pengajuan','View Request')}</button></article>`).join('')
        : `<div class="task-empty">${admin ? uxText('Semua pengajuan sudah ditindaklanjuti.', 'All requests have been addressed.') : records.length ? uxText('Pengajuan Anda sudah selesai diverifikasi.', 'Your requests have been verified.') : uxText('Belum ada pengajuan. Mulai dengan memilih jenis pendaftaran.', 'No requests yet. Start by choosing a request type.')}</div>`}</div>
        <div class="task-home-footer"><button type="button" class="task-history" onclick="switchTab(null, '${admin ? 'admin-data' : 'student-status'}')${admin ? ";setAdminQueueFilter('ALL')" : ''}">${uxText('Lihat Semua Pengajuan', 'View All Requests')} (${records.length})</button>${admin ? '' : `<button type="button" class="btn-secondary" onclick="switchTab(null,'academic-journey')">${uxText('Buka Perjalanan Akademik', 'Open Academic Journey')}</button>`}</div>`;
}
function studentFileReviewHtml(item, url) {
    if (currentUser.role !== 'mhs') return '';
    let logs=[]; try { logs=JSON.parse(item.note || '[]'); } catch (_) {}
    const reviews=Array.isArray(logs) ? logs.slice().reverse().find(log=>['document_review','request_type_change'].includes(log.kind))?.reviews || [] : [];
    const review=reviews.find(review=>review.url===url);
    if (!review) return '';
    const label=review.status==='revision' ? uxText('Perlu Perbaikan','Needs Corrections') : review.status==='accepted' ? uxText('Sudah Sesuai','Meets Requirements') : uxText('Belum Diperiksa','Not Reviewed');
    return `<div class="student-file-review ${review.status==='revision'?'needs-correction':''}"><strong>${label}</strong>${review.note ? `<p class="preserve-lines">${escapeHtml(review.note)}</p>` : ''}</div>`;
}
function caseFileListHtml(item) {
    const files = getCaseFiles(item);
    let logs=[]; try { logs=JSON.parse(item.note || '[]'); } catch (_) {}
    const metadata=Array.isArray(logs)?logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]):[];
    const rows=files.map((file,index)=>{const doc=metadata.slice().reverse().find(doc=>doc.url===file.url); return {...file,index,document:doc};});
    const latest=new Map(); rows.filter(row=>row.document).forEach(row=>{const old=latest.get(row.document.label); if(!old || Number(row.document.version)>Number(old.document.version)) latest.set(row.document.label,row);});
    const html=row=>`<div class="case-file-row"><div><strong>${escapeHtml(documentText(row.document?.label || row.label))}</strong>${row.document?`<small class="document-version">${uxText('Versi','Version')} ${Number(row.document.version)} · ${escapeHtml(row.document.fileName)}</small>`:''}</div><div class="button-row"><button type="button" class="btn-secondary" data-preview-index="${row.index}">${uxText('Pratinjau','Preview')}</button>${row.document&&latest.get(row.document.label)===row&&comparableCaseFiles(item,row.document.label).length>1?`<button type="button" class="btn-secondary" data-compare-label="${escapeHtml(row.document.label)}">${uxText('Bandingkan Revisi','Compare Revisions')}</button>`:''}${isPrivateDriveUrl(row.url)?`<button type="button" class="btn-secondary" data-document-index="${row.index}">${systemText('Unduh Berkas')}</button>`:`<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${uxText('Buka Berkas','Open File')}</a>`}</div>${studentFileReviewHtml(item,row.url)}</div>`;
    const current=rows.filter(row=>row.document && latest.get(row.document.label)===row);
    const old=rows.filter(row=>!current.includes(row));
    if(!current.length) return files.length?`<p class="field-helper">${systemText('Berkas lama belum memiliki penanda versi. Periksa tanggal dan nama berkas sebelum meninjau.')}</p>`+rows.map(html).join(''):uxText('Belum ada berkas.','No files available.');
    return `<h4>${systemText('Versi terbaru')}</h4>`+current.map(html).join('')+(old.length?`<details class="case-history"><summary>${uxText('Versi sebelumnya dan berkas lama','Previous versions & older files')} (${old.length})</summary>`+old.map(html).join('')+'</details>':'');
}

function previewCaseFile(index,button=null) {
    const item = readStoredJSON(sessionStorage, 'ipcos_registrations', []).find(item => String(item.id) === selectedCaseId);
    const file = item && getCaseFiles(item)[index];
    if (!file) return;
    if (isPrivateDriveUrl(file.url)) return accessCaseDocument(index,true,button);
    clearCaseBlobUrls(true);
    const preview = document.getElementById('case-file-preview');
    preview.hidden = false;
    window.IPCOSDocuments?.reset(preview);
    const iframe = preview.querySelector('iframe');iframe.hidden=false;
    iframe.src = file.url.includes('drive.google.com') ? file.url.replace(/\/view.*$/, '/preview').replace(/\/edit.*$/, '/preview') : file.url;
    iframe.title = uxText('Pratinjau: ', 'Preview: ') + documentText(file.label);
    window.IPCOSReviewTools?.previewReady();
    preview.querySelector('p').textContent = uxText('Jika pratinjau tidak muncul, gunakan Buka Berkas di atas.', 'If the preview does not load, use Open File above.');
}
function supervisorOptions() {
    const dosens = readStoredJSON(sessionStorage, 'ipcos_dosens', []);
    return `<option value="">${uxText('-- Pilih dosen --','-- Select supervisor --')}</option>` + dosens.slice().sort((a,b) => String(a.Nama).localeCompare(String(b.Nama))).map(d => {
        const remaining = Number(d.Maksimal) - Number(d.Terpakai);
        return `<option value="${escapeHtml(d.Nama)}" ${remaining > 0 ? '' : 'disabled'}>${escapeHtml(d.Nama)} · ${remaining > 0 ? uxText('Sisa kuota: ', 'Available: ') + remaining : uxText('Penuh','Full')}</option>`;
    }).join('');
}
function currentCase() {
    const item = readStoredJSON(sessionStorage, 'ipcos_registrations', []).find(item => String(item.id) === selectedCaseId);
    if (!item || (currentUser.role === 'mhs' && !isStudentOwner(item))) return null;
    return item;
}
function caseDetailAction(action) {
    const item = currentCase();
    if (!item || activeUpdateIds.has(item.id)) return;
    const status = String(item.status).toLowerCase();
    if (currentUser.role === 'admin' ? !['pending','resubmitted'].includes(status) : currentUser.role !== 'mhs' || status !== 'revision' || action !== 'reply') return;
    const panel = document.getElementById('case-action-panel');
    if(!panel.hidden&&panel.dataset.action===action)return;
    if(!panel.hidden&&panel.dataset.dirty==='true'&&!confirmLeaveCase())return;
    window.IPCOSReview?.restoreActions();
    panel.dataset.action = action; panel.dataset.dirty = 'false';
    let html = '';
    if (action === 'revision') {
        const files = caseDocumentOptions(item);
        html = `<h3>${uxText('Minta perbaikan', 'Request Corrections')}</h3><fieldset class="revision-file-options"><legend>${uxText('Pilih berkas yang perlu diperbaiki', 'Select files needing corrections')}</legend>${files.map(label => `<label class="check-row"><input type="checkbox" name="revision-document" value="${escapeHtml(label)}"><span>${escapeHtml(systemText(label))}</span></label>`).join('')}<label class="check-row"><input type="checkbox" name="revision-document" value="Isian pengajuan"><span>${uxText('Isian pengajuan', 'Request details')}</span></label></fieldset>
        ${revisionTemplateHtml()}<label for="case-revision-note">${uxText('Apa yang harus diperbaiki?','What needs correcting?')}</label><textarea id="case-revision-note" rows="4" placeholder="${uxText('Contoh: Unggah transkrip yang sudah disahkan.','Example: Upload an officially certified transcript.')}"></textarea>`;
    } else if (action === 'dospem') {
        html = `<h3>${uxText('Tunjuk Dosen & Setujui', 'Assign Supervisor & Approve')}</h3><label for="case-supervisor">${uxText('Dosen pembimbing', 'Supervisor')}</label><select id="case-supervisor">${supervisorOptions()}</select><p>${uxText('Dosen terpilih akan dicatat saat pengajuan disetujui.','The selected supervisor will be recorded when this request is approved.')}</p>`;
    } else if (action === 'accept') {
        html = `<h3>${uxText('Setujui Pengajuan', 'Approve Request')}</h3><p>${uxText('Pastikan seluruh berkas sudah diperiksa. Persetujuan akan terlihat oleh mahasiswa.', 'Confirm all documents have been reviewed. The student will see your approval.')}</p>`;
    } else if (action === 'reply') {
        const rev = getRevisionInstructions(item);
        html = `<h3>${uxText('Kirim perbaikan Anda', 'Send Your Corrections')}</h3>${rev.files.length ? `<fieldset class="revision-file-options"><legend>${uxText('Konfirmasi yang sudah Anda perbaiki', 'Confirm Your Corrections')}</legend>${rev.files.map(label => `<label class="check-row"><input type="checkbox" name="correction-complete"><span>${escapeHtml(systemText(label))}</span></label>`).join('')}</fieldset>` : ''}
        <label for="case-reply-files">${uxText('Berkas perbaikan · maksimal 10 MB per berkas', 'Corrected files · maximum 10 MB per file')}</label><input type="file" id="case-reply-files" multiple accept="${item.jenis === 'Pendadaran' ? '.pdf,.zip,.rar' : '.pdf,.doc,.docx'}"><p class="field-helper">${uxText('Pilih hingga 5 berkas dengan total maksimal 20 MB. Berkas lama tetap ada dalam riwayat.', 'Choose up to 5 files, 20 MB total. Previous files remain in the history.')}</p><div id="case-reply-file-list"></div><label for="case-reply-note">${uxText('Jelaskan perbaikan Anda', 'Describe Your Corrections')}</label><textarea id="case-reply-note" rows="3"></textarea>`;
    }
    if (!html) return;
    panel.innerHTML = `${html}<p id="case-action-feedback" class="field-error" role="status"></p><div class="button-row"><button type="button" class="btn-secondary" onclick="cancelCaseAction()">${uxText('Batal','Cancel')}</button><button type="button" id="btn-case-submit" class="btn-primary" onclick="submitCaseAction()">${action === 'revision' ? uxText('Kirim Instruksi Revisi','Send Correction Request') : action === 'reply' ? uxText('Kirim Perbaikan','Send Corrections') : uxText('Konfirmasi Persetujuan','Confirm Approval')}</button></div>`;
    bindLanguageBlock(panel);
    panel.hidden = false;
    document.getElementById('case-detail-actions').hidden = true;
    const reply = document.getElementById('case-reply-files');
    if (reply) reply.addEventListener('change', () => {
        document.getElementById('case-reply-file-list').innerHTML = [...reply.files].map(file => `<p>${escapeHtml(file.name)} · ${formatFileSize(file.size)}${fileProblem(file, reply.accept) ? `<span class="field-error">${escapeHtml(fileProblem(file, reply.accept))}</span>` : ''}</p>`).join('');
    });
    window.IPCOSReviewTools?.prepareDecision(action);
    if(document.getElementById('modal-case-detail').classList.contains('has-document-preview')){document.getElementById('modal-case-detail').dataset.workspaceView='review';document.querySelector('#workspace-view-toggle button[data-workspace-view=review]')?.click();}
    (panel.querySelector('textarea, select, input') || panel.querySelector('button')).focus();
    if(action === 'reply') { window.IPCOSNext?.revisionFields(item,panel); window.IPCOSCorrections?.refresh(); }
    window.IPCOSReview?.actionsChanged();
}
function cancelCaseAction() {
    if (activeUpdateIds.has(selectedCaseId) || isPreparingCorrection) return;
    if (!confirmLeaveCase()) return;
    window.IPCOSReview?.restoreActions();
    document.getElementById('case-action-panel').dataset.dirty = 'false';
    document.getElementById('case-action-panel').hidden = true;
    window.IPCOSCorrections?.refresh();
    document.getElementById('case-detail-actions').hidden = false;
    window.IPCOSReview?.actionsChanged();
}
let isPreparingCorrection = false;
let isPreparingReviewDecision = false;
async function submitCaseAction() {
    const item = currentCase();
    if (!item || activeUpdateIds.has(item.id) || isPreparingCorrection || isPreparingReviewDecision) return;
    const panel = document.getElementById('case-action-panel');
    const action = panel.dataset.action;
    const feedback = document.getElementById('case-action-feedback');
    feedback.ipcosNotice=null;delete feedback.dataset.correctionNotice;
    const fail = (message,field=null) => { feedback.textContent = systemText(message); field?.focus(); return false; };
    const status = String(item.status).toLowerCase();
    if (currentUser.role === 'admin' ? !['pending','resubmitted'].includes(status) : currentUser.role !== 'mhs' || status !== 'revision' || action !== 'reply') { fail(uxText('Status berubah. Segarkan pengajuan.', 'The status changed. Refresh the request.')); return; }
    const reviewEpoch=sessionEpoch;isPreparingReviewDecision=true;
    try { if(window.IPCOSReviewTools && !await window.IPCOSReviewTools.beforeDecision(action))return; } catch(error) { if(!error.staleSession && reviewEpoch===sessionEpoch)fail(systemText(error.message)); return; } finally {if(reviewEpoch===sessionEpoch)isPreparingReviewDecision=false;}
    if(reviewEpoch!==sessionEpoch || selectedCaseId!==String(item.id))return;
    let note = '', newStatus = 'Accepted', files = [], dospem = null, correctionLabels = [], correctedFields=null;
    if (action === 'revision') {
        const selected = [...panel.querySelectorAll('[name="revision-document"]:checked')].map(input => input.value);
        const instruction = document.getElementById('case-revision-note').value.trim();
        if (!selected.length) return fail(uxText('Pilih minimal satu berkas atau isian yang perlu diperbaiki.', 'Select at least one file or field needing corrections.'),panel.querySelector('[name="revision-document"]'));
        if (!instruction) return fail(uxText('Tulis instruksi perbaikan untuk mahasiswa.', 'Write correction instructions for the student.'),document.getElementById('case-revision-note'));
        note = `Berkas yang perlu diperbaiki:\n${selected.map(label => '- ' + label).join('\n')}\n\nInstruksi:\n${instruction}`;
        newStatus = 'Revision';
    } else if (action === 'dospem') {
        dospem = document.getElementById('case-supervisor').value;
        if (!dospem) return fail(uxText('Pilih dosen pembimbing yang masih memiliki kuota.', 'Choose a supervisor with available capacity.'),document.getElementById('case-supervisor'));
        note = `Pengajuan disetujui. Dosen Pembimbing: ${dospem}. Silakan hubungi dosen untuk tahapan bimbingan berikutnya.`;
    } else if (action === 'accept') note = 'Berkas telah disetujui dan terverifikasi.';
    else if (action === 'reply') {
        const input = document.getElementById('case-reply-files');
        const chosen = [...input.files];
        note = document.getElementById('case-reply-note').value.trim();
        if ([...panel.querySelectorAll('[name="correction-complete"]')].some(input => !input.checked)) return fail(uxText('Konfirmasi semua poin perbaikan sebelum mengirim.', 'Confirm all requested corrections before sending.'));
        if(window.IPCOSNext?.wantsFields(item)) { try { correctedFields=window.IPCOSNext.correctionPayload(); } catch(error) { return fail(error.message); } }
        if ((!chosen.length && !correctedFields) || !note) return fail(uxText('Lengkapi perbaikan dan jelaskan perubahan Anda.', 'Complete your corrections and describe your changes.'));
        if (chosen.length > 5 || chosen.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) return fail(uxText('Kirim maksimal 5 berkas dengan total ukuran hingga 20 MB.', 'Send up to 5 files with a total size of 20 MB.'));
        const error = chosen.map(file => fileProblem(file, input.accept)).find(Boolean);
        if (error) return fail(error);
        newStatus = 'Resubmitted';
        files = chosen;
        try { correctionLabels = revisionFileLabels(files,item); } catch (error) { return fail(systemText(error.message)); }
    } else return;
    const button = document.getElementById('btn-case-submit');
    button.disabled = true; button.textContent = uxText('Sedang menyimpan...', 'Saving...');
    feedback.textContent = uxText('Tunggu sampai ada konfirmasi.','Wait for confirmation.');
    setSubmissionStage('case-action-feedback','preparing');
    isPreparingCorrection = true;
    if(action==='reply')window.IPCOSCorrections?.busy(true);
    window.IPCOSUploads?.refresh();
    window.IPCOSReview?.actionsChanged();
    const requestEpoch = sessionEpoch;
    try {
        if (action === 'reply') {
            const inspections = await Promise.all(files.map(inspectDocument));
            if (requestEpoch !== sessionEpoch) return;
            const problem = inspections.find(result=>result.error);
            if (problem) { setSubmissionStage('case-action-feedback','error'); fail(systemText(problem.error)); return; }
            if(window.IPCOSCorrections&&!window.IPCOSCorrections.review({files,labels:correctionLabels,note,correctedFields})){
                document.getElementById('case-action-feedback-steps')?.remove();
                feedback.dataset.correctionNotice='review';feedback.textContent=uxText('Periksa ringkasan, lalu pilih Konfirmasi & Kirim Perbaikan.','Review the summary, then select Confirm & Send Corrections.');return;
            }
        }
        const labels = correctionLabels;
        const payloadFiles = await Promise.all(files.map(async (file,index) => ({label:labels[index],fileName:file.name,mimeType:file.type,base64:await fileToBase64(file)})));
        if (requestEpoch !== sessionEpoch) return;
        // Escape user text before it enters the existing rich-text note history.
        setSubmissionStage('case-action-feedback','sending');
        const success = await sendUpdateRequest(item.id, newStatus, escapeHtml(note), payloadFiles, dospem, correctedFields);
        if (requestEpoch !== sessionEpoch) return;
        setSubmissionStage('case-action-feedback',success?'confirmed':'uncertain');
        if (success) panel.dataset.dirty='false';
        if(success&&currentUser.role==='admin')window.IPCOSAdminDrafts?.forget(item.id);
        if (success && selectedCaseId === String(item.id) && document.getElementById('modal-case-detail').style.display !== 'none') openCaseDetail(item.id);
        else if (!success && document.getElementById('case-action-feedback')) setProcessNotice('case-action-feedback','case-uncertain');
    } catch (error) { if (requestEpoch !== sessionEpoch) return; setSubmissionStage('case-action-feedback','error'); setProcessNotice('case-action-feedback','case-error',error.message); }
    finally {
        if (requestEpoch === sessionEpoch) { isPreparingCorrection = false; if(action==='reply')window.IPCOSCorrections?.busy(false); window.IPCOSUploads?.refresh(); }
        if (requestEpoch === sessionEpoch && button.isConnected) { button.disabled = false; button.textContent = action==='reply'&&window.IPCOSCorrections ? window.IPCOSCorrections.label() : uxText('Coba Simpan Lagi', 'Try Saving Again'); }
        if (requestEpoch === sessionEpoch) window.IPCOSReview?.actionsChanged();
    }
}

function toggleExamForm() {
    if (document.getElementById('reg-jenis-utama').value) {
        document.getElementById('form-submit-status').ipcosNotice=null;
        document.getElementById('form-submit-status').textContent='';
        document.getElementById('form-submit-status-steps')?.remove();
    }
    editRegistration();
    refreshServiceAvailability();
    renderRegistrationReadiness();
    const formContainer = document.getElementById('dynamic-exam-form');
    const jenisUjian = document.getElementById('reg-jenis-utama').value;
    const groupJudul = document.getElementById('group-judul');
    const inputJudul = document.getElementById('reg-judul');
    syncRegistrationFields();

    document.getElementById('req-outline-only').style.display = 'none';
    document.getElementById('req-sempro-only').style.display = 'none';
    document.getElementById('req-pendadaran').style.display = 'none';
    document.getElementById('req-jurnal-only').style.display = 'none';
    document.getElementById('req-ganti-dosen').style.display = 'none';
    document.getElementById('registration-supervisor-fields').style.display = 'none';

    if (jenisUjian === "") { formContainer.style.display = 'none';window.IPCOSRegistration?.refresh(); return; }
    formContainer.style.display = 'block';

    // Logika Khusus untuk Pergantian Pembimbing (Sembunyikan Judul)
    if (jenisUjian === "Pergantian Pembimbing") {
        groupJudul.style.display = 'none';
        inputJudul.removeAttribute('required');
        document.getElementById('req-ganti-dosen').style.display = 'block';
        document.getElementById('registration-supervisor-fields').style.display = 'block';
    } else {
        groupJudul.style.display = 'block';
        inputJudul.setAttribute('required', 'true');

        if (jenisUjian === "Outline") document.getElementById('req-outline-only').style.display = 'block';
        else if (jenisUjian === "Proposal") document.getElementById('req-sempro-only').style.display = 'block';
        else if (jenisUjian === "Pendadaran") document.getElementById('req-pendadaran').style.display = 'block';
        else if (jenisUjian === "Skripsi Jurnal") document.getElementById('req-jurnal-only').style.display = 'block';
    }
    window.IPCOSRegistration?.refresh();
}

async function submissionSignature(jenis, detail, files) {
    async function digest(text) {
        if (!window.crypto?.subtle) return notificationHash(text);
        const hash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,'0')).join('');
    }
    const fingerprints = [];
    for (const file of files) fingerprints.push([file.fileName, await digest(file.base64)]);
    return digest(JSON.stringify({jenis,detail,files:fingerprints}));
}

let isSubmittingRegistration = false;
let lastSubmittedCaseId = '';
let activeReceipt = null;
async function submitForm(e) {
    e.preventDefault();
    if (isSubmittingRegistration || preflightBusy) return;
    if (document.getElementById('registration-review').hidden || !validateRegistration()) { editRegistration(); return; }

    if (isOffline) {
        showToast(currentLang === 'id' ? "Tidak dapat mengirim form saat offline. Periksa koneksi Anda." : "Cannot submit form while offline. Check your connection.", "error");
        return;
    }

    const jenisUjian = document.getElementById('reg-jenis-utama').value;
    const requestEpoch = sessionEpoch;
    if (!jenisUjian) return;
    const dateStr = new Date().toISOString();
    let filesToUpload = [];
    let requestStarted = false;
    const submitButton = document.getElementById('btn-submit-registration');
    const submitStatus = document.getElementById('form-submit-status');
    isSubmittingRegistration = true;
    window.IPCOSRegistration?.refresh();
    document.getElementById('btn-edit-registration').disabled = true;
    submitButton.disabled = true;
    submitButton.textContent = systemText('Sedang mengirim...');
    setSubmissionStage('form-submit-status','preparing');
    setProcessNotice('form-submit-status','form-preparing');

    let finalDetail = `<b>Judul:</b> ${escapeHtml(document.getElementById('reg-judul').value.trim())}`;

    try {
        showLoader(currentLang === 'id' ? 'Menyiapkan Berkas...' : 'Preparing Files...');

        if (jenisUjian === "Outline") {
            const fTranskrip = document.getElementById('file-transkrip').files[0];
            const fProposal = document.getElementById('file-proposal').files[0];
            if (!fTranskrip || !fProposal) throw new Error(currentLang === 'id' ? "Mohon upload seluruh berkas!" : "Please upload all files!");
            filesToUpload.push({ label: 'Transkrip', fileName: fTranskrip.name, mimeType: fTranskrip.type, base64: await fileToBase64(fTranskrip) });
            filesToUpload.push({ label: 'Proposal', fileName: fProposal.name, mimeType: fProposal.type, base64: await fileToBase64(fProposal) });
        } else if (jenisUjian === "Proposal") {
            const fAcc = document.getElementById('file-acc-sempro').files[0];
            if (!fAcc) throw new Error(currentLang === 'id' ? "Mohon upload Bukti ACC!" : "Please upload Approval Proof!");
            filesToUpload.push({ label: 'Bukti ACC', fileName: fAcc.name, mimeType: fAcc.type, base64: await fileToBase64(fAcc) });
        } else if (jenisUjian === "Pendadaran") {
            const fPendadaran = document.getElementById('file-folder-pendadaran').files[0];
            if (!fPendadaran) throw new Error(currentLang === 'id' ? "Mohon upload berkas pendadaran!" : "Please upload defense documents!");
            filesToUpload.push({ label: 'Berkas Pendadaran', fileName: fPendadaran.name, mimeType: fPendadaran.type, base64: await fileToBase64(fPendadaran) });
        } else if (jenisUjian === "Skripsi Jurnal") {
            const fLoa = document.getElementById('file-loa-jurnal').files[0];
            const fDraftJurnal = document.getElementById('file-draft-jurnal').files[0];
            if (!fLoa || !fDraftJurnal) throw new Error(currentLang === 'id' ? "Mohon upload LoA dan Draft Jurnal!" : "Please upload LoA and Draft!");
            filesToUpload.push({ label: 'LoA Jurnal', fileName: fLoa.name, mimeType: fLoa.type, base64: await fileToBase64(fLoa) });
            filesToUpload.push({ label: 'Draft Jurnal', fileName: fDraftJurnal.name, mimeType: fDraftJurnal.type, base64: await fileToBase64(fDraftJurnal) });
        }
        else if (jenisUjian === "Pergantian Pembimbing") {
            const fSurat = document.getElementById('file-surat-ganti').files[0];
            const dLama = document.getElementById('reg-dosen-lama').value;
            const dBaru = document.getElementById('reg-dosen-baru').value;
            const kets = document.getElementById('reg-alasan-ganti').value;

            if (!fSurat) throw new Error(currentLang === 'id' ? "Mohon upload Surat Pengajuan!" : "Please upload Submission Letter!");
            if (!dLama || !dBaru || !kets) throw new Error(currentLang === 'id' ? "Semua field dosen dan alasan wajib diisi!" : "All fields are required!");
            if (dLama === dBaru) throw new Error(currentLang === 'id' ? "Dosen lama dan baru tidak boleh sama!" : "Old and new supervisor cannot be the same!");

            // KHUSUS PERGANTIAN DOSEN, JUDUL DIHILANGKAN DARI DETAIL
            finalDetail = `<b>Dosen Lama:</b> ${escapeHtml(dLama.trim())}<br><b>Dosen Baru:</b> ${escapeHtml(dBaru.trim())}<br><b>Alasan:</b> ${escapeHtml(kets.trim())}`;
            filesToUpload.push({ label: 'Surat Permohonan Ganti Dosen', fileName: fSurat.name, mimeType: fSurat.type, base64: await fileToBase64(fSurat) });
        }

        showLoader(currentLang === 'id' ? 'Mengunggah Data ke Server...' : 'Uploading to Server...');

        const signature = await submissionSignature(jenisUjian, finalDetail, filesToUpload);
        if (requestEpoch !== sessionEpoch) return;
        let pendingRequest = {};
        try { pendingRequest = JSON.parse(sessionStorage.getItem('ipcos_pending_submission') || '{}'); } catch (_) {}
        const requestId = pendingRequest.signature === signature && pendingRequest.id
            ? pendingRequest.id : (window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
        sessionStorage.setItem('ipcos_pending_submission', JSON.stringify({ signature, id: requestId }));
        let payload = {
            action: 'create', requestId, date: dateStr, nim: currentUser.nim, nama: currentUser.nama,
            jenis: jenisUjian, detail: finalDetail,
            files: filesToUpload
        };

        requestStarted = true;
        setSubmissionStage('form-submit-status','sending');
        const response = await apiPost(GAS_URL, {
            method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        const result = await readApiResult(response);

        if (result.status === "success") {
            window.IPCOSExperience?.feedback(uxText("Pendaftaran & Berkas berhasil dikirim!", "Registration & Files submitted successfully!"), "success");
            setSubmissionStage('form-submit-status','confirmed');
            lastSubmittedCaseId = result.id || '';
            sessionStorage.removeItem('ipcos_pending_submission');
            showSubmissionReceipt({ id: lastSubmittedCaseId, date: result.date || dateStr, jenis: jenisUjian, files: filesToUpload });
            setProcessNotice('form-submit-status','form-confirmed');
            clearFormDraft();
            document.getElementById('reg-jenis-utama').value = "";
            document.querySelectorAll('.dz-file-name').forEach(el => el.innerText = "");
            isSubmittingRegistration = false;
            toggleExamForm(); document.getElementById('dynamic-exam-form').reset();
            document.querySelectorAll('#registration-fields [id$="-badge"]').forEach(el => { el.textContent = ''; });
            document.querySelectorAll('#registration-fields input, #registration-fields textarea').forEach(el => setFieldError(el.id, ''));
            await syncDatabase();
        } else if (result.status === 'duplicate' && result.id) {
            await syncDatabase();
            if (requestEpoch !== sessionEpoch) return;
            openCaseDetail(result.id);
            refreshServiceAvailability();
            if (submitStatus) submitStatus.textContent = result.message;
        } else {
            throw new Error(result.message || (currentLang === 'id' ? "Gagal menyimpan berkas." : "Failed to save files."));
        }
    } catch (err) {
        if (err.staleSession || requestEpoch !== sessionEpoch) return;
        setSubmissionStage('form-submit-status',requestStarted?'uncertain':'error');
        showToast(err.message, "error");
        setProcessNotice('form-submit-status',requestStarted?'form-uncertain':'form-error',err.message);
    } finally {
        if (requestEpoch === sessionEpoch) {
        isSubmittingRegistration = false;
        submitButton.disabled = false;
        submitButton.textContent = uxText('Konfirmasi & Kirim', 'Confirm & Send');
        const editButton = document.getElementById('btn-edit-registration');
        if (editButton) editButton.disabled = false;
        window.IPCOSRegistration?.refresh();
        hideLoader();
        }
    }
}

function showSubmissionReceipt(receipt) {
    activeReceipt = receipt;
    window.IPCOSPolish?.receipt(receipt);
    const content = document.getElementById('submission-receipt-content');
    content.innerHTML = `<p>${uxText('Data dan berkas sudah diterima sistem. Simpan ringkasan ini untuk pengecekan.', 'Your data and files have been received. Keep this summary for reference.')}</p>
        <dl class="receipt-list"><dt>${systemText('Nomor pengajuan')}</dt><dd>${escapeHtml(receipt.id)}</dd>
        <dt>${systemText('Jenis')}</dt><dd>${escapeHtml(systemText(receipt.jenis))}</dd>
        <dt>${systemText('Waktu kirim')}</dt><dd>${escapeHtml(formatDateTime(receipt.date).replace(/<[^>]*>/g, ' '))}</dd>
        <dt>${systemText('Berkas')}</dt><dd>${receipt.files.map(f => escapeHtml(f.fileName)).join('<br>') || '-'}</dd>
        <dt>${systemText('Status awal')}</dt><dd>${systemText('Menunggu admin')}</dd></dl><button type="button" class="btn-secondary" data-receipt-id="${escapeHtml(receipt.id)}">${systemText('Unduh Bukti PDF')}</button>`;
    const modal = document.getElementById('modal-submission-receipt');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
}

function goToSubmittedCase() {
    closeModal('modal-submission-receipt');
    switchTab(null, 'student-status');
    if (lastSubmittedCaseId) openCaseDetail(lastSubmittedCaseId);
}

// ==========================================
// 7. GENERATOR GOOGLE CALENDAR (.ics)
// ==========================================
function academicCalendarDate(value) {
    const text = String(value ?? '').trim();
    const months = {jan:0,januari:0,january:0,feb:1,februari:1,february:1,mar:2,maret:2,march:2,apr:3,april:3,mei:4,may:4,jun:5,juni:5,june:5,jul:6,juli:6,july:6,agu:7,ags:7,agt:7,agustus:7,aug:7,august:7,sep:8,sept:8,september:8,okt:9,oktober:9,oct:9,october:9,nov:10,november:10,des:11,desember:11,dec:11,december:11};
    const localized = text.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timestamp=text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/i);
    let year,month,day;
    if(timestamp){
        const [y,m,d,h,min,sec]=timestamp.slice(1,7).map(Number),offset=timestamp[7];
        const civil=new Date(Date.UTC(y,m-1,d));
        if(civil.getUTCFullYear()!==y||civil.getUTCMonth()!==m-1||civil.getUTCDate()!==d||h>23||min>59||(timestamp[6]&&sec>59)||(/^[-+]/.test(offset)&&(Number(offset.slice(1,3))>23||Number(offset.slice(4))>59)))return null;
        const instant=new Date(text);if(!Number.isFinite(instant.getTime()))return null;
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
        const part=type=>Number(parts.find(item=>item.type===type)?.value);year=part('year');month=part('month')-1;day=part('day');
    }
    else if (localized) { day=Number(localized[1]);month=months[localized[2].toLowerCase()];year=Number(localized[3]); }
    else if (iso) { year=Number(iso[1]);month=Number(iso[2])-1;day=Number(iso[3]); }
    else return null;
    if (month === undefined || year < 1900 || year > 2200) return null;
    const date = new Date(Date.UTC(year,month,day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}
function downloadICS(title, dateStr, options = {}) {
    const date = academicCalendarDate(dateStr);
    if (!date) { showToast(uxText('Format tanggal tidak valid untuk diekspor', 'Invalid date format for export'), 'error'); return; }
    const compact = date => date.toISOString().slice(0,10).replaceAll('-','');
    const instant = date => date.toISOString().replace(/-|:|\.\d+/g,'').slice(0,15)+'Z';
    const nextDay = new Date(date.getTime()+86400000);
    const alarmDays=Number(options.alarmDays ?? 1);
    if(!Number.isInteger(alarmDays)||alarmDays<0||alarmDays>365){showToast(uxText('Pilihan pengingat tidak valid.','Invalid reminder choice.'),'error');return;}
    const alarmTime=date.getTime()+2*3600000-alarmDays*86400000;
    const alarmAvailable=options.service?alarmDays>0:alarmDays>0&&alarmTime>Date.now();
    const escapeCalendar = value => String(value).replaceAll('\\','\\\\').replace(/\r?\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');
    let identifier=2166136261;for(const char of String(options.uid || JSON.stringify([!!options.service,title,compact(date)]))){identifier^=char.charCodeAt(0);identifier=Math.imul(identifier,16777619);}
    const event = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//IPCOS UMY//Academic Calendar//EN','BEGIN:VEVENT',
        'UID:'+(identifier>>>0).toString(16)+'-'+compact(date)+'@ipcos.umy.ac.id',
        'DTSTAMP:'+instant(new Date()),
        ...(options.service ? ['DTSTART:'+compact(date)+'T165900Z','DTEND:'+compact(date)+'T170000Z'] : ['DTSTART;VALUE=DATE:'+compact(date),'DTEND;VALUE=DATE:'+compact(nextDay)]),
        'SUMMARY:'+escapeCalendar(options.service ? uxText('Batas Pengajuan - ', 'Submission deadline - ')+systemText(title) : uxText('Batas Pendaftaran Yudisium - ', 'Graduation clearance deadline - ')+contentText(title)),
        'DESCRIPTION:'+escapeCalendar(options.service ? uxText('Batas pengajuan layanan IPCOS UMY adalah pukul 23:59 WIB (UTC+7). Jadwal mengikuti pengaturan saat pengingat dibuat.','IPCOS UMY submission deadline is 23:59 WIB (UTC+7). The reminder follows the schedule at creation time.') : uxText('Batas pendaftaran Yudisium IPCOS UMY. Impor berkas ini ke aplikasi kalender Anda. Pengingat yang tersedia dijadwalkan pukul 09.00 WIB (UTC+7) sebelum batas tanggal. Jadwal mengikuti informasi portal saat berkas dibuat.', 'IPCOS UMY graduation clearance deadline. Import this file into your calendar app. Available reminders are scheduled at 09:00 WIB (UTC+7) before the deadline date. The schedule reflects portal information at export time.')),
        ...(alarmAvailable ? ['BEGIN:VALARM','ACTION:DISPLAY',options.service?'TRIGGER:-P'+alarmDays+'D':'TRIGGER;VALUE=DATE-TIME:'+instant(new Date(alarmTime)),'DESCRIPTION:'+escapeCalendar(options.service?uxText('Batas Pengajuan IPCOS · 23:59 WIB (UTC+7)','IPCOS Submission Deadline · 23:59 WIB (UTC+7)'):uxText('Pengingat Batas Yudisium IPCOS','IPCOS Graduation Clearance Reminder')),'END:VALARM'] : []),
        'END:VEVENT','END:VCALENDAR',''].map(line=>{let folded='',count=0;for(const char of line){const size=new TextEncoder().encode(char).length;if(count+size>73){folded+='\r\n ';count=1;}folded+=char;count+=size;}return folded;}).join('\r\n');
    const url = URL.createObjectURL(new Blob([event],{type:'text/calendar;charset=utf-8'}));
    const link = document.createElement('a');link.href=url;link.download='IPCOS-calendar-'+compact(date)+'.ics';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    showToast(!options.service&&alarmDays>0&&!alarmAvailable?uxText('Kalender diunduh. Waktu pengingat yang dipilih sudah lewat.','Calendar downloaded. The selected reminder time has already passed.'):uxText('Berkas Kalender berhasil diunduh! Impor ke aplikasi kalender Anda.', 'Calendar file downloaded! Import it into your calendar app.'),'success');
}

// ==========================================
// 8. EDITOR KONTEN DINAMIS
// ==========================================
const defaultMagang = [
    { title: "Tahap Persiapan (Pra-Magang)", items: [{ id: "m1", text: "Menyusun & Merealisasikan Proposal Magang", sub: "Bagi jalur Internasional (KBRI Kuala Lumpur), berkas wajib dikirim H-6 bulan." }] },
    { title: "Tahap Pelaksanaan (Selama Magang)", items: [{ id: "m2", text: "Mengisi Daily Log Book Secara Rutin", sub: "" }, { id: "m3", text: "Mematuhi Aturan Etika & Proteksi Kerahasiaan Lembaga", sub: "" }] },
    { title: "Tahap Pasca-Pelaksanaan & Pelaporan", items: [{ id: "m4", text: "Menyusun Laporan Akhir Magang", sub: "" }, { id: "m5", text: "Memvalidasi Lembar Pengesahan Resmi", sub: "" }, { id: "m6", text: "Mengumpulkan Form Penilaian Resmi", sub: "" }] }
];

const defaultSkripsi = [
    { title: "Fase I: Pengajuan Outline & DPS", items: [{ id: "s1", text: "Mengajukan Outline Proposal (Tgl 1-7 Awal Bulan)", sub: "" }, { id: "s2", text: "Mengambil Surat Kesanggupan DPS & Kartu Bimbingan", sub: "" }] },
    { title: "Fase II: Seminar Proposal", items: [{ id: "s3", text: "Bimbingan Proposal Minimal 5 Kali", sub: "" }, { id: "s4", text: "Mendaftar Seminar Proposal (Tgl 1-10)", sub: "" }] },
    { title: "Fase III: Ujian Akhir (Pendadaran)", items: [{ id: "s5", text: "Sertifikasi & Syarat Administrasi Lengkap", sub: "" }, { id: "s6", text: "Lolos Uji Turnitin (Similarity < 20%)", sub: "" }, { id: "s7", text: "Proofread Ke-1 (Pre-Pendadaran)", sub: "" }] },
    { title: "Fase IV: Yudisium & Wisuda", items: [{ id: "s8", text: "Proofread Ke-2 & Surat Bebas Pustaka", sub: "" }, { id: "s9", text: "Pemberkasan Map Merah Wisuda", sub: "" }] }
];

const defaultKurikulum = [
    { title: "Semester 1 & 2 (Tahun Pertama)", items: [{ id: "k1", text: "Semester 1", sub: "Kemanusiaan & Keimanan, Pancasila, Retorika, Pengantar Ilmu Komunikasi, Psikologi Komunikasi, Bahasa Inggris, Berfikir Kreatif, Komunikasi Massa." }, { id: "k2", text: "Semester 2", sub: "Teori Komunikasi, Komunikasi Interpersonal, Multikultur, Organisasi, Dasar AI, Bahasa Indonesia, Pengantar Periklanan, Pengantar PR, Ibadah Akhlak." }] },
    { title: "Semester 3 & 4 (Tahun Kedua)", items: [{ id: "k3", text: "Semester 3", sub: "Pengantar Jurnalistik, Sinematografi, TIK, Fotografi, Sosiologi Komunikasi, Perilaku Konsumen, Negosiasi, Metode Kuantitatif." }, { id: "k4", text: "Semester 4", sub: "IMC, Manajemen Stratejik, Kajian Media, Metode Kualitatif, Komunikasi Politik, Manajemen Isu & Krisis, Manajemen PR, Eksternal Relations." }] },
    { title: "Semester 5 & 6 (Tahun Ketiga)", items: [{ id: "k5", text: "Semester 5", sub: "Riset PR, Pemasaran Sosial, Cyber PR, Etika Profesi PR, CSR, Manajemen Konflik, Govt & Public Affair, Kewirausahaan, Kewarganegaraan." }, { id: "k6", text: "Semester 6", sub: "Manajemen Event, Penulisan PR, Produksi Media PR, Professional Image, Strategi & Taktik PR, Islam Sains & Teknologi, Kemuhammadiyahan." }] }
];

const defaultRemedial = [
    { title: "Alur Remidial", items: [{ id: "r1", text: "1. Pra-KRS & Bayar", sub: "Daftar di menu remidi dan bayar di Bank Gedung AR B. Wajib key-in kembali!" }, { id: "r2", text: "2. Penentuan Dosen", sub: "Prodi menetapkan dosen pengampu sesuai linearitas semester reguler." }, { id: "r3", text: "3. Bimbingan", sub: "Tatap muka 100 menit. 2 SKS = 2x pertemuan, 3 SKS = 3x pertemuan, dst." }, { id: "r4", text: "4. Uji Kompetensi", sub: "1 kali tes akhir untuk mengukur penguasaan materi dan nilai masuk KHS." }] }
];

const defaultKalender = [
    { title: "Periode I (Sep 2026)", items: [{ id: "c1", text: "20 Jul 2026", sub: "21 - 31 Jul 2026" }] },
    { title: "Periode II (Des 2026)", items: [{ id: "c2", text: "19 Okt 2026", sub: "20 - 30 Okt 2026" }] },
    { title: "Periode III (Apr 2027)", items: [{ id: "c3", text: "18 Jan 2027", sub: "19 - 29 Jan 2027" }] },
    { title: "Periode IV (Jun 2027)", items: [{ id: "c4", text: "19 Apr 2027", sub: "20 - 30 Apr 2027" }] }
];

const defaultTemplate = [
    { title: "Magang", titleEn: "Internship", items: [{ id: "t1", text: "Logbook Magang (.docx)", sub: "#" }] },
    { title: "Tugas Akhir", titleEn: "Final Project", items: [{ id: "t2", text: "Lembar Pengesahan Skripsi (.docx)", sub: "#" }] },
    { title: "Umum", titleEn: "General", items: [{ id: "t3", text: "Form Bebas Pustaka (.pdf)", sub: "#" }] }
];

const defaultFaq = [
    { title: "Berkas & Unggahan", titleEn: "Files & Uploads", items: [{ id: "f1", text: "Bagaimana jika file PDF saya lebih dari 10MB?", sub: "Ekspor ulang dokumen dengan ukuran PDF yang lebih kecil, pastikan teks tetap terbaca, lalu periksa kembali sebelum mengunggah." }] },
    { title: "Tugas Akhir", titleEn: "Final Project", items: [{ id: "f2", text: "Kapan batas waktu revisi proposal?", sub: "Batas revisi ujian proposal adalah 1 (satu) bulan setelah ujian dilaksanakan." }] }
];

const contentCacheFallback = new Map();
function cachePublishedContent(type, json) {
    try { localStorage.setItem(`ipcos_content_${type}`,json); contentCacheFallback.delete(type); return true; }
    catch (_) { contentCacheFallback.set(type,json); return false; }
}
function getChecklistData(type) {
    let localData = contentCacheFallback.get(type);
    if (!localData) { try { localData = localStorage.getItem(`ipcos_content_${type}`); } catch (_) {} }
    if (localData) {
        try { const groups = JSON.parse(localData); if (!Array.isArray(groups) || groups.some(group => !group || !Array.isArray(group.items))) throw new Error('Invalid content'); return groups; } catch (_) { contentCacheFallback.delete(type); try { localStorage.removeItem(`ipcos_content_${type}`); } catch (_) {} }
    }
    if (type === 'magang') return defaultMagang;
    if (type === 'skripsi') return defaultSkripsi;
    if (type === 'kurikulum') return defaultKurikulum;
    if (type === 'remidial') return defaultRemedial;
    if (type === 'kalender') return defaultKalender;
    if (type === 'template_berkas') return defaultTemplate;
    if (type === 'faq') return defaultFaq;
    return [];
}

function renderDynamicContent() {
    const types = typeof window !== 'undefined' && window.IPCOSPreparation ? [] : ['magang', 'skripsi'];

    types.forEach(type => {
        const containerId = (type === 'magang' || type === 'skripsi') ? `${type}-checklist-container` : `${type}-content-container`;
        const container = document.getElementById(containerId);
        if (!container) return;

        const data = displayChecklistData(type).map(group => ({
            title: escapeHtml(group.title),
            rawTitle: String(getChecklistData(type).find(original => original.items?.[0]?.id === group.items?.[0]?.id)?.title ?? group.title ?? ''),
            items: (group.items || []).map(item => ({
                id: String(item.id ?? '').replace(/[^a-zA-Z0-9_-]/g, ''),
                text: escapeHtml(item.text),
                rawText: String(getChecklistData(type).flatMap(group=>group.items || []).find(original=>original.id===item.id)?.text ?? item.text ?? ''),
                sub: type === 'template_berkas' ? escapeHtml(safeUrl(item.sub)) : escapeHtml(item.sub)
            }))
        }));
        let html = '';

        if (type === 'magang' || type === 'skripsi') {
            data.forEach(group => {
                html += `<section class="checklist-group academic-stage" data-stage-type="${type}"><div class="stage-heading"><h3 class="checklist-title">${group.title}</h3><span class="stage-progress"></span></div><p class="stage-next"></p>`;
                group.items.forEach(item => {
                    html += `<div class="checklist-item" onclick="toggleCheckFromRow(event, '${item.id}')">
                        <input type="checkbox" class="chk-${type} custom-checkbox" id="${item.id}" onchange="recordPreparationChange(this)">
                        <label for="${item.id}" onclick="event.stopPropagation();">
                            <span>${item.text}</span>
                            ${item.sub ? `<span class="sub-text">${item.sub}</span>` : ''}
                        </label>
                    </div>`;
                });
                html += stageServiceGuide(type, group.items) + `</section>`;
            });
        }
        else if (type === 'kurikulum') {
            data.forEach(group => {
                html += `<details><summary>${group.title}</summary><div class="details-content">`;
                group.items.forEach(item => {
                    html += `<p><b>${item.text}:</b> ${item.sub}</p>`;
                });
                html += `</div></details>`;
            });
        }
        else if (type === 'remidial') {
            html += `<table style="border:none;">`;
            data.forEach(group => {
                group.items.forEach(item => {
                    html += `<tr>
                        <td style="border:none; width: 30%;"><b style="color:var(--heading-color);">${item.text}</b></td>
                        <td style="border:none;">${item.sub}</td>
                    </tr>`;
                });
            });
            html += `</table>`;
        }
        else if (type === 'kalender') {
            data.forEach(group => {
                group.items.forEach(item => {
                    html += `<div class="cal-card">
                        <div>
                            <h4>${group.title}</h4>
                            <div class="cal-info-group">
                                <div class="cal-info-row">
                                    <span class="cal-info-label">${systemText('Batas Yudisium')}</span>
                                    <span class="deadline-tag">${item.text}</span>
                                </div>
                                <div class="cal-info-row">
                                    <span class="cal-info-label">${systemText('Daftar Wisuda')}</span>
                                    <span class="cal-info-value">${item.sub}</span>
                                </div>
                            </div>
                        </div>
                        <button class="btn-calendar lang" data-id="Tambahkan ke Kalender" data-en="Add to Calendar" onclick="downloadICS(${escapeHtml(JSON.stringify(group.rawTitle))}, ${escapeHtml(JSON.stringify(item.rawText))})">Tambahkan ke Kalender</button>
                    </div>`;
                });
            });
        }
        container.innerHTML = html;
    });

    window.IPCOSPreparation?.render();
    window.IPCOSResources?.render();
    window.IPCOSHelp?.render();
    window.IPCOSCalendar?.render();
    window.IPCOSReferences?.render();
    window.IPCOSSearch?.refresh();

    if (currentUser && currentUser.role === 'mhs') {
        loadProgressData();
    }
    renderAcademicStages();
}

// EDITOR KONTEN UI
let editorTempData = [];
let editorCurrentType = 'magang', contentSaving = false, contentEditorOriginal = '';
function contentEditorDirty(){return document.getElementById('modal-edit-content').style.display === 'flex' && JSON.stringify(editorTempData)!==contentEditorOriginal;}
window.addEventListener('ipcos:logout',()=>{editorTempData=[];contentSaving=false;contentEditorOriginal='';window.IPCOSContentStudio?.reset();document.getElementById('editor-ui-container').replaceChildren();closeModal('modal-edit-content',true);});

function openContentEditor(type, replaceDraft = false) {
    if(currentUser.role!=='admin'||contentSaving||!['magang','skripsi','kurikulum','remidial','kalender','template_berkas','faq'].includes(type))return;
    if(!replaceDraft&&contentEditorDirty()&&!confirm(uxText('Ganti konten dan tinggalkan perubahan yang belum disimpan?','Switch content and discard unsaved changes?')))return;
    editorCurrentType = type;
    editorTempData = JSON.parse(JSON.stringify(getChecklistData(type)));
    contentEditorOriginal=JSON.stringify(editorTempData);
    window.IPCOSContentStudio?.begin();

    const titles = {
        'magang': 'Edit Konten Magang',
        'skripsi': 'Edit Konten Skripsi',
        'kurikulum': 'Edit Konten Kurikulum',
        'remidial': 'Edit SOP Remidial',
        'kalender': 'Edit Kalender TA',
        'template_berkas': 'Edit Template & Link Download',
        'faq': 'Edit Pertanyaan & Jawaban FAQ'
    };
    document.getElementById('editor-modal-title').dataset.sourceTitle=titles[type];
    document.getElementById('editor-modal-title').innerText = systemText(titles[type]);
    renderEditorUI();

    const modal = document.getElementById('modal-edit-content');
    clearTimeout(modalCloseTimers.get('modal-edit-content'));modalCloseTimers.delete('modal-edit-content');
    modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

function refreshContentEditorLanguage(){
    if(document.getElementById('modal-edit-content').style.display!=='flex'||contentSaving)return;
    if(window.IPCOSContentStudio){window.IPCOSContentStudio.render();return;}
    const container=document.getElementById('editor-ui-container'),active=document.activeElement;
    const key=container.contains(active)?active.getAttribute('oninput')||active.getAttribute('onchange'):null;
    const selection=key?{start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection}:null;
    const expanded=[...container.querySelectorAll('details')].map(el=>el.open),scroll=container.closest('.content-editor-body').scrollTop;
    renderEditorUI();container.querySelectorAll('details').forEach((el,i)=>el.open=!!expanded[i]);
    document.getElementById('editor-modal-title').textContent=systemText(document.getElementById('editor-modal-title').dataset.sourceTitle||'Edit Konten');
    const replacement=key?[...container.querySelectorAll('input,textarea,select')].find(el=>(el.getAttribute('oninput')||el.getAttribute('onchange'))===key):null;
    if(replacement){replacement.focus({preventScroll:true});if(selection.start!==null&&selection.start!==undefined&&typeof replacement.setSelectionRange==='function')replacement.setSelectionRange(selection.start,selection.end,selection.direction);}
    container.closest('.content-editor-body').scrollTop=scroll;
}

function preparationEditorLinks(group, groupIndex, itemIndex = -1) {
    if (!['magang','skripsi'].includes(editorCurrentType)) return '';
    const scope = itemIndex < 0 ? 'group' : 'item', source = itemIndex < 0 ? group : group.items[itemIndex];
    const t = (id,en) => uxText(id,en);
    const label = itemIndex < 0 ? t('Hubungan fase dengan panduan & layanan','Phase guide and service links') : t('Panduan & tindakan untuk poin ini','Guides and actions for this item');
    const select = (field,title,options) => {
        const value = Object.prototype.hasOwnProperty.call(source,field) ? String(source[field]) : '__auto';
        if (!options.some(option => option[0] === value)) options.push([value,t('Nilai tersimpan belum tersedia: ','Saved value unavailable: ')+value]);
        const id = 'prep-editor-'+scope+'-'+groupIndex+'-'+itemIndex+'-'+field;
        return '<label for="'+id+'">'+title+'</label><select id="'+id+'" data-editor-preparation-scope="'+scope+'" data-editor-preparation-g="'+groupIndex+'" data-editor-preparation-i="'+itemIndex+'" data-editor-preparation-field="'+field+'" onchange="editPreparationMeta(\''+scope+'\','+groupIndex+','+itemIndex+',\''+field+'\',this.value)">'+options.map(([key,text])=>'<option value="'+escapeHtml(key)+'"'+(key===value?' selected':'')+'>'+escapeHtml(text)+'</option>').join('')+'</select>';
    };
    const services = [['__auto',itemIndex < 0 ? t('Gunakan hubungan bawaan (jika tersedia)','Use the default link (if available)') : t('Ikuti layanan fase','Use the phase service')],['',t('Tanpa layanan pengajuan','No request service')],...SERVICE_TYPES.map(service=>[service,systemText(service)])];
    const sopType = editorCurrentType === 'magang' ? 'sop_magang' : 'sop_tugas_akhir';
    const sections = window.IPCOSSop?.snapshot?.().find(doc=>doc.type===sopType)?.sections || [];
    const sopOptions = [['__auto',itemIndex < 0 ? t('Halaman utama SOP','SOP overview') : t('Ikuti bagian SOP fase','Use the phase SOP section')],['',t('Halaman utama SOP','SOP overview')],...sections.filter(section=>section&&typeof section.id==='string').map(section=>[section.id,currentLang==='en'&&section.titleEn?section.titleEn:section.title])];
    let html = '<details class="editor-translations preparation-editor-links"><summary>'+label+'</summary><div class="details-content">';
    html += select('service',t('Layanan pengajuan terkait','Related request service'),services);
    html += select('sopSectionId',t('Bagian SOP terkait','Related SOP section'),sopOptions);
    if (itemIndex >= 0) {
        const groups = getChecklistData('template_berkas'), items = (Array.isArray(groups)?groups:[]).flatMap(group=>Array.isArray(group?.items)?group.items:[]).filter(item=>item&&typeof item==='object');
        const counts = new Map();items.forEach(item=>{const id=String(item.id??'').trim();counts.set(id,(counts.get(id)||0)+1);});
        const templates = items.filter(item=>String(item.id??'').trim()&&counts.get(String(item.id).trim())===1).map(item=>[String(item.id).trim(),contentText(item.text,item.textEn)]);
        html += select('templateId',t('Template berkas terkait','Related document template'),[['__auto',t('Tidak ditautkan','No linked template')],...templates]);
    }
    return html+'<p class="form-helper">'+t('Hubungan ini membantu mahasiswa membuka panduan atau layanan yang tepat. Pilihan ini tidak mengubah status akademik.','These links help students open the right guide or service. They do not change academic status.')+'</p></div></details>';
}
function editPreparationMeta(scope,groupIndex,itemIndex,field,value) {
    if (currentUser.role!=='admin' || contentSaving || !['magang','skripsi'].includes(editorCurrentType) || !Number.isInteger(groupIndex) || !editorTempData[groupIndex]) return;
    const fields=scope==='group'?['service','sopSectionId']:scope==='item'?['service','sopSectionId','templateId']:[];
    const target=scope==='group'?editorTempData[groupIndex]:Number.isInteger(itemIndex)?editorTempData[groupIndex].items?.[itemIndex]:null;
    if (!target || !fields.includes(field)) return;
    if (value==='__auto') delete target[field];
    else if(field==='service' && value!=='' && !SERVICE_TYPES.includes(value)) return;
    else target[field]=String(value);
}

function renderEditorUI() {
    if(window.IPCOSContentStudio){window.IPCOSContentStudio.render();return;}
    const container = document.getElementById('editor-ui-container');
    let html = '';

    editorTempData.forEach((group, gIdx) => {
        html += `<div class="card" style="padding: 15px; margin-bottom: 15px; box-shadow:none; border:1px solid var(--item-border);">
            <div style="display:flex; justify-content:space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                <input type="text" value="${escapeHtml(group.title)}" oninput="editorTempData[${gIdx}].title = this.value" style="font-weight:bold; flex: 1; margin-bottom:0;" placeholder="${uxText('Judul Kategori Utama','Category title')}">
                <button class="action-btn btn-rev" onclick="removeContentGroup(${gIdx})">${uxText('Hapus Kategori','Delete category')}</button>
            </div>
            <label class="editor-translation-label">${uxText('Judul kategori dalam English (opsional)', 'Category title in English (optional)')}<input type="text" value="${escapeHtml(group.titleEn || '')}" oninput="editorTempData[${gIdx}].titleEn = this.value"></label>
            ${preparationEditorLinks(group,gIdx)}<div style="margin-left: 10px; border-left: 2px solid var(--item-border); padding-left: 10px;">`;

        group.items.forEach((item, iIdx) => {
            html += `<div style="display:flex; gap:8px; margin-bottom: 10px; align-items:center;">
                <div style="flex-grow:1;">
                    <input type="text" value="${escapeHtml(item.text)}" placeholder="${uxText('Data Utama','Main text')}" oninput="editorTempData[${gIdx}].items[${iIdx}].text = this.value" style="margin-bottom:5px; padding: 10px;">
                    <input type="text" value="${escapeHtml(item.sub)}" placeholder="${uxText('Deskripsi/Detail','Description / Details')}" oninput="editorTempData[${gIdx}].items[${iIdx}].sub = this.value" style="margin-bottom:0; padding: 10px; font-size:13px;">
                </div>
                <button class="action-btn btn-rev" onclick="removeContentItem(${gIdx}, ${iIdx})" style="height: 40px; padding: 0 12px;">X</button>
            </div><details class="editor-translations"><summary>${uxText('English untuk mahasiswa internasional (opsional)', 'English for international students (optional)')}</summary><div class="details-content"><label>${uxText('Teks English','English text')}<input type="text" value="${escapeHtml(item.textEn || '')}" oninput="editorTempData[${gIdx}].items[${iIdx}].textEn = this.value"></label>${editorCurrentType !== 'template_berkas' ? `<label>${uxText('Detail English','English details')}<textarea rows="2" oninput="editorTempData[${gIdx}].items[${iIdx}].subEn = this.value">${escapeHtml(item.subEn || '')}</textarea></label>` : ''}</div></details>${preparationEditorLinks(group,gIdx,iIdx)}`;
        });

        html += `<button class="action-btn btn-acc" onclick="addContentItem(${gIdx})" style="width:auto; margin-top:5px;">${uxText('+ Tambah Item','+ Add item')}</button>
            </div></div>`;
    });

    html += `<button class="btn-secondary" style="background:var(--umy-gold); color:black; width:100%; margin-top: 10px;" onclick="addContentGroup()">${uxText('+ Tambah Kategori Baru','+ Add category')}</button>`;

    container.innerHTML = html;
    bindLanguageBlock(container);
}

function canEditContent(){return currentUser.role==='admin'&&!!getSessionToken()&&!contentSaving&&document.getElementById('modal-edit-content').style.display==='flex';}
function addContentGroup() { if(!canEditContent())return;editorTempData.push({ title: uxText('Kategori Baru','New Category'), items: [] }); renderEditorUI();window.IPCOSContentStudio?.addedGroup();document.getElementById('studio-'+(editorTempData.length-1)+'--1-title')?.focus(); }
function removeContentGroup(gIdx) { if(!canEditContent()||!Number.isInteger(gIdx)||!editorTempData[gIdx])return;if (confirm(uxText('Hapus kategori ini beserta item di dalamnya?', 'Delete this category and all its items?'))) { editorTempData.splice(gIdx, 1); renderEditorUI(); } }
function addContentItem(gIdx) { if(!canEditContent()||!Number.isInteger(gIdx)||!editorTempData[gIdx])return;const ids=new Set(editorTempData.flatMap(group=>group.items.map(item=>String(item.id))));let id=Date.now().toString(36);while(ids.has(id))id+='x';editorTempData[gIdx].items.push({ id, text: "", sub: "" }); renderEditorUI();document.getElementById('studio-'+gIdx+'-'+(editorTempData[gIdx].items.length-1)+'-text')?.focus(); }
function removeContentItem(gIdx, iIdx) { if(!canEditContent()||!Number.isInteger(gIdx)||!Number.isInteger(iIdx)||!editorTempData[gIdx]?.items[iIdx])return;if(!confirm(uxText('Hapus item ini dari draf konten?','Delete this item from the content draft?')))return;editorTempData[gIdx].items.splice(iIdx, 1); renderEditorUI(); }

async function saveContentChanges() {
    if(!canEditContent())return;
    const epoch=sessionEpoch,type=editorCurrentType;
    const studio=window.IPCOSContentStudio;
    if(studio&&!studio.validate())return;
    if(JSON.stringify(getChecklistData(type))!==contentEditorOriginal){studio?.feedback('Konten terbit berubah sejak studio dibuka. Draf Anda tetap tersedia. Muat konten terbaru sebelum menerbitkan.','Published content has changed since the studio opened. Your draft is retained. Load the latest content before publishing.','conflict');return;}
    if (document.activeElement && document.activeElement.tagName === 'INPUT') { document.activeElement.blur(); }

    if (isOffline) {
        studio?.feedback('Anda sedang offline. Draf tetap tersedia; coba simpan setelah tersambung.','You are offline. Your draft is retained; try saving after reconnecting.');
        showToast(currentLang === 'id' ? "Anda sedang offline. Tidak dapat menyimpan." : "You are offline. Cannot save changes.", "error");
        return;
    }

    const jsonString = JSON.stringify(editorTempData);
    contentSaving=true;document.querySelectorAll('#modal-edit-content button,#modal-edit-content input,#modal-edit-content textarea,#modal-edit-content select').forEach(el=>el.disabled=true);
    studio?.update();

    if(!studio)showLoader(currentLang === 'id' ? 'Menyimpan & Mensinkronisasi...' : 'Saving & Syncing...');

    try {
        const payload = { action: 'update_content', type, content: jsonString };
        const res = await apiPost(GAS_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await readApiResult(res);

        if(epoch!==sessionEpoch)return;
        if (result.status === "success") {
            contentPublicationVersion++;
            const cached=cachePublishedContent(type,jsonString);
            contentEditorOriginal=jsonString;
            closeModal('modal-edit-content',true);
            showToast(cached?uxText('Konten berhasil diterbitkan untuk mahasiswa.','The content has been published for students.'):uxText('Konten sudah diterbitkan. Penyimpanan perangkat tidak tersedia; tampilan sesi ini sudah diperbarui.','Content published. Device storage is unavailable; this session’s view has been updated.'), "success");
            renderDynamicContent();
        } else {
            studio?.feedback('Konten belum diterbitkan. Draf tetap tersedia; coba simpan kembali.','Content was not published. Your draft is retained; try saving again.');
            showToast("Gagal tersimpan di database: " + result.message, "error");
        }
    } catch (e) {
        if(epoch===sessionEpoch){studio?.feedback('Konfirmasi penyimpanan belum diterima. Draf tetap tersedia; periksa koneksi dan coba kembali.','Save confirmation has not been received. Your draft is retained; check the connection and try again.');showToast(uxText("Terjadi kesalahan jaringan saat menyimpan.","A network error occurred while saving."), "error");}
    } finally {
        if(epoch===sessionEpoch){contentSaving=false;studio?.render();document.querySelectorAll('#modal-edit-content button,#modal-edit-content input,#modal-edit-content textarea,#modal-edit-content select').forEach(el=>{if(!el.matches('[data-studio-move],#studio-category-picker'))el.disabled=false;});if(!studio)hideLoader();}
    }
}

// ==========================================
// 9. PROGRESS BAR & CONFETTI
// ==========================================
let confettiAnimationId = null;

function triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        confettiAnimationId=null;
        canvas.style.display='none';
        return;
    }

    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particles = [];
    for (let i = 0; i < 150; i++) {
        particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height, r: Math.random() * 6 + 2, d: Math.random() * 100, color: ['#F4B324', '#00492C', '#8E2122', '#00ff88', '#FF8DA1'][Math.floor(Math.random() * 5)] });
    }

    let angle = 0; let timer = 0;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        angle += 0.01; timer++;

        for (let i = 0; i < 150; i++) {
            let p = particles[i];
            ctx.beginPath(); ctx.fillStyle = p.color; ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, true); ctx.fill();
            p.y += Math.cos(angle + p.d) + 1 + p.r / 2; p.x += Math.sin(angle);
        }

        if (timer < 250) {
            confettiAnimationId = requestAnimationFrame(draw);
        } else {
            canvas.style.display = 'none';
            confettiAnimationId = null;
        }
    }
    draw();
}

function updateProgress() {
    const chkMagang = document.querySelectorAll('.chk-magang');
    const checkedMagang = document.querySelectorAll('.chk-magang:checked');
    const pctMagang = chkMagang.length ? Math.round((checkedMagang.length / chkMagang.length) * 100) : 0;

    const barMagang = document.getElementById('bar-magang');
    const txtMagang = document.getElementById('text-pct-magang');
    if (barMagang) { barMagang.style.width = pctMagang + '%'; }
    if (txtMagang) { txtMagang.innerText = pctMagang + '%'; }

    const chkSkripsi = document.querySelectorAll('.chk-skripsi');
    const checkedSkripsi = document.querySelectorAll('.chk-skripsi:checked');
    const pctSkripsi = chkSkripsi.length ? Math.round((checkedSkripsi.length / chkSkripsi.length) * 100) : 0;

    const barSkripsi = document.getElementById('bar-skripsi');
    const txtSkripsi = document.getElementById('text-pct-skripsi');
    if (barSkripsi) { barSkripsi.style.width = pctSkripsi + '%'; }
    if (txtSkripsi) { txtSkripsi.innerText = pctSkripsi + '%'; }

    if (currentUser.role === 'mhs') {
        const state = {};
        chkMagang.forEach(el => state[el.id] = el.checked);
        chkSkripsi.forEach(el => state[el.id] = el.checked);
        if (!journeyCloud.supported) {
            journeyCloud.localChecks = state;
            try { localStorage.setItem(`progress_${currentUser.nim}`, JSON.stringify(state)); journeyCloud.localError = false; }
            catch (_) { journeyCloud.localError = true; }
        }
        updateChecklistReminder(chkMagang.length - checkedMagang.length, chkSkripsi.length - checkedSkripsi.length);
    }
    renderAcademicStages();
    renderAcademicJourney();
}

function updateChecklistReminder(unMagang, unSkripsi) {
    const reminderBox = document.getElementById('alert-checklist-reminder');
    const reminderText = document.getElementById('reminder-text-content');
    if (!reminderBox || !reminderText) return;

    if (unMagang === 0 && unSkripsi === 0) {
        reminderText.innerHTML = currentLang === 'id' ? 'Seluruh persiapan Magang dan Skripsi sudah Anda tandai lengkap. Status resmi ada di Perjalanan Akademik.' : 'You have marked all internship and thesis preparation complete. See Academic Journey for official status.';
        if (reminderBox.getAttribute('data-complete') !== 'true') { triggerConfetti(); reminderBox.setAttribute('data-complete', 'true'); }
    } else {
        reminderText.innerHTML = currentLang === 'id' ? `Masih ada <b>${unMagang}</b> tugas Magang & <b>${unSkripsi}</b> tahapan Skripsi yang belum dicentang.` : `You still have <b>${unMagang}</b> Internship & <b>${unSkripsi}</b> Thesis tasks unchecked.`;
        reminderBox.setAttribute('data-complete', 'false');
    }
    reminderBox.style.display = 'block';
}

function loadProgressData() {
    const state = journeyPreparationState();
    document.querySelectorAll('.chk-magang, .chk-skripsi').forEach(el => { el.checked = state[el.id] === true; });
    updateProgress();
}

function getStatusBadge(status) {
    const key = String(status || '').trim().toLowerCase();
    const labels = {
        accepted: ['Selesai', 'Completed'],
        revision: currentUser.role === 'admin' ? ['Menunggu mahasiswa', 'Awaiting student corrections'] : ['Perlu perbaikan Anda', 'Corrections needed'],
        resubmitted: ['Perbaikan menunggu admin', 'Corrections awaiting review'],
        pending: ['Menunggu admin', 'Awaiting admin review']
    };
    const normalized = key in labels ? key : 'pending';
    const [id,en] = labels[normalized];
    return `<span class="status-badge badge-${normalized} lang" data-id="${id}" data-en="${en}">${uxText(id,en)}</span>`;
}

// ==========================================
// 10. SISTEM PENERJEMAH BAHASA DYNAMIS
// ==========================================
let currentLang = (() => { try { return localStorage.getItem('ipcos_language') === 'en' ? 'en' : 'id'; } catch (_) { return 'id'; } })();

function toggleLanguage() {
    if (loginBusy || isSubmittingRegistration || isPreparingCorrection || activeUpdateIds.size) {
        showToast(uxText('Tunggu proses selesai sebelum mengganti bahasa.', 'Wait for the current operation to finish before changing language.'), 'error');
        return;
    }
    currentLang = currentLang === 'id' ? 'en' : 'id';
    try { localStorage.setItem('ipcos_language', currentLang); } catch (_) {}
    renderDynamicContent();
    applyDynamicLanguage();
    applyLanguageBlocks();
    document.querySelectorAll('.submission-steps[data-stage]').forEach(steps => setSubmissionStage(steps.id.replace(/-steps$/,''),steps.dataset.stage));
    document.querySelectorAll('#form-submit-status,#case-action-feedback').forEach(renderProcessNotice);
    window.IPCOSSop?.languageChanged();
    window.IPCOSAcademic?.languageChanged();
    window.IPCOSInternational?.languageChanged();
    refreshContentEditorLanguage();
    refreshServiceAvailability();
    document.querySelectorAll('#registration-fields .dz-remove-btn').forEach(button=>button.textContent=uxText('Hapus File','Remove file'));
    const draftStatus = document.getElementById('form-draft-status');
    if (!window.IPCOSNext && draftStatus.textContent) draftStatus.textContent = systemText('Draf isian tersimpan di tab ini.');
    if (currentUser.role === 'admin') { loadAdminData(); renderServiceSettings(); renderDashboardCharts(readStoredJSON(sessionStorage,'ipcos_registrations',[])); renderDosenTable(); renderMasterMahasiswa(readStoredJSON(sessionStorage,'ipcos_students',[])); if (latestBackup) renderBackupStatus(latestBackup); }
    else if (currentUser.role === 'mhs') { loadStudentStatus(); renderActivityTimeline(readStoredJSON(sessionStorage,'ipcos_registrations',[])); }
    renderNotifications();
    renderTaskHome();
    if (!document.getElementById('registration-review').hidden) renderRegistrationReview();
    document.querySelectorAll('#registration-fields [aria-invalid="true"]').forEach(input => setFieldError(input.id,input.type === 'file' ? fileProblem(input.files[0],input.accept) : registrationTextIssue(input.id)));
    if (activeReceipt && document.getElementById('modal-submission-receipt').style.display === 'flex') showSubmissionReceipt(activeReceipt);
    if (selectedCaseId && document.getElementById('modal-case-detail').style.display === 'flex') openCaseDetail(selectedCaseId,true);
    if (document.getElementById('modal-global-search').style.display === 'flex') renderSearchResults(document.getElementById('global-search-input').value);
    window.IPCOSNext?.refresh();
            window.IPCOSReviewTools?.renderArchives();
    window.IPCOSPolish?.refresh();
    window.IPCOSRegistration?.refresh();
    window.IPCOSCorrections?.refresh();
}

function applyDynamicLanguage() {
    applyStaticLanguage();
    refreshRegistrationFieldHints();
    refreshLoginErrors();
    syncThemeControl();
    if (currentUser.role) document.getElementById('display-greeting').textContent = uxText('Halo','Hello') + ', ' + currentUser.nama.split(' ')[0] + '!';
    renderSyncStatus();
    renderAcademicStages();
    renderRegistrationReadiness();
    document.querySelectorAll('.lang').forEach(el => {
        const text = el.getAttribute(`data-${currentLang}`);
        if (text && el.innerHTML !== text) {
            el.classList.remove('lang-animating');
            void el.offsetWidth;
            el.innerHTML = text;
            el.classList.add('lang-animating');
        }
    });
    window.IPCOSExperience?.refresh();
}

// ==========================================
// 11. LOAD TABEL MAHASISWA & CHAT TIMELINE
// ==========================================
let selectedCaseId = '';

function getCaseEventTime(item) {
    try {
        const logs = JSON.parse(item.note || '[]');
        const latest = Array.isArray(logs) ? logs[logs.length - 1] : null;
        return latest?.time || item.date || '';
    } catch (_) { return item.date || ''; }
}

function caseNextStep(item) {
    const status = String(item.status || '').trim().toLowerCase();
    if (status === 'accepted') return item.dospem ? uxText('Hubungi dosen pembimbing: ', 'Contact your supervisor: ') + item.dospem : uxText('Selesai diverifikasi. Lanjutkan tahapan akademik berikutnya.', 'Verified. Continue to the next academic stage.');
    if (status === 'revision') return currentUser.role === 'admin'
        ? uxText('Menunggu mahasiswa mengirim perbaikan.', 'Waiting for the student to submit corrections.')
        : uxText('Baca instruksi admin dan kirim berkas perbaikan di pengajuan ini.', 'Read the admin instructions and submit corrected files in this request.');
    if (status === 'resubmitted') return currentUser.role === 'admin'
        ? uxText('Perbaikan sudah masuk. Periksa berkas dan putuskan hasilnya.', 'Corrections received. Review the files and make a decision.')
        : uxText('Perbaikan sudah terkirim. Tunggu pemeriksaan admin.', 'Corrections submitted. Awaiting admin review.');
    return currentUser.role === 'admin'
        ? uxText('Periksa kelengkapan berkas, lalu terima atau minta perbaikan.', 'Check the documents, then approve or request corrections.')
        : uxText('Pengajuan sudah masuk. Tunggu pemeriksaan admin.', 'Request received. Awaiting admin review.');
}

function caseTimelineHtml(item) {
    let logs = [];
    try { logs = JSON.parse(item.note || '[]'); } catch (_) {
        if (item.note) logs = [{ sender: 'Sistem', time: item.date, message: item.note }];
    }
    if (!Array.isArray(logs) || !logs.length) return `<p>${uxText('Belum ada catatan.', 'No notes yet.')}</p>`;
    return logs.map(log => `<div class="case-timeline-item"><strong>${escapeHtml(log.sender === 'Sistem' || !log.sender ? uxText('Sistem','System') : log.sender)}</strong>
        <small>${escapeHtml(formatDateTime(log.time || item.date).replace(/<[^>]*>/g, ' '))}</small>
        <div class="preserve-lines">${localizedSystemNote(log.message || '')}</div>${window.IPCOSNext?.fieldHistory(log) || ''}${window.IPCOSReviewTools?.historyHtml(log) || ''}</div>`).join('');
}

function openCaseDetail(id, languageRefresh = false) {
    const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    const item = records.find(record => String(record.id) === String(id));
    if (!item || !['admin','mhs'].includes(currentUser.role) || (currentUser.role === 'mhs' && !isStudentOwner(item))) {
        showToast('Pengajuan belum tersedia. Coba segarkan data.', 'error');
        return false;
    }
    if (!languageRefresh && (String(id) !== selectedCaseId || caseEditorDirty()) && !confirmLeaveCase()) return false;
    if(!languageRefresh && currentUser.role==='mhs' && document.getElementById('student-status').classList.contains('active'))window.IPCOSStudentRequests?.reveal(id);
    const active=document.activeElement;
    const restoreFocus=languageRefresh && document.getElementById('modal-case-detail').contains(active) ? {node:active,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection,scroll:document.getElementById('case-detail-content').scrollTop} : null;
    window.IPCOSReview?.restoreActions();
    const savedDetailsOpen=languageRefresh?document.querySelector('.case-academic-details')?.open:undefined;
    const savedHistoryOpen=languageRefresh?[...document.querySelectorAll('#case-detail-content .case-history')].map(detail=>detail.open):[];
    const savedContextOpen=languageRefresh?document.querySelector('.admin-case-context')?.open:undefined;
    const savedPaneScroll = languageRefresh ? ['admin-document-navigation','admin-document-stage','admin-review-rail'].map(name => ({name, top:document.querySelector('#modal-case-detail .' + name)?.scrollTop || 0})) : [];
    const savedPanel = languageRefresh && document.getElementById('case-action-panel');
    const savedPreview = languageRefresh && document.getElementById('case-file-preview');
    const savedReviewTools = languageRefresh && document.getElementById('document-review-tools');
    const savedFeedback = languageRefresh && document.querySelector('#modal-case-detail .operation-feedback');
    if (!languageRefresh) document.getElementById('toast-container').replaceChildren();
    if (!languageRefresh) { clearCaseBlobUrls(); window.IPCOSDocuments?.clearLocal(); }
    selectedCaseId = String(item.id);
    const isAdmin = currentUser.role === 'admin';
    const status = String(item.status || '').trim().toLowerCase();
    let actions = '';
    if (isAdmin && ['pending', 'resubmitted'].includes(status)) {
        if (item.jenis === 'Outline' || item.jenis === 'Pergantian Pembimbing') {
            actions += `<button type="button" class="btn-primary" onclick="caseDetailAction('dospem')">${uxText('Tunjuk Dosen & Setujui','Assign Supervisor & Approve')}</button>`;
        } else actions += `<button type="button" class="btn-primary" onclick="caseDetailAction('accept')">${uxText('Setujui Pengajuan','Approve Request')}</button>`;
        actions += `<button type="button" class="btn-secondary" onclick="caseDetailAction('revision')">${systemText('Minta Revisi')}</button>`;
    } else if (!isAdmin && status === 'revision') {
        actions = `<button type="button" class="btn-primary" onclick="caseDetailAction('reply')">${systemText('Upload Perbaikan')}</button>`;
    }
    const content = document.getElementById('case-detail-content');
    const modal = document.getElementById('modal-case-detail');
    modal.classList.toggle('admin-review-mode', isAdmin);
    modal.classList.toggle('student-detail-mode', !isAdmin);
    document.getElementById('case-detail-title').textContent = isAdmin ? uxText('Pemeriksaan Pengajuan','Review Request') : uxText('Detail Pengajuan','Request Details');
    if (isAdmin && !languageRefresh) modal.dataset.workspaceView = 'documents';
    if (!languageRefresh) delete content.dataset.activeDocumentIndex;
    const previewHtml = `<div id="case-file-preview" hidden><iframe title="${uxText('Pratinjau berkas','Document preview')}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe><p class="field-helper"></p></div>`;
    const detailsHtml = `<details class="case-academic-details" ${isAdmin ? '' : 'open'}><summary>${uxText('Detail Pengajuan','Request Details')}</summary><div class="case-content-block">${localizedDetailHtml(item.detail)}${item.dospem ? `<p><strong>${uxText('Dosen Pembimbing:','Supervisor:')}</strong> ${escapeHtml(item.dospem)}</p>` : ''}</div></details>`;
    const historyHtml = `<details class="case-history"><summary>${uxText('Riwayat Pengajuan','Request History')}</summary><div class="case-timeline">${caseTimelineHtml(item)}</div></details>`;
    const stateHtml = window.IPCOSReview?.statusHtml(item) || getStatusBadge(item.status)+`<p>${escapeHtml(caseNextStep(item))}</p>`;
    const fileCount = getCaseFiles(item).length;
    content.innerHTML = isAdmin ? `<div class="case-workspace admin-review-workspace">
        <aside class="admin-document-navigation" aria-labelledby="admin-document-title"><div class="admin-pane-heading"><h3 id="admin-document-title">${uxText('Berkas Pengajuan','Request Documents')}</h3><p>${fileCount} ${uxText('berkas',fileCount === 1 ? 'file' : 'files')}</p></div><div class="case-content-block case-documents">${caseFileListHtml(item)}</div></aside>
        <section class="case-document-column admin-document-stage" aria-labelledby="admin-preview-title"><h3 id="admin-preview-title">${uxText('Pratinjau Dokumen','Document Preview')}</h3><div class="admin-preview-placeholder"><h4>${fileCount ? uxText('Pilih berkas untuk diperiksa','Choose a file to review') : uxText('Pengajuan ini belum memiliki berkas','This request has no files')}</h4><p>${fileCount ? uxText('Gunakan Pratinjau pada daftar berkas. Dokumen dan catatan pemeriksaan dapat dibuka berdampingan.','Select Preview in the file list. View the document alongside your review notes.') : uxText('Detail dan riwayat pengajuan tetap dapat diperiksa pada bagian Pemeriksaan.','You can still review the request details and history in Review.')}</p></div>${previewHtml}</section>
        <aside class="case-action-column admin-review-rail" aria-label="${uxText('Pemeriksaan dan tindakan pengajuan','Request review and actions')}">
        ${stateHtml}${status === 'revision' || status === 'resubmitted' ? revisionInstructionsHtml(item) : ''}
        <div id="case-detail-actions" class="case-detail-actions">${actions || `<p>${uxText('Tidak ada tindakan yang perlu dikirim saat ini.', 'No action is required at this time.')}</p>`}</div><div id="case-action-panel" hidden></div>
        <div class="admin-academic-tools">${window.IPCOSAcademic?.caseHtml(item)||''}</div>
        <details class="admin-case-context"><summary>${uxText('Informasi Pengajuan','Request Information')}</summary><dl class="receipt-list"><dt>${uxText('Dikirim','Submitted')}</dt><dd>${escapeHtml(formatDateTime(item.date).replace(/<[^>]*>/g, ' '))}</dd></dl>${detailsHtml}${historyHtml}<button type="button" class="text-link receipt-secondary" data-receipt-id="${escapeHtml(item.id)}">${systemText('Unduh Bukti PDF')}</button></details>
        <button type="button" class="text-link admin-journey-link" data-open-journey="${escapeHtml(item.nim)}">${uxText('Lihat Perjalanan Akademik', 'View Academic Journey')}</button></aside></div>`
        : `<section class="student-detail-overview" aria-label="${uxText('Status dan langkah berikutnya','Status and next step')}">${stateHtml}${studentProgressHtml(item)}<dl class="student-detail-meta"><div><dt>${uxText('Dikirim','Submitted')}</dt><dd>${escapeHtml(formatDateTime(item.date).replace(/<[^>]*>/g, ' '))}</dd></div><div><dt>${uxText('Terakhir diperbarui','Last updated')}</dt><dd>${escapeHtml(formatDateTime(getCaseEventTime(item)).replace(/<[^>]*>/g, ' '))}</dd></div></dl></section>
        <div class="case-workspace student-detail-workspace"><section class="case-document-column" aria-labelledby="student-files-title"><div class="student-section-heading"><h3 id="student-files-title">${uxText('Berkas Pengajuan','Request Documents')}</h3><span>${fileCount} ${uxText('berkas',fileCount === 1 ? 'file' : 'files')}</span></div><div class="case-content-block case-documents">${caseFileListHtml(item)}</div>${previewHtml}</section>
        <aside class="case-action-column" aria-label="${uxText('Tindak lanjut pengajuan','Request follow-up')}">${status === 'revision' || status === 'resubmitted' ? revisionInstructionsHtml(item) : ''}
        <div id="case-detail-actions" class="case-detail-actions">${actions || `<p class="student-no-action">${status==='accepted' ? uxText('Pengajuan ini sudah selesai diverifikasi.','This request has been verified.') : uxText('Belum ada berkas yang perlu Anda kirim ulang.','No files need to be resubmitted at this time.')}</p>`}</div><div id="case-action-panel" hidden></div>
        ${detailsHtml}${window.IPCOSAcademic?.caseHtml(item)||''}${historyHtml}
        <div class="student-detail-links"><button type="button" class="text-link receipt-secondary" data-receipt-id="${escapeHtml(item.id)}">${systemText('Unduh Bukti PDF')}</button><button type="button" class="text-link" data-open-journey="${escapeHtml(item.nim)}">${uxText('Lihat Perjalanan Akademik','View Academic Journey')}</button></div></aside></div>`;
    savedHistoryOpen.forEach((open,index)=>{const detail=content.querySelectorAll('.case-history')[index];if(detail)detail.open=open;});
    if(savedDetailsOpen!==undefined)content.querySelector('.case-academic-details').open=savedDetailsOpen;
    if(savedContextOpen!==undefined)content.querySelector('.admin-case-context').open=savedContextOpen;
    if (savedPanel) { content.querySelector('#case-action-panel').replaceWith(savedPanel); content.querySelector('#case-detail-actions').hidden = !savedPanel.hidden; }
    if (savedPreview) content.querySelector('#case-file-preview').replaceWith(savedPreview);
    if (savedReviewTools) content.querySelector('#case-action-panel').before(savedReviewTools);
    if (savedFeedback) content.appendChild(savedFeedback);
    content.querySelectorAll('[data-preview-index]').forEach(button => {
        const index=Number(button.dataset.previewIndex);
        if (languageRefresh && pendingCasePreview?.epoch===sessionEpoch && pendingCasePreview.id===selectedCaseId && pendingCasePreview.context===caseDocumentEpoch && getCaseFiles(item)[index]?.url===pendingCasePreview.url)
            markCasePreviewBusy(pendingCasePreview,button);
        if (isAdmin) button.setAttribute('aria-pressed', String(content.dataset.activeDocumentIndex === String(index)));
        button.closest('.case-file-row')?.classList.toggle('is-selected', isAdmin && content.dataset.activeDocumentIndex === String(index));
        button.addEventListener('click', () => {
            if (isAdmin) {
                content.dataset.activeDocumentIndex = String(index);
                content.querySelectorAll('[data-preview-index]').forEach(control => {const selected = control === button;control.setAttribute('aria-pressed',String(selected));control.closest('.case-file-row')?.classList.toggle('is-selected',selected);});
            }
            previewCaseFile(index,button);
        });
    });
    clearTimeout(modalCloseTimers.get(modal.id));
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    if (!languageRefresh) modal.querySelector('.case-close').focus();
    window.IPCOSReview?.opened(item,{languageRefresh});
    window.IPCOSReviewTools?.opened(item,{languageRefresh});
    window.IPCOSCorrections?.refresh();
    if (restoreFocus?.node.isConnected && !restoreFocus.node.disabled) {
        restoreFocus.node.focus({preventScroll:true});
        if (typeof restoreFocus.start==='number') restoreFocus.node.setSelectionRange(restoreFocus.start,restoreFocus.end,restoreFocus.direction || 'none');
        document.getElementById('case-detail-content').scrollTop=restoreFocus.scroll;
    }
    savedPaneScroll.forEach(({name,top}) => {const pane = content.querySelector('.' + name);if (pane) pane.scrollTop = top;});
    return true;
}

function caseMobileCard(item, isAdmin) {
    return `<article class="case-mobile-card"><div class="case-mobile-top"><small>${escapeHtml(formatDate(isAdmin ? getCaseEventTime(item) : item.date))}</small></div>
        <strong>${escapeHtml(systemText(item.jenis))}</strong>${isAdmin ? `<p>${escapeHtml(item.nama)}<br><small>${escapeHtml(item.nim)}</small></p>` : ''}
        ${window.IPCOSReview?.statusHtml(item,{compact:true}) || getStatusBadge(item.status)+`<p>${escapeHtml(caseNextStep(item))}</p>`}
        <button type="button" class="btn-primary" data-case-id="${escapeHtml(item.id)}">${systemText('Buka Detail & Tindakan')}</button></article>`;
}

document.addEventListener('click', event => {
    const button = event.target.closest('[data-case-id]');
    if (button) openCaseDetail(button.dataset.caseId);
});

function loadStudentStatus() {
    window.IPCOSStudentRequests?.render();
    const records=readStoredJSON(sessionStorage,'ipcos_registrations',[]);
    const alertRev=document.getElementById('alert-revision-student');
    if(alertRev)alertRev.style.display=records.some(item=>isStudentOwner(item)&&String(item.status).trim().toLowerCase()==='revision')?'block':'none';
    renderTaskHome();
    applyDynamicLanguage();
}

// ==========================================
// 12. LOAD TABEL ADMIN DENGAN PAGINATION & DEBOUNCE
// ==========================================
let currentAdminPage = 1;
const rowsPerPage = 10;
let adminFilteredData = [];
let debounceTimer;
let isAdminSortDesc = true;

function debounceAdminSearch() { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => { currentAdminPage = 1; filterAdminData(); }, 300); }

function loadAdminData() { restoreQueueView(); filterAdminData(); }

function toggleSortDate() {
    document.getElementById('admin-queue-order').value='activity';
    isAdminSortDesc = !isAdminSortDesc;
    const sortIcon = document.getElementById('admin-sort-icon');
    if (sortIcon) sortIcon.innerText = isAdminSortDesc ? '↓' : '↑';
    currentAdminPage = 1;
    filterAdminData();
}

function filterAdminData() {
    const tbody = document.getElementById('table-admin-reg');
    if (!tbody) return;

    const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    const searchVal = (document.getElementById('admin-search-input')?.value || '').toLowerCase().trim();
    const filterVal = document.getElementById('admin-status-filter')?.value || 'ALL';
    const type = document.getElementById('admin-type-filter')?.value || '';
    const overdueOnly = document.getElementById('admin-overdue-filter')?.checked;
    const from=document.getElementById('admin-date-from').value,to=document.getElementById('admin-date-to').value;
    const matchingContext = records.filter(item => {
        if(window.IPCOSReviewTools?.archived(item))return false;
        const matchSearch = String(item.nama || '').toLowerCase().includes(searchVal) || String(item.nim || '').toLowerCase().includes(searchVal);
        const submitted=displayDate(item.date),day=Number.isFinite(submitted.getTime())?submitted.toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}):'';
        return matchSearch && (!type || item.jenis === type) && (!overdueOnly || caseWaiting(item)?.overdue) && (!from || day>=from) && (!to || day<=to) && (!from || !to || from<=to);
    });
    const counts = { pending: 0, resubmitted: 0, revision: 0, accepted: 0 };
    matchingContext.forEach(item => { const status = String(item.status || '').trim().toLowerCase(); if (status in counts) counts[status]++; });
    const summary = document.getElementById('admin-queue-summary');
    if (summary) {
        summary.setAttribute('aria-label',uxText('Status antrean pengajuan','Request queue status'));
        const focusedStatus=summary.contains(document.activeElement)?document.activeElement.closest('[data-queue-status]')?.dataset.queueStatus:null;
        const tabs=[['ACTION_REQUIRED','Perlu Ditinjau','Needs Review',counts.pending+counts.resubmitted],['Resubmitted','Perbaikan Masuk','Corrections',counts.resubmitted],['Revision','Menunggu Mahasiswa','Awaiting Student',counts.revision],['ALL','Semua','All',matchingContext.length]];
        summary.innerHTML=tabs.map(([value,id,en,count])=>`<button type="button" class="queue-status-tab" data-queue-status="${value}" aria-pressed="${filterVal===value}" aria-label="${escapeHtml(uxText(id,en)+' · '+count+' '+uxText('pengajuan',count===1?'request':'requests'))}" onclick="setAdminQueueFilter('${value}')"><span>${uxText(id,en)}</span><strong class="queue-status-count">${count}</strong></button>`).join('');
        if(focusedStatus)[...summary.querySelectorAll('[data-queue-status]')].find(button=>button.dataset.queueStatus===focusedStatus)?.focus({preventScroll:true});
    }

    adminFilteredData = matchingContext.filter(item => {
        const stat = String(item.status || '').trim().toLowerCase();
        return filterVal === 'ALL' || (filterVal === 'ACTION_REQUIRED' ? ['pending', 'resubmitted'].includes(stat) : stat === filterVal.toLowerCase());
    });

    document.getElementById('queue-date-error').textContent=from&&to&&from>to?uxText('Tanggal mulai harus sebelum atau sama dengan tanggal akhir.','The start date must be on or before the end date.'):'';
    const activityOrder=document.getElementById('admin-queue-order').value==='activity';
    document.getElementById('admin-activity-heading')?.setAttribute('aria-sort',activityOrder?(isAdminSortDesc?'descending':'ascending'):'none');
    document.getElementById('admin-sort-icon').textContent=activityOrder?(isAdminSortDesc?'↓':'↑'):'';
    adminFilteredData.sort((a, b) => {
        const order=document.getElementById('admin-queue-order').value;
        if(order==='oldest' || order==='overdue') {
            const waitA=caseWaiting(a),waitB=caseWaiting(b);
            const score=wait=>wait ? wait.days-(order==='overdue'?wait.target:0) : -Infinity;
            if(score(waitA)!==score(waitB))return score(waitB)-score(waitA);
            return (displayDate(a.date).getTime()||0)-(displayDate(b.date).getTime()||0);
        }
        if (filterVal === 'ACTION_REQUIRED') {
            const priority = item => String(item.status).toLowerCase() === 'resubmitted' ? 0 : 1;
            if (priority(a) !== priority(b)) return priority(a) - priority(b);
        }
        const dateA = displayDate(getCaseEventTime(a)).getTime() || 0;
        const dateB = displayDate(getCaseEventTime(b)).getTime() || 0;

        return isAdminSortDesc ? (dateB - dateA) : (dateA - dateB);
    });

    window.IPCOSReview?.setQueue(adminFilteredData);
    renderAdminTable();
    window.IPCOSPolish?.queue();
    saveQueueView();
    renderTaskHome();
}

function setAdminQueueFilter(value) {
    const filter = document.getElementById('admin-status-filter');
    if (!filter) return;
    filter.value = value;
    currentAdminPage = 1;
    filterAdminData();
}

function adminQueueCard(item) {
    return `<article class="case-mobile-card queue-request-card" data-queue-case="${escapeHtml(item.id)}"><div class="queue-row-identity"><div><strong>${escapeHtml(item.nama)}</strong><span>${escapeHtml(item.nim)}</span></div><time>${escapeHtml(formatDate(getCaseEventTime(item)))}</time></div><p class="queue-request-service">${escapeHtml(systemText(item.jenis))}</p>${window.IPCOSReview?.statusHtml(item,{compact:true}) || getStatusBadge(item.status)+`<p>${escapeHtml(caseNextStep(item))}</p>`}<button type="button" class="btn-secondary queue-open-request" data-case-id="${escapeHtml(item.id)}">${uxText('Periksa Pengajuan','Review Request')} <span aria-hidden="true">→</span></button></article>`;
}

function renderAdminTable() {
    const tbody = document.getElementById('table-admin-reg');
    tbody.innerHTML = '';

    if (adminFilteredData.length === 0) {
        currentAdminPage = 1;
        tbody.innerHTML = `<tr><td colspan="5" class="queue-empty" style="text-align:center; padding: 30px;">
            <span class="lang" data-id="Tidak ada data yang sesuai pencarian." data-en="No matching data found.">${currentLang === 'id' ? 'Tidak ada data yang sesuai pencarian.' : 'No matching data found.'}</span>
        </td></tr>`;
        document.getElementById('admin-page-info').innerText = systemText('Halaman 1 / 1');
        document.getElementById('admin-btn-prev').disabled = true;
        document.getElementById('admin-btn-next').disabled = true;
        const mobileList = document.getElementById('admin-mobile-list');
        if (mobileList) mobileList.innerHTML = `<div class="case-mobile-card">${uxText('Tidak ada pengajuan yang sesuai.', 'No matching requests.')}</div>`;
        return;
    }

    const totalPages = Math.ceil(adminFilteredData.length / rowsPerPage);
    if (currentAdminPage > totalPages) currentAdminPage = totalPages;
    if (currentAdminPage < 1) currentAdminPage = 1;

    const startIndex = (currentAdminPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedItems = adminFilteredData.slice(startIndex, endIndex);
    const mobileList = document.getElementById('admin-mobile-list');
    if (mobileList) mobileList.innerHTML = paginatedItems.map(adminQueueCard).join('');

    document.getElementById('admin-page-info').innerText = `${uxText('Halaman','Page')} ${currentAdminPage} / ${totalPages}`;
    document.getElementById('admin-btn-prev').disabled = currentAdminPage <= 1;
    document.getElementById('admin-btn-next').disabled = currentAdminPage >= totalPages;

    paginatedItems.forEach(item => {
        tbody.innerHTML += `<tr data-queue-case="${escapeHtml(item.id)}">
            <td style="font-size:13px;">${formatDateTime(getCaseEventTime(item))}</td>
            <td><strong>${escapeHtml(item.nama)}</strong><br><small>${escapeHtml(item.nim)}</small></td>
            <td><strong>${escapeHtml(systemText(item.jenis))}</strong></td>
            <td>${window.IPCOSReview?.statusHtml(item,{compact:true}) || getStatusBadge(item.status)+`<p>${escapeHtml(caseNextStep(item))}</p>`}</td>
            <td><button type="button" class="btn-secondary queue-open-request" data-case-id="${escapeHtml(item.id)}">${uxText('Periksa','Review')} <span aria-hidden="true">→</span></button></td>
        </tr>`;
    });
    applyDynamicLanguage();
}

function changeAdminPage(direction) {
    const totalPages = Math.ceil(adminFilteredData.length / rowsPerPage);
    currentAdminPage += direction;
    if (currentAdminPage < 1) currentAdminPage = 1;
    if (currentAdminPage > totalPages) currentAdminPage = totalPages;
    renderAdminTable();
    window.IPCOSPolish?.queue();
    saveQueueView();
}


function deleteAllRegistrations() {
    if(currentUser.role!=='admin')return;
    const section=document.getElementById('admin-archives');const utilities=document.getElementById('queue-tools');if(utilities)utilities.open=true;section.open=true;section.scrollIntoView({block:'start',behavior:'smooth'});document.getElementById('archive-from').focus();
}

function openDocPreview(url) {
    // Old callers use the same authorized case preview instead of embedding Drive.
    const records=readStoredJSON(sessionStorage,'ipcos_registrations',[]);
    const item=records.find(record=>(currentUser.role==='admin' || (currentUser.role==='mhs' && isStudentOwner(record))) && getCaseFiles(record).some(file=>file.url===url));
    if(!item){showToast(uxText('Berkas tidak termasuk pengajuan yang dapat Anda akses.','This file does not belong to an accessible request.'),'error');return;}
    openCaseDetail(item.id);
    if(selectedCaseId===String(item.id))previewCaseFile(getCaseFiles(item).findIndex(file=>file.url===url));
}

function nearestYudisiumDeadline(now = Date.now()) {
    const upcoming = [];
    for (const group of getChecklistData('kalender')) {
        for (const item of group.items) {
            const day = academicCalendarDate(item.text);
            if (!day) continue;
            // The academic calendar's dates end at 23:59:59 WIB (UTC+7).
            const deadline = day.getTime() + 17 * 60 * 60 * 1000 - 1000;
            if (deadline >= now) upcoming.push({ deadline, day, title: contentText(group.title, group.titleEn), dateText: item.text });
        }
    }
    return upcoming.sort((a,b) => a.deadline-b.deadline)[0] || null;
}
function renderYudisiumCountdown() {
    if(typeof window !== 'undefined')window.IPCOSCalendar?.tick();
    const now = Date.now(), next = nearestYudisiumDeadline(now);
    const distance = next ? next.deadline - now : 0;
    const days = Math.floor(distance / 86400000);
    const hours = Math.floor((distance % 86400000) / 3600000);
    const minutes = Math.floor((distance % 3600000) / 60000);
    const seconds = Math.floor((distance % 60000) / 1000);
    const text = next ? `${days}d : ${hours}h : ${minutes}m : ${seconds}s` : uxText('Jadwal belum tersedia', 'No upcoming schedule');
    document.querySelectorAll('.countdown-timer-display, #countdown-timer-display').forEach(el => { el.textContent = text; });
    document.querySelectorAll('.countdown-period-label').forEach(el => {
        el.textContent = next ? `${next.title} · ${uxText('Batas','Deadline')}: ${formatDate(next.day)}` : uxText('Menunggu jadwal berikutnya', 'Awaiting the next schedule');
    });
    document.querySelectorAll('[data-next-yudisium-reminder]').forEach(button => { button.disabled = !next; });
}
function downloadNearestYudisiumReminder() {
    const next = nearestYudisiumDeadline();
    if (!next) { showToast(uxText('Jadwal Yudisium berikutnya belum tersedia.', 'The next graduation clearance schedule is unavailable.'), 'error'); return; }
    downloadICS(next.title, next.dateText);
}
function startCountdownWidget() {
    renderYudisiumCountdown();
    setInterval(renderYudisiumCountdown, 1000);
}

function openChatTimeline(id) {
    const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    const target = records.find(r => r.id === id);
    const container = document.getElementById('chat-timeline-container');
    container.innerHTML = '';

    if (!target) return;

    let logs = [];
    if (target.note && target.note.trim() !== '') {
        try {
            logs = JSON.parse(target.note);
        } catch (e) {
            logs = [{ sender: 'Sistem', role: 'system', time: target.date, message: target.note }];
        }
    }

    const stat = String(target.status).trim().toLowerCase();
    if ((target.jenis === 'Outline' || target.jenis === 'Pergantian Pembimbing') && stat === 'accepted' && target.dospem) {
        const hasDospemLog = logs.some(log => log.message.includes('Dosen Pembimbing'));

        if (!hasDospemLog) {
            logs.push({
                sender: 'Admin IPCOS',
                role: 'admin',
                time: target.date,
                message: currentLang === 'id'
                    ? `Selamat! Pengajuan Anda telah <b>DITERIMA</b>.<br><br>Dosen Pembimbing Anda adalah:<br><b style='color:#E03F4F; font-size:15px;'>${target.dospem}</b><br><br>Silakan segera menghubungi beliau untuk proses bimbingan selanjutnya.`
                    : `Congratulations! Your Submission is <b>ACCEPTED</b>.<br><br>Your Supervisor is:<br><b style='color:#E03F4F; font-size:15px;'>${target.dospem}</b><br><br>Please contact them for further guidance.`
            });
        }
    }

    if (logs.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted);" class="lang" data-id="Belum ada riwayat catatan." data-en="No note history yet.">${currentLang === 'id' ? 'Belum ada riwayat catatan.' : 'No note history yet.'}</p>`;
    } else {
        logs.forEach(log => {
            const isMhs = log.role === 'mhs';
            container.innerHTML += `<div class="chat-bubble ${isMhs ? 'chat-mhs' : 'chat-admin'}">
                    <div class="chat-sender"><span>${escapeHtml(log.sender)} (${escapeHtml(String(log.role).toUpperCase())})</span><span style="opacity:0.7; font-weight:normal;">${formatDate(log.time)}</span></div>
                    <div style="white-space:pre-line;">${sanitizeRichHtml(log.message)}</div></div>`;
        });
    }

    const modal = document.getElementById('modal-chat-timeline');
    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

// ==========================================
// 13. UPDATE DATA & REVISI PERBAIKAN
// ==========================================
const activeUpdateIds = new Set();
async function sendUpdateRequest(id, newStatus, noteText, files = [], dospem = null, correctedFields = null) {
    if (activeUpdateIds.has(id)) return false;
    if (isOffline) {
        showToast(currentLang === 'id' ? "Tidak dapat menyimpan saat offline." : "Cannot save while offline.", "error");
        return false;
    }
    activeUpdateIds.add(id);
    window.IPCOSReview?.actionsChanged();
    const requestEpoch = sessionEpoch;
    showLoader(currentLang === 'id' ? 'Sedang Memproses...' : 'Processing...');
    try {
        const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
        const targetIndex = records.findIndex(r => r.id === id);
        const target = targetIndex !== -1 ? records[targetIndex] : null;
        const existingNote = target ? target.note : '';

        let logs = [];
        if (existingNote && existingNote.trim() !== '') {
            try {
                logs = JSON.parse(existingNote);
            } catch (e) {
                logs = [{ sender: 'Sistem', role: 'system', time: target ? target.date : new Date().toISOString(), message: existingNote }];
            }
        }

        if (noteText && noteText.trim() !== '') {
            logs.push({
                sender: currentUser.nama,
                role: currentUser.role,
                time: new Date().toISOString(),
                message: noteText
            });
        }

        const finalNoteJSON = JSON.stringify(logs);

        const payload = { action: correctedFields ? 'revise_request' : 'update', ...(correctedFields || {}), id: id, status: newStatus, noteText: noteText, files: files, dospem: dospem };
        const res = await apiPost(GAS_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await readApiResult(res);

        if (result.status === "success") {
            // --- UPDATE LOKAL INSTAN ---
            if (targetIndex !== -1) {
                records[targetIndex].status = correctedFields && result.recordStatus ? result.recordStatus : newStatus;
                records[targetIndex].note = correctedFields && typeof result.note==='string' ? result.note : finalNoteJSON;
                if(correctedFields && typeof result.detail==='string')records[targetIndex].detail=result.detail;
                if (dospem) {
                    records[targetIndex].dospem = dospem;
                }
                sessionStorage.setItem('ipcos_registrations', JSON.stringify(records));
            }

            // Refresh UI langsung tanpa tunggu sync
            if (currentUser.role === 'admin') {
                filterAdminData();
                renderDashboardCharts(records);
            } else {
                loadStudentStatus();
                renderActivityTimeline(records);
            }

            showToast(uxText('Status berhasil diperbarui!', 'Status updated successfully!'), "success");
            await syncDatabase();
            return true;
        } else {
            showToast(uxText('Gagal: ', 'Failed: ') + systemText(result.message || uxText('Error tidak diketahui','Unknown error')), "error");
            return false;
        }
    } catch (err) {
        if (err.staleSession || requestEpoch !== sessionEpoch) return false;
        showToast(currentLang === 'id' ? "Terjadi kesalahan jaringan/upload." : "Network/upload error occurred.", "error");
        return false;
    } finally {
        if (requestEpoch === sessionEpoch) { activeUpdateIds.delete(id); hideLoader(); window.IPCOSReview?.actionsChanged(); }
    }
}

function acceptSubmission(id) { openCaseDetail(id); caseDetailAction('accept'); }
function openRevisionModal(id) { openCaseDetail(id); caseDetailAction('revision'); }
function openDospemModal(id) { openCaseDetail(id); caseDetailAction('dospem'); }

function submitAdminDospem() {
    const id = document.getElementById('hidden-dospem-id').value;
    const dospem = document.getElementById('input-dospem-select').value;

    if (dospem === "") {
        showToast(currentLang === 'id' ? "Pilih Dosen Pembimbing terlebih dahulu!" : "Please select a Supervisor!", "error");
        return;
    }
    closeModal('modal-dospem');

    const note = currentLang === 'id'
        ? `Selamat! Pengajuan Anda telah <b>DITERIMA</b>.<br><br>Dosen Pembimbing Anda (yang baru) adalah:<br><b style='color:#E03F4F; font-size:15px;'>${dospem}</b><br><br>Silakan segera menghubungi beliau untuk proses bimbingan selanjutnya.`
        : `Congratulations! Your Submission is <b>ACCEPTED</b>.<br><br>Your (New) Supervisor is:<br><b style='color:#E03F4F; font-size:15px;'>${dospem}</b><br><br>Please contact them for further guidance.`;

    sendUpdateRequest(id, 'Accepted', note, [], dospem);
}

function submitAdminRevision() {
    const id = document.getElementById('hidden-rev-id').value; const note = document.getElementById('input-rev-note').value.trim();
    if (note === "") { showToast(currentLang === 'id' ? "Pesan revisi tidak boleh kosong!" : "Revision note cannot be empty!", "error"); return; }
    closeModal('modal-revision'); sendUpdateRequest(id, 'Revision', note);
}

function openReplyModal(id) { openCaseDetail(id); caseDetailAction('reply'); }

async function submitStudentReply() {
    const id = document.getElementById('hidden-reply-id').value; const note = document.getElementById('input-reply-note').value.trim();
    const fileInput = document.getElementById('input-reply-file').files[0];
    if (!note || !fileInput) { showToast(currentLang === 'id' ? "Catatan dan Berkas Revisi Baru wajib diisi!" : "Note and new revision file are required!", "error"); return; }
    try {
        const base64Data = await fileToBase64(fileInput); closeModal('modal-reply');
        const fileData = [{ fileName: fileInput.name, mimeType: fileInput.type, base64: base64Data }];
        sendUpdateRequest(id, 'Resubmitted', note, fileData);
    } catch (err) { showToast(err.message, "error"); }
}

function closeModal(modalId, force = false) {
    if (modalId === 'modal-edit-dosen' && !force && supervisorMutationBusy) return;
    if(modalId==='modal-edit-content'&&!force){if(contentSaving)return;if(contentEditorDirty()&&!confirm(uxText('Tutup tanpa menyimpan perubahan?','Close without saving changes?')))return;}
    if (modalId === 'modal-sop-editor' && !force) { window.IPCOSSop?.cancel(); return; }
    if (!force && modalId === 'modal-case-detail' && !confirmLeaveCase()) return;
    if (!force && modalId === 'modal-case-detail' && (isPreparingCorrection || activeUpdateIds.has(selectedCaseId))) return;
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (modalId === 'modal-important-announcement' && !force) rememberAnnouncementDismissal();
    if (modalId === 'modal-case-detail') clearCaseBlobUrls();
    clearTimeout(modalCloseTimers.get(modalId));
    if (modal.tagName && modal.tagName.toLowerCase() === 'dialog') {
        if (modal.open) modal.close();
        if (modalId === 'modal-doc-preview') { document.getElementById('iframe-doc-viewer').src = 'about:blank'; document.getElementById('btn-download-direct').removeAttribute('href'); }
        return;
    }
    if (force) { modal.style.display = 'none'; modal.style.opacity = '0'; return; }
    else {
        modal.style.opacity = '0';
        modalCloseTimers.set(modalId, setTimeout(() => { modal.style.display = 'none'; modalCloseTimers.delete(modalId); }, 180));
    }
}
function syncThemeControl() {
    const button = document.getElementById('login-theme-toggle');
    if (!button) return;
    const dark = document.body.classList.contains('dark-mode');
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', uxText('Mode gelap','Dark mode'));
    button.title = dark ? uxText('Ganti ke mode terang','Switch to light mode') : uxText('Ganti ke mode gelap','Switch to dark mode');
}
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('ipcos_theme', isDark ? 'dark' : 'light');
    syncThemeControl();
}
function toggleSidebar() { document.getElementById('main-sidebar').classList.toggle('active'); window.IPCOSExperience?.drawerChanged(); }

function canAccessTab(tabId) {
    if (tabId === 'notifications') return !!getSessionToken() && ['mhs','admin'].includes(currentUser.role);
    if (['sop-magang','sop-tugas-akhir'].includes(tabId)) return ['mhs','admin'].includes(currentUser.role);
    if (tabId === 'academic-journey') return ['mhs','admin'].includes(currentUser.role);
    if (tabId === 'internationalization') return currentUser.role === 'admin';
    if (['pendaftaran','student-status','student-files'].includes(tabId)) return currentUser.role === 'mhs';
    if (['admin-data','admin-dosen','admin-master'].includes(tabId)) return currentUser.role === 'admin';
    return true;
}
function switchTab(event, tabId) {
    const target = document.getElementById(tabId);
    if (!target || !canAccessTab(tabId)) return false;
    if (window.IPCOSSop && !window.IPCOSSop.beforeNavigate(tabId)) return false;
    if (tabId === 'academic-journey') renderAcademicJourney();
    if (tabId !== 'pendaftaran' && document.getElementById('pendaftaran').classList.contains('active') && !confirmLeaveRegistration()) return false;
    if (tabId !== 'student-files') window.IPCOSFileCenter?.beforeNavigate();
    if (tabId === 'dashboard') renderTaskHome();
    if (tabId === 'notifications') window.IPCOSNotifications?.render();
    if (tabId === 'feedback') window.IPCOSHelp?.render();
    if (tabId === 'student-files') window.IPCOSFileCenter?.render();
    window.IPCOSExperience?.beforeTab(tabId);
    document.body.classList.toggle('transaction-view', ['dashboard', 'pendaftaran', 'student-status', 'admin-data'].includes(tabId));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    else document.querySelectorAll('.nav-item').forEach(item => { if ((item.getAttribute('onclick') || '').includes("'" + tabId + "'")) item.classList.add('active'); });
    if (target) {
        target.classList.remove('active'); void target.offsetWidth; target.classList.add('active');
    }
    document.getElementById('main-sidebar').classList.remove('active');
    window.IPCOSExperience?.tabChanged(tabId);
    if (tabId === 'internationalization') window.IPCOSInternational?.open();
    if (tabId === 'sop-magang') window.IPCOSSop?.open('sop_magang');
    if (tabId === 'sop-tugas-akhir') window.IPCOSSop?.open('sop_tugas_akhir');

    if (tabId === 'pendaftaran') {
        loadFormDraft();
        const form = document.getElementById('pendaftaran');
        if (form && !form.dataset.draftBound) {
            form.addEventListener('input', event => { if (event.target.matches('input:not([type="file"]), textarea, select')) saveFormDraft(); });
            form.addEventListener('change', event => { if (event.target.matches('input:not([type="file"]), textarea, select')) saveFormDraft(); });
            form.dataset.draftBound = 'true';
        }
    }
    return true;
}

function silentSyncDatabase() {
    if (document.hidden || isOffline || !getSessionToken() || syncPhase === 'syncing') return;
    return apiRead().then(applyDatabaseSnapshot).catch(error => { if (!error.staleSession && getSessionToken()) setSyncPhase('error'); });
}
// Active-tab timer lives in workflow.js.

// ==========================================
// 14. SIDEBAR INTERAKTIF
// ==========================================
function toggleDesktopSidebar() { document.getElementById('main-sidebar').classList.toggle('collapsed'); document.querySelector('.main-content').classList.toggle('expanded'); window.IPCOSExperience?.drawerChanged(); }

// ==========================================
// 15. DASHBOARD CHART ANALYTICS & STATS (BENTO ADMIN)
// ==========================================
let ratioChartInstance = null; let typeChartInstance = null;
let chartLibraryPromise = null;
function loadChartLibrary() {
    if (typeof Chart !== 'undefined') return Promise.resolve();
    if (chartLibraryPromise) return chartLibraryPromise;
    chartLibraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
        script.async = true;
        const fail = () => { clearTimeout(timeout); script.remove(); chartLibraryPromise = null; reject(new Error('Chart unavailable')); };
        const timeout = setTimeout(fail, 15000);
        script.onerror = fail;
        script.onload = () => { clearTimeout(timeout); if (typeof Chart === 'undefined') fail(); else resolve(); };
        document.head.appendChild(script);
    });
    return chartLibraryPromise;
}
async function showDashboardCharts() {
    const details = document.querySelector('.dashboard-secondary');
    if (!details?.open || currentUser.role !== 'admin') return;
    const epoch = sessionEpoch;
    const status = document.getElementById('chart-load-status');
    status.hidden = false; status.textContent = uxText('Memuat grafik…','Loading charts…');
    try {
        await loadChartLibrary();
        if (epoch !== sessionEpoch || currentUser.role !== 'admin' || !details.open) return;
        status.hidden = true;
        renderDashboardCharts(readStoredJSON(sessionStorage, 'ipcos_registrations', []));
    } catch (_) {
        if (epoch !== sessionEpoch || currentUser.role !== 'admin' || !details.open) return;
        status.textContent = uxText('Grafik belum tersedia. Angka ringkasan dan antrean tetap dapat digunakan. Tutup lalu buka ringkasan untuk mencoba lagi.','Charts unavailable. Summary totals and the queue remain available. Close and reopen the summary to retry.');
    }
}


function renderDashboardCharts(records) {
    if (currentUser.role !== 'admin') return;

    const pendingCount = records.filter(r => String(r.status).trim().toLowerCase() === 'pending').length;
    const acceptedCount = records.filter(r => String(r.status).trim().toLowerCase() === 'accepted').length;
    const revisionCount = records.filter(r => String(r.status).trim().toLowerCase() === 'revision').length;
    const resubmittedCount = records.filter(r => String(r.status).trim().toLowerCase() === 'resubmitted').length;

    const elPending = document.getElementById('stat-count-pending');
    const elResubmitted = document.getElementById('stat-count-resubmitted');
    const elRevision = document.getElementById('stat-count-revision');
    const elAccepted = document.getElementById('stat-count-accepted');

    if (elPending) elPending.innerText = pendingCount;
    if (elResubmitted) elResubmitted.innerText = resubmittedCount;
    if (elRevision) elRevision.innerText = revisionCount;
    if (elAccepted) elAccepted.innerText = acceptedCount;

    const outlineCount = records.filter(r => r.jenis === 'Outline').length;
    const proposalCount = records.filter(r => r.jenis === 'Proposal').length;
    const pendadaranCount = records.filter(r => r.jenis === 'Pendadaran').length;
    const jurnalCount = records.filter(r => r.jenis === 'Skripsi Jurnal').length;
    const gantiDosenCount = records.filter(r => r.jenis === 'Pergantian Pembimbing').length;

    const ctxRatio = document.getElementById('ratioChart');
    const ctxType = document.getElementById('typeChart');
    if (!ctxRatio || !ctxType || !document.querySelector('.dashboard-secondary')?.open) return;
    if (typeof Chart === 'undefined') { showDashboardCharts(); return; }

    if (ratioChartInstance) ratioChartInstance.destroy();
    if (typeChartInstance) typeChartInstance.destroy();

    Chart.defaults.color = document.body.classList.contains('dark-mode') ? '#A3968C' : '#796C63';
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

    ratioChartInstance = new Chart(ctxRatio.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: [uxText('Menunggu admin','Awaiting review'),uxText('Selesai','Completed'),uxText('Menunggu mahasiswa','Awaiting corrections'),uxText('Perbaikan masuk','Resubmitted')],
            datasets: [{
                data: [pendingCount, acceptedCount, revisionCount, resubmittedCount],
                backgroundColor: ['#F8C463', '#81912F', '#E03F4F', '#A3968C'],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '78%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        boxWidth: 8,
                        font: { weight: '600', size: 11 }
                    }
                }
            }
        }
    });

    typeChartInstance = new Chart(ctxType.getContext('2d'), {
        type: 'bar',
        data: {
            labels: SERVICE_TYPES.map(systemText),
            datasets: [{
                label: uxText('Jumlah Pengajuan','Requests'),
                data: [outlineCount, proposalCount, pendadaranCount, jurnalCount, gantiDosenCount],
                backgroundColor: '#E03F4F',
                borderRadius: 8,
                borderSkipped: false,
                barThickness: window.innerWidth < 600 ? 18 : 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { weight: '600', size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 },
                    grid: {
                        color: document.body.classList.contains('dark-mode') ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                        borderDash: [5, 5]
                    }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function postAnnouncementFromDashboard() {
    const input = document.getElementById('input-broadcast-dashboard');
    const msg = input ? input.value.trim() : '';
    if (!msg) { showToast("Pesan pengumuman tidak boleh kosong!", "error"); return Promise.resolve(false); }
    const requestEpoch = sessionEpoch;

    return postAnnouncement(msg, 'info').then(success => {
        if (success && requestEpoch === sessionEpoch && input?.value.trim() === msg) input.value = '';
        return success;
    });
}

let postingAnnouncement = false;
function setAnnouncementBusy(busy) {
    document.querySelectorAll('.announcement-submit').forEach(button => button.disabled = busy);
    document.querySelectorAll('.announcement-composer').forEach(form => form.setAttribute('aria-busy',String(busy)));
}
async function postAnnouncement(customMsg = null, customType = null) {
    if (postingAnnouncement || currentUser.role !== 'admin' || !getSessionToken()) return false;
    if (isOffline) { showToast("Tidak dapat mengirim pengumuman saat offline.", "error"); return false; }

    const masterInput = document.getElementById('input-broadcast');
    const checkImportant = document.getElementById('check-important-broadcast');

    const msg = customMsg !== null ? customMsg : (masterInput ? masterInput.value.trim() : '');

    if (!msg) { showToast("Pesan pengumuman tidak boleh kosong!", "error"); return false; }

    postingAnnouncement = true;
    const requestEpoch = sessionEpoch;
    const requestToken = getSessionToken();
    const annType = customType !== null ? customType : (checkImportant && checkImportant.checked ? 'important' : 'info');

    setAnnouncementBusy(true);
    showLoader();
    try {
        await apiPostSuccess(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'post_announcement', message: msg, type: annType }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        if (requestEpoch !== sessionEpoch || requestToken !== getSessionToken()) return false;
        showToast("Pengumuman berhasil disebarkan!", "success");

        const unchangedDraft = customMsg === null && masterInput?.value.trim() === msg;
        if (unchangedDraft) masterInput.value = '';
        if (unchangedDraft && customType === null && checkImportant?.checked === (annType === 'important')) checkImportant.checked = false;

        await syncDatabase();
        return requestEpoch === sessionEpoch && requestToken === getSessionToken();
    } catch (e) {
        if (!e.staleSession && requestEpoch === sessionEpoch) showToast("Gagal mengirim pengumuman. Pesan Anda tetap tersedia.", "error");
        return false;
    } finally {
        if (requestEpoch === sessionEpoch) { postingAnnouncement = false; setAnnouncementBusy(false); hideLoader(); }
    }
}

// ==========================================
// 16. CRUD MASTER MAHASISWA & BROADCAST
// ==========================================
function renderMasterMahasiswa(students) {
    if (window.IPCOSMaster) { window.IPCOSMaster.render(students); return; }
    const tbody = document.getElementById('table-master-mhs');
    if (!tbody) return; tbody.innerHTML = '';
    students.slice().reverse().forEach(s => {
        const statusMhs = s.Status || s.status || "Aktif"; let badgeClass = "badge-accepted";
        if (statusMhs.toLowerCase() === "tidak aktif") badgeClass = "badge-revision"; else if (statusMhs.toLowerCase() === "lulus") badgeClass = "badge-resubmitted";
        tbody.innerHTML += `<tr><td><b>${escapeHtml(s.NIM)}</b></td><td>${escapeHtml(s.Nama)}</td><td><span class="status-badge ${badgeClass}">${escapeHtml(systemText(statusMhs))}</span></td><td data-academic-nim="${escapeHtml(String(s.NIM??s.nim))}"></td><td><button class="action-btn btn-rev" onclick="deleteStudent(${escapeHtml(JSON.stringify(String(s.NIM)))})">${uxText('Hapus','Delete')}</button></td></tr>`;
    });
    window.IPCOSAcademic?.render();
}

let masterMutationBusy = false;
function masterFeedback(kind,id,en,type='error') { window.IPCOSMaster?.feedback(type,id,en); showToast(uxText(id,en),type); }
async function addStudent() {
    if (currentUser.role !== 'admin' || !getSessionToken() || masterMutationBusy) return;
    if (isOffline) { masterFeedback('add','Tidak dapat menambah mahasiswa saat offline.','Cannot add a student while offline.'); return; }
    const captured=window.IPCOSMaster?window.IPCOSMaster.studentInput():{nim:document.getElementById('add-nim').value.trim(),nama:document.getElementById('add-nama').value.trim()};
    if (!captured) return;
    const {nim,nama}=captured;
    if (!nim || !nama) { masterFeedback('add','NIM dan nama wajib diisi.','Student ID and name are required.'); return; }
    masterMutationBusy=true;window.IPCOSMaster?.busy(true);showLoader();
    const epoch=sessionEpoch,token=getSessionToken(),current=()=>epoch===sessionEpoch&&token===getSessionToken()&&currentUser.role==='admin';
    try {
        await apiPostSuccess(GAS_URL,{method:'POST',body:JSON.stringify({action:'manage_student',method:'add',nim,nama}),headers:{'Content-Type':'text/plain;charset=utf-8'}});
        if(!current())return;
        if(window.IPCOSMaster)window.IPCOSMaster.studentAdded(captured);
        else if(document.getElementById('add-nim').value.trim()===nim&&document.getElementById('add-nama').value.trim()===nama){document.getElementById('add-nim').value='';document.getElementById('add-nama').value='';}
        masterFeedback('add','Mahasiswa berhasil ditambahkan.','Student added successfully.','success');
        await syncDatabase();
    }catch(error){if(current()&&!error.staleSession)masterFeedback('add','Mahasiswa belum ditambahkan. Isian Anda tetap tersedia.','Student could not be added. Your inputs have been retained.');}
    finally{if(current()){masterMutationBusy=false;window.IPCOSMaster?.busy(false);hideLoader();}}
}

async function deleteStudent(nim) {
    if (currentUser.role !== 'admin' || !getSessionToken() || masterMutationBusy) return;
    if (isOffline) { masterFeedback('delete','Tidak dapat menghapus akses saat offline.','Cannot remove access while offline.'); return; }
    const target=String(nim ?? '').trim();
    if(!target||readStoredJSON(sessionStorage,'ipcos_students',[]).filter(s=>String(s.NIM??s.nim??'').trim()===target).length!==1)return;
    if (!confirm(`${uxText('Hapus akses mahasiswa untuk NIM:', 'Remove student access for ID:')} ${target}?`)) return;
    masterMutationBusy=true;window.IPCOSMaster?.busy(true);showLoader();
    const epoch=sessionEpoch,token=getSessionToken(),current=()=>epoch===sessionEpoch&&token===getSessionToken()&&currentUser.role==='admin';
    try {
        await apiPostSuccess(GAS_URL,{method:'POST',body:JSON.stringify({action:'manage_student',method:'delete',nim:target}),headers:{'Content-Type':'text/plain;charset=utf-8'}});
        if(!current())return;masterFeedback('delete','Akses mahasiswa berhasil dihapus.','Student access removed.','success');await syncDatabase();
    }catch(error){if(current()&&!error.staleSession)masterFeedback('delete','Akses belum dihapus. Coba kembali.','Access could not be removed. Please try again.');}
    finally{if(current()){masterMutationBusy=false;window.IPCOSMaster?.busy(false);hideLoader();}}
}

function toggleCheckFromRow(event, id) {
    if (event.target.tagName !== 'INPUT') {
        const chk = document.getElementById(id);
        if (chk) {
            chk.checked = !chk.checked;
            recordPreparationChange(chk);
        }
    }
}

function announcementDismissalKey(kind, annId) {
    return `${kind}_announcement_${notificationHash(`${currentUser.role}:${currentUser.nim}:${annId}`)}`;
}
function dismissAnnouncementBanner() {
    const banner = document.getElementById('announcement-banner');
    if (!banner) return;
    const annId = banner.getAttribute('data-current-ann-id');
    if (annId) sessionStorage.setItem(announcementDismissalKey('banner', annId), 'true');
    banner.style.display = 'none';
}
function rememberAnnouncementDismissal() {
    const modal = document.getElementById('modal-important-announcement');
    const annId = modal.getAttribute('data-current-ann-id');
    const chkDontShow = document.getElementById('chk-dont-show-announcement');

    if (annId) {
        if (chkDontShow && chkDontShow.checked) {
            localStorage.setItem(announcementDismissalKey('hide', annId), 'true');
        } else {
            sessionStorage.setItem(announcementDismissalKey('seen', annId), 'true');
        }
    }

    if (chkDontShow) chkDontShow.checked = false;
}
function closeAnnouncementModal() {
    closeModal('modal-important-announcement');
}

// ==========================================
// FITUR BARU: MANAJEMEN PLOTTING DOSEN
// ==========================================
function renderDosenTable() {
    if (window.IPCOSSupervisors) { window.IPCOSSupervisors.render(); return; }
    const tbody = document.getElementById('table-admin-dosen');
    if (!tbody) return;
    tbody.innerHTML = '';

    const dosens = readStoredJSON(sessionStorage, 'ipcos_dosens', []);

    dosens.sort((a, b) => {
        const sisaA = parseInt(a.Maksimal) - parseInt(a.Terpakai);
        const sisaB = parseInt(b.Maksimal) - parseInt(b.Terpakai);
        return sisaB - sisaA;
    });

    dosens.forEach(d => {
        const nama = d.Nama;
        const terpakai = parseInt(d.Terpakai) || 0;
        const maksimal = parseInt(d.Maksimal) || 0;
        const sisa = maksimal - terpakai;

        let statusBadge = `<span class="status-badge badge-accepted">${uxText('Tersedia', 'Available')} (${sisa})</span>`;
        if (sisa <= 0) statusBadge = `<span class="status-badge badge-revision">${uxText('Penuh','Full')}</span>`;
        else if (sisa <= 2) statusBadge = `<span class="status-badge badge-pending">${uxText('Hampir Penuh','Nearly full')}</span>`;

        tbody.innerHTML += `
            <tr>
                <td><b>${escapeHtml(nama)}</b></td>
                <td style="text-align: center; font-size: 16px; font-weight: bold;">${terpakai}</td>
                <td style="text-align: center;">${maksimal}</td>
                <td style="text-align: center;">${statusBadge}</td>
                <td>
                    <button class="action-btn" style="background: var(--item-hover); border: 1px solid var(--item-border);" onclick="openEditDosen(${escapeHtml(JSON.stringify(nama))}, ${terpakai}, ${maksimal})">Edit</button>
                    <button class="action-btn btn-rev" onclick="deleteDosen(${escapeHtml(JSON.stringify(nama))})">${uxText('Hapus','Delete')}</button>
                </td>
            </tr>
        `;
    });
}

function populateDospemDropdown() {
    const select = document.getElementById('input-dospem-select');
    if (!select) return;

    const dosens = readStoredJSON(sessionStorage, 'ipcos_dosens', []), selected=select.value;
    let html = `<option value="">${uxText('Pilih Dosen Pembimbing','Select a Supervisor')}</option>`;
    const counts=new Map();dosens.forEach(d=>{const name=String(d.Nama || '').trim();counts.set(name,(counts.get(name)||0)+1);});
    dosens.sort((a, b) => String(a.Nama || '').localeCompare(String(b.Nama || '')));

    dosens.forEach(d => {
        const used=Number(d.Terpakai),max=Number(d.Maksimal),name=String(d.Nama || '').trim();
        const valid=name&&counts.get(name)===1&&String(d.Terpakai ?? '').trim()!==''&&String(d.Maksimal ?? '').trim()!==''&&Number.isSafeInteger(used)&&Number.isSafeInteger(max)&&used>=0&&max>0;
        const sisa = max-used;
        const disabled = !valid || sisa <= 0 ? 'disabled' : '';
        const warn = !valid?uxText('(Data perlu dicek)','(Data needs review)'):sisa <= 0 ? uxText('(Penuh)','(Full)') : `(${uxText('Sisa kuota','Places left')}: ${sisa})`;
        html += `<option value="${escapeHtml(d.Nama)}" ${disabled}>${escapeHtml(d.Nama)} ${warn}</option>`;
    });

    select.innerHTML = html;
    if([...select.options].some(option=>option.value===selected&&!option.disabled))select.value=selected;
}

function openEditDosen(nama, terpakai, maksimal) {
    if(currentUser.role!=='admin'||!getSessionToken()||supervisorMutationBusy)return;
    window.IPCOSSupervisors?.opened(nama);
    document.getElementById('hidden-dosen-nama').value = nama;
    document.getElementById('edit-dosen-name-display').innerText = nama;
    document.getElementById('edit-dosen-terpakai').value = terpakai;
    document.getElementById('edit-dosen-maksimal').value = maksimal;

    const modal = document.getElementById('modal-edit-dosen');
    clearTimeout(modalCloseTimers.get(modal.id));modalCloseTimers.delete(modal.id);
    modal.style.display = 'flex';const epoch=sessionEpoch;setTimeout(() => { if(epoch===sessionEpoch&&modal.style.display==='flex')modal.style.opacity = '1'; }, 10);
}

function validQuota(used, max) { return String(used).trim() !== '' && String(max).trim() !== '' && Number.isInteger(Number(used)) && Number.isInteger(Number(max)) && Number(used) >= 0 && Number(max) > 0 && Number(used) <= Number(max); }

let supervisorMutationBusy = false;
function supervisorFeedback(kind,id,en,type='error'){window.IPCOSSupervisors?.feedback(kind,{id,en},type);showToast(uxText(id,en),type);}
async function supervisorMutation(kind,payload,success){
    if(currentUser.role!=='admin'||!getSessionToken()||supervisorMutationBusy)return;
    supervisorMutationBusy=true;window.IPCOSSupervisors?.setBusy(kind,true);showLoader();
    const epoch=sessionEpoch,token=getSessionToken(),current=()=>epoch===sessionEpoch&&token===getSessionToken()&&currentUser.role==='admin';
    try{
        await apiPostSuccess(GAS_URL,{method:'POST',body:JSON.stringify({action:'manage_dosen',...payload}),headers:{'Content-Type':'text/plain;charset=utf-8'}});
        if(!current())return;success();await syncDatabase();
    }catch(error){if(current()&&!error.staleSession)supervisorFeedback(kind,'Perubahan belum tersimpan. Isian Anda tetap tersedia.','Changes could not be saved. Your inputs have been retained.');}
    finally{if(current()){supervisorMutationBusy=false;window.IPCOSSupervisors?.setBusy(kind,false);hideLoader();}}
}
async function saveDosenQuota() {
    if(currentUser.role!=='admin'||!getSessionToken()||supervisorMutationBusy)return;
    if(isOffline){supervisorFeedback('edit','Tidak dapat menyimpan saat offline.','Cannot save while offline.');return;}
    if(window.IPCOSSupervisors&&!window.IPCOSSupervisors.validateEdit())return;
    const nama=document.getElementById('hidden-dosen-nama').value,terpakai=document.getElementById('edit-dosen-terpakai').value,maksimal=document.getElementById('edit-dosen-maksimal').value;
    if(!nama||!validQuota(terpakai,maksimal)){supervisorFeedback('edit','Kuota harus bilangan bulat positif dan tidak kurang dari beban terpakai.','The quota must be a positive integer and cannot be below the current load.');return;}
    return supervisorMutation('edit',{method:'update',nama,terpakai,maksimal},()=>{supervisorFeedback('edit','Kuota dosen diperbarui.','Supervisor quota updated.','success');closeModal('modal-edit-dosen',true);});
}
async function addDosenQuota() {
    if(currentUser.role!=='admin'||!getSessionToken()||supervisorMutationBusy)return;
    if(isOffline){supervisorFeedback('add','Tidak dapat menambah dosen saat offline.','Cannot add a supervisor while offline.');return;}
    if(window.IPCOSSupervisors&&!window.IPCOSSupervisors.validateAdd())return;
    const nama=document.getElementById('add-dosen-nama').value.trim(),maksimal=document.getElementById('add-dosen-max').value;
    if(!nama||!validQuota(0,maksimal)){supervisorFeedback('add','Isi nama dan kuota maksimal berupa bilangan bulat positif.','Enter a name and a positive integer for the maximum quota.');return;}
    return supervisorMutation('add',{method:'add',nama,maksimal},()=>{if(document.getElementById('add-dosen-nama').value.trim()===nama&&document.getElementById('add-dosen-max').value===maksimal)document.getElementById('add-dosen-nama').value='';supervisorFeedback('add','Dosen berhasil ditambahkan.','Supervisor added successfully.','success');});
}
async function deleteDosen(nama) {
    if(currentUser.role!=='admin'||!getSessionToken()||supervisorMutationBusy)return;
    if(isOffline){supervisorFeedback('delete','Tidak dapat menghapus saat offline.','Cannot remove a supervisor while offline.');return;}
    const target=String(nama || '').trim(),matches=readStoredJSON(sessionStorage,'ipcos_dosens',[]).filter(d=>String(d.Nama || '').trim()===target);
    if(!target||matches.length!==1)return;
    if(!confirm(`${uxText('Hapus dari daftar kuota:', 'Remove from the quota list:')} ${target}?`))return;
    return supervisorMutation('delete',{method:'delete',nama:String(matches[0].Nama)},()=>{supervisorFeedback('delete','Dosen dihapus dari daftar kuota.','Supervisor removed from the quota list.','success');closeModal('modal-edit-dosen',true);});
}
// Menutup sidebar di mobile saat user klik di luar area sidebar
document.addEventListener('click', function(event) {
    const sidebar = document.getElementById('main-sidebar');
    const toggleBtn = document.querySelector('.mobile-nav-toggle');

    // Cek apakah mode mobile sedang aktif (lebar <= 850px)
    if (window.innerWidth <= 850) {
        // Jika sidebar aktif dan target klik BUKAN sidebar dan BUKAN tombol toggle
        if (sidebar.classList.contains('active') && !sidebar.contains(event.target) && !toggleBtn.contains(event.target) && !event.target.closest('[data-bottom-target="menu"]')) {
            sidebar.classList.remove('active');
            window.IPCOSExperience?.drawerChanged();
        }
    }
});

// Menutup modal apa pun jika area gelap (overlay) diklik
document.querySelectorAll('.overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        // Pastikan yang diklik adalah background overlay-nya, bukan isi card-nya
        if (e.target === this && this.id !== 'welcome-modal') {
            closeModal(this.id);
        }
    });
});

const secondaryDashboard = document.querySelector('.dashboard-secondary');
if (secondaryDashboard) secondaryDashboard.addEventListener('toggle', () => {
    if (secondaryDashboard.open) showDashboardCharts();
});

// Keyboard access for the existing navigation actions.
document.querySelectorAll('.nav-item[role="button"]').forEach(item => item.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); }
}));
