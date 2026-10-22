/* Group saved events in their recorded order; viewing history never changes a request. */
(() => {
    'use strict';
    const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
    const text=value=>typeof value==='string'?value:'';
    const status=value=>text(value).trim().toLowerCase();
    // Stable display keys only, not a security or document-content hash.
    const key=value=>{let hash=2166136261;for(const char of value)hash=Math.imul(hash^char.charCodeAt(0),16777619);return (hash>>>0).toString(36);};
    function instruction(message){
        const value=text(message).replace(/<br\s*\/?\s*>/gi,'\n');
        const match=value.match(/^\s*Berkas yang perlu diperbaiki:\s*\n([\s\S]*?)\n\s*\nInstruksi:\s*([\s\S]*)$/);
        return match?{labels:match[1].split('\n').map(line=>line.replace(/^\s*-\s*/, '').trim()).filter(Boolean),message:match[2].trim()}:null;
    }
    function model(item){
        const raw=text(item?.note);let values;
        try{values=JSON.parse(raw||'[]');}catch(_){values=raw.trim()?[raw]:[];}
        if(!Array.isArray(values))values=raw.trim()?[raw]:[];
        const occurrences=new Map(),retries=new Set();
        const events=values.map((value,index)=>{
            const log=object(value)?value:{message:typeof value==='string'?value:''};
            const savedId=text(log.reviewRequestId)||text(log.typeChangeRequestId)||text(log.requestId);
            const identity=JSON.stringify([text(log.kind),text(log.role),savedId||index,savedId?'':log]);
            const base=key(identity),occurrence=occurrences.get(base)||0;occurrences.set(base,occurrence+1);
            const event={key:base+'-'+occurrence,index,log,role:status(log.role),status:status(log.status),instruction:instruction(log.message),unknown:!object(value)&&typeof value!=='string'};
            if(savedId){const retryKey=JSON.stringify([text(log.kind),event.role,savedId,log]);if(retries.has(retryKey))return null;retries.add(retryKey);}
            return event;
        }).filter(Boolean);
        const explicit=events.some(event=>event.status==='revision'||event.role==='admin'&&event.instruction);
        const current=status(item?.status);
        const legacyStart=!explicit&&['revision','resubmitted'].includes(current)?events.filter(event=>event.role==='admin'&&text(event.log.message).trim()&&!event.log.kind).at(-1):null;
        const groups=[],initial={key:'initial',number:0,events:[],phase:'recorded',submitted:false,legacy:false};
        let active=initial,latestReviews=[];const latestDocuments=new Map();
        for(const event of events){
            const starts=event.status==='revision'||event.role==='admin'&&event.instruction||event===legacyStart;
            if(starts){
                if(active.number)active.phase=active.submitted?'next_revision':'later_instructions';
                active={key:'round-'+event.key,number:groups.filter(group=>group.number).length+1,events:[],phase:'awaiting_student',submitted:false,legacy:event===legacyStart};
                groups.push(active);
                event.requestReviews=latestReviews.filter(review=>object(review)&&review.status==='revision'&&(!event.instruction?.labels.length||event.instruction.labels.includes(review.label))&&(!latestDocuments.has(review.label)||latestDocuments.get(review.label)===review.url));
            }
            active.events.push(event);
            event.correction=event.status==='resubmitted'||active.number>0&&event.role==='mhs'&&event.status!=='pending';
            if(event.status==='resubmitted'||active.number&&event.role==='mhs'&&!event.status){active.submitted=true;active.phase='awaiting_admin';}
            if(event.status==='accepted')active.phase='accepted';
            if(event.log.kind==='document_review'&&Array.isArray(event.log.reviews))latestReviews=event.log.reviews;
            if(event.log.kind==='request_type_change'){latestReviews=[];latestDocuments.clear();active.phase='type_changed';}
            if(Array.isArray(event.log.documents))event.log.documents.filter(object).forEach(doc=>{if(text(doc.label)&&text(doc.url))latestDocuments.set(doc.label,doc.url);});
        }
        if(initial.events.length)groups.unshift(initial);
        const latest=groups.at(-1);
        if(latest){
            if(current==='accepted')latest.phase='accepted';
            else if(current==='resubmitted')latest.phase='awaiting_admin';
            else if(current==='revision'&&latest.number)latest.phase='awaiting_student';
            else if(current==='pending'&&!latest.number)latest.phase='awaiting_admin';
        }
        return {groups:groups.slice().reverse(),rounds:groups.filter(group=>group.number).length,legacy:!!legacyStart,missingInstructions:!groups.some(group=>group.number)&&events.some(event=>event.status==='resubmitted')};
    }
    if(typeof module!=='undefined'&&module.exports)module.exports={model,instruction};
    if(typeof window==='undefined')return;
    const t=(id,en)=>uxText(id,en),el=id=>document.getElementById(id),safe=escapeHtml,rendered=new WeakMap();
    const authorized=item=>item&&getSessionToken()&&(['admin','mhs'].includes(currentUser.role))&&(currentUser.role==='admin'||isStudentOwner(item));
    const live=()=>el('modal-case-detail')?.style.display==='flex'&&el('modal-case-detail').style.opacity!=='0';
    const signature=item=>JSON.stringify([item.note,item.status,item.link,item.jenis,currentLang]);
    const phase=value=>({recorded:t('Catatan Tercatat','Recorded History'),awaiting_student:t('Menunggu Perbaikan','Awaiting Corrections'),awaiting_admin:t('Menunggu Pemeriksaan Admin','Awaiting Admin Review'),accepted:t('Pengajuan Disetujui','Request Approved'),next_revision:t('Revisi Lanjutan Diminta','Further Corrections Requested'),later_instructions:t('Instruksi Berikutnya Tercatat','Later Instructions Recorded'),type_changed:t('Jenis Pengajuan Diperbarui','Request Type Updated')})[value]||t('Catatan Tercatat','Recorded History');
    function reviewHtml(item,review){
        if(!object(review))return '';
        const state=['accepted','revision','pending'].includes(review.status)?review.status:'unknown';
        const label=state==='accepted'?t('Sudah Sesuai','Meets Requirements'):state==='revision'?t('Perlu Perbaikan','Needs Corrections'):state==='pending'?t('Belum Diperiksa','Not Reviewed'):t('Hasil Belum Tercatat','Result Not Recorded');
        return `<div class="round-review-note" data-review-state="${state}"><p class="round-review-label"><strong>${safe(documentText(text(review.label))||t('Berkas','File'))}</strong><span>${label}</span></p>${text(review.note)?`<p class="round-authored" data-preserve-case>${safe(review.note)}</p>`:''}${window.IPCOSPageNotes?.link(item,text(review.url),review.pageRef)||''}</div>`;
    }
    function documentsHtml(item,log){
        if(!Array.isArray(log.documents)||!log.documents.length)return '';
        const allowed=new Set(getCaseFiles(item).map(file=>file.url));
        return `<ul class="round-documents">${log.documents.filter(object).map(doc=>{
            const name=text(doc.fileName)||text(doc.label)||t('Berkas','File'),version=Number(doc.version),available=allowed.has(text(doc.url));
            return `<li><div><strong>${safe(documentText(text(doc.label))||t('Berkas','File'))}</strong><span data-preserve-case>${safe(name)}</span>${Number.isInteger(version)&&version>0?`<small>${t('Versi ','Version ')}${version}</small>`:''}</div>${available?`<button type="button" class="btn-secondary" data-history-file="${safe(doc.url)}">${t('Lihat Berkas','View File')}</button>`:`<p class="field-helper">${t('Berkas ini tidak tersedia pada pengajuan ini.','This file is unavailable in this request.')}</p>`}</li>`;
        }).join('')}</ul>`;
    }
    function eventHtml(item,event){
        const log=event.log,kind=text(log.kind),isInstruction=event.status==='revision'||event.role==='admin'&&event.instruction||event.requestReviews!==undefined;
        const title=isInstruction?t('Instruksi Admin','Admin Instructions'):kind==='document_review'?t('Hasil Pemeriksaan Berkas','Document Review Results'):event.correction?t('Perbaikan Mahasiswa','Student Corrections'):event.status==='accepted'?t('Keputusan Admin','Admin Decision'):kind==='request_type_change'?t('Perubahan Jenis Pengajuan','Request Type Change'):kind==='archive'?log.archived===false?t('Pengajuan Dipulihkan','Request Restored'):t('Pengajuan Diarsipkan','Request Archived'):event.role==='mhs'?t('Kiriman Awal Mahasiswa','Initial Student Submission'):t('Catatan Pengajuan','Request Note');
        const sender=text(log.sender)|| (event.role==='admin'?t('Admin','Admin'):event.role==='mhs'?t('Mahasiswa','Student'):t('Sistem','System'));
        const message=isInstruction&&event.instruction?event.instruction.message:text(log.message);
        const body=event.status==='accepted'&&(/^(Pengajuan disetujui\. Dosen Pembimbing: |Berkas telah disetujui dan terverifikasi\.$)/.test(message))?localizedSystemNote(message):safe(message.replace(/<br\s*\/?\s*>/gi,'\n'));
        const changes=Array.isArray(log.fieldChanges)?log.fieldChanges.filter(change=>object(change)&&typeof change.field==='string'&&typeof change.before==='string'&&typeof change.after==='string'):[];
        return `<article class="round-event" data-history-event="${event.key}"><header><h4>${title}</h4><p data-preserve-case>${safe(sender)}</p></header>${isInstruction&&event.instruction?.labels.length?`<ul class="round-requested-labels">${event.instruction.labels.map(label=>`<li>${safe(documentText(label))}</li>`).join('')}</ul>`:''}${message?`<p class="round-authored" data-preserve-case>${body}</p>`:event.unknown?`<p class="field-helper">${t('Catatan ini tidak memiliki format yang dikenali.','This history entry uses an unrecognized format.')}</p>`:''}${kind==='request_type_change'?`<p>${safe(systemText(text(log.fromType)))} → ${safe(systemText(text(log.toType)))}</p>`:''}${changes.length?window.IPCOSNext?.fieldHistory({fieldChanges:changes})||'':''}${documentsHtml(item,log)}${kind==='document_review'&&Array.isArray(log.reviews)?log.reviews.map(review=>reviewHtml(item,review)).join(''):''}${event.requestReviews?.length?`<section class="round-request-review"><h5>${t('Catatan Berkas Saat Revisi Diminta','File Notes When Corrections Were Requested')}</h5>${event.requestReviews.map(review=>reviewHtml(item,review)).join('')}</section>`:''}${event.status==='resubmitted'&&!Array.isArray(log.documents)&&!changes.length?`<p class="field-helper">${t('Rincian berkas atau perubahan isian tidak tercatat pada catatan ini.','File or field-change details were not recorded in this entry.')}</p>`:''}</article>`;
    }
    function html(item){
        if(!authorized(item))return '';
        const data=model(item);
        const contents=data.groups.map((group,index)=>{
            const title=group.legacy?t('Revisi Aktif','Active Corrections'):group.number?t('Revisi ','Revision ')+group.number:t('Catatan Awal','Earlier History');
            const lastReview=group.events.filter(event=>event.log.kind==='document_review').at(-1);
            return `<details class="revision-round" data-history-disclosure="${group.key}" data-history-round="${group.number}" ${index===0?'open':''}><summary><span class="round-summary-copy"><strong>${title}</strong>${index===0?`<small>${t('Terbaru','Latest')}</small>`:''}</span><span class="round-phase" data-phase="${group.phase}">${phase(group.phase)}</span></summary><div class="round-body">${group.legacy?`<p class="round-legacy-notice">${t('Putaran aktif mengikuti catatan admin terakhir. Nomor putaran sebelumnya tidak tercatat.','The active round follows the latest admin note. Previous round numbers were not recorded.')}</p>`:''}${group.events.map(event=>event.log.kind==='document_review'&&event!==lastReview?`<details class="round-earlier-review" data-history-disclosure="event-${event.key}"><summary>${t('Pemeriksaan Sebelumnya dalam Putaran Ini','Earlier Review in This Round')}</summary>${eventHtml(item,event)}</details>`:eventHtml(item,event)).join('')}</div></details>`;
        }).join('');
        return `<div class="revision-round-history" data-history-case="${safe(String(item.id))}" data-preserve-case><p class="round-history-intro">${data.legacy?t('Putaran aktif dan catatan awal yang tersedia.','The active correction round and available earlier history.'):data.rounds?t(`${data.rounds} putaran revisi · putaran terbaru di atas.`,`${data.rounds} correction ${data.rounds===1?'round':'rounds'} · latest first.`):t('Catatan ditampilkan sesuai urutan yang tersimpan.','Entries follow their recorded order.')}</p>${data.missingInstructions?`<p class="round-legacy-notice">${t('Kiriman perbaikan tercatat, tetapi instruksi revisi sebelumnya tidak tersedia.','A correction submission is recorded, but its earlier instructions are unavailable.')}</p>`:''}${contents||`<p class="field-helper">${t('Belum ada catatan pengajuan.','No request history yet.')}</p>`}</div>`;
    }
    function capture(){
        const root=el('case-detail-content')?.querySelector('.revision-round-history');if(!root)return null;
        const focused=document.activeElement,control=focused?.closest('[data-history-disclosure]');
        return {id:root.dataset.historyCase,epoch:sessionEpoch,token:getSessionToken(),open:new Map([...root.querySelectorAll('[data-history-disclosure]')].map(node=>[node.dataset.historyDisclosure,node.open])),focus:focused===root.closest('.case-round-history')?.querySelector(':scope>summary')?{outer:true}:root.contains(focused)?focused.hasAttribute('data-history-file')?{file:focused.dataset.historyFile,event:focused.closest('[data-history-event]')?.dataset.historyEvent}:focused.tagName==='SUMMARY'&&control?{key:control.dataset.historyDisclosure}:null:null};
    }
    function opened(item,saved=null){
        const root=el('case-detail-content')?.querySelector('.revision-round-history');if(!root||!authorized(item))return;
        rendered.set(root,{signature:signature(item),epoch:sessionEpoch,token:getSessionToken()});
        if(saved&&saved.id===String(item.id)&&saved.epoch===sessionEpoch&&saved.token===getSessionToken()){
            root.querySelectorAll('[data-history-disclosure]').forEach(node=>{if(saved.open.has(node.dataset.historyDisclosure))node.open=saved.open.get(node.dataset.historyDisclosure);});
            let target;
            if(saved.focus?.outer)target=root.closest('.case-round-history')?.querySelector(':scope>summary');
            else if(saved.focus?.key)target=[...root.querySelectorAll('[data-history-disclosure]')].find(node=>node.dataset.historyDisclosure===saved.focus.key)?.querySelector(':scope>summary');
            else if(saved.focus?.file)target=[...root.querySelectorAll('[data-history-file]')].find(node=>node.dataset.historyFile===saved.focus.file&&node.closest('[data-history-event]')?.dataset.historyEvent===saved.focus.event);
            if(target?.getClientRects().length)target.focus({preventScroll:true});
        }
        root.querySelectorAll('[data-history-file]').forEach(button=>{if(typeof pendingCasePreview!=='undefined'&&pendingCasePreview?.id===String(item.id)&&pendingCasePreview.epoch===sessionEpoch&&pendingCasePreview.url===button.dataset.historyFile)markCasePreviewBusy(pendingCasePreview,button);});
    }
    function refresh(){
        if(!live())return;
        const item=currentCase(),root=el('case-detail-content')?.querySelector('.revision-round-history');if(!root)return;
        if(!authorized(item)||root.dataset.historyCase!==String(item.id)){root.replaceChildren();return;}
        const previous=rendered.get(root);if(previous?.signature===signature(item)&&previous.epoch===sessionEpoch&&previous.token===getSessionToken())return;
        const saved=capture(),container=root.parentElement,scroll=el('case-detail-content').scrollTop;
        root.outerHTML=html(item);container.classList.add('revision-round-timeline');opened(item,saved);el('case-detail-content').scrollTop=scroll;
    }
    document.addEventListener('click',event=>{
        const button=event.target.closest('[data-history-file]');if(!button)return;
        const root=button.closest('.revision-round-history'),item=currentCase();
        if(!live()||!authorized(item)||!button.getClientRects().length||button.disabled||root?.dataset.historyCase!==String(item.id)||isPreparingCorrection||isPreparingReviewDecision||activeUpdateIds.size)return;
        const index=getCaseFiles(item).findIndex(file=>file.url===button.dataset.historyFile);if(index<0)return;
        const modal=el('modal-case-detail');modal.dataset.workspaceView='documents';modal.querySelector('#workspace-view-toggle button[data-workspace-view="documents"]')?.click();
        previewCaseFile(index,button);
    });
    window.IPCOSRevisionHistory=Object.freeze({model,html,capture,opened,refresh});
})();
