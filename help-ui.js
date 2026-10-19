/* Help stays in this session. WhatsApp receives only the message the user reviews. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    const topics=[
        {id:'upload',title:['Unggah berkas','File uploads'],copy:['Format, ukuran, atau pratinjau berkas.','File format, size, or preview.'],hint:['Periksa format dan batas ukuran di dekat pemilih berkas. Gunakan pratinjau untuk memeriksa berkas sebelum mengirim.','Check the format and size limits beside the file picker. Preview the file before submitting.'],terms:['unggah','upload','berkas','file','dokumen','document','pdf'],tabs:['pendaftaran','templates-faq']},
        {id:'revision',title:['Revisi pengajuan','Request corrections'],copy:['Catatan admin dan pengiriman perbaikan.','Admin notes and resubmitting corrections.'],hint:['Buka pengajuan yang perlu perbaikan. Ikuti catatan admin, lalu periksa ringkasan sebelum mengonfirmasi kirim.','Open the request that needs corrections. Follow the admin notes, then review the summary before confirming submission.'],terms:['revisi','revision','perbaikan','correction','resubmit'],tabs:['student-status','sop-tugas-akhir']},
        {id:'status',title:['Status pengajuan','Request status'],copy:['Progres pemeriksaan dan hasil pengajuan.','Review progress and request results.'],hint:['Lihat pembaruan di Status Pengajuanku. Berkas disetujui dan tahap akademik resmi memiliki informasi masing-masing.','Check updates in My Requests. Document approval and the official academic stage have separate information.'],terms:['status','proses','progress','hasil','result','pengajuan','request'],tabs:['student-status','academic-journey']},
        {id:'requirements',title:['Syarat & panduan','Requirements & guides'],copy:['SOP, persiapan, dan template dokumen.','SOPs, preparation, and document templates.'],hint:['Gunakan ketentuan yang diterbitkan admin pada SOP dan halaman persiapan sesuai kebutuhan Anda.','Use the admin-published requirements in the relevant SOP and preparation pages.'],terms:['syarat','requirement','sop','panduan','guide','template','persiapan','prepare'],tabs:['sop-magang','sop-tugas-akhir','templates-faq']},
        {id:'access',title:['Akses & kendala lain','Access & other issues'],copy:['Masuk akun atau kendala penggunaan portal.','Account sign-in or other portal issues.'],hint:['Jelaskan langkah yang Anda lakukan dan pesan yang tampil agar tim IPCOS dapat memahami kendalanya.','Describe the steps you took and the message shown so the IPCOS team can understand the issue.'],terms:['akses','access','login','masuk','akun','account','error','gagal','failed'],tabs:['templates-faq']}
    ];
    const labels={pendaftaran:['Buka Pusat Pendaftaran','Open Request Submission'],'student-status':['Buka Status Pengajuanku','Open My Requests'],'academic-journey':['Buka Perjalanan Akademik','Open Academic Journey'],'admin-data':['Buka Antrean Pengajuan','Open Request Queue'],'sop-magang':['Baca SOP Magang','Read Internship SOP'],'sop-tugas-akhir':['Baca SOP Tugas Akhir','Read Final Project SOP'],'templates-faq':['Telusuri Template & FAQ','Browse Templates & FAQ']};
    const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
    const authenticated=()=>!!getSessionToken()&&['mhs','admin'].includes(currentUser.role);
    const ownerKey=()=>authenticated()?`${sessionEpoch}:${currentUser.role}:${String(currentUser.nim??'').trim()}`:'';
    const visible=node=>node?.getClientRects().length&&!node.closest('[hidden],[inert]');
    const text=(id,value)=>{const node=el(id);if(node&&node.textContent!==value)node.textContent=value;};
    let owner='',topic='upload',query='',request='',description='',review=null,guide=null,navigation=0,optionsHtml='',faqHtml='',actionsHtml='',validation=false,contextNotice='';
    const faqOpen=new Set();
    function clearGuide(){guide=null;navigation++;document.querySelectorAll('[data-help-guide-back]').forEach(node=>node.remove());}
    function setup(){
        const root=el('help-topics');if(!root||root.childElementCount)return;
        root.innerHTML=topics.map(item=>`<button type="button" data-help-topic="${item.id}" aria-pressed="false"><strong></strong><span></span></button>`).join('');
    }
    function reset(){
        owner='';topic='upload';query='';request='';description='';review=null;guide=null;navigation++;optionsHtml='';faqHtml='';actionsHtml='';validation=false;contextNotice='';faqOpen.clear();
        for(const id of ['help-search','help-description','help-message'])if(el(id))el(id).value='';
        el('help-request')?.replaceChildren();el('help-faq-list')?.replaceChildren();el('help-actions')?.replaceChildren();
        if(el('help-message-review'))el('help-message-review').hidden=true;
        if(el('help-compose'))el('help-compose').hidden=false;
        el('help-whatsapp')?.removeAttribute('href');text('help-description-error','');text('help-context-notice','');
        document.querySelectorAll('[data-help-guide-back]').forEach(node=>node.remove());
    }
    function prepare(){const key=ownerKey();if(key!==owner){reset();owner=key;}return !!key;}
    function records(){
        if(currentUser.role!=='mhs')return [];
        const source=readStoredJSON(sessionStorage,'ipcos_registrations',[]);if(!Array.isArray(source))return [];
        const counts=new Map();source.forEach(row=>{if(row&&String(row.id??'').trim())counts.set(String(row.id),(counts.get(String(row.id))||0)+1);});
        return source.filter(row=>row&&String(row.id??'').trim()&&counts.get(String(row.id))===1&&isStudentOwner(row));
    }
    const record=()=>records().find(row=>String(row.id)===request)||null;
    const signature=row=>row?JSON.stringify([String(row.id),String(row.nim??'').trim(),String(row.jenis??''),String(row.status??'')]):'';
    const status=value=>({pending:t('Menunggu pemeriksaan','Awaiting review'),revision:t('Perlu perbaikan','Needs corrections'),resubmitted:t('Perbaikan terkirim','Corrections submitted'),accepted:t('Berkas disetujui','Documents approved')})[String(value).trim().toLowerCase()]||String(value??'');
    function invalidate(){review=null;el('help-whatsapp')?.removeAttribute('href');if(el('help-message-review'))el('help-message-review').hidden=true;if(el('help-compose'))el('help-compose').hidden=false;if(el('help-message'))el('help-message').value='';}
    function message(){
        const row=record(),item=topics.find(item=>item.id===topic);
        return [t('Halo Mincos, saya membutuhkan bantuan terkait IPCOS.','Hello Mincos, I need help with IPCOS.'),t('Kendala: ','Issue: ')+t(...item.title),...(row?[t('Nomor pengajuan: ','Request ID: ')+String(row.id),t('Layanan: ','Service: ')+systemText(String(row.jenis??'')),t('Status: ','Status: ')+status(row.status)]:[]),'',description.trim()].join('\n');
    }
    function issue(){const length=description.trim().length;return length<10?t('Jelaskan kendala dalam minimal 10 karakter.','Describe the issue in at least 10 characters.'):length>1200?t('Ringkas penjelasan menjadi maksimal 1.200 karakter.','Keep the description within 1,200 characters.'):/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(description)?t('Hapus karakter yang tidak terbaca dari penjelasan.','Remove unreadable characters from the description.'):'';}
    function renderGuide(){
        if(!guide)return;
        if(guide.owner!==ownerKey()){guide=null;document.querySelectorAll('[data-help-guide-back]').forEach(node=>node.remove());return;}
        let back=el(guide.tab)?.querySelector('[data-help-guide-back]');
        if(!back){back=document.createElement('div');back.className='help-guide-back';back.dataset.helpGuideBack='';back.setAttribute('data-preserve-case','');back.innerHTML='<button type="button" class="btn-secondary" data-help-return></button>';el(guide.tab)?.prepend(back);}
        if(back)back.querySelector('button').textContent=t('Kembali ke Pusat Bantuan','Back to Help Center');
    }
    function render(){
        setup();if(!el('help-topics')||!prepare())return;
        const item=topics.find(item=>item.id===topic),admin=currentUser.role==='admin';
        const copies={title:t('Pusat Bantuan','Help Center'),intro:t('Temukan panduan untuk kendala Anda, lalu hubungi Mincos bila masih membutuhkan bantuan.','Find guidance for your issue, then contact Mincos if you still need help.'),'topic-title':t('1. Pilih kendala','1. Choose an issue'),'guidance-title':t(...item.title),'guidance-copy':admin&&['revision','status'].includes(topic)?t('Gunakan antrean untuk membuka pengajuan dan memeriksa pembaruan pada data yang boleh Anda akses.','Use the queue to open requests and review updates you are authorized to access.'):t(...item.hint),'faq-title':t('Panduan & jawaban terkait','Related guides & answers'),'search-label':t('Cari jawaban terbit','Search published answers'),'search-reset':t('Hapus pencarian','Clear search'),'contact-title':t('2. Masih perlu bantuan?','2. Still need help?'),'contact-intro':t('Siapkan pesan untuk Mincos. Anda dapat memeriksa isinya sebelum membuka WhatsApp.','Prepare a message for Mincos. Review it before opening WhatsApp.'),'request-label':t('Sertakan pengajuan (opsional)','Include a request (optional)'),'request-hint':t('Hanya nomor, layanan, dan status pengajuan yang dipilih akan ditambahkan.','Only the selected request’s ID, service, and status will be added.'),'description-label':t('Jelaskan kendala','Describe the issue'),'description-hint':t('Tulis langkah yang dicoba dan pesan yang tampil. Jangan sertakan kata sandi atau kode OTP.','Describe the steps you tried and the message shown. Do not include passwords or OTP codes.'),'review-button':t('Periksa Pesan','Review Message'),'review-title':t('Periksa pesan Anda','Review your message'),'message-label':t('Isi pesan untuk Mincos','Message for Mincos'),'review-hint':t('Pesan belum dikirim. Pilih Buka WhatsApp, lalu kirim melalui WhatsApp setelah Anda siap.','The message has not been sent. Choose Open WhatsApp, then send it in WhatsApp when you are ready.'),'edit-message':t('Kembali Mengubah','Back to Editing'),whatsapp:t('Buka WhatsApp','Open WhatsApp'),'resume-request':t('Kembali ke Pengajuan','Back to Request')};
        for(const[id,value]of Object.entries(copies))text('help-'+id,value);
        el('help-topics').setAttribute('aria-labelledby','help-topic-title');
        for(const button of el('help-topics').children){const entry=topics.find(row=>row.id===button.dataset.helpTopic);button.setAttribute('aria-pressed',String(entry.id===topic));button.querySelector('strong').textContent=t(...entry.title);button.querySelector('span').textContent=t(...entry.copy);}
        const tabs=[...new Set(item.tabs.map(tab=>admin&&['pendaftaran','student-status'].includes(tab)?'admin-data':tab))];
        const nextActions=tabs.map(tab=>`<button type="button" class="btn-secondary" data-help-tab="${tab}">${t(...labels[tab])}</button>`).join('');if(actionsHtml!==nextActions){actionsHtml=nextActions;el('help-actions').innerHTML=nextActions;}
        const values=records(),nextOptions=`<option value="">${t('Tanpa pengajuan','Without a request')}</option>`+values.map(row=>`<option value="${escapeHtml(String(row.id))}">${escapeHtml(String(row.id)+' · '+systemText(String(row.jenis??'')))}</option>`).join('');
        if(request&&!values.some(row=>String(row.id)===request)){request='';invalidate();contextNotice='removed';}
        if(optionsHtml!==nextOptions){optionsHtml=nextOptions;el('help-request').innerHTML=nextOptions;}el('help-request').value=request;el('help-request-field').hidden=admin;
        if(review&&review.signature!==signature(record())){invalidate();contextNotice='changed';}
        text('help-context-notice',contextNotice==='removed'?t('Pengajuan yang dipilih sudah tidak tersedia. Penjelasan tetap ada; pilih konteks yang sesuai dan periksa pesan lagi.','The selected request is no longer available. Your description is retained; choose the right context and review the message again.'):contextNotice==='changed'?t('Data pengajuan diperbarui. Penjelasan tetap ada; periksa pesan lagi agar status yang disertakan sesuai.','The request was updated. Your description is retained; review the message again to include the current status.'):'');el('help-context-notice').hidden=!contextNotice;
        el('help-search').placeholder=t('Contoh: transkrip, revisi, masuk akun…','Example: transcript, corrections, sign-in…');el('help-search-reset').hidden=!query;
        const entries=(window.IPCOSResources?.entries?.()||[]).filter(entry=>entry.type==='faq');
        const words=normalize(query).split(' ').filter(Boolean),matches=entries.filter(entry=>{const haystack=normalize([entry.text,entry.sub,entry.group,entry.raw?.text,entry.raw?.textEn,entry.raw?.sub,entry.raw?.subEn].join(' '));return words.length?words.every(word=>haystack.includes(word)):item.terms.some(term=>haystack.includes(term));});
        const shown=matches.slice(0,4),nextFaq=shown.map(entry=>`<details data-help-faq="${escapeHtml(entry.key)}" ${faqOpen.has(entry.key)?'open':''}><summary><span>${escapeHtml(entry.text||t('Pertanyaan tanpa judul','Untitled question'))}</span></summary><div><p>${escapeHtml(entry.sub||t('Jawaban belum tersedia.','An answer is not available yet.'))}</p><button type="button" class="btn-secondary" data-help-resource="${escapeHtml(entry.key)}">${t('Buka di Template & FAQ','Open in Templates & FAQ')}</button></div></details>`).join('');
        if(faqHtml!==nextFaq){const active=document.activeElement,key=active?.closest('[data-help-faq]')?.dataset.helpFaq,isButton=active?.matches('button');faqHtml=nextFaq;el('help-faq-list').innerHTML=nextFaq;if(key){const row=[...el('help-faq-list').children].find(node=>node.dataset.helpFaq===key);(row?.querySelector(isButton?'button':'summary')||el('help-search')).focus({preventScroll:true});}}
        const note=!entries.length?t('Belum ada FAQ diterbitkan. Anda tetap dapat membuka panduan atau menyiapkan pesan untuk Mincos.','No FAQs have been published yet. You can still open a guide or prepare a message for Mincos.'):!matches.length?t('Belum ada jawaban yang cocok. Coba kata lain, buka panduan, atau siapkan pesan untuk Mincos.','No matching answers yet. Try another word, open a guide, or prepare a message for Mincos.'):t(`${shown.length} dari ${matches.length} jawaban terkait ditampilkan.`,`${shown.length} of ${matches.length} related answers shown.`);
        text('help-faq-count',note);el('help-more-faq').hidden=matches.length<=4;text('help-more-faq',t('Telusuri Semua FAQ','Browse All FAQs'));
        if(el('help-search').value!==query)el('help-search').value=query;
        if(el('help-description').value!==description)el('help-description').value=description;
        text('help-description-count',t(`${description.length}/1.200 karakter`,`${description.length}/1,200 characters`));
        const error=validation?issue():'';text('help-description-error',error);el('help-description').setAttribute('aria-invalid',String(!!error));
        el('help-compose').hidden=!!review;el('help-message-review').hidden=!review;
        if(review){const value=message();el('help-message').value=value;el('help-message').rows=Math.min(16,Math.max(9,value.split('\n').length+2));el('help-whatsapp').href='https://wa.me/6285172228960?text='+encodeURIComponent(value);}
        el('help-resume-request').hidden=admin||!(registrationDirty||!el('registration-review').hidden||[...document.querySelectorAll('#registration-fields input[type=file]')].some(input=>input.files.length));renderGuide();
    }
    function focusAfter(tab,node,run=navigation){const key=ownerKey();const focus=()=>{if(key!==ownerKey()||run!==navigation||!el(tab)?.classList.contains('active')||!visible(node))return;if(!node.matches('button,input,select,textarea,a[href],summary,[tabindex]'))node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView({block:'center',behavior:'instant'});};requestAnimationFrame(()=>requestAnimationFrame(focus));}
    function navigate(tab){
        if(!prepare()||!canAccessTab(tab))return false;
        const overlays=[...document.querySelectorAll('.overlay,dialog[open]')].filter(visible);if(overlays.some(node=>!['modal-case-detail','modal-sop-editor'].includes(node.id)))return false;
        const caseOpen=visible(el('modal-case-detail'));if(caseOpen&&!confirmLeaveCase())return false;
        if(visible(el('modal-sop-editor'))&&window.IPCOSSop?.cancel?.()===false)return false;
        if(!switchTab(null,tab))return false;if(caseOpen)closeModal('modal-case-detail',true);return true;
    }
    async function openGuide(tab,key,origin){
        if(!labels[tab]||!navigate(tab))return;
        document.querySelectorAll('[data-help-guide-back]').forEach(node=>node.remove());window.IPCOSNext?.clearGuide?.();window.IPCOSPreparation?.clearGuide?.();
        guide=tab==='pendaftaran'?null:{tab,owner:ownerKey(),origin};const run=++navigation;renderGuide();let target;
        if(tab==='templates-faq'){window.IPCOSResources?.clearContext?.();target=key?window.IPCOSResources?.reveal?.('faq',key):el('resource-search');}
        else if(tab.startsWith('sop-')){const type=tab==='sop-magang'?'sop_magang':'sop_tugas_akhir';try{await window.IPCOSSop?.open?.(type);}catch(_){/* The SOP reader presents its own retry action. */}if(run!==navigation||guide?.owner!==ownerKey())return;target=window.IPCOSSop?.reveal?.(type,'')||el(type+'-view')?.querySelector('h1,[role=status]');}
        else if(tab==='pendaftaran')target=!el('registration-review').hidden?el('review-heading'):el('reg-jenis-utama');
        else target=el(tab)?.querySelector('h1,h2');
        focusAfter(tab,target||el(tab)?.querySelector('h1,h2'),run);
    }
    document.addEventListener('input',event=>{if(!authenticated())return;if(event.target.id==='help-search'){query=event.target.value;render();}if(event.target.id==='help-description'){description=event.target.value;invalidate();render();}});
    document.addEventListener('change',event=>{if(event.target.id==='help-request'&&authenticated()){request=event.target.value;invalidate();render();}});
    document.addEventListener('toggle',event=>{if(event.target.matches?.('#help-faq-list details')){const key=event.target.dataset.helpFaq;if(event.target.open)faqOpen.add(key);else faqOpen.delete(key);}},true);
    document.addEventListener('click',event=>{
        const node=event.target.closest('[data-help-topic],[data-help-tab],[data-help-resource],[data-help-return],#help-review-button,#help-edit-message,#help-search-reset,#help-resume-request,#help-whatsapp');if(!node||!prepare())return;
        if(node.dataset.helpTopic){topic=node.dataset.helpTopic;invalidate();render();return;}
        if(node.id==='help-search-reset'){query='';render();el('help-search').focus();return;}
        if(node.id==='help-review-button'){validation=true;render();if(issue()){el('help-description').focus();return;}contextNotice='';review={signature:signature(record())};render();focusAfter('feedback',el('help-review-title'));return;}
        if(node.id==='help-edit-message'){invalidate();render();focusAfter('feedback',el('help-description'));return;}
        if(node.id==='help-whatsapp'){if(!review||review.signature!==signature(record())||issue()){event.preventDefault();invalidate();render();}return;}
        if(node.id==='help-resume-request'){void openGuide('pendaftaran','',node.id);return;}
        if(node.hasAttribute('data-help-return')){const origin=guide?.origin;if(!guide||guide.owner!==ownerKey()||!navigate('feedback'))return;navigation++;guide=null;document.querySelectorAll('[data-help-guide-back]').forEach(node=>node.remove());render();focusAfter('feedback',el(origin)||el('help-title'));return;}
        if(node.dataset.helpResource){const key=node.dataset.helpResource;if(!(window.IPCOSResources?.entries?.()||[]).some(entry=>entry.type==='faq'&&entry.key===key)){render();return;}void openGuide('templates-faq',key,'help-search');return;}
        if(node.dataset.helpTab)void openGuide(node.dataset.helpTab,'','help-guidance-title');
    });
    window.IPCOSHelp=Object.freeze({render,reset,clearGuide});setup();
})();
