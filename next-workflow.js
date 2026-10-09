/* Small optional extensions; private drafts and diagnostics use the existing session. */
(() => {
    const fieldIds=['reg-jenis-utama','reg-judul','reg-dosen-lama','reg-dosen-baru','reg-alasan-ganti'];
    let draft={epoch:-1,loaded:false,revision:0,generation:0,confirmed:0,saving:false,intent:null,request:null,conflict:null,error:false},timer;
    let revision=null,healthBusy=false,healthError=false,healthEvents=null,interfaceReady=false;const reported=new Map();
    const text=(id,en)=>uxText(id,en),owner=()=>currentUser.role==='mhs' && !!getSessionToken();
    const fields=()=>Object.fromEntries(fieldIds.map(id=>[id,document.getElementById(id).value]));
    const requestId=()=>crypto.randomUUID?.().replaceAll('-','') || Date.now().toString(36)+Math.random().toString(36).slice(2);
    async function call(action,values={}) {
        const response=await apiPost(GAS_URL,{method:'POST',body:JSON.stringify({action,...values}),headers:{'Content-Type':'text/plain;charset=utf-8'}});
        const result=await readApiResult(response);if(!['success','conflict'].includes(result.status))throw Error(systemText(result.message || text('Proses belum berhasil. Coba kembali.','The operation failed. Please retry.')));return result;
    }
    function draftStatus() {
        if(!owner())return;
        const indicator=document.getElementById('form-draft-status'),controls=document.getElementById('draft-controls');if(!indicator||!controls)return;
        const conflict=draft.conflict;
        indicator.textContent=conflict?text('Ada draf berbeda di perangkat lain. Pilih versi untuk dilanjutkan.','A different draft exists on another device. Choose which version to continue.')
            :draft.error?text('Draf cloud belum tersimpan. Isian di tab ini tetap tersedia.','The cloud draft could not be saved. Your inputs remain available in this tab.')
            :!draft.loaded?text('Memeriksa draf cloud…','Checking your cloud draft…')
            :draft.saving||draft.generation>draft.confirmed?text('Menyimpan draf…','Saving your draft…')
            :draft.revision>0&&draft.intent!==null&&Object.keys(draft.intent).length>0?text('Draf tersimpan di cloud.','Draft saved in the cloud.')
            :text('Siap untuk pengajuan baru.','Ready for a new request.');
        const controlsKey=JSON.stringify([!!conflict,draft.error,currentLang]);
        if(controls.dataset.renderKey===controlsKey)return;controls.dataset.renderKey=controlsKey;
        controls.innerHTML=conflict?`<button type="button" class="btn-secondary" data-draft-choice="cloud">${text('Lanjutkan Draf Cloud','Continue Cloud Draft')}</button><button type="button" class="btn-secondary" data-draft-choice="local">${text('Gunakan Isian di Tab Ini','Use This Tab’s Inputs')}</button>`
            :draft.error?`<button type="button" class="btn-secondary" data-draft-choice="retry">${text('Coba Simpan Lagi','Retry Saving')}</button>`:'';
    }
    function applyDraft(saved) {
        // Do not replace selected files or an active review panel.
        if(document.querySelector('#registration-fields input[type="file"]') && [...document.querySelectorAll('#registration-fields input[type="file"]')].some(input=>input.files.length))return false;
        for(const id of fieldIds)document.getElementById(id).value=saved.fields?.[id] || '';
        toggleExamForm();guidance();
        if(saved.exists) {sessionStorage.setItem('ipcos_form_draft',JSON.stringify({ownerNim:currentUser.nim,savedAt:saved.updatedAt,...saved.fields}));registrationDirty=true;}
        else {sessionStorage.removeItem('ipcos_form_draft');registrationDirty=false;}
        renderRegistrationReadiness();return true;
    }
    async function startDraft() {
        if(!owner() || draft.epoch===sessionEpoch)return;
        const epoch=sessionEpoch;draft.epoch=epoch;draftStatus();
        try {
            const result=await call('get_form_draft');if(epoch!==sessionEpoch)return;
            draft.loaded=true;draft.revision=result.draft.revision;draft.error=false;
            const local=readStoredJSON(sessionStorage,'ipcos_form_draft',{});
            const hasLocal=local.ownerNim===currentUser.nim && !!local['reg-jenis-utama'];
            if(result.draft.exists) {
                if(draft.generation || hasLocal && JSON.stringify(Object.fromEntries(fieldIds.map(id=>[id,local[id]||''])))!==JSON.stringify(Object.fromEntries(fieldIds.map(id=>[id,result.draft.fields[id]||'']))))draft.conflict=result.draft;
                else if(applyDraft(result.draft))draft.intent=result.draft.fields;else draft.conflict=result.draft;
            } else if(hasLocal && !draft.generation) {draft.intent=Object.fromEntries(fieldIds.map(id=>[id,local[id]||'']));draft.generation++;}
            draftStatus();if(draft.generation>draft.confirmed&&!draft.conflict)flushDraft();
        } catch(error) {if(epoch!==sessionEpoch)return;draft.error=true;draftStatus();}
    }
    function changed(clear=false) {
        if(!owner())return;
        const nextIntent=clear?{}:fields();if(JSON.stringify(draft.intent)===JSON.stringify(nextIntent))return;
        draft.intent=nextIntent;draft.generation++;draft.request=null;draft.error=false;
        clearTimeout(timer);draftStatus();timer=setTimeout(flushDraft,900);
    }
    async function flushDraft() {
        if(!owner()||draft.saving||draft.conflict)return;
        if(!draft.loaded) {draft.epoch=-1;await startDraft();return;}
        if(draft.generation===draft.confirmed||!draft.intent)return;
        const epoch=sessionEpoch,generation=draft.generation,intent=structuredClone(draft.intent);
        const request=draft.request || {requestId:requestId(),revision:draft.revision,fields:intent};draft.request=request;draft.saving=true;draft.error=false;draftStatus();
        try {
            const result=await call('save_form_draft',request);if(epoch!==sessionEpoch)return;
            draft.revision=result.draft.revision;
            if(result.status==='conflict') {draft.conflict=result.draft;draft.request=null;}
            else {draft.confirmed=generation;draft.request=null;}
        } catch(error) {if(epoch!==sessionEpoch)return;draft.error=true;}
        finally {if(epoch===sessionEpoch){draft.saving=false;draftStatus();if(!draft.error&&!draft.conflict&&draft.generation>draft.confirmed)flushDraft();}}
    }
    async function chooseDraft(choice) {
        if(!owner()||draft.saving)return;
        if(choice==='retry'){draft.error=false;if(!draft.loaded)draft.epoch=-1;await flushDraft();return;}
        if(!draft.conflict)return;
        if(choice==='cloud') {
            if(!confirm(text('Ganti isian di tab ini dengan draf cloud? Berkas yang dipilih akan dilepas.','Replace this tab’s inputs with the cloud draft? Selected files will be cleared.')))return;
            document.querySelectorAll('#registration-fields input[type="file"]').forEach(input=>{if(input.files.length){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));}});
            const saved=draft.conflict;draft.conflict=null;draft.intent=saved.fields;draft.generation++;draft.confirmed=draft.generation;draft.request=null;draft.error=false;applyDraft(saved);draftStatus();
        } else {draft.conflict=null;draft.request=null;draft.intent=fields();draft.generation++;draft.error=false;await flushDraft();}
    }
    const fieldNames={title:['Judul','Title'],oldSupervisor:['Dosen Lama','Current Supervisor'],newSupervisor:['Dosen Baru yang Diusulkan','Proposed Supervisor'],reason:['Alasan','Reason']};
    function wantsFields(item) {return getRevisionInstructions(item).files.includes('Isian pengajuan');}
    async function revisionFields(item,panel) {
        if(!wantsFields(item))return;
        const epoch=sessionEpoch,id=String(item.id),form=document.createElement('fieldset');form.id='case-revision-fields';form.innerHTML=`<legend>${text('Perbaiki Isian Pengajuan','Correct Request Details')}</legend><p role="status">${text('Memuat isian…','Loading fields…')}</p>`;
        panel.querySelector('h3').after(form);revision={id,epoch,loading:true,version:'',requestId:requestId()};document.getElementById('btn-case-submit').disabled=true;
        try {
            const result=await call('get_revision_form',{id});if(epoch!==sessionEpoch||selectedCaseId!==id||!form.isConnected)return;
            revision={id,epoch,loading:false,version:result.version,requestId:requestId()};
            form.innerHTML=`<legend>${text('Perbaiki Isian Pengajuan','Correct Request Details')}</legend>${Object.entries(result.fields).map(([key,value])=>`<label for="correction-${key}">${text(...fieldNames[key])}</label><textarea id="correction-${key}" data-correction-field="${key}" rows="${key==='reason'?3:2}" maxlength="${key==='reason'?2000:500}" required>${escapeHtml(value)}</textarea>`).join('')}<p class="field-helper">${text('Perubahan dicatat dalam pengajuan ini. Penetapan dosen tetap dilakukan admin.','Changes are recorded in this request. Supervisor assignment remains an admin decision.')}</p>`;
            document.getElementById('btn-case-submit').disabled=false;
        } catch(error) {if(epoch!==sessionEpoch||!form.isConnected)return;form.innerHTML=`<legend>${text('Perbaiki Isian Pengajuan','Correct Request Details')}</legend><p class="field-error">${escapeHtml(error.message)}</p><button type="button" class="btn-secondary" data-revision-retry>${text('Coba Lagi','Retry')}</button>`;}
    }
    function correctionPayload() {
        if(!revision||revision.loading||revision.id!==selectedCaseId||revision.epoch!==sessionEpoch)throw Error(text('Tunggu isian selesai dimuat.','Wait for the fields to load.'));
        const values=Object.fromEntries([...document.querySelectorAll('[data-correction-field]')].map(input=>[input.dataset.correctionField,input.value.trim()]));
        if(!Object.keys(values).length || Object.values(values).some(value=>!value))throw Error(text('Lengkapi isian perbaikan.','Complete the corrected fields.'));
        return {version:revision.version,requestId:revision.requestId,fields:values};
    }
    function fieldHistory(log) {
        if(!Array.isArray(log.fieldChanges))return '';
        return `<dl class="field-change-list">${log.fieldChanges.filter(change=>fieldNames[change.field]).map(change=>`<dt>${text(...fieldNames[change.field])}</dt><dd><span>${text('Sebelumnya:','Before:')} ${escapeHtml(change.before)}</span><strong>${text('Perbaikan:','After:')} ${escapeHtml(change.after)}</strong></dd>`).join('')}</dl>`;
    }
    function guidance() {
        document.querySelectorAll('#registration-fields input[type="file"]').forEach(input=>{
            let row=document.getElementById(input.id+'-guidance');if(!row){row=document.createElement('div');row.id=input.id+'-guidance';row.className='upload-guidance';input.after(row);}
            row.innerHTML=`<button type="button" class="text-link" data-guide="templates-faq" data-guide-field="${input.id}">${text('Lihat Template','View Templates')}</button><button type="button" class="text-link" data-guide="sop-tugas-akhir" data-guide-field="${input.id}">${text('Baca SOP Tugas Akhir','Read Final Project SOP')}</button>`;
        });
        renderReminder();
    }
    let returnField='';
    function guide(tab,field) {
        // Reading a guide is a temporary detour; the in-tab form and files remain intact.
        if(isSubmittingRegistration)return;
        const dirty=registrationDirty;registrationDirty=false;try{switchTab(null,tab);}finally{registrationDirty=dirty;}
        returnField=field;let back=document.getElementById('guide-back');if(!back){back=document.createElement('div');back.id='guide-back';back.className='guide-back';document.getElementById(tab).prepend(back);}
        document.getElementById(tab).prepend(back);back.innerHTML=`<button type="button" class="btn-secondary" data-guide-return>${text('Kembali ke Pengajuan','Back to Request')}</button><span>${text('Isian dan berkas Anda tetap tersedia.','Your inputs and selected files remain available.')}</span>`;
    }
    function renderReminder() {
        const panel=document.getElementById('service-reminder');if(!panel)return;
        const type=document.getElementById('reg-jenis-utama').value,setting=serviceSetting(type),date=setting?.close;
        panel.hidden=!type||!date||!!serviceAvailability(type);
        if(panel.hidden)return;
        panel.innerHTML=`<p>${text('Batas Pengajuan','Submission Deadline')}: <strong>${escapeHtml(date)}</strong> · 23:59 WIB (UTC+7)</p><label for="service-reminder-days">${text('Ingatkan Sebelum Tenggat','Remind Me Before the Deadline')}</label><div class="reminder-controls"><select id="service-reminder-days"><option value="3">${text('3 Hari Sebelumnya','3 Days Before')}</option><option value="1">${text('1 Hari Sebelumnya','1 Day Before')}</option></select><button type="button" class="btn-secondary" data-service-reminder>${text('Tambahkan ke Kalender','Add to Calendar')}</button></div><p class="field-helper">${text('Kalender mengikuti tenggat saat ini. Jika jadwal berubah, tambahkan pengingat baru.','The calendar uses the current deadline. Add a new reminder if the schedule changes.')}</p>`;
    }
    async function report(code,operation='runtime') {
        if(!getSessionToken()||['report_health','get_health'].includes(operation))return;
        const allowed=['create','update','revise_request','get_document','get_receipt','get_data','get_sop','save_sop','get_sop_file','save_form_draft','get_form_draft','save_progress','get_journey','module','runtime'];if(!allowed.includes(operation))return;
        const key=code+operation;if(Date.now()-(reported.get(key)||0)<30000)return;reported.set(key,Date.now());
        try{await call('report_health',{code,operation});}catch(_) {/* Diagnostics must never interfere with an academic action. */}
    }
    async function health() {
        if(currentUser.role!=='admin'||healthBusy)return;
        const epoch=sessionEpoch,container=document.getElementById('health-results');if(!container)return;
        healthBusy=true;healthError=false;container.textContent=text('Memuat ringkasan gangguan…','Loading issue summary…');
        try {
            const result=await call('get_health');if(epoch!==sessionEpoch)return;
            healthEvents=result.events;renderHealth();
        } catch(error){if(epoch===sessionEpoch)healthError=true;}
        finally{if(epoch===sessionEpoch){healthBusy=false;renderHealth();}}
    }
    function renderHealth() {
        if(currentUser.role!=='admin')return;
        const container=document.getElementById('health-results');
        if(healthBusy){container.textContent=text('Memuat ringkasan gangguan…','Loading issue summary…');return;}
        if(healthError){container.textContent=text('Ringkasan belum tersedia. Coba muat lagi.','The summary is unavailable. Please reload it.');return;}
        if(!healthEvents)return;
        const labels={javascript:['Tampilan','Interface'],network:['Koneksi','Connection'],api_response:['Proses Belum Berhasil','Unsuccessful Operation'],api_timeout:['Waktu Tunggu Habis','Request Timed Out'],module:['Pemuatan Fitur','Feature Loading']};
        const operations={create:['Pengajuan Baru','New Request'],update:['Perubahan Pengajuan','Request Update'],revise_request:['Perbaikan Pengajuan','Request Correction'],get_document:['Berkas Pengajuan','Request Documents'],get_receipt:['Bukti Pengajuan','Request Receipt'],get_data:['Pembaruan Data','Data Refresh'],get_sop:['Panduan SOP','SOP Guide'],save_sop:['Publikasi SOP','SOP Publication'],get_sop_file:['Lampiran SOP','SOP Attachments'],save_form_draft:['Penyimpanan Draf','Draft Saving'],get_form_draft:['Pemulihan Draf','Draft Recovery'],save_progress:['Persiapan Akademik','Academic Preparation'],get_journey:['Perjalanan Akademik','Academic Journey'],module:['Pemuatan Fitur','Feature Loading'],runtime:['Tampilan','Interface']};
        container.innerHTML=healthEvents.length?`<ul class="health-list">${healthEvents.map(event=>`<li><strong>${text(...(labels[event.code]||labels.api_response))}</strong><span>${text(...(operations[event.operation]||operations.runtime))} · ${event.role==='admin'?text('Admin','Admin'):text('Mahasiswa','Student')} · ${Number(event.count)} ${text('kejadian',Number(event.count)===1?'event':'events')} · ${escapeHtml(formatDate(event.day))}</span></li>`).join('')}</ul>`:`<p>${text('Belum ada gangguan tercatat dalam 7 hari terakhir.','No issues have been recorded in the last 7 days.')}</p>`;
    }
    function revisionLanguage() {
        const form=document.getElementById('case-revision-fields');if(!form)return;
        form.querySelector('legend').textContent=text('Perbaiki Isian Pengajuan','Correct Request Details');
        form.querySelectorAll('[data-correction-field]').forEach(input=>{form.querySelector('label[for="'+input.id+'"]').textContent=text(...fieldNames[input.dataset.correctionField]);});
        const helper=form.querySelector('.field-helper');if(helper)helper.textContent=text('Perubahan dicatat dalam pengajuan ini. Penetapan dosen tetap dilakukan admin.','Changes are recorded in this request. Supervisor assignment remains an admin decision.');
        const loading=form.querySelector('[role="status"]');if(loading)loading.textContent=text('Memuat isian…','Loading fields…');
        const retry=form.querySelector('[data-revision-retry]');if(retry)retry.textContent=text('Coba Lagi','Retry');
    }
    function labelCase(value) {
        const small=new Set((currentLang==='id'?'dan atau di ke dari untuk dengan yang pada &':'and or in to of for with the a an at &').split(' '));let first=true;
        return value.replace(/[\p{L}][\p{L}\p{N}’']*/gu,word=>{const initial=first;first=false;if(word.toUpperCase()===word||/[A-Z].*[A-Z]/.test(word))return word;if(!initial&&small.has(word.toLowerCase()))return word.toLowerCase();return word[0].toLocaleUpperCase()+word.slice(1);});
    }
    function labels() {
        if(!interfaceReady)return;
        const selectors='h1,h2,h3,h4,summary,button,label,option,th';
        document.querySelectorAll(selectors).forEach(el=>{
            if(el.closest('[data-preserve-case],#welcome-modal,#workspace-profile,#faq-content-container,#template_berkas-content-container,#kalender-content-container,#kurikulum-content-container,#remidial-content-container,#input-dospem-select,#case-supervisor,.sop-page,#modal-sop-editor,.case-content-block,.case-timeline,.case-file-row,.academic-stage,.journey-stage')||el.matches('#edit-dosen-name-display,[data-case-id],[data-requirement-field],[data-clear-filter]'))return;
            const nodes=[...el.childNodes,...[...el.children].filter(child=>child.matches('span')).flatMap(child=>[...child.childNodes])];
            nodes.filter(node=>node.nodeType===Node.TEXT_NODE).forEach(node=>{const value=labelCase(node.textContent);if(value!==node.textContent)node.textContent=value;});
        });
    }
    function refresh() {guidance();draftStatus();revisionLanguage();renderHealth();labels();}
    function reset() {clearTimeout(timer);draft={epoch:-1,loaded:false,revision:0,generation:0,confirmed:0,saving:false,intent:null,request:null,conflict:null,error:false};revision=null;healthBusy=false;healthError=false;healthEvents=null;reported.clear();document.getElementById('draft-controls').textContent='';delete document.getElementById('draft-controls').dataset.renderKey;document.getElementById('health-results').textContent='';document.getElementById('guide-back')?.remove();const reminder=document.getElementById('service-reminder');reminder.hidden=true;reminder.textContent='';}
    document.addEventListener('click',event=>{
        const choice=event.target.closest('[data-draft-choice]');if(choice)chooseDraft(choice.dataset.draftChoice);
        const link=event.target.closest('[data-guide]');if(link)guide(link.dataset.guide,link.dataset.guideField);
        if(event.target.closest('[data-guide-return]')){switchTab(null,'pendaftaran');document.getElementById(returnField)?.focus();document.getElementById('guide-back')?.remove();}
        if(event.target.closest('[data-service-reminder]')){const type=document.getElementById('reg-jenis-utama').value;downloadServiceICS(type,serviceSetting(type).close,Number(document.getElementById('service-reminder-days').value));}
        if(event.target.closest('[data-health-refresh]'))health();
        if(event.target.closest('[data-revision-retry]')){document.getElementById('case-revision-fields')?.remove();revisionFields(currentCase(),document.getElementById('case-action-panel'));}
    });
    document.addEventListener('change',event=>{if(event.target.id==='reg-jenis-utama')guidance();});
    window.addEventListener('error',()=>report('javascript'));window.addEventListener('unhandledrejection',()=>report('javascript'));
    window.addEventListener('online',()=>{if(draft.error){draft.error=false;flushDraft();}});
    window.addEventListener('beforeunload',event=>{if(owner()&&draft.intent&&Object.values(draft.intent).some(value=>value)&&(draft.saving||draft.generation>draft.confirmed)){event.preventDefault();event.returnValue='';}});
    let labelQueued=false;new MutationObserver(()=>{if(labelQueued)return;labelQueued=true;queueMicrotask(()=>{labelQueued=false;labels();});}).observe(document.body,{childList:true,subtree:true});
    window.IPCOSNext={refresh,reset,startDraft,changed,flushDraft,revisionFields,wantsFields,correctionPayload,fieldHistory,report,health};
    window.addEventListener('load',()=>{interfaceReady=true;refresh();});
    refresh();
})();
