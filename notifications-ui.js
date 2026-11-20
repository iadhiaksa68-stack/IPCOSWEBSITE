/* Notifications reflect the current authorized snapshot, never an invented event history. */
(() => {
    'use strict';
    let owner = '', query = '', filter = 'all', readFilter = 'all', items = [], eligible = [], signatures = new WeakMap(), readerOrigin = null;
    let undo = null, undoTimer = 0;
    const el = id => document.getElementById(id), t = (id,en) => uxText(id,en);
    const authorized = () => !!getSessionToken() && ['mhs','admin'].includes(currentUser.role);
    const identity = () => `${sessionEpoch}:${currentUser.role}:${String(currentUser.nim || '').trim()}`;
    const normalized = value => String(value || '').normalize('NFKD').toLowerCase().replace(/\s+/g,' ').trim();
    const collapse = value => String(value || '').replace(/\s+/g,' ').trim();
    const text = (id,value) => { const node=el(id); if(node && node.textContent!==value)node.textContent=value; };
    // Authored notices are Indonesian; the English interface marks them so screen readers switch voice.
    const authoredLang = () => currentLang === 'id' ? '' : ' lang="id"';
    function keyForAnnouncement(ann) {
        const id=String(ann.Id || ann.id || '').trim();
        return notificationHash(`announcement:${id || JSON.stringify([ann.date || ann.Tanggal || '',ann.Pesan || ann.message || '',ann.Tipe || ann.type || ''])}`);
    }
    /* ---------- Notice details: KontenWeb "notice_meta", keyed by the announcement text ---------- */
    const noticeKey = body => notificationHash('notice:' + collapse(body));
    function noticeStore() {
        let saved = contentCacheFallback.get('notice_meta');
        if (!saved) { try { saved = localStorage.getItem('ipcos_content_notice_meta'); } catch (_) {} }
        try { const doc = JSON.parse(saved || 'null'); if (doc && doc.schema === 1 && doc.notices && typeof doc.notices === 'object' && !Array.isArray(doc.notices)) return doc.notices; } catch (_) {}
        return {};
    }
    function noticeDetails(body, store = noticeStore()) {
        const meta = store[noticeKey(body)];
        if (!meta || typeof meta !== 'object') return {subject:'', service:'', expires:'', archived:false};
        return {subject: typeof meta.subject === 'string' ? collapse(meta.subject).slice(0,80) : '', service: SERVICE_TYPES.includes(meta.service) ? meta.service : '', expires: /^\d{4}-\d{2}-\d{2}$/.test(meta.expires || '') ? meta.expires : '', archived: meta.archived === true};
    }
    // A notice valid until 10 Dec stays active through 23:59 WIB (UTC+7) that day.
    const todayWib = () => new Date(Date.now() + 25200000).toISOString().slice(0,10);
    const inactive = details => details.archived || (!!details.expires && details.expires < todayWib());
    function noticeActive(ann) { return !inactive(noticeDetails(String(ann?.Pesan || ann?.message || ''))); }
    // Older notices have no subject: the first sentence (or a short excerpt) becomes the row title.
    function derivedSubject(body) {
        const clean = collapse(body), sentence = clean.match(/^(.{8,90}?[.!?:])(?=\s|$)/)?.[1];
        if (sentence) return {subject: sentence.replace(/[.:]$/,''), rest: clean.slice(sentence.length).trim()};
        if (clean.length <= 80) return {subject: clean, rest: ''};
        return {subject: (clean.slice(0,80).replace(/\s+\S*$/,'') || clean.slice(0,80)) + '…', rest: clean};
    }
    function eventDate(rec){
        let logs=[];try{logs=JSON.parse(rec.note || '[]');}catch(_){}
        return [rec.date,...(Array.isArray(logs)?logs.map(log=>log?.time):[])].filter(value=>value&&Number.isFinite(displayDate(value).getTime())).sort((a,b)=>displayDate(b).getTime()-displayDate(a).getTime())[0] || '';
    }
    function readSet(){
        const read=new Set(getReadNotificationIds()),counts=new Map();for(const item of items)if(item.legacyKey)counts.set(item.legacyKey,(counts.get(item.legacyKey)||0)+1);
        for(const item of items)if(item.legacyKey&&counts.get(item.legacyKey)===1&&read.has(item.legacyKey))read.add(item.key);
        return read;
    }
    function collect() {
        const records = readStoredJSON(sessionStorage,'ipcos_registrations',[]), list=[], student=currentUser.role==='mhs';
        if(Array.isArray(records))for(const rec of records){
            const status=String(rec.status || '').trim().toLowerCase();
            if(!rec.id || (student && !isStudentOwner(rec)) || !(student?['revision','accepted']:['pending','resubmitted']).includes(status))continue;
            const date=eventDate(rec), service=systemText(rec.jenis);
            // The subject names the work: what the student must fix, or what the admin must review.
            const subject=student?(status==='revision'?t(`Perbaiki pengajuan ${service}`,`Correct your ${service} request`):t(`${service} disetujui`,`${service} approved`)):(status==='resubmitted'?t(`Periksa perbaikan ${service}`,`Review corrections: ${service}`):t(`Periksa pengajuan ${service}`,`Review the ${service} request`));
            list.push({key:notificationHash(`${rec.id}:${status}:${date}`),caseId:String(rec.id),date,type:status,subject,excerpt:(student?'':`${rec.nama || ''} · `)+caseNextStep(rec),tab:student?'student-status':'admin-data',search:[rec.id,rec.nim,rec.nama,rec.jenis,status,'pengajuan request',status==='revision'?'revisi corrections':''].join(' ')});
        }
        const announcements=readStoredJSON(sessionStorage,'ipcos_announcements',[]), store=noticeStore();
        if(Array.isArray(announcements))for(const ann of announcements){
            const body=String(ann.Pesan || ann.message || '').trim(); if(!body)continue;
            const details=noticeDetails(body,store), derived=derivedSubject(body), off=inactive(details);
            list.push({key:keyForAnnouncement(ann),legacyKey:notificationHash(`announcement:${ann.Id || ann.date || ann.Tanggal || ann.Pesan || ann.message}`),date:ann.date || ann.Tanggal || '',type:'broadcast',subject:details.subject||derived.subject,excerpt:details.subject?collapse(body):derived.rest,body,service:details.service,expires:details.expires,archived:details.archived,inactive:off,important:!off&&String(ann.Tipe || ann.type || '').toLowerCase()==='important',search:'pengumuman announcement broadcast '+details.service});
        }
        const unique=[...new Map(list.map(item=>[item.key,item])).values()];
        return unique.sort((a,b)=>{const at=displayDate(a.date).getTime(),bt=displayDate(b.date).getTime();return (Number.isFinite(bt)?bt:0)-(Number.isFinite(at)?at:0);});
    }
    function restoreList(container,html) {
        if(!container || signatures.get(container)===html)return;
        const active=document.activeElement, row=active?.closest('[data-notification-key]');
        const focus=row&&container.contains(row)?{key:row.dataset.notificationKey,action:active.dataset.notificationAction}:null;
        const menus=new Set([...container.querySelectorAll('details[open]')].map(node=>node.closest('[data-notification-key]')?.dataset.notificationKey));
        const scroll=container.scrollTop;container.innerHTML=html;signatures.set(container,html);container.scrollTop=scroll;
        // Row menus stay open across a refresh, so a focused read toggle is still reachable.
        container.querySelectorAll('[data-notification-key]').forEach(node=>{if(menus.has(node.dataset.notificationKey)){const menu=node.querySelector('details');if(menu)menu.open=true;}});
        if(focus){const match=[...container.querySelectorAll('[data-notification-key]')].find(node=>node.dataset.notificationKey===focus.key);const target=match?.querySelector(`[data-notification-action="${focus.action || 'open'}"]`);if(target)target.focus({preventScroll:true});else el('notification-search')?.focus({preventScroll:true});}
    }
    function shortDate(value){
        const date=displayDate(value);if(!value||!Number.isFinite(date.getTime()))return t('Tanggal tidak tersedia','Date unavailable');
        const zone={timeZone:'Asia/Jakarta'},year=options=>date.toLocaleDateString('en-GB',{...zone,year:'numeric',...options});
        const sameYear=year()===new Date().toLocaleDateString('en-GB',{...zone,year:'numeric'});
        return date.toLocaleDateString(currentLang==='id'?'id-ID':'en-GB',{...zone,day:'numeric',month:'short',...(sameYear?{}:{year:'numeric'})});
    }
    function fullDate(item){return Number.isFinite(displayDate(item.date).getTime())&&item.date?formatDateTime(item.date):t('Tanggal tidak tersedia','Date unavailable');}
    function stateLabel(item,isRead){return item.inactive?(item.archived?t('Diarsipkan','Archived'):t('Kedaluwarsa','Expired')):isRead?t('Dibaca','Read'):t('Belum dibaca','Unread');}
    function row(item,read,compact=false){
        const safe=escapeHtml, isRead=read.has(item.key), lang=item.type==='broadcast'?authoredLang():'';
        const kind=item.type==='broadcast'?t('Pengumuman','Announcement'):t('Pengajuan','Request');
        const meta=[stateLabel(item,isRead),kind,item.service?systemText(item.service):'',item.important?t('Penting','Important'):''].filter(Boolean).map((value,index)=>`<span${index?'':' class="notification-state"'}>${safe(value)}</span>`).join('');
        const valid=item.date&&Number.isFinite(displayDate(item.date).getTime());
        const date=`<time class="notification-date"${valid?` datetime="${safe(displayDate(item.date).toISOString())}"`:''}>${safe(shortDate(item.date))}</time>`;
        if(compact)return `<div class="notification-preview ${isRead?'is-read':'is-unread'}" data-preserve-case data-notification-key="${safe(item.key)}"><button type="button" class="notif-item" data-notification-action="open"><span class="notification-meta"><span class="notification-labels">${meta}</span>${date}</span><strong${lang}>${safe(item.subject)}</strong>${item.excerpt?`<span class="notification-preview-body"${lang}>${safe(item.excerpt)}</span>`:''}</button></div>`;
        return `<li class="notification-row ${isRead?'is-read':'is-unread'}${item.inactive?' is-inactive':''}" data-preserve-case data-notification-key="${safe(item.key)}"><div class="notification-row-meta"><span class="notification-labels">${meta}</span>${date}</div><button type="button" class="notification-subject" data-notification-action="open"><span${lang}>${safe(item.subject)}</span><span class="notification-chevron" aria-hidden="true">›</span></button>${item.excerpt?`<p class="notification-excerpt"${lang}>${safe(item.excerpt)}</p>`:''}<details class="notification-row-menu"><summary aria-label="${safe(t('Opsi notifikasi: ','Notification options: ')+item.subject)}"><span aria-hidden="true">⋯</span></summary><div class="notification-row-menu-panel"><button type="button" data-notification-action="read">${safe(isRead?t('Tandai Belum Dibaca','Mark Unread'):t('Tandai Dibaca','Mark Read'))}</button></div></details></li>`;
    }
    function labels(){
        text('notifications-title',t('Pusat Notifikasi','Notification Center'));
        text('notification-search-label',t('Cari Notifikasi','Search Notifications'));
        el('notification-search').placeholder=t('Cari notifikasi…','Search notifications…');
        text('notification-filter-label',t('Jenis notifikasi','Notification type'));
        const names={all:t('Semua jenis','All types'),requests:t('Pengajuan','Requests'),announcements:t('Pengumuman','Announcements'),archive:t('Arsip','Archive')};
        for(const option of el('notification-filter').options)option.textContent=names[option.value];
        el('notification-read-filter').setAttribute('aria-label',t('Status baca','Read state'));
        document.querySelectorAll('[data-read-filter]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.readFilter===readFilter));const value=button.dataset.readFilter==='all'?t('Semua','All'):t('Belum Dibaca','Unread');if(button.textContent!==value)button.textContent=value;});
        text('notification-more-summary',t('Lainnya','More'));
        text('notification-reset',t('Atur Ulang Filter','Reset Filters'));
        text('notification-refresh-retry',t('Coba Lagi','Try Again'));
        text('notification-undo-button',t('Urungkan','Undo'));
        text('notification-view-all',t('Lihat Semua Notifikasi','View All Notifications'));
        text('notification-preview-title',t('Notifikasi Terbaru','Latest Notifications'));
        document.querySelector('.notification-toggle')?.setAttribute('aria-label',t('Buka Pusat Notifikasi','Open Notification Center'));
        text('notification-reader-close',t('Tutup','Close'));
    }
    function fillReader(item){
        const reader=el('modal-notification-announcement'),lang=currentLang==='id'?null:'id';
        text('notification-reader-kind',[t('Pengumuman','Announcement'),item.service?systemText(item.service):'',item.expires?t(`Berlaku sampai ${formatDate(item.expires)}`,`Valid until ${formatDate(item.expires)}`):'',item.inactive?stateLabel(item,true):''].filter(Boolean).join(' · '));
        text('notification-reader-title',item.subject);text('notification-reader-body',item.body);text('notification-reader-date',fullDate(item));
        for(const id of ['notification-reader-title','notification-reader-body']){if(lang)el(id).setAttribute('lang',lang);else el(id).removeAttribute('lang');}
        reader.dataset.key=item.key;
    }
    function render(){
        if(!authorized()){reset();return;}
        const nextOwner=identity();if(owner!==nextOwner){reset();owner=nextOwner;}
        labels();items=collect();
        const active=items.filter(item=>!item.inactive);currentNotificationIds=active.map(item=>item.key);
        const read=readSet(),unread=active.filter(item=>!read.has(item.key)).length;
        const badge=el('notif-badge');badge.textContent=String(unread);badge.style.display=unread?'flex':'none';
        text('notification-summary',unread?t(`${unread} belum dibaca`,`${unread} unread`):t('Semua sudah dibaca','All caught up'));
        const terms=normalized(query).split(' ').filter(Boolean),filtered=!!query||filter!=='all'||readFilter!=='all';
        const inView=item=>filter==='archive'?item.inactive:!item.inactive&&(filter==='all'||(filter==='requests')===(item.type!=='broadcast'));
        const selected=items.filter(item=>inView(item)&&(readFilter!=='unread'||!read.has(item.key))&&terms.every(term=>normalized(`${item.subject} ${item.excerpt} ${item.body || ''} ${item.search}`).includes(term)));
        eligible=selected.filter(item=>!item.inactive&&!read.has(item.key)).map(item=>item.key);
        const count=el('notification-result-count');text('notification-result-count',t(`${selected.length} notifikasi ditampilkan`,`${selected.length} notifications shown`));count.classList.toggle('sr-only',!filtered);
        el('notification-reset').hidden=!filtered;
        const markAll=el('notification-mark-all');markAll.disabled=!eligible.length;
        text('notification-mark-all',filtered?t(`Tandai Hasil Ini Dibaca (${eligible.length})`,`Mark These Results Read (${eligible.length})`):t(`Tandai Semua Dibaca (${eligible.length})`,`Mark All Read (${eligible.length})`));
        restoreList(el('notification-center-list'),selected.map(item=>row(item,read)).join(''));
        const failed=syncPhase==='error'&&!isOffline;
        el('notification-refresh-error').hidden=!failed;
        text('notification-refresh-text',failed?(items.length?t('Pembaruan gagal. Notifikasi terakhir tetap ditampilkan.','Update failed. The last loaded notifications are still shown.'):t('Notifikasi belum dapat dimuat.','Notifications could not be loaded.')):'');
        const empty=el('notification-empty');empty.hidden=!!selected.length||failed&&!items.length;
        const state=filter==='archive'&&!query&&readFilter==='all'?'archive':filtered?'nomatch':!items.length?'none':'expired';
        text('notification-empty-title',{archive:t('Arsip masih kosong','The archive is empty'),nomatch:t('Tidak ada hasil yang sesuai','No matching notifications'),none:t('Belum ada notifikasi','No notifications yet'),expired:t('Tidak ada notifikasi aktif','No active notifications')}[state]);
        text('notification-empty-text',{archive:t('Pengumuman yang kedaluwarsa atau diarsipkan tampil di sini dan tetap dapat dicari.','Expired or archived notices appear here and stay searchable.'),nomatch:t('Ubah pencarian, atau pilih Atur Ulang Filter untuk melihat semua notifikasi.','Change the search, or choose Reset Filters to see every notification.'),none:t('Pembaruan pengajuan dan pengumuman akan tampil di sini saat tersedia.','Request updates and announcements will appear here when available.'),expired:t('Pengumuman lama tersimpan di Arsip.','Older notices are kept in the Archive.')}[state]);
        restoreList(el('notif-list-container'),active.length?active.slice(0,6).map(item=>row(item,read,true)).join(''):`<p class="notification-preview-empty">${escapeHtml(t('Belum ada notifikasi.','No notifications yet.'))}</p>`);
        const reader=el('modal-notification-announcement');
        if(reader.style.display==='flex' && reader.dataset.key){const item=items.find(item=>item.key===reader.dataset.key&&item.type==='broadcast');if(!item)closeModal(reader.id,true);else fillReader(item);}
        renderUndo();window.IPCOSNoticeAdmin?.render();
    }
    function renderUndo(){
        const box=el('notification-undo');if(!box)return;
        box.hidden=!undo||undo.owner!==owner;
        text('notification-undo-text',undo?t(`${undo.keys.length} notifikasi ditandai dibaca.`,`${undo.keys.length} notifications marked read.`):'');
    }
    function mark(key){
        const ids=getReadNotificationIds();if(!ids.includes(key))saveReadNotificationIds([...ids,key]);render();
    }
    // Marks only what the current view shows; Undo restores exactly those rows for a short time.
    function markVisible(){
        if(!authorized()||!eligible.length)return false;
        const keys=[...eligible];saveReadNotificationIds([...getReadNotificationIds(),...keys]);
        undo={keys,owner};clearTimeout(undoTimer);undoTimer=setTimeout(()=>{undo=null;renderUndo();},10000);
        el('notification-more').open=false;render();el('notification-undo-button').focus({preventScroll:true});return true;
    }
    function undoMark(){
        if(!undo||undo.owner!==owner)return;
        const keys=new Set(undo.keys);undo=null;clearTimeout(undoTimer);
        saveReadNotificationIds(getReadNotificationIds().filter(id=>!keys.has(id)));render();el('notification-more-summary').focus({preventScroll:true});
    }
    function toggleRead(key){
        const item=items.find(entry=>entry.key===key),wasRead=readSet().has(key),ids=getReadNotificationIds();
        const index=[...el('notification-center-list').querySelectorAll('[data-notification-key]')].findIndex(node=>node.dataset.notificationKey===key);
        saveReadNotificationIds(wasRead?ids.filter(id=>id!==key&&id!==item?.legacyKey):[...ids,key]);render();
        const rows=[...el('notification-center-list').querySelectorAll('[data-notification-key]')];
        if(index<0||rows.some(node=>node.dataset.notificationKey===key))return;
        // The row left an unread-only view: continue at the next result, or the reset control when none remain.
        const next=rows[Math.min(index,rows.length-1)]?.querySelector('[data-notification-action="open"]');
        (next||(!el('notification-reset').hidden&&el('notification-reset'))||el('notifications-title')).focus({preventScroll:true});
    }
    function open(key){
        if(!authorized())return false;
        const item=collect().find(entry=>entry.key===key);if(!item)return false;
        if(item.type==='broadcast'){
            const reader=el('modal-notification-announcement');
            readerOrigin={epoch:sessionEpoch,key:item.key,scope:document.activeElement?.closest('#notification-center-list')?'notification-center-list':'notif-list-container'};
            fillReader(item);
            clearTimeout(modalCloseTimers.get(reader.id));modalCloseTimers.delete(reader.id);
            el('notif-dropdown').style.display='none';reader.style.display='flex';reader.style.opacity='1';mark(key);return true;
        }
        if(!switchTab(null,item.tab))return false;
        const opened=openCaseDetail(item.caseId);if(opened===false)return false;
        el('notif-dropdown').style.display='none';mark(key);return true;
    }
    function visit(){
        if(!authorized()||!switchTab(null,'notifications'))return false;
        el('notif-dropdown').style.display='none';render();const epoch=sessionEpoch;
        const reveal=()=>{if(epoch!==sessionEpoch||!authorized()||!el('notifications').classList.contains('active'))return;el('notifications-title').focus({preventScroll:true});scrollTo({top:0,behavior:'instant'});};
        reveal();requestAnimationFrame(reveal);return true;
    }
    function reset(){
        owner='';query='';filter='all';readFilter='all';items=[];eligible=[];signatures=new WeakMap();readerOrigin=null;undo=null;clearTimeout(undoTimer);
        if(el('notification-search'))el('notification-search').value='';if(el('notification-filter'))el('notification-filter').value='all';
        document.querySelectorAll('[data-read-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.readFilter==='all')));
        for(const id of ['notification-center-list','notif-list-container','notification-summary','notification-result-count','notification-reader-body','notification-reader-date','notification-reader-kind','notification-undo-text','notification-refresh-text'])if(el(id))el(id).textContent='';
        for(const id of ['notification-empty','notification-reset','notification-undo','notification-refresh-error'])if(el(id))el(id).hidden=true;
        if(el('notification-more'))el('notification-more').open=false;
        const reader=el('modal-notification-announcement');if(reader){delete reader.dataset.key;closeModal(reader.id,true);}
        if(el('notif-badge')){el('notif-badge').textContent='';el('notif-badge').style.display='none';}
    }
    function setup(){
        new MutationObserver(()=>{const reader=el('modal-notification-announcement');if(reader.style.display!=='none'||!readerOrigin)return;const origin=readerOrigin;readerOrigin=null;if(origin.epoch!==sessionEpoch||!authorized())return;const node=[...el(origin.scope).querySelectorAll('[data-notification-key]')].find(row=>row.dataset.notificationKey===origin.key)?.querySelector('[data-notification-action="open"]');const target=node?.getClientRects().length?node:document.querySelector('.notification-toggle');target?.focus({preventScroll:true});}).observe(el('modal-notification-announcement'),{attributes:true,attributeFilter:['style']});
        el('notification-search').addEventListener('input',event=>{query=event.target.value;render();});
        el('notification-filter').addEventListener('change',event=>{filter=event.target.value;render();});
        el('notification-reset').addEventListener('click',()=>{query='';filter='all';readFilter='all';el('notification-search').value='';el('notification-filter').value='all';render();el('notification-search').focus();});
        el('notification-mark-all').addEventListener('click',markVisible);
        el('notification-undo-button').addEventListener('click',undoMark);
        document.addEventListener('click',event=>{
            const readButton=event.target.closest('[data-read-filter]');
            if(readButton&&authorized()){readFilter=readButton.dataset.readFilter;render();readButton.focus();return;}
            // One row menu at a time; a click elsewhere closes it, as the account menu does.
            document.querySelectorAll('.notification-row-menu[open],#notification-more[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false;});
            const button=event.target.closest('[data-notification-action]'),row=button?.closest('[data-notification-key]');if(!button||!row||!authorized())return;
            const key=row.dataset.notificationKey;if(!collect().some(item=>item.key===key))return;
            if(button.dataset.notificationAction==='open')open(key);else toggleRead(key);
        });
        document.addEventListener('keydown',event=>{
            if(event.key!=='Escape')return;const menu=event.target.closest?.('.notification-row-menu[open],#notification-more[open]');
            if(menu){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('summary').focus();}
        },true);
    }
    // Shared with the admin-only notice editor (notice-admin.js), which loads with Data & Layanan Admin.
    window.IPCOSNotifications=Object.freeze({render,reset,open,visit,keyForAnnouncement,markVisible,noticeActive,notice:Object.freeze({key:noticeKey,store:noticeStore,details:noticeDetails,derived:derivedSubject,inactive,shortDate,collapse})});
    setup();
})();
