/* Browse admin-authored templates and answers without changing an in-progress request. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
    const hash=value=>{let result=2166136261;for(const character of String(value)){result^=character.codePointAt(0);result=Math.imul(result,16777619);}return(result>>>0).toString(36);};
    let owner='',query='',category='all',requestContext=null,categoryHtml='',contextHtml='';
    const identities=new Map(),faqOpen=new Map(),panelHtml=new Map();
    const authenticated=()=>['mhs','admin'].includes(currentUser.role)&&!!getSessionToken();
    const ownerKey=()=>authenticated()?`${sessionEpoch}:${currentUser.role}:${String(currentUser.nim??'').trim()}`:'';
    const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
    function reset(){
        owner='';query='';category='all';requestContext=null;categoryHtml='';contextHtml='';identities.clear();faqOpen.clear();panelHtml.clear();
        if(!el('resource-search'))return;
        el('resource-search').value='';el('resource-category').replaceChildren();el('resource-reset').hidden=true;
        el('resource-context').replaceChildren();el('resource-context').hidden=true;
        ['service','field','matched'].forEach(key=>delete el('resource-context').dataset[key]);
        ['template_berkas-content-container','faq-content-container'].forEach(id=>el(id)?.replaceChildren());
        ['resource-result-count','resource-template-count','resource-faq-count'].forEach(id=>setText(el(id),''));
    }
    function prepareOwner(){const key=ownerKey();if(owner!==key){reset();owner=key;}return !!key;}
    function itemKey(type,item,counts,used){
        const id=String(item.id??'').trim(),signature=JSON.stringify([item.text,item.textEn,item.sub,item.subEn]);
        const previous=[...identities.values()].filter(entry=>entry.type===type&&entry.id===id&&!used.has(entry.key));
        let known=previous.find(entry=>entry.signature===signature);
        if(!known&&id&&counts.get(id)===1&&previous.length===1)known=previous[0];
        if(known){known.signature=signature;used.add(known.key);return known.key;}
        const base=`${type==='faq'?'faq':'template'}-${id?'id-'+hash(id):'text-'+hash(signature)}`;
        let key=base;
        if(identities.has(key)||used.has(key))key=base+'-'+hash(signature);
        for(let occurrence=2;identities.has(key)||used.has(key);occurrence++)key=base+'-'+hash(signature)+'-'+occurrence;
        identities.set(key,{type,id,signature,key});used.add(key);return key;
    }
    function content(type){
        const source=getChecklistData(type);let displayed=[];
        try{displayed=displayChecklistData(type);}catch(_){/* A malformed item must not hide other authored resources. */}
        const groups=(Array.isArray(source)?source:[]).filter(group=>group&&Array.isArray(group.items));
        const counts=new Map();groups.forEach(group=>group.items.forEach(item=>{if(!item||typeof item!=='object')return;const id=String(item.id??'').trim();counts.set(id,(counts.get(id)||0)+1);}));
        const entries=[],categories=[],used=new Set();
        groups.forEach((group,groupIndex)=>{
            const shown=displayed[groupIndex],title=String(shown?.title??contentText(group.title,group.titleEn));
            const key=`${type}:${groupIndex}:${hash(group.title??'')}`;
            categories.push({key,type,title:title||t('Grup tanpa nama','Unnamed group')});
            group.items.forEach((item,itemIndex)=>{
                if(!item||typeof item!=='object')return;
                const shownItem=shown?.items?.[itemIndex],text=String(shownItem?.text??contentText(item.text,item.textEn));
                const sub=String(type==='template_berkas'?item.sub??'':shownItem?.sub??contentText(item.sub,item.subEn));
                entries.push({key:itemKey(type,item,counts,used),category:key,group:title,sourceGroup:group,text,sub,raw:item,
                    search:normalize([group.title,group.titleEn,title,item.text,item.textEn,text,item.sub,type==='faq'?item.subEn:'',type==='faq'?sub:'',
                        ...[group.title,item.text,type==='faq'?item.sub:''].map(value=>typeof contentEnglish==='object'?contentEnglish[String(value??'')]||'':'')].join(' ')),position:entries.length});
            });
        });
        return {entries,categories};
    }
    function documentUrl(raw){
        const source=String(raw??'').trim();
        if(!/^https?:\/\//i.test(source))return '';
        try{const safe=safeUrl(source),url=new URL(safe);return safe!=='#'&&['http:','https:'].includes(url.protocol)&&url.hostname?safe:'';}catch(_){return '';}
    }
    function format(entry,url){
        let filename='';try{if(url)filename=decodeURIComponent(new URL(url).pathname);}catch(_){}
        const extension=[entry.raw.text,entry.raw.textEn,filename].join(' ').match(/\.(pdf|docx?|xlsx?|pptx?|zip|rar|odt|ods|odp)(?=$|[\s)\]},;:])/i)?.[1];
        return extension?extension.toUpperCase():t('Tautan Dokumen','Document Link');
    }
    const fieldTerms={
        'file-transkrip':['transkrip','transcript'],
        'file-proposal':['draf proposal','draft proposal','proposal draft'],
        'file-acc-sempro':['acc seminar proposal','form acc','seminar proposal','proposal seminar','sempro'],
        'file-folder-pendadaran':['pendadaran','thesis defense','thesis defence'],
        'file-loa-jurnal':['loa','letter of acceptance','journal acceptance','penerimaan jurnal'],
        'file-draft-jurnal':['draf jurnal','draft jurnal','draft journal','journal draft','journal manuscript'],
        'file-surat-ganti':['ganti dosen','pergantian pembimbing','supervisor change','change supervisor']
    };
    function contextScore(entry){
        if(!requestContext)return 0;
        const words=value=>normalize(value).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
        const haystack=words([entry.raw.text,entry.raw.textEn,entry.sourceGroup.title,entry.sourceGroup.titleEn].join(' '));
        const terms=new Set([...(fieldTerms[requestContext.field]||[]),requestContext.label,systemText(requestContext.label)].map(words).filter(Boolean));
        return [...terms].reduce((score,term)=>score+(` ${haystack} `.includes(` ${term} `)?term.includes(' ')?20:10:0),0);
    }
    function captureFaq(){el('faq-content-container').querySelectorAll('[data-resource-faq]').forEach(node=>faqOpen.set(node.dataset.resourceFaq,node.open));}
    function renderContext(templates){
        const box=el('resource-context');box.hidden=!requestContext;
        if(!requestContext){if(box.childElementCount)box.replaceChildren();contextHtml='';delete box.dataset.service;delete box.dataset.field;delete box.dataset.matched;return;}
        const matches=templates.filter(entry=>entry.score>0),available=matches.some(entry=>documentUrl(entry.sub));
        const message=!matches.length?t('Template khusus belum ditemukan. Anda tetap dapat menelusuri semua template di bawah.','No specific template found. You can still browse all templates below.')
            :!available?t('Judul terkait ditemukan, tetapi tautannya belum tersedia. Anda tetap dapat menelusuri template lain.','Related titles were found, but their links are unavailable. You can still browse other templates.')
            :t('Template dengan kata kunci terkait ditampilkan lebih dahulu. Periksa kesesuaiannya dengan persyaratan berkas.','Templates with related keywords appear first. Check that they meet the document requirements.');
        const html=`<p class="resource-context-service">${escapeHtml(systemText(requestContext.service))}</p><h2 id="resource-context-title">${t('Berkas yang disiapkan','Document being prepared')}: <span data-preserve-case>${escapeHtml(systemText(requestContext.label))}</span></h2><p class="resource-context-hint">${message}</p>`;
        box.dataset.service=requestContext.service;box.dataset.field=requestContext.field;box.dataset.matched=String(matches.length>0);
        if(contextHtml!==html){contextHtml=html;box.innerHTML=html;}
    }
    function context(value){
        if(!prepareOwner()||currentUser.role!=='mhs'||!value||!SERVICE_TYPES.includes(value.service)||el('reg-jenis-utama').value!==value.service)return false;
        const spec=registrationSpecs(value.service).find(([id])=>id===value.field);if(!spec)return false;
        const next={service:value.service,field:value.field,label:String(value.label||spec[1])};
        if(JSON.stringify(requestContext)!==JSON.stringify(next)){query='';category='all';el('resource-search').value='';}
        requestContext=next;render();return true;
    }
    function clearContext(){requestContext=null;render();}
    function filter(entry){return(category==='all'||entry.category===category)&&normalize(query).split(' ').filter(Boolean).every(word=>entry.search.includes(word));}
    function restoreFocus(focus){
        if(!focus)return;
        let target=focus.id?el(focus.id):null;
        if(!target?.getClientRects().length&&focus.key)target=[...document.querySelectorAll('#templates-faq [data-resource-key]')].find(node=>node.dataset.resourceKey===focus.key&&node.getClientRects().length);
        if(!target?.getClientRects().length)target=el('resource-search');
        if(target?.getClientRects().length&&!target.closest('[inert]'))target.focus({preventScroll:true});
    }
    function replacePanel(id,html){
        const root=el(id);if(panelHtml.get(id)===html&&root.firstElementChild)return;
        const active=root.contains(document.activeElement)?document.activeElement:null;
        const focus=active?{id:active.id,key:active.dataset.resourceKey}:null;
        panelHtml.set(id,html);root.innerHTML=html;restoreFocus(focus);
    }
    function render(){
        if(!el('resource-search')||!prepareOwner())return;
        if(requestContext&&(currentUser.role!=='mhs'||el('reg-jenis-utama').value!==requestContext.service))requestContext=null;
        captureFaq();
        const templates=content('template_berkas'),faqs=content('faq'),categories=[...templates.categories,...faqs.categories];
        if(category!=='all'&&!categories.some(item=>item.key===category))category='all';
        const options=`<option value="all">${t('Semua Kategori','All Categories')}</option>`+['template_berkas','faq'].map(type=>`<optgroup label="${type==='faq'?'FAQ':t('Template','Templates')}">${categories.filter(item=>item.type===type).map(item=>`<option value="${escapeHtml(item.key)}">${escapeHtml(item.title)}</option>`).join('')}</optgroup>`).join('');
        if(categoryHtml!==options){categoryHtml=options;el('resource-category').innerHTML=options;}el('resource-category').value=category;
        el('resource-search').placeholder=t('Cari dokumen atau pertanyaan...','Search documents or questions...');
        el('templates-faq').querySelector('.resource-toolbar').setAttribute('aria-label',t('Pencarian template dan FAQ','Template and FAQ search'));
        el('resource-reset').hidden=!query&&category==='all';
        const ranked=templates.entries.map(entry=>({...entry,score:contextScore(entry)})).sort((a,b)=>b.score-a.score||a.position-b.position);
        renderContext(ranked);
        const visibleTemplates=ranked.filter(filter),visibleFaqs=faqs.entries.filter(filter);
        setText(el('resource-template-count'),`${visibleTemplates.length} ${t('template',visibleTemplates.length===1?'template':'templates')}`);
        setText(el('resource-faq-count'),`${visibleFaqs.length} ${t('pertanyaan',visibleFaqs.length===1?'question':'questions')}`);
        setText(el('resource-result-count'),t(`${visibleTemplates.length} template dan ${visibleFaqs.length} pertanyaan ditampilkan`,`${visibleTemplates.length} ${visibleTemplates.length===1?'template':'templates'} and ${visibleFaqs.length} ${visibleFaqs.length===1?'question':'questions'} shown`));
        const templateHtml=visibleTemplates.map(entry=>{const url=documentUrl(entry.sub),title=entry.text||t('Dokumen tanpa judul','Untitled document');return `<li class="resource-template-card ${entry.score?'is-context-match':''}" data-resource-template="${entry.key}" data-resource-match="${entry.score>0}"><div class="resource-template-meta"><span class="resource-template-category">${escapeHtml(entry.group||t('Grup tanpa nama','Unnamed group'))}</span><span class="resource-template-format">${format(entry,url)}</span></div><h3 class="resource-template-title">${escapeHtml(title)}</h3>${entry.score?`<p class="resource-match-label">${t('Terkait kata kunci','Related keywords')}</p>`:''}<div class="resource-template-action">${url?`<a id="resource-open-${entry.key}" class="btn-secondary" data-resource-open data-resource-key="${entry.key}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(t('Buka dokumen','Open document')+' · '+title+' · '+t('tab baru','new tab'))}">${t('Buka Dokumen','Open Document')}<span aria-hidden="true"> ↗</span></a>`:`<span data-resource-unavailable>${t('Tautan belum tersedia','Link unavailable')}</span>`}</div></li>`;}).join('')||`<li class="resource-empty"><h3>${templates.entries.length?t('Template tidak ditemukan','No matching templates'):t('Belum ada template diterbitkan','No templates published yet')}</h3><p>${templates.entries.length?t('Coba kata kunci atau kategori lain.','Try another keyword or category.'):t('Template yang ditambahkan admin akan tampil di sini.','Templates added by admin will appear here.')}</p></li>`;
        const faqHtml=visibleFaqs.map(entry=>`<details id="resource-${entry.key}" data-resource-faq="${entry.key}" ${faqOpen.get(entry.key)?'open':''}><summary id="resource-${entry.key}-summary" data-resource-key="${entry.key}"><span><strong>${escapeHtml(entry.text||t('Pertanyaan tanpa judul','Untitled question'))}</strong><span class="resource-faq-category">${escapeHtml(entry.group||t('Grup tanpa nama','Unnamed group'))}</span></span></summary><div class="resource-faq-answer">${escapeHtml(entry.sub||t('Jawaban belum tersedia.','An answer is not available yet.'))}</div></details>`).join('')||`<div class="resource-empty"><h3>${faqs.entries.length?t('Pertanyaan tidak ditemukan','No matching questions'):t('Belum ada FAQ diterbitkan','No FAQs published yet')}</h3><p>${faqs.entries.length?t('Coba kata kunci atau kategori lain.','Try another keyword or category.'):t('Jawaban yang ditambahkan admin akan tampil di sini.','Answers added by admin will appear here.')}</p></div>`;
        replacePanel('template_berkas-content-container',templateHtml);replacePanel('faq-content-container',faqHtml);
    }
    function clearFilters(){query='';category='all';el('resource-search').value='';render();el('resource-search').focus({preventScroll:true});}
    function entries(){return prepareOwner()?['template_berkas','faq'].flatMap(type=>content(type).entries.map(entry=>({...entry,type}))):[];}
    function reveal(type,key){
        if(!prepareOwner()||!['template_berkas','faq'].includes(type)||!content(type).entries.some(entry=>entry.key===key))return null;
        query='';category='all';el('resource-search').value='';if(type==='faq')faqOpen.set(key,true);render();
        if(type==='faq'){const details=document.getElementById(`resource-${key}`);if(details)details.open=true;faqOpen.set(key,true);return document.getElementById(`resource-${key}-summary`);}
        const row=[...el('template_berkas-content-container').querySelectorAll('[data-resource-template]')].find(node=>node.dataset.resourceTemplate===key);
        return row?.querySelector('a[data-resource-open]')||row?.querySelector('h3')||null;
    }
    document.addEventListener('input',event=>{if(event.target.id==='resource-search'&&authenticated()){query=event.target.value;render();}});
    document.addEventListener('change',event=>{if(event.target.id==='resource-category'&&authenticated()){category=event.target.value;render();}if(event.target.id==='reg-jenis-utama'&&requestContext&&event.target.value!==requestContext.service)clearContext();});
    document.addEventListener('click',event=>{if(event.target.closest('#resource-reset')&&authenticated())clearFilters();});
    document.addEventListener('toggle',event=>{if(event.target.matches?.('#faq-content-container [data-resource-faq]'))faqOpen.set(event.target.dataset.resourceFaq,event.target.open);},true);
    window.IPCOSResources=Object.freeze({render,reset,context,clearContext,entries,reveal});
    render();
})();
