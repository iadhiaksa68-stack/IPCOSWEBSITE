/* Private, session-scoped recovery. A draft never changes the academic record. */
(() => {
    const key='ipcos_admin_review_drafts',ttl=24*60*60*1000;
    const t=(id,en)=>uxText(id,en);
    const stamp=item=>JSON.stringify([String(item.id),String(item.status),String(item.detail),String(item.note),String(item.link)]);
    function read(){
        try{const value=JSON.parse(sessionStorage.getItem(key)||'{}');if(!value||typeof value!=='object'||Array.isArray(value))return {};for(const id of Object.keys(value)){const entry=value[id];if(!entry||!Number.isFinite(entry.savedAt)||Date.now()-entry.savedAt>ttl||entry.savedAt>Date.now()+60000){delete value[id];continue;}if(entry.review&&(!Array.isArray(entry.review.reviews)||entry.review.reviews.length>20||typeof entry.review.stamp!=='string'||entry.review.reviews.some(review=>!review||typeof review.url!=='string'||typeof review.label!=='string'||typeof review.note!=='string'||review.note.length>2000||!['pending','accepted','revision'].includes(review.status))))delete entry.review;if(entry.action&&(typeof entry.action.stamp!=='string'||!['revision','dospem'].includes(entry.action.action)||typeof entry.action.note!=='string'||!Array.isArray(entry.action.documents)||entry.action.documents.some(label=>typeof label!=='string')||typeof entry.action.supervisor!=='string'))delete entry.action;if(!entry.review&&!entry.action)delete value[id];}return value;}catch(_){return {};}
    }
    function write(entries){
        try{const recent=Object.entries(entries).sort((a,b)=>b[1].savedAt-a[1].savedAt).slice(0,12);let text=JSON.stringify(Object.fromEntries(recent));while(text.length>250000&&recent.length){recent.pop();text=JSON.stringify(Object.fromEntries(recent));}sessionStorage.setItem(key,text);return true;}catch(_){return false;}
    }
    function remember(item,part,value){
        if(currentUser.role!=='admin'||!item)return false;
        const entries=read(),id=String(item.id),entry=entries[id]||{};
        entry[part]=value;entry.savedAt=Date.now();entries[id]=entry;return write(entries);
    }
    function forget(id,part){const entries=read(),entry=entries[String(id)];if(!entry)return;if(part){delete entry[part];if(!entry.review&&!entry.action)delete entries[String(id)];}else delete entries[String(id)];write(entries);}
    function rememberReview(item,base,reviews,retry){
        const saved=remember(item,'review',{stamp:stamp(base),reviews:reviews.map(({url,label,status,note})=>({url,label,status,note})),retry:retry||null});
        const status=document.getElementById('admin-review-draft-status');if(status)status.textContent=saved?t('Draf tersimpan di tab ini; belum dikirim ke mahasiswa.','Draft saved in this tab; not sent to the student.'):t('Draf belum dapat disimpan di tab ini. Jangan tutup sebelum menyimpan pemeriksaan.','This tab could not save the draft. Save the review before closing.');
        return saved;
    }
    function captureAction(){
        const item=currentCase(),panel=document.getElementById('case-action-panel');if(currentUser.role!=='admin'||!item||!panel||panel.hidden||panel.dataset.dirty!=='true'||!['revision','dospem'].includes(panel.dataset.action))return;
        const fields={action:panel.dataset.action,stamp:stamp(item),note:document.getElementById('case-revision-note')?.value||'',documents:[...panel.querySelectorAll('[name=revision-document]:checked')].map(input=>input.value),supervisor:document.getElementById('case-supervisor')?.value||''};
        const saved=remember(item,'action',fields);let status=document.getElementById('admin-action-draft-status');if(!status){status=document.createElement('p');status.id='admin-action-draft-status';status.className='field-helper';status.setAttribute('role','status');panel.append(status);}status.textContent=saved?t('Draf tindakan tersimpan di tab ini. Konfirmasi tetap diperlukan untuk mengirim.','Action draft saved in this tab. Confirmation is still required to send.'):t('Draf tindakan belum dapat disimpan.','The action draft could not be saved.');
    }
    function offer(item){
        document.getElementById('admin-draft-recovery')?.remove();if(currentUser.role!=='admin'||!['pending','resubmitted'].includes(String(item.status).toLowerCase()))return;
        const entry=read()[String(item.id)];if(!entry||(!entry.review&&!entry.action))return;
        const root=document.createElement('section');root.id='admin-draft-recovery';root.className='admin-draft-recovery';root.setAttribute('aria-label',t('Pemulihan Draf Admin','Admin Draft Recovery'));
        const same=part=>entry[part]?.stamp===stamp(item);
        const reviewOK=entry.review&&same('review')&&window.IPCOSReviewTools?.supported()===true,actionOK=entry.action&&same('action');
        root.innerHTML=`<strong>${t('Ada Draf Pemeriksaan','Review Draft Available')}</strong><p>${t('Draf privat tersedia di tab ini selama sesi aktif, maksimal 24 jam. Tidak tersimpan sebagai keputusan admin.','A private draft is available in this tab during the active session, for up to 24 hours. It is not an admin decision.')}</p>`+
            ((!same('review')&&entry.review)||(!same('action')&&entry.action)?`<p class="field-error">${t('Pengajuan telah berubah. Draf lama hanya dapat dibaca agar versi terbaru tidak tertimpa.','The request changed. The old draft is read-only to protect the latest version.')}</p>`:'')+
            (reviewOK?`<button type="button" class="btn-secondary" data-restore-review-draft>${t('Pulihkan Catatan Berkas','Restore File Notes')}</button>`:'')+(actionOK?`<button type="button" class="btn-secondary" data-restore-action-draft>${t('Pulihkan Draf Tindakan','Restore Action Draft')}</button>`:'')+
            `<details><summary>${t('Lihat Isi Draf','View Draft Contents')}</summary><div class="admin-draft-contents"></div></details><button type="button" class="text-link" data-discard-admin-draft>${t('Hapus Draf Tersimpan','Discard Saved Draft')}</button>`;
        const contents=root.querySelector('.admin-draft-contents');
        for(const review of entry.review?.reviews||[]){const p=document.createElement('p');p.className='preserve-lines';p.textContent=documentText(review.label)+': '+review.note;contents.append(p);}
        if(entry.action){const p=document.createElement('p');p.className='preserve-lines';p.textContent=entry.action.note||entry.action.supervisor;contents.append(p);}
        document.getElementById('document-review-tools')?.before(root);
        root.querySelector('[data-restore-review-draft]')?.addEventListener('click',()=>{
            if(currentUser.role!=='admin'||String(currentCase()?.id)!==String(item.id)||stamp(currentCase())!==entry.review.stamp)return;
            if(window.IPCOSReviewTools.dirty()&&!confirm(t('Ganti catatan yang sedang diedit dengan draf tersimpan?','Replace the notes being edited with the saved draft?')))return;
            window.IPCOSReviewTools.restoreDraft(entry.review.reviews,entry.review.retry);root.querySelector('[data-restore-review-draft]')?.remove();if(!root.querySelector('[data-restore-action-draft]'))root.remove();
        });
        root.querySelector('[data-restore-action-draft]')?.addEventListener('click',()=>{
            if(currentUser.role!=='admin'||String(currentCase()?.id)!==String(item.id)||stamp(currentCase())!==entry.action.stamp)return;
            if(caseEditorDirty()&&!confirm(t('Pulihkan draf tindakan menggantikan isian tindakan saat ini?','Restore the action draft in place of the current action inputs?')))return;
            caseDetailAction(entry.action.action);const panel=document.getElementById('case-action-panel');
            const note=document.getElementById('case-revision-note'),supervisor=document.getElementById('case-supervisor');if(note)note.value=entry.action.note;
            panel.querySelectorAll('[name=revision-document]').forEach(input=>input.checked=entry.action.documents.includes(input.value));
            if(supervisor&&[...supervisor.options].some(option=>option.value===entry.action.supervisor&&!option.disabled))supervisor.value=entry.action.supervisor;
            panel.dataset.dirty='true';captureAction();root.querySelector('[data-restore-action-draft]')?.remove();if(!root.querySelector('[data-restore-review-draft]'))root.remove();
        });
        root.querySelector('[data-discard-admin-draft]').addEventListener('click',()=>{forget(item.id);root.remove();});
    }
    function reviewSaved(item){
        const entries=read(),entry=entries[String(item.id)];if(entry){delete entry.review;if(entry.action)entry.action.stamp=stamp(item);else delete entries[String(item.id)];write(entries);}document.getElementById('admin-review-draft-status')?.remove();offer(item);
    }
    document.addEventListener('input',event=>{if(event.target.closest('#case-action-panel'))captureAction();});
    document.addEventListener('change',event=>{if(event.target.closest('#case-action-panel'))captureAction();});
    window.addEventListener('beforeunload',captureAction);
    window.IPCOSAdminDrafts={rememberReview,captureAction,offer,forget,reviewSaved,clear:()=>{sessionStorage.removeItem(key);document.getElementById('admin-draft-recovery')?.remove();}};
})();
