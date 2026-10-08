/* Review navigation uses the current filtered queue; it never changes records. */
(() => {
    'use strict';
    let queueIds = [], activeId = '', previousId = '', nextId = '', queuePosition = -1;
    let movedActionRow = null, actionMarker = null;

    const text = (id, en) => uxText(id, en);
    const escape = value => escapeHtml(String(value ?? ''));
    const isAdmin = () => currentUser?.role === 'admin';
    const modal = () => document.getElementById('modal-case-detail');
    const isOpen = () => modal()?.style.display === 'flex';
    const busy = () => isPreparingCorrection || activeUpdateIds.size > 0;

    function reconcile(previousQueue = []) {
        queuePosition = queueIds.indexOf(activeId);
        if (queuePosition !== -1) {
            previousId = queueIds[queuePosition - 1] || '';
            nextId = queueIds[queuePosition + 1] || '';
            return;
        }
        // A confirmed decision can remove the open request from the active filter.
        // Preserve its surviving neighbours so reviewing can continue safely.
        const oldPosition = previousQueue.indexOf(activeId);
        if (oldPosition !== -1) {
            const remaining = new Set(queueIds);
            previousId = previousQueue.slice(0, oldPosition).reverse().find(id => remaining.has(id)) || '';
            nextId = previousQueue.slice(oldPosition + 1).find(id => remaining.has(id)) || '';
        } else {
            previousId = queueIds.includes(previousId) ? previousId : '';
            nextId = queueIds.includes(nextId) ? nextId : '';
        }
    }

    function setQueue(records) {
        const previousQueue = queueIds;
        queueIds = isAdmin() && Array.isArray(records)
            ? [...new Set(records.filter(item => item && item.id !== undefined && item.id !== null)
                .map(item => String(item.id)).filter(Boolean))] : [];
        reconcile(previousQueue);
        renderNavigation();
    }

    function navigationPosition() {
        if (queuePosition !== -1) return `${queuePosition + 1} / ${queueIds.length}`;
        return queueIds.length
            ? `${text('Di luar filter', 'Outside this filter')} · ${queueIds.length} ${text('dalam antrean', 'in queue')}`
            : text('Antrean ini kosong', 'This queue is empty');
    }

    function renderNavigation() {
        const heading = modal()?.querySelector('.case-detail-heading');
        if (!heading) return;
        let nav = document.getElementById('case-review-navigation');
        if (!isAdmin() || !activeId) { nav?.remove(); return; }
        if (!nav) {
            nav = document.createElement('nav');
            nav.id = 'case-review-navigation';
            nav.className = 'case-review-navigation';
            const previous = document.createElement('button');
            previous.type = 'button'; previous.id = 'case-review-prev'; previous.className = 'btn-secondary';
            previous.addEventListener('click', () => navigate(-1));
            const position = document.createElement('span');
            position.id = 'case-review-position'; position.setAttribute('aria-live', 'polite'); position.setAttribute('aria-atomic', 'true');
            const next = document.createElement('button');
            next.type = 'button'; next.id = 'case-review-next'; next.className = 'btn-secondary';
            next.addEventListener('click', () => navigate(1));
            nav.append(previous, position, next); heading.append(nav);
        }
        nav.setAttribute('aria-label', text('Navigasi pengajuan dalam antrean aktif', 'Requests in the active review queue'));
        const previous = nav.querySelector('#case-review-prev'), next = nav.querySelector('#case-review-next');
        previous.textContent = text('Sebelumnya', 'Previous');
        next.textContent = text('Berikutnya', 'Next');
        previous.setAttribute('aria-label', text('Pengajuan sebelumnya dalam antrean', 'Previous request in the queue'));
        next.setAttribute('aria-label', text('Pengajuan berikutnya dalam antrean', 'Next request in the queue'));
        previous.disabled = !previousId || busy(); next.disabled = !nextId || busy();
        nav.querySelector('#case-review-position').textContent = navigationPosition();
    }

    function navigate(direction) {
        if (!isAdmin() || !isOpen() || ![-1, 1].includes(direction) || busy()) return false;
        const id = direction === -1 ? previousId : nextId;
        if (!id || !queueIds.includes(id)) return false;
        const records = readStoredJSON(sessionStorage, 'ipcos_registrations', []);
        if (!Array.isArray(records) || !records.some(item => String(item.id) === id)) {
            showToast(text('Pengajuan berubah. Segarkan antrean sebelum melanjutkan.', 'The request changed. Refresh the queue before continuing.'), 'error');
            return false;
        }
        // openCaseDetail owns the unsent-input confirmation. Do not prompt twice.
        openCaseDetail(id);
        return selectedCaseId === id;
    }

    function opened(item, options = {}) {
        const heading = modal()?.querySelector('.case-detail-heading');
        if (!heading || !item || !['admin', 'mhs'].includes(currentUser?.role)
            || (currentUser.role === 'mhs' && String(item.nim) !== String(currentUser.nim))) return;
        const previousQueue = queueIds.slice();
        const changed = activeId !== String(item.id);
        activeId = String(item.id);
        if (changed) { previousId = ''; nextId = ''; }
        reconcile(previousQueue);
        let identity = document.getElementById('case-review-identity');
        if (!identity) { identity = document.createElement('div'); identity.id = 'case-review-identity'; identity.className = 'case-review-identity'; heading.append(identity); }
        identity.replaceChildren();
        const type = document.createElement('strong'); type.textContent = systemText(item.jenis || text('Pengajuan', 'Request'));
        const detail = document.createElement('span');
        detail.textContent = [isAdmin() ? [item.nama, item.nim].filter(Boolean).join(' · ') : '', `${text('Nomor', 'ID')} ${String(item.id)}`].filter(Boolean).join(' · ');
        const keyboardIdentity = document.createElement('small');
        keyboardIdentity.className = 'case-review-keyboard-identity';
        keyboardIdentity.textContent = [isAdmin() ? String(item.nim || '') : '', `${text('Nomor', 'ID')} ${String(item.id)}`].filter(Boolean).join(' · ');
        identity.append(type, detail, keyboardIdentity); renderNavigation();
        if (changed && !options.languageRefresh) {
            modal().querySelector('.case-detail-card').scrollTop = 0;
            const content = document.getElementById('case-detail-content');
            if (content) content.scrollTop = 0;
        }
        actionsChanged();
        updateKeyboardState();
    }

    function restoreActions() {
        if (movedActionRow) {
            if (actionMarker?.isConnected && actionMarker.parentNode?.isConnected) actionMarker.replaceWith(movedActionRow);
            else movedActionRow.remove();
        }
        actionMarker?.remove();
        movedActionRow = null; actionMarker = null;
        document.getElementById('case-review-action-footer')?.remove();
    }

    function actionsChanged() {
        renderNavigation();
        const card = modal()?.querySelector('.case-detail-card');
        if (!card || !isOpen() || !['admin', 'mhs'].includes(currentUser?.role)) { restoreActions(); return; }
        const panel = document.getElementById('case-action-panel');
        const panelActive = panel && !panel.hidden;
        // The current row may already be in the footer. Keep its nodes and focus
        // intact when only a busy flag or button text has changed.
        const desired = panelActive
            ? panel.querySelector(':scope > .button-row') || (actionMarker?.parentNode === panel ? movedActionRow : null)
            : document.getElementById('case-detail-actions');
        const existingFooter = document.getElementById('case-review-action-footer');
        if (desired === movedActionRow && existingFooter?.isConnected && actionMarker?.isConnected) {
            existingFooter.setAttribute('aria-label', text('Tindakan pengajuan', 'Request actions'));
            return;
        }
        const focused = movedActionRow?.contains(document.activeElement) ? document.activeElement : desired?.contains(document.activeElement) ? document.activeElement : null;
        restoreActions();
        const row = panelActive ? panel.querySelector(':scope > .button-row') : document.getElementById('case-detail-actions');
        if (!row || row.hidden || !row.querySelector('button')) return;
        actionMarker = document.createComment('IPCOS review action row');
        row.before(actionMarker);
        movedActionRow = row;
        const footer = document.createElement('div');
        footer.id = 'case-review-action-footer'; footer.className = 'case-review-action-footer';
        footer.setAttribute('role', 'group'); footer.setAttribute('aria-label', text('Tindakan pengajuan', 'Request actions'));
        footer.append(row); card.append(footer);
        if (focused?.isConnected && !focused.disabled) focused.focus({preventScroll: true});
    }

    function statusHtml(item, options = {}) {
        if (!item || !['admin', 'mhs'].includes(currentUser?.role)
            || (currentUser.role === 'mhs' && String(item.nim) !== String(currentUser.nim))) return '';
        const status = String(item.status || '').trim().toLowerCase();
        const studentActs = ['revision', 'accepted'].includes(status);
        const ownAction = studentActs ? currentUser.role === 'mhs' : isAdmin();
        const owner = ownAction ? text('Anda', 'You') : studentActs ? text('Mahasiswa', 'Student') : 'Admin';
        const wait = caseWaiting(item);
        const timing = wait ? `<details class="request-state-details"><summary>${escape(text('Rincian waktu', 'Timing details'))}${wait.overdue ? `<span class="request-state-attention">${escape(text('Perlu perhatian', 'Needs attention'))}</span>` : ''}</summary>${waitingHtml(item)}</details>` : '';
        return `<section class="request-state${options.compact ? ' request-state-compact' : ''}" aria-label="${escape(text('Status dan langkah pengajuan', 'Request status and next step'))}">
            <div class="request-state-heading">${getStatusBadge(item.status)}<span class="request-state-owner">${escape(status === 'accepted' ? text('Tahap selanjutnya', 'Next stage') : text('Tindakan berikutnya', 'Next action'))}: <strong>${escape(owner)}</strong></span></div>
            <p class="request-state-next">${escape(caseNextStep(item))}</p>${timing}</section>`;
    }

    function updateKeyboardState() {
        const viewport = window.visualViewport;
        if (!viewport || !isOpen()) return;
        modal().style.setProperty('--review-viewport-height',viewport.height+'px');
        const input = document.activeElement;
        const typing = input && modal().contains(input) && input.matches('input,textarea,select,[contenteditable="true"]');
        // Release sticky controls while a software keyboard uses most of the screen.
        modal().classList.toggle('case-keyboard-open', !!typing && viewport.height < innerHeight * .75);
    }
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateKeyboardState, {passive: true});
        document.addEventListener('focusin', updateKeyboardState);
        document.addEventListener('focusout', () => requestAnimationFrame(updateKeyboardState));
    }

    function reset() {
        restoreActions();
        queueIds = []; activeId = ''; previousId = ''; nextId = ''; queuePosition = -1;
        document.getElementById('case-review-navigation')?.remove();
        document.getElementById('case-review-identity')?.remove();
        modal()?.classList.remove('case-keyboard-open');
    }
    window.IPCOSReview = Object.freeze({setQueue, opened, navigate, statusHtml, restoreActions, actionsChanged, reset});
})();
