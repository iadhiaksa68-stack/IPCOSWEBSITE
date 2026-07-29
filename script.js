// Link Web App Google Apps Script Terbaru
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

// ==========================================
// 1.5. INTERACTIVE DOODLE BACKGROUND UNTUK LOGIN
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

        switch(this.type) {
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
                doodleCtx.quadraticCurveTo(-this.size/2, -this.size*0.8, 0, 0);
                doodleCtx.quadraticCurveTo(this.size/2, this.size*0.8, this.size, 0);
                doodleCtx.stroke(); break;
            case 3: 
                doodleCtx.beginPath();
                doodleCtx.moveTo(this.size*0.5, 0);
                doodleCtx.bezierCurveTo(this.size*0.8, -this.size*0.5, -this.size*0.2, -this.size, -this.size*0.6, -this.size*0.2);
                doodleCtx.bezierCurveTo(-this.size*1.2, this.size*0.5, -this.size*0.2, this.size*0.8, this.size*0.5, 0);
                doodleCtx.stroke(); break;
            case 4: 
                doodleCtx.beginPath(); doodleCtx.arc(0, 0, this.size/3, 0, Math.PI*2); doodleCtx.fill();
                doodleCtx.beginPath(); doodleCtx.arc(this.size*0.8, -this.size*0.5, this.size/4, 0, Math.PI*2); doodleCtx.fill();
                doodleCtx.beginPath(); doodleCtx.arc(-this.size*0.7, this.size*0.6, this.size/5, 0, Math.PI*2); doodleCtx.fill(); break;
            case 5: 
                doodleCtx.beginPath(); let r = this.size * 0.4; doodleCtx.moveTo(0, r);
                doodleCtx.bezierCurveTo(0, -r, -r*2.5, -r*1.5, -r*1.5, r*0.5);
                doodleCtx.bezierCurveTo(-r, r*2, 0, r*2.5, 0, r*3);
                doodleCtx.bezierCurveTo(0, r*2.5, r, r*2, r*1.5, r*0.5);
                doodleCtx.bezierCurveTo(r*2.5, -r*1.5, 0, -r, 0, r); doodleCtx.stroke(); break;
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
// 2. SIMULASI LOGIN, DARK MODE SINKRONISASI DATABASE
// ==========================================
let DB_MAHASISWA = {}; 
let globalAnnouncements = [];
let currentUser = { nim: '', nama: '', role: '' };

window.onload = function() {
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

document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        document.querySelectorAll('.overlay').forEach(modal => {
            if (window.getComputedStyle(modal).display !== 'none' && modal.id !== 'welcome-modal') {
                closeModal(modal.id);
            }
        });
    }
});

