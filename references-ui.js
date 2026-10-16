/* Read-only views of the curriculum and remedial procedures published by admin. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en),types=['kurikulum','remidial'];
    const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
    const hash=value=>{let code=2166136261;for(const char of String(value)){code^=char.codePointAt(0);code=Math.imul(code,16777619);}return(code>>>0).toString(36);};
    const prefixes={kurikulum:'curriculum',remidial:'remedial'},state={kurikulum:{query:'',selected:'all'},remidial:{query:'',selected:'all'}};
    const identities=new Map(),opened=new Map(),panels=new Map(),initialized=new Set();let owner='',ready=false;
    const authenticated=()=>['admin','mhs'].includes(currentUser.role)&&!!getSessionToken();
    const ownerKey=()=>authenticated()?`${sessionEpoch}:${currentUser.role}:${String(currentUser.nim??'').trim()}`:'';
    const setText=(node,text)=>{if(node&&node.textContent!==text)node.textContent=text;};
    function setup(){
        if(ready)return true;if(!el('kurikulum')||!el('remidial'))return false;
        for(const type of types){
            const root=el(type),prefix=prefixes[type],container=el(type+'-content-container');if(!container)return false;
            const heading=root.querySelector('h1'),editor=root.querySelector('[onclick="openContentEditor(\''+type+'\')"]');
            const header=document.createElement('div');header.className='reference-header';header.append(heading);
            if(editor){editor.removeAttribute('style');header.append(editor);}
            const intro=document.createElement('p');intro.className='reference-intro';intro.id=prefix+'-intro';
            const toolbar=document.createElement('div');toolbar.className='reference-toolbar';toolbar.setAttribute('role','search');
            toolbar.innerHTML=`<div class="reference-search-field"><label for="${prefix}-search" id="${prefix}-search-label"></label><input type="search" id="${prefix}-search" autocomplete="off" spellcheck="false"></div>${type==='kurikulum'?'<div class="reference-select-field"><label for="curriculum-semester" id="curriculum-semester-label"></label><select id="curriculum-semester"></select></div>':''}<button type="button" class="btn-secondary" id="${prefix}-reset" hidden></button>`;
            const count=document.createElement('p');count.id=prefix+'-count';count.className='reference-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');
            container.classList.remove('student-only');container.classList.add('reference-content');container.removeAttribute('style');
            const oldCard=container.parentElement===root?null:container.parentElement;
            root.append(header,intro,toolbar,count);
            if(type==='remidial'){const nav=document.createElement('nav');nav.id='remedial-step-navigation';nav.setAttribute('aria-label',t('Langkah remidial','Remedial steps'));root.append(nav);}
            root.append(container);if(oldCard?.classList.contains('card'))oldCard.remove();
            root.classList.add('reference-page');root.setAttribute('data-preserve-case','');
        }
        ready=true;return true;
    }
    function reset(){
        owner='';identities.clear();opened.clear();panels.clear();initialized.clear();
        for(const type of types){state[type]={query:'',selected:'all'};const prefix=prefixes[type];if(el(prefix+'-search'))el(prefix+'-search').value='';el(type+'-content-container')?.replaceChildren();setText(el(prefix+'-count'),'');if(el(prefix+'-reset'))el(prefix+'-reset').hidden=true;}
        el('curriculum-semester')?.replaceChildren();el('remedial-step-navigation')?.replaceChildren();
    }
    function prepare(){if(!setup())return false;const key=ownerKey();if(owner!==key){reset();owner=key;}return !!key;}
    function identity(type,item,group,counts,used){
        const id=String(item.id??'').trim(),signature=JSON.stringify([group.title,group.titleEn,item.text,item.textEn,item.sub,item.subEn]);
        const previous=[...identities.values()].filter(entry=>entry.type===type&&entry.id===id&&!used.has(entry.key));
        let prior=previous.find(entry=>entry.signature===signature);
        if(!prior&&id&&counts.get(id)===1&&previous.length===1)prior=previous[0];
        if(prior){prior.signature=signature;used.add(prior.key);return prior.key;}
        const base=type+'-'+hash(id||signature);let key=base;
        if(identities.has(key)||used.has(key))key=base+'-'+hash(signature);
        for(let i=2;identities.has(key)||used.has(key);i++)key=base+'-'+hash(signature)+'-'+i;
        identities.set(key,{key,type,id,signature});used.add(key);return key;
    }
    function read(type){
        const source=getChecklistData(type),groups=(Array.isArray(source)?source:[]).filter(group=>group&&Array.isArray(group.items)),counts=new Map(),used=new Set(),records=[];
        for(const group of groups)for(const item of group.items)if(item&&typeof item==='object'){const id=String(item.id??'').trim();counts.set(id,(counts.get(id)||0)+1);}
        groups.forEach((group,groupIndex)=>group.items.forEach(item=>{
            if(!item||typeof item!=='object')return;
            const text=contentText(item.text,item.textEn),sub=contentText(item.sub,item.subEn),title=contentText(group.title,group.titleEn);
            const bilingual=[group.title,group.titleEn,item.text,item.textEn,item.sub,item.subEn].flatMap(value=>[value,typeof contentEnglish==='object'?contentEnglish[String(value??'')]||'':'']);
            records.push({type,key:identity(type,item,group,counts,used),text,title:text,group:title,sub,raw:item,rawGroup:group,sourceGroup:group,groupIndex,position:records.length,search:normalize(bilingual.join(' '))});
        }));return records;
    }
    function entries(){if(!prepare())return [];return types.flatMap(read);}
    function capture(){for(const type of types)el(type+'-content-container').querySelectorAll('details[data-reference-item]').forEach(node=>opened.set(node.dataset.referenceItem,node.open));}
    function courseList(source){
        const text=String(source??'');if(!text||/[\n\r;:<>{}]/.test(text))return null;
        const parts=[];let part='',depth=0,quoted=false;
        for(const char of text){if(char==='"')quoted=!quoted;if(!quoted){if(char==='('||char==='[')depth++;if(char===')'||char===']')depth--;if(depth<0)return null;}
            if(char===','&&!quoted&&!depth){parts.push(part.trim());part='';}else part+=char;}
        parts.push(part.trim());
        if(depth||quoted||parts.length<3||parts.some(value=>!value||value.length>180||value.split(/\s+/).length>16||/[.!?].+\s/.test(value)))return null;
        return parts;
    }
    function body(entry){
        if(!entry.sub)return `<p class="reference-description reference-unavailable">${t('Detail belum diterbitkan.','Details have not been published yet.')}</p>`;
        const rawList=entry.type==='kurikulum'&&/^semester\s+\d/iu.test(String(entry.raw.text??''))?courseList(entry.raw.sub):null;
        const translatedList=rawList?courseList(entry.sub):null;
        // Translation can introduce a comma inside a single course name. If
        // the boundaries disagree, retain the published paragraph verbatim.
        const list=rawList&&translatedList?.length===rawList.length?translatedList:null;
        return list?`<ul class="reference-course-list">${list.map(item=>`<li data-preserve-case>${escapeHtml(item)}</li>`).join('')}</ul>`:`<p class="reference-description" data-preserve-case>${escapeHtml(entry.sub)}</p>`;
    }
    function replacement(container,html){
        if(panels.get(container.id)===html&&container.firstElementChild)return;
        const active=container.contains(document.activeElement)?document.activeElement:null,focusId=active?.id;
        panels.set(container.id,html);container.innerHTML=html;
        if(focusId){const target=el(focusId)||el(prefixes[container.id.startsWith('kurikulum')?'kurikulum':'remidial']+'-search');if(target?.getClientRects().length)target.focus({preventScroll:true});}
    }
    function renderType(type,records){
        const prefix=prefixes[type],current=state[type],search=el(prefix+'-search');
        setText(el(prefix+'-intro'),type==='kurikulum'?t('Telusuri mata kuliah berdasarkan semester yang diterbitkan program studi.','Browse courses by the semesters published by the study program.'):t('Ikuti urutan prosedur yang diterbitkan program studi. Buka setiap langkah untuk membaca rinciannya.','Follow the procedure published by the study program. Open each step to read its details.'));
        setText(el(prefix+'-search-label'),type==='kurikulum'?t('Cari mata kuliah atau semester','Search courses or semesters'):t('Cari langkah atau ketentuan','Search steps or requirements'));
        search.placeholder=type==='kurikulum'?t('Contoh: Komunikasi, Semester 3','For example: Communication, Semester 3'):t('Contoh: pembayaran, bimbingan','For example: payment, supervision');
        setText(el(prefix+'-reset'),t('Reset Filter','Reset Filters'));
        if(type==='kurikulum'){
            setText(el('curriculum-semester-label'),t('Semester / Bagian','Semester / Section'));
            if(current.selected!=='all'&&!records.some(entry=>entry.key===current.selected))current.selected='all';
            const select=el('curriculum-semester'),html=`<option value="all">${t('Semua Semester / Bagian','All Semesters / Sections')}</option>`+records.map(entry=>`<option value="${entry.key}" data-preserve-case>${escapeHtml(entry.text||t('Bagian tanpa judul','Untitled section'))} · ${escapeHtml(entry.group||t('Grup tanpa nama','Unnamed group'))}</option>`).join('');
            if(select.innerHTML!==html)select.innerHTML=html;select.value=current.selected;
        }
        const words=normalize(current.query).split(' ').filter(Boolean),visible=records.filter(entry=>(current.selected==='all'||current.selected===entry.key)&&words.every(word=>entry.search.includes(word)));
        el(prefix+'-reset').hidden=!current.query&&current.selected==='all';
        setText(el(prefix+'-count'),type==='kurikulum'?t(`${visible.length} dari ${records.length} bagian kurikulum ditampilkan`,`${visible.length} of ${records.length} curriculum sections shown`):t(`${visible.length} dari ${records.length} langkah ditampilkan`,`${visible.length} of ${records.length} steps shown`));
        let html='',lastGroup=-1;const initial=!initialized.has(type);
        for(const entry of visible){
            if(lastGroup!==entry.groupIndex){if(lastGroup!==-1)html+='</div></section>';lastGroup=entry.groupIndex;html+=`<section class="reference-group"><h2 data-preserve-case>${escapeHtml(entry.group||t('Grup tanpa nama','Unnamed group'))}</h2><div class="reference-group-items">`;}
            if(!opened.has(entry.key))opened.set(entry.key,type==='kurikulum'||initial&&entry.position===0);
            html+=`<details id="reference-${entry.key}" data-reference-type="${type}" data-reference-item="${entry.key}" ${opened.get(entry.key)?'open':''}><summary id="reference-${entry.key}-summary"><span data-preserve-case>${escapeHtml(entry.text||t(type==='kurikulum'?'Semester tanpa judul':'Langkah tanpa judul',type==='kurikulum'?'Untitled semester':'Untitled step'))}</span></summary><div class="reference-details">${body(entry)}</div></details>`;
        }
        if(records.length)initialized.add(type);
        if(lastGroup!==-1)html+='</div></section>';
        if(!visible.length)html=`<div class="reference-empty"><h2>${records.length?t('Tidak ada hasil yang cocok','No matching results'):t(type==='kurikulum'?'Kurikulum belum diterbitkan':'Prosedur remidial belum diterbitkan',type==='kurikulum'?'No curriculum published yet':'No remedial procedure published yet')}</h2><p>${records.length?t('Coba kata kunci lain atau reset filter.','Try another keyword or reset the filters.'):t('Konten dari program studi akan tampil di sini setelah diterbitkan.','Content from the study program will appear here once published.')}</p></div>`;
        replacement(el(type+'-content-container'),html);
        if(type==='remidial'){
            const nav=el('remedial-step-navigation');nav.setAttribute('aria-label',t('Langkah remidial','Remedial steps'));
            const navHtml=visible.map(entry=>`<button type="button" data-remedial-step="${entry.key}" aria-controls="reference-${entry.key}" data-preserve-case>${/^\s*\d+[.)]\s/.test(entry.text)?'':`<span class="reference-step-number" aria-hidden="true">${entry.position+1}</span>`}<span>${escapeHtml(entry.text||t('Langkah tanpa judul','Untitled step'))}</span></button>`).join('');
            const active=nav.contains(document.activeElement)?document.activeElement?.dataset.remedialStep:null;
            if(nav.innerHTML!==navHtml){nav.innerHTML=navHtml;if(active)nav.querySelector(`[data-remedial-step="${active}"]`)?.focus({preventScroll:true});}nav.hidden=!visible.length;
        }
    }
    function render(){if(!prepare())return;capture();for(const type of types)renderType(type,read(type));}
    function reveal(type,key){
        if(!types.includes(type)||!prepare())return null;
        const record=read(type).find(entry=>entry.key===key);if(!record)return null;
        state[type].query='';state[type].selected='all';el(prefixes[type]+'-search').value='';opened.set(key,true);render();
        const details=el('reference-'+key);if(!details)return null;details.open=true;opened.set(key,true);return details.querySelector('summary');
    }
    function navigate(key){
        const target=reveal('remidial',key);if(!target)return;
        const epoch=sessionEpoch,identity=owner;const focus=()=>{if(epoch!==sessionEpoch||identity!==owner||!target.isConnected||!el('remidial').classList.contains('active'))return;target.scrollIntoView({block:'center',behavior:'instant'});target.focus({preventScroll:true});};focus();requestAnimationFrame(focus);
    }
    document.addEventListener('input',event=>{for(const type of types)if(event.target.id===prefixes[type]+'-search'&&authenticated()){state[type].query=event.target.value;render();}});
    document.addEventListener('change',event=>{if(event.target.id==='curriculum-semester'&&authenticated()){state.kurikulum.selected=event.target.value;render();}});
    document.addEventListener('click',event=>{if(!authenticated())return;for(const type of types)if(event.target.closest('#'+prefixes[type]+'-reset')){state[type].query='';state[type].selected='all';el(prefixes[type]+'-search').value='';render();el(prefixes[type]+'-search').focus({preventScroll:true});return;}const step=event.target.closest('[data-remedial-step]');if(step)navigate(step.dataset.remedialStep);});
    document.addEventListener('toggle',event=>{if(event.target.isConnected&&event.target.matches?.('details[data-reference-item]'))opened.set(event.target.dataset.referenceItem,event.target.open);},true);
    window.IPCOSReferences=Object.freeze({render,reset,entries,reveal});
    render();
})();
