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
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = systemText(message);
    window.IPCOSExperience?.feedback(message,type);
    container.appendChild(toast);
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

function formatDate(dateString) {
    if (!dateString) return '-';
    const safeDate = typeof dateString === 'string' ? dateString.replace(' ', 'T') : dateString;
    const d = new Date(safeDate);
    if (isNaN(d)) return dateString;
    return d.toLocaleDateString(currentLang === 'id' ? 'id-ID' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const safeDate = typeof dateString === 'string' ? dateString.replace(' ', 'T') : dateString;
    const d = new Date(safeDate);
    if (isNaN(d)) return dateString;
    const lang = currentLang === 'id' ? 'id-ID' : 'en-US';
    const dPart = d.toLocaleDateString(lang, { day: '2-digit', month: 'short', year: 'numeric' });
    const tPart = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    return `${dPart}<br><span style="font-size: 11px; opacity: 0.8;">${tPart}</span>`;
}

function timeAgo(dateString) {
    const safeDate = typeof dateString === 'string' ? dateString.replace(' ', 'T') : dateString;
    const date = new Date(safeDate);
    const now = new Date();
    const seconds = Math.round((now - date) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

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
    { title: "Kontak Kami / Bantuan", keywords: "bantuan kontak whatsapp admin hubungi", tab: "feedback" }
];

document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openGlobalSearch();
    }
    if (event.key === "Escape") {
        closeModal('modal-global-search');
        document.querySelectorAll('.overlay').forEach(modal => {
            if (window.getComputedStyle(modal).display !== 'none' && modal.id !== 'welcome-modal') {
                closeModal(modal.id);
            }
        });
    }
});

function openGlobalSearch() {
    const modal = document.getElementById('modal-global-search');
    modal.style.display = 'flex';
    const input = document.getElementById('global-search-input');
    input.value = '';
    renderSearchResults('');
    setTimeout(() => { modal.style.opacity = '1'; input.focus(); }, 10);
}

document.getElementById('global-search-input')?.addEventListener('input', function (e) {
    renderSearchResults(e.target.value);
});

function renderSearchResults(query) {
    const container = document.getElementById('global-search-results');
    if (!container) return;

    if (query.trim() === '') {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; margin: 20px 0;">${currentLang === 'id' ? 'Ketikkan kata kunci (misal: "Magang", "Ujian", "Jadwal")...' : 'Type keywords (e.g., "Internship", "Exam", "Schedule")...'}</p>`;
        return;
    }

    const q = query.toLowerCase();
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
            <div onclick="executeSearchNavigation('${item.tab}')" style="padding: 12px 16px; background: var(--item-bg); border: 1px solid var(--item-border); border-radius: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
                <span style="font-weight: 600; font-size: 14px; color: var(--heading-color);">${escapeHtml(systemText(item.title))}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function executeSearchNavigation(tabId) {
    closeModal('modal-global-search');
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${tabId}'`)) {
            switchTab({ currentTarget: item }, tabId);
        }
    });
}

// ==========================================
// 3. INTERACTIVE DOODLE BACKGROUND
// ==========================================
let doodleCanvas, doodleCtx, doodleAnimationId;
let doodles = [];
let mouse = { x: -1000, y: -1000, radius: 160 };

function initDoodleCanvas() {
    doodleCanvas = document.getElementById('doodle-canvas');
    if (!doodleCanvas || getComputedStyle(doodleCanvas).display === 'none') return;
    doodleCtx = doodleCanvas.getContext('2d');

    resizeDoodleCanvas();
    window.addEventListener('resize', resizeDoodleCanvas);

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
        }
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
        mouse.x = -1000;
        mouse.y = -1000;
    });

    createDoodles();
    animateDoodles();
}

function resizeDoodleCanvas() {
    if (!doodleCanvas) return;
    doodleCanvas.width = window.innerWidth;
    doodleCanvas.height = window.innerHeight;
}

class DoodleItem {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 1.2;
        this.vy = (Math.random() - 0.5) * 1.2;
        this.size = Math.random() * 20 + 15;
        this.strokeWidth = Math.random() * 3 + 3;
        this.type = Math.floor(Math.random() * 6);
        this.color = ['#F4B324', '#8E2122', '#00492C', '#007BFF', '#FF8DA1', '#9C27B0', '#00BCD4', '#FF9800'][Math.floor(Math.random() * 8)];
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.03;
    }

    draw() {
        if (!doodleCtx) return;
        doodleCtx.save();
        doodleCtx.translate(this.x, this.y);
        doodleCtx.rotate(this.rotation);
        doodleCtx.strokeStyle = this.color;
        doodleCtx.fillStyle = this.color;
        doodleCtx.lineWidth = this.strokeWidth;
        doodleCtx.lineCap = 'round';
        doodleCtx.lineJoin = 'round';
        doodleCtx.globalAlpha = 0.85;

        switch (this.type) {
            case 0:
                doodleCtx.beginPath();
                for (let i = 0; i < Math.PI * 5; i += 0.2) {
                    let r = (this.size / 15) * i;
                    let sx = r * Math.cos(i);
                    let sy = r * Math.sin(i);
                    if (i === 0) doodleCtx.moveTo(sx, sy);
                    else doodleCtx.lineTo(sx, sy);
                }
                doodleCtx.stroke(); break;
            case 1:
                doodleCtx.beginPath();
                for (let i = 0; i < 4; i++) {
                    let angle = (i * Math.PI) / 4;
                    doodleCtx.moveTo(Math.cos(angle) * this.size, Math.sin(angle) * this.size);
                    doodleCtx.lineTo(-Math.cos(angle) * this.size, -Math.sin(angle) * this.size);
                }
                doodleCtx.stroke(); break;
            case 2:
                doodleCtx.beginPath();
                doodleCtx.moveTo(-this.size, 0);
                doodleCtx.quadraticCurveTo(-this.size / 2, -this.size * 0.8, 0, 0);
                doodleCtx.quadraticCurveTo(this.size / 2, this.size * 0.8, this.size, 0);
                doodleCtx.stroke(); break;
            case 3:
                doodleCtx.beginPath();
                doodleCtx.moveTo(this.size * 0.5, 0);
                doodleCtx.bezierCurveTo(this.size * 0.8, -this.size * 0.5, -this.size * 0.2, -this.size, -this.size * 0.6, -this.size * 0.2);
                doodleCtx.bezierCurveTo(-this.size * 1.2, this.size * 0.5, -this.size * 0.2, this.size * 0.8, this.size * 0.5, 0);
                doodleCtx.stroke(); break;
            case 4:
                doodleCtx.beginPath(); doodleCtx.arc(0, 0, this.size / 3, 0, Math.PI * 2); doodleCtx.fill();
                doodleCtx.beginPath(); doodleCtx.arc(this.size * 0.8, -this.size * 0.5, this.size / 4, 0, Math.PI * 2); doodleCtx.fill();
                doodleCtx.beginPath(); doodleCtx.arc(-this.size * 0.7, this.size * 0.6, this.size / 5, 0, Math.PI * 2); doodleCtx.fill(); break;
            case 5:
                doodleCtx.beginPath(); let r = this.size * 0.4; doodleCtx.moveTo(0, r);
                doodleCtx.bezierCurveTo(0, -r, -r * 2.5, -r * 1.5, -r * 1.5, r * 0.5);
                doodleCtx.bezierCurveTo(-r, r * 2, 0, r * 2.5, 0, r * 3);
                doodleCtx.bezierCurveTo(0, r * 2.5, r, r * 2, r * 1.5, r * 0.5);
                doodleCtx.bezierCurveTo(r * 2.5, -r * 1.5, 0, -r, 0, r); doodleCtx.stroke(); break;
        }
        doodleCtx.restore();
    }

    update() {
        this.rotation += this.rotSpeed;
        this.x += this.vx; this.y += this.vy;

        if (this.x < 20 || this.x > doodleCanvas.width - 20) this.vx *= -1;
        if (this.y < 20 || this.y > doodleCanvas.height - 20) this.vy *= -1;

        let dx = mouse.x - this.x; let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < mouse.radius) {
            let forceDirectionX = dx / distance; let forceDirectionY = dy / distance;
            let maxDistance = mouse.radius; let force = (maxDistance - distance) / maxDistance;
            this.x -= forceDirectionX * force * 10; this.y -= forceDirectionY * force * 10;
        }
        this.draw();
    }
}

function createDoodles() {
    doodles = [];
    let count = Math.floor((window.innerWidth * window.innerHeight) / 12000);
    count = Math.max(25, Math.min(count, 70));
    for (let i = 0; i < count; i++) {
        let x = Math.random() * (window.innerWidth - 60) + 30;
        let y = Math.random() * (window.innerHeight - 60) + 30;
        doodles.push(new DoodleItem(x, y));
    }
}

