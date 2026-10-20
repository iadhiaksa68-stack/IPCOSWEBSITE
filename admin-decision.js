/* Review an admin decision without writing; the existing API commits it after confirmation. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    let states=new WeakMap();
    const stamp=item=>JSON.stringify([item.id,item.status,item.jenis,item.detail,item.link,item.note,item.dospem||'',item.reviewVersion||'']);
    const structure=item=>JSON.stringify([item.id,item.status,item.jenis,item.detail,item.link,item.dospem||'']);
    const allowed=item=>item&&currentUser.role==='admin'&&getSessionToken()&&['pending','resubmitted'].includes(String(item.status).trim().toLowerCase());
    const fileState=()=>window.IPCOSReviewTools?.decisionState()||{available:false,dirty:false,files:[]};
    const inputs=()=>{const panel=el('case-action-panel');return [panel?.dataset.action,[...panel?.querySelectorAll('[name=revision-document]:checked')||[]].map(input=>input.value),el('case-revision-note')?.value.trim()||'',el('case-supervisor')?.value||''];};
    const signature=payload=>JSON.stringify([payload,inputs(),fileState().files.map(({url,label,status,note})=>({url,label,status,note:note.trim()}))]);
    const changed=()=>new Error(t('Pengajuan telah berubah. Isian Anda tetap tersedia; segarkan pengajuan sebelum mengonfirmasi.','The request changed. Your inputs remain available; refresh the request before confirming.'));
    function current(){
        const panel=el('case-action-panel'),item=currentCase(),data=panel&&states.get(panel);
        return panel&&!panel.hidden&&allowed(item)&&data&&data.id===selectedCaseId&&data.epoch===sessionEpoch&&data.action===panel.dataset.action?{panel,item,data}:null;
    }
    function label(){
        const state=current();if(!state?.data.payload||!el('admin-decision-summary'))return t('Periksa Keputusan','Review Decision');
        return state.data.action==='revision'?t('Konfirmasi & Minta Revisi','Confirm & Request Corrections'):t('Konfirmasi & Setujui','Confirm & Approve');
    }
    function clearView(){el('admin-decision-summary')?.remove();el('modal-case-detail')?.classList.remove('admin-decision-review');}
    function start(action){
        clearView();const panel=el('case-action-panel'),item=currentCase();
        if(allowed(item)&&['accept','revision','dospem'].includes(action))states.set(panel,{epoch:sessionEpoch,id:selectedCaseId,action,base:stamp(item),structure:structure(item),signature:'',payload:null});
        refresh();
    }
    function invalidate(focus=false){
        if(isPreparingCorrection||isPreparingReviewDecision||activeUpdateIds.has(selectedCaseId))return;
        const state=current();if(!state)return;
        state.data.signature='';state.data.payload=null;clearView();
        const feedback=el('case-action-feedback');if(feedback?.dataset.decisionNotice){feedback.textContent='';delete feedback.dataset.decisionNotice;}
        refresh();if(focus){const target=state.panel.querySelector('textarea,select,input')||el('btn-case-submit');target?.focus({preventScroll:true});target?.scrollIntoView({block:'center',behavior:'instant'});}
    }
    function render(state){
        const {panel,item,data}=state,payload=data.payload,review=fileState(),files=review.files;
        const dirty=files.filter(file=>file.dirty).length,pending=files.filter(file=>file.status==='pending').length;
        let root=el('admin-decision-summary');if(!root){root=document.createElement('section');root.id='admin-decision-summary';root.setAttribute('aria-labelledby','admin-decision-summary-title');panel.prepend(root);}
        const editFocused=root.contains(document.activeElement)&&document.activeElement.matches('[data-decision-edit]');
        root.innerHTML=`<header><p class="decision-eyebrow">${t('Langkah terakhir','Final step')}</p><h3 id="admin-decision-summary-title" tabindex="-1">${t('Periksa keputusan Anda','Review your decision')}</h3><p>${t('Periksa hasil berkas dan pesan untuk mahasiswa sebelum mengirim keputusan.','Check the file results and student message before sending your decision.')}</p></header>
            <dl class="decision-identity"><div><dt>${t('Mahasiswa','Student')}</dt><dd data-preserve-case>${escapeHtml(item.nama)} · ${escapeHtml(item.nim)}</dd></div><div><dt>${t('Pengajuan','Request')}</dt><dd>${escapeHtml(systemText(item.jenis))}<span data-preserve-case>${t('Nomor ','ID ')}${escapeHtml(item.id)}</span></dd></div><div><dt>${t('Keputusan','Decision')}</dt><dd>${payload.action==='revision'?t('Minta revisi · menunggu mahasiswa','Request corrections · waiting for student'):t('Setujui pengajuan','Approve request')}</dd></div>${payload.dospem?`<div><dt>${t('Dosen pembimbing','Supervisor')}</dt><dd data-preserve-case>${escapeHtml(payload.dospem)}</dd></div>`:''}</dl>
            <section class="decision-files" aria-labelledby="decision-files-title"><h4 id="decision-files-title">${t('Hasil pemeriksaan berkas','File review results')}</h4>${!review.available?`<p class="decision-notice">${t('Hasil pemeriksaan per berkas belum tersedia. Periksa dokumen sebelum mengonfirmasi.','Per-file review results are unavailable. Check the documents before confirming.')}</p>`:''}${files.length?`<ul>${files.map((file,index)=>`<li data-decision-file="${index}" data-state="${escapeHtml(file.status)}"><div class="decision-file-heading"><strong>${escapeHtml(documentText(file.label))}</strong><span class="decision-file-status">${file.status==='accepted'?t('Sudah sesuai','Meets requirements'):file.status==='revision'?t('Perlu perbaikan','Needs corrections'):t('Belum diperiksa','Not reviewed')}</span></div><p class="decision-filename" data-preserve-case>${escapeHtml(file.fileName)}</p>${file.note?`<p class="preserve-lines decision-file-note" data-preserve-case>${escapeHtml(file.note)}</p>`:''}${file.dirty?`<span class="decision-draft">${t('Draf · belum disimpan','Draft · not saved')}</span>`:''}</li>`).join('')}</ul>`:`<p>${t('Tidak ada berkas pada pengajuan ini. Periksa isian dan riwayat pengajuan.','This request has no files. Check its details and history.')}</p>`}
            ${review.available&&pending?`<p class="decision-notice">${pending} ${t('berkas belum memiliki hasil pemeriksaan. Pastikan dokumennya sudah Anda periksa.','files have no review result. Make sure you have checked these documents.')}</p>`:''}
            ${review.dirty?`<p id="admin-decision-unsaved" class="decision-notice">${dirty||files.length} ${t('hasil atau catatan berkas belum disimpan. Setelah konfirmasi, pemeriksaan disimpan terlebih dahulu. Keputusan hanya dikirim jika penyimpanan berhasil.','file results or notes are unsaved. After confirmation, the reviews are saved first. The decision is sent only if saving succeeds.')}</p>`:''}</section>
            <section class="decision-student-message" aria-labelledby="decision-message-title"><h4 id="decision-message-title">${t('Pesan yang diterima mahasiswa','Message the student will receive')}</h4><p id="admin-decision-message" class="preserve-lines" data-preserve-case>${escapeHtml(payload.note)}</p><p class="field-helper">${t('Hasil dan catatan per berkas juga dapat dilihat mahasiswa setelah tersimpan.','Saved file results and notes are also visible to the student.')}</p></section>
            <p class="decision-effect">${payload.action==='revision'?t('Mahasiswa akan diminta memperbaiki pengajuan yang sama.','The student will be asked to correct this request.'):t('Persetujuan akan terlihat pada status pengajuan mahasiswa.','The approval will appear in the student’s request status.')}</p><button type="button" class="btn-secondary" data-decision-edit ${isPreparingCorrection||isPreparingReviewDecision||activeUpdateIds.has(selectedCaseId)?'disabled':''}>${t('Kembali periksa','Back to review')}</button>`;
        el('modal-case-detail').classList.add('admin-decision-review');
        if(editFocused)root.querySelector('[data-decision-edit]').focus({preventScroll:true});
    }
    function refresh(){
        const state=current();if(!state){clearView();return;}
        if(state.data.payload&&el('admin-decision-summary'))render(state);
        if(!isPreparingCorrection&&!isPreparingReviewDecision&&!activeUpdateIds.has(selectedCaseId)&&el('btn-case-submit'))el('btn-case-submit').textContent=label();
        const feedback=el('case-action-feedback');if(feedback?.dataset.decisionNotice==='review')feedback.textContent=t('Ringkasan belum dikirim. Konfirmasi setelah semua informasi sesuai.','The summary has not been sent. Confirm when all information is correct.');
    }
    function review(payload){
        const state=current();if(!state)throw changed();
        if(stamp(state.item)!==state.data.base)throw changed();
        const next=signature(payload);
        if(el('admin-decision-summary')&&state.data.signature===next)return true;
        state.data.payload={...payload};state.data.signature=next;render(state);
        const feedback=el('case-action-feedback');feedback.dataset.decisionNotice='review';feedback.textContent=t('Ringkasan belum dikirim. Konfirmasi setelah semua informasi sesuai.','The summary has not been sent. Confirm when all information is correct.');
        el('btn-case-submit').textContent=label();el('admin-decision-summary-title').focus({preventScroll:true});el('admin-decision-summary').scrollIntoView({block:'start',behavior:'instant'});return false;
    }
    function reviewSaved(item){
        const state=current();if(!state||structure(item)!==state.data.structure)return;
        state.data.base=stamp(item);
        if(!isPreparingReviewDecision){state.data.signature='';state.data.payload=null;clearView();refresh();}
    }
    function afterReviewSave(payload){
        const state=current();if(!state||stamp(state.item)!==state.data.base||structure(state.item)!==state.data.structure||signature(payload)!==state.data.signature)throw changed();
        // The confirmed per-file save intentionally changes note/reviewVersion.
        state.data.base=stamp(state.item);render(state);
    }
    function busy(value){
        const state=current();if(!state)return;
        if(value){state.data.locks=[...document.querySelectorAll('#case-detail-content input,#case-detail-content textarea,#case-detail-content select,#case-detail-content button,#case-review-action-footer button')].map(node=>[node,node.disabled]);state.data.locks.forEach(([node])=>node.disabled=true);}
        else{state.data.locks?.forEach(([node,disabled])=>{if(node.isConnected)node.disabled=disabled;});delete state.data.locks;refresh();}
    }
    ['input','change'].forEach(name=>document.addEventListener(name,event=>{if(event.target.matches('#case-action-panel input,#case-action-panel textarea,#case-action-panel select,[data-review-note],[data-review-status]'))invalidate();}));
    document.addEventListener('click',event=>{if(event.target.closest('[data-decision-edit]'))invalidate(true);});
    document.addEventListener('keydown',event=>{if(event.repeat&&['Enter',' '].includes(event.key)&&event.target.closest('#btn-case-submit'))event.preventDefault();});
    const reset=()=>{states=new WeakMap();clearView();};
    window.addEventListener('ipcos:logout',reset);
    window.IPCOSAdminDecision=Object.freeze({start,refresh,review,label,afterReviewSave,reviewSaved,busy,reset});
})();
