/* SOP authoring and authenticated attachments. No editor library or private persistent cache. */
(() => {
    'use strict';
    const types = ['sop_magang', 'sop_tugas_akhir'];
    const fileMimes = {pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
    const mime = file => fileMimes[file.name.split('.').pop().toLowerCase()];
    const documents = new Map(), loading = new Map(), loadErrors = new Map(), downloads = new Set(), blobs = new Set();
    let editor = null, generation = 0, returnFocus = null;
    const t = (id, en) => uxText(id, en);
    const name = type => type === 'sop_magang' ? t('SOP Magang', 'Internship SOP') : t('SOP Tugas Akhir', 'Final Project SOP');
    const pageId = type => type === 'sop_magang' ? 'sop-magang' : 'sop-tugas-akhir';
    const uuid = () => crypto.randomUUID();
    const localized = (item, key) => currentLang === 'en' && item[key + 'En']?.trim() ? item[key + 'En'] : item[key] || '';
    const allowedUrl = value => { try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; } };
    function validDocument(doc,type) {
        const strings = (item,keys) => keys.every(key => typeof item[key] === 'string');
        const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
        if (!doc || doc.schema !== 1 || doc.type !== type || !Number.isInteger(doc.revision) || doc.revision < 0 || !strings(doc,['title','titleEn','intro','introEn','updatedAt']) || (doc.updatedAt && isNaN(Date.parse(doc.updatedAt))) || !Array.isArray(doc.sections) || doc.sections.length > 20) return false;
        const sections = new Set(), links = new Set(), files = new Set();
        for (const section of doc.sections) {
            if (!section || !identifier(section.id) || sections.has(section.id) || !strings(section,['title','titleEn','body','bodyEn']) || !Array.isArray(section.links) || section.links.length > 6 || !Array.isArray(section.files)) return false;
            sections.add(section.id);
            for (const link of section.links) {
                if (!link || !identifier(link.id) || links.has(link.id) || !strings(link,['label','labelEn','url']) || !allowedUrl(link.url)) return false;
                links.add(link.id);
            }
            for (const file of section.files) {
                if (!file || !identifier(file.id) || files.has(file.id) || !strings(file,['fileName','mimeType']) || !Number.isInteger(file.size) || file.size < 1 || file.size > 5*1048576 || mime({name:file.fileName}) !== file.mimeType) return false;
                files.add(file.id);
            }
        }
        return files.size <= 6;
    }
    const size = bytes => bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.ceil(bytes / 1024) + ' KB';
    const current = (epoch, run) => epoch === sessionEpoch && run === generation && ['admin','mhs'].includes(currentUser.role);
    function errorText(error) {
        const message = String(error?.message || '');
        if (currentLang === 'id') return message || 'SOP belum dapat diproses. Coba kembali.';
        if (/diperbarui admin lain|berubah.*versi|conflict|Muat versi terbaru/i.test(message)) return 'Another admin has updated this SOP. Your draft is retained. Copy your changes, then close and refresh before editing the latest version.';
        if (/Akses admin|Hanya admin/i.test(message)) return 'Only admins can publish SOP changes.';
        if (/Sesi|session|token/i.test(message)) return 'Your session has expired. Please log in again.';
        if (/tidak termasuk SOP/i.test(message)) return 'This attachment is no longer part of the published SOP. Refresh the page for the latest version.';
        if (/Lampiran SOP berubah|Lampiran SOP terlalu besar/i.test(message)) return 'This SOP attachment is unavailable or has changed. Please contact an admin.';
        if (/sedang disimpan admin lain/i.test(message)) return 'Another admin is saving an SOP. Your draft is retained; please try again.';
        if (/Penyimpanan SOP|Struktur penyimpanan|Data SOP ganda|Konten SOP belum dapat dibaca/i.test(message)) return 'SOP storage could not be read. Existing content has been preserved; please contact an admin.';
        const translated = systemText(message); if (translated !== message) return translated;
        if (/Enter |Add |Up to |must |offline|too long|URL|Another admin|Server|server|Total uploads/i.test(message)) return message;
        return 'The SOP could not be processed. Your inputs are retained; check the connection and try again.';
    }
    // Render a small, escaped subset of Markdown; never interpret supplied HTML.
    function inline(text) {
        const links = [];
        let value = escapeHtml(text).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
            const decoded = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            const safe = allowedUrl(decoded);
            if (!safe) return label;
            links.push(`<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
            return '\u0001' + (links.length - 1) + '\u0001';
        });
        value = value.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
        return value.replace(/\u0001(\d+)\u0001/g, (_, index) => links[Number(index)] || '');
    }
    function markdown(value) {
        let html = '', list = '';
        const closeList = () => { if (list) { html += `</${list}>`; list = ''; } };
        String(value || '').replace(/\r\n?/g, '\n').split('\n').forEach(line => {
            const bullet = line.match(/^\s*[-*]\s+(.+)$/), ordered = line.match(/^\s*\d+[.)]\s+(.+)$/), heading = line.match(/^#{1,3}\s+(.+)$/);
            if (bullet || ordered) { const tag = bullet ? 'ul' : 'ol'; if (list !== tag) { closeList(); html += `<${tag}>`; list = tag; } html += `<li>${inline((bullet || ordered)[1])}</li>`; }
            else { closeList(); if (heading) html += `<h3>${inline(heading[1])}</h3>`; else if (line.trim()) html += `<p>${inline(line)}</p>`; }
        });
        closeList(); return html;
    }
    const anchorId = (doc,section,preview) => `${preview?'sop-preview':'sop'}-${doc.type}-${section.id}`;
    function jump(event,link) {
        const target = document.getElementById(link.getAttribute('href')?.slice(1));
        if (!target || target.closest('.sop-page') !== link.closest('.sop-page')) return;
        event.preventDefault();
        target.querySelector('h2')?.focus({preventScroll:true});
        target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
    function bodyHtml(doc, preview = false) {
        const toc = doc.sections.length > 1 ? `<nav class="sop-toc" aria-label="${t('Daftar isi SOP','SOP contents')}"><h2>${t('Daftar isi','Contents')}</h2><ol>${doc.sections.map((section,index) => `<li><a href="#${escapeHtml(anchorId(doc,section,preview))}" data-sop-action="jump"><span aria-hidden="true">${index+1}</span><span>${escapeHtml(localized(section,'title') || t('Bagian '+(index+1),'Section '+(index+1)))}</span><span aria-hidden="true">↘</span></a></li>`).join('')}</ol></nav>` : '';
        return `${doc.intro || doc.introEn ? `<div class="sop-intro sop-prose">${markdown(localized(doc,'intro'))}</div>` : ''}${toc}${doc.sections.map((section, index) => `<section class="card sop-section" id="${escapeHtml(anchorId(doc,section,preview))}">
            <div class="sop-section-heading"><span class="sop-step" aria-hidden="true">${index + 1}</span><h2 tabindex="-1">${escapeHtml(localized(section,'title'))}</h2></div>
            <div class="sop-prose">${markdown(localized(section,'body'))}</div>
            ${section.links.length ? `<ul class="sop-links">${section.links.map(link => { const url = allowedUrl(link.url); return url ? `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localized(link,'label') || url)} <span aria-hidden="true">↗</span></a></li>` : ''; }).join('')}</ul>` : ''}
            ${section.files.length ? `<div class="sop-files"><h3>${t('Lampiran','Attachments')}</h3>${section.files.map(file => `<div class="sop-file"><div><strong>${escapeHtml(file.fileName)}</strong><span>${escapeHtml(size(file.size))}</span></div><button type="button" class="btn-secondary" data-sop-action="download" data-sop-type="${doc.type}" data-file-id="${escapeHtml(file.id)}" ${preview?'disabled':''}>${preview?t('Tersedia setelah disimpan','Available after saving'):t('Unduh','Download')}</button></div>`).join('')}</div>` : ''}
        </section>`).join('')}`;
    }
    function render(type) {
        const root = document.getElementById(type + '-view'); if (!root) return;
        if (!getSessionToken()) { root.textContent = ''; return; }
        const doc = documents.get(type), busy = loading.has(type), error = loadErrors.get(type);
        root.innerHTML = `<div class="page-intro sop-heading"><div><span class="eyebrow">${t('PANDUAN / SOP','GUIDES / SOP')}</span><h1>${escapeHtml(doc ? localized(doc,'title') : name(type))}</h1><p>${t('Prosedur dan dokumen resmi yang diterbitkan admin IPCOS.','Procedures and official documents published by IPCOS admins.')}</p>${doc?.updatedAt ? `<p class="sop-updated">${t('Diperbarui','Updated')} ${escapeHtml(formatDate(doc.updatedAt))} · ${t('Versi','Version')} ${escapeHtml(doc.revision)}</p>` : ''}</div><div class="button-row">
            <button type="button" class="btn-secondary" data-sop-action="refresh" data-sop-type="${type}" ${busy?'disabled':''}>${t('Segarkan','Refresh')}</button>
            ${currentUser.role === 'admin' && doc ? `<button type="button" class="btn-primary" data-sop-action="edit" data-sop-type="${type}">${t('Edit SOP','Edit SOP')}</button>` : ''}</div></div>
            ${busy ? `<p class="sop-notice" role="status">${t('Memuat SOP terbaru…','Loading the latest SOP…')}</p>` : ''}
            ${error ? `<p class="sop-notice field-error" role="alert">${escapeHtml(errorText(error))} ${doc?t('Versi terakhir ditampilkan.','Showing the last loaded version.'):''}</p>` : ''}
            ${doc && !doc.sections.length && !doc.intro ? `<div class="card sop-empty"><h2>${t('SOP belum diterbitkan','SOP not published yet')}</h2><p>${currentUser.role === 'admin'?t('Pilih Edit SOP untuk menambahkan section, teks, tautan, dan lampiran.','Choose Edit SOP to add sections, text, links and attachments.'):t('Admin sedang menyiapkan panduan ini. Silakan periksa kembali nanti.','Admins are preparing this guide. Please check again later.')}</p></div>` : doc ? bodyHtml(doc) : ''}`;
    }
    async function request(payload) {
        return readApiResult(await apiPost(GAS_URL,{method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'text/plain;charset=utf-8'}}));
    }
    async function open(type, force = false) {
        if (!types.includes(type) || !getSessionToken()) return;
        if (loading.has(type)) return loading.get(type);
        render(type);
        if (!force && documents.has(type)) return;
        const epoch = sessionEpoch, run = generation;
        const task = (async () => {
            try {
                const result = await request({action:'get_sop',type});
                if (!current(epoch,run)) return;
                if (result.status !== 'success' || !validDocument(result.document,type)) throw new Error(result.message || t('SOP belum dapat dimuat.','SOP could not be loaded.'));
                if (!documents.has(type) || result.document.revision >= documents.get(type).revision) documents.set(type, result.document);
                loadErrors.delete(type);
            } catch (error) { if (current(epoch,run) && !error.staleSession) loadErrors.set(type,error); }
            finally { if (current(epoch,run)) { loading.delete(type); render(type); } }
        })();
        loading.set(type,task); render(type); return task;
    }
    function createModal() {
        if (document.getElementById('modal-sop-editor')) return;
        const modal = document.createElement('div'); modal.id = 'modal-sop-editor'; modal.className = 'overlay sop-overlay'; modal.style.display = 'none'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-labelledby','sop-editor-heading');
        modal.innerHTML = '<div class="modal-card sop-editor-card"><form id="sop-editor-form" novalidate><div class="sop-editor-header"><h2 id="sop-editor-heading"></h2><button type="button" id="sop-editor-close" class="btn-secondary">×</button></div><div class="sop-editor-scroll"><p id="sop-editor-helper" class="field-helper"></p><div id="sop-editor-fields"></div><div id="sop-preview-output" class="sop-page" hidden></div></div><div class="sop-editor-actions"><p id="sop-editor-status" class="sop-notice" role="status" aria-live="polite"></p><div class="sop-editor-footer"><button type="button" id="sop-cancel" class="btn-secondary"></button><button type="button" id="sop-preview" class="btn-secondary"></button><button type="submit" id="sop-save" class="btn-primary"></button></div></div></form></div>';
        document.body.appendChild(modal);
        modal.querySelector('form').addEventListener('submit',event => { event.preventDefault(); save(); });
        modal.querySelector('#sop-cancel').addEventListener('click',cancel);
        modal.querySelector('#sop-editor-close').addEventListener('click',cancel);
        modal.querySelector('#sop-preview').addEventListener('click',preview);
        modal.addEventListener('input',input);
        modal.addEventListener('change',event => { if (event.target.matches('.sop-add-files')) addFiles(event.target); });
        modal.addEventListener('click',event => { const button = event.target.closest('[data-sop-action]'); if (button?.dataset.sopAction === 'jump') jump(event,button); else if (button) editorAction(button); });
        modal.addEventListener('keydown',event => {
            if (event.key !== 'Tab') return;
            const controls = [...modal.querySelectorAll('button,input,textarea,a[href]')].filter(el => !el.disabled && el.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        });
    }
    function field(id,label,value,area=false,max=200) { return `<label for="${id}">${label}</label>` + (area ? `<textarea id="${id}" maxlength="${max}" rows="3">${escapeHtml(value)}</textarea>` : `<input id="${id}" maxlength="${max}" type="text" value="${escapeHtml(value)}">`); }
    function sectionField(section,key,label,area=false) { const id = 'sop-' + section.id + '-' + key; return `<label for="${id}">${label}</label>${area?`<textarea id="${id}" data-section-field="${key}" maxlength="6000" rows="6">${escapeHtml(section[key])}</textarea>`:`<input id="${id}" type="text" data-section-field="${key}" maxlength="200" value="${escapeHtml(section[key])}">`}`; }
    function renderEditor() {
        if (!editor) return;
        const oldModal = document.getElementById('modal-sop-editor'), active = document.activeElement;
        const hadFocus = !!oldModal?.contains(active), scrollTop = oldModal?.querySelector('.sop-editor-scroll')?.scrollTop || 0;
        const openedDetails = new Set([...oldModal?.querySelectorAll('details[data-sop-details][open]') || []].map(detail => detail.dataset.sopDetails));
        const focus = hadFocus ? {id:active.id,sectionId:active.closest('[data-section-id]')?.dataset.sectionId,linkId:active.closest('[data-link-id]')?.dataset.linkId,
            action:active.dataset.sopAction,format:active.dataset.format,fileId:active.dataset.fileId,details:active.tagName === 'SUMMARY' ? active.parentElement.dataset.sopDetails : '',
            start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection} : null;
        createModal(); const doc = editor.draft;
        const fields = document.getElementById('sop-editor-fields');
        fields.innerHTML = `<div class="sop-document-fields">${field('sop-title',t('Judul SOP','SOP title'),doc.title)}${field('sop-intro',t('Pengantar (opsional)','Introduction (optional)'),doc.intro,true,2000)}<details class="editor-translations" data-sop-details="document"><summary>${t('English untuk mahasiswa internasional (opsional)','English for international students (optional)')}</summary><div class="details-content">${field('sop-title-en',t('Judul English','English title'),doc.titleEn)}${field('sop-intro-en',t('Pengantar English','English introduction'),doc.introEn,true,2000)}</div></details></div>
            ${doc.sections.length > 1 ? `<div class="sop-editor-section-tools"><p>${t('Bagian SOP','SOP sections')} <span>${doc.sections.length}</span></p><button type="button" id="sop-fold-sections" class="btn-secondary" data-sop-action="fold-sections"></button></div>` : ''}
            <div id="sop-editor-sections">${doc.sections.map((section,index) => `<section class="card sop-edit-section" data-section-id="${section.id}"><div class="sop-edit-section-header"><h3><button type="button" class="sop-section-toggle" data-sop-action="toggle-section" aria-expanded="${!editor.collapsed.has(section.id)}" aria-controls="sop-fields-${section.id}"><span class="sop-edit-number" aria-hidden="true">${index+1}</span><span data-sop-section-label>${escapeHtml(localized(section,'title') || t('Bagian '+(index+1),'Section '+(index+1)))}</span><span class="sop-fold-icon" aria-hidden="true">⌄</span></button></h3><div class="button-row"><button type="button" class="btn-secondary" data-sop-action="move-up" ${index===0?'disabled':''} aria-label="${t('Pindahkan section ke atas','Move section up')}">↑</button><button type="button" class="btn-secondary" data-sop-action="move-down" ${index===doc.sections.length-1?'disabled':''} aria-label="${t('Pindahkan section ke bawah','Move section down')}">↓</button><button type="button" class="btn-secondary" data-sop-action="remove-section">${t('Hapus','Remove')}</button></div></div><div class="sop-edit-section-content" id="sop-fields-${section.id}" ${editor.collapsed.has(section.id)?'hidden':''}>
            ${sectionField(section,'title',t('Judul section','Section title'))}<div class="sop-formatting" aria-label="${t('Format teks','Text formatting')}">${[['bold',t('Tebal','Bold')],['italic',t('Miring','Italic')],['heading',t('Subjudul','Heading')],['list',t('Daftar','List')],['numbered',t('Langkah','Steps')]].map(([format,label])=>`<button type="button" class="btn-secondary" data-sop-action="format" data-format="${format}">${label}</button>`).join('')}</div>${sectionField(section,'body',t('Isi SOP','SOP content'),true)}
            <details class="editor-translations" data-sop-details="${section.id}"><summary>${t('English (opsional)','English (optional)')}</summary><div class="details-content">${sectionField(section,'titleEn',t('Judul section English','English section title'))}${sectionField(section,'bodyEn',t('Isi SOP English','SOP content in English'),true)}</div></details>
            <div class="sop-editor-links">${section.links.map(link=>`<div class="sop-edit-link" data-link-id="${link.id}"><label>${t('Teks tautan','Link text')}<input id="sop-${section.id}-${link.id}-label" type="text" data-link-field="label" maxlength="200" value="${escapeHtml(link.label)}"></label><label>${t('Teks English (opsional)','English text (optional)')}<input id="sop-${section.id}-${link.id}-labelEn" type="text" data-link-field="labelEn" maxlength="200" value="${escapeHtml(link.labelEn)}"></label><label>URL<input id="sop-${section.id}-${link.id}-url" type="url" data-link-field="url" maxlength="2000" placeholder="https://" value="${escapeHtml(link.url)}"></label><button type="button" class="btn-secondary" data-sop-action="remove-link">${t('Hapus tautan','Remove link')}</button></div>`).join('')}<button type="button" class="btn-secondary" data-sop-action="add-link">${t('+ Tambah tautan','+ Add link')}</button></div>
            <div class="sop-editor-files">${section.files.map(file=>`<div class="sop-file"><div><strong>${escapeHtml(file.fileName)}</strong><span>${escapeHtml(size(file.size))} · ${file.id.startsWith('new-')?t('Belum disimpan','Not saved yet'):t('Tersimpan','Saved')}</span></div><button type="button" class="btn-secondary" data-sop-action="remove-file" data-file-id="${file.id}">${t('Hapus lampiran','Remove attachment')}</button></div>`).join('')}<label class="sop-upload-label">${t('Tambahkan lampiran','Add attachments')}<input id="sop-${section.id}-files" type="file" class="sop-add-files" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" multiple></label><p class="field-helper">${t('PDF, Word, PNG atau JPG. Maks. 5 MB/berkas, 6 lampiran per SOP, 12 MB unggahan per penyimpanan.','PDF, Word, PNG or JPG. Up to 5 MB/file, 6 attachments per SOP, 12 MB uploaded per save.')}</p></div></div></section>`).join('')}</div><button type="button" id="sop-add-section" class="btn-secondary" data-sop-action="add-section">${t('+ Tambah section','+ Add section')}</button>`;
        document.getElementById('sop-editor-heading').textContent = t('Edit ','Edit ') + name(doc.type);
        document.getElementById('sop-editor-helper').textContent = t('Susun teks, urutan section, tautan, dan lampiran. Perubahan tampil untuk mahasiswa setelah berhasil disimpan. English yang belum diisi akan memakai teks Indonesia.','Arrange text, sections, links and attachments. Changes become visible to students after a successful save. Missing English content uses the original Indonesian text.');
        document.getElementById('sop-cancel').textContent = t('Batal','Cancel');
        document.getElementById('sop-editor-close').setAttribute('aria-label',t('Tutup editor SOP','Close SOP editor'));
        updateEditorState();
        const modal = document.getElementById('modal-sop-editor');
        modal.querySelectorAll('details[data-sop-details]').forEach(detail => { detail.open = openedDetails.has(detail.dataset.sopDetails); });
        modal.querySelector('.sop-editor-scroll').scrollTop = scrollTop;
        if (focus && !editor.busy && !editor.filesBusy) {
            let target = focus.id ? document.getElementById(focus.id) : null;
            if (!target && focus.details) target = modal.querySelector(`details[data-sop-details="${CSS.escape(focus.details)}"] > summary`);
            if (!target && focus.action) {
                const block = focus.sectionId ? modal.querySelector(`[data-section-id="${CSS.escape(focus.sectionId)}"]`) : modal;
                const scope = focus.linkId ? block?.querySelector(`[data-link-id="${CSS.escape(focus.linkId)}"]`) : block;
                target = [...scope?.querySelectorAll('[data-sop-action]') || []].find(button => button.dataset.sopAction === focus.action && (!focus.format || button.dataset.format === focus.format) && (!focus.fileId || button.dataset.fileId === focus.fileId));
            }
            if (target && !target.disabled && target.getClientRects().length) {
                target.focus({preventScroll:true});
                if (typeof focus.start === 'number' && typeof target.setSelectionRange === 'function') {
                    try { target.setSelectionRange(focus.start,focus.end,focus.direction); } catch (_) { /* Some input types do not support a text selection. */ }
                }
            }
        }
    }
    function updateCollapsedSections() {
        if (!editor) return;
        const modal = document.getElementById('modal-sop-editor');
        modal?.querySelectorAll('.sop-edit-section').forEach(block => {
            const collapsed = editor.collapsed.has(block.dataset.sectionId);
            block.querySelector('.sop-edit-section-content').hidden = collapsed;
            block.querySelector('[data-sop-action="toggle-section"]').setAttribute('aria-expanded',String(!collapsed));
        });
        const fold = document.getElementById('sop-fold-sections');
        if (fold) fold.textContent = editor.draft.sections.every(section=>editor.collapsed.has(section.id)) ? t('Buka semua','Expand all') : t('Ringkas semua','Collapse all');
    }
    function updateEditorState() {
        if (!editor) return;
        updateCollapsedSections();
        document.getElementById('sop-preview').textContent = editor.preview ? t('Kembali mengedit','Back to editing') : t('Pratinjau','Preview');
        document.getElementById('sop-save').textContent = editor.busy ? t('Menyimpan…','Saving…') : t('Simpan & Terbitkan','Save & Publish');
        document.getElementById('sop-editor-fields').hidden = editor.preview;
        const previewRoot = document.getElementById('sop-preview-output'); previewRoot.hidden = !editor.preview;
        if (editor.preview) previewRoot.innerHTML = `<h2>${escapeHtml(localized(editor.draft,'title'))}</h2>${bodyHtml(editor.draft,true)}`;
        document.querySelectorAll('#modal-sop-editor button,#modal-sop-editor input,#modal-sop-editor textarea').forEach(control => { control.disabled = editor.busy || editor.filesBusy > 0 || (control.dataset.sopAction === 'move-up' && control.closest('[data-section-id]')?.dataset.sectionId === editor.draft.sections[0]?.id) || (control.dataset.sopAction === 'move-down' && control.closest('[data-section-id]')?.dataset.sectionId === editor.draft.sections.at(-1)?.id) || control.closest('#sop-preview-output') !== null; });
        const status = document.getElementById('sop-editor-status');
        status.textContent = editor.busy ? t('Mengunggah dan menyimpan. Tunggu konfirmasi server…','Uploading and saving. Waiting for server confirmation…') : editor.filesBusy ? t('Memeriksa lampiran…','Checking attachments…') : editor.error ? errorText(editor.error) : editor.dirty ? t('Ada perubahan yang belum diterbitkan.','There are unpublished changes.') : t('Belum ada perubahan.','No changes yet.');
        status.classList.toggle('field-error',!!editor.error);
    }
    async function edit(type) {
        if (currentUser.role !== 'admin' || !types.includes(type)) return;
        if (editor && !cancel()) return;
        if (!documents.has(type)) await open(type,true);
        if (currentUser.role !== 'admin' || !documents.has(type)) return;
        returnFocus = document.activeElement;
        editor = {draft:structuredClone(documents.get(type)),files:new Map(),collapsed:new Set(),editScrollTop:0,dirty:false,busy:false,filesBusy:0,preview:false,error:null,requestId:'',payload:null};
        renderEditor(); const modal = document.getElementById('modal-sop-editor'); modal.style.display = 'flex'; modal.style.opacity = '1'; document.getElementById('sop-title').focus();
    }
    function changed() { editor.dirty = true; editor.error = null; editor.requestId = ''; editor.payload = null; updateEditorState(); }
    function input(event) {
        if (!editor || editor.busy || editor.filesBusy) return;
        const target = event.target, direct = {'sop-title':'title','sop-title-en':'titleEn','sop-intro':'intro','sop-intro-en':'introEn'};
        if (direct[target.id]) { editor.draft[direct[target.id]] = target.value; changed(); return; }
        const section = editor.draft.sections.find(item=>item.id === target.closest('[data-section-id]')?.dataset.sectionId);
        if (!section) return;
        if (target.dataset.sectionField) { section[target.dataset.sectionField] = target.value; if (target.dataset.sectionField === 'title' || target.dataset.sectionField === 'titleEn') { const index = editor.draft.sections.indexOf(section); target.closest('[data-section-id]').querySelector('[data-sop-section-label]').textContent = localized(section,'title') || t('Bagian '+(index+1),'Section '+(index+1)); } changed(); }
        else if (target.dataset.linkField) { const link = section.links.find(item=>item.id === target.closest('[data-link-id]')?.dataset.linkId); if (link) { link[target.dataset.linkField] = target.value; changed(); } }
    }
    function editorAction(button) {
        if (!editor || editor.busy || editor.filesBusy) return;
        const action = button.dataset.sopAction, doc = editor.draft, section = doc.sections.find(item=>item.id === button.closest('[data-section-id]')?.dataset.sectionId), index = doc.sections.indexOf(section);
        if (action === 'toggle-section' && section) { if (editor.collapsed.has(section.id)) editor.collapsed.delete(section.id); else editor.collapsed.add(section.id); updateCollapsedSections(); return; }
        if (action === 'fold-sections') { if (doc.sections.every(item=>editor.collapsed.has(item.id))) editor.collapsed.clear(); else doc.sections.forEach(item=>editor.collapsed.add(item.id)); updateCollapsedSections(); return; }
        if (action === 'add-section') { if (doc.sections.length >= 20) return showToast(t('Maksimal 20 section per SOP.','Up to 20 sections per SOP.'),'error'); doc.sections.push({id:uuid(),title:'',titleEn:'',body:'',bodyEn:'',links:[],files:[]}); }
        else if (action === 'format' && section) {
            const target = button.closest('[data-section-id]').querySelector('[data-section-field="body"]'), start = target.selectionStart, end = target.selectionEnd, selected = target.value.slice(start,end) || t('Teks','Text');
            const formatted = ({bold:'**'+selected+'**',italic:'*'+selected+'*',heading:'\n### '+selected+'\n',list:'\n- '+selected+'\n',numbered:'\n1. '+selected+'\n'})[button.dataset.format];
            target.setRangeText(formatted,start,end,'select'); section.body = target.value; changed(); target.focus(); return;
        }
        else if (section && action === 'remove-section') { if ((section.body || section.files.length || section.links.length) && !confirm(t('Hapus section ini dari draf SOP?','Remove this section from the SOP draft?'))) return; section.files.forEach(file=>editor.files.delete(file.id)); editor.collapsed.delete(section.id); doc.sections.splice(index,1); }
        else if (section && action === 'move-up' && index > 0) [doc.sections[index-1],doc.sections[index]] = [section,doc.sections[index-1]];
        else if (section && action === 'move-down' && index < doc.sections.length-1) [doc.sections[index+1],doc.sections[index]] = [section,doc.sections[index+1]];
        else if (section && action === 'add-link') { if (section.links.length >= 6) return showToast(t('Maksimal 6 tautan per section.','Up to 6 links per section.'),'error'); section.links.push({id:uuid(),label:'',labelEn:'',url:''}); }
        else if (section && action === 'remove-link') section.links = section.links.filter(link=>link.id !== button.closest('[data-link-id]')?.dataset.linkId);
        else if (section && action === 'remove-file') { section.files = section.files.filter(file=>file.id !== button.dataset.fileId); editor.files.delete(button.dataset.fileId); }
        else return;
        changed(); renderEditor();
    }
    async function addFiles(inputElement) {
        if (!editor || editor.busy || editor.filesBusy) return;
        const draft = editor, epoch = sessionEpoch, run = generation, files = [...inputElement.files], blockId = inputElement.closest('[data-section-id]').dataset.sectionId;
        inputElement.value = ''; if (!files.length) return;
        draft.filesBusy++; updateEditorState();
        try {
            if (draft.draft.sections.reduce((count,section)=>count+section.files.length,0) + files.length > 6) throw Error(t('Maksimal 6 lampiran per SOP.','Up to 6 attachments per SOP.'));
            if ([...draft.files.values(),...files].reduce((total,file)=>total+file.size,0) > 12*1048576) throw Error(t('Total unggahan maksimal 12 MB per penyimpanan.','Total uploads must not exceed 12 MB per save.'));
            for (const file of files) {
                if (!/\.(pdf|docx?|png|jpe?g)$/i.test(file.name)) throw Error(t('Format lampiran: PDF, Word, PNG atau JPG.','Attachment formats: PDF, Word, PNG or JPG.'));
                if (!file.size || file.size > 5*1048576) throw Error(t('Ukuran setiap lampiran harus 1 byte sampai 5 MB.','Each attachment must be between 1 byte and 5 MB.'));
                const issue = documentStructureIssue(new Uint8Array(await file.arrayBuffer()),file.name); if (issue) throw Error(issue);
            }
            if (!current(epoch,run) || editor !== draft) return;
            const section = draft.draft.sections.find(item=>item.id === blockId);
            for (const file of files) { const id = 'new-' + uuid(); draft.files.set(id,file); section.files.push({id,fileName:file.name,mimeType:mime(file),size:file.size}); }
            draft.dirty = true; draft.error = null; draft.requestId = ''; draft.payload = null;
        } catch (error) { if (current(epoch,run) && editor === draft) draft.error = error; }
        finally { if (current(epoch,run) && editor === draft) { draft.filesBusy--; renderEditor(); } }
    }
    function validation(doc) {
        if (!doc.title.trim()) return t('Isi judul SOP terlebih dahulu.','Enter an SOP title.');
        if (!doc.sections.length && !doc.intro.trim()) return t('Tambahkan pengantar atau minimal satu section.','Add an introduction or at least one section.');
        for (const section of doc.sections) {
            if (!section.title.trim()) return t('Isi judul setiap section.','Enter a title for every section.');
            if (!section.body.trim() && !section.files.length && !section.links.length) return t('Isi teks, tautan, atau lampiran pada setiap section.','Add text, a link or an attachment to every section.');
            for (const link of section.links) if (!link.label.trim() || !allowedUrl(link.url)) return t('Isi teks tautan dan URL lengkap http:// atau https:// yang valid.','Enter link text and a valid full http:// or https:// URL.');
        }
        if (JSON.stringify(doc).length > 44000) return t('Isi SOP terlalu panjang. Ringkas teks atau gunakan lampiran.','The SOP is too long. Shorten the text or use attachments.');
        return '';
    }
    async function save() {
        if (!editor || editor.busy || editor.filesBusy || currentUser.role !== 'admin') return;
        const draft = editor, doc = structuredClone(draft.draft), issue = validation(doc);
        if (issue || isOffline) {
            draft.error = Error(issue || t('Anda sedang offline. Isian tetap tersedia.','You are offline. Your inputs are retained.')); updateEditorState();
            if (issue) {
                let targetId = !doc.title.trim() ? 'sop-title' : '';
                for (const section of doc.sections) {
                    const invalidLink = section.links.find(link=>!link.label.trim() || !allowedUrl(link.url));
                    const key = !section.title.trim() ? 'title' : !section.body.trim() && !section.files.length && !section.links.length ? 'body' : '';
                    if (key || invalidLink) {
                        draft.collapsed.delete(section.id); updateCollapsedSections();
                        if (!targetId) targetId = invalidLink && !key ? `sop-${section.id}-${invalidLink.id}-${!invalidLink.label.trim()?'label':'url'}` : `sop-${section.id}-${key}`;
                        break;
                    }
                }
                if (!targetId && !doc.sections.length && !doc.intro.trim()) targetId = 'sop-intro';
                if (targetId) { if (draft.preview) { draft.preview = false; updateEditorState(); } document.getElementById(targetId)?.focus(); }
            }
            return;
        }
        const epoch = sessionEpoch, run = generation;
        draft.busy = true; draft.error = null; updateEditorState();
        try {
            if (!draft.payload) {
                const uploads = [];
                for (const section of doc.sections) for (const metadata of section.files) {
                    const file = draft.files.get(metadata.id);
                    if (file) uploads.push({id:metadata.id,blockId:section.id,fileName:file.name,mimeType:mime(file),base64:await fileToBase64(file)});
                }
                if (!current(epoch,run) || editor !== draft) return;
                draft.requestId = draft.requestId || uuid();
                draft.payload = {action:'save_sop',type:doc.type,document:doc,revision:doc.revision,requestId:draft.requestId,uploads};
            }
            const result = await request(draft.payload);
            if (!current(epoch,run) || editor !== draft) return;
            if (result.status !== 'success' || !validDocument(result.document,doc.type) || result.document.revision <= doc.revision) throw Error(result.message || t('Server belum mengonfirmasi penyimpanan.','The server has not confirmed the save.'));
            documents.set(doc.type,result.document); loadErrors.delete(doc.type);
            editor = null; document.getElementById('modal-sop-editor').style.display = 'none'; document.getElementById('sop-editor-fields').textContent = ''; document.getElementById('sop-preview-output').textContent = '';
            render(doc.type); returnFocus?.isConnected && returnFocus.focus(); showToast(t('SOP berhasil diterbitkan untuk mahasiswa.','The SOP has been published for students.'));
        } catch (error) { if (current(epoch,run) && editor === draft && !error.staleSession) { draft.error = error; draft.busy = false; updateEditorState(); } }
        finally { if (current(epoch,run) && editor === draft) { draft.busy = false; updateEditorState(); } }
    }
    function preview() {
        if (!editor || editor.busy || editor.filesBusy) return;
        const scroll = document.querySelector('#modal-sop-editor .sop-editor-scroll');
        if (!editor.preview) editor.editScrollTop = scroll?.scrollTop || 0;
        editor.preview = !editor.preview; updateEditorState();
        if (scroll) scroll.scrollTop = editor.preview ? 0 : editor.editScrollTop;
    }
    function cancel() {
        if (!editor) return true;
        if (editor.busy || editor.filesBusy) { showToast(t('Tunggu proses selesai sebelum menutup editor.','Wait for the current operation before closing the editor.'),'error'); return false; }
        if (editor.dirty && !confirm(t('Perubahan SOP belum diterbitkan. Tutup dan buang draf ini?','SOP changes have not been published. Close and discard this draft?'))) return false;
        editor = null; const modal = document.getElementById('modal-sop-editor'); if (modal) { modal.style.display = 'none'; modal.querySelector('#sop-editor-fields').textContent = ''; modal.querySelector('#sop-preview-output').textContent = ''; }
        returnFocus?.isConnected && returnFocus.focus(); return true;
    }
    async function download(type,fileId,button) {
        const key = type + ':' + fileId, doc = documents.get(type);
        if (!getSessionToken() || downloads.has(key) || !doc?.sections.some(section=>section.files.some(file=>file.id===fileId))) return;
        const epoch = sessionEpoch, run = generation; downloads.add(key); button.disabled = true; button.textContent = t('Mengunduh…','Downloading…');
        try {
            const result = await request({action:'get_sop_file',type,fileId});
            if (!current(epoch,run)) return;
            if (result.status !== 'success' || !result.base64) throw Error(result.message || t('Lampiran belum dapat diunduh.','Attachment could not be downloaded.'));
            const bytes = Uint8Array.from(atob(result.base64),character=>character.charCodeAt(0)), url = URL.createObjectURL(new Blob([bytes],{type:result.mimeType || 'application/octet-stream'}));
            blobs.add(url); const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove();
            setTimeout(()=>{URL.revokeObjectURL(url);blobs.delete(url);},30000);
        } catch (error) { if (current(epoch,run) && !error.staleSession) showToast(errorText(error),'error'); }
        finally { if (current(epoch,run)) { downloads.delete(key); if (button.isConnected) { button.disabled = false; button.textContent = t('Unduh','Download'); } } }
    }
    function reset() {
        generation++; documents.clear(); loading.clear(); loadErrors.clear(); downloads.clear(); blobs.forEach(url=>URL.revokeObjectURL(url)); blobs.clear(); editor = null; returnFocus = null;
        types.forEach(type=>{ const view = document.getElementById(type+'-view'); if (view) view.textContent = ''; try { localStorage.removeItem('ipcos_content_'+type); } catch (_) {} });
        document.getElementById('modal-sop-editor')?.remove();
    }
    function languageChanged() { types.forEach(render); if (editor) renderEditor(); }
    function receive(contents) {
        if (!getSessionToken()) return;
        for (const item of contents) {
            if (!types.includes(item.Tipe)) continue;
            try {
                const doc = JSON.parse(item.DataJSON);
                if (!validDocument(doc,item.Tipe)) continue;
                if (!documents.has(item.Tipe) || doc.revision > documents.get(item.Tipe).revision) { documents.set(item.Tipe,doc); loadErrors.delete(item.Tipe); render(item.Tipe); }
            } catch (_) { /* A failed read cannot overwrite the currently loaded SOP or editor. */ }
        }
    }
    document.addEventListener('click',event=> {
        const button = event.target.closest('.sop-page [data-sop-action]'); if (!button || button.disabled || button.closest('#modal-sop-editor')) return;
        const type = button.dataset.sopType;
        if (button.dataset.sopAction === 'jump') jump(event,button);
        else if (button.dataset.sopAction === 'edit') edit(type);
        else if (button.dataset.sopAction === 'refresh') open(type,true);
        else if (button.dataset.sopAction === 'download') download(type,button.dataset.fileId,button);
    });
    window.addEventListener('beforeunload',event=> { if (editor && (editor.dirty || editor.busy || editor.filesBusy)) { event.preventDefault(); event.returnValue = ''; } });
    window.IPCOSSop = {open,edit,save,cancel,reset,receive,languageChanged,beforeNavigate:tab => !editor || tab === pageId(editor.draft.type) || cancel()};
})();
