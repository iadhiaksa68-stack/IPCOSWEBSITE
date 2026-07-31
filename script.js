// Link Web App Google Apps Script Terbaru (Pastikan URL sesuai dengan deploy Anda)
const GAS_URL = "https://script.google.com/macros/s/AKfycbxzpIl1qKKLKVB-O6Jsv08OiK_zEztbGOkEIXUze1zsxL8gdC3-oZfQ2bJ6QaW-hoEE8Q/exec";

// ==========================================
// 1. SISTEM NOTIFIKASI TOAST & FORMAT TANGGAL
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fadeOut');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showLoader(loadingText = null) {
    const loaderEl = document.getElementById('loader');
    if (loaderEl) loaderEl.style.display = 'flex';

    const textEl = document.getElementById('loader-text');
    if (textEl) {
        if (loadingText) {
            textEl.innerText = loadingText;
        } else {
            textEl.innerText = currentLang === 'id' ? 'Memuat data...' : 'Loading data...';
        }
    }
}

function hideLoader() {
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
    { title: "Dashboard Akademik", keywords: "beranda utama awal dashboard", tab: "dashboard" },
    { title: "Kewajiban Magang", keywords: "magang kerja praktik logbook", tab: "magang" },
    { title: "Kewajiban Skripsi", keywords: "skripsi tugas akhir ta outline pendadaran", tab: "skripsi" },
    { title: "Pusat Pendaftaran Ujian", keywords: "daftar ujian sempro proposal pendadaran jurnal", tab: "pendaftaran" },
    { title: "Status Pengajuan", keywords: "status riwayat revisi dokumen", tab: "student-status" },
    { title: "Template Dokumen & FAQ", keywords: "template download format faq tanya jawab", tab: "templates-faq" },
    { title: "Sebaran Mata Kuliah", keywords: "kurikulum mata kuliah sks", tab: "kurikulum" },
    { title: "SOP Remidial", keywords: "remidial sop perbaikan nilai", tab: "remidial" },
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
    const results = searchDatabase.filter(item =>
        item.title.toLowerCase().includes(q) || item.keywords.toLowerCase().includes(q)
    );

    if (results.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; margin: 20px 0;">Tidak ditemukan hasil untuk "<b>${query}</b>"</p>`;
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    results.forEach(item => {
        html += `
            <div onclick="executeSearchNavigation('${item.tab}')" style="padding: 12px 16px; background: var(--item-bg); border: 1px solid var(--item-border); border-radius: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
                <span style="font-weight: 600; font-size: 14px; color: var(--heading-color);">${item.title}</span>
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
    if (!doodleCanvas) return;
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
let currentUser = { nim: '', nama: '', role: '' };
let isDbLoaded = false; // BUG FIX: guards student login against race condition before first sync finishes

// ==========================================
// FUNGSI NORMALISASI DATA (BUG FIX KEBAL SPASI)
// ==========================================
function normalizeData(registrations) {
    if (!registrations) return [];
    return registrations.map(r => {
        if (r.status) r.status = String(r.status).trim();
        const safeStatus = String(r.status || '').trim().toLowerCase();
        // BUG FIX: previously this forced status to 'Accepted' whenever a dospem value existed,
        // even if the admin had *explicitly* set the status to 'Revision' or 'Resubmitted' afterwards
        // (e.g. re-revision on a record that already had a supervisor assigned in a previous cycle).
        // Now it only auto-corrects legacy/empty statuses, and never overrides an explicit later decision.
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

    startCountdownWidget();
    renderDynamicContent();
    initDoodleCanvas();

    const session = sessionStorage.getItem('ipcos_session');

    if (session) {
        currentUser = JSON.parse(session);
        finalizeLogin(currentUser.nama, currentUser.nim, currentUser.role);
    } else {
        syncDatabase();
    }
};

function syncDatabase() {
    if (isOffline) {
        const cachedRegs = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
        if (currentUser.role === 'admin') { loadAdminData(); renderDashboardCharts(cachedRegs); }
        else if (currentUser.role === 'mhs') { loadStudentStatus(); renderActivityTimeline(cachedRegs); }
        renderNotifications();
        return;
    }

    if (currentUser.role === 'admin') {
        renderTableSkeleton('table-admin-reg', 5, 6);
        renderTableSkeleton('table-master-mhs', 4, 4);
    } else if (currentUser.role === 'mhs') {
        renderTableSkeleton('table-my-status', 3, 5);
        renderTimelineSkeleton('activity-timeline-container', 3);
    }
    const freshUrl = GAS_URL + "?t=" + new Date().getTime();
    fetch(freshUrl)
        .then(response => response.json())
        .then(data => {

            // TERAPKAN NORMALIZER SEBELUM DISIMPAN KE LOKAL
            data.registrations = normalizeData(data.registrations);

            localStorage.setItem('ipcos_registrations', JSON.stringify(data.registrations || []));
            
            // SIMPAN DATA DOSEN
            if (data.dosens) {
                localStorage.setItem('ipcos_dosens', JSON.stringify(data.dosens));
                if (currentUser.role === 'admin') {
                    renderDosenTable();
                    populateDospemDropdown();
                }
            }

            DB_MAHASISWA = {};
            if (data.students) {
                data.students.forEach(m => { DB_MAHASISWA[String(m.NIM)] = m.Nama; });
                if (currentUser.role === 'admin') renderMasterMahasiswa(data.students);
            }
            isDbLoaded = true;

            if (data.announcements && data.announcements.length > 0) {
                localStorage.setItem('ipcos_announcements', JSON.stringify(data.announcements));
                renderNotifications();

                const latest = data.announcements[data.announcements.length - 1];
                if (currentUser.role === 'mhs') {
                    const bannerText = document.getElementById('announcement-text');
                    if (bannerText) {
                        bannerText.innerText = latest.Pesan || latest.message;
                        document.getElementById('announcement-banner').style.display = 'flex';
                    }

                    const annType = latest.Tipe || latest.type;
                    const annId = latest.Id || latest.date || latest.message;

                    // Cek pop up jangan tampilkan lagi
                    const isHiddenPermanently = localStorage.getItem('hide_announcement_' + annId);
                    const isHiddenSession = sessionStorage.getItem('seen_announcement_' + annId);

                    if (annType === 'important' && !isHiddenPermanently && !isHiddenSession) {
                        document.getElementById('important-announcement-text').innerText = latest.Pesan || latest.message;
                        const modal = document.getElementById('modal-important-announcement');
                        if (modal) {
                            modal.setAttribute('data-current-ann-id', annId);
                            modal.style.display = 'flex';
                            setTimeout(() => { modal.style.opacity = '1'; }, 10);
                        }
                    }
                }
            }

            if (data.contents && data.contents.length > 0) {
                data.contents.forEach(item => {
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
        })
        .catch(error => {
            console.error("Gagal sync data:", error);
            isDbLoaded = true; // BUG FIX: don't leave the login form stuck forever if the first fetch fails
        })
        .finally(() => { hideLoader(); });
}

function switchLoginMode(role) {
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

function loginMhs() {
    const nimInput = document.getElementById('input-nim').value.trim();
    const errorMsg = document.getElementById('error-msg-mhs');
    if (nimInput === "") {
        errorMsg.innerText = currentLang === 'id' ? "Mohon masukkan NIM Anda." : "Please enter your NIM.";
        errorMsg.style.display = 'block'; return;
    }

    // BUG FIX: student database may still be loading on first page load.
    // Without this guard, a valid NIM typed too quickly was wrongly rejected as "not registered".
    if (!isDbLoaded) {
        errorMsg.innerText = currentLang === 'id' ? "Sistem sedang memuat data, mohon tunggu sebentar dan coba lagi..." : "System is still loading data, please wait a moment and try again...";
        errorMsg.style.display = 'block';
        setTimeout(() => { if (isDbLoaded) loginMhs(); }, 800);
        return;
    }

    if (DB_MAHASISWA.hasOwnProperty(nimInput)) {
        const nama = DB_MAHASISWA[nimInput];
        sessionStorage.setItem('ipcos_session', JSON.stringify({ nim: nimInput, nama: nama, role: 'mhs' }));
        finalizeLogin(nama, nimInput, 'mhs');
        showToast(currentLang === 'id' ? `Selamat datang, ${nama}!` : `Welcome, ${nama}!`);
    } else {
        errorMsg.innerText = currentLang === 'id' ? "NIM tidak terdaftar di sistem kami. Harap hubungi Admin." : "NIM is not registered. Please contact Admin.";
        errorMsg.style.display = 'block';
    }
}

async function loginAdmin() {
    const userInput = document.getElementById('input-admin-user').value.trim();
    const passInput = document.getElementById('input-admin-pass').value.trim();
    const errorMsg = document.getElementById('error-msg-admin');
    const btnSubmit = document.querySelector('#form-admin button');

    if (!userInput || !passInput) {
        errorMsg.innerText = currentLang === 'id' ? "Username dan Password wajib diisi!" : "Username and Password are required!";
        errorMsg.style.display = 'block';
        return;
    }

    if (isOffline) {
        errorMsg.innerText = currentLang === 'id' ? "Anda sedang offline. Login Admin butuh koneksi." : "You are offline. Admin login requires connection.";
        errorMsg.style.display = 'block';
        return;
    }

    const originalText = btnSubmit.innerText;
    btnSubmit.innerText = currentLang === 'id' ? "Mengecek..." : "Checking...";
    btnSubmit.disabled = true;

    try {
        const payload = { action: 'admin_login', username: userInput, password: passInput };
        const response = await fetch(GAS_URL, {
            method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();

        if (result.status === "success") {
            const adminData = { nim: 'ADMINISTRATOR', nama: 'Administrator IPCOS', role: 'admin' };
            sessionStorage.setItem('ipcos_session', JSON.stringify(adminData));
            finalizeLogin(adminData.nama, adminData.nim, adminData.role);
            showToast(currentLang === 'id' ? "Berhasil login sebagai Admin." : "Logged in as Admin.", "success");
        } else {
            errorMsg.innerText = result.message;
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.innerText = currentLang === 'id' ? "Terjadi kesalahan jaringan." : "Network error occurred.";
        errorMsg.style.display = 'block';
    } finally {
        btnSubmit.innerText = originalText;
        btnSubmit.disabled = false;
    }
}

function finalizeLogin(displayName, displayNim, role) {
    currentUser = { nim: displayNim, nama: displayName, role: role };
    const firstName = displayName.split(' ')[0];

    const greetings = ["Hello", "Hey", "Hai", "Halo", "Greetings", "Welcome"];
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

    if (role === 'admin') {
        const statusLabel = document.getElementById('label-status-user');
        if (statusLabel) {
            statusLabel.setAttribute('data-id', 'Akses Superuser');
            statusLabel.setAttribute('data-en', 'Superuser Access');
        }
        if (document.getElementById('header-subtext')) document.getElementById('header-subtext').innerText = "Role: Administrator";

        loadAdminData();
        const cachedRecords = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
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
        document.getElementById('welcome-modal').style.display = 'none';
        scheduleCat();
        syncDatabase();
        applyDynamicLanguage();
    }, 400);
}

function logoutUser() {
    const msg = currentLang === 'id' ? "Apakah Anda yakin ingin keluar?" : "Are you sure you want to log out?";
    if (confirm(msg)) {
        sessionStorage.removeItem('ipcos_session');
        currentUser = { nim: '', nama: '', role: '' };
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
    const listContainer = document.getElementById('notif-list-container');
    const badgeEl = document.getElementById('notif-badge');
    if (!listContainer) return;

    const notifs = [];

    if (currentUser && currentUser.role === 'mhs') {
        const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
        const myRecords = records.filter(r => String(r.nim).trim() === String(currentUser.nim).trim());

        myRecords.forEach(rec => {
            const stat = String(rec.status).trim().toLowerCase();
            if (stat === 'revision') {
                notifs.push({
                    type: 'revision',
                    title: `Perlu Revisi: ${rec.jenis}`,
                    text: rec.catatanAdmin ? `Catatan: ${rec.catatanAdmin}` : `Berkas Pendaftaran Anda membutuhkan perbaikan.`,
                    date: rec.date || new Date().toISOString(),
                    tab: 'student-status'
                });
            } else if (stat === 'accepted') {
                notifs.push({
                    type: 'accepted',
                    title: `Disetujui: ${rec.jenis}`,
                    text: rec.dospem ? `Dosen Pembimbing: ${rec.dospem}` : `Pendaftaran Anda telah diverifikasi & disetujui.`,
                    date: rec.date || new Date().toISOString(),
                    tab: 'student-status'
                });
            }
        });
    }

    const announcements = JSON.parse(localStorage.getItem('ipcos_announcements') || '[]');
    announcements.slice(-5).reverse().forEach(ann => {
        notifs.push({
            type: 'broadcast',
            title: `📢 Pengumuman Akademik`,
            text: ann.Pesan || ann.message || 'Pengumuman baru dari Administrator IPCOS',
            date: ann.date || ann.Tanggal || new Date().toISOString(),
            tab: 'dashboard'
        });
    });

    if (notifs.length === 0) {
        listContainer.innerHTML = `<div style="padding: 20px; font-size: 13px; color: var(--text-muted); text-align: center;" class="lang" data-id="Belum ada notifikasi baru." data-en="No new notifications.">Belum ada notifikasi baru.</div>`;
        if (badgeEl) badgeEl.style.display = 'none';
    } else {
        if (badgeEl) {
            badgeEl.innerText = notifs.length;
            badgeEl.style.display = 'flex';
        }
        listContainer.innerHTML = notifs.map(n => `
            <div style="padding: 12px 15px; border-bottom: 1px solid var(--item-border); cursor: pointer; transition: background 0.2s;" class="notif-item" onclick="switchTab(null, '${n.tab}'); toggleNotifDropdown();">
                <div style="font-weight: 700; font-size: 13px; color: var(--heading-color); margin-bottom: 3px; display:flex; align-items:center; gap:6px;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${n.type === 'revision' ? 'var(--umy-maroon)' : n.type === 'accepted' ? 'var(--umy-green)' : 'var(--umy-gold)'};"></span>
                    ${n.title}
                </div>
                <div style="font-size: 12px; color: var(--text-color); margin-bottom: 4px; line-height: 1.4;">${n.text}</div>
                <div style="font-size: 10px; color: var(--text-muted);">${timeAgo(n.date)}</div>
            </div>
        `).join('');
    }
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
    const badgeEl = document.getElementById('notif-badge');
    if (badgeEl) badgeEl.style.display = 'none';
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
        container.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); text-align: center; margin-top: 20px;">Belum ada aktivitas terekam.</div>`;
        return;
    }

    let html = '';
    myRecords.reverse().slice(0, 5).forEach(r => {
        let text = '';
        const stat = String(r.status).trim().toLowerCase();
        
        if (stat === 'accepted') text = `Pendaftaran <b>${r.jenis}</b> Anda telah diverifikasi dan <b>Diterima</b>.`;
        else if (stat === 'revision') text = `Pendaftaran <b>${r.jenis}</b> Anda perlu <b>Revisi</b>. Silakan cek catatan admin.`;
        else if (stat === 'resubmitted') text = `Anda telah mengunggah perbaikan untuk <b>${r.jenis}</b>.`;
        else text = `Anda berhasil mendaftar <b>${r.jenis}</b>. Berkas sedang direview.`;

        let bulletColor = 'var(--umy-gold)';
        if (stat === 'accepted') bulletColor = 'var(--umy-green)';
        if (stat === 'revision') bulletColor = 'var(--umy-maroon)';

        html += `
            <div style="position: relative;">
                <span style="position: absolute; left: -21px; top: 4px; width: 10px; height: 10px; background: ${bulletColor}; border-radius: 50%;"></span>
                <div style="font-size: 11px; color: var(--text-muted); font-weight: bold; margin-bottom: 2px;">${timeAgo(r.date)}</div>
                <div style="font-size: 13.5px; line-height: 1.4; color: var(--text-color);">${text}</div>
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
        const isOverSize = file.size > MAX_FILE_SIZE_MB * 1024 * 1024;

        if (isOverSize) {
            showToast(currentLang === 'id' ? `Ukuran max file adalah ${MAX_FILE_SIZE_MB}MB! (File Anda: ${formattedSize})` : `Max file size is ${MAX_FILE_SIZE_MB}MB! (Your file: ${formattedSize})`, 'error');
            input.value = "";
            labelEl.innerHTML = `<div class="dz-file-badge error">⚠️ File terlalu besar (${formattedSize}). Maksimal ${MAX_FILE_SIZE_MB}MB.</div>`;
        } else {
            labelEl.innerHTML = `
                <div class="dz-file-badge success">
                    📄 <span>${file.name}</span> <span style="opacity:0.8;">(${formattedSize})</span>
                    <button type="button" class="dz-remove-btn" onclick="clearSelectedFile('${input.id}', '${labelId}')">Hapus File</button>
                </div>`;
        }
    } else {
        labelEl.innerHTML = "";
    }
}

function clearSelectedFile(inputId, labelId) {
    const input = document.getElementById(inputId);
    if (input) input.value = "";
    const labelEl = document.getElementById(labelId);
    if (labelEl) labelEl.innerHTML = "";
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
    const draft = {
        jenis: document.getElementById('reg-jenis-utama')?.value || '',
        judul: document.getElementById('reg-judul')?.value || ''
    };
    localStorage.setItem('ipcos_form_draft', JSON.stringify(draft));
}

function loadFormDraft() {
    const saved = localStorage.getItem('ipcos_form_draft');
    if (!saved) return;
    try {
        const draft = JSON.parse(saved);
        const jenisEl = document.getElementById('reg-jenis-utama');
        const judulEl = document.getElementById('reg-judul');
        if (draft.jenis && jenisEl) { jenisEl.value = draft.jenis; toggleExamForm(); }
        if (draft.judul && judulEl) { judulEl.value = draft.judul; }
    } catch (e) { }
}

function clearFormDraft() {
    localStorage.removeItem('ipcos_form_draft');
}

function toggleExamForm() {
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

async function submitForm(e) {
    e.preventDefault();

    if (isOffline) {
        showToast(currentLang === 'id' ? "Tidak dapat mengirim form saat offline. Periksa koneksi Anda." : "Cannot submit form while offline. Check your connection.", "error");
        return;
    }

    const jenisUjian = document.getElementById('reg-jenis-utama').value;
    const reqId = Date.now().toString(36);
    const dateStr = new Date().toISOString();
    let filesToUpload = [];

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
            filesToUpload.push({ label: 'Surat Pergantian', fileName: fSurat.name, mimeType: fSurat.type, base64: await fileToBase64(fSurat) });
        }

        showLoader(currentLang === 'id' ? 'Mengunggah Data ke Server...' : 'Uploading to Server...');

        let payload = {
            action: 'create', id: reqId, date: dateStr, nim: currentUser.nim, nama: currentUser.nama,
            jenis: jenisUjian, detail: finalDetail,
            files: filesToUpload
        };

        const response = await fetch(GAS_URL, {
            method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        const result = await response.json();

        if (result.status === "success") {
            showToast(currentLang === 'id' ? "Pendaftaran & Berkas berhasil dikirim!" : "Registration & Files submitted successfully!", "success");
            clearFormDraft();
            document.getElementById('reg-jenis-utama').value = "";
            document.querySelectorAll('.dz-file-name').forEach(el => el.innerText = "");
            toggleExamForm(); e.target.reset(); syncDatabase();
        } else {
            throw new Error(result.message || (currentLang === 'id' ? "Gagal menyimpan berkas." : "Failed to save files."));
        }
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        hideLoader();
    }
}

// ==========================================
// 7. GENERATOR GOOGLE CALENDAR (.ics)
// ==========================================
function downloadICS(title, dateStr) {
    const dateObj = new Date(dateStr);

    if (isNaN(dateObj)) {
        showToast(currentLang === 'id' ? "Format tanggal tidak valid untuk diekspor" : "Invalid date format for export", "error");
        return;
    }

    const startDate = dateObj.toISOString().replace(/-|:|\.\d+/g, '').substring(0, 8) + 'T000000Z';
    const endDate = dateObj.toISOString().replace(/-|:|\.\d+/g, '').substring(0, 8) + 'T235959Z';

    let icsMSG = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//IPCOS UMY//ID\nBEGIN:VEVENT\n" +
        "UID:" + Date.now() + "@ipcos.umy.ac.id\n" +
        "DTSTAMP:" + new Date().toISOString().replace(/-|:|\.\d+/g, '').substring(0, 15) + "Z\n" +
        "DTSTART:" + startDate + "\n" +
        "DTEND:" + endDate + "\n" +
        "SUMMARY:Batas Pendaftaran Yudisium - " + title + "\n" +
        "DESCRIPTION:Pengingat otomatis batas pendaftaran Yudisium / Wisuda IPCOS UMY. Pastikan seluruh berkas telah dikumpulkan di portal sebelum tanggal ini.\n" +
        "END:VEVENT\nEND:VCALENDAR";

    const blob = new Blob([icsMSG], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `Kalender_Yudisium_${title.replace(/\s+/g, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(currentLang === 'id' ? "Berkas Kalender berhasil diunduh!" : "Calendar file downloaded!", "success");
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
        try { return JSON.parse(localData); } catch (e) { console.error(e); }
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

        const data = getChecklistData(type);
        let html = '';

        if (type === 'magang' || type === 'skripsi') {
            data.forEach(group => {
                html += `<div class="checklist-group"><div class="checklist-title">${group.title}</div>`;
                group.items.forEach(item => {
                    html += `<div class="checklist-item" onclick="toggleCheckFromRow(event, '${item.id}')">
                        <input type="checkbox" class="chk-${type} custom-checkbox" id="${item.id}" onchange="updateProgress()">
                        <label for="${item.id}" onclick="event.stopPropagation();">
                            <span>${item.text}</span>
                            ${item.sub ? `<span class="sub-text">${item.sub}</span>` : ''}
                        </label>
                    </div>`;
                });
                html += `</div>`;
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
                                    <span class="cal-info-label">Batas Yudisium</span>
                                    <span class="deadline-tag">${item.text}</span>
                                </div>
                                <div class="cal-info-row">
                                    <span class="cal-info-label">Daftar Wisuda</span>
                                    <span class="cal-info-value">${item.sub}</span>
                                </div>
                            </div>
                        </div>
                        <button class="btn-calendar lang" data-id="Tambahkan ke Kalender" data-en="Add to Calendar" onclick="downloadICS('${group.title}', '${item.text}')">Tambahkan ke Kalender</button>
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
    document.getElementById('editor-modal-title').innerText = titles[type];
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
                <input type="text" value="${group.title}" onchange="editorTempData[${gIdx}].title = this.value" style="font-weight:bold; flex: 1; margin-bottom:0;" placeholder="Judul Kategori Utama">
                <button class="action-btn btn-rev" onclick="removeContentGroup(${gIdx})">Hapus Kategori</button>
            </div>
            <div style="margin-left: 10px; border-left: 2px solid var(--item-border); padding-left: 10px;">`;

        group.items.forEach((item, iIdx) => {
            html += `<div style="display:flex; gap:8px; margin-bottom: 10px; align-items:center;">
                <div style="flex-grow:1;">
                    <input type="text" value="${item.text}" placeholder="Data Utama" onchange="editorTempData[${gIdx}].items[${iIdx}].text = this.value" style="margin-bottom:5px; padding: 10px;">
                    <input type="text" value="${item.sub}" placeholder="Deskripsi/Detail" onchange="editorTempData[${gIdx}].items[${iIdx}].sub = this.value" style="margin-bottom:0; padding: 10px; font-size:13px;">
                </div>
                <button class="action-btn btn-rev" onclick="removeContentItem(${gIdx}, ${iIdx})" style="height: 40px; padding: 0 12px;">X</button>
            </div>`;
        });

        html += `<button class="action-btn btn-acc" onclick="addContentItem(${gIdx})" style="width:auto; margin-top:5px;">+ Tambah Item</button>
            </div></div>`;
    });

    html += `<button class="btn-secondary" style="background:var(--umy-gold); color:black; width:100%; margin-top: 10px;" onclick="addContentGroup()">+ Tambah Kategori Baru</button>`;

    container.innerHTML = html;
}

function addContentGroup() { editorTempData.push({ title: "Kategori Baru", items: [] }); renderEditorUI(); }
function removeContentGroup(gIdx) { if (confirm("Hapus kategori ini beserta item di dalamnya?")) { editorTempData.splice(gIdx, 1); renderEditorUI(); } }
function addContentItem(gIdx) { editorTempData[gIdx].items.push({ id: Date.now().toString(36), text: "", sub: "" }); renderEditorUI(); }
function removeContentItem(gIdx, iIdx) { editorTempData[gIdx].items.splice(iIdx, 1); renderEditorUI(); }

async function saveContentChanges() {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') { document.activeElement.blur(); }

    if (isOffline) {
        showToast(currentLang === 'id' ? "Anda sedang offline. Tidak dapat menyimpan." : "You are offline. Cannot save changes.", "error");
        return;
    }

    const jsonString = JSON.stringify(editorTempData);
    localStorage.setItem(`ipcos_content_${editorCurrentType}`, jsonString);
    closeModal('modal-edit-content');

    showLoader(currentLang === 'id' ? 'Menyimpan & Mensinkronisasi...' : 'Saving & Syncing...');

    try {
        const payload = { action: 'update_content', type: editorCurrentType, content: jsonString };
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await res.json();

        if (result.status === "success") {
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
        localStorage.setItem(`progress_${currentUser.nim}`, JSON.stringify(state));
        updateChecklistReminder(chkMagang.length - checkedMagang.length, chkSkripsi.length - checkedSkripsi.length);
    }
}

function updateChecklistReminder(unMagang, unSkripsi) {
    const reminderBox = document.getElementById('alert-checklist-reminder');
    const reminderText = document.getElementById('reminder-text-content');
    if (!reminderBox || !reminderText) return;

    if (unMagang === 0 && unSkripsi === 0) {
        reminderText.innerHTML = currentLang === 'id' ? '<b>Luar biasa!</b> Seluruh kewajiban Magang dan Skripsi Anda telah selesai 100%.' : '<b>Awesome!</b> All your Internship and Thesis tasks are 100% complete.';
        if (reminderBox.getAttribute('data-complete') !== 'true') { triggerConfetti(); reminderBox.setAttribute('data-complete', 'true'); }
    } else {
        reminderText.innerHTML = currentLang === 'id' ? `Masih ada <b>${unMagang}</b> tugas Magang & <b>${unSkripsi}</b> tahapan Skripsi yang belum dicentang.` : `You still have <b>${unMagang}</b> Internship & <b>${unSkripsi}</b> Thesis tasks unchecked.`;
        reminderBox.setAttribute('data-complete', 'false');
    }
    reminderBox.style.display = 'block';
}

function loadProgressData() {
    const savedState = localStorage.getItem(`progress_${currentUser.nim}`);
    if (savedState) {
        const state = JSON.parse(savedState);
        Object.keys(state).forEach(id => { const el = document.getElementById(id); if (el) el.checked = state[id]; });
    } else { document.querySelectorAll('input[type="checkbox"]').forEach(el => el.checked = false); }
    updateProgress();
}

function getStatusBadge(status) {
    const safeStatus = String(status).trim().toLowerCase();

    if (safeStatus === 'accepted') return `<span class="status-badge badge-accepted lang" data-id="Diterima" data-en="Accepted">${currentLang === 'id' ? 'Diterima' : 'Accepted'}</span>`;
    if (safeStatus === 'revision') return `<span class="status-badge badge-revision lang" data-id="Perlu Revisi" data-en="Revision Required">${currentLang === 'id' ? 'Perlu Revisi' : 'Revision Required'}</span>`;
    if (safeStatus === 'resubmitted') return `<span class="status-badge badge-resubmitted lang" data-id="Direvisi Mhs" data-en="Resubmitted">${currentLang === 'id' ? 'Direvisi Mhs' : 'Resubmitted'}</span>`;

    return `<span class="status-badge badge-pending lang" data-id="Sedang Diverifikasi" data-en="Under Verification">${currentLang === 'id' ? 'Sedang Diverifikasi' : 'Under Verification'}</span>`;
}

// ==========================================
// 10. SISTEM PENERJEMAH BAHASA DYNAMIS
// ==========================================
let currentLang = 'id';

function toggleLanguage() {
    currentLang = currentLang === 'id' ? 'en' : 'id';
    const langBtn = document.getElementById('lang-btn');
    if (langBtn) { langBtn.innerText = currentLang === 'id' ? 'Switch to English' : 'Ganti ke Indonesia'; }
    applyDynamicLanguage();

    const nimInput = document.getElementById('input-nim');
    if (nimInput) { nimInput.placeholder = currentLang === 'id' ? 'Masukkan NIM / Student ID' : 'Enter NIM / Student ID'; }

    if (currentUser.role === 'admin') { loadAdminData(); } else { loadStudentStatus(); }
    updateProgress();
}

function applyDynamicLanguage() {
    document.querySelectorAll('.lang').forEach(el => {
        const text = el.getAttribute(`data-${currentLang}`);
        if (text && el.innerHTML !== text) {
            el.classList.remove('lang-animating');
            void el.offsetWidth;
            el.innerHTML = text;
            el.classList.add('lang-animating');
        }
    });
}

// ==========================================
// 11. LOAD TABEL MAHASISWA & CHAT TIMELINE
// ==========================================
function loadStudentStatus() {
    const tbody = document.getElementById('table-my-status');
    const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
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

            let actionButtons = `<button class="btn-chat-log lang" onclick="openChatTimeline('${item.id}')" data-id="Lihat Riwayat Note" data-en="View Note History">${currentLang === 'id' ? 'Lihat Riwayat Note' : 'View Note History'}</button>`;
            if (stat === 'revision') {
                actionButtons += `<button class="action-btn btn-resend lang" onclick="openReplyModal('${item.id}')" style="width:100%; margin-top:8px;" data-id="Upload Perbaikan" data-en="Upload Correction">${currentLang === 'id' ? 'Upload Perbaikan' : 'Upload Correction'}</button>`;
            }

            let detailText = item.detail;
            if (item.dospem) {
                detailText += `<br><br><b style="color:var(--umy-maroon);">Dosen Pembimbing:</b><br>${item.dospem}`;
            }

            tbody.innerHTML += `<tr>
                <td style="font-size:13px; vertical-align:top;">${formatDate(item.date)}</td>
                <td style="vertical-align:top;"><b>${item.jenis}</b></td>
                <td style="font-size:14px; vertical-align:top;">${detailText}</td>
                <td style="text-align:center; vertical-align:top;">${getStatusBadge(item.status)}</td>
                <td style="min-width:160px; vertical-align:top;">${actionButtons}</td>
            </tr>`;
        });
    }

    const alertRev = document.getElementById('alert-revision-student');
    if (alertRev) alertRev.style.display = hasRevision ? 'block' : 'none';

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

function loadAdminData() { filterAdminData(); }

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

    const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
    const searchVal = (document.getElementById('admin-search-input')?.value || '').toLowerCase().trim();
    const filterVal = document.getElementById('admin-status-filter')?.value || 'ALL';

    adminFilteredData = records.filter(item => {
        const matchSearch = String(item.nama).toLowerCase().includes(searchVal) || String(item.nim).toLowerCase().includes(searchVal);
        const stat = String(item.status).trim().toLowerCase();
        const matchFilter = filterVal === 'ALL' || stat === filterVal.toLowerCase();
        return matchSearch && matchFilter;
    });

    adminFilteredData.sort((a, b) => {
        const dateA = new Date(a.date.replace(' ', 'T')).getTime();
        const dateB = new Date(b.date.replace(' ', 'T')).getTime();
        return isAdminSortDesc ? (dateB - dateA) : (dateA - dateB);
    });

    renderAdminTable();
}

function renderAdminTable() {
    const tbody = document.getElementById('table-admin-reg');
    tbody.innerHTML = '';

    if (adminFilteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px;">
            <div style="font-size: 30px; opacity: 0.5; margin-bottom: 10px;">-</div>
            <span class="lang" data-id="Tidak ada data yang sesuai pencarian." data-en="No matching data found.">${currentLang === 'id' ? 'Tidak ada data yang sesuai pencarian.' : 'No matching data found.'}</span>
        </td></tr>`;
        document.getElementById('admin-page-info').innerText = `Halaman 1 / 1`;
        return;
    }

    const totalPages = Math.ceil(adminFilteredData.length / rowsPerPage);
    if (currentAdminPage > totalPages) currentAdminPage = totalPages;
    if (currentAdminPage < 1) currentAdminPage = 1;

    const startIndex = (currentAdminPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedItems = adminFilteredData.slice(startIndex, endIndex);

    document.getElementById('admin-page-info').innerText = `Halaman ${currentAdminPage} / ${totalPages}`;

    paginatedItems.forEach(item => {
        let formattedLink = item.link;
        if (formattedLink && formattedLink.includes('href="')) {
            const matchUrl = formattedLink.match(/href="([^"]+)"/);
            if (matchUrl && matchUrl[1]) { formattedLink += `<br><button class="btn-preview-doc" onclick="openDocPreview('${matchUrl[1]}')">Preview File</button>`; }
        }

        tbody.innerHTML += `<tr>
            <td style="font-size:13px; vertical-align:top;">${formatDateTime(item.date)}</td>
            <td style="vertical-align:top;">${item.nim}<br><b>${item.nama}</b></td>
            <td style="vertical-align:top;"><b>${item.jenis}</b></td>
            <td style="vertical-align:top;">${formattedLink}</td>
            <td style="text-align:center; vertical-align:top;">
                ${getStatusBadge(item.status)}<br>
                <button class="btn-chat-log lang" onclick="openChatTimeline('${item.id}')" style="margin-top:6px;" data-id="Chat Timeline" data-en="Chat Timeline">Chat Timeline</button>
            </td>
            <td style="min-width:130px; vertical-align:top;">
                ${(() => {
                const stat = String(item.status).trim().toLowerCase();
                if (stat === 'accepted') return '-';

                let buttons = '';
                if (item.jenis === 'Outline') {
                    buttons += `<button class="action-btn lang" style="background: rgba(129, 145, 47, 0.15); color: var(--umy-green); border: 1px solid rgba(129, 145, 47, 0.3);" onclick="openDospemModal('${item.id}')" data-id="Tunjuk Dospem" data-en="Assign Dospem">Tunjuk Dospem</button>`;
                } else if (item.jenis === 'Pergantian Pembimbing') {
                    // Tombol khusus Pergantian Pembimbing yang membuka Modal Dospem
                    buttons += `<button class="action-btn lang" style="background: rgba(129, 145, 47, 0.15); color: var(--umy-green); border: 1px solid rgba(129, 145, 47, 0.3);" onclick="openDospemModal('${item.id}')" data-id="Tunjuk Dospem Baru" data-en="Assign New Dospem">Tunjuk Dospem Baru</button>`;
                } else {
                    buttons += `<button class="action-btn btn-acc lang" onclick="acceptSubmission('${item.id}')" data-id="Terima" data-en="Accept">${currentLang === 'id' ? 'Terima' : 'Accept'}</button>`;
                }
                buttons += `<button class="action-btn btn-rev lang" onclick="openRevisionModal('${item.id}')" data-id="Revisi" data-en="Revise">${currentLang === 'id' ? 'Revisi' : 'Revise'}</button>`;

                return buttons;
            })()}
            </td>
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
}

function exportAdminDataCSV() {
    const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
    if (records.length === 0) { showToast("Belum ada data untuk diekspor.", "error"); return; }
    let csvContent = "data:text/csv;charset=utf-8,ID,Tanggal,NIM,Nama,Jenis,Status\n";
    records.forEach(r => { const cleanName = `"${r.nama.replace(/"/g, '""')}"`; csvContent += `${r.id},${r.date},${r.nim},${cleanName},${r.jenis},${r.status}\n`; });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_IPCOS_UMY_${Date.now()}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast("Data CSV berhasil diunduh!", "success");
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
    // BUG FIX: previous logic only validated the confirmation word when currentLang was exactly
    // 'id' or 'en'; any other/unexpected value silently skipped validation and deleted everything.
    const requiredWord = currentLang === 'id' ? 'HAPUS' : 'DELETE';
    if (confirmInput !== requiredWord) {
        showToast(currentLang === 'id' ? "Proses dibatalkan." : "Process cancelled.", "error");
        return;
    }

    showLoader(currentLang === 'id' ? 'Menghapus Seluruh Data...' : 'Deleting All Data...');

    fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'delete_all_registrations' }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
        .then(res => res.json())
        .then(result => {
            if (result.status === "success") {
                showToast(currentLang === 'id' ? "Seluruh data pendaftar berhasil dikosongkan!" : "All registration data cleared successfully!", "success");
                localStorage.setItem('ipcos_registrations', '[]');
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
            ? "DITUTUP"
            : `${days}d : ${hours}h : ${minutes}m : ${seconds}s`;

        document.querySelectorAll('.countdown-timer-display, #countdown-timer-display').forEach(el => {
            if (el) el.innerText = textDisplay;
        });
    }, 1000);
}

function openChatTimeline(id) {
    const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
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
                    <div class="chat-sender"><span>${log.sender} (${log.role.toUpperCase()})</span><span style="opacity:0.7; font-weight:normal;">${formatDate(log.time)}</span></div>
                    <div>${log.message}</div></div>`;
        });
    }

    const modal = document.getElementById('modal-chat-timeline');
    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

// ==========================================
// 13. UPDATE DATA & REVISI PERBAIKAN
// ==========================================
async function sendUpdateRequest(id, newStatus, noteText, files = [], dospem = null) {
    if (isOffline) {
        showToast(currentLang === 'id' ? "Tidak dapat menyimpan saat offline." : "Cannot save while offline.", "error");
        return;
    }
    showLoader(currentLang === 'id' ? 'Sedang Memproses...' : 'Processing...');
    try {
        const payload = { action: 'update', id: id, status: newStatus, note: noteText, senderName: currentUser.nama, senderRole: currentUser.role, files: files, dospem: dospem };
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await res.json();
        if (result.status === "success") syncDatabase(); else showToast("Gagal: " + (result.message || "Error tidak diketahui"), "error");
    } catch (err) { showToast(currentLang === 'id' ? "Terjadi kesalahan jaringan/upload." : "Network/upload error occurred.", "error"); } finally { hideLoader(); }
}

function acceptSubmission(id) {
    const msg = currentLang === 'id' ? "Apakah Anda yakin ingin memverifikasi/menyetujui berkas ini?" : "Are you sure you want to approve this file?";
    if (confirm(msg)) sendUpdateRequest(id, 'Accepted', currentLang === 'id' ? 'Berkas telah disetujui dan terverifikasi.' : 'File approved and verified.');
}

function openRevisionModal(id) {
    document.getElementById('hidden-rev-id').value = id; document.getElementById('input-rev-note').value = "";
    const modal = document.getElementById('modal-revision'); modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

function openDospemModal(id) {
    document.getElementById('hidden-dospem-id').value = id;
    
    // Auto-update dropdown dosen
    populateDospemDropdown();

    const modal = document.getElementById('modal-dospem');
    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

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

function openReplyModal(id) {
    document.getElementById('hidden-reply-id').value = id; document.getElementById('input-reply-note').value = "";
    document.getElementById('input-reply-file').value = ""; document.getElementById('name-reply-file').innerText = "";
    const modal = document.getElementById('modal-reply'); modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

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

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (modal.tagName && modal.tagName.toLowerCase() === 'dialog') {
        modal.close();
    } else {
        modal.style.opacity = '0';
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    }
}
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('ipcos_theme', isDark ? 'dark' : 'light');
}
function toggleSidebar() { document.getElementById('main-sidebar').classList.toggle('active'); }

function switchTab(event, tabId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    const target = document.getElementById(tabId);
    if (target) {
        target.classList.remove('active'); void target.offsetWidth; target.classList.add('active');
    }
    document.getElementById('main-sidebar').classList.remove('active');

    if (tabId === 'pendaftaran') {
        loadFormDraft();
        const jenisEl = document.getElementById('reg-jenis-utama');
        const judulEl = document.getElementById('reg-judul');
        if (jenisEl && !jenisEl.dataset.draftBound) { jenisEl.addEventListener('change', saveFormDraft); jenisEl.dataset.draftBound = 'true'; }
        if (judulEl && !judulEl.dataset.draftBound) { judulEl.addEventListener('input', saveFormDraft); judulEl.dataset.draftBound = 'true'; }
    }
}

const catEl = document.getElementById('easter-cat'); let catTimer;
function scheduleCat() { catTimer = setTimeout(showCat, Math.floor(Math.random() * 10000) + 5000); }
function showCat() { catEl.classList.add('peek'); setTimeout(() => { if (catEl.classList.contains('peek')) hideCat(); }, 4000); }
function hideCat() { catEl.classList.remove('peek'); clearTimeout(catTimer); scheduleCat(); }

function silentSyncDatabase() {
    if (document.hidden || isOffline) return;
    if (currentUser && currentUser.nim !== '') {
        const freshUrl = GAS_URL + "?t=" + new Date().getTime();
        fetch(freshUrl).then(response => response.json()).then(data => {

            data.registrations = normalizeData(data.registrations);

            const oldDataStr = localStorage.getItem('ipcos_registrations');
            const newDataStr = JSON.stringify(data.registrations || []);

            if (data.announcements && data.announcements.length > 0) {
                localStorage.setItem('ipcos_announcements', JSON.stringify(data.announcements));
                renderNotifications();
            }

            if (oldDataStr !== newDataStr) {
                localStorage.setItem('ipcos_registrations', newDataStr);
                if (currentUser.role === 'admin') { loadAdminData(); renderDashboardCharts(data.registrations || []); }
                else { loadStudentStatus(); renderActivityTimeline(data.registrations || []); }
            }
        }).catch(error => console.log("Silent Sync terhambat..."));
    }
}
setInterval(silentSyncDatabase, 180000);

// ==========================================
// 14. SIDEBAR INTERAKTIF & WHATSAPP FLOAT
// ==========================================
function toggleDesktopSidebar() { document.getElementById('main-sidebar').classList.toggle('collapsed'); document.querySelector('.main-content').classList.toggle('expanded'); }
let waScrollTimer;
window.addEventListener('scroll', () => {
    const waBtn = document.getElementById('wa-float-btn');
    if (waBtn) { waBtn.classList.add('wa-hidden'); clearTimeout(waScrollTimer); waScrollTimer = setTimeout(() => { waBtn.classList.remove('wa-hidden'); }, 800); }
}, { passive: true });

// ==========================================
// 15. DASHBOARD CHART ANALYTICS & STATS (BENTO ADMIN)
// ==========================================
let ratioChartInstance = null; let typeChartInstance = null;

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
    if (!ctxRatio || !ctxType) return;

    if (ratioChartInstance) ratioChartInstance.destroy();
    if (typeChartInstance) typeChartInstance.destroy();

    Chart.defaults.color = document.body.classList.contains('dark-mode') ? '#A3968C' : '#796C63';
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

    ratioChartInstance = new Chart(ctxRatio.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Accepted', 'Revisi', 'Resubmitted'],
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
            labels: ['Outline', 'Proposal', 'Pendadaran', 'Jurnal', 'Ganti Dosen'],
            datasets: [{
                label: 'Jumlah Pengajuan',
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

    postAnnouncement(msg, 'info').then(() => { if (input) input.value = ''; });
}

async function postAnnouncement(customMsg = null, customType = null) {
    if (isOffline) { showToast("Tidak dapat mengirim broadcast saat offline.", "error"); return; }

    const masterInput = document.getElementById('input-broadcast');
    const checkImportant = document.getElementById('check-important-broadcast');

    const msg = customMsg !== null ? customMsg : (masterInput ? masterInput.value.trim() : '');

    if (!msg) { showToast("Pesan pengumuman tidak boleh kosong!", "error"); return; }

    const annType = customType !== null ? customType : (checkImportant && checkImportant.checked ? 'important' : 'info');

    showLoader();
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'post_announcement', message: msg, type: annType }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        showToast("Pengumuman berhasil disebarkan!", "success");

        if (!customMsg && masterInput) masterInput.value = '';
        if (!customType && checkImportant) checkImportant.checked = false;

        syncDatabase();
    } catch (e) {
        showToast("Gagal mengirim pengumuman", "error");
    } finally {
        hideLoader();
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
        tbody.innerHTML += `<tr><td><b>${s.NIM}</b></td><td>${s.Nama}</td><td><span class="status-badge ${badgeClass}">${statusMhs}</span></td><td><button class="action-btn btn-rev" onclick="deleteStudent('${s.NIM}')">Hapus</button></td></tr>`;
    });
}

async function addStudent() {
    if (isOffline) { showToast("Tidak dapat menambah mahasiswa saat offline.", "error"); return; }
    const nim = document.getElementById('add-nim').value.trim(); const nama = document.getElementById('add-nama').value.trim();
    if (!nim || !nama) { showToast("NIM dan Nama wajib diisi!", "error"); return; }
    showLoader();
    try { await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'manage_student', method: 'add', nim: nim, nama: nama }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); showToast("Mahasiswa berhasil ditambahkan!", "success"); document.getElementById('add-nim').value = ''; document.getElementById('add-nama').value = ''; syncDatabase(); } catch (e) { showToast("Gagal menambah data", "error"); } finally { hideLoader(); }
}

async function deleteStudent(nim) {
    if (isOffline) { showToast("Tidak dapat menghapus saat offline.", "error"); return; }
    if (!confirm(`Apakah Anda yakin ingin menghapus akses untuk NIM: ${nim}?`)) return;
    showLoader();
    try { await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'manage_student', method: 'delete', nim: nim }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); showToast("Akses Mahasiswa berhasil dihapus!", "success"); syncDatabase(); } catch (e) { showToast("Gagal menghapus data", "error"); } finally { hideLoader(); }
}

function toggleCheckFromRow(event, id) {
    if (event.target.tagName !== 'INPUT') {
        const chk = document.getElementById(id);
        if (chk) {
            chk.checked = !chk.checked;
            updateProgress();
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
    
    const dosens = JSON.parse(localStorage.getItem('ipcos_dosens') || '[]');
    
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
        
        let statusBadge = `<span class="status-badge badge-accepted">Tersedia (${sisa})</span>`;
        if (sisa <= 0) statusBadge = `<span class="status-badge badge-revision">Penuh</span>`;
        else if (sisa <= 2) statusBadge = `<span class="status-badge badge-pending">Hampir Penuh</span>`;

        tbody.innerHTML += `
            <tr>
                <td><b>${nama}</b></td>
                <td style="text-align: center; font-size: 16px; font-weight: bold;">${terpakai}</td>
                <td style="text-align: center;">${maksimal}</td>
                <td style="text-align: center;">${statusBadge}</td>
                <td>
                    <button class="action-btn" style="background: var(--item-hover); border: 1px solid var(--item-border);" onclick="openEditDosen('${nama}', ${terpakai}, ${maksimal})">Edit</button>
                    <button class="action-btn btn-rev" onclick="deleteDosen('${nama}')">Hapus</button>
                </td>
            </tr>
        `;
    });
}

function populateDospemDropdown() {
    const select = document.getElementById('input-dospem-select');
    if (!select) return;
    
    const dosens = JSON.parse(localStorage.getItem('ipcos_dosens') || '[]');
    let html = '<option value="">-- Pilih Dosen Pembimbing --</option>';
    
    dosens.sort((a, b) => a.Nama.localeCompare(b.Nama));

    dosens.forEach(d => {
        const sisa = parseInt(d.Maksimal) - parseInt(d.Terpakai);
        const disabled = sisa <= 0 ? 'disabled' : '';
        const warn = sisa <= 0 ? '(PENUH)' : `(Sisa Kuota: ${sisa})`;
        html += `<option value="${d.Nama}" ${disabled}>${d.Nama} ${warn}</option>`;
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

async function saveDosenQuota() {
    if (isOffline) { showToast("Sedang offline.", "error"); return; }
    
    const nama = document.getElementById('hidden-dosen-nama').value;
    const terpakai = document.getElementById('edit-dosen-terpakai').value;
    const maksimal = document.getElementById('edit-dosen-maksimal').value;
    
    showLoader();
    try {
        await fetch(GAS_URL, { 
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
    
    showLoader();
    try {
        await fetch(GAS_URL, { 
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
        await fetch(GAS_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'manage_dosen', method: 'delete', nama: nama }), 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
        });
        showToast("Dosen dihapus!", "success");
        syncDatabase();
    } catch (e) { showToast("Gagal.", "error"); } finally { hideLoader(); }
}