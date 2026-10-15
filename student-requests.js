/* Student request views filter local session records; they never write decisions. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    const statuses=['all','revision','processing','completed'];
    let owner='',status='all',query='',order='activity',renderKey='';
    const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
    const state=item=>String(item.status||'').trim().toLowerCase();
    function time(value){const number=displayDate(value).getTime();return Number.isFinite(number)?number:-Infinity;}
    function activity(item){let logs=[];try{logs=JSON.parse(item.note||'[]');}catch(_){}return Math.max(time(item.date),...(Array.isArray(logs)?logs.map(log=>time(log?.time)):[]));}
    function date(item){const number=order==='submitted'?time(item.date):activity(item);return Number.isFinite(number)?formatDate(new Date(number)):'—';}
    const matchStatus=(item,filter)=>filter==='all'||filter==='revision'&&state(item)==='revision'||filter==='processing'&&['pending','resubmitted'].includes(state(item))||filter==='completed'&&state(item)==='accepted';
    function matches(item){return !normalize(query)||normalize([item.id,item.jenis,...(serviceLabels[item.jenis]||[]),studentRequestTitle(item)].join(' ')).includes(normalize(query));}
    function labels(){return {all:t('Semua','All'),revision:t('Perlu Perbaikan','Needs Corrections'),processing:t('Diproses','Processing'),completed:t('Selesai','Completed')};}
    function text(node,value){if(node&&node.textContent!==value)node.textContent=value;}
    function action(item){return state(item)==='revision'?t('Lihat Perbaikan','View Corrections'):state(item)==='accepted'?t('Lihat Hasil','View Result'):t('Lihat Detail','View Details');}
    function statusHtml(item){return ['pending','resubmitted','revision','accepted'].includes(state(item))?(window.IPCOSReview?.statusHtml(item,{compact:true})||getStatusBadge(state(item))):`<div class="request-state"><span class="status-badge">${t('Status belum tersedia','Status unavailable')}</span><p class="request-state-next">${t('Buka detail atau segarkan data untuk memeriksa status terbaru.','Open the details or refresh to check the latest status.')}</p></div>`;}
    function requestHtml(item){return `<strong class="student-request-service">${escapeHtml(systemText(item.jenis))}</strong><span class="student-request-id">${t('Nomor','ID')} ${escapeHtml(item.id)}</span>${studentRequestTitle(item)?`<p class="student-request-excerpt">${escapeHtml(studentRequestTitle(item))}</p>`:''}`;}
    function buttonHtml(item){return `<button type="button" class="btn-secondary" data-case-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(action(item)+' · '+systemText(item.jenis)+' · '+t('Nomor','ID')+' '+String(item.id))}">${action(item)}</button>`;}
    function controls(){const names=labels();el('student-request-summary').setAttribute('aria-label',t('Status pengajuan','Request status'));el('student-request-search').placeholder=t('Cari layanan, nomor, atau judul...','Search service, ID, or title...');el('student-request-search').value=query;el('student-request-order').value=order;el('student-request-summary').querySelectorAll('[data-student-status]').forEach(button=>{text(button.querySelector('[data-student-status-label]'),names[button.dataset.studentStatus]);button.setAttribute('aria-pressed',String(button.dataset.studentStatus===status));});}
    function owned(){return currentUser.role==='mhs'&&getSessionToken()?readStoredJSON(sessionStorage,'ipcos_registrations',[]).filter(isStudentOwner):[];}
    function render(){
        if(!el('table-my-status'))return;
        const nim=currentUser.role==='mhs'&&getSessionToken()?String(currentUser.nim).trim():'';
        if(!nim){reset();return;}
        if(owner!==nim){owner=nim;status='all';query='';order='activity';renderKey='';controls();}
        // Preserve the live search node, value and caret during sync/language changes.
        const names=labels();el('student-request-summary').setAttribute('aria-label',t('Status pengajuan','Request status'));
        el('student-request-search').placeholder=t('Cari layanan, nomor, atau judul...','Search service, ID, or title...');
        el('student-status').querySelector('.student-request-toolbar').setAttribute('aria-label',t('Pencarian dan urutan pengajuan','Request search and ordering'));
        const all=owned(),searched=all.filter(matches),filtered=searched.filter(item=>matchStatus(item,status));
        filtered.sort((a,b)=>{const ta=order==='submitted'?time(a.date):activity(a),tb=order==='submitted'?time(b.date):activity(b);return (ta===tb?0:ta>tb?-1:1)||String(a.id).localeCompare(String(b.id));});
        el('student-request-summary').querySelectorAll('[data-student-status]').forEach(button=>{const filter=button.dataset.studentStatus,count=searched.filter(item=>matchStatus(item,filter)).length;text(button.querySelector('[data-student-status-label]'),names[filter]);text(button.querySelector('[data-student-status-count]'),String(count));button.setAttribute('aria-pressed',String(filter===status));button.setAttribute('aria-label',names[filter]+': '+count);});
        el('student-status').querySelector('.student-requests-heading [data-student-new-request]').hidden=!all.length;
        text(el('student-request-count'),t(`${filtered.length} dari ${all.length} pengajuan ditampilkan`,`${filtered.length} of ${all.length} requests shown`));
        text(el('student-request-date-title'),order==='submitted'?t('Tanggal Dikirim','Submitted On'):t('Pembaruan Terakhir','Last Updated'));
        el('student-request-reset').hidden=status==='all'&&!query&&order==='activity';
        el('student-request-table-panel').hidden=!filtered.length;el('student-mobile-list').hidden=!filtered.length;el('student-request-empty').hidden=!!filtered.length;
        const active=document.activeElement,focusId=active?.closest('#student-status [data-case-id]')?.dataset.caseId;
        const table=filtered.map(item=>`<tr><td>${requestHtml(item)}</td><td>${statusHtml(item)}</td><td class="student-request-date">${escapeHtml(date(item))}</td><td class="student-request-action">${buttonHtml(item)}</td></tr>`).join('');
        const cards=filtered.map(item=>`<article class="case-mobile-card student-history-card"><div>${requestHtml(item)}</div>${statusHtml(item)}<div class="student-history-footer"><p><span>${order==='submitted'?t('Dikirim','Submitted'):t('Diperbarui','Updated')}</span><strong>${escapeHtml(date(item))}</strong></p>${buttonHtml(item)}</div></article>`).join('');
        const key=table+'\n'+cards;
        if(renderKey!==key||el('table-my-status').querySelector('.skeleton')){renderKey=key;el('table-my-status').innerHTML=table;el('student-mobile-list').innerHTML=cards;
            if(focusId){const target=[...el('student-status').querySelectorAll('[data-case-id]')].find(node=>node.dataset.caseId===focusId&&node.getClientRects().length);(target||el('student-request-search')).focus({preventScroll:true});}}
        if(!filtered.length){const empty=all.length?`<h2>${t('Tidak ada pengajuan yang cocok','No matching requests')}</h2><p>${t('Coba kata kunci lain atau reset filter untuk melihat semua pengajuan.','Try another search or reset your filters to see all requests.')}</p><button type="button" class="btn-secondary" data-student-clear>${t('Reset Filter','Reset Filters')}</button>`:`<h2>${t('Belum ada pengajuan','No requests yet')}</h2><p>${t('Pengajuan yang Anda kirim akan tampil di sini bersama status dan tindak lanjutnya.','Your submitted requests will appear here with their status and next steps.')}</p><button type="button" class="btn-primary" data-student-new-request>${t('Buat Pengajuan','New Request')}</button>`;if(el('student-request-empty').innerHTML!==empty)el('student-request-empty').innerHTML=empty;}
    }
    function clearFilters(){status='all';query='';order='activity';controls();render();el('student-request-search').focus({preventScroll:true});}
    function reveal(id){if(currentUser.role!=='mhs'||!owned().some(item=>String(item.id)===String(id)))return;
        const item=owned().find(item=>String(item.id)===String(id));if(!matches(item)||!matchStatus(item,status)){status='all';query='';controls();render();}
        const target=[...el('student-status').querySelectorAll('[data-case-id]')].find(node=>node.dataset.caseId===String(id)&&node.getClientRects().length);target?.focus({preventScroll:true});}
    function reset(){owner='';status='all';query='';order='activity';renderKey='';if(!el('student-request-summary'))return;controls();el('table-my-status').replaceChildren();el('student-mobile-list').replaceChildren();el('student-request-empty').replaceChildren();el('student-request-empty').hidden=true;text(el('student-request-count'),'');el('student-request-summary').querySelectorAll('[data-student-status]').forEach(button=>{text(button.querySelector('[data-student-status-count]'),'0');button.setAttribute('aria-label',labels()[button.dataset.studentStatus]+': 0');});el('student-request-reset').hidden=true;}
    document.addEventListener('input',event=>{if(event.target.id==='student-request-search'&&currentUser.role==='mhs'){query=event.target.value;render();}});
    document.addEventListener('change',event=>{if(event.target.id==='student-request-order'&&currentUser.role==='mhs'){order=['activity','submitted'].includes(event.target.value)?event.target.value:'activity';render();}});
    document.addEventListener('click',event=>{if(currentUser.role!=='mhs'||!getSessionToken())return;const filter=event.target.closest('[data-student-status]');if(filter){status=statuses.includes(filter.dataset.studentStatus)?filter.dataset.studentStatus:'all';render();}if(event.target.closest('#student-request-reset,[data-student-clear]'))clearFilters();if(event.target.closest('[data-student-new-request]'))switchTab(null,'pendaftaran');});
    window.IPCOSStudentRequests=Object.freeze({render,reset,reveal});
})();
