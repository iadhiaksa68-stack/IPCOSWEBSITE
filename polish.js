/* Display and navigation refinements. No academic writes or extra network calls. */
(() => {
    const text=(id,en)=>uxText(id,en), el=id=>document.getElementById(id);
    const pairs={search:['Cari Nama / NIM','Search Name / Student ID'],status:['Status Pengajuan','Request Status'],type:['Jenis Layanan','Service Type']};
    let ready=false, receiptData=null;
    function setup() {
        const page=el('admin-data'), card=page.querySelector('.card'), controls=card.querySelector('.admin-table-controls');
        const advanced=document.createElement('details');advanced.id='queue-advanced';advanced.className='queue-advanced';
        advanced.innerHTML='<summary class="lang" data-id="Filter Lanjutan" data-en="Advanced Filters">Filter Lanjutan</summary><div class="advanced-filters"></div>';
        controls.after(advanced);const fields=advanced.querySelector('div');
        fields.append(el('admin-type-filter'),card.querySelector('.overdue-filter'),card.querySelector('.queue-extra-controls'),el('queue-date-error'));
        for(const [id,key] of [['admin-search-input','search'],['admin-status-filter','status'],['admin-type-filter','type']]) {
            const input=el(id),wrap=document.createElement('div'),label=document.createElement('label');
            label.htmlFor=id;label.className='lang';label.dataset.id=pairs[key][0];label.dataset.en=pairs[key][1];label.textContent=text(...pairs[key]);
            input.before(wrap);wrap.append(label,input);
        }
        const filters=document.createElement('div');filters.id='queue-filter-summary';filters.className='queue-filter-summary';filters.setAttribute('aria-live','polite');advanced.after(filters);
        const utilities=document.createElement('details');utilities.id='queue-tools';utilities.className='queue-tools';
        utilities.innerHTML='<summary class="lang" data-id="Rekap & Kesehatan Layanan" data-en="Reports & Service Health">Rekap & Kesehatan Layanan</summary><div class="queue-tools-content"></div>';
        card.append(utilities);utilities.querySelector('div').append(card.querySelector('.data-management'),el('admin-archives'),card.querySelector('.health-management'));
        const presets=document.createElement('div');presets.className='queue-presets';
        presets.innerHTML=[['review','Perlu Ditinjau','Needs Review'],['corrections','Perbaikan Masuk','Corrections Received'],['overdue','Lewat Target','Past Target']].map(([key,id,en])=>`<button type="button" class="btn-secondary lang" data-queue-preset="${key}" data-id="${id}" data-en="${en}">${text(id,en)}</button>`).join('');
        controls.before(presets);
        const receipt=document.createElement('section');receipt.id='last-request-card';receipt.className='last-request-card';receipt.hidden=true;el('pendaftaran').querySelector('h1').after(receipt);
        const picker=document.createElement('dialog');picker.id='sop-picker';picker.setAttribute('aria-labelledby','sop-picker-title');
        picker.innerHTML='<div class="picker-heading"><h2 id="sop-picker-title"></h2><button type="button" class="btn-secondary" data-picker-close></button></div><p id="sop-picker-description"></p><div class="sop-picker-options"></div>';
        document.body.append(picker);picker.addEventListener('click',event=>{if(event.target===picker||event.target.closest('[data-picker-close]'))picker.close();});
        ready=true;refresh();
    }
    function queue() {
        if(!ready||currentUser.role!=='admin')return;
        const chips=[],append=(field,label,value)=>{if(value)chips.push(`<button type="button" class="filter-chip" data-clear-filter="${field}">${escapeHtml(label)}: ${escapeHtml(value)} <span aria-hidden="true">×</span><span class="sr-only"> ${text('Hapus filter','Remove filter')}</span></button>`);};
        append('admin-search-input',text('Cari','Search'),el('admin-search-input').value.trim());
        const status=el('admin-status-filter');if(status.value!=='ALL')append(status.id,text('Status','Status'),status.selectedOptions[0]?.textContent);
        const type=el('admin-type-filter');append(type.id,text('Layanan','Service'),type.value?serviceLabel(type.value):'');
        append('admin-overdue-filter',text('Target','Target'),el('admin-overdue-filter').checked?text('Lewat Target','Past Target'):'');
        append('admin-date-from',text('Mulai','From'),el('admin-date-from').value?formatDate(el('admin-date-from').value):'');
        append('admin-date-to',text('Sampai','Until'),el('admin-date-to').value?formatDate(el('admin-date-to').value):'');
        const order=el('admin-queue-order');if(order.value!=='activity')append(order.id,text('Urutan','Order'),order.selectedOptions[0]?.textContent);
        el('queue-filter-summary').innerHTML=`<p>${adminFilteredData.length} ${text('pengajuan ditemukan',adminFilteredData.length===1?'request found':'requests found')}${el('admin-date-from').value||el('admin-date-to').value?' · '+text('Tanggal kirim (WIB)','Submission date (WIB)'):''}</p><div class="filter-chip-list">${chips.join('')}${chips.length?`<button type="button" class="text-link" data-clear-all>${text('Hapus Semua Filter','Clear All Filters')}</button>`:''}</div>`;
        document.querySelectorAll('[data-queue-preset]').forEach(button=>{
            const active=button.dataset.queuePreset==='overdue'?el('admin-overdue-filter').checked:!el('admin-overdue-filter').checked&&status.value===(button.dataset.queuePreset==='review'?'ACTION_REQUIRED':'Resubmitted');
            button.setAttribute('aria-pressed',String(active));
        });
    }
    function receipt(data) {
        if(data)receiptData={id:String(data.id||''),jenis:data.jenis,date:data.date};
        if(!ready||!receiptData||currentUser.role!=='mhs')return;
        el('pendaftaran').querySelectorAll('.operation-feedback[data-state="success"]').forEach(box=>box.hidden=true);
        const card=el('last-request-card');card.hidden=false;
        card.innerHTML=`<div><h2>${text('Pengajuan Berhasil Dikirim','Request Submitted')}</h2><p>${escapeHtml(serviceLabel(receiptData.jenis))} · ${escapeHtml(formatDateTime(receiptData.date).replace(/<[^>]*>/g,' '))}</p><p>${text('Nomor Pengajuan','Request ID')}: <strong>${escapeHtml(receiptData.id||text('Lihat di daftar pengajuan','See your request list'))}</strong></p><p>${text('Pengajuan sudah tercatat. Pantau hasil pemeriksaan di Pengajuan Saya.','Your request is recorded. Track the review in My Requests.')}</p></div><button type="button" class="btn-primary" data-last-request>${text('Lihat Pengajuan','View Request')}</button>`;
    }
    function openSopPicker() {
        if(!ready||currentUser.role!=='mhs'||!getSessionToken())return;
        refreshPicker();el('sop-picker').showModal();
    }
    function refreshPicker() {
        const picker=el('sop-picker');if(!picker)return;
        el('sop-picker-title').textContent=text('Pilih Panduan SOP','Choose an SOP Guide');
        el('sop-picker-description').textContent=text('Buka panduan sesuai kebutuhan akademik Anda.','Open the guide for your academic needs.');
        const close=picker.querySelector('[data-picker-close]');close.textContent=text('Tutup','Close');
        picker.querySelector('.sop-picker-options').innerHTML=[['sop-magang','Magang','Internship'],['sop-tugas-akhir','Tugas Akhir','Final Project'],['remidial','Remedial','Remedial']].map(([target,id,en])=>`<button type="button" class="btn-secondary" data-sop-destination="${target}">${text(id,en)} <span aria-hidden="true">→</span></button>`).join('');
    }
    function refresh() {
        if(!ready)return;
        for(const id of ['reg-jenis-utama','admin-type-filter'])el(id).querySelectorAll('option').forEach(option=>{if(serviceLabels[option.value])option.textContent=serviceLabel(option.value);});
        const bottom=document.querySelector('[data-bottom-target="sop-magang"]');bottom?.setAttribute('aria-haspopup','dialog');
        bottom?.setAttribute('aria-controls','sop-picker');queue();receipt();refreshPicker();
    }
    function clearField(id) {
        const input=el(id);if(!input)return;
        if(input.type==='checkbox')input.checked=false;else input.value=id==='admin-status-filter'?'ALL':id==='admin-queue-order'?'activity':'';
    }
    function reset() {
        receiptData=null;el('last-request-card')?.replaceChildren();if(el('last-request-card'))el('last-request-card').hidden=true;
        if(el('sop-picker')?.open)el('sop-picker').close();
        if(el('queue-advanced'))el('queue-advanced').open=false;if(el('queue-tools'))el('queue-tools').open=false;
        el('queue-filter-summary')?.replaceChildren();
    }
    document.addEventListener('click',event=>{
        const destination=event.target.closest('[data-sop-destination]');if(destination){el('sop-picker').close();if(getSessionToken()&&currentUser.role==='mhs')switchTab(null,destination.dataset.sopDestination);}
        if(event.target.closest('[data-last-request]')&&currentUser.role==='mhs'){switchTab(null,'student-status');if(receiptData?.id)openCaseDetail(receiptData.id);}
        if(currentUser.role!=='admin')return;
        const chip=event.target.closest('[data-clear-filter]'),all=event.target.closest('[data-clear-all]'),preset=event.target.closest('[data-queue-preset]');
        if(chip)clearField(chip.dataset.clearFilter);
        if(all){isAdminSortDesc=true;el('admin-sort-icon').textContent='↓';['admin-search-input','admin-status-filter','admin-type-filter','admin-overdue-filter','admin-date-from','admin-date-to','admin-queue-order'].forEach(clearField);}
        if(preset){const kind=preset.dataset.queuePreset;el('admin-status-filter').value=kind==='overdue'?'ALL':kind==='corrections'?'Resubmitted':'ACTION_REQUIRED';el('admin-overdue-filter').checked=kind==='overdue';}
        if(chip||all||preset){currentAdminPage=1;filterAdminData();}
    });
    window.IPCOSPolish={refresh,queue,receipt,reset,openSopPicker};
    setup();window.addEventListener('load',refresh);
})();
