/* Notifications reflect the current authorized snapshot, never an invented event history. */
(() => {
    'use strict';
    let owner = '', query = '', filter = 'all', items = [], signatures = new WeakMap(), readerOrigin=null;
    const el = id => document.getElementById(id), t = (id,en) => uxText(id,en);
    const authorized = () => !!getSessionToken() && ['mhs','admin'].includes(currentUser.role);
    const identity = () => `${sessionEpoch}:${currentUser.role}:${String(currentUser.nim || '').trim()}`;
    const normalized = value => String(value || '').normalize('NFKD').toLowerCase().replace(/\s+/g,' ').trim();
    const text = (id,value) => { const node=el(id); if(node && node.textContent!==value)node.textContent=value; };
    function keyForAnnouncement(ann) {
        const id=String(ann.Id || ann.id || '').trim();
        return notificationHash(`announcement:${id || JSON.stringify([ann.date || ann.Tanggal || '',ann.Pesan || ann.message || '',ann.Tipe || ann.type || ''])}`);
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
        const records = readStoredJSON(sessionStorage,'ipcos_registrations',[]), list=[];
        if(Array.isArray(records))for(const rec of records){
            const status=String(rec.status || '').trim().toLowerCase(), student=currentUser.role==='mhs';
            if(!rec.id || (student && !isStudentOwner(rec)) || !(student?['revision','accepted']:['pending','resubmitted']).includes(status))continue;
            const date=eventDate(rec), title=student?(status==='revision'?t('Perlu Revisi','Corrections Needed'):t('Disetujui','Approved')):(status==='resubmitted'?t('Perbaikan Masuk','Corrections Received'):t('Pengajuan Baru','New Request'));
            list.push({key:notificationHash(`${rec.id}:${status}:${date}`),caseId:String(rec.id),date,type:status,title:`${title}: ${systemText(rec.jenis)}`,body:(student?'':`${rec.nama || ''} · `)+caseNextStep(rec),tab:student?'student-status':'admin-data',action:student?(status==='revision'?t('Lihat Revisi','View Corrections'):t('Lihat Pengajuan','View Request')):t('Periksa Pengajuan','Review Request'),search:[rec.id,rec.nim,rec.nama,rec.jenis,status,'pengajuan request',status==='revision'?'revisi corrections':''].join(' ')});
        }
        const announcements=readStoredJSON(sessionStorage,'ipcos_announcements',[]);
        if(Array.isArray(announcements))for(const ann of announcements){
            const body=String(ann.Pesan || ann.message || '').trim(); if(!body)continue;
            list.push({key:keyForAnnouncement(ann),legacyKey:notificationHash(`announcement:${ann.Id || ann.date || ann.Tanggal || ann.Pesan || ann.message}`),date:ann.date || ann.Tanggal || '',type:'broadcast',title:t('Pengumuman Akademik','Academic Announcement'),body,tab:'notifications',action:t('Baca Pengumuman','Read Announcement'),important:String(ann.Tipe || ann.type || '').toLowerCase()==='important',search:'pengumuman announcement broadcast'});
        }
        const unique=[...new Map(list.map(item=>[item.key,item])).values()];
        return unique.sort((a,b)=>{const at=displayDate(a.date).getTime(),bt=displayDate(b.date).getTime();return (Number.isFinite(bt)?bt:0)-(Number.isFinite(at)?at:0);});
    }
    function restoreList(container,html) {
        if(!container || signatures.get(container)===html)return;
        const active=document.activeElement, row=active?.closest('[data-notification-key]');
        const focus=row&&container.contains(row)?{key:row.dataset.notificationKey,action:active.dataset.notificationAction}:null;
        const scroll=container.scrollTop;container.innerHTML=html;signatures.set(container,html);container.scrollTop=scroll;
        if(focus){const match=[...container.querySelectorAll('[data-notification-key]')].find(node=>node.dataset.notificationKey===focus.key);const target=match?.querySelector(`[data-notification-action="${focus.action || 'open'}"]`);if(target)target.focus({preventScroll:true});else el('notification-search')?.focus({preventScroll:true});}
    }
    function stamp(item){return Number.isFinite(displayDate(item.date).getTime())?timeAgo(item.date):t('Tanggal tidak tersedia','Date unavailable');}
    function card(item,read,compact=false){
        const safe=escapeHtml, tag=compact?'div':'article', isRead=read.has(item.key);
        const label=item.type==='broadcast'?t('Pengumuman','Announcement'):t('Pengajuan','Request');
        if(compact)return `<${tag} class="notification-preview ${isRead?'is-read':''}" data-preserve-case data-notification-key="${safe(item.key)}"><button type="button" class="notif-item" data-notification-action="open"><span class="notification-meta">${safe(label)} · ${safe(isRead?t('Dibaca','Read'):t('Belum Dibaca','Unread'))}</span><strong>${safe(item.title)}</strong><span class="notification-preview-body">${safe(item.body)}</span><span class="notification-date">${safe(stamp(item))}</span></button></${tag}>`;
        return `<article class="notification-card ${isRead?'is-read':''}" data-preserve-case data-notification-key="${safe(item.key)}"><div class="notification-card-top"><span class="notification-kind ${item.type==='revision'?'needs-action':''}">${safe(label)}${item.important?' · '+safe(t('Penting','Important')):''}</span><span class="notification-read-state">${safe(isRead?t('Dibaca','Read'):t('Belum Dibaca','Unread'))}</span></div><h2>${safe(item.title)}</h2><p class="notification-body">${safe(item.body)}</p><span class="notification-date">${safe(stamp(item))}</span><div class="notification-card-actions"><button type="button" class="btn-primary" data-notification-action="open">${safe(item.action)}</button><button type="button" class="btn-secondary" data-notification-action="read">${safe(isRead?t('Tandai Belum Dibaca','Mark Unread'):t('Tandai Dibaca','Mark Read'))}</button></div></article>`;
    }
    function labels(){
        text('notifications-title',t('Pusat Notifikasi','Notification Center'));
        text('notifications-intro',t('Temukan pembaruan pengajuan dan pengumuman, lalu lanjutkan tindakan yang diperlukan.','Find request updates and announcements, then take the next step.'));
        text('notification-search-label',t('Cari Notifikasi','Search Notifications'));
        el('notification-search').placeholder=t('Cari pengajuan atau isi pengumuman…','Search requests or announcement text…');
        text('notification-filter-label',t('Tampilkan','Show'));
        const labels={all:t('Semua','All'),unread:t('Belum Dibaca','Unread'),requests:t('Pengajuan','Requests'),announcements:t('Pengumuman','Announcements')};
        for(const option of el('notification-filter').options)option.textContent=labels[option.value];
        text('notification-reset',t('Reset Filter','Reset Filters'));
        text('notification-mark-all',t('Tandai Semua Dibaca','Mark All Read'));
        text('notification-view-all',t('Lihat Semua Notifikasi','View All Notifications'));
        text('notification-preview-title',t('Notifikasi Terbaru','Latest Notifications'));
        const toggle=document.querySelector('.notification-toggle');toggle?.setAttribute('aria-label',t('Buka Pusat Notifikasi','Open Notification Center'));
        text('notification-reader-title',t('Pengumuman Akademik','Academic Announcement'));
        text('notification-reader-close',t('Tutup','Close'));
    }
    function render(){
        if(!authorized()){reset();return;}
        const nextOwner=identity();if(owner!==nextOwner){reset();owner=nextOwner;}
        labels();items=collect();currentNotificationIds=items.map(item=>item.key);
        const read=readSet(),unread=items.filter(item=>!read.has(item.key)).length;
        const badge=el('notif-badge');badge.textContent=String(unread);badge.style.display=unread?'flex':'none';
        text('notification-summary',t(`${unread} belum dibaca dari ${items.length} notifikasi`,`${unread} unread of ${items.length} notifications`));
        const needle=normalized(query),terms=needle.split(' ').filter(Boolean);
        const selected=items.filter(item=>(filter!=='unread'||!read.has(item.key))&&(filter!=='requests'||item.type!=='broadcast')&&(filter!=='announcements'||item.type==='broadcast')&&terms.every(term=>normalized(`${item.title} ${item.body} ${item.search}`).includes(term)));
        text('notification-result-count',t(`${selected.length} notifikasi ditampilkan`,`${selected.length} notifications shown`));
        el('notification-reset').hidden=!query&&!['unread','requests','announcements'].includes(filter);
        el('notification-mark-all').disabled=!unread;
        restoreList(el('notification-center-list'),selected.map(item=>card(item,read)).join(''));
        const empty=el('notification-empty');empty.hidden=!!selected.length;
        text('notification-empty-title',items.length?t('Tidak ada hasil yang sesuai','No Matching Notifications'):t('Belum ada notifikasi','No Notifications Yet'));
        text('notification-empty-text',items.length?t('Ubah pencarian atau filter untuk melihat notifikasi lainnya.','Change the search or filter to see other notifications.'):t('Pembaruan pengajuan dan pengumuman akan tampil di sini saat tersedia.','Request updates and announcements will appear here when available.'));
        restoreList(el('notif-list-container'),items.length?items.slice(0,6).map(item=>card(item,read,true)).join(''):`<p class="notification-preview-empty">${escapeHtml(t('Belum ada notifikasi.','No notifications yet.'))}</p>`);
        const reader=el('modal-notification-announcement');
        if(reader.style.display==='flex' && reader.dataset.key){const item=items.find(item=>item.key===reader.dataset.key&&item.type==='broadcast');if(!item)closeModal(reader.id,true);else{text('notification-reader-body',item.body);text('notification-reader-date',stamp(item));}}
    }
    function mark(key){
        const ids=getReadNotificationIds();if(!ids.includes(key))saveReadNotificationIds([...ids,key]);render();
    }
    function open(key){
        if(!authorized())return false;
        const item=collect().find(entry=>entry.key===key);if(!item)return false;
        if(item.type==='broadcast'){
            const reader=el('modal-notification-announcement');
            readerOrigin={epoch:sessionEpoch,key:item.key,scope:document.activeElement?.closest('#notification-center-list')?'notification-center-list':'notif-list-container'};
            text('notification-reader-body',item.body);text('notification-reader-date',stamp(item));reader.dataset.key=item.key;
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
        owner='';query='';filter='all';items=[];signatures=new WeakMap();readerOrigin=null;
        if(el('notification-search'))el('notification-search').value='';if(el('notification-filter'))el('notification-filter').value='all';
        for(const id of ['notification-center-list','notif-list-container','notification-summary','notification-result-count','notification-reader-body','notification-reader-date'])if(el(id))el(id).textContent='';
        for(const id of ['notification-empty','notification-reset'])if(el(id))el(id).hidden=true;
        const reader=el('modal-notification-announcement');if(reader){delete reader.dataset.key;closeModal(reader.id,true);}
        if(el('notif-badge')){el('notif-badge').textContent='';el('notif-badge').style.display='none';}
    }
    function setup(){
        new MutationObserver(()=>{const reader=el('modal-notification-announcement');if(reader.style.display!=='none'||!readerOrigin)return;const origin=readerOrigin;readerOrigin=null;if(origin.epoch!==sessionEpoch||!authorized())return;const node=[...el(origin.scope).querySelectorAll('[data-notification-key]')].find(row=>row.dataset.notificationKey===origin.key)?.querySelector('[data-notification-action="open"]');const target=node?.getClientRects().length?node:document.querySelector('.notification-toggle');target?.focus({preventScroll:true});}).observe(el('modal-notification-announcement'),{attributes:true,attributeFilter:['style']});
        el('notification-search').addEventListener('input',event=>{query=event.target.value;render();});
        el('notification-filter').addEventListener('change',event=>{filter=event.target.value;render();});
        el('notification-reset').addEventListener('click',()=>{query='';filter='all';el('notification-search').value='';el('notification-filter').value='all';render();el('notification-search').focus();});
        document.addEventListener('click',event=>{
            const button=event.target.closest('[data-notification-action]'),row=button?.closest('[data-notification-key]');if(!button||!row||!authorized())return;
            const key=row.dataset.notificationKey;if(!collect().some(item=>item.key===key))return;
            if(button.dataset.notificationAction==='open')open(key);
            else{const ids=getReadNotificationIds(),item=items.find(entry=>entry.key===key);saveReadNotificationIds(readSet().has(key)?ids.filter(id=>id!==key&&id!==item?.legacyKey):[...ids,key]);render();}
        });
    }
    window.IPCOSNotifications=Object.freeze({render,reset,open,visit,keyForAnnouncement});
    setup();
})();
