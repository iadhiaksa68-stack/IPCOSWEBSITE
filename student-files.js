/* An index of already submitted, owned files. Private bytes use the existing API. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en),safe=escapeHtml;
    const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
    const authorized=()=>currentUser.role==='mhs'&&!!getSessionToken()&&!!String(currentUser.nim??'').trim();
    const identity=()=>authorized()?JSON.stringify([sessionEpoch,getSessionToken(),String(currentUser.nim).trim()]):'';
    const logs=item=>{try{const value=JSON.parse(item.note||'[]');return Array.isArray(value)?value.filter(v=>v&&typeof v==='object'):[];}catch{return[];}};
    const keyFor=(id,url)=>encodeURIComponent(JSON.stringify([String(id),url]));
    const statusLabel=status=>status==='revision'?t('Perlu Perbaikan','Needs Corrections'):status==='accepted'?t('Sudah Sesuai','Meets Requirements'):t('Belum Ada Hasil','No Review Recorded');
    let owner='',query='',service='',status='all',older=false,limit=24,signature='',reader=null,generation=0;
    function collect(){
        if(!authorized())return[];
        const source=readStoredJSON(sessionStorage,'ipcos_registrations',[]);if(!Array.isArray(source))return[];
        const counts=new Map();for(const item of source){const id=String(item?.id??'').trim();if(id)counts.set(id,(counts.get(id)||0)+1);}
        return source.filter(item=>item&&isStudentOwner(item)&&counts.get(String(item.id??'').trim())===1).flatMap(item=>{
            const history=logs(item),metadata=history.flatMap(log=>Array.isArray(log.documents)?log.documents.filter(doc=>doc&&typeof doc==='object'):[]);
            const reviewLog=history.slice().reverse().find(log=>['document_review','request_type_change'].includes(log.kind));
            const reviews=Array.isArray(reviewLog?.reviews)?reviewLog.reviews.filter(review=>review&&typeof review==='object'):[];
            const seen=new Set(),files=getCaseFiles(item).filter(file=>{if(seen.has(file.url))return false;seen.add(file.url);return true;});
            const rows=files.map(file=>{
                const doc=metadata.slice().reverse().find(doc=>doc.url===file.url),version=Number(doc?.version),versioned=Number.isInteger(version)&&version>0&&typeof doc?.label==='string'&&!!doc.label.trim();
                const review=reviews.find(review=>review.url===file.url),state=['accepted','revision'].includes(review?.status)?review.status:'pending';
                const hasName=typeof doc?.fileName==='string'&&!!doc.fileName.trim();
                return{key:keyFor(item.id,file.url),id:String(item.id),url:file.url,service:String(item.jenis||''),label:String(doc?.label||file.label),name:hasName?doc.fileName:file.label,hasName,version:versioned?version:null,state,note:typeof review?.note==='string'?review.note:'',date:item.date,latest:true};
            });
            const latest=new Map();for(const row of rows)if(row.version!==null){const previous=latest.get(row.label);if(!previous||row.version>=previous.version)latest.set(row.label,row);}
            for(const row of rows)if(row.version!==null)row.latest=latest.get(row.label)===row;
            return rows;
        }).sort((a,b)=>{const date=value=>{const stamp=displayDate(value).getTime();return Number.isFinite(stamp)?stamp:0;};return Number(b.latest)-Number(a.latest)||Number(b.state==='revision')-Number(a.state==='revision')||date(b.date)-date(a.date)||a.id.localeCompare(b.id)||a.label.localeCompare(b.label)||Number(b.version)-Number(a.version);});
    }
    function current(key){return collect().find(row=>row.key===key);}
    function restoreFocus(key,action='preview'){
        if(!authorized()||!el('student-files').classList.contains('active'))return false;
        const card=[...el('file-center-list').children].find(node=>node.dataset.filesKey===key),target=card?.querySelector(action==='note'?'summary':`[data-files-action="${action==='request'?'request':'preview'}"]`)||el('file-center-search');
        target?.focus({preventScroll:true});return !!target;
    }
    function closeReader(focus=true){
        const previous=reader;reader=null;generation++;
        window.IPCOSDocuments?.reset(el('file-center-preview'));
        if(previous?.blob)URL.revokeObjectURL(previous.blob);
        const dialog=el('file-center-reader');if(dialog?.open)dialog.close();
        el('file-center-preview')?.replaceChildren(Object.assign(document.createElement('p'),{className:'field-helper'}));
        el('file-center-reader-title').textContent='';el('file-center-reader-context').textContent='';el('file-center-reader-message').textContent='';el('file-center-reader-retry').hidden=true;
        if(focus&&previous?.owner===identity())restoreFocus(previous.key);
    }
    function readerLabels(){
        const row=reader&&current(reader.key);if(!reader||!row)return;
        el('file-center-reader-title').textContent=reader.resolvedName||(row.hasName?row.name:documentText(row.label));
        el('file-center-reader-context').textContent=serviceLabel(row.service)+' · '+t('Pengajuan','Request')+' '+row.id;
        el('file-center-reader-close').textContent=t('Tutup','Close');el('file-center-reader-request').textContent=t('Lihat Pengajuan Asal','View Original Request');el('file-center-reader-retry').textContent=t('Coba Lagi','Try Again');
        el('file-center-reader-message').textContent=reader.phase==='busy'?t('Memuat berkas melalui sesi IPCOS…','Loading the file through your IPCOS session…'):reader.phase==='error'?t('Berkas belum dapat dimuat. Coba lagi atau periksa pengajuan asal.','The file could not be loaded. Try again or check the original request.'):reader.phase==='external'?t('Berkas lama ini berupa tautan. Buka sumbernya untuk melihat dokumen.','This older file is a link. Open its source to view the document.'):'';
        el('file-center-reader-retry').hidden=reader.phase!=='error';el('file-center-preview').setAttribute('aria-busy',String(reader.phase==='busy'));
        const external=el('file-center-preview').querySelector('[data-files-external]');if(external)external.textContent=t('Buka Sumber Berkas','Open File Source');
        window.IPCOSDocuments?.languageChanged();
    }
    async function open(key,retry=false){
        const row=current(key);if(!row||!el('student-files').classList.contains('active')||caseEditorDirty()||isPreparingCorrection||activeUpdateIds.size)return false;
        if(reader?.key===key&&reader.phase==='busy')return false;
        if(reader?.key===key&&!retry&&el('file-center-reader').open)return true;
        closeReader(false);const run=++generation,epoch=sessionEpoch;
        reader={key,owner:identity(),phase:isPrivateDriveUrl(row.url)?'busy':'external',blob:''};
        const dialog=el('file-center-reader');dialog.showModal();readerLabels();el('file-center-reader-close').focus({preventScroll:true});
        if(!isPrivateDriveUrl(row.url)){
            const link=document.createElement('a');link.href=row.url;link.target='_blank';link.rel='noopener noreferrer';link.className='btn-secondary';link.dataset.filesExternal='';el('file-center-preview').prepend(link);readerLabels();return true;
        }
        const live=()=>reader&&run===generation&&epoch===sessionEpoch&&reader.owner===identity()&&!!current(key)&&dialog.open;
        try{
            const response=await apiPost(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'get_document',id:row.id,url:row.url})}),result=await readApiResult(response);
            if(!live())return false;
            if(result.status!=='success'||typeof result.base64!=='string'||!result.base64.length||result.base64.length>13981016)throw Error('Unreadable document');
            const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));if(!bytes.length)throw Error('Empty document');
            const name=String(result.fileName||row.name).replace(/[\\/\x00-\x1f]/g,'_'),mime=window.IPCOSDocuments.trustedMime(bytes,String(result.mimeType||'application/octet-stream'),name);
            if(!live())return false;
            reader.blob=URL.createObjectURL(new Blob([bytes],{type:mime}));reader.phase='ready';reader.resolvedName=name;
            window.IPCOSDocuments.render(el('file-center-preview'),reader.blob,mime,name);readerLabels();return true;
        }catch(error){if(live()){reader.phase='error';readerLabels();}return false;}
    }
    function visit(key){
        const row=current(key);if(!row||!el('student-files').classList.contains('active')||caseEditorDirty()||isPreparingCorrection||activeUpdateIds.size)return false;
        if(reader)closeReader(false);
        const button=[...el('file-center-list').querySelectorAll('[data-files-action="request"]')].find(node=>node.closest('[data-files-key]')?.dataset.filesKey===key);button?.focus({preventScroll:true});
        return openCaseDetail(row.id);
    }
    function card(row){
        const version=row.version===null?t('Versi belum tercatat','Version not recorded'):t('Versi','Version')+' '+row.version+(row.latest?' · '+t('Terbaru','Latest'):' · '+t('Sebelumnya','Previous'));
        const validDate=Number.isFinite(displayDate(row.date).getTime());
        return `<article class="file-center-card" data-files-key="${safe(row.key)}"><div class="file-center-card-top"><span class="file-center-service">${safe(serviceLabel(row.service)||t('Layanan Lain','Other Service'))}</span><span class="file-center-state" data-state="${row.state}">${safe(statusLabel(row.state))}</span></div><h2>${safe(row.hasName?row.name:documentText(row.label))}</h2>${row.hasName?`<p class="file-center-label">${safe(documentText(row.label))}</p>`:''}<p class="file-center-version">${safe(version)}</p><dl><dt>${t('Pengajuan','Request')}</dt><dd>${safe(row.id)}</dd><dt>${t('Tanggal Pengajuan','Request Date')}</dt><dd>${validDate?safe(formatDate(row.date)):t('Belum tercatat','Not recorded')}</dd></dl>${row.note?`<details class="file-center-note"><summary>${t('Catatan Pemeriksaan','Review Notes')}</summary><p>${safe(row.note)}</p></details>`:''}<div class="file-center-card-actions"><button type="button" class="btn-primary" data-files-action="preview">${t('Lihat Berkas','View File')}</button><button type="button" class="btn-secondary" data-files-action="request">${t('Pengajuan Asal','Original Request')}</button></div></article>`;
    }
    function render(){
        if(!authorized()){reset();return;}
        if(owner!==identity()){reset();owner=identity();}
        const all=collect();if(reader&&!all.some(row=>row.key===reader.key))closeReader();
        const base=all.filter(row=>older||row.latest),services=[...new Set(all.map(row=>row.service))].sort();
        if(service&&!services.includes(service))service='';
        const set=(id,value)=>{if(el(id).textContent!==value)el(id).textContent=value;};
        set('file-center-title',t('Pusat Berkas Mahasiswa','Student File Center'));set('file-center-intro',t('Temukan berkas yang sudah dikirim, baca hasil pemeriksaan, dan buka pengajuan asalnya.','Find submitted files, read their review results, and open the original requests.'));
        set('file-center-search-label',t('Cari Berkas','Search Files'));el('file-center-search').placeholder=t('Nama berkas / pengajuan','File name / request ID');
        set('file-center-service-label',t('Layanan','Service'));set('file-center-status-label',t('Pemeriksaan Berkas','File Review'));set('file-center-older-label',t('Sertakan versi sebelumnya','Include previous versions'));set('file-center-reset',t('Reset Filter','Reset Filters'));set('file-center-more',t('Tampilkan Lebih Banyak','Show More'));set('file-center-empty-action',all.length?t('Reset Filter','Reset Filters'):t('Lihat Pengajuan Saya','View My Requests'));set('file-center-filters-title',t('Filter Berkas','File Filters'));const selectedFilters=Number(!!service)+Number(status!=='all')+Number(older);set('file-center-filters-count',selectedFilters?t(`${selectedFilters} aktif`,`${selectedFilters} active`):'');
        const options=`<option value="">${t('Semua Layanan','All Services')}</option>`+services.map(value=>`<option value="${safe(value)}">${safe(serviceLabel(value)||t('Layanan Lain','Other Service'))}</option>`).join('');if(el('file-center-service').innerHTML!==options)el('file-center-service').innerHTML=options;el('file-center-service').value=service;
        for(const option of el('file-center-status').options)option.textContent=option.value==='all'?t('Semua Status','All Statuses'):statusLabel(option.value);
        el('file-center-status').value=status;el('file-center-older').checked=older;
        set('file-center-overview',t(`${base.length} berkas · ${base.filter(row=>row.state==='revision').length} perlu perbaikan`,`${base.length} files · ${base.filter(row=>row.state==='revision').length} need corrections`));
        const needle=normalize(query).split(' ').filter(Boolean),filtered=base.filter(row=>(!service||row.service===service)&&(status==='all'||row.state===status)&&needle.every(word=>normalize([row.name,row.label,documentText(row.label),row.id,row.service,serviceLabel(row.service)].join(' ')).includes(word)));
        set('file-center-count',t(`${filtered.length} berkas ditemukan`,`${filtered.length} files found`));
        const list=el('file-center-list'),html=filtered.slice(0,limit).map(card).join('');
        if(signature!==html){const active=document.activeElement,key=active?.closest('[data-files-key]')?.dataset.filesKey,action=active?.dataset.filesAction||(active?.matches('summary')?'note':undefined);const opened=new Set([...list.querySelectorAll('details[open]')].map(node=>node.closest('[data-files-key]').dataset.filesKey));list.innerHTML=html;signature=html;for(const node of list.querySelectorAll('details'))if(opened.has(node.closest('[data-files-key]').dataset.filesKey))node.open=true;if(key)restoreFocus(key,action);}
        el('file-center-more').hidden=filtered.length<=limit;el('file-center-empty').hidden=!!filtered.length;
        set('file-center-empty-title',all.length?t('Tidak Ada Berkas yang Cocok','No Matching Files'):t('Belum Ada Berkas Terkirim','No Submitted Files Yet'));
        set('file-center-empty-description',all.length?t('Ubah pencarian atau reset filter untuk melihat berkas lainnya.','Change your search or reset the filters to see other files.'):t('Berkas akan muncul setelah terlampir pada pengajuan Anda. Lihat pengajuan untuk memeriksa kelengkapannya.','Files appear after they are attached to your requests. Open your requests to check their completeness.'));
        readerLabels();
    }
    function reset(){
        closeReader(false);owner='';query='';service='';status='all';older=false;limit=24;signature='';if(el('file-center-filters'))el('file-center-filters').open=false;
        if(el('file-center-search'))el('file-center-search').value='';el('file-center-service')?.replaceChildren();if(el('file-center-status'))el('file-center-status').value='all';if(el('file-center-older'))el('file-center-older').checked=false;
        el('file-center-list')?.replaceChildren();for(const id of ['file-center-overview','file-center-count'])if(el(id))el(id).textContent='';
    }
    function setup(){
        const page=document.createElement('section');page.id='student-files';page.className='tab-content file-center-page';page.dataset.preserveCase='';
        page.innerHTML='<header class="file-center-heading"><h1 id="file-center-title"></h1><p id="file-center-intro"></p></header><p id="file-center-overview" class="file-center-overview"></p><div class="file-center-toolbar"><div><label for="file-center-search" id="file-center-search-label"></label><input type="search" id="file-center-search" maxlength="200" autocomplete="off"></div><details id="file-center-filters"><summary><span id="file-center-filters-title"></span><span id="file-center-filters-count"></span></summary><div class="file-center-filter-fields"><div><label for="file-center-service" id="file-center-service-label"></label><select id="file-center-service"></select></div><div><label for="file-center-status" id="file-center-status-label"></label><select id="file-center-status"><option value="all"></option><option value="revision"></option><option value="pending"></option><option value="accepted"></option></select></div><label class="file-center-older"><input type="checkbox" id="file-center-older"><span id="file-center-older-label"></span></label><button type="button" class="btn-secondary" id="file-center-reset"></button></div></details></div><p id="file-center-count" role="status" class="file-center-count"></p><div id="file-center-list" class="file-center-list"></div><button type="button" class="btn-secondary" id="file-center-more" hidden></button><section id="file-center-empty" class="file-center-empty" hidden><h2 id="file-center-empty-title"></h2><p id="file-center-empty-description"></p><button type="button" class="btn-secondary" id="file-center-empty-action"></button></section>';
        el('student-status').before(page);
        const nav=document.createElement('li');nav.id='nav-student-files';nav.className='nav-item student-only lang';nav.dataset.navTarget='student-files';nav.dataset.navIcon='student-files';nav.dataset.id='Pusat Berkas';nav.dataset.en='My Files';nav.tabIndex=0;nav.setAttribute('role','button');nav.setAttribute('onclick',"switchTab(event, 'student-files')");nav.textContent=t('Pusat Berkas','My Files');el('nav-student-status').after(nav);
        const dialog=document.createElement('dialog');dialog.id='file-center-reader';dialog.className='overlay-dialog';dialog.dataset.preserveCase='';dialog.setAttribute('aria-labelledby','file-center-reader-title');
        dialog.innerHTML='<section class="modal-card"><header class="file-center-reader-heading"><div><h2 id="file-center-reader-title"></h2><p id="file-center-reader-context"></p></div><button type="button" class="btn-secondary" id="file-center-reader-close"></button></header><p id="file-center-reader-message" role="status"></p><div id="file-center-preview"><p class="field-helper"></p></div><footer class="file-center-reader-footer"><button type="button" class="btn-secondary" id="file-center-reader-retry" hidden></button><button type="button" class="btn-secondary" id="file-center-reader-request"></button></footer></section>';
        document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeReader();});dialog.addEventListener('close',()=>{if(reader&&!dialog.open)closeReader();});
        el('file-center-reader-close').addEventListener('click',()=>closeReader());el('file-center-reader-request').addEventListener('click',()=>reader&&visit(reader.key));el('file-center-reader-retry').addEventListener('click',()=>reader&&open(reader.key,true));
        el('file-center-search').addEventListener('input',()=>{query=el('file-center-search').value;limit=24;render();});
        el('file-center-service').addEventListener('change',()=>{service=el('file-center-service').value;limit=24;render();});el('file-center-status').addEventListener('change',()=>{status=el('file-center-status').value;limit=24;render();});el('file-center-older').addEventListener('change',()=>{older=el('file-center-older').checked;limit=24;render();});
        el('file-center-reset').addEventListener('click',()=>{query='';service='';status='all';older=false;limit=24;el('file-center-search').value='';render();el('file-center-search').focus();});
        el('file-center-more').addEventListener('click',()=>{const index=limit;limit+=24;render();el('file-center-list').children[index]?.querySelector('button')?.focus();});
        el('file-center-empty-action').addEventListener('click',()=>{if(!authorized())return;if(collect().length)el('file-center-reset').click();else switchTab(null,'student-status');});
        page.addEventListener('click',event=>{const button=event.target.closest('[data-files-action]'),key=button?.closest('[data-files-key]')?.dataset.filesKey;if(!key)return;if(button.dataset.filesAction==='preview')open(key);else if(button.dataset.filesAction==='request')visit(key);});
        document.addEventListener('ipcos:logout',reset);window.addEventListener('ipcos:logout',reset);
    }
    window.IPCOSFileCenter=Object.freeze({render,reset,open,visit,restoreFocus,beforeNavigate:()=>closeReader(false)});setup();
})();
