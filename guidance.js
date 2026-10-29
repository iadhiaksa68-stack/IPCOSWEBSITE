/* Student guidance: service availability cards, request progress tracker and a first-login guide. */
(() => {
    'use strict';
    const t = (id, en) => uxText(id, en), el = id => document.getElementById(id);
    const state = item => String(item?.status || '').trim().toLowerCase();
    const logs = item => { try { const value = JSON.parse(item.note || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
    const student = () => currentUser.role === 'mhs' && !!getSessionToken();

    /* ---------- 1. Service cards: availability before choosing ---------- */
    function renderServiceCards() {
        const select = el('reg-jenis-utama');
        if (!select) return;
        let box = el('service-cards');
        if (!student()) { if (box) box.hidden = true; return; }
        if (!box) {
            box = document.createElement('div'); box.id = 'service-cards'; box.className = 'service-cards';
            box.setAttribute('role', 'group'); box.setAttribute('aria-label', t('Status layanan', 'Service status'));
            const label = document.querySelector('label[for="reg-jenis-utama"]');
            (label || select).before(box);
        }
        box.hidden = false;
        box.innerHTML = [...select.options].filter(option => option.value).map(option => {
            const type = option.value, active = activeSameType(type), reason = serviceAvailability(type);
            const kind = active ? 'active' : reason ? 'blocked' : 'open';
            const note = active ? t('Sedang berjalan · lanjutkan pengajuan ini', 'In progress · continue this request') : reason || t('Tersedia', 'Available');
            return `<button type="button" class="service-card ${kind}" data-service-card="${escapeHtml(type)}" data-preserve-case aria-pressed="${select.value === type}"><strong>${escapeHtml(option.textContent.trim())}</strong><span>${escapeHtml(note)}</span></button>`;
        }).join('');
    }
    document.addEventListener('click', event => {
        const card = event.target.closest('[data-service-card]');
        if (!card || !student()) return;
        const select = el('reg-jenis-utama');
        if (select.value !== card.dataset.serviceCard) { select.value = card.dataset.serviceCard; select.dispatchEvent(new Event('change', {bubbles:true})); }
        renderServiceCards();
    });
    const originalRefresh = window.refreshServiceAvailability;
    if (typeof originalRefresh === 'function') window.refreshServiceAvailability = function () { const result = originalRefresh.apply(this, arguments); try { renderServiceCards(); } catch (_) {} return result; };

    /* ---------- 2. Progress tracker ---------- */
    function caseTimeline(item) {
        const steps = [{label:t('Dikirim', 'Submitted'), time:item.date, done:true}];
        let accepted = '';
        for (const log of logs(item)) {
            if (log.status === 'Revision') steps.push({label:t('Revisi diminta', 'Corrections requested'), time:log.time, done:true, tone:'revision'});
            else if (log.status === 'Resubmitted') steps.push({label:t('Perbaikan dikirim', 'Corrections sent'), time:log.time, done:true});
            else if (log.status === 'Accepted') accepted = log.time;
        }
        const status = state(item);
        if (['pending', 'resubmitted'].includes(status)) steps.push({label:t('Diperiksa admin', 'Admin review'), current:true});
        if (status === 'revision') steps.push({label:currentUser.role === 'admin' ? t('Perbaikan mahasiswa', 'Student corrections') : t('Perbaikan Anda', 'Your corrections'), current:true, tone:'revision'});
        steps.push({label:t('Disetujui', 'Approved'), time:accepted, done:status === 'accepted'});
        return steps;
    }
    function trackerHtml(item, compact = false) {
        const steps = caseTimeline(item);
        const when = time => { const date = displayDate(time); return Number.isFinite(date.getTime()) ? formatDate(time) : ''; };
        const summary = steps.map(step => step.label + (step.time && step.done ? ' ' + when(step.time) : step.current ? ' (' + t('sekarang', 'now') + ')' : '')).join(' → ');
        if (compact) return `<ol class="case-tracker compact" aria-label="${escapeHtml(t('Tahapan: ', 'Progress: ') + summary)}">${steps.map(step => `<li class="${step.done ? 'done' : step.current ? 'current' : ''}${step.tone ? ' ' + step.tone : ''}" title="${escapeHtml(step.label)}"></li>`).join('')}</ol>`;
        return `<ol class="case-tracker" aria-label="${escapeHtml(t('Tahapan pengajuan', 'Request progress'))}">${steps.map(step => `<li class="${step.done ? 'done' : step.current ? 'current' : ''}${step.tone ? ' ' + step.tone : ''}"><span>${escapeHtml(step.label)}</span><small>${step.time && step.done ? escapeHtml(when(step.time)) : step.current ? t('Sekarang', 'Now') : ''}</small></li>`).join('')}</ol>`;
    }
    window.caseTrackerHtml = trackerHtml;

    /* ---------- 9. First-login guide ---------- */
    const guideKey = () => 'ipcos_guide_done_' + String(currentUser.nim || '').trim();
    function guideDone() { try { return localStorage.getItem(guideKey()) === '1'; } catch (_) { return true; } }
    function renderGuide() {
        const home = el('task-home');
        el('student-first-guide')?.remove();
        // Only for students who have not submitted anything yet; existing users are not interrupted.
        if (!student() || !home || guideDone() || readStoredJSON(sessionStorage, 'ipcos_registrations', []).some(isStudentOwner)) return;
        const steps = [['academic-journey', t('Siapkan persyaratan', 'Prepare the requirements'), t('Centang checklist magang atau skripsi agar tahu apa yang kurang.', 'Tick the internship or thesis checklist to see what is missing.')],
            ['pendaftaran', t('Kirim pengajuan', 'Submit a request'), t('Pilih layanan yang tersedia, isi data, unggah berkas.', 'Choose an available service, fill in the details, upload files.')],
            ['student-status', t('Pantau status', 'Track the status'), t('Lihat tahapan, perkiraan waktu, dan instruksi perbaikan dari admin.', 'See the progress, expected time and correction instructions from admin.')]];
        const card = document.createElement('section'); card.id = 'student-first-guide'; card.className = 'student-first-guide'; card.dataset.preserveCase = '';
        card.setAttribute('aria-labelledby', 'student-first-guide-title');
        card.innerHTML = `<div class="student-first-guide-head"><h2 id="student-first-guide-title">${t('Mulai di IPCOS dalam 3 langkah', 'Get started with IPCOS in 3 steps')}</h2><button type="button" class="btn-secondary" data-guide-done>${t('Mengerti', 'Got it')}</button></div><ol>${steps.map(([tab, title, body], index) => `<li><span class="guide-step">${index + 1}</span><div><strong>${title}</strong><p>${body}</p><button type="button" class="task-history" data-guide-tab="${tab}">${t('Buka', 'Open')} →</button></div></li>`).join('')}</ol>`;
        home.prepend(card);
    }
    document.addEventListener('click', event => {
        if (!student()) return;
        if (event.target.closest('[data-guide-done]')) { try { localStorage.setItem(guideKey(), '1'); } catch (_) {} el('student-first-guide')?.remove(); el('task-home')?.querySelector('h2,button')?.focus?.(); }
        const tab = event.target.closest('[data-guide-tab]');
        if (tab) switchTab(null, tab.dataset.guideTab);
    });

    /* ---------- Anonymous wizard funnel ---------- */
    // One report per service and step per session; failures are ignored so they never disturb the student.
    const reported = new Set();
    function funnelStep(service, step) {
        if (!student() || !SERVICE_TYPES.includes(service) || !['service', 'data', 'files', 'review', 'sent'].includes(step)) return;
        const key = sessionEpoch + '|' + service + '|' + step;
        if (reported.has(key)) return;
        reported.add(key);
        apiPost(GAS_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'report_funnel', service, step})}).then(response => response.json()).catch(() => {});
    }
    window.IPCOSFunnel = Object.freeze({step:funnelStep});

    /* ---------- Install as an app ---------- */
    // Chrome/Edge/Android offer installation through beforeinstallprompt; iPhone users get a short instruction instead.
    let installPrompt = null;
    const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
    const installDismissed = () => { try { return localStorage.getItem('ipcos_install_dismissed') === '1'; } catch (_) { return false; } };
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; renderInstall(); });
    window.addEventListener('appinstalled', () => { installPrompt = null; renderInstall(); });
    function renderInstall() {
        const actions = document.querySelector('#student-header .student-info-actions');
        let menuButton = el('install-app-button');
        const available = !installed() && (installPrompt || ios());
        if (actions && available && !menuButton) {
            menuButton = document.createElement('button'); menuButton.type = 'button'; menuButton.id = 'install-app-button'; menuButton.className = 'btn-secondary'; menuButton.dataset.installApp = '';
            actions.prepend(menuButton);
        }
        if (menuButton) { menuButton.hidden = !available; menuButton.textContent = t('Pasang Aplikasi', 'Install App'); }
        el('install-app-card')?.remove();
        const home = el('task-home');
        if (!student() || !home || !available || installDismissed() || !matchMedia('(max-width:850px)').matches) return;
        const card = document.createElement('section'); card.id = 'install-app-card'; card.className = 'install-app-card'; card.dataset.preserveCase = '';
        card.innerHTML = `<img src="/icons/icon-192.png?v=2" alt="" width="40" height="40"><div><strong>${t('Pasang IPCOS di HP', 'Install IPCOS on your phone')}</strong><p>${ios() && !installPrompt ? t('Ketuk Bagikan lalu “Tambah ke Layar Utama”.', 'Tap Share, then “Add to Home Screen”.') : t('Buka langsung dari layar utama seperti aplikasi.', 'Open it straight from your home screen like an app.')}</p></div>${installPrompt ? `<button type="button" class="btn-primary" data-install-app>${t('Pasang', 'Install')}</button>` : ''}<button type="button" class="install-app-dismiss" data-install-dismiss aria-label="${t('Tutup', 'Close')}">×</button>`;
        home.prepend(card);
    }
    document.addEventListener('click', async event => {
        if (event.target.closest('[data-install-dismiss]')) { try { localStorage.setItem('ipcos_install_dismissed', '1'); } catch (_) {} el('install-app-card')?.remove(); return; }
        if (!event.target.closest('[data-install-app]')) return;
        if (!installPrompt) { showToast(t('Di iPhone: ketuk Bagikan lalu “Tambah ke Layar Utama”.', 'On iPhone: tap Share, then “Add to Home Screen”.'), 'success'); return; }
        const prompt = installPrompt; installPrompt = null;
        prompt.prompt(); await prompt.userChoice.catch(() => null); renderInstall();
    });
    window.addEventListener('ipcos:logout', () => reported.clear());

    const originalHome = window.renderTaskHome;
    if (typeof originalHome === 'function') window.renderTaskHome = function () { const result = originalHome.apply(this, arguments); try { renderGuide(); renderServiceCards(); renderInstall(); } catch (_) {} return result; };
    window.IPCOSGuidance = Object.freeze({caseTimeline, trackerHtml, renderServiceCards, renderInstall});
})();