function syncDatabase() {
    showLoader();
    const freshUrl = GAS_URL + "?t=" + new Date().getTime();
    fetch(freshUrl)
    .then(response => response.json())
    .then(data => {
        localStorage.setItem('ipcos_registrations', JSON.stringify(data.registrations || []));
        
        DB_MAHASISWA = {};
        if (data.students) {
            data.students.forEach(m => { DB_MAHASISWA[String(m.NIM)] = m.Nama; });
            if (currentUser.role === 'admin') renderMasterMahasiswa(data.students);
        }

        if (data.announcements && data.announcements.length > 0) {
            const latest = data.announcements[data.announcements.length - 1];
            if (currentUser.role === 'mhs') {
                document.getElementById('announcement-text').innerText = latest.Pesan || latest.message;
                document.getElementById('announcement-banner').style.display = 'flex';

                const annType = latest.Tipe || latest.type;
                const annId = latest.Id || latest.date || latest.message; 
                
                if (annType === 'important' && !sessionStorage.getItem('seen_announcement_' + annId)) {
                    document.getElementById('important-announcement-text').innerText = latest.Pesan || latest.message;
                    const modal = document.getElementById('modal-important-announcement');
                    if(modal) {
                        modal.style.display = 'flex';
                        setTimeout(() => { modal.style.opacity = '1'; }, 10);
                        sessionStorage.setItem('seen_announcement_' + annId, 'true');
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
        }
    })
    .catch(error => {
        showToast(currentLang === 'id' ? "Gagal mengambil data dari server." : "Failed to fetch data from server.", "error");
        console.error(error);
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
    if(nimInput === "") {
        errorMsg.innerText = currentLang === 'id' ? "Mohon masukkan NIM Anda." : "Please enter your NIM.";
        errorMsg.style.display = 'block'; return;
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
    document.getElementById('display-greeting').innerText = `${randomGreeting}, ${firstName}!`;
    
    document.querySelectorAll('.admin-only').forEach(el => {
        if(el.classList.contains('bento-grid')) {
            el.style.display = role === 'admin' ? 'grid' : 'none';
        } else {
            el.style.display = role === 'admin' ? 'inline-block' : 'none';
        }
    });
    
    document.querySelectorAll('.student-only').forEach(el => {
        if (role === 'mhs') {
            if (!el.classList.contains('alert-box')) {
                el.style.display = 'flex';
            }
        } else {
            el.style.display = 'none';
        }
    });

    if(role === 'admin') {
        const statusLabel = document.getElementById('label-status-user');
        if(statusLabel) {
            statusLabel.setAttribute('data-id', 'Akses Superuser');
            statusLabel.setAttribute('data-en', 'Superuser Access');
        }
        document.getElementById('header-subtext').innerText = "Role: Administrator";
        
        loadAdminData();
        const cachedRecords = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
        renderDashboardCharts(cachedRecords);

    } else {
        const statusLabel = document.getElementById('label-status-user');
        if(statusLabel) {
            statusLabel.setAttribute('data-id', 'Mahasiswa Aktif');
            statusLabel.setAttribute('data-en', 'Active Student');
        }
        document.getElementById('header-subtext').innerText = `NIM: ${displayNim}`;
        
        loadProgressData(); 
        loadStudentStatus();
    }

    document.getElementById('student-header').style.display = 'flex';
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
    if(confirm(msg)) {
        sessionStorage.removeItem('ipcos_session');
        currentUser = { nim: '', nama: '', role: '' };
        document.getElementById('student-header').style.display = 'none';
        switchTab({currentTarget: document.querySelector('.nav-tabs li')}, 'dashboard');
        const modal = document.getElementById('welcome-modal');
        modal.style.display = 'flex';
        initDoodleCanvas(); 
        setTimeout(() => { modal.style.opacity = '1'; }, 10);
    }
}

// ==========================================
// 3. FUNGSI DRAG & DROP SERTA VALIDASI FILE
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

function validateFile(input, labelId) {
    if (input.files && input.files.length > 0) {
        const file = input.files[0];
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            showToast(currentLang === 'id' ? `Ukuran max file adalah ${MAX_FILE_SIZE_MB}MB!` : `Max file size is ${MAX_FILE_SIZE_MB}MB!`, 'error');
            input.value = "";
            if(labelId) document.getElementById(labelId).innerText = "";
        } else {
            if(labelId) document.getElementById(labelId).innerText = file.name;
        }
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function toggleExamForm() {
    const formContainer = document.getElementById('dynamic-exam-form');
    const jenisUjian = document.getElementById('reg-jenis-utama').value;
    
    document.getElementById('req-outline-only').style.display = 'none';
    document.getElementById('req-sempro-only').style.display = 'none';
    document.getElementById('req-pendadaran').style.display = 'none';
    document.getElementById('req-jurnal-only').style.display = 'none';
    document.getElementById('req-ganti-dosen').style.display = 'none'; 

    if (jenisUjian === "") { formContainer.style.display = 'none'; return; }
    formContainer.style.display = 'block';

    if (jenisUjian === "Outline") document.getElementById('req-outline-only').style.display = 'block';
    else if (jenisUjian === "Proposal") document.getElementById('req-sempro-only').style.display = 'block';
    else if (jenisUjian === "Pendadaran") document.getElementById('req-pendadaran').style.display = 'block';
    else if (jenisUjian === "Skripsi Jurnal") document.getElementById('req-jurnal-only').style.display = 'block';
    else if (jenisUjian === "Pergantian Pembimbing") document.getElementById('req-ganti-dosen').style.display = 'block'; 
}

async function submitForm(e) {
    e.preventDefault();

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
            if(!fTranskrip || !fProposal) throw new Error(currentLang === 'id' ? "Mohon upload seluruh berkas!" : "Please upload all files!"); 
            filesToUpload.push({ label: 'Transkrip', fileName: fTranskrip.name, mimeType: fTranskrip.type, base64: await fileToBase64(fTranskrip) });
            filesToUpload.push({ label: 'Proposal', fileName: fProposal.name, mimeType: fProposal.type, base64: await fileToBase64(fProposal) });
        } else if (jenisUjian === "Proposal") {
            const fAcc = document.getElementById('file-acc-sempro').files[0];
            if(!fAcc) throw new Error(currentLang === 'id' ? "Mohon upload Bukti ACC!" : "Please upload Approval Proof!"); 
            filesToUpload.push({ label: 'Bukti ACC', fileName: fAcc.name, mimeType: fAcc.type, base64: await fileToBase64(fAcc) });
        } else if (jenisUjian === "Pendadaran") {
            const fPendadaran = document.getElementById('file-folder-pendadaran').files[0];
            if(!fPendadaran) throw new Error(currentLang === 'id' ? "Mohon upload berkas pendadaran!" : "Please upload defense documents!"); 
            filesToUpload.push({ label: 'Berkas Pendadaran', fileName: fPendadaran.name, mimeType: fPendadaran.type, base64: await fileToBase64(fPendadaran) });
        } else if (jenisUjian === "Skripsi Jurnal") {
            const fLoa = document.getElementById('file-loa-jurnal').files[0];
            const fDraftJurnal = document.getElementById('file-draft-jurnal').files[0];
            if(!fLoa || !fDraftJurnal) throw new Error(currentLang === 'id' ? "Mohon upload LoA dan Draft Jurnal!" : "Please upload LoA and Draft!");
            filesToUpload.push({ label: 'LoA Jurnal', fileName: fLoa.name, mimeType: fLoa.type, base64: await fileToBase64(fLoa) });
            filesToUpload.push({ label: 'Draft Jurnal', fileName: fDraftJurnal.name, mimeType: fDraftJurnal.type, base64: await fileToBase64(fDraftJurnal) });
        } 
        else if (jenisUjian === "Pergantian Pembimbing") {
            const fSurat = document.getElementById('file-surat-ganti').files[0];
            const dLama = document.getElementById('reg-dosen-lama').value;
            const dBaru = document.getElementById('reg-dosen-baru').value;
            const kets = document.getElementById('reg-alasan-ganti').value;

            if(!fSurat) throw new Error(currentLang === 'id' ? "Mohon upload Surat Pengajuan!" : "Please upload Submission Letter!");
            if(!dLama || !dBaru || !kets) throw new Error(currentLang === 'id' ? "Semua field dosen dan alasan wajib diisi!" : "All fields are required!");
            if(dLama === dBaru) throw new Error(currentLang === 'id' ? "Dosen lama dan baru tidak boleh sama!" : "Old and new supervisor cannot be the same!");

            finalDetail += `<br><b>Dosen Lama:</b> ${dLama}<br><b>Dosen Baru:</b> ${dBaru}<br><b>Alasan:</b> ${kets}`;
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
// 4. GENERATOR GOOGLE CALENDAR (.ics)
// ==========================================
function downloadICS(title, dateStr) {
    const dateObj = new Date(dateStr);
    
    if(isNaN(dateObj)) { 
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
// 5. EDITOR KONTEN DINAMIS (ADMIN)
// ==========================================
const defaultMagang = [
    { title: "Tahap Persiapan (Pra-Magang)", items: [ { id: "m1", text: "Menyusun & Merealisasikan Proposal Magang", sub: "Bagi jalur Internasional (KBRI Kuala Lumpur), berkas wajib dikirim H-6 bulan." } ] },
    { title: "Tahap Pelaksanaan (Selama Magang)", items: [ { id: "m2", text: "Mengisi Daily Log Book Secara Rutin", sub: "" }, { id: "m3", text: "Mematuhi Aturan Etika & Proteksi Kerahasiaan Lembaga", sub: "" } ] },
    { title: "Tahap Pasca-Pelaksanaan & Pelaporan", items: [ { id: "m4", text: "Menyusun Laporan Akhir Magang", sub: "" }, { id: "m5", text: "Memvalidasi Lembar Pengesahan Resmi", sub: "" }, { id: "m6", text: "Mengumpulkan Form Penilaian Resmi", sub: "" } ] }
];

const defaultSkripsi = [
    { title: "Fase I: Pengajuan Outline & DPS", items: [ { id: "s1", text: "Mengajukan Outline Proposal (Tgl 1-7 Awal Bulan)", sub: "" }, { id: "s2", text: "Mengambil Surat Kesanggupan DPS & Kartu Bimbingan", sub: "" } ] },
    { title: "Fase II: Seminar Proposal", items: [ { id: "s3", text: "Bimbingan Proposal Minimal 5 Kali", sub: "" }, { id: "s4", text: "Mendaftar Seminar Proposal (Tgl 1-10)", sub: "" } ] },
    { title: "Fase III: Ujian Akhir (Pendadaran)", items: [ { id: "s5", text: "Sertifikasi & Syarat Administrasi Lengkap", sub: "" }, { id: "s6", text: "Lolos Uji Turnitin (Similarity < 20%)", sub: "" }, { id: "s7", text: "Proofread Ke-1 (Pre-Pendadaran)", sub: "" } ] },
    { title: "Fase IV: Yudisium & Wisuda", items: [ { id: "s8", text: "Proofread Ke-2 & Surat Bebas Pustaka", sub: "" }, { id: "s9", text: "Pemberkasan Map Merah Wisuda", sub: "" } ] }
];

const defaultKurikulum = [
    { title: "Semester 1 & 2 (Tahun Pertama)", items: [ { id: "k1", text: "Semester 1", sub: "Kemanusiaan & Keimanan, Pancasila, Retorika, Pengantar Ilmu Komunikasi, Psikologi Komunikasi, Bahasa Inggris, Berfikir Kreatif, Komunikasi Massa." }, { id: "k2", text: "Semester 2", sub: "Teori Komunikasi, Komunikasi Interpersonal, Multikultur, Organisasi, Dasar AI, Bahasa Indonesia, Pengantar Periklanan, Pengantar PR, Ibadah Akhlak." } ] },
    { title: "Semester 3 & 4 (Tahun Kedua)", items: [ { id: "k3", text: "Semester 3", sub: "Pengantar Jurnalistik, Sinematografi, TIK, Fotografi, Sosiologi Komunikasi, Perilaku Konsumen, Negosiasi, Metode Kuantitatif." }, { id: "k4", text: "Semester 4", sub: "IMC, Manajemen Stratejik, Kajian Media, Metode Kualitatif, Komunikasi Politik, Manajemen Isu & Krisis, Manajemen PR, Eksternal Relations." } ] },
    { title: "Semester 5 & 6 (Tahun Ketiga)", items: [ { id: "k5", text: "Semester 5", sub: "Riset PR, Pemasaran Sosial, Cyber PR, Etika Profesi PR, CSR, Manajemen Konflik, Govt & Public Affair, Kewirausahaan, Kewarganegaraan." }, { id: "k6", text: "Semester 6", sub: "Manajemen Event, Penulisan PR, Produksi Media PR, Professional Image, Strategi & Taktik PR, Islam Sains & Teknologi, Kemuhammadiyahan." } ] }
];

const defaultRemedial = [
    { title: "Alur Remidial", items: [ { id: "r1", text: "1. Pra-KRS & Bayar", sub: "Daftar di menu remidi dan bayar di Bank Gedung AR B. Wajib key-in kembali!" }, { id: "r2", text: "2. Penentuan Dosen", sub: "Prodi menetapkan dosen pengampu sesuai linearitas semester reguler." }, { id: "r3", text: "3. Bimbingan", sub: "Tatap muka 100 menit. 2 SKS = 2x pertemuan, 3 SKS = 3x pertemuan, dst." }, { id: "r4", text: "4. Uji Kompetensi", sub: "1 kali tes akhir untuk mengukur penguasaan materi dan nilai masuk KHS." } ] }
];

const defaultKalender = [
    { title: "Periode I (Sep 2026)", items: [{ id: "c1", text: "20 Jul 2026", sub: "21 - 31 Jul 2026" }] },
    { title: "Periode II (Des 2026)", items: [{ id: "c2", text: "19 Okt 2026", sub: "20 - 30 Okt 2026" }] },
    { title: "Periode III (Apr 2027)", items: [{ id: "c3", text: "18 Jan 2027", sub: "19 - 29 Jan 2027" }] },
    { title: "Periode IV (Jun 2027)", items: [{ id: "c4", text: "19 Apr 2027", sub: "20 - 30 Apr 2027" }] }
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
    return [];
}

function renderDynamicContent() {
    const types = ['magang', 'skripsi', 'kurikulum', 'remidial', 'kalender'];
    
    types.forEach(type => {
        const containerId = (type === 'magang' || type === 'skripsi') ? `${type}-checklist-container` : `${type}-content-container`;
        const container = document.getElementById(containerId);
        if(!container) return;
        
        const data = getChecklistData(type);
        let html = '';
        
        if (type === 'magang' || type === 'skripsi') {
            data.forEach(group => {
                html += `<div class="checklist-group"><div class="checklist-title">${group.title}</div>`;
                group.items.forEach(item => {
                    html += `<div class="checklist-item">
                        <input type="checkbox" class="chk-${type}" id="${item.id}" onchange="updateProgress()">
                        <label for="${item.id}">
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
    
    const titles = { 'magang': 'Edit Konten Magang', 'skripsi': 'Edit Konten Skripsi', 'kurikulum': 'Edit Konten Kurikulum', 'remidial': 'Edit SOP Remidial', 'kalender': 'Edit Kalender TA' };
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
function removeContentGroup(gIdx) { if(confirm("Hapus kategori ini beserta item di dalamnya?")) { editorTempData.splice(gIdx, 1); renderEditorUI(); } }
function addContentItem(gIdx) { editorTempData[gIdx].items.push({ id: Date.now().toString(36), text: "", sub: "" }); renderEditorUI(); }
function removeContentItem(gIdx, iIdx) { editorTempData[gIdx].items.splice(iIdx, 1); renderEditorUI(); }

async function saveContentChanges() {
    if(document.activeElement && document.activeElement.tagName === 'INPUT') { document.activeElement.blur(); }
    
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
// 6. PROGRESS BAR & CONFETTI
// ==========================================
let confettiAnimationId = null;

function triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if(!canvas) return;
    
    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
    
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    let particles = [];
    for(let i=0; i<150; i++){
        particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height, r: Math.random() * 6 + 2, d: Math.random() * 100, color: ['#F4B324', '#00492C', '#8E2122', '#00ff88', '#FF8DA1'][Math.floor(Math.random()*5)] });
    }
    
    let angle = 0; let timer = 0;
    
    function draw(){
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        angle += 0.01; timer++;
        
        for(let i=0; i<150; i++){
            let p = particles[i];
            ctx.beginPath(); ctx.fillStyle = p.color; ctx.arc(p.x, p.y, p.r, 0, Math.PI*2, true); ctx.fill();
            p.y += Math.cos(angle + p.d) + 1 + p.r/2; p.x += Math.sin(angle);
        }
        
        if(timer < 250) { 
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
    if(barMagang) { barMagang.style.width = pctMagang + '%'; barMagang.innerText = pctMagang > 0 ? pctMagang + '%' : ''; }

    const chkSkripsi = document.querySelectorAll('.chk-skripsi');
    const checkedSkripsi = document.querySelectorAll('.chk-skripsi:checked');
    const pctSkripsi = chkSkripsi.length ? Math.round((checkedSkripsi.length / chkSkripsi.length) * 100) : 0;
    const barSkripsi = document.getElementById('bar-skripsi');
    if(barSkripsi) { barSkripsi.style.width = pctSkripsi + '%'; barSkripsi.innerText = pctSkripsi > 0 ? pctSkripsi + '%' : ''; }

    if(currentUser.role === 'mhs') {
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
    if(!reminderBox || !reminderText) return;

    if(unMagang === 0 && unSkripsi === 0) {
        reminderText.innerHTML = currentLang === 'id' ? '<b>Luar biasa!</b> Seluruh kewajiban Magang dan Skripsi Anda telah selesai 100%.' : '<b>Awesome!</b> All your Internship and Thesis tasks are 100% complete.';
        if(reminderBox.getAttribute('data-complete') !== 'true') { triggerConfetti(); reminderBox.setAttribute('data-complete', 'true'); }
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
        Object.keys(state).forEach(id => { const el = document.getElementById(id); if(el) el.checked = state[id]; });
    } else { document.querySelectorAll('input[type="checkbox"]').forEach(el => el.checked = false); }
    updateProgress();
}

function getStatusBadge(status) {
    if(status === 'Accepted') return `<span class="status-badge badge-accepted lang" data-id="Diterima" data-en="Accepted">${currentLang === 'id' ? 'Diterima' : 'Accepted'}</span>`;
    if(status === 'Revision') return `<span class="status-badge badge-revision lang" data-id="Perlu Revisi" data-en="Revision Required">${currentLang === 'id' ? 'Perlu Revisi' : 'Revision Required'}</span>`;
    if(status === 'Resubmitted') return `<span class="status-badge badge-resubmitted lang" data-id="Direvisi Mhs" data-en="Resubmitted">${currentLang === 'id' ? 'Direvisi Mhs' : 'Resubmitted'}</span>`;
    return `<span class="status-badge badge-pending lang" data-id="Sedang Diverifikasi" data-en="Under Verification">${currentLang === 'id' ? 'Sedang Diverifikasi' : 'Under Verification'}</span>`;
}

// ==========================================
// 7. SISTEM PENERJEMAH BAHASA DYNAMIS
// ==========================================
let currentLang = 'id';

function toggleLanguage() {
    currentLang = currentLang === 'id' ? 'en' : 'id';
    const langBtn = document.getElementById('lang-btn');
    if(langBtn) { langBtn.innerText = currentLang === 'id' ? 'Switch to English' : 'Ganti ke Indonesia'; }
    applyDynamicLanguage();
    
    const nimInput = document.getElementById('input-nim');
    if(nimInput) { nimInput.placeholder = currentLang === 'id' ? 'Masukkan NIM / Student ID' : 'Enter NIM / Student ID'; }

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
// 8. LOAD TABEL MAHASISWA & CHAT TIMELINE
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
            if(item.status === 'Revision') hasRevision = true;
            
            let actionButtons = `<button class="btn-chat-log lang" onclick="openChatTimeline('${item.id}')" data-id="Lihat Riwayat Note" data-en="View Note History">${currentLang === 'id' ? 'Lihat Riwayat Note' : 'View Note History'}</button>`;
            if(item.status === 'Revision') {
                actionButtons += `<button class="action-btn btn-resend lang" onclick="openReplyModal('${item.id}')" style="width:100%; margin-top:8px;" data-id="Upload Perbaikan" data-en="Upload Correction">${currentLang === 'id' ? 'Upload Perbaikan' : 'Upload Correction'}</button>`;
            }

            tbody.innerHTML += `<tr>
                <td style="font-size:13px; vertical-align:top;">${formatDate(item.date)}</td>
                <td style="vertical-align:top;"><b>${item.jenis}</b></td>
                <td style="font-size:14px; vertical-align:top;">${item.detail}</td>
                <td style="text-align:center; vertical-align:top;">${getStatusBadge(item.status)}</td>
                <td style="min-width:160px; vertical-align:top;">${actionButtons}</td>
            </tr>`;
        });
    }
    
    const alertRev = document.getElementById('alert-revision-student');
    if(alertRev) alertRev.style.display = hasRevision ? 'block' : 'none';
    
    applyDynamicLanguage();
}

// ==========================================
// 8.5. LOAD TABEL ADMIN DENGAN PAGINATION & DEBOUNCE
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
    if(sortIcon) sortIcon.innerText = isAdminSortDesc ? '↓' : '↑';
    currentAdminPage = 1;
    filterAdminData();
}

function filterAdminData() {
    const tbody = document.getElementById('table-admin-reg');
    if(!tbody) return;

    const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
    const searchVal = (document.getElementById('admin-search-input')?.value || '').toLowerCase().trim();
    const filterVal = document.getElementById('admin-status-filter')?.value || 'ALL';

    adminFilteredData = records.filter(item => {
        const matchSearch = String(item.nama).toLowerCase().includes(searchVal) || String(item.nim).toLowerCase().includes(searchVal);
        const matchFilter = filterVal === 'ALL' || item.status === filterVal;
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
        if(formattedLink && formattedLink.includes('href="')) {
            const matchUrl = formattedLink.match(/href="([^"]+)"/);
            if(matchUrl && matchUrl[1]) { formattedLink += `<br><button class="btn-preview-doc" onclick="openDocPreview('${matchUrl[1]}')">Preview File</button>`; }
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
                    if (item.status === 'Accepted') return '-';
                    
                    let buttons = '';
                    
                    if (item.jenis === 'Outline') {
                        buttons += `<button class="action-btn lang" style="background: rgba(129, 145, 47, 0.15); color: var(--umy-green); border: 1px solid rgba(129, 145, 47, 0.3);" onclick="openDospemModal('${item.id}')" data-id="Tunjuk Dospem" data-en="Assign Dospem">Tunjuk Dospem</button>`;
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
    if(records.length === 0) { showToast("Belum ada data untuk diekspor.", "error"); return; }
    let csvContent = "data:text/csv;charset=utf-8,ID,Tanggal,NIM,Nama,Jenis,Status\n";
    records.forEach(r => { const cleanName = `"${r.nama.replace(/"/g, '""')}"`; csvContent += `${r.id},${r.date},${r.nim},${cleanName},${r.jenis},${r.status}\n`; });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_IPCOS_UMY_${Date.now()}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast("Data CSV berhasil diunduh!", "success");
}

function openDocPreview(url) {
    const iframe = document.getElementById('iframe-doc-viewer');
    const directBtn = document.getElementById('btn-download-direct');
    let previewUrl = url;
    if(url.includes('drive.google.com')) previewUrl = url.replace(/\/view.*$/, '/preview').replace(/\/edit.*$/, '/preview');
    iframe.src = previewUrl; directBtn.href = url;
    const modal = document.getElementById('modal-doc-preview');
    modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
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
        } catch(e) { 
            logs = [{ sender: 'Sistem', role: 'system', time: target.date, message: target.note }]; 
        }
    }

    if (target.jenis === 'Outline' && target.status === 'Accepted' && target.detail && target.detail.includes('Dosen Pembimbing')) {
        const hasDospemLog = logs.some(log => log.message.includes('Dosen Pembimbing'));
        
        if (!hasDospemLog) {
            const dospemMatch = target.detail.match(/Dosen Pembimbing:<\/b>\s*([^<]+)/);
            let dospemName = dospemMatch ? dospemMatch[1].trim() : "Telah ditentukan (silakan cek detail pengajuan)";

            logs.push({
                sender: 'Admin IPCOS',
                role: 'admin',
                time: target.date, 
                message: currentLang === 'id' 
                    ? `Selamat! Berkas Outline Anda telah <b>DITERIMA</b>.<br><br>Dosen Pembimbing Anda adalah:<br><b style='color:#E03F4F; font-size:15px;'>${dospemName}</b><br><br>Silakan segera menghubungi beliau untuk proses bimbingan selanjutnya.`
                    : `Congratulations! Your Outline is <b>ACCEPTED</b>.<br><br>Your Supervisor is:<br><b style='color:#E03F4F; font-size:15px;'>${dospemName}</b><br><br>Please contact them for further guidance.`
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
// 9. UPDATE DATA & REVISI PERBAIKAN
// ==========================================
async function sendUpdateRequest(id, newStatus, noteText, files = [], dospem = null) {
    showLoader(currentLang === 'id' ? 'Sedang Memproses...' : 'Processing...');
    try {
        const payload = { action: 'update', id: id, status: newStatus, note: noteText, senderName: currentUser.nama, senderRole: currentUser.role, files: files, dospem: dospem };
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await res.json();
        if(result.status === "success") syncDatabase(); else showToast("Gagal: " + (result.message || "Error tidak diketahui"), "error"); 
    } catch (err) { showToast(currentLang === 'id' ? "Terjadi kesalahan jaringan/upload." : "Network/upload error occurred.", "error"); } finally { hideLoader(); }
}

function acceptSubmission(id) {
    const msg = currentLang === 'id' ? "Apakah Anda yakin ingin memverifikasi/menyetujui berkas ini?" : "Are you sure you want to approve this file?";
    if(confirm(msg)) sendUpdateRequest(id, 'Accepted', currentLang === 'id' ? 'Berkas telah disetujui dan terverifikasi.' : 'File approved and verified.');
}

function openRevisionModal(id) {
    document.getElementById('hidden-rev-id').value = id; document.getElementById('input-rev-note').value = "";
    const modal = document.getElementById('modal-revision'); modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

function openDospemModal(id) {
    document.getElementById('hidden-dospem-id').value = id; 
    document.getElementById('input-dospem-select').value = "";
    const modal = document.getElementById('modal-dospem'); 
    modal.style.display = 'flex'; 
    setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

function submitAdminDospem() {
    const id = document.getElementById('hidden-dospem-id').value; 
    const dospem = document.getElementById('input-dospem-select').value;
    
    if(dospem === "") { 
        showToast(currentLang === 'id' ? "Pilih Dosen Pembimbing terlebih dahulu!" : "Please select a Supervisor!", "error"); 
        return; 
    }
    closeModal('modal-dospem'); 
    
    const note = currentLang === 'id' 
        ? "Selamat! Berkas Outline Anda telah <b>DITERIMA</b>.<br><br>Dosen Pembimbing Anda adalah:<br><b style='color:#E03F4F; font-size:15px;'>" + dospem + "</b><br><br>Silakan segera menghubungi beliau untuk proses bimbingan selanjutnya." 
        : "Congratulations! Your Outline is <b>ACCEPTED</b>.<br><br>Your Supervisor is:<br><b style='color:#E03F4F; font-size:15px;'>" + dospem + "</b><br><br>Please contact them for further guidance.";
    
    sendUpdateRequest(id, 'Accepted', note, [], dospem);
}

function submitAdminRevision() {
    const id = document.getElementById('hidden-rev-id').value; const note = document.getElementById('input-rev-note').value.trim();
    if(note === "") { showToast(currentLang === 'id' ? "Pesan revisi tidak boleh kosong!" : "Revision note cannot be empty!", "error"); return; }
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
    if(!note || !fileInput) { showToast(currentLang === 'id' ? "Catatan dan Berkas Revisi Baru wajib diisi!" : "Note and new revision file are required!", "error"); return; }
    try {
        const base64Data = await fileToBase64(fileInput); closeModal('modal-reply');
        const fileData = [{ fileName: fileInput.name, mimeType: fileInput.type, base64: base64Data }];
        sendUpdateRequest(id, 'Resubmitted', note, fileData);
    } catch(err) { showToast(err.message, "error"); }
}

function closeModal(modalId) { const modal = document.getElementById(modalId); modal.style.opacity = '0'; setTimeout(() => { modal.style.display = 'none'; }, 300); }
function toggleDarkMode() { 
    document.body.classList.toggle('dark-mode'); 
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('ipcos_theme', isDark ? 'dark' : 'light');
}
function toggleSidebar() { document.getElementById('main-sidebar').classList.toggle('active'); }

function switchTab(event, tabId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    event.currentTarget.classList.add('active'); const target = document.getElementById(tabId);
    target.classList.remove('active'); void target.offsetWidth; target.classList.add('active');
    document.getElementById('main-sidebar').classList.remove('active');
}

const catEl = document.getElementById('easter-cat'); let catTimer;
function scheduleCat() { catTimer = setTimeout(showCat, Math.floor(Math.random() * 10000) + 5000); }
function showCat() { catEl.classList.add('peek'); setTimeout(() => { if(catEl.classList.contains('peek')) hideCat(); }, 4000); }
function hideCat() { catEl.classList.remove('peek'); clearTimeout(catTimer); scheduleCat(); }

function silentSyncDatabase() {
    if (document.hidden) return;

    if (currentUser && currentUser.nim !== '') {
        const freshUrl = GAS_URL + "?t=" + new Date().getTime();
        fetch(freshUrl).then(response => response.json()).then(data => {
            const oldDataStr = localStorage.getItem('ipcos_registrations');
            const newDataStr = JSON.stringify(data.registrations || []);
            
            if (oldDataStr !== newDataStr) {
                localStorage.setItem('ipcos_registrations', newDataStr);
                if(currentUser.role === 'admin') { loadAdminData(); renderDashboardCharts(data.registrations || []); } else { loadStudentStatus(); }
            }
        }).catch(error => console.log("Sync terhambat..."));
    }
}
setInterval(silentSyncDatabase, 180000);

// ==========================================
// 10. SIDEBAR INTERAKTIF & WHATSAPP FLOAT
// ==========================================
function toggleDesktopSidebar() { document.getElementById('main-sidebar').classList.toggle('collapsed'); document.querySelector('.main-content').classList.toggle('expanded'); }
let waScrollTimer;
window.addEventListener('scroll', () => {
    const waBtn = document.getElementById('wa-float-btn');
    if (waBtn) { waBtn.classList.add('wa-hidden'); clearTimeout(waScrollTimer); waScrollTimer = setTimeout(() => { waBtn.classList.remove('wa-hidden'); }, 800); }
}, { passive: true });

// ==========================================
// 11. DASHBOARD CHART ANALYTICS & STATS (BENTO ADMIN)
// ==========================================
let ratioChartInstance = null; let typeChartInstance = null;

function renderDashboardCharts(records) {
    if (currentUser.role !== 'admin') return;

    const pendingCount = records.filter(r => r.status === 'Pending').length;
    const acceptedCount = records.filter(r => r.status === 'Accepted').length;
    const revisionCount = records.filter(r => r.status === 'Revision').length;
    const resubmittedCount = records.filter(r => r.status === 'Resubmitted').length;

    const elPending = document.getElementById('stat-count-pending');
    const elResubmitted = document.getElementById('stat-count-resubmitted');
    const elRevision = document.getElementById('stat-count-revision');
    const elAccepted = document.getElementById('stat-count-accepted');

    if(elPending) elPending.innerText = pendingCount;
    if(elResubmitted) elResubmitted.innerText = resubmittedCount;
    if(elRevision) elRevision.innerText = revisionCount;
    if(elAccepted) elAccepted.innerText = acceptedCount;

    const outlineCount = records.filter(r => r.jenis === 'Outline').length;
    const proposalCount = records.filter(r => r.jenis === 'Proposal').length;
    const pendadaranCount = records.filter(r => r.jenis === 'Pendadaran').length;
    const jurnalCount = records.filter(r => r.jenis === 'Skripsi Jurnal').length;
    const gantiDosenCount = records.filter(r => r.jenis === 'Pergantian Pembimbing').length;

    const ctxRatio = document.getElementById('ratioChart');
    const ctxType = document.getElementById('typeChart');
    if(!ctxRatio || !ctxType) return;

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
    if(!msg) { showToast("Pesan pengumuman tidak boleh kosong!", "error"); return; }
    
    const masterInput = document.getElementById('input-broadcast');
    if(masterInput) masterInput.value = msg;
    postAnnouncement().then(() => { if(input) input.value = ''; });
}

// ==========================================
// 12. CRUD MASTER MAHASISWA & BROADCAST
// ==========================================
function renderMasterMahasiswa(students) {
    const tbody = document.getElementById('table-master-mhs');
    if(!tbody) return; tbody.innerHTML = '';
    students.reverse().forEach(s => {
        const statusMhs = s.Status || s.status || "Aktif"; let badgeClass = "badge-accepted"; 
        if (statusMhs.toLowerCase() === "tidak aktif") badgeClass = "badge-revision"; else if (statusMhs.toLowerCase() === "lulus") badgeClass = "badge-resubmitted"; 
        tbody.innerHTML += `<tr><td><b>${s.NIM}</b></td><td>${s.Nama}</td><td><span class="status-badge ${badgeClass}">${statusMhs}</span></td><td><button class="action-btn btn-rev" onclick="deleteStudent('${s.NIM}')">Hapus</button></td></tr>`;
    });
}

async function addStudent() {
    const nim = document.getElementById('add-nim').value.trim(); const nama = document.getElementById('add-nama').value.trim();
    if(!nim || !nama) { showToast("NIM dan Nama wajib diisi!", "error"); return; }
    showLoader();
    try { await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'manage_student', method: 'add', nim: nim, nama: nama }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); showToast("Mahasiswa berhasil ditambahkan!", "success"); document.getElementById('add-nim').value = ''; document.getElementById('add-nama').value = ''; syncDatabase(); } catch (e) { showToast("Gagal menambah data", "error"); } finally { hideLoader(); }
}

async function deleteStudent(nim) {
    if(!confirm(`Apakah Anda yakin ingin menghapus akses untuk NIM: ${nim}?`)) return;
    showLoader();
    try { await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'manage_student', method: 'delete', nim: nim }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); showToast("Akses Mahasiswa berhasil dihapus!", "success"); syncDatabase(); } catch (e) { showToast("Gagal menghapus data", "error"); } finally { hideLoader(); }
}

async function postAnnouncement() {
    const masterInput = document.getElementById('input-broadcast');
    const checkImportant = document.getElementById('check-important-broadcast');
    const msg = masterInput ? masterInput.value.trim() : '';
    
    if(!msg) { showToast("Pesan pengumuman tidak boleh kosong!", "error"); return; }
    
    const annType = checkImportant && checkImportant.checked ? 'important' : 'info';
    
    showLoader();
    try { 
        await fetch(GAS_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'post_announcement', message: msg, type: annType }), 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
        }); 
        
        showToast("Pengumuman berhasil disebarkan!", "success"); 
        
        if(masterInput) masterInput.value = ''; 
        if(checkImportant) checkImportant.checked = false;
        
        syncDatabase(); 
    } catch (e) { 
        showToast("Gagal mengirim pengumuman", "error"); 
    } finally { 
        hideLoader(); 
    }
}