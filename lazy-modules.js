// First paint does not download the SOP editor or admin reporting tools.
(() => {
    const pending=new Map();let sopContents=[],generation=0;
    function load(file) {
        if(pending.has(file))return pending.get(file);
        const promise=new Promise((resolve,reject)=>{
            const script=document.createElement('script');script.src=file;script.async=true;
            const timeout=setTimeout(fail,15000);
            function fail(){clearTimeout(timeout);script.remove();pending.delete(file);window.IPCOSNext?.report('module','module');reject(Error(uxText('Fitur belum dapat dimuat. Coba lagi.','The feature could not load. Please retry.')));}
            script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=fail;document.head.append(script);
        });pending.set(file,promise);return promise;
    }
    const placeholder={
        async open(type,reload=false) {
            const epoch=sessionEpoch,run=generation,view=document.getElementById(type+'-view');
            if(view)view.textContent=uxText('Memuat SOP…','Loading SOP…');
            try {await load('sop.js');if(epoch!==sessionEpoch||run!==generation||!getSessionToken()){window.IPCOSSop.reset();return;}window.IPCOSSop.receive(sopContents);sopContents=[];return window.IPCOSSop.open(type,reload);}
            catch(error){if(epoch===sessionEpoch&&run===generation&&view)view.innerHTML=`<p role="status">${escapeHtml(error.message)}</p><button type="button" class="btn-secondary" data-load-sop="${type}">${uxText('Coba Lagi','Retry')}</button>`;}
        },
        receive(contents){sopContents=contents.filter(item=>['sop_magang','sop_tugas_akhir'].includes(item.Tipe));},
        reset(){generation++;sopContents=[];['sop_magang','sop_tugas_akhir'].forEach(type=>{document.getElementById(type+'-view').textContent='';});},
        languageChanged(){},beforeNavigate(){return true;}
    };
    window.IPCOSSop=placeholder;
    window.exportAdminDataCSV=async()=>{
        if(currentUser.role!=='admin')return;const epoch=sessionEpoch;
        try {await load('admin-export.js');if(epoch===sessionEpoch&&currentUser.role==='admin')return window.IPCOSAdminExport.download();}
        catch(error){if(epoch===sessionEpoch)showToast(error.message,'error');}
    };
    window.downloadServiceICS=(type,date,days)=>{
        if(!SERVICE_TYPES.includes(type)||![1,3].includes(days)||!academicCalendarDate(date)){showToast(uxText('Pengingat belum tersedia untuk layanan ini.','A reminder is unavailable for this service.'),'error');return;}
        downloadICS(type,date,{service:true,alarmDays:days});
    };
    document.addEventListener('click',event=>{const button=event.target.closest('[data-load-sop]');if(button)window.IPCOSSop.open(button.dataset.loadSop);});
})();
