// Link Web App Google Apps Script Terbaru (SUDAH DIUPDATE)
const GAS_URL = "https://script.google.com/macros/s/AKfycbxzpIl1qKKLKVB-O6Jsv08OiK_zEztbGOkEIXUze1zsxL8gdC3-oZfQ2bJ6QaW-hoEE8Q/exec";

// ==========================================
// 1. SISTEM NOTIFIKASI TOAST & LOADER
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

function showLoader() { document.getElementById('loader').style.display = 'flex'; }
function hideLoader() { document.getElementById('loader').style.display = 'none'; }

function formatDate(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (isNaN(d)) return dateString; 
    return d.toLocaleDateString(currentLang === 'id' ? 'id-ID' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ==========================================
// 2. SIMULASI LOGIN & SINKRONISASI DATABASE
// ==========================================
let DB_MAHASISWA = {}; 
let globalAnnouncements = [];
let currentUser = { nim: '', nama: '', role: '' };

window.onload = function() {
    startCountdownWidget();
    const session = sessionStorage.getItem('ipcos_session');
    
    // Selalu tarik data awal agar DB_MAHASISWA terisi dan login berfungsi
    if (session) {
        currentUser = JSON.parse(session);
        finalizeLogin(currentUser.nama, currentUser.nim, currentUser.role);
    } else {
        syncDatabase(); 
    }
};

function syncDatabase() {
    showLoader();
    const freshUrl = GAS_URL + "?t=" + new Date().getTime();
    fetch(freshUrl)
    .then(response => response.json())
    .then(data => {
        // 1. Simpan Data Pendaftaran
        localStorage.setItem('ipcos_registrations', JSON.stringify(data.registrations || []));
        
        // 2. Populate Data Mahasiswa dari Server
        DB_MAHASISWA = {};
        if (data.students) {
            data.students.forEach(m => {
                DB_MAHASISWA[String(m.NIM)] = m.Nama;
            });
            if (currentUser.role === 'admin') renderMasterMahasiswa(data.students);
        }

        // 3. Tampilkan Banner Pengumuman Terbaru
        if (data.announcements && data.announcements.length > 0) {
            const latest = data.announcements[data.announcements.length - 1];
            if (currentUser.role === 'mhs') {
                document.getElementById('announcement-text').innerText = latest.Pesan || latest.message;
                document.getElementById('announcement-banner').style.display = 'flex';
            }
        }

        // 4. Update Tampilan berdasarkan Role jika sudah login
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
    .finally(() => {
        hideLoader();
    });
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

function loginAdmin() {
    const userInput = document.getElementById('input-admin-user').value.trim();
    const passInput = document.getElementById('input-admin-pass').value.trim();
    const errorMsg = document.getElementById('error-msg-admin');

    if (userInput === "mincos" && passInput === "mbaksiti123") {
        const adminData = { nim: 'ADMINISTRATOR', nama: 'Administrator IPCOS', role: 'admin' };
        sessionStorage.setItem('ipcos_session', JSON.stringify(adminData));
        finalizeLogin(adminData.nama, adminData.nim, adminData.role);
        showToast(currentLang === 'id' ? "Berhasil login sebagai Admin." : "Logged in as Admin.");
    } else {
        errorMsg.innerText = currentLang === 'id' ? "Kredensial Admin salah!" : "Invalid Admin credentials!";
        errorMsg.style.display = 'block';
    }
}

function finalizeLogin(displayName, displayNim, role) {
    currentUser = { nim: displayNim, nama: displayName, role: role };
    const firstName = displayName.split(' ')[0];

    const greetings = ["Hello", "Hey", "Hai", "Halo", "Greetings", "Welcome"];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    document.getElementById('display-greeting').innerText = `${randomGreeting}, ${firstName}! 👋`;
    
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = role === 'admin' ? 'flex' : 'none');
    document.querySelectorAll('.student-only').forEach(el => el.style.display = role === 'mhs' ? 'flex' : 'none');
    
    if(role === 'admin') {
        const statusLabel = document.getElementById('label-status-user');
        if(statusLabel) {
            statusLabel.setAttribute('data-id', 'Akses Superuser');
            statusLabel.setAttribute('data-en', 'Superuser Access');
        }
        document.getElementById('header-subtext').innerText = "Role: Administrator";
        loadOnlineStudentsMock();
    } else {
        const statusLabel = document.getElementById('label-status-user');
        if(statusLabel) {
            statusLabel.setAttribute('data-id', 'Mahasiswa Aktif');
            statusLabel.setAttribute('data-en', 'Active Student');
        }
        document.getElementById('header-subtext').innerText = `NIM: ${displayNim}`;
        loadProgressData(); 
    }

    document.getElementById('student-header').style.display = 'flex';
    document.getElementById('welcome-modal').style.opacity = '0';
    
    setTimeout(() => {
        document.getElementById('welcome-modal').style.display = 'none';
        scheduleCat(); 
        syncDatabase(); 
        applyDynamicLanguage();
    }, 500);
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
        setTimeout(() => { modal.style.opacity = '1'; }, 10);
    }
}

// ==========================================
// 3. FUNGSI KONVERSI FILE KE BASE64
// ==========================================
const MAX_FILE_SIZE_MB = 3; 

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            const errNote = currentLang === 'id' 
                ? `Ukuran file "${file.name}" terlalu besar! Maksimal ${MAX_FILE_SIZE_MB}MB.`
                : `File "${file.name}" is too large! Maximum ${MAX_FILE_SIZE_MB}MB.`;
            reject(new Error(errNote));
            return;
        }
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

    if (jenisUjian === "") { formContainer.style.display = 'none'; return; }

    formContainer.style.display = 'block';

    if (jenisUjian === "Outline") {
        document.getElementById('req-outline-only').style.display = 'block';
    } else if (jenisUjian === "Proposal") {
        document.getElementById('req-sempro-only').style.display = 'block';
    } else if (jenisUjian === "Pendadaran") {
        document.getElementById('req-pendadaran').style.display = 'block';
    }
}

// SUBMIT PENDAFTARAN AWAL DENGAN UPLOAD FILE
async function submitForm(e) {
    e.preventDefault();

    const jenisUjian = document.getElementById('reg-jenis-utama').value;
    const reqId = Date.now().toString(36);
    const dateStr = new Date().toISOString();
    
    let filesToUpload = [];

    try {
        if (jenisUjian === "Outline") {
            const fTranskrip = document.getElementById('file-transkrip').files[0];
            const fProposal = document.getElementById('file-proposal').files[0];
            if(!fTranskrip || !fProposal) { 
                throw new Error(currentLang === 'id' ? "Mohon upload seluruh berkas (Transkrip & Proposal)!" : "Please upload all required files!"); 
            }

            filesToUpload.push({ label: 'Transkrip', fileName: fTranskrip.name, mimeType: fTranskrip.type, base64: await fileToBase64(fTranskrip) });
            filesToUpload.push({ label: 'Proposal', fileName: fProposal.name, mimeType: fProposal.type, base64: await fileToBase64(fProposal) });

        } else if (jenisUjian === "Proposal") {
            const fAcc = document.getElementById('file-acc-sempro').files[0];
            if(!fAcc) { 
                throw new Error(currentLang === 'id' ? "Mohon upload Bukti ACC Proposal!" : "Please upload Proposal Approval Proof!"); 
            }
            filesToUpload.push({ label: 'Bukti ACC', fileName: fAcc.name, mimeType: fAcc.type, base64: await fileToBase64(fAcc) });

        } else if (jenisUjian === "Pendadaran") {
            const fPendadaran = document.getElementById('file-folder-pendadaran').files[0];
            if(!fPendadaran) { 
                throw new Error(currentLang === 'id' ? "Mohon upload berkas pendadaran!" : "Please upload defense documents!"); 
            }
            filesToUpload.push({ label: 'Berkas Pendadaran', fileName: fPendadaran.name, mimeType: fPendadaran.type, base64: await fileToBase64(fPendadaran) });
        }

        showLoader();

        let payload = {
            action: 'create', id: reqId, date: dateStr, nim: currentUser.nim, nama: currentUser.nama,
            jenis: jenisUjian, detail: `<b>Judul:</b> ${document.getElementById('reg-judul').value}`,
            files: filesToUpload
        };

        const response = await fetch(GAS_URL, { 
            method: 'POST', 
            body: JSON.stringify(payload), 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
        });
        
        const result = await response.json();

        if (result.status === "success") {
            showToast(currentLang === 'id' ? "Pendaftaran & Berkas berhasil dikirim!" : "Registration & Files submitted successfully!", "success");
            document.getElementById('reg-jenis-utama').value = ""; 
            toggleExamForm(); 
            e.target.reset(); 
            syncDatabase(); 
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
// 4. PROGRESS BAR & STATUS BADGES DENGAN IKON
// ==========================================
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
        chkMagang.forEach(el => state[el.id] = el.checked); chkSkripsi.forEach(el => state[el.id] = el.checked);
        localStorage.setItem(`progress_${currentUser.nim}`, JSON.stringify(state));
        updateChecklistReminder(chkMagang.length - checkedMagang.length, chkSkripsi.length - checkedSkripsi.length);
    }
}

function updateChecklistReminder(unMagang, unSkripsi) {
    const reminderBox = document.getElementById('alert-checklist-reminder');
    const reminderText = document.getElementById('reminder-text-content');
    if(!reminderBox || !reminderText) return;

    if(unMagang === 0 && unSkripsi === 0) {
        reminderText.innerHTML = currentLang === 'id' 
            ? '🎉 <b>Luar biasa!</b> Seluruh kewajiban Magang dan Skripsi Anda telah selesai 100%.' 
            : '🎉 <b>Awesome!</b> All your Internship and Thesis tasks are 100% complete.';
    } else {
        reminderText.innerHTML = currentLang === 'id' 
            ? `⚠️ Masih ada <b>${unMagang}</b> tugas Magang & <b>${unSkripsi}</b> tahapan Skripsi yang belum dicentang.`
            : `⚠️ You still have <b>${unMagang}</b> Internship & <b>${unSkripsi}</b> Thesis tasks unchecked.`;
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
    if(status === 'Accepted') return `<span class="status-badge badge-accepted lang" data-id="🟢 Diterima" data-en="🟢 Accepted">${currentLang === 'id' ? '🟢 Diterima' : '🟢 Accepted'}</span>`;
    if(status === 'Revision') return `<span class="status-badge badge-revision lang" data-id="🔴 Perlu Revisi" data-en="🔴 Revision Required">${currentLang === 'id' ? '🔴 Perlu Revisi' : '🔴 Revision Required'}</span>`;
    if(status === 'Resubmitted') return `<span class="status-badge badge-resubmitted lang" data-id="🔵 Direvisi Mhs" data-en="🔵 Resubmitted">${currentLang === 'id' ? '🔵 Direvisi Mhs' : '🔵 Resubmitted'}</span>`;
    return `<span class="status-badge badge-pending lang" data-id="🟡 Sedang Diverifikasi" data-en="🟡 Under Verification">${currentLang === 'id' ? '🟡 Sedang Diverifikasi' : '🟡 Under Verification'}</span>`;
}

// ==========================================
// 5. SISTEM PENERJEMAH BAHASA DYNAMIS
// ==========================================
let currentLang = 'id';

function toggleLanguage() {
    currentLang = currentLang === 'id' ? 'en' : 'id';
    const langBtn = document.getElementById('lang-btn');
    if(langBtn) { 
        langBtn.innerText = currentLang === 'id' ? '🇬🇧 Switch to English' : '🇮🇩 Ganti ke Indonesia'; 
    }
    applyDynamicLanguage();
    
    const nimInput = document.getElementById('input-nim');
    if(nimInput) { 
        nimInput.placeholder = currentLang === 'id' ? 'Masukkan NIM / Student ID' : 'Enter NIM / Student ID'; 
    }

    if (currentUser.role === 'admin') { loadAdminData(); } else { loadStudentStatus(); }
    updateProgress();
}

function applyDynamicLanguage() {
    document.querySelectorAll('.lang').forEach(el => {
        const text = el.getAttribute(`data-${currentLang}`);
        if (text) { el.innerHTML = text; }
    });
}

// ==========================================
// 6. LOAD TABEL MAHASISWA & CHAT TIMELINE
// ==========================================
function loadStudentStatus() {
    const tbody = document.getElementById('table-my-status');
    const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
    const myRecords = records.filter(r => String(r.nim).trim() === String(currentUser.nim).trim());
    
    tbody.innerHTML = '';
    if (myRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;" class="lang" data-id="Anda belum mengajukan pendaftaran apapun." data-en="You have not submitted any registration.">${currentLang === 'id' ? 'Anda belum mengajukan pendaftaran apapun.' : 'You have not submitted any registration.'}</td></tr>`;
    } else {
        myRecords.reverse().forEach(item => {
            let actionButtons = `<button class="btn-chat-log lang" onclick="openChatTimeline('${item.id}')" data-id="💬 Lihat Riwayat Note" data-en="💬 View Note History">${currentLang === 'id' ? '💬 Lihat Riwayat Note' : '💬 View Note History'}</button>`;
            
            if(item.status === 'Revision') {
                actionButtons += `<br><button class="action-btn btn-resend lang" onclick="openReplyModal('${item.id}')" style="width:100%; margin-top:6px;" data-id="Upload Perbaikan" data-en="Upload Correction">${currentLang === 'id' ? 'Upload Perbaikan' : 'Upload Correction'}</button>`;
            }

            tbody.innerHTML += `<tr>
                <td style="font-size:13px; vertical-align:top;">${formatDate(item.date)}</td>
                <td style="vertical-align:top;"><b>${item.jenis}</b></td>
                <td style="font-size:14px; vertical-align:top;">${item.detail}</td>
                <td style="text-align:center; vertical-align:top;">${getStatusBadge(item.status)}</td>
                <td style="min-width:180px; vertical-align:top;">${actionButtons}</td>
            </tr>`;
        });
    }
    applyDynamicLanguage();
}

// LOAD TABEL ADMIN DENGAN SEARCH & FILTER
function loadAdminData() {
    filterAdminData();
}

function filterAdminData() {
    const tbody = document.getElementById('table-admin-reg');
    if(!tbody) return;

    const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
    const searchVal = (document.getElementById('admin-search-input')?.value || '').toLowerCase().trim();
    const filterVal = document.getElementById('admin-status-filter')?.value || 'ALL';

    const filtered = records.filter(item => {
        const matchSearch = String(item.nama).toLowerCase().includes(searchVal) || String(item.nim).toLowerCase().includes(searchVal);
        const matchFilter = filterVal === 'ALL' || item.status === filterVal;
        return matchSearch && matchFilter;
    });

    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;" class="lang" data-id="Tidak ada data yang sesuai." data-en="No matching data.">${currentLang === 'id' ? 'Tidak ada data yang sesuai.' : 'No matching data.'}</td></tr>`;
    } else {
        filtered.reverse().forEach(item => {
            let formattedLink = item.link;
            if(formattedLink && formattedLink.includes('href="')) {
                const matchUrl = formattedLink.match(/href="([^"]+)"/);
                if(matchUrl && matchUrl[1]) {
                    formattedLink += `<br><button class="btn-preview-doc" onclick="openDocPreview('${matchUrl[1]}')">👁 Preview File</button>`;
                }
            }

            tbody.innerHTML += `<tr>
                <td style="font-size:13px; vertical-align:top;">${formatDate(item.date)}</td>
                <td style="vertical-align:top;">${item.nim}<br><b>${item.nama}</b></td>
                <td style="vertical-align:top;"><b>${item.jenis}</b></td>
                <td style="vertical-align:top;">${formattedLink}</td>
                <td style="text-align:center; vertical-align:top;">
                    ${getStatusBadge(item.status)}<br>
                    <button class="btn-chat-log lang" onclick="openChatTimeline('${item.id}')" style="margin-top:6px;" data-id="💬 Chat Timeline" data-en="💬 Chat Timeline">💬 Chat Timeline</button>
                </td>
                <td style="min-width:130px; vertical-align:top;">
                    ${item.status !== 'Accepted' ? `<button class="action-btn btn-acc lang" onclick="acceptSubmission('${item.id}')" data-id="Terima" data-en="Accept">${currentLang === 'id' ? 'Terima' : 'Accept'}</button>` : ''}
                    ${item.status !== 'Accepted' ? `<button class="action-btn btn-rev lang" onclick="openRevisionModal('${item.id}')" data-id="Revisi" data-en="Revise">${currentLang === 'id' ? 'Revisi' : 'Revise'}</button>` : '-'}
                </td>
            </tr>`;
        });
    }
    applyDynamicLanguage();
}

// SIMULASI MAHASISWA ONLINE (DIFUNGSIKAN DENGAN AMAN)
function loadOnlineStudentsMock() {
    const container = document.getElementById('online-students-list');
    if(!container) return;
    container.innerHTML = '';
    const statuses = [
        { idMsg: 'Aktif saat ini', enMsg: 'Active now', color: 'dot-online' },
        { idMsg: 'Membuka tab skripsi', enMsg: 'Viewing thesis tab', color: 'dot-online' },
        { idMsg: 'Pergi sebentar (2 mnt)', enMsg: 'Away (2 mins)', color: 'dot-away' },
        { idMsg: 'Offline', enMsg: 'Offline', color: 'dot-offline' }
    ];
    
    let index = 0;
    for(let nim in DB_MAHASISWA) {
        const stat = statuses[index % statuses.length];
        const isOnline = stat.color !== 'dot-offline';
        const label = currentLang === 'id' ? stat.idMsg : stat.enMsg;
        container.innerHTML += `
            <div class="student-online-card">
                <div class="student-avatar">${DB_MAHASISWA[nim].charAt(0)}</div>
                <div style="flex-grow: 1;">
                    <strong style="font-size: 16px; color: ${isOnline ? 'var(--text-color)' : 'var(--text-muted)'};">${DB_MAHASISWA[nim]}</strong>
                    <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">NIM: ${nim}</div>
                </div>
                <div style="font-size: 13px; font-weight: bold; color: ${isOnline ? 'var(--text-color)' : 'var(--text-muted)'}; display: flex; align-items: center;">
                    <span class="student-status-dot ${stat.color}"></span>
                    <span class="lang" data-id="${stat.idMsg}" data-en="${stat.enMsg}">${label}</span>
                </div>
            </div>`;
        index++;
    }
}

// EKSPOR REKAP DATA ADMIN KE FILE CSV (EXCEL)
function exportAdminDataCSV() {
    const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
    if(records.length === 0) { showToast("Belum ada data untuk diekspor.", "error"); return; }

    let csvContent = "data:text/csv;charset=utf-8,ID,Tanggal,NIM,Nama,Jenis,Status\n";
    records.forEach(r => {
        const cleanName = `"${r.nama.replace(/"/g, '""')}"`;
        csvContent += `${r.id},${r.date},${r.nim},${cleanName},${r.jenis},${r.status}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_IPCOS_UMY_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Data CSV berhasil diunduh!", "success");
}

// FITUR MODAL DOCUMENT VIEWER
function openDocPreview(url) {
    const iframe = document.getElementById('iframe-doc-viewer');
    const directBtn = document.getElementById('btn-download-direct');
    
    let previewUrl = url;
    if(url.includes('drive.google.com')) {
        previewUrl = url.replace(/\/view.*$/, '/preview').replace(/\/edit.*$/, '/preview');
    }

    iframe.src = previewUrl;
    directBtn.href = url;

    const modal = document.getElementById('modal-doc-preview');
    modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

// COUNTDOWN TIMER YUDISIUM WIDGET
function startCountdownWidget() {
    const targetDate = new Date("July 20, 2026 23:59:59").getTime();
    
    setInterval(() => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        const timerDisplay = document.getElementById('countdown-timer-display');
        if(timerDisplay) {
            if (distance < 0) {
                timerDisplay.innerText = "YUDISIUM PERIODE I TELAH DITUTUP";
            } else {
                timerDisplay.innerText = `${days} Hari : ${hours} Jam : ${minutes} Mnt : ${seconds} Detik`;
            }
        }
    }, 1000);
}

// BUKA MODAL CHAT TIMELINE
function openChatTimeline(id) {
    const records = JSON.parse(localStorage.getItem('ipcos_registrations') || '[]');
    const target = records.find(r => r.id === id);
    const container = document.getElementById('chat-timeline-container');
    container.innerHTML = '';

    if (!target || !target.note) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-muted);" class="lang" data-id="Belum ada riwayat catatan." data-en="No note history yet.">${currentLang === 'id' ? 'Belum ada riwayat catatan.' : 'No note history yet.'}</p>`;
    } else {
        let logs = [];
        try {
            logs = JSON.parse(target.note);
        } catch(e) {
            logs = [{ sender: 'Catatan', role: 'system', time: target.date, message: target.note }];
        }

        logs.forEach(log => {
            const isMhs = log.role === 'mhs';
            container.innerHTML += `
                <div class="chat-bubble ${isMhs ? 'chat-mhs' : 'chat-admin'}">
                    <div class="chat-sender">
                        <span>${log.sender} (${log.role.toUpperCase()})</span>
                        <span style="opacity:0.7; font-weight:normal;">${formatDate(log.time)}</span>
                    </div>
                    <div>${log.message}</div>
                </div>`;
        });
    }

    const modal = document.getElementById('modal-chat-timeline');
    modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

// ==========================================
// 7. UPDATE DATA & REVISI PERBAIKAN
// ==========================================
async function sendUpdateRequest(id, newStatus, noteText, files = []) {
    showLoader();
    try {
        const payload = {
            action: 'update',
            id: id,
            status: newStatus,
            note: noteText,
            senderName: currentUser.nama,
            senderRole: currentUser.role,
            files: files
        };

        const res = await fetch(GAS_URL, { 
            method: 'POST', 
            body: JSON.stringify(payload), 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
        });
        const result = await res.json();
        
        if(result.status === "success") { 
            syncDatabase(); 
        } else { 
            // MEMBOCORKAN PESAN ERROR DARI BACKEND
            showToast("Gagal: " + (result.message || "Error tidak diketahui"), "error"); 
        }
    } catch (err) {
        showToast(currentLang === 'id' ? "Terjadi kesalahan jaringan/upload." : "Network/upload error occurred.", "error");
    } finally {
        hideLoader();
    }
}

function acceptSubmission(id) {
    const msg = currentLang === 'id' ? "Apakah Anda yakin ingin memverifikasi/menyetujui berkas ini?" : "Are you sure you want to approve this file?";
    if(confirm(msg)) {
        sendUpdateRequest(id, 'Accepted', currentLang === 'id' ? 'Berkas telah disetujui dan terverifikasi.' : 'File approved and verified.');
    }
}

function openRevisionModal(id) {
    document.getElementById('hidden-rev-id').value = id;
    document.getElementById('input-rev-note').value = "";
    const modal = document.getElementById('modal-revision');
    modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

function submitAdminRevision() {
    const id = document.getElementById('hidden-rev-id').value;
    const note = document.getElementById('input-rev-note').value.trim();
    if(note === "") { 
        showToast(currentLang === 'id' ? "Pesan revisi tidak boleh kosong!" : "Revision note cannot be empty!", "error"); 
        return; 
    }
    closeModal('modal-revision');
    sendUpdateRequest(id, 'Revision', note);
}

function openReplyModal(id) {
    document.getElementById('hidden-reply-id').value = id;
    document.getElementById('input-reply-note').value = "";
    document.getElementById('input-reply-file').value = "";
    const modal = document.getElementById('modal-reply');
    modal.style.display = 'flex'; setTimeout(() => { modal.style.opacity = '1'; }, 10);
}

async function submitStudentReply() {
    const id = document.getElementById('hidden-reply-id').value;
    const note = document.getElementById('input-reply-note').value.trim();
    const fileInput = document.getElementById('input-reply-file').files[0];

    if(!note || !fileInput) {
        showToast(currentLang === 'id' ? "Catatan dan Berkas Revisi Baru wajib diisi!" : "Note and new revision file are required!", "error");
        return;
    }

    try {
        const base64Data = await fileToBase64(fileInput);
        closeModal('modal-reply');

        const fileData = [{
            fileName: fileInput.name,
            mimeType: fileInput.type,
            base64: base64Data
        }];

        sendUpdateRequest(id, 'Resubmitted', note, fileData);
    } catch(err) {
        showToast(err.message, "error");
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.opacity = '0'; setTimeout(() => { modal.style.display = 'none'; }, 300);
}

function toggleDarkMode() { document.body.classList.toggle('dark-mode'); }
function toggleSidebar() { document.getElementById('main-sidebar').classList.toggle('active'); }

function switchTab(event, tabId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    event.currentTarget.classList.add('active');
    const target = document.getElementById(tabId);
    target.classList.remove('active'); void target.offsetWidth; target.classList.add('active');
    document.getElementById('main-sidebar').classList.remove('active');
}

const catEl = document.getElementById('easter-cat');
let catTimer;
function scheduleCat() { catTimer = setTimeout(showCat, Math.floor(Math.random() * 10000) + 5000); }
function showCat() { catEl.classList.add('peek'); setTimeout(() => { if(catEl.classList.contains('peek')) hideCat(); }, 4000); }
function hideCat() { catEl.classList.remove('peek'); clearTimeout(catTimer); scheduleCat(); }

// SINKRONISASI REAL-TIME SENYAP
function silentSyncDatabase() {
    if (currentUser && currentUser.nim !== '') {
        const freshUrl = GAS_URL + "?t=" + new Date().getTime();
        fetch(freshUrl)
        .then(response => response.json())
        .then(data => {
            localStorage.setItem('ipcos_registrations', JSON.stringify(data.registrations || []));
            if(currentUser.role === 'admin') { loadAdminData(); } else { loadStudentStatus(); }
        })
        .catch(error => console.log("Sync terhambat..."));
    }
}
setInterval(silentSyncDatabase, 15000); // Diperpanjang menjadi 15 detik agar tidak membebani server

// ==========================================
// 8. SIDEBAR INTERAKTIF & WHATSAPP FLOAT
// ==========================================

// Fungsi Toggle Sidebar Desktop
function toggleDesktopSidebar() {
    document.getElementById('main-sidebar').classList.toggle('collapsed');
    document.querySelector('.main-content').classList.toggle('expanded');
}

// Logika Hide & Popup Tombol WhatsApp saat Scroll
let waScrollTimer;
window.addEventListener('scroll', () => {
    const waBtn = document.getElementById('wa-float-btn');
    if (waBtn) {
        // Sembunyikan saat mulai scroll
        waBtn.classList.add('wa-hidden');
        
        // Clear timer sebelumnya
        clearTimeout(waScrollTimer);
        
        // Atur timer baru (Misal: 800ms idle)
        waScrollTimer = setTimeout(() => {
            waBtn.classList.remove('wa-hidden');
        }, 800);
    }
});

// ==========================================
// 9. DASHBOARD CHART ANALYTICS (ADMIN)
// ==========================================
let ratioChartInstance = null;
let typeChartInstance = null;

function renderDashboardCharts(records) {
    if (currentUser.role !== 'admin') return;

    const pendingCount = records.filter(r => r.status === 'Pending').length;
    const acceptedCount = records.filter(r => r.status === 'Accepted').length;
    const revisionCount = records.filter(r => r.status === 'Revision' || r.status === 'Resubmitted').length;

    const outlineCount = records.filter(r => r.jenis === 'Outline').length;
    const proposalCount = records.filter(r => r.jenis === 'Proposal').length;
    const pendadaranCount = records.filter(r => r.jenis === 'Pendadaran').length;

    const ctxRatio = document.getElementById('ratioChart');
    const ctxType = document.getElementById('typeChart');
    
    if(!ctxRatio || !ctxType) return;

    if (ratioChartInstance) ratioChartInstance.destroy();
    if (typeChartInstance) typeChartInstance.destroy();

    Chart.defaults.color = document.body.classList.contains('dark-mode') ? '#F5F5F7' : '#1D1D1F';

    ratioChartInstance = new Chart(ctxRatio.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Accepted', 'Revisi'],
            datasets: [{
                data: [pendingCount, acceptedCount, revisionCount],
                backgroundColor: ['#F4B324', '#00492C', '#8E2122'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    typeChartInstance = new Chart(ctxType.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Outline', 'Proposal', 'Pendadaran'],
            datasets: [{
                label: 'Jumlah Pengajuan',
                data: [outlineCount, proposalCount, pendadaranCount],
                backgroundColor: 'rgba(142, 33, 34, 0.8)',
                borderRadius: 8
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } }
    });
}

// ==========================================
// 10. CRUD MASTER MAHASISWA & BROADCAST
// ==========================================
function renderMasterMahasiswa(students) {
    const tbody = document.getElementById('table-master-mhs');
    if(!tbody) return;
    tbody.innerHTML = '';
    students.reverse().forEach(s => {
        // Tarik data Status dari Spreadsheet (huruf besar/kecil menyesuaikan)
        const statusMhs = s.Status || s.status || "Aktif";
        
        // Atur warna badge dinamis
        let badgeClass = "badge-accepted"; // Hijau (Aktif)
        if (statusMhs.toLowerCase() === "tidak aktif") badgeClass = "badge-revision"; // Merah
        else if (statusMhs.toLowerCase() === "lulus") badgeClass = "badge-resubmitted"; // Biru
        
        tbody.innerHTML += `<tr>
            <td><b>${s.NIM}</b></td>
            <td>${s.Nama}</td>
            <td><span class="status-badge ${badgeClass}">${statusMhs}</span></td>
            <td><button class="action-btn btn-rev" onclick="deleteStudent('${s.NIM}')">Hapus</button></td>
        </tr>`;
    });
}

async function addStudent() {
    const nim = document.getElementById('add-nim').value.trim();
    const nama = document.getElementById('add-nama').value.trim();
    if(!nim || !nama) { showToast("NIM dan Nama wajib diisi!", "error"); return; }
    
    showLoader();
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'manage_student', method: 'add', nim: nim, nama: nama }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        showToast("Mahasiswa berhasil ditambahkan!", "success");
        document.getElementById('add-nim').value = ''; document.getElementById('add-nama').value = '';
        syncDatabase(); 
    } catch (e) { showToast("Gagal menambah data", "error"); } finally { hideLoader(); }
}

async function deleteStudent(nim) {
    if(!confirm(`Apakah Anda yakin ingin menghapus akses untuk NIM: ${nim}?`)) return;
    showLoader();
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'manage_student', method: 'delete', nim: nim }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        showToast("Akses Mahasiswa berhasil dihapus!", "success");
        syncDatabase();
    } catch (e) { showToast("Gagal menghapus data", "error"); } finally { hideLoader(); }
}

async function postAnnouncement() {
    const msg = document.getElementById('input-broadcast').value.trim();
    if(!msg) { showToast("Pesan pengumuman tidak boleh kosong!", "error"); return; }
    
    showLoader();
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'post_announcement', message: msg, type: 'info' }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        showToast("Pengumuman berhasil disebarkan!", "success");
        document.getElementById('input-broadcast').value = '';
        syncDatabase();
    } catch (e) { showToast("Gagal mengirim pengumuman", "error"); } finally { hideLoader(); }
}