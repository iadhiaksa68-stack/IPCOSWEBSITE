/* Supervisor capacity uses the server's persisted workload, not request counts. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
    const hash=value=>{let result=2166136261;for(const char of String(value)){result^=char.codePointAt(0);result=Math.imul(result,16777619);}return(result>>>0).toString(36);};
    const authenticated=()=>currentUser.role==='admin'&&!!getSessionToken();
    const ownerKey=()=>authenticated()?`${sessionEpoch}:${getSessionToken()}`:'';
    const operationKinds=['add','edit','delete'];
    let owner='',query='',availability='all',listKey='',editBaseline=null,returnOrigin=null,modalWasOpen=false;
    const busy={add:false,edit:false,delete:false},messages={add:null,edit:null};
    const integer=(value,min)=>String(value??'').trim()!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=min?Number(value):null;
    const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
    const visible=node=>node?.isConnected&&node.getClientRects().length&&!node.disabled&&!node.closest('[hidden],[inert]');
    function records(){
        if(!authenticated())return [];
        const source=readStoredJSON(sessionStorage,'ipcos_dosens',[]),rows=(Array.isArray(source)?source:[]).filter(row=>row&&typeof row==='object');
        const names=new Map(),seen=new Map();rows.forEach(row=>{const name=String(row.Nama??'').trim();names.set(name,(names.get(name)||0)+1);});
        return rows.map(raw=>{
            const name=String(raw.Nama??''),used=integer(raw.Terpakai,0),max=integer(raw.Maksimal,1),duplicate=!!name.trim()&&names.get(name.trim())>1;
            const valid=!!name.trim()&&!duplicate&&used!==null&&max!==null,remaining=valid?max-used:null;
            const base=hash(name),occurrence=seen.get(base)||0;seen.set(base,occurrence+1);
            return {raw,name,used,max,remaining,duplicate,key:`supervisor-${base}-${occurrence}`,state:!valid?'review':remaining<=0?'full':remaining<=2?'near':'available'};
        }).sort((a,b)=>a.remaining===null&&b.remaining!==null?1:b.remaining===null&&a.remaining!==null?-1:(b.remaining??0)-(a.remaining??0)||normalize(a.name).localeCompare(normalize(b.name))||a.key.localeCompare(b.key));
    }
    function isBusy(kind){return kind?!!busy[kind]:operationKinds.some(key=>busy[key]);}
    function fieldError(id,message){
        const input=el(id);if(!input)return;
        let node=el(id+'-error');if(!node){node=document.createElement('p');node.id=id+'-error';node.className='supervisor-field-error';input.after(node);}
        node.textContent=message;node.hidden=!message;input.setAttribute('aria-invalid',String(!!message));
        const ids=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(value=>value&&value!==node.id);if(message)ids.push(node.id);
        if(ids.length)input.setAttribute('aria-describedby',ids.join(' '));else input.removeAttribute('aria-describedby');
    }
    function errors(kind){
        if(kind==='add'){
            const name=el('add-dosen-nama').value.trim(),max=el('add-dosen-max').value;
            return {'add-dosen-nama':!name?t('Isi nama dosen beserta gelarnya.','Enter the supervisor’s full name and title.'):records().some(row=>row.name.trim()===name)?t('Nama dosen sudah ada dalam daftar.','This supervisor name is already in the list.'):'',
                'add-dosen-max':integer(max,1)===null?t('Isi kuota maksimal dengan bilangan bulat lebih dari 0.','Enter a maximum capacity greater than 0, using a whole number.'):''};
        }
        const used=integer(el('edit-dosen-terpakai').value,0),max=integer(el('edit-dosen-maksimal').value,1);
        return {'edit-dosen-terpakai':used===null?t('Beban terpakai harus bilangan bulat 0 atau lebih.','Assigned students must be a whole number of 0 or more.'):max!==null&&used>max?t('Beban terpakai tidak boleh melebihi kuota maksimal.','Assigned students cannot exceed maximum capacity.'):'',
            'edit-dosen-maksimal':max===null?t('Isi kuota maksimal dengan bilangan bulat lebih dari 0.','Enter a maximum capacity greater than 0, using a whole number.'):''};
    }
    function validate(kind){
        if(!authenticated()||isBusy())return false;
        ensureOwner();
        if(kind==='edit'&&editBaseline){
            const row=records().find(row=>row.name===editBaseline.name&&!row.duplicate);
            if(!row){feedback('edit',{id:'Dosen tidak lagi tersedia dalam daftar. Tutup editor dan periksa daftar terbaru.',en:'This supervisor is no longer available in the list. Close the editor and check the latest list.'});return false;}
            if(JSON.stringify([row.used,row.max])!==editBaseline.signature){
                feedback('edit',{id:'Data berubah. Tutup dan buka kembali untuk memakai data terbaru. Isian Anda tetap tersedia.',en:'The data changed. Close and reopen the editor to use the latest data. Your inputs are still available.'});return false;
            }
        }
        const problems=errors(kind);Object.entries(problems).forEach(([id,message])=>fieldError(id,message));
        const first=Object.keys(problems).find(id=>problems[id]);if(first){el(first).focus();return false;}
        messages[kind]=null;renderMessages();return true;
    }
    function feedback(kind,message,type='error'){
        const target=kind==='add'?'add':'edit';if(!authenticated())return;
        messages[target]=message?{message,type}:null;renderMessages();
    }
    function renderMessages(){
        ['add','edit'].forEach(kind=>{const node=el(`supervisor-${kind}-feedback`),value=messages[kind];if(!node)return;
            const message=value?.message;setText(node,message?typeof message==='object'?t(message.id,message.en):systemText(message):'');node.hidden=!message;node.dataset.state=value?.type||'';});
    }
    function localize(){
        const page=el('admin-dosen'),modal=el('modal-edit-dosen');if(!page)return;
        setText(page.querySelector('.supervisor-heading h1'),t('Manajemen Kuota Dosen','Supervisor Capacity'));
        setText(page.querySelector('.supervisor-heading p'),t('Atur kapasitas bimbingan dan periksa sisa kuota setiap dosen.','Manage supervision capacity and check each supervisor’s remaining places.'));
        [['total','Total Dosen','Total Supervisors'],['available','Masih Tersedia','Available'],['full','Kuota Penuh','At Capacity'],['review','Perlu Dicek','Needs Checking']].forEach(([key,id,en])=>setText(page.querySelector(`[data-supervisor-${key}]`)?.parentElement.querySelector('dt'),t(id,en)));
        [['supervisor-search','Cari Dosen','Find a Supervisor'],['supervisor-availability','Ketersediaan','Availability'],['add-dosen-nama','Nama Dosen *','Supervisor Name *'],['add-dosen-max','Kuota Maksimal *','Maximum Capacity *'],['edit-dosen-terpakai','Beban Terpakai *','Assigned Students *'],['edit-dosen-maksimal','Kuota Maksimal *','Maximum Capacity *']].forEach(([id,label,en])=>setText(document.querySelector(`label[for="${id}"]`),t(label,en)));
        [['all','Semua Dosen','All Supervisors'],['available','Masih Tersedia','Available'],['near','Hampir Penuh','Nearly Full'],['full','Penuh / Melebihi Kuota','Full / Over Capacity'],['review','Data Perlu Dicek','Check Data']].forEach(([value,id,en])=>setText(el('supervisor-availability')?.querySelector(`option[value="${value}"]`),t(id,en)));
        setText(el('supervisor-reset'),t('Reset Filter','Reset Filters'));setText(page.querySelector('#supervisor-list-panel caption'),t('Kapasitas bimbingan dosen','Supervisor capacity'));
        [['Dosen','Supervisor'],['Terpakai / Maksimal','Assigned / Maximum'],['Sisa Kuota','Remaining'],['Ketersediaan','Availability'],['Tindakan','Action']].forEach(([id,en],index)=>setText(page.querySelectorAll('#supervisor-list-panel th')[index],t(id,en)));
        setText(page.querySelector('.supervisor-add-panel h2'),t('Tambah Dosen','Add a Supervisor'));
        if(el('add-dosen-nama'))el('add-dosen-nama').placeholder=t('Nama lengkap beserta gelar','Full name and title');
        if(el('add-dosen-max'))el('add-dosen-max').placeholder=t('Contoh: 5','Example: 5');
        setText(el('edit-dosen-title'),t('Ubah Kuota Dosen','Edit Supervisor Capacity'));
        setText(el('supervisor-quota-note'),t('Beban terpakai mengikuti data bimbingan. Sesuaikan setelah memeriksa data mahasiswa.','Assigned students follow the supervision records. Adjust this after checking the student data.'));
        setText(el('supervisor-edit-cancel'),t('Batal','Cancel'));
        setText(modal?.querySelector('#supervisor-delete summary'),t('Hapus Dosen dari Daftar','Remove Supervisor from the List'));
        setText(modal?.querySelector('#supervisor-delete p'),t('Dosen akan dihapus dari daftar kuota.','The supervisor will be removed from the capacity list.'));
    }
    function updateBusy(){
        const pending=isBusy(),row=editBaseline&&records().find(row=>row.name===editBaseline.name&&!row.duplicate),missing=editBaseline&&!row;
        const changed=row&&JSON.stringify([row.used,row.max])!==editBaseline.signature;
        document.querySelectorAll('#admin-dosen [data-supervisor-edit]').forEach(button=>button.disabled=pending||button.dataset.invalid==='true');
        ['supervisor-add-submit','supervisor-edit-save','supervisor-delete-button'].forEach(id=>{const node=el(id);if(node)node.disabled=pending||id!=='supervisor-add-submit'&&!!missing||id==='supervisor-edit-save'&&!!changed;});
        ['edit-dosen-terpakai','edit-dosen-maksimal','supervisor-edit-cancel'].forEach(id=>{if(el(id))el(id).disabled=pending;});
        ['supervisor-add-form','supervisor-edit-form'].forEach(id=>el(id)?.setAttribute('aria-busy',String(pending)));
        setText(el('supervisor-add-submit'),busy.add?t('Menambahkan...','Adding...'):t('Tambah Dosen','Add Supervisor'));
        setText(el('supervisor-edit-save'),busy.edit?t('Menyimpan...','Saving...'):t('Simpan Perubahan','Save Changes'));
        setText(el('supervisor-delete-button'),busy.delete?t('Menghapus...','Removing...'):t('Hapus dari Daftar','Remove from List'));
    }
    function setBusy(kind,value){if(!operationKinds.includes(kind)||!authenticated())return;ensureOwner();busy[kind]=!!value;updateBusy();}
    function editSource(){
        if(!editBaseline)return;
        const modal=el('modal-edit-dosen');let note=el('supervisor-edit-source-status');
        if(!note){note=document.createElement('p');note.id='supervisor-edit-source-status';note.className='supervisor-source-status';note.setAttribute('role','status');el('edit-dosen-name-display')?.after(note);}
        const row=records().find(row=>row.name===editBaseline.name&&!row.duplicate),signature=row?JSON.stringify([row.used,row.max]):'';
        note.hidden=!!row&&signature===editBaseline.signature;
        setText(note,!row?t('Dosen tidak lagi tersedia dalam daftar. Isian Anda tetap dipertahankan.','This supervisor is no longer available in the list. Your inputs have been preserved.')
            :t(`Data terbaru: ${row.used??'—'} terpakai dari kuota ${row.max??'—'}. Tutup dan buka kembali untuk memakai data terbaru. Isian Anda tetap tersedia.`,`Latest data: ${row.used??'—'} assigned out of ${row.max??'—'}. Close and reopen the editor to use the latest data. Your inputs are still available.`));
        if(modal?.style.display==='none')note.hidden=true;
    }
    function opened(name){
        if(!authenticated()||isBusy())return false;ensureOwner();
        const row=records().find(item=>item.name===String(name)&&!item.duplicate),active=document.activeElement;
        returnOrigin={node:active,name:String(name),epoch:sessionEpoch,list:!!active?.closest('#admin-dosen [data-supervisor-edit]')};
        editBaseline={name:String(name),signature:row?JSON.stringify([row.used,row.max]):''};messages.edit=null;
        ['edit-dosen-terpakai','edit-dosen-maksimal'].forEach(id=>fieldError(id,''));
        if(el('supervisor-delete'))el('supervisor-delete').open=false;
        localize();renderMessages();editSource();updateBusy();return true;
    }
    function modalChanged(){
        const modal=el('modal-edit-dosen');if(!modal)return;
        const open=!!modal.getClientRects().length&&getComputedStyle(modal).display!=='none';
        if(open){editSource();updateBusy();}
        if(modalWasOpen&&!open){const origin=returnOrigin;returnOrigin=null;editBaseline=null;
            if(origin?.epoch===sessionEpoch&&authenticated())queueMicrotask(()=>{
                if(origin.epoch!==sessionEpoch||!authenticated()||[...document.querySelectorAll('.overlay,dialog[open]')].some(node=>node!==modal&&node.getClientRects().length&&getComputedStyle(node).display!=='none'))return;
                const target=visible(origin.node)?origin.node:origin.list?[...document.querySelectorAll('#admin-dosen [data-supervisor-edit]')].find(node=>node.dataset.supervisorName===origin.name&&visible(node)):null;
                (target||el('supervisor-search'))?.focus({preventScroll:true});
            });
        }
        modalWasOpen=open;
    }
    function reset(){
        owner='';query='';availability='all';listKey='';editBaseline=null;returnOrigin=null;modalWasOpen=false;
        operationKinds.forEach(kind=>busy[kind]=false);messages.add=null;messages.edit=null;
        ['supervisor-search','add-dosen-nama','hidden-dosen-nama','edit-dosen-terpakai','edit-dosen-maksimal'].forEach(id=>{if(el(id))el(id).value='';});if(el('add-dosen-max'))el('add-dosen-max').value='5';
        if(el('supervisor-availability'))el('supervisor-availability').value='all';
        ['table-admin-dosen','supervisor-mobile-list','supervisor-empty'].forEach(id=>el(id)?.replaceChildren());
        document.querySelectorAll('#supervisor-summary dd').forEach(node=>setText(node,'0'));setText(el('supervisor-result-count'),'');setText(el('edit-dosen-name-display'),'');
        if(el('supervisor-empty'))el('supervisor-empty').hidden=true;if(el('supervisor-reset'))el('supervisor-reset').hidden=true;if(el('supervisor-edit-source-status'))el('supervisor-edit-source-status').remove();
        ['add-dosen-nama','add-dosen-max','edit-dosen-terpakai','edit-dosen-maksimal'].forEach(id=>{if(el(id))fieldError(id,'');});
        renderMessages();updateBusy();
    }
    function ensureOwner(){const key=ownerKey();if(!key){reset();return false;}if(owner&&owner!==key)reset();owner=key;return true;}
    function status(row){return row.state==='review'?t('Data Perlu Dicek','Check Data'):row.remaining<0?t('Melebihi Kuota','Over Capacity'):row.state==='full'?t('Penuh','Full'):row.state==='near'?t('Hampir Penuh','Nearly Full'):t('Tersedia','Available');}
    function remaining(row){return row.remaining===null?'—':row.remaining<0?t(`${Math.abs(row.remaining)} di atas kuota`,`${Math.abs(row.remaining)} over capacity`):String(row.remaining);}
    function badge(row){return `<span class="supervisor-state supervisor-state-${row.state}">${status(row)}</span>`;}
    function editButton(row){return `<button type="button" class="btn-secondary" data-supervisor-edit="${row.key}" data-supervisor-name="${escapeHtml(row.name)}" data-invalid="${!row.name.trim()||row.duplicate}" ${!row.name.trim()||row.duplicate?'disabled':''} aria-label="${escapeHtml(t('Ubah kuota','Edit capacity')+' · '+(row.name.trim()||t('Dosen tanpa nama','Unnamed supervisor')))}">${t('Ubah Kuota','Edit Capacity')}</button>`;}
    function render(){
        if(!el('supervisor-search')||!ensureOwner())return;
        localize();
        const all=records(),filtered=all.filter(row=>normalize(row.name).includes(normalize(query))&&(availability==='all'||availability==='available'&&['available','near'].includes(row.state)||availability==='near'&&row.state==='near'||availability==='full'&&row.state==='full'||availability==='review'&&row.state==='review'));
        [['total',all.length],['available',all.filter(row=>['available','near'].includes(row.state)).length],['full',all.filter(row=>row.state==='full').length],['review',all.filter(row=>row.state==='review').length]].forEach(([name,count])=>setText(document.querySelector(`[data-supervisor-${name}]`),String(count)));
        el('supervisor-search').placeholder=t('Cari nama dosen...','Search supervisor names...');el('supervisor-reset').hidden=!query&&availability==='all';
        setText(el('supervisor-result-count'),t(`${filtered.length} dari ${all.length} dosen ditampilkan`,`${filtered.length} of ${all.length} supervisors shown`));
        el('supervisor-list-panel').hidden=!filtered.length;el('supervisor-mobile-list').hidden=!filtered.length;el('supervisor-empty').hidden=!!filtered.length;
        const table=filtered.map(row=>`<tr><td><strong data-preserve-case>${escapeHtml(row.name.trim()||t('Dosen tanpa nama','Unnamed supervisor'))}</strong>${row.state==='review'?`<p class="supervisor-data-note">${row.duplicate?t('Nama tercatat lebih dari sekali.','This name is listed more than once.'):t('Periksa nama dan angka kuota sebelum digunakan.','Check the name and capacity values before use.')}</p>`:''}</td><td class="supervisor-workload">${row.used??'—'} <span>/ ${row.max??'—'}</span></td><td>${remaining(row)}</td><td>${badge(row)}</td><td>${editButton(row)}</td></tr>`).join('');
        const cards=filtered.map(row=>`<article class="supervisor-card"><div class="supervisor-card-heading"><h3 data-preserve-case>${escapeHtml(row.name.trim()||t('Dosen tanpa nama','Unnamed supervisor'))}</h3>${badge(row)}</div>${row.state==='review'?`<p class="supervisor-data-note">${row.duplicate?t('Nama tercatat lebih dari sekali.','This name is listed more than once.'):t('Periksa nama dan angka kuota sebelum digunakan.','Check the name and capacity values before use.')}</p>`:''}<dl class="supervisor-card-capacity"><div><dt>${t('Terpakai','Assigned')}</dt><dd>${row.used??'—'}</dd></div><div><dt>${t('Maksimal','Maximum')}</dt><dd>${row.max??'—'}</dd></div><div><dt>${t('Sisa Kuota','Remaining')}</dt><dd>${remaining(row)}</dd></div></dl>${editButton(row)}</article>`).join('');
        const nextKey=table+'\n'+cards;
        if(nextKey!==listKey||!el('table-admin-dosen').firstElementChild&&filtered.length){
            const active=document.activeElement,name=active?.closest('#admin-dosen [data-supervisor-edit]')?.dataset.supervisorName;listKey=nextKey;
            el('table-admin-dosen').innerHTML=table;el('supervisor-mobile-list').innerHTML=cards;
            if(name!==undefined){const target=[...document.querySelectorAll('#admin-dosen [data-supervisor-edit]')].find(node=>node.dataset.supervisorName===name&&visible(node));(target||el('supervisor-search')).focus({preventScroll:true});}
        }
        if(!filtered.length){const html=all.length?`<h2>${t('Tidak ada dosen yang cocok','No matching supervisors')}</h2><p>${t('Coba nama atau ketersediaan lain, atau reset filter.','Try another name or availability filter, or reset the filters.')}</p>`:`<h2>${t('Belum ada dosen dalam daftar','No supervisors listed yet')}</h2><p>${t('Tambahkan dosen melalui formulir di bawah.','Add a supervisor using the form below.')}</p>`;if(el('supervisor-empty').innerHTML!==html)el('supervisor-empty').innerHTML=html;}
        ['add','edit'].forEach(kind=>{if(el(`supervisor-${kind}-form`)?.querySelector('[aria-invalid="true"]'))Object.entries(errors(kind)).forEach(([id,message])=>fieldError(id,message));});
        renderMessages();editSource();updateBusy();
    }
    document.addEventListener('input',event=>{
        if(!authenticated())return;
        if(event.target.id==='supervisor-search'){ensureOwner();query=event.target.value;render();}
        const kind=event.target.closest('#supervisor-add-form')?'add':event.target.closest('#supervisor-edit-form')?'edit':'';
        if(kind&&event.target.closest('form').querySelector('[aria-invalid="true"]'))Object.entries(errors(kind)).forEach(([id,message])=>fieldError(id,message));
    });
    document.addEventListener('change',event=>{if(event.target.id==='supervisor-availability'&&authenticated()){availability=['all','available','near','full','review'].includes(event.target.value)?event.target.value:'all';render();}});
    document.addEventListener('click',event=>{
        if(!authenticated())return;
        if(event.target.closest('#supervisor-reset')){query='';availability='all';el('supervisor-search').value='';el('supervisor-availability').value='all';render();el('supervisor-search').focus({preventScroll:true});}
        const button=event.target.closest('[data-supervisor-edit]');if(!button||button.disabled||isBusy())return;
        const row=records().find(item=>item.key===button.dataset.supervisorEdit);if(!row||!row.name.trim()||row.duplicate)return;
        openEditDosen(row.name,row.used??'',row.max??'');
    });
    const modal=el('modal-edit-dosen');if(modal)new MutationObserver(modalChanged).observe(modal,{attributes:true,attributeFilter:['style','hidden']});
    window.IPCOSSupervisors=Object.freeze({render,reset,validateAdd:()=>validate('add'),validateEdit:()=>validate('edit'),setBusy,feedback,opened,isBusy});
    render();
})();
