// Lazy, admin-only CSV generation. Exports the complete result, not just one page.
window.IPCOSAdminExport={download() {
    if(currentUser.role!=='admin'||!getSessionToken())return;
    const filtered=document.getElementById('admin-export-scope').value!=='all';
    if(filtered)filterAdminData();
    const records=filtered?adminFilteredData:readStoredJSON(sessionStorage,'ipcos_registrations',[]);
    if(!records.length){showToast(uxText('Tidak ada pengajuan dalam pilihan ini.','There are no requests in this selection.'),'error');return;}
    const cell=value=>{let valueText=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(valueText))valueText="'"+valueText;return '"'+valueText.replaceAll('"','""')+'"';};
    const headings=currentLang==='id'?['ID','Tanggal Dikirim','NIM','Nama','Jenis','Status','Menunggu (Hari)','Target Internal (Hari)','Lewat Target (Hari)','Aktivitas Terakhir']:['ID','Submitted At','Student ID','Name','Service','Status','Waiting (Days)','Internal Target (Days)','Overdue (Days)','Latest Activity'];
    const rows=[headings,...records.map(record=>{const wait=caseWaiting(record);return [record.id,record.date,record.nim,record.nama,systemText(record.jenis),systemText(record.status),wait?.days??'',wait?.target??'',wait?Math.max(0,wait.days-wait.target):'',getCaseEventTime(record)];})];
    const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download='Rekap_IPCOS_'+(filtered?'Filter_':'Semua_')+new Date().toISOString().slice(0,10)+'.csv';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    showToast(uxText('Rekap berhasil diunduh: ','Report downloaded: ')+records.length+uxText(' pengajuan.',' requests.'),'success');
}};
