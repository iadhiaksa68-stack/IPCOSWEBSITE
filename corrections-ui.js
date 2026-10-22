/* Guide corrections inside the owned request; the existing API remains authoritative. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en),states=new WeakMap();
    const names={title:['Judul','Title'],oldSupervisor:['Dosen sekarang','Current supervisor'],newSupervisor:['Usulan dosen','Proposed supervisor'],reason:['Alasan','Reason']};
    const snapshot=item=>JSON.stringify([item.id,item.status,item.note,item.link,item.detail]);
    function owned(item){return item&&currentUser.role==='mhs'&&getSessionToken()&&isStudentOwner(item)&&String(item.status).toLowerCase()==='revision';}
    function fileReview(item,label){
        let logs=[];try{logs=JSON.parse(item.note||'[]');}catch(_){}if(!Array.isArray(logs))return null;
        const metadata=logs.flatMap(log=>Array.isArray(log.documents)?log.documents:[]).filter(doc=>doc.label===label).sort((a,b)=>Number(b.version)-Number(a.version));
        const files=getCaseFiles(item),url=metadata.length?files.find(file=>file.url===metadata[0].url)?.url:files.find(file=>file.label.replace(/^📄\s*/,'')===label)?.url;
        if(!url)return null;
        const reviews=logs.slice().reverse().find(log=>['document_review','request_type_change'].includes(log.kind))?.reviews;
        const review=Array.isArray(reviews)?reviews.find(review=>review.url===url&&review.status==='revision'):null;
        return review?{url,review}:null;
    }
    function notes(item,label){return String(fileReview(item,label)?.review.note||'');}
    function pageLink(item,label){const result=fileReview(item,label);return result?(window.IPCOSPageNotes?.link(item,result.url,result.review.pageRef)||''):'';}
    function instructions(item){
        const rev=getRevisionInstructions(item),interactive=owned(item),labels=[...new Set(rev.files)];
        return `<section class="revision-instructions correction-instructions"><h3>${t('Yang perlu Anda perbaiki','Corrections requested')}</h3><p class="preserve-lines" data-preserve-case>${escapeHtml(rev.instruction)}</p>${labels.map(label=>`<article class="correction-instruction"><h4>${escapeHtml(systemText(label))}</h4>${notes(item,label)?`<p class="preserve-lines" data-preserve-case>${escapeHtml(notes(item,label))}</p>`:''}${pageLink(item,label)}${interactive?`<button type="button" class="btn-secondary" data-correction-target="${escapeHtml(label)}" aria-label="${escapeHtml(t('Perbaiki ','Correct ')+systemText(label))}">${t('Perbaiki bagian ini','Correct this item')}</button>`:''}</article>`).join('')}</section>`;
    }
    function state(){
        const panel=el('case-action-panel'),item=currentCase();if(!panel||panel.hidden||panel.dataset.action!=='reply'||!owned(item))return null;
        let data=states.get(panel);if(!data||data.epoch!==sessionEpoch||data.id!==selectedCaseId){data={epoch:sessionEpoch,id:selectedCaseId,base:snapshot(item),signature:'',files:[],payload:null};states.set(panel,data);}return {panel,item,data};
    }
    function label(){return el('correction-summary')?t('Konfirmasi & Kirim Perbaikan','Confirm & Send Corrections'):t('Periksa Perbaikan','Review Corrections');}
    function refresh(){
        const current=state();if(!current){el('modal-case-detail')?.classList.remove('student-corrections-review');return;}
        const {panel,item}=current;
        panel.querySelectorAll('[name="correction-complete"]').forEach((input,index)=>{
            const requested=getRevisionInstructions(item).files[index];if(!requested)return;
            input.dataset.correctionLabel=requested;
            let row=input.closest('.correction-task');
            if(!row){const original=input.closest('label');row=document.createElement('div');row.className='correction-task';original.before(row);row.append(original);const hint=document.createElement('p');hint.className='field-helper preserve-lines';hint.dataset.correctionNote='';hint.dataset.preserveCase='';const link=document.createElement('button');link.type='button';link.className='text-link';link.dataset.correctionTarget=requested;row.append(hint,link);}
            const hint=row.querySelector('[data-correction-note]');hint.id='correction-task-note-'+index;
            const note=notes(item,requested);if(note)input.setAttribute('aria-describedby',hint.id);else input.removeAttribute('aria-describedby');
            const target=row.querySelector('[data-correction-target]');target.setAttribute('aria-label',t('Perbaiki ','Correct ')+systemText(requested));row.querySelector('[data-correction-note]').textContent=note;row.querySelector('[data-correction-note]').hidden=!note;
            target.textContent=t('Perbaiki bagian ini','Correct this item');
            let reference=row.querySelector('[data-correction-page-reference]');const html=pageLink(item,requested);
            if(!reference&&html){reference=document.createElement('div');reference.dataset.correctionPageReference='';target.before(reference);}
            if(reference){if(reference.ipcosPageReferenceHtml!==html){const focused=reference.contains(document.activeElement);reference.innerHTML=html;reference.ipcosPageReferenceHtml=html;if(focused)(reference.querySelector('button')||target).focus({preventScroll:true});}reference.hidden=!html;}
        });
        if(current.data.payload&&el('correction-summary'))renderSummary(current,current.data.payload);
        const feedback=el('case-action-feedback');if(feedback?.dataset.correctionNotice==='review'&&el('correction-summary'))feedback.textContent=t('Periksa ringkasan, lalu pilih Konfirmasi & Kirim Perbaikan.','Review the summary, then select Confirm & Send Corrections.');
        const form=el('case-revision-fields');if(form&&document.activeElement===form)form.querySelector('textarea')?.focus();
        if(!isPreparingCorrection&&!activeUpdateIds.has(selectedCaseId)&&el('btn-case-submit'))el('btn-case-submit').textContent=label();
        window.IPCOSStudentCorrections?.refresh();
    }
    function invalidate(){
        if(isPreparingCorrection||activeUpdateIds.has(selectedCaseId))return;
        const current=state();if(!current)return;
        current.data.signature='';current.data.payload=null;current.data.files=[];el('correction-summary')?.remove();
        el('modal-case-detail').classList.remove('student-corrections-review');
        const feedback=el('case-action-feedback');if(feedback?.dataset.correctionNotice==='review'){feedback.textContent='';delete feedback.dataset.correctionNotice;}
        if(!isPreparingCorrection&&el('btn-case-submit'))el('btn-case-submit').textContent=label();
    }
    function renderSummary(current,payload){
        el('modal-case-detail').classList.add('student-corrections-review');
        const restoreEdit=el('correction-summary')?.contains(document.activeElement)&&document.activeElement.matches('[data-correction-edit]');
        let root=el('correction-summary');if(!root){root=document.createElement('section');root.id='correction-summary';root.className='correction-summary';root.setAttribute('aria-labelledby','correction-summary-title');current.panel.append(root);}
        const fields=payload.correctedFields?.fields||{},form=el('case-revision-fields');
        let before={};try{before=JSON.parse(form?.dataset.originalFields||'{}');}catch(_){}
        root.innerHTML=`<h3 id="correction-summary-title" tabindex="-1">${t('Periksa sebelum mengirim ulang','Review before resubmitting')}</h3><p>${t('Perbaikan dikirim pada pengajuan yang sama. Periksa perubahan berikut sebelum mengonfirmasi.','Corrections stay in this request. Review the changes below before confirming.')}</p><ul class="correction-summary-files">${payload.files.map((file,index)=>`<li><strong>${escapeHtml(systemText(payload.labels[index]))}</strong><span data-preserve-case>${escapeHtml(file.name)} · ${formatFileSize(file.size)}</span></li>`).join('')}</ul>${Object.entries(fields).filter(([key])=>names[key]).map(([key,value])=>`<div class="correction-field-change"><h4>${t(...names[key])}</h4><p><span>${t('Sebelumnya:','Before:')}</span> <span data-preserve-case>${escapeHtml(before[key]??'')}</span></p><p><strong>${value===before[key]?t('Tetap:','Unchanged:'):t('Perbaikan:','After:')}</strong> <span data-preserve-case>${escapeHtml(value)}</span></p></div>`).join('')}<h4>${t('Penjelasan Anda','Your explanation')}</h4><p class="preserve-lines" data-preserve-case>${escapeHtml(payload.note)}</p><button type="button" class="btn-secondary" data-correction-edit>${t('Kembali memperbaiki','Back to editing')}</button>`;
        if(restoreEdit)root.querySelector('[data-correction-edit]').focus({preventScroll:true});
    }
    function review(payload){
        const current=state();if(!current)return false;
        if(snapshot(current.item)!==current.data.base)throw new Error(t('Instruksi pengajuan telah berubah. Isian Anda masih tersedia; segarkan pengajuan sebelum mengirim.','The request instructions changed. Your inputs are still available; refresh the request before sending.'));
        const actualFiles=[...el('case-reply-files').files],actualFields=Object.fromEntries([...current.panel.querySelectorAll('[data-correction-field]')].map(input=>[input.dataset.correctionField,input.value.trim()]));
        if(actualFiles.length!==payload.files.length||actualFiles.some((file,index)=>file!==payload.files[index])||el('case-reply-note').value.trim()!==payload.note||JSON.stringify(revisionFileLabels(actualFiles,current.item))!==JSON.stringify(payload.labels)||(payload.correctedFields&&JSON.stringify(actualFields)!==JSON.stringify(payload.correctedFields.fields))||[...current.panel.querySelectorAll('[name=correction-complete]')].some(input=>!input.checked))throw new Error(t('Isian berubah saat berkas diperiksa. Periksa perbaikan sekali lagi.','Inputs changed while files were checked. Review the corrections again.'));
        const signature=JSON.stringify([payload.labels,payload.note,payload.correctedFields,payload.files.map(file=>[file.name,file.size,file.lastModified])]);
        if(el('correction-summary')&&current.data.signature===signature&&payload.files.every((file,index)=>file===current.data.files[index]))return true;
        current.data.signature=signature;current.data.files=payload.files.slice();current.data.payload=payload;renderSummary(current,payload);
        el('correction-summary-title').focus();el('correction-summary').scrollIntoView({block:'start',behavior:'instant'});return false;
    }
    function target(label){
        const item=currentCase();if(!owned(item)||isPreparingCorrection||activeUpdateIds.has(selectedCaseId))return;
        caseDetailAction('reply');refresh();
        if(window.IPCOSStudentCorrections?.selectLabel(label))return;
        if(label!=='Isian pengajuan')el('case-action-panel').dataset.correctionTarget=label;
        const field=label==='Isian pengajuan'?el('case-revision-fields')?.querySelector('textarea,input,button'):el('case-reply-files');
        if(field){field.scrollIntoView({block:'center',behavior:'instant'});field.focus();}
        else {const form=el('case-revision-fields');if(form){form.tabIndex=-1;form.focus();}}
    }
    function busy(value){
        const current=state();if(!current)return;
        if(value){current.data.locks=[...current.panel.querySelectorAll('textarea,select,[name=correction-complete],[data-correction-target],[data-correction-edit],[data-open-note-page]')].map(node=>[node,node.disabled]);current.data.locks.forEach(([node])=>node.disabled=true);}
        else {current.data.locks?.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=disabled;});delete current.data.locks;}
        window.IPCOSStudentCorrections?.refresh();
    }
    document.addEventListener('click',event=>{
        const control=event.target.closest('[data-correction-target]');if(control)target(control.dataset.correctionTarget);
        if(event.target.closest('[data-correction-edit]')){invalidate();el('case-reply-note')?.focus();}
    });
    ['input','change'].forEach(name=>document.addEventListener(name,event=>{
        if(event.target.closest('#case-action-panel')&&event.target.matches('input,textarea,select'))invalidate();
        if(name==='change'&&event.target.id==='case-reply-files'){
            const panel=el('case-action-panel'),select=el('revision-label-0'),target=panel.dataset.correctionTarget;
            if(event.target.files.length===1&&select&&!select.value&&[...select.options].some(option=>option.value===target)){select.value=target;select.dispatchEvent(new Event('change',{bubbles:true}));}
            delete panel.dataset.correctionTarget;
        }
    }));
    window.IPCOSCorrections=Object.freeze({instructions,refresh,review,label,busy});
})();
