/* File selection remains local until the existing confirmed submission path runs. */
(() => {
    'use strict';
    const selector='#registration-fields input[type="file"],#case-reply-files';
    const t=(id,en)=>uxText(id,en), el=id=>document.getElementById(id), rendered=new WeakMap();
    const busy=input=>input.id==='case-reply-files' ? isPreparingCorrection||activeUpdateIds.has(selectedCaseId) : isSubmittingRegistration||preflightBusy;
    function allowed(input){return currentUser.role==='mhs'&&!!getSessionToken()&&input.matches(selector)&&!busy(input);}
    function button(text,action,input,index){
        const node=document.createElement('button');node.type='button';node.className='btn-secondary';node.textContent=text;
        node.dataset.uploadAction=action;node.dataset.uploadInput=input.id;if(index!==undefined)node.dataset.uploadIndex=index;
        node.disabled=busy(input);return node;
    }
    function render(input){
        const group=input.closest('.form-group')||input.parentElement;
        group.classList.add('upload-field');input.classList.add('upload-picker');
        group.querySelectorAll('.dz-file-badge').forEach(node=>node.hidden=true);
        if(input.id==='case-reply-files'){const old=el('case-reply-file-list');if(old)old.hidden=true;}
        const files=[...input.files],key=JSON.stringify([currentLang,busy(input),files.map(file=>[file.name,file.size,fileProblem(file,input.accept),documentInspections.get(file)?.pending])]);
        const previous=rendered.get(input);
        if(previous?.key===key&&files.every((file,i)=>file===previous.files[i])&&el(input.id+'-selection'))return;
        rendered.set(input,{key,files});
        let panel=el(input.id+'-selection');
        if(!panel){panel=document.createElement('div');panel.id=input.id+'-selection';panel.className='upload-selection';input.insertAdjacentElement('afterend',panel);}
        const fragment=document.createDocumentFragment();
        const heading=document.createElement('p');heading.className='upload-selection-status';heading.setAttribute('role','status');heading.setAttribute('aria-live','polite');
        heading.textContent=files.length?t('Dipilih di perangkat · belum dikirim','Selected on this device · not sent'):t('Belum ada berkas dipilih','No file selected');
        if(!files.length||input.multiple){const choose=button(files.length?t('Ganti pilihan berkas','Change selected files'):t('Pilih Berkas','Choose File'),'replace',input);choose.classList.add('upload-choose');choose.setAttribute('aria-describedby',input.id+'-selection-status');fragment.append(choose);}
        heading.id=input.id+'-selection-status';fragment.append(heading);
        const total=files.reduce((sum,file)=>sum+file.size,0);
        if(input.multiple){
            const limit=document.createElement('p');limit.className='field-helper upload-total';
            const tooMany=files.length>5||total>20*1024*1024;
            limit.textContent=files.length+' / 5 '+t('berkas','files')+' · '+formatFileSize(total)+' / 20 MB';
            limit.classList.toggle('field-error',tooMany);fragment.append(limit);
        }
        files.forEach((file,index)=>{
            const item=document.createElement('div');item.className='upload-file-card';
            const info=document.createElement('div');info.className='upload-file-info';
            const name=document.createElement('strong');name.className='upload-file-name';name.dataset.preserveCase='';name.textContent=file.name;
            const meta=document.createElement('span');meta.className='upload-file-meta';meta.textContent=formatFileSize(file.size)+' · '+(file.name.split('.').pop()||t('Berkas','File')).toUpperCase();
            const status=document.createElement('span');status.className='upload-file-check';status.setAttribute('role','status');
            const problem=fileProblem(file,input.accept),inspection=documentInspections.get(file);
            item.dataset.state=problem?'error':inspection?.pending===false?'ready':'checking';
            status.textContent=problem|| (inspection?.pending===false?t('Format dasar sesuai · periksa isi berkas','Basic format checked · review the contents'):t('Memeriksa format di perangkat…','Checking the format on your device…'));
            info.append(name,meta,status);item.append(info);
            const actions=document.createElement('div');actions.className='upload-file-actions';
            if(!problem){const preview=button(/\.(pdf|png|jpe?g)$/i.test(file.name)?t('Pratinjau','Preview'):t('Periksa berkas','Review file'),'preview',input,index);preview.dataset.localPreview=input.id;preview.dataset.localPreviewIndex=index;actions.append(preview);}
            if(!input.multiple)actions.append(button(t('Ganti berkas','Replace file'),'replace',input));
            const remove=button(t('Hapus','Remove'),'remove',input,index);remove.setAttribute('aria-label',t('Hapus ','Remove ')+file.name);actions.append(remove);item.append(actions);fragment.append(item);
        });
        const help=document.createElement('p');help.className='field-helper upload-local-note';help.textContent=t('Periksa seluruh halaman dan tanda tangan. Pemeriksaan format bukan persetujuan admin.','Review every page and signature. A format check is not admin approval.');
        // Pendadaran has twelve slots; its shared reminder sits once above them instead of under every file.
        if(files.length&&!input.closest('#req-pendadaran'))fragment.append(help);
        panel.replaceChildren(fragment);input.disabled=busy(input);
        // Keep the original validation nodes and handlers as the source of truth.
        group.querySelectorAll('.dz-file-badge').forEach(node=>node.hidden=true);
        if(input.id==='case-reply-files'){const old=el('case-reply-file-list');if(old)old.hidden=true;}
    }
    /* Pendadaran: one working list. Each document is a row with its name and state. On entry the first missing
       required document opens with its instruction, template and picker; a failed file opens its own row; any row
       opens on demand. Selected File objects never move: rows only show or hide the existing controls. */
    const rowOpen=new Map();
    const rows=()=>[...document.querySelectorAll('#req-pendadaran [data-pendadaran-document]')];
    function rowState(input){
        const file=input.files[0];
        // A rejected file (too large, wrong type) is cleared by the validator and leaves the field marked invalid.
        if(!file&&input.getAttribute('aria-invalid')==='true')return ['error',t('Perlu diganti','Needs replacing')];
        if(!file)return registrationOptional(input.id)?['optional',t('Opsional','Optional')]:['missing',t('Belum dipilih','Not chosen')];
        if(fileProblem(file,input.accept))return ['error',t('Perlu diganti','Needs replacing')];
        return documentInspections.get(file)?.pending===false?['ready',t('Siap','Ready')]:['checking',t('Memeriksa…','Checking…')];
    }
    function renderRows(){
        for(const group of rows()){
            const input=group.querySelector('input[type="file"]'),label=input&&group.querySelector(`label[for="${input.id}"]`);if(!input)continue;
            let head=group.querySelector(':scope > .upload-row-toggle');
            if(!head){head=document.createElement('button');head.type='button';head.className='upload-row-toggle';head.innerHTML='<span class="upload-row-name"></span><span class="upload-row-state"></span>';group.id=input.id+'-row';head.setAttribute('aria-controls',group.id);group.prepend(head);label?.classList.add('upload-row-label','sr-only');}
            const [state,text]=rowState(input),open=rowOpen.get(input.id)===true||state==='error';
            const name=(label?.textContent||'').replace(/\s*\*\s*$/,'').trim(),shown=open&&['missing','optional'].includes(state)?(registrationOptional(input.id)?t('Opsional','Optional'):t('Wajib','Required')):text;
            const nameNode=head.querySelector('.upload-row-name'),stateNode=head.querySelector('.upload-row-state');
            if(nameNode.textContent!==name)nameNode.textContent=name;if(stateNode.textContent!==shown)stateNode.textContent=shown;
            head.dataset.state=state;head.setAttribute('aria-expanded',String(open));group.classList.toggle('is-collapsed',!open);
        }
    }
    // Entering the files step opens the first required document that still needs a file.
    function enterFiles(){
        if(el('reg-jenis-utama')?.value!=='Pendadaran')return null;
        rowOpen.clear();
        const first=rows().map(group=>group.querySelector('input[type="file"]')).find(input=>input&&!registrationOptional(input.id)&&['missing','error'].includes(rowState(input)[0]));
        if(first)rowOpen.set(first.id,true);renderRows();return first||null;
    }
    // Any route that focuses a file (checklist, validation, return from help) first opens its row.
    function reveal(field){
        const group=field?.closest?.('#req-pendadaran [data-pendadaran-document]');if(!group)return;
        const input=group.querySelector('input[type="file"]');if(input&&rowOpen.get(input.id)!==true){rowOpen.set(input.id,true);renderRows();}
    }
    function toggleTemplate(link){
        const field=link.dataset.guideField,existing=el(field+'-template');
        if(existing){existing.remove();link.setAttribute('aria-expanded','false');link.focus();return;}
        const label=(registrationSpecs('Pendadaran').find(([id])=>id===field)||[])[1]||'',match=window.IPCOSResources?.bestTemplate?.({service:'Pendadaran',field,label});
        const panel=document.createElement('div');panel.id=field+'-template';panel.className='upload-template-panel';panel.setAttribute('role','region');panel.setAttribute('aria-label',t('Template: ','Template: ')+systemText(label));
        panel.innerHTML=`<p class="upload-template-title" data-preserve-case>${match?escapeHtml(match.title):t('Template khusus untuk dokumen ini belum tersedia.','No specific template is available for this document yet.')}</p><div class="button-row">${match?`<a class="btn-primary" href="${escapeHtml(match.url)}" target="_blank" rel="noopener noreferrer">${t('Buka Template','Open Template')}</a>`:''}<button type="button" class="btn-secondary" data-guide="templates-faq" data-guide-field="${escapeHtml(field)}">${t('Semua Template & FAQ','All Templates & FAQ')}</button><button type="button" class="btn-secondary" data-template-close="${escapeHtml(field)}">${t('Tutup','Close')}</button></div>`;
        link.closest('.upload-guidance').after(panel);link.setAttribute('aria-controls',panel.id);link.setAttribute('aria-expanded','true');(panel.querySelector('a')||panel.querySelector('button')).focus();
    }
    document.addEventListener('click',event=>{
        // The template link in a Pendadaran row opens the exact template in place; the full library stays one tap away.
        const template=event.target.closest('#req-pendadaran .upload-guidance [data-guide="templates-faq"]');
        if(template&&currentUser.role==='mhs'){event.preventDefault();event.stopPropagation();toggleTemplate(template);return;}
        const close=event.target.closest('[data-template-close]');
        if(close){const field=close.dataset.templateClose;el(field+'-template')?.remove();const link=document.querySelector(`#${CSS.escape(field)}-guidance [data-guide="templates-faq"]`);link?.setAttribute('aria-expanded','false');link?.focus();return;}
        const head=event.target.closest('#req-pendadaran .upload-row-toggle');
        if(head){const input=head.parentElement.querySelector('input[type="file"]');if(!input)return;const open=head.getAttribute('aria-expanded')!=='true';rowOpen.set(input.id,open);renderRows();}
    },true);
    function refresh(){document.querySelectorAll(selector).forEach(render);renderRows();}
    async function inspect(input){
        const epoch=sessionEpoch,files=[...input.files];
        const tasks=files.filter(file=>!fileProblem(file,input.accept)).map(inspectDocument);
        render(input);renderRows();await Promise.all(tasks);
        if(epoch!==sessionEpoch||!input.isConnected||files.length!==input.files.length||files.some((file,index)=>file!==input.files[index]))return;
        render(input);renderRows();
    }
    document.addEventListener('change',event=>{const input=event.target;if(input.matches(selector))inspect(input);});
    document.addEventListener('click',event=>{
        const action=event.target.closest('[data-upload-action]');if(!action)return;
        const input=el(action.dataset.uploadInput);if(!input||!allowed(input)){event.preventDefault();event.stopImmediatePropagation();return;}
        if(action.dataset.uploadAction==='replace'){input.click();return;}
        if(action.dataset.uploadAction!=='remove')return;
        const index=Number(action.dataset.uploadIndex);if(!Number.isInteger(index)||!input.files[index])return;
        const transfer=new DataTransfer();[...input.files].forEach((file,i)=>{if(i!==index)transfer.items.add(file);});input.files=transfer.files;
        setFieldError(input.id,'');input.dispatchEvent(new Event('change',{bubbles:true}));input.focus();
    },true);
    // The correction form is created on demand; observe only its host, not the whole page.
    const host=el('case-action-panel');if(host)new MutationObserver(()=>{const input=el('case-reply-files');if(input&&!el(input.id+'-selection'))render(input);}).observe(host,{childList:true});
    window.IPCOSUploads=Object.freeze({refresh,enterFiles,reveal});refresh();
})();
