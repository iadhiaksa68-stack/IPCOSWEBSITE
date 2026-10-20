/* Session-only layout preferences; resizing never changes a request or replaces its editors. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en),key='ipcos_admin_workspace';
    const defaults=()=>({reviewWidth:38,filesCollapsed:false});
    let preference=defaults(),epoch=-1,observer=null,workspace=null,drag=null,activeId='',listScroll=0;
    const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
    const modal=()=>el('modal-case-detail');
    const allowed=()=>currentUser.role==='admin'&&getSessionToken()&&modal()?.style.display==='flex';
    const busy=()=>isPreparingCorrection||isPreparingReviewDecision||activeUpdateIds.has(selectedCaseId);
    const desktop=()=>matchMedia('(min-width:901px)').matches;
    function read(){
        try{const value=JSON.parse(sessionStorage.getItem(key)||'null');if(!value||typeof value!=='object'||Array.isArray(value))return defaults();return {reviewWidth:typeof value.reviewWidth==='number'&&Number.isFinite(value.reviewWidth)?clamp(Math.round(value.reviewWidth),28,50):38,filesCollapsed:value.filesCollapsed===true};}catch(_){return defaults();}
    }
    function remember(){try{sessionStorage.setItem(key,JSON.stringify(preference));}catch(_){/* Layout still works within the current view. */}}
    function stopDrag(){
        if(drag){const previous=drag;drag=null;try{previous.node.releasePointerCapture(previous.id);}catch(_){}}
        modal()?.classList.remove('admin-workspace-dragging');
    }
    function bounds(){
        if(!workspace||!desktop()||modal().classList.contains('admin-decision-review'))return null;
        const width=workspace.clientWidth;if(width<=0)return null;
        const fileWidth=innerWidth>=1200?220:180,gap=8,available=width-(preference.filesCollapsed?0:fileWidth)-24-gap*(preference.filesCollapsed?2:3);
        const min=Math.max(28,Math.ceil(270/available*100)),max=Math.min(50,Math.floor((available-280)/available*100));
        return {available,min:Math.min(min,max),max,fileWidth};
    }
    function apply(){
        if(!allowed()||!workspace?.isConnected)return;
        modal().dataset.filesCollapsed=String(preference.filesCollapsed);
        const nav=workspace.querySelector('.admin-document-navigation');
        if(preference.filesCollapsed&&nav?.contains(document.activeElement))el('admin-files-toggle')?.focus({preventScroll:true});
        nav?.setAttribute('aria-hidden',String(preference.filesCollapsed));if(nav)nav.inert=preference.filesCollapsed;
        const size=bounds(),range=el('admin-review-width'),divider=el('admin-pane-divider');
        if(size&&range&&divider){
            const value=clamp(preference.reviewWidth,size.min,size.max);
            workspace.style.setProperty('--admin-file-width',size.fileWidth+'px');workspace.style.setProperty('--admin-note-width',Math.round(size.available*value/100)+'px');
            range.min=String(size.min);range.max=String(size.max);range.value=String(value);
            el('admin-review-width-value').textContent=value+'%';
            for(const [name,number]of [['min',size.min],['max',size.max],['now',value]])divider.setAttribute('aria-value'+name,String(number));
            const text=value+'% '+t('untuk panel pemeriksaan','for the review panel');range.setAttribute('aria-valuetext',text);divider.setAttribute('aria-valuetext',text);
        }
    }
    function refresh(){
        const root=el('admin-workspace-tools');if(!root)return;
        root.hidden=!allowed();if(!allowed())return;
        const toggle=el('admin-files-toggle');toggle.textContent=preference.filesCollapsed?t('Tampilkan Berkas','Show Files'):t('Ciutkan Berkas','Collapse Files');toggle.setAttribute('aria-expanded',String(!preference.filesCollapsed));
        el('admin-review-width-label').textContent=t('Lebar catatan','Notes width');el('admin-workspace-reset').textContent=t('Atur Ulang Tampilan','Reset Layout');
        el('admin-resize-help').textContent=t('Geser pemisah atau gunakan tombol panah kiri dan kanan untuk mengatur lebar. Home dan End memilih batas ukuran.','Drag the divider or use the left and right arrow keys to adjust the width. Home and End select the size limits.');
        el('admin-pane-divider')?.setAttribute('aria-label',t('Atur lebar dokumen dan pemeriksaan','Resize document and review panels'));
        const locked=busy();root.querySelectorAll('button,input').forEach(node=>node.disabled=locked);const divider=el('admin-pane-divider');if(divider){divider.tabIndex=locked?-1:0;divider.setAttribute('aria-disabled',String(locked));}
        if(locked)stopDrag();apply();
    }
    function opened(){
        stopDrag();observer?.disconnect();observer=null;workspace=null;
        if(!allowed()){el('admin-workspace-tools')?.remove();return;}
        if(epoch!==sessionEpoch){preference=read();epoch=sessionEpoch;}
        if(activeId!==selectedCaseId){listScroll=0;activeId=selectedCaseId;}
        workspace=document.querySelector('#case-detail-content .admin-review-workspace');if(!workspace)return;
        let root=el('admin-workspace-tools');if(!root){
            root=document.createElement('div');root.id='admin-workspace-tools';root.className='admin-workspace-tools';
            root.innerHTML='<button type="button" id="admin-files-toggle" class="btn-secondary" aria-controls="admin-file-navigation"></button><div class="admin-workspace-size"><label id="admin-review-width-label" for="admin-review-width"></label><input type="range" id="admin-review-width" min="28" max="50" step="1" aria-describedby="admin-resize-help"><output id="admin-review-width-value" for="admin-review-width"></output></div><button type="button" id="admin-workspace-reset" class="text-link"></button><p hidden id="admin-resize-help"></p>';
            el('case-detail-content').before(root);
        }
        workspace.querySelector('.admin-document-navigation').id='admin-file-navigation';
        const divider=document.createElement('div');divider.id='admin-pane-divider';divider.className='admin-pane-divider';divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-controls','admin-review-pane');divider.setAttribute('aria-describedby','admin-resize-help');divider.tabIndex=0;
        workspace.querySelector('.admin-review-rail').id='admin-review-pane';workspace.querySelector('.admin-review-rail').before(divider);
        refresh();observer=new ResizeObserver(()=>apply());observer.observe(workspace);
    }
    function setWidth(value){if(!allowed()||busy()||!desktop())return;const size=bounds();if(!size||!Number.isFinite(value))return;preference.reviewWidth=clamp(Math.round(value),size.min,size.max);remember();apply();}
    function collapse(value){
        if(!allowed()||busy())return;
        const nav=workspace?.querySelector('.admin-document-navigation');if(!nav)return;
        if(value&&!preference.filesCollapsed)listScroll=nav.scrollTop;
        preference.filesCollapsed=value;remember();refresh();
        if(!value)nav.scrollTop=listScroll;
    }
    document.addEventListener('input',event=>{if(event.target.id==='admin-review-width')setWidth(Number(event.target.value));});
    document.addEventListener('click',event=>{
        if(event.target.closest('#admin-files-toggle'))collapse(!preference.filesCollapsed);
        if(event.target.closest('#admin-workspace-reset')&&allowed()&&!busy()){preference=defaults();remember();refresh();const nav=workspace.querySelector('.admin-document-navigation');nav.scrollTop=listScroll;}
    });
    document.addEventListener('keydown',event=>{
        if(event.target.id!=='admin-pane-divider'||busy()||!desktop())return;
        const range=el('admin-review-width'),value=Number(range.value),min=Number(range.min),max=Number(range.max),next={ArrowLeft:value+2,ArrowRight:value-2,Home:min,End:max}[event.key];
        if(next!==undefined){event.preventDefault();setWidth(next);}
        if(event.key==='Escape'&&drag){event.preventDefault();const initial=drag.initial;stopDrag();setWidth(initial);}
    });
    document.addEventListener('pointerdown',event=>{
        if(event.target.id!=='admin-pane-divider'||event.button!==0||!allowed()||busy()||!desktop())return;
        event.preventDefault();const node=event.target;node.focus({preventScroll:true});drag={node,id:event.pointerId,initial:preference.reviewWidth};node.setPointerCapture(event.pointerId);modal().classList.add('admin-workspace-dragging');
    });
    document.addEventListener('pointermove',event=>{
        if(!drag||event.pointerId!==drag.id)return;
        const size=bounds();if(!size||busy()){stopDrag();return;}setWidth((workspace.getBoundingClientRect().right-event.clientX-20)/size.available*100);
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>document.addEventListener(name,event=>{if(drag&&event.pointerId===drag.id)stopDrag();}));
    window.addEventListener('resize',()=>{if(!desktop())stopDrag();apply();});
    function reset(){stopDrag();observer?.disconnect();observer=null;workspace=null;preference=defaults();epoch=-1;activeId='';listScroll=0;try{sessionStorage.removeItem(key);}catch(_){}el('admin-workspace-tools')?.remove();delete modal()?.dataset.filesCollapsed;}
    window.addEventListener('ipcos:logout',reset);
    window.IPCOSReviewWorkspace=Object.freeze({opened,refresh,reset});
})();
