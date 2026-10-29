/* Private correction text survives reload in this tab. File contents are never serialized. */
(() => {
    'use strict';
    const KEY='ipcos_student_correction_drafts',TTL=24*60*60*1000,MAX_BYTES=300000;
    const fields={title:500,oldSupervisor:500,newSupervisor:500,reason:2000};
    const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
    const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
    const label=value=>typeof value==='string'&&value.trim().length>0&&value.length<=120&&!/[\x00-\x1f]/.test(value);
    const unique=values=>new Set(values).size===values.length;
    function normalizeEntry(value,now=Date.now()){
        if(!exact(value,['base','savedAt','note','fields','checks','labels','activeLabel','files'])||typeof value.base!=='string'||!/^(server:[a-f0-9]{64}|view:[a-f0-9]{32})$/.test(value.base)||!Number.isFinite(value.savedAt)||value.savedAt>now+60000||now-value.savedAt>TTL||typeof value.note!=='string'||value.note.length>5000||!exact(value.fields,Object.keys(fields))||Object.entries(value.fields).some(([key,text])=>typeof text!=='string'||text.length>fields[key]))return null;
        if(!Array.isArray(value.labels)||value.labels.length>6||!value.labels.every(label)||!unique(value.labels)||!Array.isArray(value.checks)||value.checks.length>6||!value.checks.every(key=>value.labels.includes(key))||!unique(value.checks)||typeof value.activeLabel!=='string'||value.activeLabel!==''&&!value.labels.includes(value.activeLabel)||!Array.isArray(value.files)||value.files.length>5)return null;
        if(value.files.some(file=>!exact(file,['label','name','size','type','lastModified'])||!value.labels.includes(file.label)||file.label==='Isian pengajuan'||typeof file.name!=='string'||!file.name.length||file.name.length>255||/[\x00-\x1f]/.test(file.name)||!Number.isInteger(file.size)||file.size<0||file.size>10*1024*1024||typeof file.type!=='string'||file.type.length>100||!Number.isInteger(file.lastModified)||file.lastModified<0)||!unique(value.files.map(file=>file.label)))return null;
        return {base:value.base,savedAt:value.savedAt,note:value.note,fields:Object.fromEntries(Object.entries(value.fields)),checks:value.checks.slice(),labels:value.labels.slice(),activeLabel:value.activeLabel,files:value.files.map(file=>({label:file.label,name:file.name,size:file.size,type:file.type,lastModified:file.lastModified}))};
    }
    function normalizeEnvelope(value,scope,owner,now=Date.now()){
        const empty=()=>({version:1,owner,scope,requests:{}});
        if(!exact(value,['version','owner','scope','requests'])||value.version!==1||value.owner!==owner||value.scope!==scope||!object(value.requests))return empty();
        const requests=Object.entries(value.requests).flatMap(([id,slot])=>{
            if(!id.trim()||id.length>200||/[\x00-\x1f\x7f]/.test(id)||!exact(slot,['saved','working']))return [];
            const saved=normalizeEntry(slot.saved,now),working=normalizeEntry(slot.working,now);
            return saved||working?[[id,{saved,working}]]:[];
        }).sort((a,b)=>Math.max(b[1].saved?.savedAt||0,b[1].working?.savedAt||0)-Math.max(a[1].saved?.savedAt||0,a[1].working?.savedAt||0)).slice(0,12);
        return {version:1,owner,scope,requests:Object.fromEntries(requests)};
    }
    function fingerprint(item){
        if(typeof item?.reviewVersion==='string'&&/^[a-f0-9]{64}$/.test(item.reviewVersion))return 'server:'+item.reviewVersion;
        // Compatibility change detector only; ownership and backend versions authorize every action.
        const source=JSON.stringify([String(item?.id||''),String(item?.status||'').trim().toLowerCase(),String(item?.jenis||''),String(item?.detail||''),String(item?.note||''),String(item?.link||'')]);
        return 'view:'+ [2166136261,2246822519,3266489917,668265263].map(seed=>{let hash=seed;for(let index=0;index<source.length;index++)hash=Math.imul(hash^source.charCodeAt(index),16777619);return (hash>>>0).toString(16).padStart(8,'0');}).join('');
    }
    if(typeof module!=='undefined'&&module.exports)module.exports={normalizeEntry,normalizeEnvelope,fingerprint};
    if(typeof window==='undefined')return;
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en),contexts=new WeakMap();
    let current=null,session=null,blocked=null;
    const owner=()=>String(currentUser.nim||'').normalize('NFKC').trim();
    const participant=item=>item&&currentUser.role==='mhs'&&!!getSessionToken()&&isStudentOwner(item);
    const busy=()=>isPreparingCorrection||activeUpdateIds.has(selectedCaseId)||window.IPCOSStudentCorrections?.preparing();
    function scope(){
        if(currentUser.role!=='mhs'||!getSessionToken())return null;
        if(blocked&&blocked.epoch===sessionEpoch&&blocked.token===getSessionToken())return null;
        if(session&&session.token===getSessionToken()&&session.owner===owner()&&session.epoch===sessionEpoch)return session;
        try{
            const auth=JSON.parse(sessionStorage.getItem('ipcos_session')||'null');
            if(!auth||auth.role!=='mhs'||auth.token!==getSessionToken()||String(auth.nim||'').normalize('NFKC').trim()!==owner())return null;
            if(session&&(session.token!==getSessionToken()||session.owner!==owner()))sessionStorage.removeItem(KEY);
            if(typeof auth.correctionDraftScope!=='string'||!/^[a-f0-9-]{32,40}$/i.test(auth.correctionDraftScope)){
                auth.correctionDraftScope=crypto.randomUUID();sessionStorage.setItem('ipcos_session',JSON.stringify(auth));
            }
            session={scope:auth.correctionDraftScope,owner:owner(),token:getSessionToken(),epoch:sessionEpoch};blocked=null;return session;
        }catch(_){return null;}
    }
    function read(identity){
        const raw=sessionStorage.getItem(KEY);if(raw&&raw.length>MAX_BYTES)throw Error('Draft store too large');
        let value;try{value=JSON.parse(raw||'null');}catch(_){value=null;}
        return normalizeEnvelope(value,identity.scope,identity.owner);
    }
    function write(identity,value){
        if(!identity||identity.token!==getSessionToken()||identity.epoch!==sessionEpoch||identity.owner!==owner())return false;
        const normalized=normalizeEnvelope(value,identity.scope,identity.owner),raw=JSON.stringify(normalized);
        if(raw.length>MAX_BYTES)throw Error('Draft store full');
        sessionStorage.setItem(KEY,raw);return true;
    }
    const slot=(envelope,id)=>Object.hasOwn(envelope.requests,id)?envelope.requests[id]:{saved:null,working:null};
    const put=(envelope,id,value)=>Object.defineProperty(envelope.requests,id,{value,writable:true,configurable:true,enumerable:true});
    function live(data){
        return !!data&&!data.closed&&!data.confirmed&&data===current&&data.epoch===sessionEpoch&&data.token===getSessionToken()&&data.panel.isConnected&&data.panel===el('case-action-panel')&&data.panel.dataset.action==='reply'&&!data.panel.hidden&&data.id===selectedCaseId&&participant(currentCase())&&el('modal-case-detail')?.style.display==='flex'&&el('modal-case-detail').style.opacity!=='0';
    }
    function capture(data){
        const state=window.IPCOSStudentCorrections?.context();if(!state||state.id!==data.id)return null;
        const inputs=[...data.panel.querySelectorAll('[data-correction-field]')],selected=[...el('case-reply-files').files].map((file,index)=>({file,label:el('revision-label-'+index)?.value||''})).filter(row=>state.labels.includes(row.label));
        const actual=selected.map(({file,label})=>({label,name:file.name,size:file.size,type:file.type,lastModified:file.lastModified}));
        const remembered=[...data.remembered.values()].filter(file=>state.labels.includes(file.label)&&!actual.some(row=>row.label===file.label));
        const values=Object.fromEntries(inputs.filter(input=>Object.hasOwn(fields,input.dataset.correctionField)).map(input=>[input.dataset.correctionField,input.value]));
        const entry={base:data.base,savedAt:Date.now(),note:el('case-reply-note')?.value||'',fields:inputs.length?values:data.last?.fields||{},checks:[...data.panel.querySelectorAll('[name="correction-complete"]:checked')].map(input=>input.dataset.correctionLabel).filter(value=>state.labels.includes(value)),labels:state.labels,activeLabel:state.label,files:[...actual,...remembered]};
        return normalizeEntry(entry);
    }
    function meaningful(data,entry){
        if(!entry)return false;let original={};try{original=JSON.parse(el('case-revision-fields')?.dataset.originalFields||'{}');}catch(_){}
        return !!(entry.note.trim()||entry.checks.length||entry.files.length||Object.entries(entry.fields).some(([key,value])=>value!==(original[key]??'')));
    }
    function flush(){
        const data=current;if(!live(data)||data.applying||data.waiting||data.confirmed)return false;
        const identity=scope();if(!identity){data.error=true;paint(data);return false;}
        const entry=capture(data);if(!entry){data.error=true;paint(data);return false;}
        if(!data.edited){paint(data);return true;}
        try{
            const envelope=read(identity),stored=slot(envelope,data.id);
            if(data.offer){stored.saved=data.offer;stored.working=meaningful(data,entry)?entry:null;}
            else {stored.saved=meaningful(data,entry)?entry:null;stored.working=null;}
            if(stored.saved||stored.working)put(envelope,data.id,stored);else delete envelope.requests[data.id];
            write(identity,envelope);data.last=entry;data.error=false;data.saved=meaningful(data,entry);if(data.offer)data.working=stored.working;paint(data);return true;
        }catch(_){data.error=true;paint(data);return false;}
    }
    function set(node,value){if(node&&node.textContent!==value)node.textContent=value;}
    function contents(node,entry){
        node.replaceChildren();if(!entry)return;
        const add=(heading,value)=>{const title=document.createElement('strong'),body=document.createElement('p');title.textContent=heading;body.textContent=value;body.className='correction-draft-authored';node.append(title,body);};
        add(t('Penjelasan Anda','Your Explanation'),entry.note||t('Belum diisi.','Not entered.'));
        const names={title:t('Judul','Title'),oldSupervisor:t('Dosen Lama','Current Supervisor'),newSupervisor:t('Dosen Baru yang Diusulkan','Proposed Supervisor'),reason:t('Alasan','Reason')};
        Object.entries(entry.fields).forEach(([key,value])=>add(names[key],value));
        if(entry.checks.length)add(t('Checklist Tersimpan','Saved Checklist'),entry.checks.map(documentText).join(' · '));
        if(entry.files.length)add(t('Berkas yang Perlu Dipilih Ulang','Files to Select Again'),entry.files.map(file=>documentText(file.label)+': '+file.name).join('\n'));
    }
    function paint(data){
        if(!live(data))return;
        const root=data.root,offered=data.offer,stale=data.base!==fingerprint(currentCase()),mismatch=!!offered&&(offered.base!==fingerprint(currentCase())||data.versionMismatch),locked=busy();
        const notice=root.querySelector('#student-correction-draft-status');
        set(notice,data.error?t('Draf belum dapat disimpan di tab ini. Jangan muat ulang sebelum menyalin isian.','This tab could not save the draft. Copy your inputs before reloading.'):data.waiting?t('Memulihkan draf setelah isian pengajuan selesai dimuat…','Restoring the draft when request fields finish loading…'):data.cancelled?t('Pemulihan dibatalkan karena isian berubah. Isian baru tetap tersedia.','Recovery was canceled because your inputs changed. Your new inputs remain available.'):offered?data.working?t('Isian baru tersimpan terpisah. Pilih draf yang ingin dilanjutkan.','New inputs are saved separately. Choose which draft to continue.'):t('Ada draf perbaikan tersimpan di tab ini.','A correction draft is saved in this tab.'):data.saved?t('Draf isian tersimpan di tab ini selama sesi aktif. Perbaikan belum dikirim.','Draft inputs are saved in this tab during the active session. Corrections have not been sent.'):t('Isian revisi akan disimpan di tab ini selama sesi aktif.','Correction inputs will be saved in this tab during the active session.'));
        notice.classList.toggle('is-error',!!data.error);notice.dataset.state=data.error?'error':data.waiting?'restoring':offered?'available':data.saved?'saved':'empty';
        const recovery=root.querySelector('#student-correction-draft-recovery');recovery.hidden=!offered;
        set(recovery.querySelector('h4'),mismatch?t('Draf Mengikuti Instruksi Sebelumnya','Draft Uses Earlier Instructions'):t('Lanjutkan Draf Revisi','Continue Correction Draft'));
        set(recovery.querySelector('[data-draft-offer-description]'),mismatch?t('Pengajuan telah berubah. Draf lama dapat dibaca dan disalin; isian terbaru tidak akan ditimpa.','The request changed. You can read and copy the old draft; newer inputs will not be overwritten.'):t('Pulihkan penjelasan, isian, checklist, dan bagian terakhir. Pilih ulang berkas pengganti setelah refresh.','Restore your explanation, fields, checklist and last item. Select replacement files again after reloading.'));
        const restore=root.querySelector('[data-correction-draft-restore]');set(restore,t('Lanjutkan Draf','Continue Draft'));restore.disabled=locked||mismatch||!!data.waiting;
        const discard=root.querySelector('[data-correction-draft-discard]');set(discard,t('Abaikan Draf Tersimpan','Discard Saved Draft'));discard.disabled=locked;
        const working=root.querySelector('[data-correction-draft-working]');working.hidden=!data.working;set(working,t('Lanjutkan Isian Terbaru','Continue Newer Inputs'));working.disabled=locked||!!data.waiting||!!data.working&&data.working.base!==fingerprint(currentCase());
        const details=root.querySelector('[data-correction-draft-contents]');set(details.querySelector('summary'),t('Lihat Isi Draf Tersimpan','View Saved Draft'));const signature=JSON.stringify([offered,currentLang]);if(details.ipcosDraftSignature!==signature){contents(details.querySelector('div'),offered);details.ipcosDraftSignature=signature;}
        const actualLabels=[...el('case-reply-files').files].map((_,index)=>el('revision-label-'+index)?.value);
        const missing=offered?[]:[...data.remembered.values()].filter(file=>!actualLabels.includes(file.label));
        const reminders=root.querySelector('[data-correction-draft-reminders]');reminders.hidden=!missing.length;
        set(reminders.querySelector('p'),t('Pilih ulang berkas pengganti sebelum mengirim. Isian dan checklist sudah dipulihkan.','Select replacement files again before sending. Your inputs and checklist have been restored.'));
        const filesKey=JSON.stringify([missing,currentLang,locked,stale]);if(reminders.ipcosFilesKey!==filesKey){
            const list=reminders.querySelector('ul');list.replaceChildren();missing.forEach(file=>{const row=document.createElement('li');row.dataset.correctionDraftFile=file.label;const name=document.createElement('strong'),label=document.createElement('span'),button=document.createElement('button');name.textContent=file.name;label.textContent=documentText(file.label)+' · '+t('Perlu Dipilih Ulang','Select Again');button.type='button';button.className='btn-secondary';button.dataset.correctionDraftSelect=file.label;button.textContent=t('Buka Bagian Ini','Open This Item');button.disabled=locked||stale;row.append(name,label,button);list.append(row);});reminders.ipcosFilesKey=filesKey;
        }
    }
    function start(panel,item){
        const state=window.IPCOSStudentCorrections?.context();if(!state||state.id!==String(item.id))return null;
        const root=document.createElement('section');root.id='student-correction-draft-box';root.className='correction-draft-box';root.dataset.preserveCase='';
        root.innerHTML='<p id="student-correction-draft-status" role="status" aria-live="polite"></p><section id="student-correction-draft-recovery" hidden><h4></h4><p data-draft-offer-description></p><div class="correction-draft-actions"><button type="button" class="btn-secondary" data-correction-draft-restore></button><button type="button" class="btn-secondary" data-correction-draft-working hidden></button><button type="button" class="btn-secondary" data-correction-draft-discard></button></div><details data-correction-draft-contents><summary></summary><div></div></details></section><section data-correction-draft-reminders hidden><p></p><ul></ul></section>';
        (el('student-correction-workspace')||panel.firstElementChild).before(root);
        const data={panel,root,id:String(item.id),epoch:sessionEpoch,token:getSessionToken(),base:fingerprint(item),offer:null,working:null,last:null,remembered:new Map(),edited:false,saved:false,error:false,closed:false,confirmed:false,applying:false,waiting:null,cancelled:false,versionMismatch:false};
        const identity=scope();try{if(!identity)throw Error('Unavailable scope');const stored=slot(read(identity),data.id);data.offer=stored.saved||stored.working;data.working=stored.saved?stored.working:null;}catch(_){data.error=true;}
        root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-correction-draft-restore'))restore(data,data.offer);else if(button.hasAttribute('data-correction-draft-working'))restore(data,data.working);else if(button.hasAttribute('data-correction-draft-discard'))discard(data);else if(button.hasAttribute('data-correction-draft-select')&&!busy()){window.IPCOSStudentCorrections.selectLabel(button.dataset.correctionDraftSelect);el('correction-workspace-upload')?.focus({preventScroll:true});}});
        contexts.set(panel,data);return data;
    }
    function refresh(){
        const item=currentCase(),panel=el('case-action-panel');
        if(!item||!panel||panel.hidden||panel.dataset.action!=='reply'||!participant(item)||el('modal-case-detail')?.style.display!=='flex'||el('modal-case-detail').style.opacity==='0')return;
        let data=contexts.get(panel);
        if(!data||data.closed){if(String(item.status).toLowerCase()!=='revision')return;data=start(panel,item);if(!data)return;}
        current=data;paint(data);
    }
    function applyPending(data){
        if(!live(data)||!data.waiting||busy())return;
        const entry=data.waiting;
        if(entry.base!==fingerprint(currentCase())||data.base!==fingerprint(currentCase())){data.waiting=null;data.versionMismatch=true;paint(data);return;}
        const wants=window.IPCOSNext?.wantsFields(currentCase()),form=el('case-revision-fields'),inputs=[...data.panel.querySelectorAll('[data-correction-field]')];
        if(wants&&!inputs.length){paint(data);return;}
        if(wants&&/^[a-f0-9]{64}$/.test(currentCase().reviewVersion||'')&&form?.dataset.revisionVersion!==currentCase().reviewVersion){data.waiting=null;data.versionMismatch=true;paint(data);return;}
        if(Object.keys(entry.fields).some(key=>!inputs.some(input=>input.dataset.correctionField===key))){data.waiting=null;data.versionMismatch=true;paint(data);return;}
        data.applying=true;
        el('case-reply-note').value=entry.note;
        inputs.forEach(input=>{if(Object.hasOwn(entry.fields,input.dataset.correctionField))input.value=entry.fields[input.dataset.correctionField];});
        data.panel.querySelectorAll('[name="correction-complete"]').forEach(input=>input.checked=entry.checks.includes(input.dataset.correctionLabel));
        data.remembered=new Map(entry.files.map(file=>[file.label,file]));data.last=entry;data.edited=true;data.offer=null;data.working=null;data.waiting=null;data.cancelled=false;data.panel.dataset.dirty='true';
        const context=window.IPCOSStudentCorrections.context(),index=context.labels.indexOf(entry.activeLabel);if(index>=0)window.IPCOSStudentCorrections.openTask(index,false);
        ['#case-reply-note','[data-correction-field]','[name="correction-complete"]'].forEach(selector=>data.panel.querySelectorAll(selector).forEach(input=>input.dispatchEvent(new Event('input',{bubbles:true}))));
        data.applying=false;flush();(el('correction-workspace-title')||el('case-reply-note'))?.focus({preventScroll:true});
    }
    function restore(data,entry){
        if(!live(data)||!entry||busy()||entry.base!==fingerprint(currentCase())||data.versionMismatch)return;
        if(data.edited&&meaningful(data,capture(data))&&!confirm(t('Ganti isian yang sedang diedit dengan draf tersimpan? Berkas yang baru dipilih tetap tersedia.','Replace the inputs being edited with the saved draft? Newly selected files remain available.')))return;
        data.cancelled=false;data.waiting=entry;paint(data);applyPending(data);
    }
    function discard(data){
        if(!live(data)||busy())return;
        try{
            const identity=scope();if(!identity)throw Error('Unavailable scope');
            const envelope=read(identity),entry=data.edited?capture(data):data.working;
            if(data.edited&&!entry)throw Error('Invalid draft inputs');
            const retained=data.edited?(meaningful(data,entry)?entry:null):entry;
            if(retained)put(envelope,data.id,{saved:retained,working:null});else delete envelope.requests[data.id];
            if(!write(identity,envelope))throw Error('Changed session');
            data.offer=data.edited?null:retained;data.working=null;data.waiting=null;data.cancelled=false;data.last=data.edited?entry:null;data.saved=!!retained;data.error=false;
        }catch(_){data.error=true;}
        paint(data);
    }
    function changed(event){
        if(!event.target?.closest('#case-action-panel')||!event.target.matches('#case-reply-note,[data-correction-field],[name="correction-complete"],#case-reply-files,#revision-associations select'))return;
        refresh();const data=current;if(!live(data)||data.applying)return;
        data.edited=true;if(data.waiting){data.waiting=null;data.cancelled=true;}
        const epoch=sessionEpoch,token=getSessionToken();queueMicrotask(()=>{if(data===current&&epoch===sessionEpoch&&token===getSessionToken())flush();});
    }
    function confirmed(id){
        if(current?.id===String(id)){current.confirmed=true;current.waiting=null;current.root?.remove();}
        try{const identity=scope();if(!identity)return;const envelope=read(identity);delete envelope.requests[String(id)];write(identity,envelope);}catch(_){}
    }
    function clear(){
        blocked={epoch:sessionEpoch,token:getSessionToken()};if(current){current.closed=true;current.waiting=null;current.root?.remove();}current=null;session=null;
        try{sessionStorage.removeItem(KEY);}catch(_){}
    }
    function detach(){flush();if(current){current.closed=true;current.waiting=null;current.root?.remove();}current=null;}
    document.addEventListener('input',changed);document.addEventListener('change',changed);
    window.addEventListener('pagehide',flush);window.addEventListener('beforeunload',flush);document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
    window.addEventListener('ipcos:logout',clear);
    window.IPCOSCorrectionDrafts=Object.freeze({refresh,flush,clear,confirmed,detach,fieldsReady:()=>{refresh();if(current?.waiting)applyPending(current);},positionChanged:()=>{refresh();if(current?.edited)flush();},forgetFile:label=>{current?.remembered.delete(label);}});
})();
