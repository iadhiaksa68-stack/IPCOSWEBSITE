/* Page references are separate from note text and verified against the PDF bytes before opening. */
(() => {
    'use strict';
    const t=(id,en)=>uxText(id,en);
    function normalize(value){
        if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isInteger(value.page)||!Number.isInteger(value.pages)||value.page<1||value.pages<1||value.pages>100000||value.page>value.pages||typeof value.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(value.fingerprint)||!Number.isInteger(value.version)||value.version<0)return null;
        return {page:value.page,pages:value.pages,fingerprint:value.fingerprint,version:value.version};
    }
    const equal=(a,b)=>JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
    function review(value){const result={url:value.url,label:value.label,status:value.status,note:value.note};const pageRef=normalize(value.pageRef);if(pageRef)result.pageRef=pageRef;return result;}
    function fromButton(button){
        try{const raw=button?.dataset.openNotePage;if(!raw||raw.length>10000)return null;const value=JSON.parse(decodeURIComponent(raw)),pageRef=normalize(value.pageRef);return pageRef&&typeof value.id==='string'&&value.id&&typeof value.url==='string'&&isPrivateDriveUrl(value.url)?{id:value.id,url:value.url,pageRef}:null;}catch(_){return null;}
    }
    function link(item,url,value){
        const pageRef=normalize(value),record=item&&typeof item.link==='string'?item:readStoredJSON(sessionStorage,'ipcos_registrations',[]).find(row=>String(row.id)===String(item?.id));if(!record||!pageRef||!isPrivateDriveUrl(url)||!getCaseFiles(record).some(file=>file.url===url))return '';
        const data=encodeURIComponent(JSON.stringify({id:String(item.id),url,pageRef}));
        return `<button type="button" class="btn-secondary pdf-note-page-link" data-open-note-page="${escapeHtml(data)}">${t('Lihat Halaman ','View Page ')}${pageRef.page}</button>`;
    }
    async function open(value){
        if(!value||!getSessionToken()||!['admin','mhs'].includes(currentUser.role)||isPreparingCorrection||isPreparingReviewDecision||activeUpdateIds.size)return false;
        const item=readStoredJSON(sessionStorage,'ipcos_registrations',[]).find(row=>String(row.id)===value.id);
        if(!item||(currentUser.role==='mhs'&&!isStudentOwner(item)))return false;
        const index=getCaseFiles(item).findIndex(file=>file.url===value.url);if(index<0||!normalize(value.pageRef))return false;
        const modal=document.getElementById('modal-case-detail');
        if(selectedCaseId!==value.id||modal.style.display!=='flex'){if(!openCaseDetail(value.id))return false;}
        modal.dataset.workspaceView='documents';modal.querySelector('#workspace-view-toggle button[data-workspace-view="documents"]')?.click();
        await previewCaseFile(index,null,value.pageRef);return true;
    }
    document.addEventListener('click',event=>{
        const button=event.target.closest('[data-open-note-page]');if(!button||event.defaultPrevented)return;
        const value=fromButton(button);if(value)open(value).catch(()=>showToast(t('Halaman catatan belum dapat dibuka. Coba lagi.','The note page could not be opened. Try again.'),'error'));
    });
    window.IPCOSPageNotes=Object.freeze({normalize,equal,review,link,fromButton,open});
})();
