/* An agenda of published portal dates; no dates or registration windows are inferred. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
    const hash=value=>{let result=2166136261;for(const c of String(value)){result^=c.codePointAt(0);result=Math.imul(result,16777619);}return(result>>>0).toString(36);};
    const authenticated=()=>!!getSessionToken()&&['mhs','admin'].includes(currentUser.role);
    const ownerKey=()=>authenticated()?`${sessionEpoch}:${currentUser.role}:${String(currentUser.nim??'').trim()}`:'';
    let owner='',query='',period='all',pastOpen=false,alarmDays=1,filterToken='',lastDay='';
    const signatures=new Map();
    const setText=(id,value)=>{if(el(id)&&el(id).textContent!==value)el(id).textContent=value;};
    const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    function reset(){
        owner='';query='';period='all';pastOpen=false;alarmDays=1;filterToken='';lastDay='';signatures.clear();
        if(!el('calendar-search'))return;
        el('calendar-search').value='';el('calendar-period').replaceChildren();el('calendar-alarm-days').value='1';
        for(const id of ['calendar-nearest','calendar-current-list','calendar-past-list','calendar-period','calendar-result-count','calendar-empty','calendar-past-title'])el(id)?.replaceChildren();
        el('calendar-past').open=false;el('calendar-past').hidden=true;el('calendar-empty').hidden=true;el('calendar-reset').hidden=true;
    }
    function prepare(){const next=ownerKey();if(owner!==next){reset();owner=next;}return !!next;}
    function entries(){
        if(!authenticated())return[];
        const source=getChecklistData('kalender'),groups=(Array.isArray(source)?source:[]).filter(group=>group&&Array.isArray(group.items)),counts=new Map(),used=new Set(),result=[],currentDay=today();
        for(const group of groups)for(const item of group.items)if(item&&typeof item==='object'){const id=String(item.id??'').trim();if(id)counts.set(id,(counts.get(id)||0)+1);}
        groups.forEach(group=>group.items.forEach(item=>{
            if(!item||typeof item!=='object')return;
            const rawId=String(item.id??'').trim(),signature=JSON.stringify([group.title,item.text,item.sub,item.textEn,item.subEn]);
            const base=rawId&&counts.get(rawId)===1?'calendar-id-'+hash(rawId):'calendar-entry-'+hash(signature);
            let key=base;for(let n=2;used.has(key);n++)key=base+'-'+n;used.add(key);
            const day=academicCalendarDate(item.text),date=day?day.toISOString().slice(0,10):'',state=!day?'unknown':date<currentDay?'past':'upcoming';
            const title=contentText(group.title,group.titleEn)||t('Periode tanpa nama','Unnamed period'),text=contentText(item.text,item.textEn),sub=contentText(item.sub,item.subEn);
            const search=normalize([group.title,group.titleEn,title,item.text,item.textEn,text,item.sub,item.subEn,sub,...(day?['id-ID','en-GB'].map(locale=>new Intl.DateTimeFormat(locale,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(day)):[]),...[group.title,item.text,item.sub].map(value=>typeof contentEnglish==='object'?contentEnglish[String(value??'')]||'':'')].join(' '));
            result.push({key,title,text,sub,date,day,state,raw:item,rawItem:item,rawGroup:group,period:'period-'+hash(String(group.title??'')+'|'+String(group.titleEn??'')),search});
        }));
        return result.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.key.localeCompare(b.key));
    }
    function replace(id,html){
        const root=el(id);if(signatures.get(id)===html&&root.innerHTML)return;
        const focused=document.activeElement,entry=focused?.closest('[data-calendar-entry],[data-calendar-nearest]'),action=focused?.dataset.calendarExport;
        const origin=entry&&root.contains(entry)?{key:entry.dataset.calendarEntry||entry.dataset.calendarNearest,export:action!==undefined}:null;
        signatures.set(id,html);root.innerHTML=html;
        if(origin){const row=[...root.querySelectorAll('[data-calendar-entry],[data-calendar-nearest]')].find(node=>(node.dataset.calendarEntry||node.dataset.calendarNearest)===origin.key);const target=origin.export?row?.querySelector('[data-calendar-export]'):row?.querySelector('h3');if(target&&!target.disabled)target.focus({preventScroll:true});else el('calendar-search').focus({preventScroll:true});}
    }
    function card(entry,nearest=false){
        const valid=!!entry.day,status=entry.state==='unknown'?t('Tanggal Belum Tersedia','Date Unavailable'):entry.state==='past'?t('Periode Lewat','Past Period'):entry.date===today()?t('Batas Hari Ini','Due Today'):t('Mendatang','Upcoming');
        return `<article class="agenda-card ${nearest?'agenda-nearest-card':''}" ${nearest?'data-calendar-nearest="'+entry.key+'"':'data-calendar-entry="'+entry.key+'"'} data-preserve-case><header><span class="agenda-status agenda-status-${entry.state}">${status}</span><h3 tabindex="-1">${escapeHtml(entry.title)}</h3></header><dl><div><dt>${t('Batas Pendaftaran Yudisium','Graduation Clearance Deadline')}</dt><dd class="agenda-deadline">${escapeHtml(valid?formatDate(entry.day):entry.text||t('Belum diisi','Not provided'))}</dd></div><div><dt>${t('Pendaftaran Wisuda','Graduation Registration')}</dt><dd>${escapeHtml(entry.sub||t('Belum dicantumkan','Not provided'))}</dd></div></dl>${!valid?`<p class="agenda-date-note">${t('Tanggal belum dapat dibaca. Hubungi admin untuk konfirmasi jadwal.','The date could not be read. Contact an admin to confirm the schedule.')}</p>`:''}<button type="button" class="${nearest?'btn-primary':'btn-secondary'}" data-calendar-export="${entry.key}" ${valid?'':'disabled'}>${t('Simpan ke Kalender','Save to Calendar')}</button></article>`;
    }
    function labels(){
        for(const[id,idText,enText]of[
            ['calendar-title','Kalender & Agenda Akademik','Academic Calendar & Agenda'],['calendar-intro','Lihat batas yudisium dan periode pendaftaran wisuda yang tersedia di IPCOS.','View graduation clearance deadlines and graduation registration periods available in IPCOS.'],
            ['calendar-nearest-title','Tenggat Terdekat','Next Deadline'],['calendar-nearest-help','Jadwal terdekat dari seluruh periode yang tersedia.','The next deadline across all available periods.'],['calendar-search-label','Cari Jadwal','Search Schedules'],['calendar-period-label','Periode','Period'],['calendar-reset','Reset Filter','Reset Filters'],['calendar-alarm-label','Pengingat Kalender','Calendar Reminder'],['calendar-edit','Edit Kalender','Edit Calendar']
        ])setText(id,t(idText,enText));
        el('calendar-search').placeholder=t('Cari periode atau tanggal…','Search a period or date…');
        const options={'0':t('Simpan tanpa pengingat','Save without a reminder'),'1':t('1 hari sebelumnya','1 day before'),'3':t('3 hari sebelumnya','3 days before'),'7':t('7 hari sebelumnya','7 days before')};
        for(const option of el('calendar-alarm-days').options)if(option.textContent!==options[option.value])option.textContent=options[option.value];
        setText('calendar-alarm-help',alarmDays?t('Berkas .ics menyertakan pengingat pukul 09.00 WIB pada hari yang dipilih, jika waktunya belum lewat. Impor ke aplikasi kalender; notifikasi mengikuti pengaturan aplikasi Anda.','The .ics file includes a reminder at 09:00 WIB on the selected day, if it is still upcoming. Import it into your calendar app; notifications follow the app’s settings.'):t('Berkas .ics menyimpan tanggal tanpa alarm. Impor berkas ke aplikasi kalender Anda.','The .ics file saves the date without an alarm. Import it into your calendar app.'));
    }
    function render(){
        if(!el('calendar-search')||!prepare())return;
        labels();lastDay=today();const all=entries(),groups=[...new Map(all.map(entry=>[entry.period,entry.title])).entries()];
        if(period!=='all'&&!groups.some(([key])=>key===period))period='all';
        const options=`<option value="all">${t('Semua Periode','All Periods')}</option>`+groups.map(([key,title])=>`<option value="${key}">${escapeHtml(title)}</option>`).join('');
        if(signatures.get('calendar-options')!==options){signatures.set('calendar-options',options);el('calendar-period').innerHTML=options;}el('calendar-period').value=period;
        const nearest=all.find(entry=>entry.state==='upcoming');
        replace('calendar-nearest',nearest?card(nearest,true):`<div class="agenda-no-upcoming"><h3>${t('Belum ada tenggat mendatang','No Upcoming Deadline')}</h3><p>${t('Admin belum mencantumkan jadwal berikutnya. Periode yang tersedia tetap dapat dilihat di bawah.','The next schedule has not been provided yet. Available periods remain listed below.')}</p></div>`);
        const terms=normalize(query).split(' ').filter(Boolean),selected=all.filter(entry=>(period==='all'||entry.period===period)&&terms.every(term=>entry.search.includes(term))),past=selected.filter(entry=>entry.state==='past'),current=selected.filter(entry=>entry.state!=='past');
        setText('calendar-result-count',t(`${selected.length} dari ${all.length} jadwal ditampilkan`,`${selected.length} of ${all.length} schedules shown`));el('calendar-reset').hidden=!query&&period==='all';
        replace('calendar-current-list',current.map(entry=>card(entry)).join(''));replace('calendar-past-list',past.map(entry=>card(entry)).join(''));
        const nextFilter=JSON.stringify([query,period]);if(nextFilter!==filterToken&&(query||period!=='all')&&past.length)pastOpen=true;filterToken=nextFilter;
        el('calendar-past').hidden=!past.length;setText('calendar-past-title',t(`Periode Lewat (${past.length})`,`Past Periods (${past.length})`));el('calendar-past').open=pastOpen;
        el('calendar-empty').hidden=!!selected.length;
        replace('calendar-empty',`<h2>${all.length?t('Jadwal tidak ditemukan','No Matching Schedule'):t('Belum ada jadwal','No Schedule Yet')}</h2><p>${all.length?t('Coba kata kunci atau periode lain.','Try another keyword or period.'):t('Jadwal yang ditambahkan admin akan tampil di sini.','Schedules added by admin will appear here.')}</p>`);
    }
    function remind(key){if(!prepare())return;const entry=entries().find(item=>item.key===key);if(!entry?.day)return;downloadICS(entry.title,entry.raw.text,{alarmDays,uid:entry.key});}
    function reveal(key){
        if(!prepare())return null;const entry=entries().find(item=>item.key===key);if(!entry)return null;
        query='';period='all';el('calendar-search').value='';if(entry.state==='past')pastOpen=true;render();
        return [...el('kalender-content-container').querySelectorAll('[data-calendar-entry]')].find(node=>node.dataset.calendarEntry===key)?.querySelector('h3')||null;
    }
    document.addEventListener('input',event=>{if(event.target.id==='calendar-search'&&prepare()){query=event.target.value;render();}});
    document.addEventListener('change',event=>{if(!prepare())return;if(event.target.id==='calendar-period'){period=event.target.value;render();}if(event.target.id==='calendar-alarm-days'){alarmDays=[0,1,3,7].includes(Number(event.target.value))?Number(event.target.value):1;render();}});
    document.addEventListener('click',event=>{if(!authenticated())return;if(event.target.closest('#calendar-past>summary'))pastOpen=!el('calendar-past').open;const exportButton=event.target.closest('[data-calendar-export]');if(exportButton&&!exportButton.disabled)remind(exportButton.dataset.calendarExport);if(event.target.closest('#calendar-reset')){query='';period='all';pastOpen=false;el('calendar-search').value='';render();el('calendar-search').focus({preventScroll:true});}});
    el('calendar-past')?.addEventListener('toggle',()=>{pastOpen=el('calendar-past').open;});
    const tick=()=>{if(authenticated()&&lastDay!==today())render();};
    window.IPCOSCalendar=Object.freeze({render,reset,entries,reveal,remind,tick});
    render();
})();
