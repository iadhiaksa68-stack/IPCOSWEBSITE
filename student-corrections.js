/* A focused correction editor; the original form and confirmed submission remain authoritative. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en),states=new WeakMap();
    const stamp=item=>JSON.stringify([String(item.id),item.status,item.note,item.link,item.detail]);
    const participant=item=>item&&currentUser.role==='mhs'&&getSessionToken()&&isStudentOwner(item);
    const owned=item=>participant(item)&&String(item.status).trim().toLowerCase()==='revision';
    const locked=()=>isPreparingCorrection||activeUpdateIds.has(selectedCaseId);
    const set=(node,text)=>{if(node&&node.textContent!==text)node.textContent=text;};
    let current=null,serial=0;
    const visible=()=>el('modal-case-detail')?.style.display==='flex'&&el('modal-case-detail').style.opacity!=='0';
    function live(data){return data&&!data.closed&&visible()&&data.epoch===sessionEpoch&&data.token===getSessionToken()&&data.panel.isConnected&&data.panel===el('case-action-panel')&&data.id===selectedCaseId&&participant(currentCase());}
    const stale=data=>!live(data)||stamp(currentCase())!==data.base;
    function selected(data){return [...data.input.files].map((file,index)=>({file,index,label:el('revision-label-'+index)?.value||''}));}
    function source(item,label){
        let logs=[];try{logs=JSON.parse(item.note||'[]');}catch(_){}if(!Array.isArray(logs))logs=[];
        const files=getCaseFiles(item),metadata=logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]).filter(doc=>doc&&doc.label===label).sort((a,b)=>Number(b.version)-Number(a.version));
        const file=metadata.length?files.find(file=>file.url===metadata[0].url):files.find(file=>file.label.replace(/^📄\s*/,'')===label);
        if(!file)return {note:'',url:'',name:'',pageRef:null};
        const reviews=logs.slice().reverse().find(log=>['document_review','request_type_change'].includes(log.kind))?.reviews;
        const review=Array.isArray(reviews)?reviews.find(review=>review.url===file.url&&review.status==='revision'):null;
        return {url:file.url,name:String(metadata[0]?.fileName||file.label),note:typeof review?.note==='string'?review.note:'',pageRef:window.IPCOSPageNotes?.normalize(review?.pageRef)||null,...caseDocumentReadingContext(item,file.url)};
    }
    function clearReader(data){
        data.readerGeneration++;const panel=data.root.querySelector('#correction-workspace-preview');
        if(panel){window.IPCOSDocuments?.reset(panel);panel.replaceChildren(Object.assign(document.createElement('p'),{className:'field-helper'}));panel.removeAttribute('aria-busy');}
        if(data.blob){URL.revokeObjectURL(data.blob);data.blob='';}
    }
    function reset(){window.IPCOSCorrectionDrafts?.detach();if(current){current.closed=true;current.pending.clear();clearReader(current);}current=null;el('modal-case-detail')?.classList.remove('student-correction-workspace');}
    function feedback(data,value){const node=data.root.querySelector('[data-correction-workspace-preview-status]');set(node,value);node.hidden=!value;}
    async function readSource(data,reference=null){
        if(!live(data))return;clearReader(data);
        const task=data.tasks[data.index],panel=data.root.querySelector('#correction-workspace-preview'),retry=data.root.querySelector('[data-correction-workspace-retry]');retry.hidden=true;
        if(stale(data)){feedback(data,t('Instruksi berubah. Isian Anda tetap tersedia; buka ulang pengajuan setelah menyimpan salinan yang diperlukan.','The instructions changed. Your inputs remain available; reopen the request after keeping any needed copies.'));return;}
        if(task.fields){feedback(data,'');return;}
        const doc=task.source;
        if(!doc.url){feedback(data,t('Dokumen sebelumnya belum tersedia. Anda tetap dapat memilih berkas penggantinya.','The previous document is unavailable. You can still choose its replacement.'));return;}
        if(!isPrivateDriveUrl(doc.url)){feedback(data,t('Gunakan Buka Berkas Asli untuk membaca dokumen ini.','Use Open Original File to read this document.'));return;}
        const run=data.readerGeneration,epoch=sessionEpoch,token=getSessionToken();panel.setAttribute('aria-busy','true');feedback(data,t('Memuat dokumen yang diperiksa admin…','Loading the document reviewed by admin…'));
        const fresh=()=>live(data)&&!stale(data)&&run===data.readerGeneration&&epoch===sessionEpoch&&token===getSessionToken()&&data.tasks[data.index]===task;
        try{
            const response=await apiPost(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'get_document',id:data.id,url:doc.url})}),result=await readApiResult(response);
            if(!fresh())return;
            if(result.status!=='success'||typeof result.base64!=='string'||!result.base64.length||result.base64.length>13981016)throw Error('Unreadable document');
            const bytes=Uint8Array.from(atob(result.base64),value=>value.charCodeAt(0));if(!bytes.length)throw Error('Empty document');
            const name=String(result.fileName||doc.name).replace(/[\\/\x00-\x1f]/g,'_'),mime=window.IPCOSDocuments.trustedMime(bytes,String(result.mimeType||'application/octet-stream'),name);
            if(!fresh())return;
            data.blob=URL.createObjectURL(new Blob([bytes],{type:mime}));
            window.IPCOSDocuments.render(panel,data.blob,mime,name,{requestId:data.id,documentUrl:doc.url,version:doc.version,pageRef:reference||doc.pageRef,focusReference:!!reference});feedback(data,'');
        }catch(_){if(fresh()){feedback(data,t('Dokumen gagal dimuat. Coba Lagi atau buka berkas asli; pilihan pengganti Anda tetap tersedia.','The document failed to load. Try Again or open the original; your selected replacement remains available.'));retry.hidden=false;}}
        finally{if(fresh())panel.setAttribute('aria-busy','false');}
    }
    function mount(panel,item){
        const input=el('case-reply-files');if(!input)return null;
        const requested=[...new Set(getRevisionInstructions(item).files)],allowed=caseDocumentOptions(item);
        const labels=requested.length?requested.filter(label=>label==='Isian pengajuan'||allowed.includes(label)):allowed;
        if(!labels.length)return null;
        clearCaseBlobUrls(true);
        const root=document.createElement('section');root.id='student-correction-workspace';root.dataset.preserveCase='';root.setAttribute('aria-labelledby','correction-workspace-heading');
        root.innerHTML=`<header class="correction-workspace-heading"><div><h3 id="correction-workspace-heading"></h3><p id="correction-workspace-intro"></p></div></header><p class="field-error" id="correction-workspace-stale" role="status" hidden></p><details class="correction-workspace-instructions"><summary></summary><p class="preserve-lines" data-preserve-case></p></details><nav class="correction-workspace-tasklist" aria-label="${t('Bagian yang diperbaiki','Correction tasks')}"></nav><div class="correction-workspace-nav"><p id="correction-workspace-position" role="status"></p></div><div class="correction-workspace-grid"><section class="correction-workspace-document"><h4 id="correction-workspace-document-heading"></h4><p class="correction-workspace-source" data-preserve-case></p><div class="button-row"><a class="btn-secondary" data-correction-workspace-original target="_blank" rel="noopener noreferrer"></a><button type="button" class="btn-secondary" data-correction-workspace-retry hidden></button></div><p class="field-helper" data-correction-workspace-preview-status role="status" hidden></p><div id="correction-workspace-preview"><p class="field-helper"></p></div></section><section class="correction-workspace-editor"><h4 id="correction-workspace-title" tabindex="-1"></h4><div class="correction-workspace-note"><strong id="correction-workspace-note-title"></strong><p data-preserve-case></p><div data-correction-workspace-reference></div></div><div id="correction-workspace-fields"></div><div class="correction-workspace-upload"><label for="correction-workspace-upload"></label><input type="file" id="correction-workspace-upload" data-correction-workspace-upload><p class="field-helper" id="correction-workspace-upload-hint"></p><p class="field-error" data-correction-workspace-upload-error role="status" hidden></p><div class="correction-workspace-file-card" hidden></div><p class="field-helper" data-correction-workspace-upload-status role="status"></p></div><div id="correction-workspace-confirmation"></div></section></div><div class="correction-workspace-controls"><button type="button" class="btn-secondary" data-correction-workspace-previous></button><button type="button" class="btn-secondary" data-correction-workspace-next></button><p id="correction-workspace-retention"></p></div>`;
        const data={root,panel,input,id:String(item.id),epoch:sessionEpoch,token:getSessionToken(),base:stamp(item),index:0,view:'editor',tasks:labels.map(label=>({label,fields:label==='Isian pengajuan',source:source(item,label)})),readerGeneration:0,blob:'',pending:new Map(),errors:new Map(),closed:false};
        const views=document.createElement('div');views.className='correction-workspace-mobile-tabs';views.setAttribute('role','group');
        root.querySelector('#correction-workspace-heading').tabIndex=-1;
        views.innerHTML='<button type="button" class="btn-secondary" data-correction-workspace-view="document"></button><button type="button" class="btn-secondary" data-correction-workspace-view="editor"></button>';root.querySelector('.correction-workspace-nav').append(views);
        panel.querySelector(':scope>h3')?.classList.add('correction-workspace-legacy-heading');
        const canonical=document.createElement('div');canonical.className='correction-workspace-canonical';
        const inputLabel=panel.querySelector('label[for="case-reply-files"]'),helper=input.nextElementSibling;
        input.before(canonical);if(inputLabel)canonical.append(inputLabel);canonical.append(input);
        if(helper?.matches('p.field-helper'))canonical.append(helper);
        ['revision-associations','case-reply-files-selection','case-reply-file-list','case-reply-files-error'].forEach(id=>{if(el(id))canonical.append(el(id));});
        canonical.before(root);
        const options=panel.querySelector('.revision-file-options');if(options)root.querySelector('#correction-workspace-confirmation').append(options);
        const fields=el('case-revision-fields');if(fields)root.querySelector('#correction-workspace-fields').append(fields);
        root.querySelector('[data-correction-workspace-upload]').accept=input.accept;
        const picker=document.createElement('div');picker.className='correction-workspace-picker';picker.innerHTML='<span data-correction-workspace-picker-label aria-hidden="true"></span>';const upload=root.querySelector('[data-correction-workspace-upload]');upload.before(picker);picker.append(upload);
        const nav=root.querySelector('nav');data.tasks.forEach((task,index)=>{const button=document.createElement('button');button.type='button';button.className='btn-secondary';button.dataset.correctionWorkspaceTask=String(index);button.innerHTML='<strong></strong><small></small>';nav.append(button);});
        root.addEventListener('click',event=>{
            const reference=event.target.closest('[data-open-note-page]');if(reference){event.preventDefault();const target=window.IPCOSPageNotes?.fromButton(reference);if(!locked()&&target&&target.id===data.id&&target.url===data.tasks[data.index].source.url){data.view='document';render(data);readSource(data,target.pageRef);}return;}
            const button=event.target.closest('button');if(!button)return;
            if(button.hasAttribute('data-correction-workspace-view')){if(!locked()){data.view=button.dataset.correctionWorkspaceView==='document'?'document':'editor';render(data);}}
            else if(button.hasAttribute('data-correction-workspace-task'))openTask(Number(button.dataset.correctionWorkspaceTask));
            else if(button.hasAttribute('data-correction-workspace-next'))openTask(data.index+1);
            else if(button.hasAttribute('data-correction-workspace-previous'))openTask(data.index-1);
            else if(button.hasAttribute('data-correction-workspace-retry'))readSource(data);
            else if(button.hasAttribute('data-correction-workspace-remove'))remove(data);
        });
        states.set(panel,data);return data;
    }
    function renderFile(data,task){
        const root=data.root,row=selected(data).find(row=>row.label===task.label),card=root.querySelector('.correction-workspace-file-card'),pending=data.pending.has(task.label),error=data.errors.get(task.label);
        const uploader=root.querySelector('[data-correction-workspace-upload]');uploader.disabled=locked()||stale(data)||pending;
        const errorNode=root.querySelector('[data-correction-workspace-upload-error]');set(errorNode,error?systemText(error):'');errorNode.hidden=!error;uploader.setAttribute('aria-invalid',String(!!error));uploader.setAttribute('aria-describedby','correction-workspace-upload-hint'+(error?' correction-workspace-upload-error':''));errorNode.id='correction-workspace-upload-error';
        const status=root.querySelector('[data-correction-workspace-upload-status]');set(status,pending?t('Memeriksa format pengganti…','Checking the replacement format…'):row?t('Dipilih di perangkat · belum dikirim','Selected on this device · not sent'):t('Belum ada berkas pengganti dipilih.','No replacement file selected.'));
        set(root.querySelector('[data-correction-workspace-picker-label]'),row?t('Ganti Berkas Pengganti','Replace Selected File'):t('Pilih Berkas','Choose File'));root.querySelector('.correction-workspace-picker').classList.toggle('is-disabled',uploader.disabled);
        card.hidden=!row;
        if(row){
            const key=JSON.stringify([currentLang,row.file.name,row.file.size,row.index,locked(),pending,stale(data)]);
            if(card.ipcosFile!==row.file||card.dataset.renderKey!==key){
                const focused=card.contains(document.activeElement),action=document.activeElement?.hasAttribute('data-correction-workspace-remove')?'remove':'preview';
                const title=document.createElement('strong');title.dataset.preserveCase='';title.textContent=row.file.name;const meta=document.createElement('span');meta.textContent=formatFileSize(row.file.size);
                const buttons=document.createElement('div');buttons.className='button-row';const preview=document.createElement('button');preview.type='button';preview.className='btn-secondary';preview.dataset.correctionWorkspacePreviewReplacement='';preview.dataset.localPreview=data.input.id;preview.dataset.localPreviewIndex=String(row.index);preview.textContent=t('Pratinjau Pengganti','Preview Replacement');preview.disabled=locked()||pending;
                const removeButton=document.createElement('button');removeButton.type='button';removeButton.className='btn-secondary';removeButton.dataset.correctionWorkspaceRemove='';removeButton.textContent=t('Hapus Pengganti','Remove Replacement');removeButton.disabled=locked()||pending||stale(data);buttons.append(preview,removeButton);card.replaceChildren(title,meta,buttons);card.ipcosFile=row.file;card.dataset.renderKey=key;
                if(focused)card.querySelector(action==='remove'?'[data-correction-workspace-remove]':'[data-correction-workspace-preview-replacement]')?.focus({preventScroll:true});
            }
        }
    }
    function render(data){
        if(!live(data))return;const root=data.root,task=data.tasks[data.index],isStale=stale(data),busy=locked();
        el('modal-case-detail').classList.add('student-correction-workspace');root.dataset.taskKind=task.fields?'fields':'file';root.dataset.mobileView=task.fields?'editor':data.view;
        const views=root.querySelector('.correction-workspace-mobile-tabs');views.setAttribute('aria-label',t('Tampilan bagian revisi','Correction item view'));views.querySelectorAll('button').forEach(button=>{set(button,button.dataset.correctionWorkspaceView==='document'?t('Dokumen','Document'):t('Perbaikan','Correction'));button.setAttribute('aria-pressed',String(button.dataset.correctionWorkspaceView===data.view));button.disabled=busy;});
        set(root.querySelector('#correction-workspace-heading'),t('Perbaiki satu bagian dahulu','Correct one item at a time'));set(root.querySelector('#correction-workspace-intro'),t('Baca catatan, periksa dokumen, lalu pilih berkas pengganti yang sesuai.','Read the note, review the document, then choose its matching replacement.'));
        const instructions=root.querySelector('.correction-workspace-instructions');set(instructions.querySelector('summary'),t('Instruksi umum admin','Admin instructions'));set(instructions.querySelector('p'),getRevisionInstructions(currentCase()).instruction);instructions.hidden=!instructions.querySelector('p').textContent;
        const warning=root.querySelector('#correction-workspace-stale');set(warning,t('Pengajuan diperbarui. Isian dan pilihan berkas Anda tetap tersedia; periksa perubahan terbaru sebelum melanjutkan.','The request was updated. Your fields and selected files remain available; review the latest changes before continuing.'));warning.hidden=!isStale;
        root.querySelectorAll('[data-correction-workspace-task]').forEach((button,index)=>{const item=data.tasks[index],row=selected(data).find(row=>row.label===item.label),checkbox=[...data.panel.querySelectorAll('[name="correction-complete"]')].find(input=>input.dataset.correctionLabel===item.label);button.disabled=busy;button.setAttribute('aria-pressed',String(index===data.index));set(button.querySelector('strong'),documentText(item.label));set(button.querySelector('small'),data.pending.has(item.label)?t('Memeriksa…','Checking…'):!item.fields&&!row?t('Pilih pengganti','Choose replacement'):checkbox?.checked?t('Dikonfirmasi','Confirmed'):row?t('Pengganti dipilih','Replacement selected'):t('Isian pengajuan','Request details'));});
        set(root.querySelector('#correction-workspace-position'),t('Bagian ','Item ')+(data.index+1)+t(' dari ',' of ')+data.tasks.length);set(root.querySelector('#correction-workspace-title'),documentText(task.label));
        const documentPane=root.querySelector('.correction-workspace-document');documentPane.hidden=task.fields;root.querySelector('.correction-workspace-grid').classList.toggle('is-fields-only',task.fields);
        set(root.querySelector('#correction-workspace-document-heading'),t('Dokumen yang diperiksa admin','Document reviewed by admin'));set(root.querySelector('.correction-workspace-source'),task.source.name);
        const original=root.querySelector('[data-correction-workspace-original]');original.hidden=!task.source.url;if(task.source.url)original.href=task.source.url;else original.removeAttribute('href');set(original,t('Buka Berkas Asli','Open Original File'));set(root.querySelector('[data-correction-workspace-retry]'),t('Coba Lagi','Try Again'));root.querySelector('[data-correction-workspace-retry]').disabled=busy||isStale;
        const note=root.querySelector('.correction-workspace-note');set(note.querySelector('strong'),t('Catatan admin untuk bagian ini','Admin note for this item'));set(note.querySelector('p'),task.source.note||getRevisionInstructions(currentCase()).instruction||t('Periksa bagian ini sesuai instruksi admin.','Review this item as requested by admin.'));
        const reference=note.querySelector('[data-correction-workspace-reference]'),html=window.IPCOSPageNotes?.link(currentCase(),task.source.url,task.source.pageRef)||'';if(reference.ipcosHtml!==html){reference.innerHTML=html;reference.ipcosHtml=html;}reference.querySelectorAll('button').forEach(button=>button.disabled=busy||isStale);
        const fields=el('case-revision-fields'),fieldHost=root.querySelector('#correction-workspace-fields');if(fields&&fields.parentElement!==fieldHost)fieldHost.append(fields);fieldHost.hidden=!task.fields;
        root.querySelector('.correction-workspace-upload').hidden=task.fields;set(root.querySelector('label[for="correction-workspace-upload"]'),t('Pilih berkas pengganti','Choose replacement file'));set(root.querySelector('#correction-workspace-upload-hint'),t('Maksimal 10 MB per berkas. Memilih ulang mengganti berkas untuk bagian ini saja.','Maximum 10 MB per file. Choosing again replaces only this item’s file.'));
        data.panel.querySelectorAll('.correction-task').forEach(row=>{const input=row.querySelector('[name="correction-complete"]');row.classList.toggle('is-active',input?.dataset.correctionLabel===task.label);});
        set(root.querySelector('[data-correction-workspace-previous]'),t('Sebelumnya','Previous'));set(root.querySelector('[data-correction-workspace-next]'),t('Berikutnya','Next'));root.querySelector('[data-correction-workspace-previous]').disabled=busy||data.index===0;root.querySelector('[data-correction-workspace-next]').disabled=busy||data.index===data.tasks.length-1;
        set(root.querySelector('#correction-workspace-retention'),t('Isian dan pilihan berkas tetap tersedia saat berpindah bagian di ruang revisi ini.','Fields and selected files remain available when switching items in this correction workspace.'));renderFile(data,task);window.IPCOSDocuments?.languageChanged();
    }
    function refresh(){
        const panel=el('case-action-panel'),item=currentCase();if(!visible()||!panel||panel.hidden||panel.dataset.action!=='reply'||!participant(item)){if(current)reset();return;}
        let data=states.get(panel);if(data?.closed&&data.input===el('case-reply-files'))return;if(!data||data.closed){if(!owned(item))return;if(current)reset();data=mount(panel,item);if(!data)return;current=data;render(data);el('case-detail-content').scrollTop=0;data.root.querySelector('#correction-workspace-heading').focus({preventScroll:true});readSource(data);window.IPCOSCorrectionDrafts?.refresh();return;}
        current=data;render(data);if(stale(data)&&!data.stale){data.stale=true;el('correction-summary')?.remove();el('modal-case-detail').classList.remove('student-corrections-review');clearReader(data);feedback(data,t('Pengajuan berubah. Dokumen sebelumnya telah ditutup; isian Anda tetap tersedia.','The request changed. The previous document was closed; your inputs remain available.'));}else if(!stale(data)&&data.stale){data.stale=false;readSource(data);}
        window.IPCOSCorrectionDrafts?.refresh();
    }
    function openTask(index,focus=true){
        const data=current;if(!live(data)||locked()||!Number.isInteger(index)||index<0||index>=data.tasks.length)return false;
        data.view='editor';if(data.index!==index){data.index=index;data.root.querySelector('[data-correction-workspace-upload]').value='';render(data);readSource(data);}else render(data);
        if(focus){const target=data.tasks[index].fields?data.root.querySelector('#correction-workspace-fields textarea')||data.root.querySelector('#correction-workspace-title'):data.root.querySelector('#correction-workspace-title');target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',behavior:'instant'});}window.IPCOSCorrectionDrafts?.positionChanged();return true;
    }
    function commit(data,rows){
        if(!live(data)||locked()||stale(data))return false;
        const transfer=new DataTransfer();rows.forEach(row=>transfer.items.add(row.file));data.input.files=transfer.files;data.input.dispatchEvent(new Event('change',{bubbles:true}));
        rows.forEach((row,index)=>{const select=el('revision-label-'+index);if(select&&[...select.options].some(option=>option.value===row.label)){select.value=row.label;select.dispatchEvent(new Event('change',{bubbles:true}));}});
        data.panel.dataset.dirty='true';render(data);return true;
    }
    async function choose(data,label,file){
        if(!live(data)||locked()||stale(data)||!file||data.pending.has(label))return;
        const basic=fileProblem(file,data.input.accept);if(basic){data.errors.set(label,basic);render(data);return;}
        const job=++serial;data.pending.set(label,job);data.errors.delete(label);data.panel.dataset.dirty='true';render(data);
        try{
            const inspection=await inspectDocument(file);if(!live(data)||data.pending.get(label)!==job)return;
            if(inspection.error)throw Error(systemText(inspection.error));
            if(stale(data))throw Error(t('Instruksi berubah. Berkas sebelumnya tetap dipilih.','The instructions changed. Your previous file is still selected.'));
            const rows=selected(data),index=rows.findIndex(row=>row.label===label),kept=rows.filter(row=>row.label!==label);kept.splice(index<0?kept.length:Math.min(index,kept.length),0,{file,label});
            if(kept.length>5||kept.reduce((sum,row)=>sum+row.file.size,0)>20*1024*1024)throw Error(t('Kirim maksimal 5 berkas dengan total ukuran hingga 20 MB.','Send up to 5 files with a total size of 20 MB.'));
            commit(data,kept);
        }catch(error){if(live(data))data.errors.set(label,error.message);}
        finally{if(live(data)&&data.pending.get(label)===job){data.pending.delete(label);render(data);}}
    }
    function remove(data){if(!live(data)||locked()||stale(data))return;const task=data.tasks[data.index];if(data.pending.has(task.label))return;window.IPCOSCorrectionDrafts?.forgetFile(task.label);data.errors.delete(task.label);commit(data,selected(data).filter(row=>row.label!==task.label));data.root.querySelector('[data-correction-workspace-upload]').focus({preventScroll:true});}
    function revealIssue(field){
        if(!live(current)||locked())return false;let index=-1;
        if(field?.matches('[data-correction-field]')||[...current.panel.querySelectorAll('[data-correction-field]')].some(node=>!node.value.trim()))index=current.tasks.findIndex(task=>task.fields);
        if(index<0){const unchecked=[...current.panel.querySelectorAll('[name="correction-complete"]')].find(node=>!node.checked);if(unchecked)index=current.tasks.findIndex(task=>task.label===unchecked.dataset.correctionLabel);}
        if(index<0)index=current.tasks.findIndex(task=>!task.fields&&!selected(current).some(row=>row.label===task.label));
        return index>=0?openTask(index):false;
    }
    document.addEventListener('change',event=>{const input=event.target;if(input.matches('[data-correction-workspace-upload]')){const data=current,file=input.files[0],label=data?.tasks[data.index]?.label;input.value='';if(data&&label)choose(data,label,file);}else if(current&&input.closest('#case-action-panel'))render(current);});
    window.addEventListener('ipcos:logout',reset);
    window.IPCOSStudentCorrections=Object.freeze({refresh,openTask,context:()=>live(current)?{id:current.id,label:current.tasks[current.index].label,labels:current.tasks.map(task=>task.label),index:current.index,stale:stale(current)}:null,selectLabel:label=>{const index=current?.tasks.findIndex(task=>task.label===label)??-1;return index>=0&&openTask(index);},active:()=>live(current)?current.index:null,preparing:()=>live(current)&&current.pending.size>0,revealIssue,reset});
})();
