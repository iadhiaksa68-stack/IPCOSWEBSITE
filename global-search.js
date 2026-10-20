/* Search the active session's accessible pages and already loaded content. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
    const hash=value=>{let result=2166136261;for(const c of String(value)){result^=c.codePointAt(0);result=Math.imul(result,16777619);}return(result>>>0).toString(36);};
    const plain=value=>new DOMParser().parseFromString(String(value??'').replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi,'\n'),'text/html').body.textContent.replace(/\s+/g,' ').trim();
    const excerpt=value=>{const text=String(value??'').replace(/\s+/g,' ').trim();return text.length>180?text.slice(0,177)+'…':text;};
    const authenticated=()=>['mhs','admin'].includes(currentUser.role)&&!!getSessionToken();
    const ownerKey=()=>authenticated()?JSON.stringify([sessionEpoch,getSessionToken(),currentUser.role,String(currentUser.nim??'').trim()]):'';
    const menuDefinitions=[
        ['dashboard','Beranda','Home','dashboard utama aktivitas main activity'],
        ['admin-data','Antrean Pengajuan','Request Queue','admin review examination pemeriksaan verifikasi revisi'],
        ['admin-dosen','Manajemen Kuota Dosen','Supervisor Capacity','admin dosen pembimbing kuota kapasitas supervisor quota'],
        ['admin-master','Master Data','Master Data','admin mahasiswa akses broadcast pengumuman students access announcement'],
        ['notifications','Pusat Notifikasi','Notifications','notifikasi pengumuman pemberitahuan announcement inbox'],
        ['pendaftaran','Pusat Pendaftaran','Registration Center','daftar ujian outline sempro proposal pendadaran jurnal register exam'],
        ['student-status','Status Pengajuanku','My Requests','status pengajuan riwayat revisi request history correction'],
        ['student-files','Pusat Berkas Mahasiswa','Student File Center','berkas saya file dokumen unggahan submitted documents uploads'],
        ['academic-journey','Perjalanan Akademik','Academic Journey','tahapan progres magang skripsi progress thesis internship'],
        ['templates-faq','Template Berkas & FAQ','Document Templates & FAQ','dokumen unduh tanya jawab document download questions answers'],
        ['kalender','Kalender Yudisium & Wisuda','Graduation Calendar','jadwal tanggal tenggat batas deadline schedule ceremony clearance'],
        ['kurikulum','Sebaran Mata Kuliah','Course Distribution','kurikulum semester mata kuliah curriculum course'],
        ['remidial','Prosedur Remidial','Remedial Procedure','remedial nilai perbaikan grades'],
        ['sop-magang','SOP Magang','Internship SOP','prosedur panduan magang internship procedure guide'],
        ['sop-tugas-akhir','SOP Tugas Akhir','Final Project SOP','prosedur panduan skripsi thesis final project procedure'],
        ['magang','Kewajiban Magang','Internship Requirements','checklist persiapan internship preparation requirements'],
        ['skripsi','Kewajiban Skripsi','Thesis Requirements','checklist persiapan thesis preparation requirements'],
        ['internationalization','Mahasiswa Internasional','International Students','admin bahasa internasional language international'],
        ['feedback','Pusat Bantuan','Help Center','kontak bantuan kendala whatsapp support help admin']
    ];
    const groupLabels={menus:['Menu','Pages'],requests:['Pengajuan','Requests'],templates:['Template Berkas','Document Templates'],faq:['FAQ','FAQ'],references:['Referensi Akademik','Academic References'],calendar:['Kalender','Calendar'],sop:['SOP Terbit','Published SOPs']};
    const serviceEnglish={Outline:'Outline',Proposal:'Proposal Seminar',Pendadaran:'Thesis Defense','Skripsi Jurnal':'Journal Thesis','Pergantian Pembimbing':'Supervisor Change'};
    let owner='',query='',limit=24,renderedHtml='',generation=0,navigation=0,entries=new Map(),requestOrigin=null;
    function reset(){
        owner='';query='';limit=24;renderedHtml='';generation++;navigation++;entries.clear();requestOrigin=null;
        if(el('global-search-input'))el('global-search-input').value='';
        el('global-search-results')?.replaceChildren();
        const modal=el('modal-global-search');if(modal){modal.style.display='none';modal.style.opacity='0';}
    }
    function prepare(){const key=ownerKey();if(owner!==key){reset();owner=key;}return !!key;}
    function searchable(values){return normalize(values.flatMap(value=>[value,typeof contentEnglish==='object'?contentEnglish[String(value??'')]||'':'']).join(' '));}
    function allowed(tab){return authenticated()&&!!el(tab)&&canAccessTab(tab);}
    function index(){
        const list=[],used=new Map();
        const add=entry=>{const base=entry.key||entry.kind+'-'+hash(JSON.stringify(entry.identity));const count=used.get(base)||0;used.set(base,count+1);entry.key=base+(count?'-'+count:'');entry.search=searchable(entry.search||[entry.title,entry.description]);list.push(entry);};
        menuDefinitions.filter(([tab])=>allowed(tab)).forEach(([tab,id,en,keywords])=>add({key:'menu-'+tab,kind:'menus',tab,title:t(id,en),description:'',identity:{tab},search:[id,en,keywords]}));
        const records=readStoredJSON(sessionStorage,'ipcos_registrations',[]);
        if(Array.isArray(records))records.filter(row=>row&&String(row.id??'').trim()&&(currentUser.role==='admin'||isStudentOwner(row))).sort((a,b)=>activity(b)-activity(a)).forEach(row=>{
            const title=studentRequestTitle(row).replace(/\s+/g,' ').trim(),service=systemText(row.jenis),status=String(row.status??'').trim().toLowerCase();
            const labels={pending:t('Menunggu Pemeriksaan','Awaiting Review'),revision:t('Perlu Perbaikan','Needs Corrections'),resubmitted:t('Perbaikan Terkirim','Corrections Submitted'),accepted:t('Berkas Disetujui','Documents Approved')};
            const statusWords={pending:'menunggu pemeriksaan awaiting review',revision:'perlu perbaikan needs corrections revisi',resubmitted:'perbaikan terkirim corrections submitted',accepted:'berkas disetujui documents approved'};
            add({kind:'requests',tab:currentUser.role==='admin'?'admin-data':'student-status',title:service+' · '+String(row.id),description:excerpt([currentUser.role==='admin'?[row.nama,row.nim].filter(Boolean).join(' · '):'',title,labels[status]||String(row.status??'')].filter(Boolean).join(' · ')),identity:{id:String(row.id)},search:[row.id,row.jenis,service,serviceEnglish[row.jenis]||'',title,currentUser.role==='admin'?row.nama:'',currentUser.role==='admin'?row.nim:'',status,statusWords[status]||'']});
        });
        for(const type of ['template_berkas','faq','kurikulum','remidial','kalender','magang','skripsi']){
            const tab=['template_berkas','faq'].includes(type)?'templates-faq':type;if(!allowed(tab))continue;
            const source=['template_berkas','faq'].includes(type)?window.IPCOSResources:['kurikulum','remidial'].includes(type)?window.IPCOSReferences:type==='kalender'?window.IPCOSCalendar:['magang','skripsi'].includes(type)?window.IPCOSPreparation:null;
            if(source?.entries){
                const items=source.entries();
                if(Array.isArray(items))items.filter(entry=>type==='kalender'||entry.type===type).forEach(entry=>{
                    const raw=entry.raw||{},group=entry.sourceGroup||entry.rawGroup||{},title=String(type==='kalender'?entry.title:entry.text??entry.title??''),sub=type==='template_berkas'?'':String(entry.sub??''),groupTitle=String(entry.group??(type==='kalender'?entry.title:'')??'');
                    if(!title.trim())return;
                    const date=type==='kalender'?entry.day?formatDate(entry.day):String(entry.text??''):'';
                    const description=type==='kalender'?[t('Batas Yudisium','Graduation Clearance Deadline')+': '+date,sub?t('Daftar Wisuda','Ceremony Registration')+': '+sub:''].filter(Boolean).join(' · '):[groupTitle,sub].filter(Boolean).join(' · ');
                    add({key:'content-'+type+'-'+entry.key,kind:type==='template_berkas'?'templates':type==='faq'?'faq':type==='kalender'?'calendar':'references',tab,title,description:excerpt(description),identity:{type,key:String(entry.key)},search:[group.title,group.titleEn,groupTitle,raw.text,raw.textEn,entry.text,date,title,type==='template_berkas'?'':raw.sub,type==='template_berkas'?'':raw.subEn,sub]});
                });
                continue;
            }
            const groups=getChecklistData(type);if(!Array.isArray(groups))continue;
            groups.forEach((group,groupIndex)=>{if(!group||!Array.isArray(group.items))return;
                group.items.forEach((item,itemIndex)=>{if(!item||typeof item!=='object')return;
                    const title=contentText(item.text,item.textEn),groupTitle=contentText(group.title,group.titleEn),sub=type==='template_berkas'?'':contentText(item.sub,item.subEn);
                    if(!String(title??'').trim())return;
                    add({kind:type==='template_berkas'?'templates':type==='faq'?'faq':type==='kalender'?'calendar':'references',tab,title:String(title),description:excerpt([groupTitle,sub].filter(Boolean).join(' · ')),identity:{type,id:String(item.id??''),text:String(item.text??''),group:String(group.title??''),groupIndex,itemIndex},search:[group.title,group.titleEn,groupTitle,item.text,item.textEn,title,type==='template_berkas'?'':item.sub,type==='template_berkas'?'':item.subEn,sub]});
                });
            });
        }
        const snapshot=window.IPCOSSop?.snapshot?.();
        if(Array.isArray(snapshot))snapshot.forEach(doc=>{if(!doc||!['sop_magang','sop_tugas_akhir'].includes(doc.type))return;const tab=doc.type==='sop_magang'?'sop-magang':'sop-tugas-akhir';if(!allowed(tab))return;
            if(String(doc.intro??'').trim()||String(doc.introEn??'').trim())add({kind:'sop',tab,title:String(currentLang==='en'&&doc.titleEn?doc.titleEn:doc.title),description:excerpt(plain(currentLang==='en'&&doc.introEn?doc.introEn:doc.intro)),identity:{type:doc.type,sectionId:''},search:[doc.title,doc.titleEn,doc.intro,doc.introEn]});
            for(const section of Array.isArray(doc.sections)?doc.sections:[]){if(!section||!section.id)continue;
                const title=currentLang==='en'&&section.titleEn?section.titleEn:section.title,body=currentLang==='en'&&section.bodyEn?section.bodyEn:section.body;
                add({kind:'sop',tab,title:String(title||t('Bagian SOP','SOP Section')),description:excerpt([currentLang==='en'&&doc.titleEn?doc.titleEn:doc.title,plain(body)].filter(Boolean).join(' · ')),identity:{type:doc.type,sectionId:String(section.id)},search:[doc.title,doc.titleEn,section.title,section.titleEn,section.body,section.bodyEn,...(section.links||[]).flatMap(link=>[link.label,link.labelEn]),...(section.files||[]).map(file=>file.fileName)]});
            }
        });
        return list;
    }
    function activity(row){let logs=[];try{logs=JSON.parse(row.note||'[]');}catch(_){}return Math.max(0,...[row.date,...(Array.isArray(logs)?logs.map(log=>log?.time):[])].map(value=>displayDate(value).getTime()).filter(Number.isFinite));}
    function setup(){
        const modal=el('modal-global-search'),input=el('global-search-input'),box=el('global-search-results');if(!modal||!input||!box)return false;
        modal.classList.add('global-search-dialog');modal.querySelector('.modal-card')?.classList.add('global-search-card');input.parentElement?.parentElement?.classList.add('global-search-header');
        box.setAttribute('aria-live','off');input.setAttribute('aria-label',t('Cari menu, pengajuan, atau panduan','Search pages, requests, or guides'));input.placeholder=t('Cari menu, pengajuan, atau panduan…','Search pages, requests, or guides…');input.setAttribute('aria-describedby','global-search-help');
        const close=modal.querySelector('.modal-icon-close');if(close)close.setAttribute('aria-label',t('Tutup pencarian','Close search'));
        return true;
    }
    function render(value){
        if(!setup()||!prepare())return;
        const input=el('global-search-input'),box=el('global-search-results');
        if(value!==undefined&&String(value)!==query){query=String(value);limit=24;}
        if(input.value!==query)input.value=query;
        const words=normalize(query).split(' ').filter(Boolean),all=index(),matches=words.length?all.filter(entry=>words.every(word=>entry.search.includes(word))):all.filter(entry=>entry.kind==='menus'&&(['dashboard','notifications','templates-faq','kalender','admin-data','admin-dosen','admin-master','student-status','pendaftaran'].includes(entry.tab)));
        entries=new Map(matches.map(entry=>[entry.key,entry]));
        // Give each matching group an entry before one large category fills the result budget.
        const groups=Object.keys(groupLabels).map(kind=>matches.filter(entry=>entry.kind===kind)),visible=[];
        for(let position=0;visible.length<Math.min(limit,matches.length);position++)for(const group of groups){if(group[position]&&visible.length<limit)visible.push(group[position]);}
        const focus=box.contains(document.activeElement)?{key:document.activeElement.closest('[data-search-key]')?.dataset.searchKey,id:document.activeElement.id}:null,scroll=box.scrollTop;
        const count=words.length?t(`${visible.length} dari ${matches.length} hasil ditampilkan`,`${visible.length} of ${matches.length} results shown`):t('Akses Cepat','Quick Access');
        let html=`<div class="global-search-toolbar"><p id="global-search-status" role="status" aria-live="polite">${escapeHtml(count)}</p>${query?`<button type="button" id="global-search-clear">${t('Hapus','Clear')}</button>`:''}</div><p id="global-search-help">${t('↑ ↓ pilih hasil · Enter buka · Esc tutup','↑ ↓ choose a result · Enter open · Esc close')}</p>`;
        if(!visible.length)html+=`<div class="global-search-empty"><strong>${t('Hasil tidak ditemukan','No results found')}</strong><p>${t('Coba nomor pengajuan, nama layanan, atau kata lain dalam panduan.','Try a request ID, service name, or another word from a guide.')}</p></div>`;
        for(const kind of Object.keys(groupLabels)){const group=visible.filter(entry=>entry.kind===kind);if(!group.length)continue;const total=matches.filter(entry=>entry.kind===kind).length;
            html+=`<section class="global-search-group" data-search-group="${kind}" aria-labelledby="global-search-group-${kind}"><h2 id="global-search-group-${kind}">${t(...groupLabels[kind])}${words.length?` <span>${total}</span>`:''}</h2><div>${group.map(entry=>`<button type="button" class="search-result global-search-result" data-search-key="${escapeHtml(entry.key)}" data-search-kind="${kind}" data-preserve-case><span><strong>${escapeHtml(entry.title)}</strong>${entry.description?`<span class="global-search-description">${escapeHtml(entry.description)}</span>`:''}</span><span class="global-search-arrow" aria-hidden="true">↗</span></button>`).join('')}</div></section>`;
        }
        if(visible.length<matches.length)html+=limit<120?`<button type="button" id="global-search-more" class="btn-secondary">${t('Tampilkan Lagi','Show More')} · ${Math.min(24,matches.length-visible.length,120-limit)}</button>`:`<p class="global-search-limit">${t('Persempit kata kunci untuk melihat hasil lain.','Refine your keywords to find other results.')}</p>`;
        if(html!==renderedHtml){renderedHtml=html;box.innerHTML=html;box.scrollTop=scroll;
            if(focus){const target=focus.key?[...box.querySelectorAll('[data-search-key]')].find(node=>node.dataset.searchKey===focus.key):el(focus.id);(target||input).focus({preventScroll:true});}
        }
    }
    function open(){
        if(!prepare()||!setup())return false;
        const other=[...document.querySelectorAll('.overlay,dialog[open]')].find(node=>!['modal-global-search','modal-case-detail','modal-sop-editor'].includes(node.id)&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');
        if(other){showToast(t('Tutup dialog ini sebelum mencari halaman lain.','Close this dialog before searching other pages.'),'error');return false;}
        navigation++;
        const modal=el('modal-global-search');clearTimeout(modalCloseTimers.get(modal.id));modalCloseTimers.delete(modal.id);modal.style.display='flex';modal.style.opacity='1';render();
        const epoch=sessionEpoch,run=generation;requestAnimationFrame(()=>{if(epoch===sessionEpoch&&run===generation&&modal.style.display!=='none')el('global-search-input').focus({preventScroll:true});});return true;
    }
    function refresh(){if(!authenticated()){reset();return;}if(el('modal-global-search')?.style.display!=='none')render();else if(owner&&owner!==ownerKey())reset();}
    const visible=node=>node?.isConnected&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&!node.closest('[hidden],[inert]');
    function focusTarget(node){if(!visible(node))return false;if(!node.matches('button,a[href],input,select,textarea,summary,[tabindex]'))node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView({block:'center',behavior:'instant'});return document.activeElement===node;}
    function resolve(entry){
        if(entry.kind==='requests')return el('modal-case-detail')?.querySelector('.case-close');
        if(['templates','faq'].includes(entry.kind))return window.IPCOSResources?.reveal?.(entry.identity.type,entry.identity.key);
        if(entry.kind==='calendar')return window.IPCOSCalendar?.reveal?.(entry.identity.key);
        if(entry.kind==='references'){
            if(['magang','skripsi'].includes(entry.identity.type)&&window.IPCOSPreparation?.reveal)return window.IPCOSPreparation.reveal(entry.identity.type,entry.identity.key||entry.identity.id);
            if(['kurikulum','remidial'].includes(entry.identity.type))return window.IPCOSReferences?.reveal?.(entry.identity.type,entry.identity.key);
            const node=el(entry.identity.id);if(node?.closest('#'+entry.tab)){let details=node.closest('details');while(details){details.open=true;details=details.parentElement.closest('details');}return node;}
        }
        if(entry.kind==='sop')return window.IPCOSSop?.reveal?.(entry.identity.type,entry.identity.sectionId)||null;
        return el(entry.tab)?.querySelector('h1,h2');
    }
    function activate(key){
        if(!prepare())return false;
        const previous=entries.get(key);if(!previous)return false;
        const entry=index().find(row=>row.key===key&&JSON.stringify(row.identity)===JSON.stringify(previous.identity));
        if(!entry||!allowed(entry.tab)){render();return false;}
        const caseModal=el('modal-case-detail'),caseVisible=caseModal?.style.display!=='none';
        if(caseVisible&&typeof confirmLeaveCase==='function'&&!confirmLeaveCase())return false;
        const sopEditor=el('modal-sop-editor');
        // A same-page SOP link still leaves the editor; switchTab only checks other pages.
        if(sopEditor?.getClientRects().length&&getComputedStyle(sopEditor).display!=='none'&&window.IPCOSSop?.cancel?.()===false)return false;
        if(!switchTab(null,entry.tab))return false;
        if(caseVisible)closeModal('modal-case-detail',true);
        if(entry.kind==='requests'&&openCaseDetail(entry.identity.id)===false)return false;
        requestOrigin=entry.kind==='requests'?{id:entry.identity.id,tab:entry.tab,epoch:sessionEpoch}:null;
        const epoch=sessionEpoch,keyOwner=ownerKey(),run=++navigation;
        let ready=Promise.resolve();
        if(entry.kind==='sop'){
            let timeout;
            ready=Promise.race([Promise.resolve(window.IPCOSSop?.open?.(entry.identity.type)).catch(()=>{}),new Promise(resolve=>{timeout=setTimeout(resolve,16000);})]).finally(()=>clearTimeout(timeout));
        }
        closeModal('modal-global-search');
        // Let the modal trap release inert and the page restore its scroll before focusing the result.
        setTimeout(()=>ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
            if(epoch!==sessionEpoch||keyOwner!==ownerKey()||run!==navigation||el('modal-global-search').style.display!=='none'||!el(entry.tab)?.classList.contains('active'))return;
            const current=index().find(row=>row.key===key&&JSON.stringify(row.identity)===JSON.stringify(entry.identity));
            const target=current&&resolve(current);
            if(!focusTarget(target))focusTarget(entry.kind==='sop'?el(entry.identity.type+'-view')?.querySelector('[role="status"],.sop-notice,h1'):el(entry.tab)?.querySelector('h1,h2'));
        }))),210);
        return true;
    }
    document.addEventListener('input',event=>{if(event.target.id==='global-search-input')render(event.target.value);});
    document.addEventListener('click',event=>{const button=event.target.closest('#modal-global-search button');if(!button)return;if(button.dataset.searchKey){activate(button.dataset.searchKey);return;}if(button.id==='global-search-clear'){query='';limit=24;el('global-search-input').value='';render();el('global-search-input').focus();}if(button.id==='global-search-more'){const oldKeys=new Set([...el('global-search-results').querySelectorAll('[data-search-key]')].map(node=>node.dataset.searchKey));limit=Math.min(120,limit+24);render();const next=[...el('global-search-results').querySelectorAll('[data-search-key]')].find(node=>!oldKeys.has(node.dataset.searchKey));if(next){next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',behavior:'instant'});}}});
    document.addEventListener('keydown',event=>{
        const modal=el('modal-global-search');if(!authenticated()||!visible(modal)||!modal.contains(event.target)||!['ArrowDown','ArrowUp','Home','End','Enter'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
        const results=[...modal.querySelectorAll('[data-search-key]')],index=results.indexOf(document.activeElement),input=event.target.id==='global-search-input';
        if(event.key==='Enter'&&input){if(results.length){event.preventDefault();activate(results[0].dataset.searchKey);}return;}
        if(!results.length||(!input&&index<0))return;
        if(input&&['Home','End'].includes(event.key))return;
        if(event.key==='Enter')return;
        event.preventDefault();let target=event.key==='Home'?0:event.key==='End'?results.length-1:event.key==='ArrowDown'?(index+1)%results.length:index<0?results.length-1:(index-1+results.length)%results.length;
        results[target].focus({preventScroll:true});results[target].scrollIntoView({block:'nearest',behavior:'instant'});
    });
    const caseModal=el('modal-case-detail');
    if(caseModal)new MutationObserver(()=>{
        if(!requestOrigin||caseModal.style.display!=='none')return;
        const origin=requestOrigin;requestOrigin=null;
        if(origin.epoch!==sessionEpoch||!authenticated()||!el(origin.tab)?.classList.contains('active')||el('modal-global-search')?.style.display!=='none')return;
        const target=[...el(origin.tab).querySelectorAll('[data-case-id]')].find(node=>node.dataset.caseId===origin.id&&visible(node))||el(origin.tab==='admin-data'?'admin-search-input':'student-request-search');
        if(visible(target))target.focus({preventScroll:true});
    }).observe(caseModal,{attributes:true,attributeFilter:['style']});
    window.IPCOSSearch=Object.freeze({render,open,reset,refresh});
})();
