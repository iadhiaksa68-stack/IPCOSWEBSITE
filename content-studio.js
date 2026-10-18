/* Edit published guidance without using a student's account or changing academic records. */
(() => {
    'use strict';
    const el = id => document.getElementById(id), t = (id,en) => uxText(id,en), esc = escapeHtml;
    const names = {
        magang:['Persiapan Magang','Internship Preparation'], skripsi:['Persiapan Skripsi','Thesis Preparation'],
        kurikulum:['Kurikulum','Curriculum'], remidial:['Panduan Remidial','Remedial Guidance'],
        kalender:['Kalender Akademik','Academic Calendar'], template_berkas:['Template Berkas','Document Templates'], faq:['Pertanyaan & Jawaban','Questions & Answers']
    };
    let owner = '', activeGroup = null, selectedIndex = 0, previewLanguage = 'id', view = 'edit';
    let originals = new WeakMap(), notice = null;
    const session = () => currentUser.role === 'admin' && getSessionToken() ? sessionEpoch+':'+getSessionToken() : '';
    const current = () => !!owner && session() === owner;
    const enabled = () => current() && !contentSaving;
    const root = () => el('modal-edit-content');
    const remember = object => { originals.set(object,structuredClone(object)); };
    function begin() {
        el('toast-container')?.replaceChildren();
        owner = session(); activeGroup = editorTempData[0] || null; selectedIndex = 0;
        previewLanguage = currentLang; view = 'edit'; notice = null;
        originals = new WeakMap(); editorTempData.forEach(group => { remember(group); group.items.forEach(remember); });
    }
    function reset() {
        owner = ''; activeGroup = null; originals = new WeakMap(); notice = null;
        el('editor-ui-container')?.replaceChildren(); el('studio-category-list')?.replaceChildren();
        el('studio-preview-content')?.replaceChildren();
        if (el('studio-feedback')) { el('studio-feedback').textContent = ''; el('studio-feedback').hidden = true; }
    }
    function fields() {
        switch(editorCurrentType) {
            case 'faq': return [t('Pertanyaan','Question'),t('Jawaban','Answer')];
            case 'template_berkas': return [t('Nama Dokumen','Document Name'),t('Tautan Dokumen','Document URL')];
            case 'kalender': return [t('Batas Pendaftaran Yudisium','Graduation Clearance Deadline'),t('Periode Pendaftaran Wisuda','Graduation Registration Period')];
            case 'kurikulum': return [t('Semester / Bagian','Semester / Section'),t('Mata Kuliah & Keterangan','Courses & Notes')];
            case 'remidial': return [t('Judul Langkah','Step Title'),t('Petunjuk','Instructions')];
            default: return [t('Poin Persiapan','Preparation Item'),t('Penjelasan (opsional)','Explanation (optional)')];
        }
    }
    function field(groupIndex,itemIndex,key,label,multiline=false) {
        const item = itemIndex < 0 ? editorTempData[groupIndex] : editorTempData[groupIndex].items[itemIndex];
        const id = 'studio-'+groupIndex+'-'+itemIndex+'-'+key;
        const target = 'editorTempData['+groupIndex+']'+(itemIndex<0?'':'.items['+itemIndex+']');
        const value = String(item[key] ?? ''), handler = target+'.'+key+' = this.value';
        const attrs = `id="${id}" data-studio-field="${groupIndex}:${itemIndex}:${key}" oninput="${handler}" aria-describedby="${id}-error"`;
        return `<label class="studio-field${key==='titleEn'?' editor-translation-label':''}" for="${id}"><span>${label}</span>${multiline?`<textarea ${attrs} rows="${key==='subEn'?3:4}">${esc(value)}</textarea>`:`<input ${attrs} type="text" value="${esc(value)}">`}<span id="${id}-error" class="studio-field-error" hidden></span></label>`;
    }
    function capture() {
        const container = el('editor-ui-container'), active = document.activeElement;
        return {
            id: root().contains(active) ? active.id : '', start: active?.selectionStart, end: active?.selectionEnd,
            direction: active?.selectionDirection, details: [...container.querySelectorAll('details')].map(node=>[node.dataset.studioDetails,node.open]),
            scroll: el('studio-editor-scroll')?.scrollTop || 0
        };
    }
    function render() {
        if (!current()) return true;
        const saved = capture(), selected = editorTempData.indexOf(activeGroup);
        selectedIndex = selected >= 0 ? selected : Math.min(selectedIndex,Math.max(0,editorTempData.length-1));
        activeGroup = editorTempData[selectedIndex] || null;
        root().classList.add('studio-overlay');
        root().setAttribute('data-preserve-case','');
        el('editor-modal-title').textContent = t('Studio Konten','Content Studio');
        el('studio-content-title').textContent = t(...names[editorCurrentType]);
        el('studio-intro').textContent = t('Pilih kategori, rapikan isinya, lalu periksa pratinjau sebelum menyimpan.','Choose a category, edit its content, and review the preview before saving.');
        el('studio-categories-title').textContent = t('Kategori','Categories');
        el('studio-picker-label').textContent = t('Kategori yang Diedit','Category to Edit');
        el('studio-add-category').textContent = t('+ Tambah Kategori','+ Add Category');
        el('studio-view-edit').textContent = t('Editor','Editor'); el('studio-view-preview').textContent = t('Pratinjau','Preview');
        el('studio-preview-title').textContent = t('Pratinjau Mahasiswa','Student Preview');
        el('studio-preview-note').textContent = t('Pratinjau kategori ini menggunakan draf. Progres dan data pribadi mahasiswa tidak ditampilkan.','This category preview uses your draft. Student progress and private data are not shown.');
        el('studio-preview-language-label').textContent = t('Bahasa Pratinjau','Preview Language');
        el('studio-preview-language').value = previewLanguage;
        el('studio-preview-badge').textContent = t('DRAF','DRAFT');
        el('studio-close').setAttribute('aria-label',t('Tutup studio konten','Close content studio'));
        const labels = fields();
        el('editor-ui-container').innerHTML = editorTempData.map((group,g) => `<section class="studio-category card" data-studio-group="${g}" ${g!==selectedIndex?'hidden':''} aria-labelledby="studio-group-heading-${g}">
            <header class="studio-section-heading"><div><span class="studio-eyebrow">${t('KATEGORI','CATEGORY')} ${g+1}</span><h3 id="studio-group-heading-${g}" tabindex="-1">${esc(group.title||t('Kategori Tanpa Judul','Untitled Category'))}</h3></div><button type="button" class="studio-delete" onclick="removeContentGroup(${g})">${t('Hapus Kategori','Delete category')}</button></header>
            ${field(g,-1,'title',t('Judul Kategori Utama','Category title'))}
            ${field(g,-1,'titleEn',t('Judul kategori dalam English (opsional)','Category title in English (optional)'))}
            ${preparationEditorLinks(group,g)}
            <div class="studio-items">${group.items.map((item,i)=>`<article class="studio-item" data-studio-item="${g}:${i}"><header><h4>${t('Item','Item')} ${i+1}</h4><div class="studio-item-tools"><button type="button" class="studio-icon-button" data-studio-move="${g}:${i}:-1" aria-label="${t('Pindahkan item ke atas','Move item up')}" ${i===0?'disabled':''}>↑</button><button type="button" class="studio-icon-button" data-studio-move="${g}:${i}:1" aria-label="${t('Pindahkan item ke bawah','Move item down')}" ${i===group.items.length-1?'disabled':''}>↓</button><button type="button" class="studio-delete" onclick="removeContentItem(${g}, ${i})" aria-label="${t('Hapus item','Delete item')} ${i+1}">${t('Hapus','Delete')}</button></div></header>
                ${field(g,i,'text',labels[0])}${field(g,i,'sub',labels[1],editorCurrentType!=='template_berkas')}
                ${editorCurrentType==='template_berkas'?`<p class="studio-field-help">${t('Gunakan tautan lengkap https://. Kosongkan atau isi # bila dokumen belum tersedia.','Use a complete https:// URL. Leave empty or enter # if the document is unavailable.')}</p>`:editorCurrentType==='kalender'?`<p class="studio-field-help">${t('Contoh batas tanggal: 30 Oktober 2026 atau 2026-10-30. Periode wisuda dapat berupa rentang tanggal.','Deadline example: 30 October 2026 or 2026-10-30. The graduation period may be a date range.')}</p>`:''}
                <details class="editor-translations" data-studio-details="${g}:${i}:translation"><summary>${t('English untuk mahasiswa internasional (opsional)','English for international students (optional)')}</summary><div class="details-content">${field(g,i,'textEn',t('Teks English','English text'))}${editorCurrentType!=='template_berkas'?field(g,i,'subEn',t('Detail English','English details'),true):''}</div></details>
                ${preparationEditorLinks(group,g,i)}</article>`).join('') || `<p class="studio-empty">${t('Kategori ini belum memiliki item. Tambahkan item pertama di bawah.','This category has no items yet. Add its first item below.')}</p>`}</div>
            <button type="button" class="btn-secondary studio-add-item" onclick="addContentItem(${g})">${t('+ Tambah Item','+ Add item')}</button></section>`).join('') || `<section class="studio-empty"><h3>${t('Mulai dari Satu Kategori','Start with One Category')}</h3><p>${t('Tambahkan kategori untuk menyusun konten mahasiswa.','Add a category to organize student content.')}</p></section>`;
        for (const detail of el('editor-ui-container').querySelectorAll('.preparation-editor-links')) {
            const select = detail.querySelector('select'); detail.dataset.studioDetails = select.dataset.editorPreparationG+':'+select.dataset.editorPreparationI+':links';
        }
        for (const [key,open] of saved.details) { const detail=[...el('editor-ui-container').querySelectorAll('details')].find(node=>node.dataset.studioDetails===key); if(detail)detail.open=open; }
        updateNavigation(); applyView(); update();
        const replacement=saved.id&&el(saved.id);
        if(replacement&&replacement.getClientRects().length&&!replacement.disabled){replacement.focus({preventScroll:true});if(typeof saved.start==='number'&&replacement.setSelectionRange)replacement.setSelectionRange(saved.start,saved.end,saved.direction||'none');}
        el('studio-editor-scroll').scrollTop=saved.scroll;
        if(contentSaving)root().querySelectorAll('button,input,textarea,select').forEach(node=>node.disabled=true);
        return true;
    }
    function updateNavigation() {
        const list=el('studio-category-list'),picker=el('studio-category-picker');
        list.innerHTML=editorTempData.map((group,g)=>`<button type="button" class="studio-category-button" data-studio-category="${g}" aria-pressed="${g===selectedIndex}"><span>${String(g+1).padStart(2,'0')}</span><span><strong>${esc(group.title||t('Kategori Tanpa Judul','Untitled Category'))}</strong><small>${group.items.length} ${t('item','items')}</small></span></button>`).join('');
        picker.innerHTML=editorTempData.map((group,g)=>`<option value="${g}">${g+1}. ${esc(group.title||t('Kategori Tanpa Judul','Untitled Category'))}</option>`).join('');
        picker.value=String(selectedIndex);picker.disabled=!editorTempData.length||contentSaving;
        el('studio-overview').textContent=t(`${editorTempData.length} kategori · ${editorTempData.reduce((n,g)=>n+g.items.length,0)} item`,`${editorTempData.length} categories · ${editorTempData.reduce((n,g)=>n+g.items.length,0)} items`);
    }
    function select(index,focus=true) {
        if(!enabled()||!Number.isInteger(index)||!editorTempData[index])return;
        selectedIndex=index;activeGroup=editorTempData[index];view='edit';
        el('editor-ui-container').querySelectorAll('[data-studio-group]').forEach(node=>node.hidden=Number(node.dataset.studioGroup)!==index);
        updateNavigation();applyView();update();el('studio-editor-scroll').scrollTop=0;
        if(focus)el('studio-group-heading-'+index)?.focus({preventScroll:true});
    }
    function applyView() {
        root().dataset.studioView=view;
        for(const mode of ['edit','preview']){el('studio-view-'+mode).setAttribute('aria-pressed',String(view===mode));}
    }
    const localized = (object,key) => previewLanguage==='en' ? String(object[key+'En']||((typeof contentEnglish==='object'&&contentEnglish[String(object[key]??'')])||object[key]||'')) : String(object[key]||'');
    const link = value => {try{const text=String(value??'').trim();if(!/^https?:\/\//i.test(text))return '';const url=new URL(text);return ['http:','https:'].includes(url.protocol)&&url.hostname?url.href:'';}catch(_){return '';}};
    function preview() {
        const group=editorTempData[selectedIndex],out=el('studio-preview-content');
        const pt=(id,en)=>previewLanguage==='en'?en:id;
        if(!group){out.innerHTML=`<p class="studio-empty">${pt('Belum ada kategori untuk ditampilkan.','No category to preview yet.')}</p>`;return;}
        const type=editorCurrentType;
        out.innerHTML=`<div class="studio-preview-document" data-preserve-case><span class="studio-eyebrow">${esc(previewLanguage==='en'?names[type][1]:names[type][0])}</span><h3>${esc(localized(group,'title')||pt('Kategori Tanpa Judul','Untitled Category'))}</h3>${group.items.map((item,i)=>{
            const title=localized(item,'text'),sub=localized(item,'sub');
            if(type==='faq')return `<details class="studio-preview-faq" open><summary>${esc(title||pt('Pertanyaan belum diisi','Question not provided'))}</summary><p>${esc(sub||pt('Jawaban belum diisi.','Answer not provided.'))}</p></details>`;
            if(type==='template_berkas'){const url=link(item.sub);return `<article class="studio-preview-card"><span class="studio-preview-icon" aria-hidden="true">↗</span><h4>${esc(title||pt('Nama dokumen belum diisi','Document name not provided'))}</h4><p class="studio-preview-url">${esc(url||pt('Tautan dokumen belum tersedia','Document URL unavailable'))}</p><span class="studio-preview-action">${url?pt('Buka Dokumen','Open Document'):pt('Belum Tersedia','Unavailable')}</span></article>`;}
            if(type==='kalender'){const day=academicCalendarDate(item.text);return `<article class="studio-preview-card"><h4>${pt('Batas Pendaftaran Yudisium','Graduation Clearance Deadline')}</h4><p class="studio-preview-date">${esc(title||pt('Belum diisi','Not provided'))}</p><h4>${pt('Pendaftaran Wisuda','Graduation Registration')}</h4><p>${esc(sub||pt('Belum dicantumkan','Not provided'))}</p>${!day?`<p class="studio-preview-warning">${pt('Tanggal belum dapat dibaca; pengingat kalender tidak tersedia.','The date cannot be read; calendar reminders are unavailable.')}</p>`:''}</article>`;}
            return `<article class="studio-preview-card studio-preview-row"><span class="studio-preview-marker" aria-hidden="true">${['magang','skripsi'].includes(type)?'□':String(i+1).padStart(2,'0')}</span><div><h4>${esc(title||pt('Judul belum diisi','Title not provided'))}</h4>${sub?`<p>${esc(sub)}</p>`:''}${['magang','skripsi'].includes(type)?`<div class="studio-preview-guides"><span>${pt('Panduan SOP','SOP Guide')}</span>${item.templateId?`<span>${pt('Template terkait','Linked Template')}</span>`:''}</div>`:''}</div></article>`;
        }).join('')||`<p class="studio-empty">${pt('Belum ada item dalam kategori ini.','No items in this category yet.')}</p>`}</div>`;
        out.setAttribute('lang',previewLanguage);
    }
    function feedback(id,en,state='error') {notice={id,en,state};paintFeedback();}
    function paintFeedback(){const box=el('studio-feedback');if(!box)return;box.hidden=!notice;box.textContent=notice?t(notice.id,notice.en):'';box.dataset.state=notice?.state||'';el('studio-reload').hidden=notice?.state!=='conflict';el('studio-reload').textContent=t('Muat Konten Terbaru','Load Latest Content');}
    function update() {
        if(!current())return;
        el('studio-save-status').textContent=contentSaving?t('Menerbitkan perubahan…','Publishing changes…'):contentEditorDirty()?t('Perubahan belum diterbitkan','Changes not published yet'):t('Belum ada perubahan','No changes yet');
        paintFeedback();preview();
    }
    function validate() {
        if(!enabled())return false;
        let issue=null;
        const invalid=(g,i,key,id,en)=>{if(!issue)issue={g,i,key,id,en};};
        editorTempData.forEach((group,g)=>{
            if(!String(group.title??'').trim()&&(!originals.has(group)||String(originals.get(group).title??'').trim()))invalid(g,-1,'title','Isi judul kategori sebelum menyimpan.','Enter a category title before saving.');
            group.items.forEach((item,i)=>{
                if(!String(item.text??'').trim()&&(!originals.has(item)||String(originals.get(item).text??'').trim()))invalid(g,i,'text','Isi judul item sebelum menyimpan.','Enter an item title before saving.');
                const value=String(item.sub??'').trim(),changed=!originals.has(item)||originals.get(item).sub!==item.sub;
                if(editorCurrentType==='template_berkas'&&changed&&value&&value!=='#'&&!link(value))invalid(g,i,'sub','Gunakan tautan lengkap http:// atau https:// yang valid.','Enter a valid complete http:// or https:// URL.');
            });
        });
        if(!issue)return true;
        select(issue.g,false);view='edit';applyView();const input=el('studio-'+issue.g+'-'+issue.i+'-'+issue.key),error=el(input.id+'-error');
        input.setAttribute('aria-invalid','true');error.hidden=false;error.textContent=t(issue.id,issue.en);feedback(issue.id,issue.en);input.focus();input.scrollIntoView({block:'center'});return false;
    }
    function reload() {
        if(!enabled()||!confirm(t('Muat konten terbaru? Perubahan dalam draf ini akan ditinggalkan.','Load the latest content? Changes in this draft will be discarded.')))return;
        openContentEditor(editorCurrentType,true);
    }
    function changed(event) {
        if(!current()||!root().contains(event.target)||contentSaving)return;
        if(event.target.matches('input,textarea,select')&&el('editor-ui-container').contains(event.target)){
            event.target.removeAttribute('aria-invalid');const error=el(event.target.id+'-error');if(error)error.hidden=true;
            if(notice?.state!=='conflict')notice=null;
            const key=event.target.dataset.studioField;if(key){const[g,i,fieldName]=key.split(':');if(i==='-1'&&fieldName==='title'){el('studio-group-heading-'+g).textContent=editorTempData[Number(g)].title||t('Kategori Tanpa Judul','Untitled Category');updateNavigation();}}
            update();
        }
    }
    document.addEventListener('input',changed);document.addEventListener('change',event=>{
        if(!enabled()||!root().contains(event.target))return;
        if(event.target.id==='studio-category-picker')select(Number(event.target.value),false);
        else if(event.target.id==='studio-preview-language'){previewLanguage=event.target.value==='en'?'en':'id';preview();}
        else changed(event);
    });
    document.addEventListener('click',event=>{
        if(!enabled()||!root().contains(event.target))return;
        const category=event.target.closest('[data-studio-category]');if(category){select(Number(category.dataset.studioCategory));return;}
        const move=event.target.closest('[data-studio-move]');if(move){const[g,i,offset]=move.dataset.studioMove.split(':').map(Number),items=editorTempData[g]?.items;if(!items||!items[i+offset])return;[items[i],items[i+offset]]=[items[i+offset],items[i]];render();el('studio-'+g+'-'+(i+offset)+'-text')?.focus();return;}
        const mode=event.target.closest('button[data-studio-view]');if(mode){view=mode.dataset.studioView==='preview'?'preview':'edit';applyView();return;}
        if(event.target.closest('#studio-reload'))reload();
    });
    window.IPCOSContentStudio=Object.freeze({begin,render,reset,select,update,validate,feedback,addedGroup:()=>select(editorTempData.length-1,false)});
})();