function animateDoodles() {
    if (!doodleCtx) return;
    doodleCtx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
    doodles.forEach(d => d.update());
    doodleAnimationId = requestAnimationFrame(animateDoodles);
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
    return fetch(url, { ...options, body: JSON.stringify(payload) }).then(response => { apiRequestContexts.set(response, context); return response; });
}
async function readApiResult(response) {
    const result = await response.json();
    const context = apiRequestContexts.get(response);
    if (context && !['student_login', 'admin_login', 'logout'].includes(context.action)) {
        if (context.epoch !== sessionEpoch || context.token !== getSessionToken()) throw staleRequestError();
        if (result.status === 'error' && /sesi|session|token/i.test(result.message || '')) expireSession();
    }
    return result;
}
async function apiPostSuccess(url, options) {
    const result = await readApiResult(await apiPost(url, options));
    if (result.status !== 'success') throw new Error(result.message || 'Permintaan gagal.');
    return result;
}
async function apiRead() {
    const version = ++readVersion;
    const epoch = sessionEpoch;
    setSyncPhase('syncing');
    try {
    const data = await readApiResult(await apiPost(GAS_URL, {
        method: 'POST', body: JSON.stringify({ action: 'get_data' }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    }));
    if (version !== readVersion) throw staleRequestError();
    if (data.status === 'error') throw new Error(data.message || 'Akses data ditolak.');
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
    applyDynamicLanguage();
    startCountdownWidget();
    renderDynamicContent();
    initDoodleCanvas();

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
    window.IPCOSSop?.reset();
    activeReceipt = null; latestBackup = null;
    languageBlocks.clear();
    resetAcademicJourney();
    documentInspections = new WeakMap(); preflightBusy = false;
    resetWorkflowSession();
    clearCaseBlobUrls();
    ratioChartInstance?.destroy(); typeChartInstance?.destroy();
    ratioChartInstance = null; typeChartInstance = null;
    const chartStatus = document.getElementById('chart-load-status'); if (chartStatus) { chartStatus.hidden = true; chartStatus.textContent = ''; }
    serviceSettings = []; serviceSettingsEditing = false;
    const backupStatus = document.getElementById('backup-status'); if (backupStatus) backupStatus.textContent = '';
    const backupFolder = document.getElementById('backup-folder'); if (backupFolder) { backupFolder.hidden = true; backupFolder.removeAttribute('href'); }
    const serviceFields = document.getElementById('service-settings'); if (serviceFields) serviceFields.innerHTML = '';
    sessionEpoch++; readVersion++;
    ['ipcos_students', 'ipcos_registrations', 'ipcos_dosens', 'ipcos_announcements', 'ipcos_form_draft', 'ipcos_pending_submission'].forEach(key => sessionStorage.removeItem(key));
    DB_MAHASISWA = {}; isDbLoaded = false; selectedCaseId = ''; lastSubmittedCaseId = '';
    currentAdminPage = 1; adminFilteredData = []; currentNotificationIds = [];
    isSubmittingRegistration = false; isPreparingCorrection = false; activeUpdateIds.clear(); postingAnnouncement = false; hideLoader();
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
    document.querySelectorAll('[aria-invalid="true"]').forEach(el => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
    document.querySelectorAll('.overlay, .overlay-dialog').forEach(modal => { if (modal.id !== 'welcome-modal') closeModal(modal.id, true); });
    ['table-admin-reg','table-master-mhs','table-admin-dosen','table-my-status','student-mobile-list','admin-mobile-list','task-home','notif-list-container','case-detail-content','submission-receipt-content','activity-timeline-container','chat-timeline-container'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
    ['notif-dropdown','notif-badge','announcement-banner','alert-revision-student','alert-checklist-reminder'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.admin-only, .student-only').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.chk-magang, .chk-skripsi').forEach(el => { el.checked = false; });
    renderAcademicStages();
    document.getElementById('admin-search-input').value = ''; document.getElementById('admin-status-filter').value = 'ACTION_REQUIRED';
    ['input-nim','input-admin-user','input-admin-pass','input-broadcast-dashboard','input-broadcast','add-nim','add-nama','add-dosen-nama','input-rev-note','input-reply-note','input-reply-file'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    editorTempData = [];
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
        renderTableSkeleton('table-master-mhs', 4, 4);
    } else if (currentUser.role === 'mhs') {
        renderTableSkeleton('table-my-status', 3, 5);
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
            sessionStorage.setItem('ipcos_announcements', JSON.stringify(data.announcements || []));
            renderNotifications();
            refreshServiceAvailability();

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
                    const bannerText = document.getElementById('announcement-text');
                    if (bannerText) {
                        bannerText.innerText = latest.Pesan || latest.message;
                        document.getElementById('announcement-banner').style.display = 'flex';
                    }

                    const annType = latest.Tipe || latest.type;
                    const annId = latest.Id || latest.date || latest.message;

                    const isHiddenPermanently = localStorage.getItem('hide_announcement_' + annId);
                    const isHiddenSession = sessionStorage.getItem('seen_announcement_' + annId);

                    if (annType === 'important' && !isHiddenPermanently && !isHiddenSession) {
                        document.getElementById('important-announcement-text').innerText = latest.Pesan || latest.message;
                        const modal = document.getElementById('modal-important-announcement');
                        if (modal) {
                            document.getElementById('chk-dont-show-announcement').checked = false;
                            modal.setAttribute('data-current-ann-id', annId);
                            modal.style.display = 'flex';
                            setTimeout(() => { modal.style.opacity = '1'; }, 10);
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
                    localStorage.setItem(`ipcos_content_${item.Tipe}`, item.DataJSON);
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
async function performLogin(role) {
    if (loginBusy) return;
    const student = role === 'mhs';
    const errorMsg = document.getElementById(student ? 'error-msg-mhs' : 'error-msg-admin');
    const nim = document.getElementById('input-nim').value.trim();
    const username = document.getElementById('input-admin-user').value.trim();
    const password = document.getElementById('input-admin-pass').value.trim();
    if (student ? !nim : !username || !password) {
        errorMsg.textContent = student ? uxText('Mohon masukkan NIM Anda.', 'Please enter your student ID.') : uxText('Username dan password wajib diisi.', 'Username and password are required.');
        errorMsg.style.display = 'block'; return;
    }
    if (isOffline) { errorMsg.textContent = uxText('Login membutuhkan koneksi internet.', 'Login requires an internet connection.'); errorMsg.style.display = 'block'; return; }
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
        errorMsg.textContent = systemText(error.message) || uxText('Terjadi kesalahan jaringan. Coba kembali.', 'Network error. Try again.'); errorMsg.style.display = 'block';
    } finally { if (attempt === loginAttempt) { loginBusy = false; resetLoginButtons(); } }
}
function loginMhs() { return performLogin('mhs'); }
function loginAdmin() { return performLogin('admin'); }
document.querySelectorAll('#form-mhs input, #form-admin input').forEach(input => input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (!loginBusy) input.form.requestSubmit();
}));

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

    if (doodleAnimationId) {
        cancelAnimationFrame(doodleAnimationId);
    }

    setTimeout(() => {
        if (loginEpoch !== sessionEpoch || getSessionToken() !== token) return;
        document.getElementById('welcome-modal').style.display = 'none';
        scheduleCat();
        syncDatabase();
        applyDynamicLanguage();
    }, 400);
}

function logoutUser() {
    const msg = currentLang === 'id' ? "Apakah Anda yakin ingin keluar?" : "Are you sure you want to log out?";
    if (confirm(msg + ((registrationDirty || caseEditorDirty() || isSubmittingRegistration || isPreparingCorrection) ? uxText(' Isian yang belum dikirim akan ditinggalkan.',' Unsent inputs will be discarded.') : ''))) {
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
        initDoodleCanvas();
        setTimeout(() => { modal.style.opacity = '1'; }, 10);
    }
}

// ==========================================
// 5. NOTIFICATION & ACTIVITY TIMELINE
// ==========================================
function renderNotifications() {
    renderTaskHome();
    const listContainer = document.getElementById('notif-list-container');
    const badgeEl = document.getElementById('notif-badge');
    if (!listContainer) return;

    const notifs = [];
    const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    records.forEach(rec => {
        const status = String(rec.status || '').toLowerCase();
        const isStudent = currentUser.role === 'mhs';
        if (isStudent && String(rec.nim) !== String(currentUser.nim)) return;
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

    notifs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
    try { localStorage.setItem(notificationReadKey(), JSON.stringify([...new Set(ids)].slice(-100))); } catch (_) {}
}
function openNotification(key, caseId, tabName) {
    saveReadNotificationIds([...getReadNotificationIds(), key]);
    renderNotifications();
    switchTab(null, tabName);
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    if (caseId) openCaseDetail(caseId);
}

function toggleNotifDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none' || !dropdown.style.display;
        dropdown.style.display = isHidden ? 'block' : 'none';
    }
}

function markAllNotificationsRead() {
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
    myRecords.sort((a,b) => new Date(getCaseEventTime(b))-new Date(getCaseEventTime(a))).slice(0, 5).forEach(r => {
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        validateFile(fileInput, labelId);
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
    if (indicator) indicator.textContent = systemText('Draf isian tersimpan di tab ini.');
}

function loadFormDraft() {
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
        renderRegistrationReadiness();
    } catch (e) { }
}

function clearFormDraft() {
    registrationDirty = false;
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
    if (message) input.setAttribute('aria-describedby', errorId);
    else input.removeAttribute('aria-describedby');
}
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
    preflightBusy = true;
    document.getElementById('form-submit-status').ipcosNotice=null;
    document.getElementById('form-submit-status-steps')?.remove();
    document.getElementById('form-submit-status').textContent = uxText('Memeriksa format berkas...', 'Checking document formats...');
    try { await inspectRegistrationDocuments(); } finally { if (epoch === sessionEpoch) preflightBusy = false; }
    if (epoch !== sessionEpoch || type !== document.getElementById('reg-jenis-utama').value) return;
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
            return `<li><strong>${escapeHtml(systemText(label))}</strong><span>${escapeHtml(f.name)} · ${formatFileSize(f.size)}</span></li>`;
        }).join('')}</ul>${registrationWarnings().map(message=>`<p class="preflight-warning">${escapeHtml(message)}</p>`).join('')}<p>${uxText('Format dasar berkas sudah diperiksa. Isi, tanda tangan, dan kelayakan akademik tetap diverifikasi admin.', 'Basic file formats have been checked. Admin will verify the contents, signatures and academic eligibility.')}</p><p>${uxText('Setelah dikirim, pengajuan akan masuk ke antrean admin.', 'Your request will enter the admin review queue after submission.')}</p>
        <button type="button" class="btn-secondary" id="btn-edit-registration" onclick="editRegistration()">${uxText('Kembali Mengubah', 'Back to Editing')}</button>`;
}

function editRegistration() {
    if (isSubmittingRegistration) return;
    document.getElementById('registration-fields').hidden = false;
    document.getElementById('reg-jenis-utama').disabled = false;
    document.getElementById('registration-review').hidden = true;
    document.getElementById('btn-review-registration').hidden = false;
    document.getElementById('btn-submit-registration').hidden = true;
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
    const heading = String(item.status).toLowerCase() === 'resubmitted' ? uxText('Instruksi revisi sebelumnya', 'Previous correction instructions') : currentUser.role === 'admin' ? uxText('Instruksi untuk mahasiswa', 'Instructions for the student') : uxText('Yang perlu Anda perbaiki', 'Corrections requested');
    return `<section class="revision-instructions"><h3>${heading}</h3>
        ${rev.files.length ? `<ul>${rev.files.map(label => `<li>${escapeHtml(systemText(label))}</li>`).join('')}</ul>` : ''}
        <p class="preserve-lines">${escapeHtml(rev.instruction)}</p></section>`;
}
function renderTaskHome() {
    renderAcademicJourney();
    const home = document.getElementById('task-home');
    if (!home) return;
    if (!['admin','mhs'].includes(currentUser.role)) { home.innerHTML = ''; return; }
    const all = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    const admin = currentUser.role === 'admin';
    const records = admin ? all : all.filter(item => String(item.nim) === String(currentUser.nim));
    const priority = item => { const status = String(item.status).toLowerCase(); return admin ? ({resubmitted:0,pending:1,revision:2,accepted:3}[status] ?? 4) : ({revision:0,resubmitted:1,pending:2,accepted:3}[status] ?? 4); };
    const actionable = records.filter(item => admin ? ['pending','resubmitted'].includes(String(item.status).toLowerCase()) : String(item.status).toLowerCase() !== 'accepted');
    actionable.sort((a,b) => priority(a)-priority(b) || new Date(getCaseEventTime(a))-new Date(getCaseEventTime(b)));
    const visibleCases = actionable.length ? actionable.slice(0,3) : records.slice().sort((a,b) => new Date(getCaseEventTime(b))-new Date(getCaseEventTime(a))).slice(0,1);
    const revisions = records.filter(item => String(item.status).toLowerCase() === 'revision').length;
    const title = admin ? uxText('Antrean kerja Anda', 'Your review queue') : uxText('Pengajuan Anda', 'Your requests');
    const subtitle = admin ? `${actionable.length} ${uxText('pengajuan perlu ditinjau. Perbaikan masuk ditampilkan lebih dulu.', actionable.length === 1 ? 'request needs review. Resubmissions appear first.' : 'requests need review. Resubmissions appear first.')}`
        : revisions ? `${revisions} ${uxText('pengajuan membutuhkan perbaikan Anda.', revisions === 1 ? 'request needs your corrections.' : 'requests need your corrections.')}` : uxText('Lihat langkah berikutnya atau mulai pengajuan baru.', 'See your next step or start a new request.');
    home.innerHTML = `<div class="task-home-header"><div><h2>${title}</h2><p>${subtitle}</p></div>
        <button type="button" class="btn-primary" onclick="${admin ? "switchTab(null, 'admin-data');setAdminQueueFilter('ACTION_REQUIRED')" : "switchTab(null, 'pendaftaran')"}">${admin ? uxText('Buka Antrean', 'Open Queue') : uxText('Buat Pengajuan', 'New Request')}</button></div>
        <div class="task-home-list">${(admin ? actionable.length : visibleCases.length) ? visibleCases.map(item => `<article class="task-card"><div><h3>${escapeHtml(systemText(item.jenis))}</h3>${admin ? `<p>${escapeHtml(item.nama)} · ${escapeHtml(item.nim)}</p>` : ''}${window.IPCOSReview?.statusHtml(item,{compact:true}) || getStatusBadge(item.status)+`<p>${escapeHtml(caseNextStep(item))}</p>`+waitingHtml(item)}</div>
        <button type="button" class="btn-secondary" data-case-id="${escapeHtml(item.id)}">${admin ? uxText('Periksa Pengajuan','Review Request') : String(item.status).toLowerCase() === 'revision' ? uxText('Lanjutkan Perbaikan','Continue Corrections') : String(item.status).toLowerCase() === 'accepted' ? uxText('Lihat Hasil','View Result') : uxText('Lihat Pengajuan','View Request')}</button></article>`).join('')
        : `<div class="task-empty">${admin ? uxText('Semua pengajuan sudah ditindaklanjuti.', 'All requests have been addressed.') : records.length ? uxText('Pengajuan Anda sudah selesai diverifikasi.', 'Your requests have been verified.') : uxText('Belum ada pengajuan. Mulai dengan memilih jenis pendaftaran.', 'No requests yet. Start by choosing a request type.')}</div>`}</div>
        <div class="task-home-footer"><button type="button" class="task-history" onclick="switchTab(null, '${admin ? 'admin-data' : 'student-status'}')${admin ? ";setAdminQueueFilter('ALL')" : ''}">${uxText('Lihat Semua Pengajuan', 'View All Requests')} (${records.length})</button>${admin ? '' : `<button type="button" class="btn-secondary" onclick="switchTab(null,'academic-journey')">${uxText('Buka Perjalanan Akademik', 'Open Academic Journey')}</button>`}</div>`;
}
function caseFileListHtml(item) {
    const files = getCaseFiles(item);
    let logs=[]; try { logs=JSON.parse(item.note || '[]'); } catch (_) {}
    const metadata=Array.isArray(logs)?logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]):[];
    const rows=files.map((file,index)=>{const doc=metadata.find(doc=>doc.url===file.url); return {...file,index,document:doc};});
    const latest=new Map(); rows.filter(row=>row.document).forEach(row=>{const old=latest.get(row.document.label); if(!old || Number(row.document.version)>Number(old.document.version)) latest.set(row.document.label,row);});
    const html=row=>`<div class="case-file-row"><div><strong>${escapeHtml(documentText(row.document?.label || row.label))}</strong>${row.document?`<small class="document-version">${uxText('Versi','Version')} ${Number(row.document.version)} · ${escapeHtml(row.document.fileName)}</small>`:''}</div><div class="button-row"><button type="button" class="btn-secondary" data-preview-index="${row.index}">${uxText('Pratinjau','Preview')}</button>${isPrivateDriveUrl(row.url)?`<button type="button" class="btn-secondary" data-document-index="${row.index}">${systemText('Unduh Berkas')}</button>`:`<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${uxText('Buka Berkas','Open File')}</a>`}</div></div>`;
    const current=rows.filter(row=>row.document && latest.get(row.document.label)===row);
    const old=rows.filter(row=>!current.includes(row));
    if(!current.length) return files.length?`<p class="field-helper">${systemText('Berkas lama belum memiliki penanda versi. Periksa tanggal dan nama berkas sebelum meninjau.')}</p>`+rows.map(html).join(''):uxText('Belum ada berkas.','No files available.');
    return `<h4>${systemText('Versi terbaru')}</h4>`+current.map(html).join('')+(old.length?`<details class="case-history"><summary>${uxText('Versi sebelumnya dan berkas lama','Previous versions & older files')} (${old.length})</summary>`+old.map(html).join('')+'</details>':'');
}

function previewCaseFile(index) {
    const item = readStoredJSON(sessionStorage, 'ipcos_registrations', []).find(item => String(item.id) === selectedCaseId);
    const file = item && getCaseFiles(item)[index];
    if (!file) return;
    if (isPrivateDriveUrl(file.url)) { accessCaseDocument(index,true); return; }
    const preview = document.getElementById('case-file-preview');
    preview.hidden = false;
    const iframe = preview.querySelector('iframe');
    iframe.src = file.url.includes('drive.google.com') ? file.url.replace(/\/view.*$/, '/preview').replace(/\/edit.*$/, '/preview') : file.url;
    iframe.title = uxText('Pratinjau: ', 'Preview: ') + documentText(file.label);
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
    if (!item || (currentUser.role === 'mhs' && String(item.nim) !== String(currentUser.nim))) return null;
    return item;
}
function caseDetailAction(action) {
    const item = currentCase();
    if (!item || activeUpdateIds.has(item.id)) return;
    const status = String(item.status).toLowerCase();
    if (currentUser.role === 'admin' ? !['pending','resubmitted'].includes(status) : currentUser.role !== 'mhs' || status !== 'revision' || action !== 'reply') return;
    window.IPCOSReview?.restoreActions();
    const panel = document.getElementById('case-action-panel');
    panel.dataset.action = action; panel.dataset.dirty = 'false';
    let html = '';
    if (action === 'revision') {
        const files = caseDocumentOptions(item);
        html = `<h3>${uxText('Minta perbaikan', 'Request Corrections')}</h3><fieldset class="revision-file-options"><legend>${uxText('Pilih berkas yang perlu diperbaiki', 'Select files needing corrections')}</legend>${files.map(label => `<label class="check-row"><input type="checkbox" name="revision-document" value="${escapeHtml(label)}"><span>${escapeHtml(systemText(label))}</span></label>`).join('')}<label class="check-row"><input type="checkbox" name="revision-document" value="Isian pengajuan"><span>${uxText('Isian pengajuan', 'Request details')}</span></label></fieldset>
        ${revisionTemplateHtml()}<label for="case-revision-note">${uxText('Apa yang harus diperbaiki?','What needs correcting?')}</label><textarea id="case-revision-note" rows="4" placeholder="${uxText('Contoh: Unggah transkrip yang sudah disahkan.','Example: Upload an officially certified transcript.')}"></textarea>`;
    } else if (action === 'dospem') {
        html = `<h3>${uxText('Tunjuk dosen & selesaikan', 'Assign Supervisor & Complete')}</h3><label for="case-supervisor">${uxText('Dosen pembimbing', 'Supervisor')}</label><select id="case-supervisor">${supervisorOptions()}</select><p>${uxText('Dosen terpilih akan dicatat saat pengajuan disetujui.','The selected supervisor will be recorded when this request is approved.')}</p>`;
    } else if (action === 'accept') {
        html = `<h3>${uxText('Selesaikan pengajuan', 'Complete Request')}</h3><p>${uxText('Pastikan seluruh berkas sudah diperiksa. Persetujuan akan terlihat oleh mahasiswa.', 'Confirm all documents have been reviewed. The student will see your approval.')}</p>`;
    } else if (action === 'reply') {
        const rev = getRevisionInstructions(item);
        html = `<h3>${uxText('Kirim perbaikan Anda', 'Send Your Corrections')}</h3>${rev.files.length ? `<fieldset class="revision-file-options"><legend>${uxText('Konfirmasi yang sudah Anda perbaiki', 'Confirm Your Corrections')}</legend>${rev.files.map(label => `<label class="check-row"><input type="checkbox" name="correction-complete"><span>${escapeHtml(systemText(label))}</span></label>`).join('')}</fieldset>` : ''}
        <label for="case-reply-files">${uxText('Berkas perbaikan · maksimal 10 MB per berkas', 'Corrected files · maximum 10 MB per file')}</label><input type="file" id="case-reply-files" multiple accept="${item.jenis === 'Pendadaran' ? '.pdf,.zip,.rar' : '.pdf,.doc,.docx'}"><p class="field-helper">${uxText('Pilih hingga 5 berkas dengan total maksimal 20 MB. Berkas lama tetap ada dalam riwayat.', 'Choose up to 5 files, 20 MB total. Previous files remain in the history.')}</p><div id="case-reply-file-list"></div><label for="case-reply-note">${uxText('Jelaskan perbaikan Anda', 'Describe Your Corrections')}</label><textarea id="case-reply-note" rows="3"></textarea>`;
    }
    if (!html) return;
    panel.innerHTML = `${html}<p id="case-action-feedback" class="field-error" role="status"></p><div class="button-row"><button type="button" class="btn-secondary" onclick="cancelCaseAction()">${uxText('Batal','Cancel')}</button><button type="button" id="btn-case-submit" class="btn-primary" onclick="submitCaseAction()">${action === 'revision' ? uxText('Kirim Instruksi Revisi','Send Correction Request') : action === 'reply' ? uxText('Kirim Perbaikan','Send Corrections') : uxText('Konfirmasi & Selesaikan','Confirm & Complete')}</button></div>`;
    bindLanguageBlock(panel);
    panel.hidden = false;
    document.getElementById('case-detail-actions').hidden = true;
    const reply = document.getElementById('case-reply-files');
    if (reply) reply.addEventListener('change', () => {
        document.getElementById('case-reply-file-list').innerHTML = [...reply.files].map(file => `<p>${escapeHtml(file.name)} · ${formatFileSize(file.size)}${fileProblem(file, reply.accept) ? `<span class="field-error">${escapeHtml(fileProblem(file, reply.accept))}</span>` : ''}</p>`).join('');
    });
    (panel.querySelector('textarea, select, input') || panel.querySelector('button')).focus();
    window.IPCOSReview?.actionsChanged();
}
function cancelCaseAction() {
    if (activeUpdateIds.has(selectedCaseId) || isPreparingCorrection) return;
    if (!confirmLeaveCase()) return;
    window.IPCOSReview?.restoreActions();
    document.getElementById('case-action-panel').dataset.dirty = 'false';
    document.getElementById('case-action-panel').hidden = true;
    document.getElementById('case-detail-actions').hidden = false;
    window.IPCOSReview?.actionsChanged();
}
let isPreparingCorrection = false;
async function submitCaseAction() {
    const item = currentCase();
    if (!item || activeUpdateIds.has(item.id) || isPreparingCorrection) return;
    const panel = document.getElementById('case-action-panel');
    const action = panel.dataset.action;
    const feedback = document.getElementById('case-action-feedback');
    feedback.ipcosNotice=null;
    const fail = (message,field=null) => { feedback.textContent = systemText(message); field?.focus(); return false; };
    const status = String(item.status).toLowerCase();
    if (currentUser.role === 'admin' ? !['pending','resubmitted'].includes(status) : currentUser.role !== 'mhs' || status !== 'revision' || action !== 'reply') { fail(uxText('Status berubah. Segarkan pengajuan.', 'The status changed. Refresh the request.')); return; }
    let note = '', newStatus = 'Accepted', files = [], dospem = null, correctionLabels = [];
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
        if (!chosen.length || !note) return fail(uxText('Pilih berkas perbaikan dan jelaskan perubahan Anda.', 'Select corrected files and describe your changes.'));
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
    window.IPCOSReview?.actionsChanged();
    const requestEpoch = sessionEpoch;
    try {
        if (action === 'reply') {
            const inspections = await Promise.all(files.map(inspectDocument));
            if (requestEpoch !== sessionEpoch) return;
            const problem = inspections.find(result=>result.error);
            if (problem) { fail(systemText(problem.error)); return; }
        }
        const labels = correctionLabels;
        const payloadFiles = await Promise.all(files.map(async (file,index) => ({label:labels[index],fileName:file.name,mimeType:file.type,base64:await fileToBase64(file)})));
        if (requestEpoch !== sessionEpoch) return;
        // Escape user text before it enters the existing rich-text note history.
        setSubmissionStage('case-action-feedback','sending');
        const success = await sendUpdateRequest(item.id, newStatus, escapeHtml(note), payloadFiles, dospem);
        if (requestEpoch !== sessionEpoch) return;
        setSubmissionStage('case-action-feedback',success?'confirmed':'uncertain');
        if (success) panel.dataset.dirty='false';
        if (success && selectedCaseId === String(item.id) && document.getElementById('modal-case-detail').style.display !== 'none') openCaseDetail(item.id);
        else if (!success && document.getElementById('case-action-feedback')) setProcessNotice('case-action-feedback','case-uncertain');
    } catch (error) { if (requestEpoch !== sessionEpoch) return; setSubmissionStage('case-action-feedback','error'); setProcessNotice('case-action-feedback','case-error',error.message); }
    finally {
        if (requestEpoch === sessionEpoch) isPreparingCorrection = false;
        if (requestEpoch === sessionEpoch && button.isConnected) { button.disabled = false; button.textContent = uxText('Coba Simpan Lagi', 'Try Saving Again'); }
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

    document.getElementById('req-outline-only').style.display = 'none';
    document.getElementById('req-sempro-only').style.display = 'none';
    document.getElementById('req-pendadaran').style.display = 'none';
    document.getElementById('req-jurnal-only').style.display = 'none';
    document.getElementById('req-ganti-dosen').style.display = 'none';

    if (jenisUjian === "") { formContainer.style.display = 'none'; return; }
    formContainer.style.display = 'block';

    // Logika Khusus untuk Pergantian Pembimbing (Sembunyikan Judul)
    if (jenisUjian === "Pergantian Pembimbing") {
        groupJudul.style.display = 'none';
        inputJudul.removeAttribute('required');
        document.getElementById('req-ganti-dosen').style.display = 'block';
    } else {
        groupJudul.style.display = 'block';
        inputJudul.setAttribute('required', 'true');

        if (jenisUjian === "Outline") document.getElementById('req-outline-only').style.display = 'block';
        else if (jenisUjian === "Proposal") document.getElementById('req-sempro-only').style.display = 'block';
        else if (jenisUjian === "Pendadaran") document.getElementById('req-pendadaran').style.display = 'block';
        else if (jenisUjian === "Skripsi Jurnal") document.getElementById('req-jurnal-only').style.display = 'block';
    }
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
    document.getElementById('btn-edit-registration').disabled = true;
    submitButton.disabled = true;
    submitButton.textContent = systemText('Sedang mengirim...');
    setSubmissionStage('form-submit-status','preparing');
    setProcessNotice('form-submit-status','form-preparing');

    let finalDetail = `<b>Judul:</b> ${document.getElementById('reg-judul').value}`;

    try {
        showLoader(currentLang === 'id' ? 'Mengompresi & Memproses Berkas...' : 'Compressing & Processing Files...');

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
            finalDetail = `<b>Dosen Lama:</b> ${dLama}<br><b>Dosen Baru:</b> ${dBaru}<br><b>Alasan:</b> ${kets}`;
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
            showToast(currentLang === 'id' ? "Pendaftaran & Berkas berhasil dikirim!" : "Registration & Files submitted successfully!", "success");
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
        hideLoader();
        }
    }
}

function showSubmissionReceipt(receipt) {
    activeReceipt = receipt;
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
    const text = String(value).trim();
    const months = {jan:0,feb:1,mar:2,apr:3,mei:4,may:4,jun:5,jul:6,agu:7,ags:7,aug:7,sep:8,okt:9,oct:9,nov:10,des:11,dec:11};
    const localized = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    let year,month,day;
    if (localized) { day=Number(localized[1]);month=months[localized[2].slice(0,3).toLowerCase()];year=Number(localized[3]); }
    else if (iso) { year=Number(iso[1]);month=Number(iso[2])-1;day=Number(iso[3]); }
    else return null;
    if (month === undefined || year < 1900 || year > 2200) return null;
    const date = new Date(Date.UTC(year,month,day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}
function downloadICS(title, dateStr) {
    const date = academicCalendarDate(dateStr);
    if (!date) { showToast(uxText('Format tanggal tidak valid untuk diekspor', 'Invalid date format for export'), 'error'); return; }
    const compact = date => date.toISOString().slice(0,10).replaceAll('-','');
    const nextDay = new Date(date.getTime()+86400000);
    const escapeCalendar = value => String(value).replaceAll('\\','\\\\').replace(/\r?\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');
    const event = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//IPCOS UMY//Academic Calendar//EN','BEGIN:VEVENT',
        'UID:'+Date.now()+'@ipcos.umy.ac.id',
        'DTSTAMP:'+new Date().toISOString().replace(/-|:|\.\d+/g,'').slice(0,15)+'Z',
        'DTSTART;VALUE=DATE:'+compact(date),'DTEND;VALUE=DATE:'+compact(nextDay),
        'SUMMARY:'+escapeCalendar(uxText('Batas Pendaftaran Yudisium - ', 'Graduation clearance deadline - ')+contentText(title)),
        'DESCRIPTION:'+escapeCalendar(uxText('Pengingat batas pendaftaran Yudisium IPCOS UMY. Pastikan seluruh berkas dikumpulkan sesuai ketentuan program studi.', 'IPCOS UMY graduation clearance reminder. Submit the required documents according to study program rules.')),
        'END:VEVENT','END:VCALENDAR',''].join('\r\n');
    const url = URL.createObjectURL(new Blob([event],{type:'text/calendar;charset=utf-8'}));
    const link = document.createElement('a');link.href=url;link.download='IPCOS-calendar-'+compact(date)+'.ics';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    showToast(uxText('Berkas Kalender berhasil diunduh!', 'Calendar file downloaded!'),'success');
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
    { title: "Daftar Berkas", items: [
        { id: "t1", text: "Logbook Magang (.docx)", sub: "#" },
        { id: "t2", text: "Lembar Pengesahan Skripsi (.docx)", sub: "#" },
        { id: "t3", text: "Form Bebas Pustaka (.pdf)", sub: "#" }
    ]}
];

const defaultFaq = [
    { title: "Daftar Pertanyaan", items: [
        { id: "f1", text: "Bagaimana jika file PDF saya lebih dari 10MB?", sub: "Silakan kompres file Anda terlebih dahulu menggunakan layanan gratis seperti ilovepdf.com sebelum diunggah ke sistem." },
        { id: "f2", text: "Kapan batas waktu revisi proposal?", sub: "Batas revisi ujian proposal adalah 1 (satu) bulan setelah ujian dilaksanakan." }
    ]}
];

function getChecklistData(type) {
    const localData = localStorage.getItem(`ipcos_content_${type}`);
    if (localData) {
        try { const groups = JSON.parse(localData); if (!Array.isArray(groups) || groups.some(group => !group || !Array.isArray(group.items))) throw new Error('Invalid content'); return groups; } catch (_) { localStorage.removeItem(`ipcos_content_${type}`); }
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
    const types = ['magang', 'skripsi', 'kurikulum', 'remidial', 'kalender', 'template_berkas', 'faq'];

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
        else if (type === 'template_berkas') {
            data.forEach(group => {
                group.items.forEach(item => {
                    html += `<li style="background: var(--item-bg); padding: 12px; border: 1px solid var(--item-border); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span style="font-size: 13.5px; font-weight: 600;">${item.text}</span>
                            <a href="${item.sub}" target="_blank" class="btn-secondary" style="width: auto; min-height: 30px; padding: 5px 10px; font-size: 12px; text-decoration: none; display: flex; align-items: center;">Unduh</a>
                        </li>`;
                });
            });
        }
        else if (type === 'faq') {
            data.forEach(group => {
                group.items.forEach(item => {
                    html += `<details style="margin-bottom: 10px; border: 1px solid var(--item-border); border-radius: 8px;">
                            <summary style="padding: 12px; font-weight: 600; font-size: 13.5px; cursor: pointer;">${item.text}</summary>
                            <div style="padding: 12px; font-size: 13px; color: var(--text-muted); border-top: 1px solid var(--item-border); line-height: 1.5;">${item.sub}</div>
                        </details>`;
                });
            });
        }
        container.innerHTML = html;
    });

    if (currentUser && currentUser.role === 'mhs') {
        loadProgressData();
    }
    renderAcademicStages();
}

// EDITOR KONTEN UI
let editorTempData = [];
let editorCurrentType = 'magang';

function openContentEditor(type) {
    editorCurrentType = type;
    editorTempData = JSON.parse(JSON.stringify(getChecklistData(type)));

    const titles = {
        'magang': 'Edit Konten Magang',
        'skripsi': 'Edit Konten Skripsi',
        'kurikulum': 'Edit Konten Kurikulum',
        'remidial': 'Edit SOP Remidial',
        'kalender': 'Edit Kalender TA',
        'template_berkas': 'Edit Template & Link Download',
        'faq': 'Edit Pertanyaan & Jawaban FAQ'
    };
    document.getElementById('editor-modal-title').innerText = systemText(titles[type]);
    renderEditorUI();

    const modal = document.getElementById('modal-edit-content');
    modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

function renderEditorUI() {
    const container = document.getElementById('editor-ui-container');
    let html = '';

    editorTempData.forEach((group, gIdx) => {
        html += `<div class="card" style="padding: 15px; margin-bottom: 15px; box-shadow:none; border:1px solid var(--item-border);">
            <div style="display:flex; justify-content:space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                <input type="text" value="${escapeHtml(group.title)}" onchange="editorTempData[${gIdx}].title = this.value" style="font-weight:bold; flex: 1; margin-bottom:0;" placeholder="${uxText('Judul Kategori Utama','Category title')}">
                <button class="action-btn btn-rev" onclick="removeContentGroup(${gIdx})">${uxText('Hapus Kategori','Delete category')}</button>
            </div>
            <label class="editor-translation-label">${uxText('Judul kategori dalam English (opsional)', 'Category title in English (optional)')}<input type="text" value="${escapeHtml(group.titleEn || '')}" onchange="editorTempData[${gIdx}].titleEn = this.value"></label>
            <div style="margin-left: 10px; border-left: 2px solid var(--item-border); padding-left: 10px;">`;

        group.items.forEach((item, iIdx) => {
            html += `<div style="display:flex; gap:8px; margin-bottom: 10px; align-items:center;">
                <div style="flex-grow:1;">
                    <input type="text" value="${escapeHtml(item.text)}" placeholder="${uxText('Data Utama','Main text')}" onchange="editorTempData[${gIdx}].items[${iIdx}].text = this.value" style="margin-bottom:5px; padding: 10px;">
                    <input type="text" value="${escapeHtml(item.sub)}" placeholder="${uxText('Deskripsi/Detail','Description / Details')}" onchange="editorTempData[${gIdx}].items[${iIdx}].sub = this.value" style="margin-bottom:0; padding: 10px; font-size:13px;">
                </div>
                <button class="action-btn btn-rev" onclick="removeContentItem(${gIdx}, ${iIdx})" style="height: 40px; padding: 0 12px;">X</button>
            </div><details class="editor-translations"><summary>${uxText('English untuk mahasiswa internasional (opsional)', 'English for international students (optional)')}</summary><div class="details-content"><label>${uxText('Teks English','English text')}<input type="text" value="${escapeHtml(item.textEn || '')}" onchange="editorTempData[${gIdx}].items[${iIdx}].textEn = this.value"></label>${editorCurrentType !== 'template_berkas' ? `<label>${uxText('Detail English','English details')}<textarea rows="2" onchange="editorTempData[${gIdx}].items[${iIdx}].subEn = this.value">${escapeHtml(item.subEn || '')}</textarea></label>` : ''}</div></details>`;
        });

        html += `<button class="action-btn btn-acc" onclick="addContentItem(${gIdx})" style="width:auto; margin-top:5px;">${uxText('+ Tambah Item','+ Add item')}</button>
            </div></div>`;
    });

    html += `<button class="btn-secondary" style="background:var(--umy-gold); color:black; width:100%; margin-top: 10px;" onclick="addContentGroup()">${uxText('+ Tambah Kategori Baru','+ Add category')}</button>`;

    container.innerHTML = html;
    bindLanguageBlock(container);
}

function addContentGroup() { editorTempData.push({ title: "Kategori Baru", items: [] }); renderEditorUI(); }
function removeContentGroup(gIdx) { if (confirm(uxText('Hapus kategori ini beserta item di dalamnya?', 'Delete this category and all its items?'))) { editorTempData.splice(gIdx, 1); renderEditorUI(); } }
function addContentItem(gIdx) { editorTempData[gIdx].items.push({ id: Date.now().toString(36), text: "", sub: "" }); renderEditorUI(); }
function removeContentItem(gIdx, iIdx) { editorTempData[gIdx].items.splice(iIdx, 1); renderEditorUI(); }

async function saveContentChanges() {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') { document.activeElement.blur(); }

    if (isOffline) {
        showToast(currentLang === 'id' ? "Anda sedang offline. Tidak dapat menyimpan." : "You are offline. Cannot save changes.", "error");
        return;
    }

    const jsonString = JSON.stringify(editorTempData);

    showLoader(currentLang === 'id' ? 'Menyimpan & Mensinkronisasi...' : 'Saving & Syncing...');

    try {
        const payload = { action: 'update_content', type: editorCurrentType, content: jsonString };
        const res = await apiPost(GAS_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await readApiResult(res);

        if (result.status === "success") {
            localStorage.setItem(`ipcos_content_${editorCurrentType}`, jsonString);
            closeModal('modal-edit-content');
            showToast("Konten berhasil diperbarui untuk semua pengguna!", "success");
            renderDynamicContent();
        } else {
            showToast("Gagal tersimpan di database: " + result.message, "error");
        }
    } catch (e) {
        showToast("Terjadi kesalahan jaringan saat menyimpan.", "error");
    } finally {
        hideLoader();
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
        if (!journeyCloud.supported) localStorage.setItem(`progress_${currentUser.nim}`, JSON.stringify(state));
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
    refreshServiceAvailability();
    document.querySelectorAll('#registration-fields .dz-remove-btn').forEach(button=>button.textContent=uxText('Hapus File','Remove file'));
    const draftStatus = document.getElementById('form-draft-status');
    if (draftStatus.textContent) draftStatus.textContent = systemText('Draf isian tersimpan di tab ini.');
    if (currentUser.role === 'admin') { loadAdminData(); renderServiceSettings(); renderDashboardCharts(readStoredJSON(sessionStorage,'ipcos_registrations',[])); renderDosenTable(); renderMasterMahasiswa(readStoredJSON(sessionStorage,'ipcos_students',[])); if (latestBackup) renderBackupStatus(latestBackup); }
    else if (currentUser.role === 'mhs') { loadStudentStatus(); renderActivityTimeline(readStoredJSON(sessionStorage,'ipcos_registrations',[])); }
    renderNotifications();
    renderTaskHome();
    if (!document.getElementById('registration-review').hidden) renderRegistrationReview();
    document.querySelectorAll('#registration-fields [aria-invalid="true"]').forEach(input => setFieldError(input.id,input.type === 'file' ? fileProblem(input.files[0],input.accept) : registrationTextIssue(input.id)));
    if (activeReceipt && document.getElementById('modal-submission-receipt').style.display === 'flex') showSubmissionReceipt(activeReceipt);
    if (selectedCaseId && document.getElementById('modal-case-detail').style.display === 'flex') openCaseDetail(selectedCaseId,true);
    if (document.getElementById('modal-global-search').style.display === 'flex') renderSearchResults(document.getElementById('global-search-input').value);
}

function applyDynamicLanguage() {
    applyStaticLanguage();
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
        <div class="preserve-lines">${localizedSystemNote(log.message || '')}</div></div>`).join('');
}

