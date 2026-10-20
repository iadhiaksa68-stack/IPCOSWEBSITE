/* Per-file review and reversible archives. Existing login and request history remain. */
(() => {
    const t=(id,en)=>uxText(id,en),el=id=>document.getElementById(id);
    const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
    let supported=null,capEpoch=-1,capPending=null;
    let baseRecord=null,editingId='',draft=[],dirty=false,saving=false,archiveBusy=false,retry=null;
    const invalidNotes=new Set(),invalidResults=new Set();
    const logs=item=>{try{const value=JSON.parse(item.note||'[]');return Array.isArray(value)?value:[];}catch(_){return [];}};
    const archive=item=>logs(item).slice().reverse().find(log=>log.kind==='archive')||null;
    const archived=item=>archive(item)?.archived===true;
    function documents(item) {
        const metadata=logs(item).flatMap(log=>Array.isArray(log.documents)?log.documents:[]),latest=new Map();
        metadata.forEach(doc=>{if(!latest.has(doc.label)||Number(doc.version)>Number(latest.get(doc.label).version))latest.set(doc.label,doc);});
        const files=getCaseFiles(item).map(file=>({...file,document:metadata.slice().reverse().find(doc=>doc.url===file.url)})).filter(file=>!file.document||latest.get(file.document.label)?.url===file.url).map(file=>({url:file.url,label:file.document?.label||file.label.replace(/^📄\s*/,''),fileName:file.document?.fileName||file.label}));
        return [...new Map(files.map(file=>[file.url,file])).values()];
    }
    function reviews(item) {
        const previous=logs(item).slice().reverse().find(log=>['document_review','request_type_change'].includes(log.kind))?.reviews||[];
        return documents(item).map(file=>({...file,status:previous.find(review=>review.url===file.url)?.status||'pending',note:previous.find(review=>review.url===file.url)?.note||''}));
    }
    const statusName=status=>status==='accepted'?t('Sudah Sesuai','Meets Requirements'):status==='revision'?t('Perlu Perbaikan','Needs Corrections'):t('Belum Diperiksa','Not Reviewed');
    const missingNoteMessage=()=>t('Isi catatan untuk setiap berkas yang perlu diperbaiki.','Write a note for each file needing corrections.');
    function refreshNoteFeedback() {
        draft.forEach((review,index)=>{
            if(review.status!=='pending')invalidResults.delete(index);
            setFieldError('document-review-status-'+index,invalidResults.has(index)?t('Pilih hasil pemeriksaan sebelum melanjutkan.','Choose a review result before continuing.'):'');
            const input=el('document-review-note-'+index);if(!input)return;
            const required=review.status==='revision';input.required=required;
            if(!required||review.note.trim())invalidNotes.delete(index);
            const hintId=input.id+'-hint';let hint=el(hintId);
            if(!hint){hint=document.createElement('p');hint.id=hintId;hint.className='field-helper';input.after(hint);}
            hint.textContent=(required?t('Wajib untuk menjelaskan perbaikan.','Required to explain corrections.'):t('Opsional.','Optional.'))+' '+t('Maksimal 2.000 karakter.','Maximum 2,000 characters.');
            setFieldError(input.id,invalidNotes.has(index)?missingNoteMessage():'');
        });
        if(invalidNotes.size&&el('document-review-feedback'))el('document-review-feedback').textContent=missingNoteMessage();
    }
    async function version(item) {
        // The data endpoint formats detail/status for display. Use its raw-row
        // snapshot token so presentation changes cannot create false conflicts.
        if(typeof item.reviewVersion==='string'&&/^[a-f0-9]{64}$/.test(item.reviewVersion))return item.reviewVersion;
        const bytes=new TextEncoder().encode(JSON.stringify([String(item.id),String(item.status),String(item.detail),String(item.note),String(item.link)]));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    }
    async function api(data,epoch=sessionEpoch) {
        const response=await apiPost(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(data)}),result=await readApiResult(response);
        if(epoch!==sessionEpoch)throw Object.assign(new Error('Session changed'),{staleSession:true});
        if(result.status!=='success')throw new Error(result.message||t('Perubahan belum tersimpan.','The change was not saved.'));
        return result;
    }
    function updateNote(id,note,reviewVersion) {
        if(typeof note!=='string')throw new Error(t('Konfirmasi penyimpanan tidak lengkap. Segarkan data.','The save confirmation is incomplete. Refresh the data.'));
        const records=readStoredJSON(sessionStorage,'ipcos_registrations',[]),item=records.find(item=>String(item.id)===String(id));if(item){item.note=note;if(typeof reviewVersion==='string'&&/^[a-f0-9]{64}$/.test(reviewVersion))item.reviewVersion=reviewVersion;else delete item.reviewVersion;}
        sessionStorage.setItem('ipcos_registrations',JSON.stringify(records));return item;
    }
    const editable=item=>currentUser.role==='admin'&&['pending','resubmitted'].includes(String(item?.status).trim().toLowerCase())&&!archived(item);
    function activeReviewIndex(){
        const item=currentCase(),index=Number(el('case-detail-content')?.dataset.activeDocumentIndex);
        if(!item||!el('case-detail-content')?.hasAttribute('data-active-document-index'))return -1;
        const file=getCaseFiles(item)[index];return file?draft.findIndex(review=>review.url===file.url):-1;
    }
    function nextPending(index){for(let offset=1;offset<=draft.length;offset++){const next=(index+offset+draft.length)%draft.length;if(next!==index&&draft[next].status==='pending')return next;}return -1;}
    function reviewView(focusNote=false){
        el('modal-case-detail').dataset.workspaceView='review';syncToggle();
        if(focusNote){const target=el('document-review-note-'+activeReviewIndex())||el('active-review-title');target?.focus({preventScroll:true});target?.scrollIntoView({block:'center',behavior:'instant'});}
    }
    function syncSelection(){
        const item=currentCase(),root=el('document-review-tools');if(!item||!root||currentUser.role!=='admin'||supported!==true||editingId!==String(item.id))return;
        const files=getCaseFiles(item),raw=el('case-detail-content')?.dataset.activeDocumentIndex,file=raw===undefined?null:files[Number(raw)],active=file?draft.findIndex(review=>review.url===file.url):-1,canEdit=editable(item);
        const baseline=new Map((dirty?reviews(baseRecord):[]).map(review=>[review.url,review]));
        const count=draft.filter(review=>review.status!=='pending').length;
        setText(el('document-review-progress'),count+' / '+draft.length+' '+t('berkas diperiksa','files reviewed')+(dirty?' · '+t('belum disimpan','unsaved changes'):''));
        root.querySelectorAll('[data-review-item]').forEach(node=>{const hidden=Number(node.dataset.reviewItem)!==active;if(node.hidden!==hidden)node.hidden=hidden;});
        const context=el('active-review-context');if(context)context.hidden=!file;
        setText(el('active-review-title'),file?documentText(draft[active]?.label||file.label):'');
        setText(el('active-review-filename'),active<0?t('Versi terdahulu · tidak dapat diubah di sini','Historical version · cannot be edited here'):draft[active].fileName);
        if(el('review-file-position'))el('review-file-position').textContent=active<0?'':t('Berkas ','File ')+(active+1)+' / '+draft.length;
        if(el('review-select-file'))el('review-select-file').hidden=!!file;
        if(el('review-historical'))el('review-historical').hidden=!file||active>=0;
        if(el('review-save-actions'))el('review-save-actions').hidden=active<0||!canEdit;
        const next=el('review-save-next');if(next){next.disabled=saving;next.textContent=saving?t('Menyimpan…','Saving…'):nextPending(active)<0?t('Simpan & Selesai','Save & Finish'):t('Simpan & Lanjut','Save & Continue');}
        root.querySelectorAll('select,textarea,[data-save-document-review],[data-review-start],[data-review-latest]').forEach(node=>node.disabled=saving);
        document.querySelectorAll('#case-detail-content [data-preview-index]').forEach(button=>{
            const doc=files[Number(button.dataset.previewIndex)],review=draft.find(entry=>entry.url===doc?.url),row=button.closest('.case-file-row');
            if(!row)return;let marker=row.querySelector('.review-file-marker');if(!marker){marker=document.createElement('span');marker.className='review-file-marker';row.firstElementChild?.append(marker);}
            const stored=review&&baseline.get(review.url),changed=dirty&&review&&(review.status!==stored?.status||review.note!==stored?.note);
            setText(marker,review?statusName(review.status)+(changed?t(' · Draf',' · Draft'):''):t('Versi terdahulu','Historical version'));marker.dataset.state=review?.status||'historical';
            button.disabled=saving||!!button.ipcosPendingPreview;
            row.querySelectorAll('[data-compare-label]').forEach(control=>control.disabled=saving);
        });
        el('case-file-preview')?.querySelectorAll('[data-compare-side]').forEach(control=>control.disabled=saving);
        const actions=el('case-file-preview')?.querySelector('.case-preview-context .button-row');
        if(actions){let button=actions.querySelector('[data-open-active-review]');if(!button){button=document.createElement('button');button.type='button';button.className='btn-secondary';button.dataset.openActiveReview='';actions.append(button);}button.hidden=active<0;button.disabled=saving;button.textContent=canEdit?t('Catat Hasil Pemeriksaan','Record Review Result'):t('Lihat Hasil Pemeriksaan','View Review Results');}
    }
    function selectFile(index){
        if(currentUser.role!=='admin')return true;
        const item=currentCase(),file=item&&getCaseFiles(item)[index];if(!file)return false;
        const content=el('case-detail-content'),previous=content.dataset.activeDocumentIndex;
        if(saving&&String(index)!==previous)return false;
        content.dataset.activeDocumentIndex=String(index);
        content.querySelectorAll('[data-preview-index]').forEach(button=>{const selected=Number(button.dataset.previewIndex)===index;button.setAttribute('aria-pressed',String(selected));button.closest('.case-file-row')?.classList.toggle('is-selected',selected);});
        syncSelection();return true;
    }
    function openReview(index,focusNote=false){
        const item=currentCase();if(!item||saving||!draft[index])return;
        const fileIndex=getCaseFiles(item).findIndex(file=>file.url===draft[index].url);if(fileIndex<0)return;
        if(el('case-detail-content').dataset.activeDocumentIndex!==String(fileIndex)||el('case-file-preview').hidden)previewCaseFile(fileIndex);else selectFile(fileIndex);
        if(focusNote)reviewView(true);else {el('modal-case-detail').dataset.workspaceView='documents';syncToggle();}
    }
    function renderReviews(item,preserve=false) {
        let root=el('document-review-tools');if(!root){root=document.createElement('section');root.id='document-review-tools';el('case-action-panel').before(root);}
        const canEdit=editable(item);
        if(!preserve){editingId=String(item.id);baseRecord={...item};draft=reviews(item);dirty=false;retry=null;invalidNotes.clear();invalidResults.clear();}
        if(currentUser.role==='mhs'){root.textContent='';return;}
        if(supported!==true){root.textContent=currentUser.role==='admin'&&supported===false?t('Pemeriksaan per berkas menunggu aktivasi backend. Tindakan pengajuan tetap tersedia.','Per-document reviews are awaiting backend activation. Existing request actions remain available.'):'';return;}
        if(!draft.length){root.textContent='';return;}
        const preservedControls=preserve?[...root.querySelectorAll('select,textarea')]:[];
        root.innerHTML=`<h3>${t('Pemeriksaan Per Berkas','Document Review')}</h3><p id="document-review-progress" class="review-progress" role="status"></p>
            <div id="review-select-file"><p class="field-helper">${t('Pilih berkas untuk membuka dokumen dan catatan yang sesuai.','Choose a file to open its document and matching notes.')}</p><button type="button" class="btn-secondary" data-review-start>${canEdit?t('Mulai Pemeriksaan','Start Review'):t('Lihat Hasil Pemeriksaan','View Review Results')}</button></div>
            <div id="active-review-context" hidden><span id="review-file-position" class="field-helper"></span><h4 id="active-review-title" tabindex="-1"></h4><p id="active-review-filename" data-preserve-case></p></div>
            <p id="review-historical" class="field-helper" hidden>${t('Catatan baru hanya untuk versi terbaru. Pilih berkas terbaru pada daftar untuk melanjutkan.','New notes apply only to the latest version. Choose the latest file in the list to continue.')}</p>`+
            draft.map((review,index)=>canEdit?`<div class="document-review-item" data-review-item="${index}" hidden><label for="document-review-status-${index}">${t('Hasil Pemeriksaan','Review Result')}</label><select id="document-review-status-${index}" data-review-status="${index}" ${saving?'disabled':''}>${['pending','accepted','revision'].map(status=>`<option value="${status}" ${status===review.status?'selected':''}>${statusName(status)}</option>`).join('')}</select><label for="document-review-note-${index}">${t('Catatan Berkas','File Notes')} · ${escapeHtml(documentText(review.label))}</label><textarea id="document-review-note-${index}" data-review-note="${index}" rows="4" maxlength="2000" ${saving?'disabled':''} placeholder="${t('Wajib jika perlu perbaikan','Required when corrections are needed')}">${escapeHtml(review.note)}</textarea></div>`:`<div class="document-review-result ${review.status==='revision'?'needs-correction':''}" data-review-item="${index}" hidden><strong>${escapeHtml(documentText(review.label))} · ${statusName(review.status)}</strong>${review.note?`<p class="preserve-lines">${escapeHtml(review.note)}</p>`:''}</div>`).join('')+
            (canEdit?`<div id="review-save-actions" hidden><p class="field-helper">${t('Menyimpan seluruh hasil yang Anda ubah. Pengajuan tetap menunggu tindakan admin.','Saves all changed review results. The request still awaits an admin action.')}</p><div class="review-file-actions"><button type="button" id="review-save-next" class="btn-primary" data-save-next-review></button><button type="button" class="btn-secondary" data-save-document-review ${saving?'disabled':''}>${saving?t('Menyimpan…','Saving…'):t('Simpan Pemeriksaan','Save Review')}</button></div></div><button type="button" class="text-link" data-reload-document-review>${t('Muat Ulang Pemeriksaan','Reload Review')}</button><p id="admin-review-draft-status" class="field-helper" role="status"></p><p id="document-review-feedback" class="field-helper" role="status">${dirty?t('Ada pemeriksaan yang belum disimpan.','There are unsaved review changes.'):''}</p>`:'');
        for(const control of preservedControls){const replacement=document.getElementById(control.id);if(!replacement)continue;if(control.tagName==='SELECT')[...control.options].forEach(option=>option.textContent=statusName(option.value));else control.placeholder=replacement.placeholder;replacement.replaceWith(control);}
        if(canEdit)refreshNoteFeedback();syncSelection();
    }
    async function saveAndNext(){
        const index=activeReviewIndex(),item=currentCase();if(!item||!editable(item)||saving||index<0)return;
        if(draft[index].status==='pending'){invalidResults.add(index);refreshNoteFeedback();el('document-review-status-'+index)?.focus();return;}
        const epoch=sessionEpoch,id=String(item.id),url=draft[index].url;
        if(!await saveReview()||epoch!==sessionEpoch||selectedCaseId!==id||draft[activeReviewIndex()]?.url!==url)return;
        const next=nextPending(index);
        if(next>=0){openReview(next);const heading=el('admin-preview-title');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start',behavior:'instant'});}
        else{reviewView();el('document-review-feedback').textContent=t('Semua berkas telah diperiksa. Pilih tindakan pengajuan saat sudah siap.','All files have been reviewed. Choose a request action when ready.');const feedback=el('document-review-feedback');feedback.tabIndex=-1;feedback.focus({preventScroll:true});feedback.scrollIntoView({block:'center',behavior:'instant'});}
    }
    async function saveReview() {
        const item=currentCase();if(!item||!editable(item)||saving||supported!==true)return false;
        if(!dirty)return true;
        if(isOffline)throw new Error(t('Simpan pemeriksaan setelah koneksi kembali.','Save the review when the connection is restored.'));
        invalidNotes.clear();invalidResults.clear();draft.forEach((review,index)=>{if(review.status==='revision'&&!review.note.trim())invalidNotes.add(index);});refreshNoteFeedback();
        if(invalidNotes.size){openReview([...invalidNotes][0],true);throw new Error(missingNoteMessage());}
        const epoch=sessionEpoch,id=String(item.id),snapshot=JSON.stringify(draft.map(({url,label,status,note})=>({url,label,status,note})));
        saving=true;syncSelection();activeUpdateIds.add(id);window.IPCOSReview?.actionsChanged();
        el('document-review-tools')?.querySelectorAll('input,select,textarea,button').forEach(control=>control.disabled=true);
        try {
            const expectedVersion=await version(baseRecord);
            if(!retry||retry.snapshot!==snapshot||retry.payload?.action!=='save_document_review'||String(retry.payload.id)!==id||retry.payload.version!==expectedVersion||JSON.stringify(retry.payload.reviews)!==snapshot)retry={snapshot,payload:{action:'save_document_review',id,version:expectedVersion,requestId:crypto.randomUUID(),reviews:JSON.parse(snapshot)}};
            window.IPCOSAdminDrafts?.rememberReview(item,baseRecord,draft,retry);
            const result=await api(retry.payload,epoch);
            let confirmation;try{confirmation=JSON.parse(result.note).slice().reverse().find(log=>log.kind==='document_review')?.reviews;}catch(_){}
            if(!Array.isArray(confirmation)||JSON.parse(snapshot).some(review=>!confirmation.some(saved=>saved&&saved.url===review.url&&saved.label===review.label.trim()&&saved.status===review.status&&saved.note===review.note.trim())))throw new Error(t('Konfirmasi pemeriksaan belum lengkap. Catatan tetap tersedia; coba simpan lagi.','The review confirmation is incomplete. Your notes remain available; try saving again.'));
            const stored=updateNote(id,result.note,result.version);if(editingId!==id||selectedCaseId!==id)return false;
            baseRecord={...stored};draft=reviews(baseRecord);dirty=false;retry=null;
            draft.forEach((review,index)=>{const note=el('document-review-note-'+index);if(note&&note.value!==review.note)note.value=review.note;});
            window.IPCOSAdminDrafts?.reviewSaved(baseRecord);
            if(editingId===id&&el('document-review-feedback'))el('document-review-feedback').textContent=t('Pemeriksaan tersimpan. Pilih tindakan pengajuan ketika sudah siap.','Review saved. Choose a request action when you are ready.');
            return true;
        } finally {
            if(epoch===sessionEpoch){saving=false;activeUpdateIds.delete(id);el('document-review-tools')?.querySelectorAll('input,select,textarea,button').forEach(control=>control.disabled=false);window.IPCOSReview?.actionsChanged();syncSelection();}
        }
    }
    async function reloadReview(){if(saving||!confirmLeaveCase())return;window.IPCOSAdminDrafts?.forget(selectedCaseId);const epoch=sessionEpoch,id=selectedCaseId;await syncDatabase();if(epoch!==sessionEpoch||id!==selectedCaseId||syncPhase!=='success')return;dirty=false;const panel=el('case-action-panel');if(panel)panel.dataset.dirty='false';openCaseDetail(id);}
    function prepareDecision(action) {
        if(action!=='revision'||supported!==true)return;
        const needing=draft.filter(review=>review.status==='revision');
        for(const review of needing){const checkbox=[...el('case-action-panel').querySelectorAll('[name=revision-document]')].find(input=>input.value===review.label);if(checkbox)checkbox.checked=true;}
        const note=el('case-revision-note');if(note&&!note.value.trim()&&needing.length)note.value=needing.map(review=>documentText(review.label)+': '+review.note).join('\n\n');
    }
    async function beforeDecision(action) {
        if(currentUser.role!=='admin'||supported!==true)return true;
        if(['accept','dospem'].includes(action)&&draft.some(review=>review.status==='revision'))throw new Error(t('Masih ada berkas yang perlu diperbaiki. Pilih Minta Revisi atau perbarui hasil pemeriksaan.','Some files still need corrections. Request Corrections or update the review results.'));
        return saveReview();
    }
    function opened(item,{languageRefresh=false}={}) {
        if(languageRefresh)window.IPCOSDocuments?.languageChanged();
        renderReviews(item,languageRefresh&&editingId===String(item.id));if(!languageRefresh)window.IPCOSAdminDrafts?.offer(item);if(currentUser.role==='admin'&&!el('modal-case-detail').classList.contains('admin-review-mode')&&el('modal-case-detail').classList.contains('has-document-preview'))document.querySelector('.case-action-column')?.prepend(el('document-review-tools'));renderArchives();
        let toggle=el('workspace-view-toggle');if(!toggle){toggle=document.createElement('div');toggle.id='workspace-view-toggle';toggle.className='workspace-view-toggle';el('case-detail-content').before(toggle);}
        toggle.innerHTML=`<button type="button" data-workspace-view="documents">${t('Dokumen','Documents')}</button><button type="button" data-workspace-view="review">${currentUser.role==='mhs'?t('Tindak Lanjut','Follow-up'):t('Pemeriksaan','Review')}</button>`;
        toggle.hidden=currentUser.role!=='admin'&&!el('modal-case-detail').classList.contains('has-document-preview');syncToggle();
    }
    function syncToggle(){const modal=el('modal-case-detail');el('workspace-view-toggle')?.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.workspaceView===(modal.dataset.workspaceView||'documents'))));}
    function previewReady(){syncSelection();const modal=el('modal-case-detail');modal.classList.add('has-document-preview');if(!modal.dataset.workspaceView)modal.dataset.workspaceView='documents';if(el('workspace-view-toggle'))el('workspace-view-toggle').hidden=false;syncToggle();const panel=el('case-file-preview'),content=el('case-detail-content');if(panel&&content&&!modal.classList.contains('admin-review-mode')&&modal.dataset.workspaceView==='documents')content.scrollTop+=panel.getBoundingClientRect().top-content.getBoundingClientRect().top;const review=el('document-review-tools');if(currentUser.role==='admin'&&review&&!modal.classList.contains('admin-review-mode'))document.querySelector('.case-action-column')?.prepend(review);}
    function archiveCandidates(){
        const from=el('archive-from')?.value||'',to=el('archive-to')?.value||'',type=el('archive-service')?.value||'';
        if(!from||!to||from>to)return [];
        return readStoredJSON(sessionStorage,'ipcos_registrations',[]).filter(item=>{const date=displayDate(item.date),day=Number.isFinite(date.getTime())?date.toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}):'';return String(item.status).toLowerCase()==='accepted'&&!archived(item)&&(!type||item.jenis===type)&&day&&day>=from&&day<=to;});
    }
    function renderArchives(){
        const root=el('archive-list');if(!root||currentUser.role!=='admin')return;
        el('archive-service')?.querySelectorAll('option[value]:not([value=""])').forEach(option=>option.textContent=serviceLabel(option.value));
        el('archive-period-button').disabled=archiveBusy||supported!==true;
        el('archive-availability').textContent=supported===false?t('Arsip dan pemulihan menunggu aktivasi backend. Data belum diubah.','Archive and restore are awaiting backend activation. No data has been changed.'):supported===null?t('Memeriksa ketersediaan arsip…','Checking archive availability…'):'';
        const records=readStoredJSON(sessionStorage,'ipcos_registrations',[]).filter(archived),search=(el('archive-search')?.value||'').trim().toLowerCase();
        const filtered=records.filter(item=>[item.id,item.nama,item.nim,item.jenis,formatDate(item.date)].some(value=>String(value).toLowerCase().includes(search)));
        el('archive-count').textContent=records.length+' '+t('Pengajuan di Arsip','Archived Requests');
        el('archive-preview-count').textContent=archiveCandidates().length+' '+t('Pengajuan Selesai Sesuai Periode','Completed Requests in This Period');
        root.innerHTML=filtered.length?filtered.map(item=>`<div class="archive-item"><div><strong>${escapeHtml(item.nama)} · ${escapeHtml(systemText(item.jenis))}</strong><p>${escapeHtml(item.id)} · ${escapeHtml(formatDate(item.date))}</p><small>${t('Alasan: ','Reason: ')}${escapeHtml(archive(item).reason||'')}</small></div><button type="button" class="btn-secondary" data-case-id="${escapeHtml(item.id)}">${t('Buka','Open')}</button><button type="button" class="btn-secondary" data-restore-request="${escapeHtml(item.id)}" ${archiveBusy||supported!==true?'disabled':''}>${t('Pulihkan','Restore')}</button></div>`).join(''):`<p>${t('Tidak ada arsip yang cocok.','No matching archived requests.')}</p>`;
    }
    async function changeArchive(item,restore=false,reason='') {
        const epoch=sessionEpoch,id=String(item.id),action=restore?'restore_request':'archive_request';
        const result=await api({action,id,reason,version:await version(item),requestId:crypto.randomUUID()},epoch);updateNote(id,result.note,result.version);
    }
    async function archivePeriod(){
        if(currentUser.role!=='admin'||archiveBusy||supported!==true)return;
        const candidates=archiveCandidates(),reason=el('archive-reason').value.trim();
        if(!candidates.length||!reason){el('archive-feedback').textContent=t('Pilih periode yang berisi pengajuan selesai dan isi alasan arsip.','Choose a period containing completed requests and enter an archive reason.');return;}
        if(!confirm(candidates.length+' '+t('pengajuan selesai akan dipindahkan ke arsip. Data dan berkas tetap tersedia, serta dapat dipulihkan. Lanjutkan?','completed requests will move to the archive. Data and files remain available and can be restored. Continue?')))return;
        const epoch=sessionEpoch;archiveBusy=true;el('archive-period-button').disabled=true;let count=0;
        try{for(const item of candidates){await changeArchive(item,false,reason);if(epoch!==sessionEpoch)return;count++;el('archive-feedback').textContent=t('Mengarsipkan ','Archiving ')+count+'/'+candidates.length;}el('archive-feedback').textContent=count+' '+t('pengajuan selesai diarsipkan.','completed requests archived.');}
        catch(error){if(epoch===sessionEpoch&&!error.staleSession)el('archive-feedback').textContent=count+' '+t('tersimpan; proses berhenti. Segarkan untuk memeriksa hasil sebelum mencoba lagi. ','saved; the process stopped. Refresh to check the results before trying again. ')+systemText(error.message);}
        finally{if(epoch===sessionEpoch){archiveBusy=false;el('archive-period-button').disabled=false;await syncDatabase();renderArchives();}}
    }
    async function restoreRequest(id){
        if(currentUser.role!=='admin'||archiveBusy||supported!==true)return;const item=readStoredJSON(sessionStorage,'ipcos_registrations',[]).find(item=>String(item.id)===id);if(!item)return;
        if(!confirm(t('Pulihkan pengajuan ini ke daftar aktif? Status akademik dan berkas tetap sama.','Restore this request to the active list? Its academic status and files stay the same.')))return;
        const epoch=sessionEpoch;archiveBusy=true;renderArchives();
        try{await changeArchive(item,true,'Dipulihkan dari arsip oleh admin.');if(epoch===sessionEpoch)el('archive-feedback').textContent=t('Pengajuan dipulihkan.','Request restored.');}
        catch(error){if(epoch===sessionEpoch&&!error.staleSession)el('archive-feedback').textContent=systemText(error.message);}
        finally{if(epoch===sessionEpoch){archiveBusy=false;await syncDatabase();renderArchives();}}
    }
    function refresh(){
        renderArchives();if(!['admin','mhs'].includes(currentUser.role)||capEpoch===sessionEpoch||capPending)return;
        const epoch=sessionEpoch;capPending=api({action:'get_review_capabilities'},epoch).then(result=>{if(epoch!==sessionEpoch)return;supported=result.documentReviewSupported===true&&result.archiveSupported===true;capEpoch=epoch;}).catch(error=>{if(epoch===sessionEpoch&&!error.staleSession){supported=false;capEpoch=epoch;}}).finally(()=>{if(epoch!==sessionEpoch)return;capPending=null;renderArchives();const item=currentCase();if(item&&el('modal-case-detail').style.display==='flex'){renderReviews(item,true);window.IPCOSAdminDrafts?.offer(item);}});
    }
    document.addEventListener('input',event=>{
        if(event.target.matches('[data-review-status],[data-review-note]')){const index=Number(event.target.dataset.reviewStatus??event.target.dataset.reviewNote),key=event.target.hasAttribute('data-review-status')?'status':'note';if(!saving&&draft[index]){draft[index][key]=event.target.value;dirty=true;retry=null;window.IPCOSAdminDrafts?.rememberReview(currentCase(),baseRecord,draft,retry);el('document-review-feedback').textContent=t('Ada pemeriksaan yang belum disimpan.','There are unsaved review changes.');setFieldError('document-review-status-'+index,'');refreshNoteFeedback();syncSelection();}}
        if(event.target.closest('#admin-archives'))renderArchives();
    });
    document.addEventListener('click',event=>{
        const save=event.target.closest('[data-save-document-review]'),toggle=event.target.closest('button[data-workspace-view]'),restore=event.target.closest('[data-restore-request]');
        if(event.target.closest('[data-review-start]'))openReview(draft.findIndex(review=>review.status==='pending')<0?0:draft.findIndex(review=>review.status==='pending'));
        if(event.target.closest('[data-open-active-review]'))reviewView(true);
        if(event.target.closest('[data-save-next-review]'))saveAndNext().catch(error=>{if(!error.staleSession&&el('document-review-feedback'))el('document-review-feedback').textContent=systemText(error.message);});
        if(event.target.closest('[data-reload-document-review]'))reloadReview();
        if(save)saveReview().catch(error=>{if(!error.staleSession&&el('document-review-feedback'))el('document-review-feedback').textContent=systemText(error.message);});
        if(toggle){el('modal-case-detail').dataset.workspaceView=toggle.dataset.workspaceView;syncToggle();}
        if(restore)restoreRequest(restore.dataset.restoreRequest);
        if(event.target.closest('#archive-period-button'))archivePeriod();
    });
    window.addEventListener('ipcos:logout',()=>{supported=null;capEpoch=-1;capPending=null;baseRecord=null;editingId='';draft=[];dirty=false;saving=false;archiveBusy=false;retry=null;invalidNotes.clear();invalidResults.clear();el('archive-list')?.replaceChildren();});
    function historyHtml(log){if(log.kind==='document_review'&&Array.isArray(log.reviews))return log.reviews.map(review=>`<p class="preserve-lines"><strong>${escapeHtml(documentText(review.label))} · ${statusName(review.status)}</strong>${review.note?' · '+escapeHtml(review.note):''}</p>`).join('');return log.kind==='archive'&&log.reason?`<p>${t('Alasan: ','Reason: ')}${escapeHtml(log.reason)}</p>`:'';}
    function restoreDraft(values,savedRetry){if(currentUser.role!=='admin'||saving||!Array.isArray(values))return;draft=draft.map(file=>{const saved=values.find(value=>value.url===file.url&&value.label===file.label);return saved&&['pending','accepted','revision'].includes(saved.status)?{...file,status:saved.status,note:String(saved.note||'').slice(0,2000)}:file;});dirty=true;retry=savedRetry;draft.forEach((review,index)=>{const note=el('document-review-note-'+index),status=el('document-review-status-'+index);if(note)note.value=review.note;if(status)status.value=review.status;});renderReviews(currentCase(),true);if(activeReviewIndex()<0)openReview(draft.findIndex(review=>review.note||review.status!=='pending')<0?0:draft.findIndex(review=>review.note||review.status!=='pending'),true);window.IPCOSAdminDrafts?.rememberReview(currentCase(),baseRecord,draft,retry);}
    window.IPCOSReviewTools={version,selectFile,discardLocal:()=>{dirty=false;retry=null;editingId='';draft=[];baseRecord=null;invalidNotes.clear();invalidResults.clear();},restoreDraft,supported:()=>supported,refresh,historyHtml,opened,previewReady,prepareDecision,beforeDecision,archived,renderArchives,dirty:()=>dirty&&editingId===selectedCaseId,reset:()=>{supported=null;capEpoch=-1;capPending=null;baseRecord=null;editingId='';draft=[];dirty=false;saving=false;archiveBusy=false;retry=null;invalidNotes.clear();invalidResults.clear();}};
})();
