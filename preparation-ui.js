/* Personal preparation uses the existing checklist IDs and journey persistence. */
(() => {
    'use strict';
    const types=['magang','skripsi'],el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
    const hash=value=>{let code=2166136261;for(const char of String(value)){code^=char.codePointAt(0);code=Math.imul(code,16777619);}return(code>>>0).toString(36);};
    const authenticated=()=>!!getSessionToken()&&['mhs','admin'].includes(currentUser.role);
    const ownerKey=()=>authenticated()?JSON.stringify([sessionEpoch,getSessionToken(),currentUser.role,String(currentUser.nim??'').trim()]):'';
    const prefix=type=>'prep-'+type,sopType=type=>type==='magang'?'sop_magang':'sop_tugas_akhir',sopTab=type=>type==='magang'?'sop-magang':'sop-tugas-akhir';
    const state=Object.fromEntries(types.map(type=>[type,{query:'',phase:'all',status:'all',journey:false}]));
    const rowNodes=new Map(),groupNodes=new Map(),phaseHtml=new Map();let owner='',ready=false,rendering=false,guide=null,navigation=0;
    const setText=(node,value)=>{if(node&&node.textContent!==String(value))node.textContent=String(value);};
    const visible=node=>node?.isConnected&&!!node.getClientRects().length&&!node.closest('[hidden],[inert],details:not([open])>:not(summary)')&&getComputedStyle(node).visibility!=='hidden';
    function setup(){
        if(ready)return true;if(types.some(type=>!el(type)||!el(type+'-checklist-container')))return false;
        for(const type of types){
            const root=el(type),p=prefix(type),container=el(type+'-checklist-container'),heading=root.querySelector('h1'),editor=root.querySelector('[onclick="openContentEditor(\''+type+'\')"]');
            const oldCard=container.closest('.card'),header=document.createElement('header');header.className='preparation-heading';if(heading)header.append(heading);if(editor){editor.removeAttribute('style');header.append(editor);}
            const introWrap=document.createElement('div');introWrap.className='preparation-description student-only';const intro=document.createElement('p');intro.id=p+'-intro';intro.className='preparation-intro';introWrap.append(intro);
            const back=document.createElement('div');back.className='preparation-journey-back';back.id=p+'-journey-back';back.hidden=true;back.innerHTML='<button type="button" class="btn-secondary" data-preparation-return="journey" data-preparation-type="'+type+'"></button>';
            const hero=document.createElement('section');hero.className='preparation-overview';hero.id=p+'-overview';hero.setAttribute('aria-labelledby',p+'-next-title');
            hero.innerHTML=`<div class="preparation-next"><p class="preparation-kicker" id="${p}-kicker"></p><h2 id="${p}-next-title"></h2><p id="${p}-next-copy"></p><button type="button" class="btn-primary" id="${p}-next-button" data-preparation-next="${type}"></button></div><div class="preparation-summary" id="${p}-summary"><strong data-preparation-prepared="0">0</strong><span id="${p}-summary-copy"></span><span data-preparation-total="0" class="sr-only">0</span></div>`;
            const cloud=document.createElement('div');cloud.className='preparation-cloud';cloud.innerHTML=`<p id="${p}-cloud" role="status" aria-live="polite" data-preparation-state="local"></p><button type="button" class="btn-secondary" data-preparation-retry="${type}" hidden></button>`;
            const toolbar=document.createElement('div');toolbar.className='preparation-toolbar';toolbar.setAttribute('role','search');toolbar.innerHTML=`<div class="preparation-search"><label for="${p}-search" id="${p}-search-label"></label><input type="search" id="${p}-search" autocomplete="off" spellcheck="false"></div><div><label for="${p}-phase" id="${p}-phase-label"></label><select id="${p}-phase"></select></div><div><label for="${p}-status" id="${p}-status-label"></label><select id="${p}-status"><option value="all"></option><option value="unprepared"></option><option value="prepared"></option></select></div><button type="button" class="btn-secondary" id="${p}-reset" data-preparation-reset="${type}" hidden></button>`;
            const count=document.createElement('p');count.id=p+'-count';count.className='preparation-result-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');
            const notice=document.createElement('p');notice.id=p+'-notice';notice.className='preparation-data-notice';notice.hidden=true;
            const empty=document.createElement('div');empty.id=p+'-empty';empty.className='preparation-empty';empty.hidden=true;
            container.classList.add('preparation-list');root.classList.add('preparation-page');root.setAttribute('data-preserve-case','');
            root.append(back,header,introWrap,hero,cloud,toolbar,count,notice,container,empty);if(oldCard)oldCard.remove();
        }
        ready=true;return true;
    }
    function clearGuide(){guide=null;document.querySelectorAll('[data-preparation-guide-back]').forEach(node=>node.remove());}
    function reset(){
        owner='';navigation++;clearGuide();rowNodes.clear();groupNodes.clear();phaseHtml.clear();
        for(const type of types){state[type]={query:'',phase:'all',status:'all',journey:false};const p=prefix(type);if(el(p+'-search'))el(p+'-search').value='';el(type+'-checklist-container')?.replaceChildren();el(p+'-phase')?.replaceChildren();if(el(p+'-status'))el(p+'-status').value='all';for(const id of ['count','cloud','next-title','next-copy','summary-copy','notice'])setText(el(p+'-'+id),'');if(el(p+'-journey-back'))el(p+'-journey-back').hidden=true;}
    }
    function prepare(){const key=ownerKey();if(owner!==key){reset();owner=key;}return !!key;}
    function read(){
        const source=types.map(type=>({type,groups:(getChecklistData(type)||[]).filter(group=>group&&Array.isArray(group.items))})),counts=new Map(),used=new Map(),records=[],groups=[];
        for(const{groups}of source)for(const group of groups)for(const item of group.items)if(item&&typeof item==='object'){const id=String(item.id??'').replace(/[^a-zA-Z0-9_-]/g,'');if(id)counts.set(id,(counts.get(id)||0)+1);}
        for(const{type,groups:items}of source){const groupCounts=new Map();items.forEach((group,groupIndex)=>{
            const base=type+'-phase-'+hash(JSON.stringify([group.title,group.titleEn])),n=groupCounts.get(base)||0;groupCounts.set(base,n+1);const groupKey=base+(n?'-'+n:''),title=contentText(group.title,group.titleEn)||t('Fase tanpa nama','Unnamed phase');
            const record={type,key:groupKey,title,raw:group,position:groupIndex,items:[]};groups.push(record);
            for(const item of group.items){if(!item||typeof item!=='object')continue;
                const rawId=String(item.id??''),id=rawId.replace(/[^a-zA-Z0-9_-]/g,''),existing=id&&el(id),reserved=/^prep-(?:magang|skripsi)-/.test(id)||existing&&!existing.matches('input[type="checkbox"].chk-magang,input[type="checkbox"].chk-skripsi');
                const valid=/^[A-Za-z0-9_-]{1,64}$/.test(rawId)&&counts.get(id)===1&&!reserved,signature=JSON.stringify([rawId,item.text,item.textEn,item.sub,item.subEn,group.title]);
                const keyBase='preparation-'+type+'-'+(valid?'id-'+id:'review-'+hash(signature)),occurrence=used.get(keyBase)||0;used.set(keyBase,occurrence+1);const key=keyBase+(occurrence?'-'+occurrence:'');
                const text=contentText(item.text,item.textEn)||t('Poin tanpa judul','Untitled item'),sub=contentText(item.sub,item.subEn);
                const search=normalize([group.title,group.titleEn,title,item.text,item.textEn,text,item.sub,item.subEn,sub,...[group.title,item.text,item.sub].map(value=>typeof contentEnglish==='object'?contentEnglish[String(value??'')]||'':'')].join(' '));
                const entry={type,key,id,text,sub,group:title,groupKey,raw:item,sourceGroup:group,rawGroup:group,valid,search,position:records.length};records.push(entry);record.items.push(entry);
            }
        });}
        return{records,groups};
    }
    function entries(){return authenticated()?read().records:[];}
    function checked(entry,checks){return currentUser.role==='mhs'&&entry.valid&&checks[entry.id]===true;}
    function service(type,source){
        if(!types.includes(type)||!source)return '';
        const item=source.raw||source,group=source.sourceGroup||source.rawGroup||source.group&&typeof source.group==='object'&&source.group||source;
        const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
        const value=own(item,'service')?item.service:own(group,'service')?group.service:undefined;
        if(value!==undefined)return SERVICE_TYPES.includes(value)?value:'';
        if(type!=='skripsi')return '';
        const ids=Array.isArray(group.items)?group.items.map(item=>String(item.id??'')):[String(item.id??'')];
        return ids.some(id=>['s1','s2'].includes(id))?'Outline':ids.some(id=>['s3','s4'].includes(id))?'Proposal':ids.some(id=>['s5','s6','s7'].includes(id))?'Pendadaran':'';
    }
    function metadata(entry,key){return Object.prototype.hasOwnProperty.call(entry.raw,key)?entry.raw[key]:entry.sourceGroup[key];}
    function templates(entry){const id=String(metadata(entry,'templateId')??'').trim();if(!id)return[];return(window.IPCOSResources?.entries?.()||[]).filter(item=>item.type==='template_berkas'&&String(item.raw?.id??'').trim()===id);}
    function createGroup(group){
        const node=document.createElement('details');node.className='academic-stage preparation-stage';node.dataset.preparationGroup=group.key;node.dataset.stageType=group.type;node.open=true;
        node.innerHTML='<summary class="stage-heading"><h2 class="checklist-title"></h2><span class="stage-progress"></span></summary><div class="preparation-stage-body"><p class="stage-next"></p><div class="preparation-items"></div><div class="stage-service preparation-group-service"></div></div>';return node;
    }
    function createRow(entry){
        const row=document.createElement('article');row.className='checklist-item preparation-item';row.dataset.preparationItem=entry.key;
        const input=document.createElement('input');input.type='checkbox';input.className='custom-checkbox';const label=document.createElement('label');label.className='preparation-item-label';label.innerHTML='<span class="preparation-item-title"></span><span class="sub-text"></span>';
        const review=document.createElement('p');review.className='preparation-item-notice';review.hidden=true;
        const actions=document.createElement('div');actions.className='preparation-item-actions';
        row.append(input,label,review,actions);return row;
    }
    function updateRow(row,entry,checks){
        const input=row.querySelector('input'),label=row.querySelector('label'),isChecked=checked(entry,checks);row.dataset.preparationReadonly=String(!entry.valid||currentUser.role!=='mhs');row.dataset.preparationChecked=String(isChecked);
        if(entry.valid){input.id=entry.id;input.className='custom-checkbox chk-'+entry.type;label.htmlFor=entry.id;}else{input.removeAttribute('id');input.className='custom-checkbox preparation-invalid-checkbox';label.removeAttribute('for');}
        input.disabled=!entry.valid||currentUser.role!=='mhs'||journeyCloud.supported&&(!journeyCloud.available||journeyCloud.unavailable);input.checked=isChecked;input.dataset.preparationKey=entry.key;
        setText(label.querySelector('.preparation-item-title'),entry.text);setText(label.querySelector('.sub-text'),entry.sub);label.querySelector('.sub-text').hidden=!entry.sub;
        const review=row.querySelector('.preparation-item-notice');review.hidden=entry.valid;
        setText(review,t('Identitas poin perlu diperbaiki admin. Poin ini belum dapat ditandai.','An admin needs to correct this item’s identity. It cannot be checked yet.'));
        const serviceName=service(entry.type,entry),serviceValue=metadata(entry,'service'),explicitService=serviceValue!==undefined,templateId=String(metadata(entry,'templateId')??'').trim(),matches=templateId?templates(entry):[],section=String(metadata(entry,'sopSectionId')??'').trim(),knownSection=section&&(window.IPCOSSop?.snapshot?.()||[]).find(doc=>doc.type===sopType(entry.type))?.sections?.some(item=>item.id===section);
        const buttons=[{action:'sop',label:knownSection?t('Lihat Bagian SOP','View SOP Section'):t('Baca SOP','Read SOP')}];
        if(templateId&&matches.length===1)buttons.push({action:'template',label:t('Lihat Template','View Template')});
        if(serviceName&&explicitService&&currentUser.role==='mhs')buttons.push({action:'service',label:activeSameType(serviceName)?t('Lanjutkan Pengajuan','Continue Request'):t('Siapkan Pengajuan','Prepare Request')});
        const actions=row.querySelector('.preparation-item-actions'),html=buttons.map(({action,label})=>`<button type="button" class="btn-secondary" id="${prefix(entry.type)}-${entry.key}-${action}" data-preparation-action="${action}" data-preparation-key="${entry.key}" ${action==='service'?`data-preparation-service="${escapeHtml(serviceName)}"`:''}>${escapeHtml(label)}</button>`).join('')+[
            templateId&&matches.length!==1?t('Template terkait belum tersedia.','The linked template is unavailable.'):'',section&&!knownSection?t('Bagian SOP terkait belum tersedia.','The linked SOP section is unavailable.'):'',explicitService&&serviceValue&&!serviceName?t('Layanan terkait belum tersedia.','The linked service is unavailable.'):''
        ].filter(Boolean).map(message=>`<span class="preparation-link-notice">${message}</span>`).join('');
        if(actions.dataset.html!==html){actions.dataset.html=html;actions.innerHTML=html;}
    }
    function cloud(type){
        const p=prefix(type),status=el(p+'-cloud'),retry=el(type).querySelector('[data-preparation-retry]'),admin=currentUser.role==='admin';
        const unavailable=journeyCloud.supported&&(!journeyCloud.available||journeyCloud.unavailable);
        const kind=admin?'admin':unavailable?'unavailable':!journeyCloud.supported?journeyCloud.localError?'error':'local':journeyCloud.error?'error':journeyCloud.saving?'saving':Object.keys(journeyCloud.pending||{}).length?'pending':'saved';
        status.dataset.preparationState=kind;setText(status,admin?t('Pratinjau ketentuan terbit. Admin tidak mengubah persiapan pribadi mahasiswa.','Preview of published requirements. Admin cannot edit students’ personal preparation.'):unavailable?t('Catatan cloud belum dapat dimuat. Perubahan belum terkonfirmasi tersimpan.','Cloud preparation could not be loaded. Changes have not been confirmed saved.'):journeySyncText());
        retry.hidden=admin||!(journeyCloud.error||journeyCloud.localError||unavailable);retry.disabled=journeyCloud.saving;setText(retry,unavailable?t('Coba Muat Lagi','Retry Loading'):t('Coba Simpan Lagi','Retry Saving'));
    }
    function renderType(type,data,checks){
        const p=prefix(type),root=el(type),current=state[type],records=data.records.filter(item=>item.type===type),groups=data.groups.filter(item=>item.type===type),admin=currentUser.role==='admin';
        const validGroups=new Set(groups.map(group=>group.key));if(current.phase!=='all'&&!validGroups.has(current.phase))current.phase='all';
        const options=`<option value="all">${t('Semua Fase','All Phases')}</option>`+groups.map(group=>`<option value="${escapeHtml(group.key)}">${escapeHtml(group.title)}</option>`).join('');if(phaseHtml.get(type)!==options){phaseHtml.set(type,options);el(p+'-phase').innerHTML=options;}el(p+'-phase').value=current.phase;
        if(el(p+'-search').value!==current.query)el(p+'-search').value=current.query;
        el(p+'-status').value=current.status;el(p+'-status').disabled=admin;
        const copies={intro:t('Tandai yang sudah Anda siapkan. Catatan ini membantu persiapan dan bukan hasil verifikasi admin.','Mark what you have prepared. These notes support preparation and are not admin verification.'),kicker:t('PERSIAPAN BERIKUTNYA','NEXT PREPARATION'),'search-label':t('Cari Persiapan','Search Preparation'),'phase-label':t('Fase','Phase'),'status-label':t('Kesiapan','Preparation State'),reset:t('Atur Ulang Filter','Reset Filters')};
        copies.intro=admin?t('Pratinjau persyaratan yang diterbitkan admin. Catatan pribadi mahasiswa tidak ditampilkan di halaman ini.','Preview the requirements published by admin. Students’ personal preparation is not shown on this page.'):copies.intro;
        el(p+'-intro').parentElement.classList.toggle('student-only',!admin);el(p+'-intro').parentElement.style.display='block';
        for(const[id,value]of Object.entries(copies))setText(el(p+'-'+id),value);
        const title=type==='magang'?t('Persiapan Magang','Internship Preparation'):t('Persiapan Skripsi','Thesis Preparation');setText(root.querySelector('h1'),title);if(root.querySelector('h1')?.classList.contains('lang')){root.querySelector('h1').dataset.id=type==='magang'?'Persiapan Magang':'Persiapan Skripsi';root.querySelector('h1').dataset.en=type==='magang'?'Internship Preparation':'Thesis Preparation';}
        el(p+'-search').placeholder=t('Cari poin atau ketentuan…','Search items or requirements…');el(p+'-status').options[0].textContent=t('Semua','All');el(p+'-status').options[1].textContent=t('Belum Disiapkan','Not Prepared');el(p+'-status').options[2].textContent=t('Sudah Disiapkan','Prepared');
        const complete=records.filter(item=>checked(item,checks)).length,summary=el(p+'-summary');summary.querySelector('[data-preparation-prepared]').dataset.preparationPrepared=String(complete);summary.querySelector('[data-preparation-total]').dataset.preparationTotal=String(records.length);setText(summary.querySelector('[data-preparation-prepared]'),admin?records.length:complete);setText(summary.querySelector('[data-preparation-total]'),records.length);setText(el(p+'-summary-copy'),admin?t('poin persiapan terbit','published preparation items'):t(`dari ${records.length} poin ditandai siap`,`of ${records.length} items marked prepared`));
        const next=records.find(item=>item.valid&&!checked(item,checks)),invalid=records.filter(item=>!item.valid).length,button=el(p+'-next-button');button.hidden=!records.length;button.disabled=!records.length;
        setText(el(p+'-next-title'),admin?t('Persyaratan Persiapan','Preparation Requirements'):next?next.text:invalid?t('Beberapa Poin Perlu Diperbaiki','Some Items Need Correction'):records.length?t('Persiapan Sudah Anda Tandai Lengkap','You Have Marked Preparation Complete'):t('Persiapan Belum Diterbitkan','Preparation Not Published Yet'));
        setText(el(p+'-next-copy'),admin?t('Lihat fase dan panduan yang akan dibaca mahasiswa.','Review the phases and guides students will read.'):next?next.group:invalid?t('Admin perlu memperbaiki identitas poin sebelum semua persiapan dapat ditandai.','An admin needs to correct item identities before every item can be checked.'):records.length?t('Lihat Perjalanan Akademik untuk status resmi dan langkah pengajuan berikutnya.','Open Academic Journey for the official status and next request step.'):t('Ketentuan yang diterbitkan admin akan tampil di sini.','Requirements published by admin will appear here.'));
        button.dataset.preparationKey=next?.key||records.find(item=>!item.valid)?.key||records[0]?.key||'';setText(button,admin?t('Lihat Persyaratan','View Requirements'):next?t('Siapkan Poin Ini','Prepare This Item'):invalid?t('Lihat Poin Persiapan','View Preparation Items'):t('Buka Perjalanan Akademik','Open Academic Journey'));button.dataset.preparationComplete=String(!next&&!invalid&&!admin);
        const notice=el(p+'-notice');notice.hidden=!invalid;setText(notice,t(`${invalid} poin belum dapat ditandai karena identitasnya tidak valid atau bertabrakan. Hubungi admin untuk memperbaiki konten.`,`${invalid} items cannot be checked because their identities are invalid or conflicting. Contact admin to correct the content.`));
        cloud(type);el(p+'-journey-back').hidden=!current.journey;setText(el(p+'-journey-back').querySelector('button'),t('Kembali ke Perjalanan Akademik','Back to Academic Journey'));
        const words=normalize(current.query).split(' ').filter(Boolean),matches=entry=>words.every(word=>entry.search.includes(word))&&(current.phase==='all'||entry.groupKey===current.phase)&&(admin||current.status==='all'||checked(entry,checks)===(current.status==='prepared'));
        let shown=0;const container=el(type+'-checklist-container');
        for(const group of groups){let node=groupNodes.get(group.key);if(!node){node=createGroup(group);groupNodes.set(group.key,node);}if(node.parentElement!==container)container.append(node);if(container.children[groups.indexOf(group)]!==node)container.insertBefore(node,container.children[groups.indexOf(group)]||null);
            setText(node.querySelector('.checklist-title'),group.title);const count=group.items.filter(item=>checked(item,checks)).length;setText(node.querySelector('.stage-progress'),admin?t(`${group.items.length} poin`,`${group.items.length} items`):`${count}/${group.items.length} ${t('disiapkan','prepared')}`);node.querySelector('.stage-progress').classList.toggle('is-ready',!admin&&group.items.length>0&&count===group.items.length);
            const first=group.items.find(item=>item.valid&&!checked(item,checks));setText(node.querySelector('.stage-next'),admin?t('Persyaratan yang diterbitkan untuk fase ini.','Published requirements for this phase.'):first?t('Berikutnya: ','Next: ')+first.text:t('Tidak ada poin yang dapat ditandai tersisa pada fase ini.','No remaining items can be checked in this phase.'));
            const list=node.querySelector('.preparation-items');let groupVisible=0;
            for(const entry of group.items){let row=rowNodes.get(entry.key);if(!row){row=createRow(entry);rowNodes.set(entry.key,row);}if(row.parentElement!==list)list.append(row);if(list.children[group.items.indexOf(entry)]!==row)list.insertBefore(row,list.children[group.items.indexOf(entry)]||null);updateRow(row,entry,checks);row.hidden=!matches(entry);if(!row.hidden){shown++;groupVisible++;}}
            node.hidden=!groupVisible;const guide=node.querySelector('.stage-service'),groupService=service(type,{raw:group.raw,sourceGroup:group.raw});guide.hidden=admin||!groupService;if(groupService)guide.dataset.stageService=groupService;else delete guide.dataset.stageService;
            const serviceHtml=groupService&&!admin?`<p>${t('Pengajuan terkait fase','Request for this phase')}: <strong>${escapeHtml(systemText(groupService))}</strong></p><button id="${p}-${group.key}-service" type="button" class="btn-secondary" data-start-service="${escapeHtml(groupService)}">${activeSameType(groupService)?t('Lanjutkan Pengajuan','Continue Request'):t('Siapkan Pengajuan','Prepare Request')}</button>`:'';if(guide.dataset.html!==serviceHtml){guide.dataset.html=serviceHtml;guide.innerHTML=serviceHtml;}
        }
        setText(el(p+'-count'),t(`${shown} dari ${records.length} poin ditampilkan`,`${shown} of ${records.length} items shown`));el(p+'-count').dataset.preparationShown=String(shown);el(p+'-reset').hidden=!current.query&&current.phase==='all'&&current.status==='all';const empty=el(p+'-empty');empty.hidden=shown>0;empty.innerHTML=records.length?`<h2>${t('Persiapan Tidak Ditemukan','No Matching Preparation')}</h2><p>${t('Coba kata kunci, fase, atau kesiapan lain.','Try another keyword, phase, or preparation state.')}</p>`:`<h2>${t('Belum Ada Persiapan Diterbitkan','No Preparation Published Yet')}</h2><p>${t('Poin yang ditambahkan admin akan tampil di sini.','Items added by admin will appear here.')}</p>`;
    }
    function render(){
        if(rendering||!setup()||!prepare())return;rendering=true;
        try{const active=document.activeElement,focus=active?.closest('.preparation-page')?{node:active,id:active.id,key:active.closest('[data-preparation-item]')?.dataset.preparationItem,type:active.closest('.preparation-page').id,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection}:null,data=read(),checks=currentUser.role==='mhs'?journeyPreparationState():{};
            for(const type of types)renderType(type,data,checks);
            const keys=new Set(data.records.map(item=>item.key)),groups=new Set(data.groups.map(item=>item.key));for(const[key,node]of rowNodes)if(!keys.has(key)){node.remove();rowNodes.delete(key);}for(const[key,node]of groupNodes)if(!groups.has(key)){node.remove();groupNodes.delete(key);}
            if(focus){const replacement=focus.id&&el(focus.id),next=[...el(focus.type).querySelectorAll('input[data-preparation-key]')].find(node=>!node.disabled&&visible(node)),target=visible(focus.node)?focus.node:visible(replacement)?replacement:next||el(prefix(focus.type)+'-search');if(visible(target)&&document.activeElement!==target){target.focus({preventScroll:true});if(target===focus.node&&typeof focus.start==='number'&&target.setSelectionRange)target.setSelectionRange(focus.start,focus.end,focus.direction||'none');}}
            renderGuide();
        }finally{rendering=false;}
    }
    function reveal(type,value){
        if(!types.includes(type)||!authenticated())return null;render();let record=read().records.find(item=>item.type===type&&item.key===value);if(!record){const matches=read().records.filter(item=>item.type===type&&item.id===String(value)&&item.valid);if(matches.length===1)record=matches[0];}if(!record)return null;
        const existing=rowNodes.get(record.key);if(existing?.hidden||existing?.closest('details')?.hidden){state[type].query='';state[type].phase='all';state[type].status='all';render();}const row=rowNodes.get(record.key),group=row?.closest('details');if(group)group.open=true;const input=row?.querySelector('input');return record.valid&&!input?.disabled?input:row?.querySelector('.preparation-item-title');
    }
    function navigate(tab){
        if(!authenticated())return false;const dialogs=[...document.querySelectorAll('.overlay,dialog[open]')].filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');
        if(dialogs.some(node=>!['modal-case-detail','modal-sop-editor'].includes(node.id))){showToast(t('Tutup dialog ini sebelum berpindah halaman.','Close this dialog before changing pages.'),'error');return false;}
        const caseOpen=el('modal-case-detail')?.getClientRects().length;if(caseOpen&&!confirmLeaveCase())return false;const editor=el('modal-sop-editor');if(editor?.getClientRects().length&&window.IPCOSSop?.cancel?.()===false)return false;
        if(!switchTab(null,tab))return false;if(caseOpen)closeModal('modal-case-detail',true);return true;
    }
    function focusAfter(type,target,run=navigation){const epoch=sessionEpoch,key=owner;const focus=()=>{if(epoch!==sessionEpoch||key!==owner||run!==navigation||!el(type)?.classList.contains('active'))return;if(visible(target)){if(!target.matches('button,input,select,a[href],summary,[tabindex]'))target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:'instant'});}};focus();requestAnimationFrame(focus);}
    function open(type,options={}){if(!types.includes(type)||!setup()||!prepare()||!navigate(type))return false;navigation++;if(options.fromJourney)state[type].journey=true;render();const checks=currentUser.role==='mhs'?journeyPreparationState():{},next=read().records.find(item=>item.type===type&&item.valid&&!checked(item,checks)),target=options.itemId?reveal(type,options.itemId):options.fromJourney&&next?reveal(type,next.key):el(prefix(type)+'-next-button');focusAfter(type,target||el(prefix(type)+'-search'));return true;}
    function renderGuide(){
        if(!guide||guide.owner!==ownerKey()||guide.epoch!==sessionEpoch){if(guide)clearGuide();return;}
        const tab=el(guide.tab);let back=tab?.querySelector('[data-preparation-guide-back]');if(!tab)return;if(!back){back=document.createElement('div');back.className='preparation-guide-back';back.dataset.preparationGuideBack='';back.innerHTML='<button type="button" class="btn-secondary" data-preparation-return="guide"></button><span></span>';tab.prepend(back);}setText(back.querySelector('button'),t('Kembali ke Persiapan','Back to Preparation'));setText(back.querySelector('span'),t('Filter dan catatan persiapan Anda tetap tersedia.','Your preparation filters and notes remain available.'));
    }
    async function detour(entry,action,originId){
        const template=action==='template'?templates(entry):[];if(action==='template'&&template.length!==1)return;
        const tab=action==='template'?'templates-faq':sopTab(entry.type);if(!navigate(tab))return;
        window.IPCOSNext?.clearGuide?.();clearGuide();guide={owner:ownerKey(),epoch:sessionEpoch,type:entry.type,key:entry.key,tab,originId};renderGuide();const run=++navigation;
        let target;
        if(action==='template')target=window.IPCOSResources?.reveal?.('template_berkas',template[0].key);
        else{await window.IPCOSSop?.open?.(sopType(entry.type));if(guide?.owner!==ownerKey()||guide?.epoch!==sessionEpoch||run!==navigation)return;const section=String(metadata(entry,'sopSectionId')??'').trim();target=window.IPCOSSop?.reveal?.(sopType(entry.type),section);if(!target){target=window.IPCOSSop?.reveal?.(sopType(entry.type),'')||el(sopType(entry.type)+'-view')?.querySelector('h1,[role="status"]');if(section)showToast(t('Bagian SOP terkait belum tersedia. Panduan umum ditampilkan.','The linked SOP section is unavailable. Showing the general guide.'),'error');}}
        focusAfter(tab,target,run);
    }
    function returnGuide(){const context=guide;if(!context||context.owner!==ownerKey()||context.epoch!==sessionEpoch||!navigate(context.type))return;navigation++;clearGuide();render();let target=context.originId&&el(context.originId);if(!visible(target))target=el(prefix(context.type)+'-search');focusAfter(context.type,target);}
    function returnJourney(type){if(!navigate('academic-journey'))return;navigation++;state[type].journey=false;render();focusAfter('academic-journey',el('journey-preparation-'+type+'-summary')||el('journey-position-title'));}
    document.addEventListener('input',event=>{for(const type of types)if(event.target.id===prefix(type)+'-search'&&authenticated()){state[type].query=event.target.value;render();}});
    document.addEventListener('change',event=>{if(!authenticated())return;for(const type of types){if(event.target.id===prefix(type)+'-phase'){state[type].phase=event.target.value;render();return;}if(event.target.id===prefix(type)+'-status'){state[type].status=event.target.value;render();return;}}
        const input=event.target.closest('input[data-preparation-key]');if(!input)return;const entry=entries().find(item=>item.key===input.dataset.preparationKey);if(!entry?.valid||currentUser.role!=='mhs'){input.checked=false;return;}recordPreparationChange(input);render();
    });
    document.addEventListener('click',event=>{
        if(!authenticated())return;const action=event.target.closest('[data-preparation-action]');if(action){const entry=entries().find(item=>item.key===action.dataset.preparationKey);if(!entry)return;if(action.dataset.preparationAction==='service'){const value=service(entry.type,entry);if(value&&currentUser.role==='mhs')openStageRegistration(value);}else void detour(entry,action.dataset.preparationAction,action.id);return;}
        const resetButton=event.target.closest('[data-preparation-reset]');if(resetButton){const type=resetButton.dataset.preparationReset;state[type]={...state[type],query:'',phase:'all',status:'all'};render();el(prefix(type)+'-search').focus({preventScroll:true});return;}
        const retry=event.target.closest('[data-preparation-retry]');if(retry){if(currentUser.role==='mhs')saveJourneyProgress();return;}
        const back=event.target.closest('[data-preparation-return]');if(back){if(back.dataset.preparationReturn==='guide')returnGuide();else returnJourney(back.dataset.preparationType);return;}
        const next=event.target.closest('[data-preparation-next]');if(next){if(next.dataset.preparationComplete==='true'){if(navigate('academic-journey'))focusAfter('academic-journey',el('journey-position-title'));return;}const type=next.dataset.preparationNext,target=reveal(type,next.dataset.preparationKey);navigation++;focusAfter(type,target);}
    });
    window.IPCOSPreparation=Object.freeze({render,reset,open,reveal,entries,service});
    render();
})();