function openCaseDetail(id, languageRefresh = false) {
    const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    const item = records.find(record => String(record.id) === String(id));
    if (!item || !['admin','mhs'].includes(currentUser.role) || (currentUser.role === 'mhs' && String(item.nim) !== String(currentUser.nim))) {
        showToast('Pengajuan belum tersedia. Coba segarkan data.', 'error');
        return;
    }
    if (!languageRefresh && (String(id) !== selectedCaseId || caseEditorDirty()) && !confirmLeaveCase()) return;
    const active=document.activeElement;
    const restoreFocus=languageRefresh && document.getElementById('modal-case-detail').contains(active) ? {node:active,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection,scroll:document.getElementById('case-detail-content').scrollTop} : null;
    window.IPCOSReview?.restoreActions();
    const savedPanel = languageRefresh && document.getElementById('case-action-panel');
    const savedPreview = languageRefresh && document.getElementById('case-file-preview');
    if (!languageRefresh) clearCaseBlobUrls();
    selectedCaseId = String(item.id);
    const isAdmin = currentUser.role === 'admin';
    const status = String(item.status || '').trim().toLowerCase();
    let actions = '';
    if (isAdmin && ['pending', 'resubmitted'].includes(status)) {
        if (item.jenis === 'Outline' || item.jenis === 'Pergantian Pembimbing') {
            actions += `<button type="button" class="btn-primary" onclick="caseDetailAction('dospem')">${systemText('Tunjuk Dosen & Terima')}</button>`;
        } else actions += `<button type="button" class="btn-primary" onclick="caseDetailAction('accept')">${systemText('Terima Pengajuan')}</button>`;
        actions += `<button type="button" class="btn-secondary" onclick="caseDetailAction('revision')">${systemText('Minta Revisi')}</button>`;
    } else if (!isAdmin && status === 'revision') {
        actions = `<button type="button" class="btn-primary" onclick="caseDetailAction('reply')">${systemText('Upload Perbaikan')}</button>`;
    }
    const content = document.getElementById('case-detail-content');
    content.innerHTML = `<div class="case-workspace"><div class="case-document-column"><div class="case-summary">
        <button type="button" class="btn-secondary" data-receipt-id="${escapeHtml(item.id)}">${systemText('Unduh Bukti PDF')}</button>
        <dl class="receipt-list"><dt>${uxText('Jenis','Type')}</dt><dd>${escapeHtml(systemText(item.jenis))}</dd>
        <dt>${uxText('Dikirim','Submitted')}</dt><dd>${escapeHtml(formatDateTime(item.date).replace(/<[^>]*>/g, ' '))}</dd>
        ${isAdmin ? `<dt>${uxText('Mahasiswa','Student')}</dt><dd>${escapeHtml(item.nama)} (${escapeHtml(item.nim)})</dd>` : ''}
        <dt>${uxText('Nomor','ID')}</dt><dd>${escapeHtml(item.id)}</dd></dl></div>
        <h3>${uxText('Detail','Details')}</h3><div class="case-content-block">${localizedDetailHtml(item.detail)}${item.dospem ? `<p><strong>${uxText('Dosen Pembimbing:','Supervisor:')}</strong> ${escapeHtml(item.dospem)}</p>` : ''}</div>
        <h3>${uxText('Berkas','Documents')}</h3><div class="case-content-block">${caseFileListHtml(item)}</div>
        <div id="case-file-preview" hidden><iframe title="${uxText('Pratinjau berkas','Document preview')}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe><p class="field-helper"></p></div>
        <details class="case-history"><summary>${uxText('Riwayat Pengajuan','Request History')}</summary><div class="case-timeline">${caseTimelineHtml(item)}</div></details></div>
        <aside class="case-action-column">${status === 'revision' || status === 'resubmitted' ? revisionInstructionsHtml(item) : ''}
        <button type="button" class="btn-secondary" data-open-journey="${escapeHtml(item.nim)}">${uxText('Lihat Perjalanan Akademik', 'View Academic Journey')}</button>
        ${window.IPCOSReview?.statusHtml(item) || getStatusBadge(item.status)+`<p>${escapeHtml(caseNextStep(item))}</p>`+waitingHtml(item)}
        <div id="case-detail-actions" class="case-detail-actions">${actions || `<p>${uxText('Tidak ada tindakan yang perlu dikirim saat ini.', 'No action is required at this time.')}</p>`}</div>
        <div id="case-action-panel" hidden></div></aside></div>`;
    if (savedPanel) { content.querySelector('#case-action-panel').replaceWith(savedPanel); content.querySelector('#case-detail-actions').hidden = !savedPanel.hidden; }
    if (savedPreview) content.querySelector('#case-file-preview').replaceWith(savedPreview);
    content.querySelectorAll('[data-preview-index]').forEach(button => button.addEventListener('click', () => previewCaseFile(Number(button.dataset.previewIndex))));
    const modal = document.getElementById('modal-case-detail');
    clearTimeout(modalCloseTimers.get(modal.id));
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    if (!languageRefresh) modal.querySelector('.case-close').focus();
    window.IPCOSReview?.opened(item,{languageRefresh});
    if (restoreFocus?.node.isConnected && !restoreFocus.node.disabled) {
        restoreFocus.node.focus({preventScroll:true});
        if (typeof restoreFocus.start==='number') restoreFocus.node.setSelectionRange(restoreFocus.start,restoreFocus.end,restoreFocus.direction || 'none');
        document.getElementById('case-detail-content').scrollTop=restoreFocus.scroll;
    }
}

