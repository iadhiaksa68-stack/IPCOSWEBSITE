/* Admin speed-ups: review keyboard shortcuts and saved queue views. */
(() => {
    'use strict';
    const t = (id, en) => uxText(id, en), el = id => document.getElementById(id);
    const admin = () => currentUser.role === 'admin' && !!getSessionToken();

    /* ---------- Keyboard shortcuts in the review workspace ---------- */
    const reviewOpen = () => el('modal-case-detail')?.style.display === 'flex';
    // Only text entry blocks shortcuts; a focused checkbox or button in the review rail does not.
    const typing = node => !!node?.closest?.('textarea,select,[contenteditable="true"]') || (node?.tagName === 'INPUT' && !['checkbox','radio','button','submit','reset','file','range','color'].includes(node.type));
    const actionButton = kind => [...document.querySelectorAll('#case-detail-actions button')].find(button => {
        const handler = button.getAttribute('onclick') || '';
        return kind === 'approve' ? /caseDetailAction\('(accept|dospem)'\)/.test(handler) : handler.includes(`caseDetailAction('revision')`);
    });
    function pressIfReady(button) { if (button && !button.disabled && button.getClientRects().length) { button.click(); return true; } return false; }
    function toggleHelp() {
        let help = el('review-shortcut-help');
        if (help) { help.remove(); return; }
        help = document.createElement('div'); help.id = 'review-shortcut-help'; help.className = 'review-shortcut-help'; help.setAttribute('role', 'note');
        help.innerHTML = `<strong>${t('Pintasan keyboard', 'Keyboard shortcuts')}</strong><dl><dt>J</dt><dd>${t('Pengajuan berikutnya', 'Next request')}</dd><dt>K</dt><dd>${t('Pengajuan sebelumnya', 'Previous request')}</dd><dt>A</dt><dd>${t('Setujui', 'Approve')}</dd><dt>R</dt><dd>${t('Minta revisi', 'Request corrections')}</dd><dt>?</dt><dd>${t('Tampilkan/sembunyikan bantuan ini', 'Show/hide this help')}</dd></dl>`;
        el('modal-case-detail').querySelector('.modal-card, #case-detail-content')?.prepend(help);
    }
    document.addEventListener('keydown', event => {
        if (!admin() || !reviewOpen() || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
        if (!el('case-action-panel')?.hidden || document.querySelector('dialog[open]')) return;
        const key = event.key.toLowerCase();
        let handled = false;
        if (key === 'j') handled = pressIfReady(el('case-review-next'));
        else if (key === 'k') handled = pressIfReady(el('case-review-prev'));
        else if (key === 'a') handled = pressIfReady(actionButton('approve'));
        else if (key === 'r') handled = pressIfReady(actionButton('revision'));
        else if (event.key === '?') { toggleHelp(); handled = true; }
        if (handled) event.preventDefault();
    });

    /* ---------- Saved queue views ---------- */
    const STORE = 'ipcos_admin_views';
    const builtIn = () => [
        {id:'overdue', name:t('Lewat target', 'Past target'), view:{status:'ACTION_REQUIRED', overdue:true, order:'overdue'}},
        {id:'resubmitted', name:t('Perbaikan masuk', 'Corrections received'), view:{status:'Resubmitted', order:'oldest'}},
        {id:'oldest', name:t('Terlama dulu', 'Oldest first'), view:{status:'ACTION_REQUIRED', order:'oldest'}},
        {id:'waiting-student', name:t('Menunggu mahasiswa', 'Awaiting students'), view:{status:'Revision', order:'oldest'}}
    ];
    const saved = () => { try { const list = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(list) ? list.filter(item => item && typeof item.name === 'string' && item.view) : []; } catch (_) { return []; } };
    const store = list => { try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, 8))); return true; } catch (_) { return false; } };
    function currentView() {
        return {search:el('admin-search-input').value.trim(), status:el('admin-status-filter').value, type:el('admin-type-filter').value, overdue:el('admin-overdue-filter').checked,
            order:el('admin-queue-order').value, from:el('admin-date-from').value, to:el('admin-date-to').value};
    }
    function applyView(view) {
        const set = (id, value) => { const node = el(id); if (node.tagName === 'SELECT' && ![...node.options].some(option => option.value === value)) return; node.value = value; };
        set('admin-search-input', view.search || ''); set('admin-status-filter', view.status || 'ACTION_REQUIRED'); set('admin-type-filter', view.type || '');
        el('admin-overdue-filter').checked = view.overdue === true; set('admin-queue-order', view.order || 'activity');
        set('admin-date-from', view.from || ''); set('admin-date-to', view.to || '');
        currentAdminPage = 1; filterAdminData();
    }
    let naming = false;
    function renderViews(message = '') {
        if (!admin()) return;
        let bar = el('queue-saved-views');
        if (!bar) {
            const controls = document.querySelector('#admin-data .admin-table-controls'); if (!controls) return;
            bar = document.createElement('div'); bar.id = 'queue-saved-views'; bar.className = 'queue-saved-views';
            bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', t('Tampilan antrean tersimpan', 'Saved queue views'));
            controls.after(bar);
        }
        const custom = saved();
        bar.innerHTML = `<span class="queue-saved-label">${t('Tampilan:', 'Views:')}</span>`
            + builtIn().map(item => `<button type="button" class="queue-view-chip" data-queue-view="${item.id}">${escapeHtml(item.name)}</button>`).join('')
            + custom.map((item, index) => `<span class="queue-view-custom"><button type="button" class="queue-view-chip custom" data-queue-custom="${index}">${escapeHtml(item.name)}</button><button type="button" class="queue-view-remove" data-queue-remove="${index}" aria-label="${escapeHtml(t('Hapus tampilan ', 'Remove view ') + item.name)}">×</button></span>`).join('')
            + (naming ? `<input id="queue-view-name" type="text" maxlength="40" placeholder="${escapeHtml(t('Nama tampilan', 'View name'))}" aria-label="${escapeHtml(t('Nama tampilan', 'View name'))}"><button type="button" class="queue-view-chip" data-queue-save>${t('Simpan', 'Save')}</button><button type="button" class="queue-view-chip" data-queue-cancel>${t('Batal', 'Cancel')}</button>`
                : `<button type="button" class="queue-view-chip add" data-queue-new ${custom.length >= 8 ? 'disabled' : ''}>+ ${t('Simpan tampilan ini', 'Save this view')}</button>`)
            + `<span class="queue-view-message" role="status">${escapeHtml(message)}</span><span class="queue-shortcut-hint">${t('Di layar pemeriksaan: J/K pindah, A setujui, R revisi, ? bantuan', 'In review: J/K move, A approve, R corrections, ? help')}</span>`;
    }
    document.addEventListener('click', event => {
        if (!admin()) return;
        const builtInButton = event.target.closest('[data-queue-view]');
        if (builtInButton) { const item = builtIn().find(view => view.id === builtInButton.dataset.queueView); if (item) applyView(item.view); return; }
        const custom = event.target.closest('[data-queue-custom]');
        if (custom) { const item = saved()[Number(custom.dataset.queueCustom)]; if (item) applyView(item.view); return; }
        const remove = event.target.closest('[data-queue-remove]');
        if (remove) { const list = saved(); list.splice(Number(remove.dataset.queueRemove), 1); store(list); renderViews(); return; }
        if (event.target.closest('[data-queue-new]')) { naming = true; renderViews(); el('queue-view-name')?.focus(); return; }
        if (event.target.closest('[data-queue-cancel]')) { naming = false; renderViews(); return; }
        if (event.target.closest('[data-queue-save]')) saveCurrent();
    });
    document.addEventListener('keydown', event => { if (event.target.id === 'queue-view-name' && event.key === 'Enter') { event.preventDefault(); saveCurrent(); } });
    function saveCurrent() {
        const name = (el('queue-view-name')?.value || '').trim();
        if (!name) { el('queue-view-name')?.focus(); return; }
        const list = saved().filter(item => item.name !== name); list.push({name, view:currentView()});
        naming = false;
        renderViews(store(list) ? t('Tampilan disimpan di perangkat ini.', 'View saved on this device.') : t('Penyimpanan perangkat tidak tersedia.', 'Device storage is unavailable.'));
    }
    const originalFilter = window.filterAdminData;
    if (typeof originalFilter === 'function') window.filterAdminData = function () { const result = originalFilter.apply(this, arguments); try { if (!el('queue-saved-views')) renderViews(); } catch (_) {} return result; };
    window.addEventListener('ipcos:logout', () => { naming = false; el('queue-saved-views')?.remove(); el('review-shortcut-help')?.remove(); });
    /* ---------- Admin password change (Master Data) ---------- */
    let passwordSaving = false;
    // Master Data is only reachable by admins, so the card is placed once at load like the template editor.
    function renderPasswordCard() {
        let card = el('admin-password-card');
        const services = el('master-services-section');
        if (!card) {
            if (!services) return;
            card = document.createElement('details'); card.id = 'admin-password-card'; card.className = 'card revision-template-card';
            card.innerHTML = `<summary>${t('Keamanan login admin', 'Admin login security')}</summary><p>${t('Ganti username dan password admin. Password disimpan dalam bentuk hash, tidak terbaca di kode atau sheet.', 'Change the admin username and password. The password is stored as a hash and cannot be read from the code or sheet.')}</p>
                <form id="admin-password-form" class="admin-password-form" novalidate autocomplete="off">
                <label for="admin-pw-user">${t('Username saat ini', 'Current username')}</label><input id="admin-pw-user" autocomplete="username" required>
                <label for="admin-pw-current">${t('Password saat ini', 'Current password')}</label><input id="admin-pw-current" type="password" autocomplete="current-password" required>
                <label for="admin-pw-newuser">${t('Username baru (opsional)', 'New username (optional)')}</label><input id="admin-pw-newuser" autocomplete="off">
                <label for="admin-pw-new">${t('Password baru · minimal 10 karakter', 'New password · at least 10 characters')}</label><input id="admin-pw-new" type="password" autocomplete="new-password" minlength="10" required>
                <label for="admin-pw-repeat">${t('Ulangi password baru', 'Repeat new password')}</label><input id="admin-pw-repeat" type="password" autocomplete="new-password" required>
                <button type="submit" class="btn-primary" id="admin-pw-submit">${t('Simpan Password Baru', 'Save New Password')}</button><p id="admin-pw-feedback" class="field-helper" role="status"></p></form>`;
            services.append(card);
        }
    }
    document.addEventListener('submit', async event => {
        if (event.target.id !== 'admin-password-form' || !admin()) return;
        event.preventDefault();
        if (passwordSaving) return;
        const feedback = el('admin-pw-feedback'), value = id => el(id).value.trim();
        const fail = (message, id) => { feedback.textContent = message; feedback.dataset.state = 'error'; if (id) el(id).focus(); };
        if (!value('admin-pw-user') || !value('admin-pw-current')) return fail(t('Isi username dan password saat ini.', 'Enter the current username and password.'), !value('admin-pw-user') ? 'admin-pw-user' : 'admin-pw-current');
        if (value('admin-pw-new').length < 10) return fail(t('Password baru minimal 10 karakter.', 'The new password needs at least 10 characters.'), 'admin-pw-new');
        if (value('admin-pw-new') !== value('admin-pw-repeat')) return fail(t('Ulangan password baru tidak sama.', 'The repeated password does not match.'), 'admin-pw-repeat');
        const epoch = sessionEpoch; passwordSaving = true; el('admin-pw-submit').disabled = true; feedback.dataset.state = 'busy'; feedback.textContent = t('Menyimpan…', 'Saving…');
        try {
            const result = await readApiResult(await apiPost(GAS_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'change_admin_password', username:value('admin-pw-user'), currentPassword:value('admin-pw-current'), newUsername:value('admin-pw-newuser') || value('admin-pw-user'), newPassword:value('admin-pw-new')})}));
            if (epoch !== sessionEpoch) return;
            if (result.status !== 'success') return fail(systemText(result.message || t('Password belum tersimpan.', 'The password was not saved.')));
            ['admin-pw-current', 'admin-pw-new', 'admin-pw-repeat', 'admin-pw-newuser'].forEach(id => { el(id).value = ''; });
            feedback.dataset.state = 'success'; feedback.textContent = t('Password baru tersimpan. Gunakan username ', 'New password saved. Use the username ') + (result.username || '') + t(' saat login berikutnya.', ' next time you log in.');
        } catch (error) { if (epoch === sessionEpoch && !error.staleSession) fail(t('Password belum tersimpan. Periksa koneksi dan coba lagi.', 'The password was not saved. Check the connection and try again.')); }
        finally { if (epoch === sessionEpoch) { passwordSaving = false; el('admin-pw-submit').disabled = false; } }
    });
    renderPasswordCard(); document.addEventListener('DOMContentLoaded', renderPasswordCard);
    window.addEventListener('ipcos:logout', () => { passwordSaving = false; el('admin-password-form')?.reset(); const feedback = el('admin-pw-feedback'); if (feedback) feedback.textContent = ''; });

    window.IPCOSAdminTools = Object.freeze({applyView, currentView, renderViews});
})();
