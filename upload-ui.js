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
        heading.textContent=files.length?t('Dipilih di perangkat · belum dikirim','Selected on this device · not sent'):t('Belum ada berkas dipilih','No file selected');fragment.append(heading);
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
        if(files.length)fragment.append(help);
        panel.replaceChildren(fragment);input.disabled=busy(input);
        // Keep the original validation nodes and handlers as the source of truth.
        group.querySelectorAll('.dz-file-badge').forEach(node=>node.hidden=true);
        if(input.id==='case-reply-files'){const old=el('case-reply-file-list');if(old)old.hidden=true;}
    }
    function refresh(){document.querySelectorAll(selector).forEach(render);}
    async function inspect(input){
        const epoch=sessionEpoch,files=[...input.files];
        const tasks=files.filter(file=>!fileProblem(file,input.accept)).map(inspectDocument);
        render(input);await Promise.all(tasks);
        if(epoch!==sessionEpoch||!input.isConnected||files.length!==input.files.length||files.some((file,index)=>file!==input.files[index]))return;
        render(input);
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
    window.IPCOSUploads=Object.freeze({refresh});refresh();
})();