function caseMobileCard(item, isAdmin) {
    return `<article class="case-mobile-card"><div class="case-mobile-top"><small>${escapeHtml(formatDate(isAdmin ? getCaseEventTime(item) : item.date))}</small></div>
        <strong>${escapeHtml(systemText(item.jenis))}</strong>${isAdmin ? `<p>${escapeHtml(item.nama)}<br><small>${escapeHtml(item.nim)}</small></p>` : ''}
        ${window.IPCOSReview?.statusHtml(item,{compact:true}) || getStatusBadge(item.status)+`<p>${escapeHtml(caseNextStep(item))}</p>`+waitingHtml(item)}
        <button type="button" class="btn-primary" data-case-id="${escapeHtml(item.id)}">${systemText('Buka Detail & Tindakan')}</button></article>`;
}

document.addEventListener('click', event => {
    const button = event.target.closest('[data-case-id]');
    if (button) openCaseDetail(button.dataset.caseId);
});

function loadStudentStatus() {
    const tbody = document.getElementById('table-my-status');
    const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    const myRecords = records.filter(r => String(r.nim).trim() === String(currentUser.nim).trim());

    let hasRevision = false;

    tbody.innerHTML = '';

    if (myRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 40px;">
            <div style="font-size: 30px; opacity: 0.5; margin-bottom: 10px;">-</div>
            <span class="lang" data-id="Anda belum mengajukan pendaftaran apapun." data-en="You have not submitted any registration.">${currentLang === 'id' ? 'Anda belum mengajukan pendaftaran apapun.' : 'You have not submitted any registration.'}</span>
        </td></tr>`;
    } else {
        myRecords.reverse().forEach(item => {
            const stat = String(item.status).trim().toLowerCase();
            if (stat === 'revision') hasRevision = true;

            let actionButtons = `<button type="button" class="btn-chat-log" data-case-id="${escapeHtml(item.id)}">${systemText('Lihat Detail & Riwayat')}</button>`;
            if (stat === 'revision') {
                actionButtons += `<button class="action-btn btn-resend lang" onclick="openReplyModal('${item.id}')" style="width:100%; margin-top:8px;" data-id="Upload Perbaikan" data-en="Upload Correction">${currentLang === 'id' ? 'Upload Perbaikan' : 'Upload Correction'}</button>`;
            }

            let detailText = localizedDetailHtml(item.detail);
            if (item.dospem) {
                detailText += `<br><br><b style="color:var(--umy-maroon);">${uxText('Dosen Pembimbing:', 'Supervisor:')}</b><br>${escapeHtml(item.dospem)}`;
            }

            const statCheck = String(item.status).trim().toLowerCase();
            if (statCheck === 'revision' && item.note) {
                let latestRevNote = uxText('Buka detail pengajuan untuk membaca instruksi perbaikan.', 'Open the request details to read the correction instructions.');
                try {
                    const parsedLogs = JSON.parse(item.note);
                    const lastAdminLog = parsedLogs.slice().reverse().find(l => l.role === 'admin');
                    if (lastAdminLog) {
                        latestRevNote = lastAdminLog.message;
                    }
                } catch(e) {
                    latestRevNote = item.note;
                }
                detailText += `<br><br><b style="color:var(--umy-maroon);">${uxText('Catatan Revisi Admin:', 'Admin correction notes:')}</b><br><span style="color:var(--text-muted);">${escapeHtml(latestRevNote)}</span>`;
            }

            tbody.innerHTML += `<tr>
                <td style="font-size:13px; vertical-align:top;">${formatDate(item.date)}</td>
                <td style="vertical-align:top;"><b>${escapeHtml(systemText(item.jenis))}</b></td>
                <td style="font-size:14px; vertical-align:top;">${detailText}</td>
                <td style="text-align:center; vertical-align:top;">${window.IPCOSReview?.statusHtml(item,{compact:true}) || getStatusBadge(item.status)+`<p class="queue-next-step">${escapeHtml(caseNextStep(item))}</p>`+waitingHtml(item)}</td>
                <td style="min-width:160px; vertical-align:top;">${actionButtons}</td>
            </tr>`;
        });
    }

    const mobileList = document.getElementById('student-mobile-list');
    if (mobileList) mobileList.innerHTML = myRecords.length
        ? myRecords.map(item => caseMobileCard(item, false)).join('')
        : '<div class="case-mobile-card">Belum ada pengajuan.</div>';

    const alertRev = document.getElementById('alert-revision-student');
    if (alertRev) alertRev.style.display = hasRevision ? 'block' : 'none';

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
    const counts = { pending: 0, resubmitted: 0, revision: 0, accepted: 0 };
    records.forEach(item => { const status = String(item.status || '').trim().toLowerCase(); if (status in counts) counts[status]++; });
    const summary = document.getElementById('admin-queue-summary');
    if (summary) summary.innerHTML = `
        <button type="button" onclick="setAdminQueueFilter('ACTION_REQUIRED')"><strong>${counts.pending + counts.resubmitted}</strong><span>Perlu Ditinjau</span></button>
        <button type="button" onclick="setAdminQueueFilter('Pending')"><strong>${counts.pending}</strong><span>Baru Masuk</span></button>
        <button type="button" onclick="setAdminQueueFilter('Resubmitted')"><strong>${counts.resubmitted}</strong><span>Perbaikan Masuk</span></button>
        <button type="button" onclick="setAdminQueueFilter('Revision')"><strong>${counts.revision}</strong><span>Menunggu Mahasiswa</span></button>`;

    adminFilteredData = records.filter(item => {
        const matchSearch = String(item.nama || '').toLowerCase().includes(searchVal) || String(item.nim || '').toLowerCase().includes(searchVal);
        const stat = String(item.status || '').trim().toLowerCase();
        const matchFilter = filterVal === 'ALL' || (filterVal === 'ACTION_REQUIRED' ? ['pending', 'resubmitted'].includes(stat) : stat === filterVal.toLowerCase());
        const type = document.getElementById('admin-type-filter')?.value || '';
        const overdueOnly = document.getElementById('admin-overdue-filter')?.checked;
        return matchSearch && matchFilter && (!type || item.jenis === type) && (!overdueOnly || caseWaiting(item)?.overdue);
    });

    adminFilteredData.sort((a, b) => {
        if (filterVal === 'ACTION_REQUIRED') {
            const priority = item => String(item.status).toLowerCase() === 'resubmitted' ? 0 : 1;
            if (priority(a) !== priority(b)) return priority(a) - priority(b);
        }
        const safeDateA = getCaseEventTime(a).replace(' ', 'T');
        const safeDateB = getCaseEventTime(b).replace(' ', 'T');

        const dateA = safeDateA ? (new Date(safeDateA).getTime() || 0) : 0;
        const dateB = safeDateB ? (new Date(safeDateB).getTime() || 0) : 0;

        return isAdminSortDesc ? (dateB - dateA) : (dateA - dateB);
    });

    window.IPCOSReview?.setQueue(adminFilteredData);
    renderAdminTable();
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

function renderAdminTable() {
    const tbody = document.getElementById('table-admin-reg');
    tbody.innerHTML = '';

    if (adminFilteredData.length === 0) {
        currentAdminPage = 1;
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px;">
            <div style="font-size: 30px; opacity: 0.5; margin-bottom: 10px;">-</div>
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
    if (mobileList) mobileList.innerHTML = paginatedItems.map(item => caseMobileCard(item, true)).join('');

    document.getElementById('admin-page-info').innerText = `${uxText('Halaman','Page')} ${currentAdminPage} / ${totalPages}`;
    document.getElementById('admin-btn-prev').disabled = currentAdminPage <= 1;
    document.getElementById('admin-btn-next').disabled = currentAdminPage >= totalPages;

    paginatedItems.forEach(item => {
        tbody.innerHTML += `<tr>
            <td style="font-size:13px;">${formatDateTime(getCaseEventTime(item))}</td>
            <td><strong>${escapeHtml(item.nama)}</strong><br><small>${escapeHtml(item.nim)}</small></td>
            <td><strong>${escapeHtml(systemText(item.jenis))}</strong></td>
            <td colspan="2">${window.IPCOSReview?.statusHtml(item,{compact:true}) || getStatusBadge(item.status)+`<p>${escapeHtml(caseNextStep(item))}</p>`+waitingHtml(item)}</td>
            <td><button type="button" class="btn-secondary" data-case-id="${escapeHtml(item.id)}">${uxText('Buka Pengajuan','Open Request')}</button></td>
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
    saveQueueView();
}

function exportAdminDataCSV() {
    if (currentUser.role !== 'admin') return;
    const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
    if (!records.length) { showToast('Belum ada data untuk diekspor.', 'error'); return; }
    const cell = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g,'""') + '"'; };
    const rows = [['ID','Tanggal','NIM','Nama','Jenis','Status'], ...records.map(r => [r.id,r.date,r.nim,r.nama,r.jenis,r.status])];
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `Rekap_IPCOS_UMY_${Date.now()}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Data CSV berhasil diunduh!', 'success');
}

function deleteAllRegistrations() {
    if (isOffline) {
        showToast(currentLang === 'id' ? "Tidak dapat menghapus saat offline." : "Cannot delete while offline.", "error");
        return;
    }

    const confirmMsg = currentLang === 'id'
        ? "PERINGATAN BAHAYA!\nApakah Anda yakin ingin MENGHAPUS SELURUH DATA PENDAFTAR secara permanen?\nTindakan ini tidak dapat dibatalkan!"
        : "DANGER WARNING!\nAre you sure you want to PERMANENTLY DELETE ALL REGISTRATION DATA?\nThis action cannot be undone!";

    if (!confirm(confirmMsg)) return;

    const promptText = currentLang === 'id' ? "Ketik 'HAPUS' (tanpa tanda kutip) untuk mengonfirmasi:" : "Type 'DELETE' to confirm:";
    const confirmInput = prompt(promptText);
    const requiredWord = currentLang === 'id' ? 'HAPUS' : 'DELETE';
    if (confirmInput !== requiredWord) {
        showToast(currentLang === 'id' ? "Proses dibatalkan." : "Process cancelled.", "error");
        return;
    }

    showLoader(currentLang === 'id' ? 'Menghapus Seluruh Data...' : 'Deleting All Data...');

    apiPost(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'delete_all_registrations' }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
        .then(res => readApiResult(res))
        .then(result => {
            if (result.status === "success") {
                showToast(currentLang === 'id' ? "Seluruh data pendaftar berhasil dikosongkan!" : "All registration data cleared successfully!", "success");
                sessionStorage.setItem('ipcos_registrations', '[]');
                adminFilteredData = [];
                syncDatabase();
            } else {
                showToast("Gagal menghapus data: " + (result.message || "Error tidak diketahui"), "error");
            }
        })
        .catch(err => {
            showToast(currentLang === 'id' ? "Terjadi kesalahan jaringan." : "Network error occurred.", "error");
        })
        .finally(() => {
            hideLoader();
        });
}

function openDocPreview(url) {
    const iframe = document.getElementById('iframe-doc-viewer');
    const directBtn = document.getElementById('btn-download-direct');
    let previewUrl = url;
    if (url.includes('drive.google.com')) previewUrl = url.replace(/\/view.*$/, '/preview').replace(/\/edit.*$/, '/preview');
    iframe.src = previewUrl; directBtn.href = url;
    const modal = document.getElementById('modal-doc-preview');
    if (modal.tagName && modal.tagName.toLowerCase() === 'dialog') {
        modal.showModal();
    } else {
        modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
    }
}

function startCountdownWidget() {
    const targetDate = new Date("October 19, 2026 23:59:59").getTime();

    setInterval(() => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        const textDisplay = (distance < 0)
            ? systemText('DITUTUP')
            : `${days}d : ${hours}h : ${minutes}m : ${seconds}s`;

        document.querySelectorAll('.countdown-timer-display, #countdown-timer-display').forEach(el => {
            if (el) el.innerText = textDisplay;
        });
    }, 1000);
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
async function sendUpdateRequest(id, newStatus, noteText, files = [], dospem = null) {
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

        const payload = { action: 'update', id: id, status: newStatus, noteText: noteText, files: files, dospem: dospem };
        const res = await apiPost(GAS_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await readApiResult(res);

        if (result.status === "success") {
            // --- UPDATE LOKAL INSTAN ---
            if (targetIndex !== -1) {
                records[targetIndex].status = newStatus;
                records[targetIndex].note = finalNoteJSON;
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
    if (modalId === 'modal-sop-editor' && !force) { window.IPCOSSop?.cancel(); return; }
    if (!force && modalId === 'modal-case-detail' && !confirmLeaveCase()) return;
    if (!force && modalId === 'modal-case-detail' && (isPreparingCorrection || activeUpdateIds.has(selectedCaseId))) return;
    const modal = document.getElementById(modalId);
    if (!modal) return;
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
    if (['sop-magang','sop-tugas-akhir'].includes(tabId)) return ['mhs','admin'].includes(currentUser.role);
    if (tabId === 'academic-journey') return ['mhs','admin'].includes(currentUser.role);
    if (['pendaftaran','student-status'].includes(tabId)) return currentUser.role === 'mhs';
    if (['admin-data','admin-dosen','admin-master'].includes(tabId)) return currentUser.role === 'admin';
    return true;
}
function switchTab(event, tabId) {
    if (!canAccessTab(tabId)) return;
    if (window.IPCOSSop && !window.IPCOSSop.beforeNavigate(tabId)) return;
    if (tabId === 'academic-journey') renderAcademicJourney();
    if (tabId !== 'pendaftaran' && document.getElementById('pendaftaran').classList.contains('active') && !confirmLeaveRegistration()) return;
    window.IPCOSExperience?.beforeTab(tabId);
    document.body.classList.toggle('transaction-view', ['dashboard', 'pendaftaran', 'student-status', 'admin-data'].includes(tabId));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    else document.querySelectorAll('.nav-item').forEach(item => { if ((item.getAttribute('onclick') || '').includes("'" + tabId + "'")) item.classList.add('active'); });
    const target = document.getElementById(tabId);
    if (target) {
        target.classList.remove('active'); void target.offsetWidth; target.classList.add('active');
    }
    document.getElementById('main-sidebar').classList.remove('active');
    window.IPCOSExperience?.tabChanged(tabId);
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
}

const catEl = document.getElementById('easter-cat'); let catTimer;
function scheduleCat() { catTimer = setTimeout(showCat, Math.floor(Math.random() * 10000) + 5000); }
function showCat() { catEl.classList.add('peek'); setTimeout(() => { if (catEl.classList.contains('peek')) hideCat(); }, 4000); }
function hideCat() { catEl.classList.remove('peek'); clearTimeout(catTimer); scheduleCat(); }

function silentSyncDatabase() {
    if (document.hidden || isOffline || !getSessionToken() || syncPhase === 'syncing') return;
    return apiRead().then(applyDatabaseSnapshot).catch(error => { if (!error.staleSession && getSessionToken()) setSyncPhase('error'); });
}
// Active-tab timer lives in workflow.js.

// ==========================================
// 14. SIDEBAR INTERAKTIF & WHATSAPP FLOAT
// ==========================================
function toggleDesktopSidebar() { document.getElementById('main-sidebar').classList.toggle('collapsed'); document.querySelector('.main-content').classList.toggle('expanded'); window.IPCOSExperience?.drawerChanged(); }
let waScrollTimer;
window.addEventListener('scroll', () => {
    const waBtn = document.getElementById('wa-float-btn');
    if (waBtn) { waBtn.classList.add('wa-hidden'); clearTimeout(waScrollTimer); waScrollTimer = setTimeout(() => { waBtn.classList.remove('wa-hidden'); }, 800); }
}, { passive: true });

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
    if (!msg) { showToast("Pesan pengumuman tidak boleh kosong!", "error"); return; }

    return postAnnouncement(msg, 'info').then(success => { if (success && input) input.value = ''; });
}

let postingAnnouncement = false;
async function postAnnouncement(customMsg = null, customType = null) {
    if (postingAnnouncement) return false;
    if (isOffline) { showToast("Tidak dapat mengirim broadcast saat offline.", "error"); return false; }

    const masterInput = document.getElementById('input-broadcast');
    const checkImportant = document.getElementById('check-important-broadcast');

    const msg = customMsg !== null ? customMsg : (masterInput ? masterInput.value.trim() : '');

    if (!msg) { showToast("Pesan pengumuman tidak boleh kosong!", "error"); return; }

    postingAnnouncement = true;
    const requestEpoch = sessionEpoch;
    const annType = customType !== null ? customType : (checkImportant && checkImportant.checked ? 'important' : 'info');

    showLoader();
    try {
        await apiPostSuccess(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'post_announcement', message: msg, type: annType }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        showToast("Pengumuman berhasil disebarkan!", "success");

        if (!customMsg && masterInput) masterInput.value = '';
        if (!customType && checkImportant) checkImportant.checked = false;

        await syncDatabase();
        return true;
    } catch (e) {
        if (!e.staleSession && requestEpoch === sessionEpoch) showToast("Gagal mengirim pengumuman. Pesan Anda tetap tersedia.", "error");
        return false;
    } finally {
        if (requestEpoch === sessionEpoch) { postingAnnouncement = false; hideLoader(); }
    }
}

// ==========================================
// 16. CRUD MASTER MAHASISWA & BROADCAST
// ==========================================
function renderMasterMahasiswa(students) {
    const tbody = document.getElementById('table-master-mhs');
    if (!tbody) return; tbody.innerHTML = '';
    students.reverse().forEach(s => {
        const statusMhs = s.Status || s.status || "Aktif"; let badgeClass = "badge-accepted";
        if (statusMhs.toLowerCase() === "tidak aktif") badgeClass = "badge-revision"; else if (statusMhs.toLowerCase() === "lulus") badgeClass = "badge-resubmitted";
        tbody.innerHTML += `<tr><td><b>${escapeHtml(s.NIM)}</b></td><td>${escapeHtml(s.Nama)}</td><td><span class="status-badge ${badgeClass}">${escapeHtml(systemText(statusMhs))}</span></td><td><button class="action-btn btn-rev" onclick="deleteStudent(${escapeHtml(JSON.stringify(String(s.NIM)))})">${uxText('Hapus','Delete')}</button></td></tr>`;
    });
}

async function addStudent() {
    if (isOffline) { showToast("Tidak dapat menambah mahasiswa saat offline.", "error"); return; }
    const nim = document.getElementById('add-nim').value.trim(); const nama = document.getElementById('add-nama').value.trim();
    if (!nim || !nama) { showToast("NIM dan Nama wajib diisi!", "error"); return; }
    showLoader();
    try { await apiPostSuccess(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'manage_student', method: 'add', nim: nim, nama: nama }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); showToast("Mahasiswa berhasil ditambahkan!", "success"); document.getElementById('add-nim').value = ''; document.getElementById('add-nama').value = ''; syncDatabase(); } catch (e) { showToast("Gagal menambah data", "error"); } finally { hideLoader(); }
}

async function deleteStudent(nim) {
    if (isOffline) { showToast("Tidak dapat menghapus saat offline.", "error"); return; }
    if (!confirm(`${uxText('Hapus akses mahasiswa untuk NIM:', 'Remove student access for ID:')} ${nim}?`)) return;
    showLoader();
    try { await apiPostSuccess(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'manage_student', method: 'delete', nim: nim }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); showToast("Akses Mahasiswa berhasil dihapus!", "success"); syncDatabase(); } catch (e) { showToast("Gagal menghapus data", "error"); } finally { hideLoader(); }
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

function closeAnnouncementModal() {
    const modal = document.getElementById('modal-important-announcement');
    const annId = modal.getAttribute('data-current-ann-id');
    const chkDontShow = document.getElementById('chk-dont-show-announcement');

    if (annId) {
        if (chkDontShow && chkDontShow.checked) {
            localStorage.setItem('hide_announcement_' + annId, 'true');
        } else {
            sessionStorage.setItem('seen_announcement_' + annId, 'true');
        }
    }

    if (chkDontShow) chkDontShow.checked = false;
    closeModal('modal-important-announcement');
}

// ==========================================
// FITUR BARU: MANAJEMEN PLOTTING DOSEN
// ==========================================
function renderDosenTable() {
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

    const dosens = readStoredJSON(sessionStorage, 'ipcos_dosens', []);
    let html = '<option value="">-- Pilih Dosen Pembimbing --</option>';

    dosens.sort((a, b) => a.Nama.localeCompare(b.Nama));

    dosens.forEach(d => {
        const sisa = parseInt(d.Maksimal) - parseInt(d.Terpakai);
        const disabled = sisa <= 0 ? 'disabled' : '';
        const warn = sisa <= 0 ? '(PENUH)' : `(Sisa Kuota: ${sisa})`;
        html += `<option value="${escapeHtml(d.Nama)}" ${disabled}>${escapeHtml(d.Nama)} ${warn}</option>`;
    });

    select.innerHTML = html;
}

function openEditDosen(nama, terpakai, maksimal) {
    document.getElementById('hidden-dosen-nama').value = nama;
    document.getElementById('edit-dosen-name-display').innerText = nama;
    document.getElementById('edit-dosen-terpakai').value = terpakai;
    document.getElementById('edit-dosen-maksimal').value = maksimal;

    const modal = document.getElementById('modal-edit-dosen');
    modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

function validQuota(used, max) { return String(used).trim() !== '' && String(max).trim() !== '' && Number.isInteger(Number(used)) && Number.isInteger(Number(max)) && Number(used) >= 0 && Number(max) > 0 && Number(used) <= Number(max); }

async function saveDosenQuota() {
    if (isOffline) { showToast("Sedang offline.", "error"); return; }

    const nama = document.getElementById('hidden-dosen-nama').value;
    const terpakai = document.getElementById('edit-dosen-terpakai').value;
    const maksimal = document.getElementById('edit-dosen-maksimal').value;
    if (!validQuota(terpakai, maksimal)) { showToast('Kuota harus bilangan bulat positif, dan beban terpakai tidak boleh negatif atau melebihi kuota.', 'error'); return; }

    showLoader();
    try {
        await apiPostSuccess(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'manage_dosen', method: 'update', nama: nama, terpakai: terpakai, maksimal: maksimal }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        showToast("Kuota dosen diperbarui!", "success");
        closeModal('modal-edit-dosen');
        syncDatabase();
    } catch (e) { showToast("Gagal menyimpan.", "error"); } finally { hideLoader(); }
}

async function addDosenQuota() {
    if (isOffline) { showToast("Sedang offline.", "error"); return; }

    const nama = document.getElementById('add-dosen-nama').value.trim();
    const max = document.getElementById('add-dosen-max').value;

    if (!nama) { showToast("Nama tidak boleh kosong!", "error"); return; }
    if (!validQuota(0, max)) { showToast('Kuota maksimal harus bilangan bulat positif.', 'error'); return; }

    showLoader();
    try {
        await apiPostSuccess(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'manage_dosen', method: 'add', nama: nama, maksimal: max }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        showToast("Dosen ditambahkan!", "success");
        document.getElementById('add-dosen-nama').value = '';
        syncDatabase();
    } catch (e) { showToast("Gagal.", "error"); } finally { hideLoader(); }
}

async function deleteDosen(nama) {
    if (!confirm(`Hapus dosen ${nama}?`)) return;
    showLoader();
    try {
        await apiPostSuccess(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'manage_dosen', method: 'delete', nama: nama }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        showToast("Dosen dihapus!", "success");
        syncDatabase();
    } catch (e) { showToast("Gagal.", "error"); } finally { hideLoader(); }
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
document.addEventListener('keydown', event => {
    const login = document.getElementById('welcome-modal');
    const modal = getComputedStyle(login).display !== 'none' ? login : document.getElementById('modal-case-detail');
    if (event.key !== 'Tab' || getComputedStyle(modal).display !== 'flex') return;
    const controls = [...modal.querySelectorAll('button, a[href], input, textarea, select')].filter(el => !el.disabled && el.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (!modal.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});

// Keyboard access for the existing navigation actions.
document.querySelectorAll('.nav-item[role="button"]').forEach(item => item.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); }
}));
