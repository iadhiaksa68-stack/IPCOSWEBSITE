/* Workspace presentation only: the existing session, API and data remain authoritative. */
(() => {
    'use strict';
    const scrollPositions = new Map();
    let activeTab = 'dashboard', drawerTrigger = null, operation = null;
    const mobile = () => matchMedia('(max-width:850px)').matches;
    const authenticated = () => ['mhs','admin'].includes(currentUser.role) && !!getSessionToken();
    const text = (id,en) => uxText(id,en);
    const icon = name => {
        const paths = { home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>', requests:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>', sop:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/><path d="M12 5v15"/>', menu:'<path d="M4 6h16M4 12h16M4 18h16"/>' };
        return '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</svg>';
    };
    function setup() {
        const utilities = document.querySelector('.workspace-utilities'), header = document.getElementById('student-header');
        const profile = document.createElement('details'); profile.id = 'workspace-profile'; profile.className = 'workspace-profile'; profile.hidden = true;
        profile.innerHTML = '<summary><span id="profile-initials" class="profile-initials" aria-hidden="true"></span><span id="profile-summary-name"></span><span class="profile-chevron" aria-hidden="true"></span></summary>';
        utilities.appendChild(profile); profile.appendChild(header);
        const bottom = document.createElement('nav'); bottom.id = 'student-bottom-nav'; bottom.hidden = true;
        const items = [['dashboard','home','Beranda','Home'],['student-status','requests','Pengajuan','Requests'],['sop-magang','sop','SOP','SOP'],['menu','menu','Menu','Menu']];
        bottom.innerHTML = items.map(([target,name,id,en]) => '<button type="button" data-bottom-target="'+target+'">'+icon(name)+'<span data-label-id="'+id+'" data-label-en="'+en+'">'+text(id,en)+'</span></button>').join('');
        bottom.addEventListener('click', event => { const button = event.target.closest('[data-bottom-target]'); if (!button) return; if (button.dataset.bottomTarget === 'menu') toggleSidebar(); else if (button.dataset.bottomTarget === 'sop-magang') window.IPCOSPolish?.openSopPicker(); else navigate(button.dataset.bottomTarget); });
        document.body.appendChild(bottom);
        const backdrop = document.createElement('button'); backdrop.id = 'nav-backdrop'; backdrop.type = 'button'; backdrop.hidden = true; backdrop.tabIndex = -1; backdrop.addEventListener('click', () => { document.getElementById('main-sidebar').classList.remove('active'); drawerChanged(); }); document.body.appendChild(backdrop);
        document.addEventListener('click', event => { if (profile.open && !profile.contains(event.target)) profile.open = false; });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && profile.open) { event.preventDefault(); profile.open = false; profile.querySelector('summary').focus(); }
            const sidebar = document.getElementById('main-sidebar');
            if (!mobile() || !sidebar.classList.contains('active')) return;
            if (event.key === 'Escape') { event.preventDefault(); sidebar.classList.remove('active'); drawerChanged(); }
            if (event.key !== 'Tab') return;
            const controls = [...sidebar.querySelectorAll('.nav-item,summary,button')].filter(el => el.getClientRects().length && !el.disabled);
            if (!controls.length) return;
            const first = controls[0], last = controls.at(-1);
            if (!sidebar.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
            else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
        addEventListener('resize', drawerChanged);
        // A modal opened by a known operation can be its original feedback destination.
        document.addEventListener('submit', event => { const scope = event.target.closest('.tab-content,.overlay,.overlay-dialog'); if (scope && scope.id !== 'welcome-modal') operation = {scope,epoch:sessionEpoch}; }, true);
        refresh();
    }
    function refresh() {
        const auth = authenticated(); document.body.classList.toggle('workspace-authenticated',auth);
        for (const selector of ['#main-workspace','#main-sidebar','.mobile-nav-toggle','#wa-float-btn']) {
            const node = document.querySelector(selector); if (node) node.inert = !auth;
        }
        const profile = document.getElementById('workspace-profile'); profile.hidden = !auth;
        if (auth) {
            const name = String(currentUser.nama || text('Akun','Account'));
            document.getElementById('profile-summary-name').textContent = name.split(/\s+/)[0];
            profile.querySelector('summary').setAttribute('aria-label',text('Profil dan tindakan akun: ','Profile and account actions: ')+name);
            document.getElementById('profile-initials').textContent = name.split(/\s+/).slice(0,2).map(word=>Array.from(word)[0] || '').join('').toUpperCase();
            document.getElementById('display-greeting').textContent = name;
        } else {
            profile.open = false;
            profile.querySelector('summary').setAttribute('aria-label',text('Profil dan tindakan akun','Profile and account actions'));
            document.getElementById('profile-summary-name').textContent = '';
            document.getElementById('profile-initials').textContent = '';
            document.getElementById('display-greeting').textContent = '';
            document.getElementById('header-subtext').textContent = '';
        }
        document.getElementById('student-bottom-nav').hidden = !auth || currentUser.role !== 'mhs';
        document.getElementById('student-bottom-nav').setAttribute('aria-label',text('Navigasi mahasiswa','Student navigation'));
        document.querySelector('[data-nav-group="management"]').closest('.nav-group').hidden = !auth || currentUser.role !== 'admin';
        document.getElementById('nav-backdrop').setAttribute('aria-label',text('Tutup menu','Close menu'));
        document.querySelectorAll('[data-label-id]').forEach(el=>el.textContent=el.dataset[currentLang === 'en' ? 'labelEn' : 'labelId']);
        document.querySelector('.mobile-nav-toggle').setAttribute('aria-label',text('Buka menu navigasi','Open navigation menu'));
        document.getElementById('btn-toggle-sidebar').setAttribute('aria-label',text('Tampilkan atau sembunyikan menu','Show or hide menu'));
        const invalid = document.querySelector('#registration-fields [aria-invalid="true"]');
        if (!invalid && document.getElementById('registration-actions')) document.getElementById('registration-actions').dataset.invalid = 'false';
        updateSelection(); drawerChanged();
    }
    function updateSelection() {
        document.querySelectorAll('.nav-item[data-nav-target]').forEach(item => {
            const active = item.dataset.navTarget === activeTab;
            if (active) { item.setAttribute('aria-current','page'); const group = item.closest('details[data-nav-group]'); if (group) group.open = true; }
            else item.removeAttribute('aria-current');
        });
        document.querySelectorAll('#student-bottom-nav button').forEach(button => {
            const target = button.dataset.bottomTarget;
            const active = target === activeTab || target === 'student-status' && activeTab === 'pendaftaran' || target === 'sop-magang' && ['sop-magang','sop-tugas-akhir','remidial'].includes(activeTab);
            button.classList.toggle('active',active);
            if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
        });
    }
    function beforeTab(tab) { if (tab !== activeTab) scrollPositions.set(activeTab,scrollY); }
    function tabChanged(tab) {
        const changed = tab !== activeTab; activeTab = tab;
        document.getElementById('workspace-profile').open = false;
        refresh();
        if (changed && authenticated()) requestAnimationFrame(() => { if (activeTab === tab) scrollTo({top:scrollPositions.get(tab) || 0,behavior:'instant'}); });
    }
    function navigate(tab) { if (authenticated()) switchTab(null,tab); }
    function drawerChanged() {
        const sidebar = document.getElementById('main-sidebar'), open = authenticated() && mobile() && sidebar.classList.contains('active');
        const backdrop = document.getElementById('nav-backdrop'); if (!backdrop) return;
        const previouslyOpen = !backdrop.hidden; backdrop.hidden = !open;
        document.body.classList.toggle('nav-drawer-open',open);
        document.getElementById('main-workspace').inert = !authenticated() || open;
        document.getElementById('student-bottom-nav').inert = !authenticated() || open;
        document.querySelectorAll('.mobile-nav-toggle,[data-bottom-target="menu"]').forEach(button => button.setAttribute('aria-expanded',String(open)));
        document.querySelector('[data-bottom-target="menu"]').setAttribute('aria-controls','main-sidebar');
        document.getElementById('btn-toggle-sidebar').setAttribute('aria-expanded',String(!sidebar.classList.contains('collapsed')));
        sidebar.inert = !authenticated() || mobile() ? !open : sidebar.classList.contains('collapsed');
        if (open && !previouslyOpen) { drawerTrigger = document.activeElement; sidebar.querySelector('.nav-item:not([style*="none"])')?.focus(); }
        if (!open && previouslyOpen) {
            const canFocus = el => el?.isConnected && el.getClientRects().length && !el.closest('[hidden],[inert]');
            const target = canFocus(drawerTrigger) ? drawerTrigger : document.getElementById('btn-toggle-sidebar');
            if (canFocus(target)) target.focus();
        }
        if (!mobile()) sidebar.classList.remove('active');
    }
    function beginOperation(message) {
        if (!authenticated()) return false;
        const overlay = [...document.querySelectorAll('.overlay,.overlay-dialog')].reverse().find(el => el.id !== 'welcome-modal' && getComputedStyle(el).display !== 'none');
        const scope = overlay || document.querySelector('.tab-content.active');
        if (!scope) return false;
        operation = {scope,epoch:sessionEpoch}; feedback(message || text('Memproses. Tunggu konfirmasi sistem…','Processing. Waiting for system confirmation…'),'busy',scope);
        return true;
    }
    function feedback(message,type='success',scope=null) {
        if (!authenticated()) return;
        const visible = candidate => candidate?.isConnected && getComputedStyle(candidate).display !== 'none' && candidate.getClientRects().length;
        scope ||= operation?.epoch === sessionEpoch && visible(operation.scope) ? operation.scope : document.querySelector('.tab-content.active');
        if (!scope || scope.id === 'welcome-modal') return;
        // Specialized editors already provide persistent messages beside the current action.
        if (scope.id === 'modal-sop-editor' || scope.id === 'modal-case-detail' && document.getElementById('case-action-feedback')?.textContent) return;
        let box = scope.querySelector(':scope .operation-feedback');
        if (!box) {
            box = document.createElement('p'); box.className = 'operation-feedback'; box.setAttribute('role','status'); box.setAttribute('aria-live','polite');
            const destination = scope.id === 'modal-case-detail' ? document.getElementById('case-detail-content') : scope.querySelector('.modal-card') || scope;
            destination.appendChild(box);
        }
        box.textContent = systemText(message); box.dataset.state = type; box.hidden = false;
        bindLanguageBlock(box);
    }
    function finishOperation() { if (operation?.epoch === sessionEpoch) { const box = operation.scope.querySelector('.operation-feedback[data-state="busy"]'); if (box) box.hidden = true; } }
    function reset() {
        operation = null; scrollPositions.clear(); activeTab = 'dashboard';
        document.querySelectorAll('.operation-feedback').forEach(box=>box.remove());
        document.querySelectorAll('details[data-nav-group]').forEach(group=>group.open=false);
        document.getElementById('main-sidebar').classList.remove('active'); refresh();
    }
    window.IPCOSExperience = {refresh,navigate,beforeTab,tabChanged,drawerChanged,beginOperation,finishOperation,feedback,reset};
    setup();
})();
