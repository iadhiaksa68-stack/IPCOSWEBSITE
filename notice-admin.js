/* Admin only: name, scope and end notices. Loaded on demand with Data & Layanan Admin, never for students.
   Details live in KontenWeb "notice_meta" (the existing update_content route), keyed by the announcement text. */
(() => {
    'use strict';
    const el = id => document.getElementById(id), t = (id,en) => uxText(id,en), N = window.IPCOSNotifications.notice;
    let edit = null, busy = false, message = '';
    const signatures = new WeakMap();
    const text = (node,value) => { if (node && node.textContent !== value) node.textContent = value; };
    const admin = () => currentUser.role === 'admin' && !!getSessionToken();
    const serviceOptions = selected => [['',t('Semua layanan','All services')],...SERVICE_TYPES.map(type=>[type,systemText(type)])].map(([value,label])=>`<option value="${escapeHtml(value)}"${selected===value?' selected':''}>${escapeHtml(label)}</option>`).join('');
    // Admin-only styles travel with this module so students never download them.
    const style = document.createElement('style'); style.id = 'notice-admin-style';
    style.textContent = `.announcement-options { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:12px; } .announcement-options>div { min-width:0; } .announcement-options input,.announcement-options select { margin-bottom:0; } .announcement-preview { border:1px dashed var(--item-border); border-radius:14px; padding:12px; max-width:390px; } .announcement-preview-label { margin:0 0 4px; font-size:13px; font-weight:700; color:var(--text-muted); } .notification-row-preview { display:block; border:0; padding:4px 0; } .notification-row-preview .notification-subject { min-height:0; padding:4px 0; cursor:default; } .notice-manager>summary { min-height:44px; display:flex; align-items:center; font-weight:800; cursor:pointer; } #notice-manager-message { margin:8px 0 0; font-size:14px; font-weight:700; } #notice-manager-message:empty { display:none; } #notice-manager-list { list-style:none; margin:8px 0 0; padding:0; } .notice-manager-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px 12px; align-items:start; padding:12px 0; border-top:1px solid var(--item-border); } .notice-manager-row.is-inactive .notice-manager-copy { color:var(--text-muted); } .notice-manager-copy { display:grid; gap:2px; min-width:0; } .notice-manager-copy strong { overflow-wrap:anywhere; text-transform:none; } .notice-manager-meta,.notice-manager-note { font-size:13px; color:var(--text-muted); } .notice-manager-row>button { width:auto; margin:0; } .notice-manager-editor { grid-column:1 / -1; display:grid; gap:8px; padding:12px; border-radius:12px; background:var(--item-bg); } .notice-manager-body { margin:0; font-size:14px; line-height:1.7; color:var(--text-color); overflow-wrap:anywhere; } .notice-manager-editor input:not([type="checkbox"]),.notice-manager-editor select { margin:0; width:100%; } .notice-manager-empty { padding:12px 0; color:var(--text-muted); }`;
    document.head.append(style);
    const announcements = () => (readStoredJSON(sessionStorage,'ipcos_announcements',[]) || []).filter(ann => String(ann?.Pesan || ann?.message || '').trim());
    /* ---------- Publishing form: subject, related service, valid-until date and a phone row preview ---------- */
    function buildForm() {
        const message = el('input-broadcast'), fields = message?.closest('.announcement-fields');
        if (!fields || el('input-broadcast-subject')) return;
        const subject = document.createElement('div'); subject.className = 'announcement-subject-field';
        subject.innerHTML = '<label id="input-broadcast-subject-label" for="input-broadcast-subject"></label><input type="text" id="input-broadcast-subject" maxlength="80" autocomplete="off" aria-describedby="input-broadcast-subject-help" required><p id="input-broadcast-subject-help" class="field-helper"></p>';
        fields.querySelector('label[for="input-broadcast"]').before(subject);
        const options = document.createElement('div'); options.className = 'announcement-options';
        options.innerHTML = '<div><label id="input-broadcast-service-label" for="input-broadcast-service"></label><select id="input-broadcast-service"></select></div><div><label id="input-broadcast-expires-label" for="input-broadcast-expires"></label><input type="date" id="input-broadcast-expires" aria-describedby="input-broadcast-expires-help"><p id="input-broadcast-expires-help" class="field-helper"></p></div>';
        message.after(options);
        const preview = document.createElement('div'); preview.className = 'announcement-preview';
        preview.innerHTML = '<p id="announcement-preview-label" class="announcement-preview-label"></p><div id="announcement-preview" aria-live="polite"></div>';
        fields.querySelector('.announcement-submit').before(preview);
    }
    function previewRow(subject, body, service) {
        const derived = N.derived(body), title = N.collapse(subject) || derived.subject || t('Subjek pengumuman','Notice subject'), excerpt = N.collapse(subject) ? N.collapse(body) : derived.rest;
        return `<div class="notification-row is-unread notification-row-preview" data-preserve-case><div class="notification-row-meta"><span class="notification-labels"><span class="notification-state">${t('Belum dibaca','Unread')}</span><span>${t('Pengumuman','Announcement')}</span>${service ? `<span>${escapeHtml(systemText(service))}</span>` : ''}</span><span class="notification-date">${t('Hari ini','Today')}</span></div><p class="notification-subject"><span>${escapeHtml(title)}</span><span class="notification-chevron" aria-hidden="true">›</span></p>${excerpt ? `<p class="notification-excerpt">${escapeHtml(excerpt)}</p>` : ''}</div>`;
    }
    function renderForm() {
        buildForm();
        if (!el('input-broadcast-subject')) return;
        text(el('input-broadcast-subject-label'), t('Subjek singkat','Short subject'));
        text(el('input-broadcast-subject-help'), t('Judul baris di Pusat Notifikasi, maksimal 80 karakter. Contoh: Unggah berkas Pendadaran satu per satu.','The row title in the Notification Center, up to 80 characters. Example: Upload Pendadaran files one by one.'));
        text(el('input-broadcast-service-label'), t('Layanan terkait (opsional)','Related service (optional)'));
        text(el('input-broadcast-expires-label'), t('Berlaku sampai (opsional)','Valid until (optional)'));
        text(el('input-broadcast-expires-help'), t('Setelah tanggal ini (23.59 WIB) pengumuman pindah ke Arsip dan tidak lagi tampil sebagai Penting.','After this date (23:59 WIB) the notice moves to the Archive and is no longer marked Important.'));
        text(el('announcement-preview-label'), t('Pratinjau baris di ponsel','Phone row preview'));
        const select = el('input-broadcast-service'), html = serviceOptions(select.value);
        if (signatures.get(select) !== html) { const value = select.value; select.innerHTML = html; signatures.set(select, html); select.value = value; }
        const box = el('announcement-preview'), row = previewRow(el('input-broadcast-subject').value, el('input-broadcast').value, select.value);
        if (signatures.get(box) !== row) { box.innerHTML = row; signatures.set(box, row); }
    }
    async function saveNotice(body, changes) {
        if (!admin()) return false;
        const store = {...N.store()}, key = N.key(body), live = new Set([key]);
        for (const ann of announcements()) live.add(N.key(ann.Pesan || ann.message));
        // Details of deleted announcements are dropped so the record stays small.
        for (const entry of Object.keys(store)) if (!live.has(entry)) delete store[entry];
        const next = {subject:N.collapse(changes.subject).slice(0,80), service:SERVICE_TYPES.includes(changes.service) ? changes.service : '', expires:/^\d{4}-\d{2}-\d{2}$/.test(changes.expires || '') ? changes.expires : '', archived:changes.archived === true, updatedAt:new Date().toISOString()};
        if (!next.subject && !next.service && !next.expires && !next.archived) delete store[key]; else store[key] = next;
        const json = JSON.stringify({schema:1, notices:store}), epoch = sessionEpoch;
        const result = await readApiResult(await apiPost(GAS_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'update_content', type:'notice_meta', content:json})}));
        if (epoch !== sessionEpoch) return false;
        if (result.status !== 'success') throw Error(result.message || t('Detail pengumuman belum tersimpan.','Notice details were not saved.'));
        contentPublicationVersion++; cachePublishedContent('notice_meta', json); window.IPCOSNotifications.render(); return true;
    }
    /* ---------- Published notices: subject, service, valid-until and archive for each one ---------- */
    function managerHtml() {
        const store = N.store(), seen = new Set(), rows = [];
        for (const ann of announcements().slice().reverse()) {
            const body = String(ann.Pesan || ann.message).trim(), key = N.key(body); if (seen.has(key)) continue; seen.add(key);
            const details = N.details(body, store), off = N.inactive(details), editing = edit?.key === key, title = details.subject || N.derived(body).subject;
            const status = off ? (details.archived ? t('Diarsipkan','Archived') : t('Kedaluwarsa','Expired')) : details.expires ? t(`Aktif sampai ${formatDate(details.expires)}`,`Active until ${formatDate(details.expires)}`) : t('Aktif','Active');
            let html = `<li class="notice-manager-row${off ? ' is-inactive' : ''}" data-preserve-case><div class="notice-manager-copy"><span class="notice-manager-meta">${escapeHtml([N.shortDate(ann.date || ann.Tanggal || ''), status, details.service ? systemText(details.service) : ''].filter(Boolean).join(' · '))}</span><strong>${escapeHtml(title)}</strong>${details.subject ? '' : `<span class="notice-manager-note">${escapeHtml(t('Belum bersubjek · memakai kalimat pertama','No subject yet · uses the first sentence'))}</span>`}</div>${editing ? '' : `<button type="button" class="btn-secondary" data-notice-edit="${escapeHtml(key)}" aria-label="${escapeHtml(t('Ubah detail: ','Edit details: ') + title)}" ${busy ? 'disabled' : ''}>${t('Ubah','Edit')}</button>`}`;
            if (editing) html += `<div class="notice-manager-editor"><p class="notice-manager-body">${escapeHtml(N.collapse(body).slice(0,240))}${N.collapse(body).length > 240 ? '…' : ''}</p><label for="notice-edit-subject">${t('Subjek singkat','Short subject')}</label><input id="notice-edit-subject" data-notice-field="subject" maxlength="80" autocomplete="off" value="${escapeHtml(edit.subject)}"><div class="announcement-options"><div><label for="notice-edit-service">${t('Layanan terkait','Related service')}</label><select id="notice-edit-service" data-notice-field="service">${serviceOptions(edit.service)}</select></div><div><label for="notice-edit-expires">${t('Berlaku sampai','Valid until')}</label><input type="date" id="notice-edit-expires" data-notice-field="expires" value="${escapeHtml(edit.expires)}"></div></div><label class="check-row" for="notice-edit-archived"><input type="checkbox" id="notice-edit-archived" data-notice-field="archived" ${edit.archived ? 'checked' : ''}> ${t('Arsipkan sekarang (sudah diganti atau tidak berlaku)','Archive now (replaced or no longer valid)')}</label><div class="button-row"><button type="button" class="btn-primary" data-notice-save ${busy ? 'disabled' : ''}>${t('Simpan Detail','Save Details')}</button><button type="button" class="btn-secondary" data-notice-cancel ${busy ? 'disabled' : ''}>${t('Batal','Cancel')}</button></div></div>`;
            rows.push(html + '</li>');
        }
        return rows.join('') || `<li class="notice-manager-empty">${escapeHtml(t('Belum ada pengumuman terbit.','No notices published yet.'))}</li>`;
    }
    function renderManager() {
        const form = document.querySelector('.announcement-management'); if (!form) return;
        let box = el('notice-manager');
        if (!box) { box = document.createElement('details'); box.id = 'notice-manager'; box.className = 'card notice-manager'; box.innerHTML = '<summary id="notice-manager-title"></summary><p id="notice-manager-help" class="field-helper"></p><p id="notice-manager-message" role="status" aria-live="polite"></p><ul id="notice-manager-list"></ul>'; }
        // Data & Layanan Admin moves the form into its own section; the manager follows it.
        if (box.previousElementSibling !== form) form.after(box);
        text(el('notice-manager-title'), t('Kelola Pengumuman Terbit','Manage Published Notices'));
        text(el('notice-manager-help'), t('Beri subjek pada pengumuman lama, pilih layanannya, atau atur tanggal berlaku. Pengumuman kedaluwarsa atau diarsipkan pindah ke Arsip dan tetap dapat dicari. Atur kedaluwarsa hanya bila ada tanggal atau keputusan yang mendukung.','Give older notices a subject, choose their service, or set a valid-until date. Expired or archived notices move to the Archive and stay searchable. Set an expiry only when a date or decision supports it.'));
        text(el('notice-manager-message'), message);
        const list = el('notice-manager-list'), html = managerHtml(); if (signatures.get(list) === html) return;
        const active = document.activeElement, focusId = list.contains(active) ? active.id : '', caret = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
        list.innerHTML = html; signatures.set(list, html);
        const target = focusId && el(focusId); if (target) { target.focus({preventScroll:true}); if (caret) try { target.setSelectionRange(...caret); } catch (_) {} }
    }
    function render() { if (!admin()) return; renderForm(); renderManager(); }
    async function saveManager() {
        if (!edit || busy) return;
        busy = true; message = t('Menyimpan detail…','Saving details…'); render(); const epoch = sessionEpoch, changes = edit;
        try { await saveNotice(changes.body, changes); if (epoch !== sessionEpoch) return; edit = null; message = t('Detail pengumuman tersimpan.','Notice details saved.'); }
        catch (error) { if (epoch !== sessionEpoch || error.staleSession) return; message = t('Detail belum tersimpan. Isian Anda tetap ada; coba lagi.','Details were not saved. Your changes are kept; try again.'); }
        finally { if (epoch === sessionEpoch) { busy = false; render(); if (!edit) el('notice-manager-title')?.focus({preventScroll:true}); } }
    }
    function field(event) {
        if (event.target.closest('.announcement-management')) renderForm();
        const input = event.target.closest('[data-notice-field]'); if (input && edit) edit[input.dataset.noticeField] = input.type === 'checkbox' ? input.checked : input.value;
    }
    document.addEventListener('input', field); document.addEventListener('change', field);
    document.addEventListener('click', event => {
        if (!admin() || busy) return;
        const open = event.target.closest('[data-notice-edit]');
        if (open) { const ann = announcements().find(item => N.key(item.Pesan || item.message) === open.dataset.noticeEdit); if (!ann) return; const body = String(ann.Pesan || ann.message).trim(); edit = {key:open.dataset.noticeEdit, body, ...N.details(body)}; message = ''; render(); el('notice-edit-subject')?.focus(); return; }
        if (event.target.closest('[data-notice-cancel]')) { const key = edit?.key; edit = null; message = ''; render(); el('notice-manager-list')?.querySelector(`[data-notice-edit="${CSS.escape(key || '')}"]`)?.focus(); return; }
        if (event.target.closest('[data-notice-save]')) saveManager();
    });
    window.addEventListener('ipcos:logout', () => { edit = null; busy = false; message = ''; for (const id of ['notice-manager-list','announcement-preview']) { const node = el(id); if (node) { node.replaceChildren(); signatures.delete(node); } } });
    window.IPCOSNoticeAdmin = Object.freeze({render, saveNotice});
})();
