/* Local previews only. Private Drive files still pass through the authenticated API. */
(() => {
    const t = (id,en) => uxText(id,en);
    const localUrls = new Set();
    const jobs=new Map();let pdfLibrary;
    function reset(panel) {
        if (!panel) return;
        const job=jobs.get(panel);if(job){job.cancelled=true;job.renderTask?.cancel();job.loading?.destroy().catch(()=>{});jobs.delete(panel);}
        panel.querySelector('iframe')?.setAttribute('src','about:blank');
        panel.querySelector('iframe')?.setAttribute('hidden','');
        panel.querySelectorAll('.document-renderer,.document-preview-actions,.pdf-preview-toolbar,.pdf-accessible-text').forEach(el=>el.remove());
    }
    async function pdfPreview(panel,url,name) {
        const epoch=sessionEpoch,job={cancelled:false,page:1,zoom:1,drawing:false};jobs.set(panel,job);
        const live=()=>!job.cancelled&&epoch===sessionEpoch&&panel.isConnected&&jobs.get(panel)===job;
        const helper=panel.querySelector('p'),toolbar=document.createElement('div');toolbar.className='pdf-preview-toolbar';
        const viewer=document.createElement('div');viewer.className='document-renderer pdf-canvas-viewer';
        const canvas=document.createElement('canvas');canvas.setAttribute('role','img');viewer.append(canvas);
        const accessible=document.createElement('p');accessible.className='sr-only pdf-accessible-text';
        const previous=document.createElement('button'),next=document.createElement('button'),minus=document.createElement('button'),plus=document.createElement('button'),position=document.createElement('span');
        for(const button of [previous,next,minus,plus]){button.type='button';button.className='btn-secondary';}
        previous.textContent='‹';next.textContent='›';minus.textContent='−';plus.textContent='+';
        previous.setAttribute('aria-label',t('Halaman Sebelumnya','Previous Page'));next.setAttribute('aria-label',t('Halaman Berikutnya','Next Page'));minus.setAttribute('aria-label',t('Perkecil PDF','Zoom Out'));plus.setAttribute('aria-label',t('Perbesar PDF','Zoom In'));position.setAttribute('role','status');
        toolbar.append(previous,position,next,minus,plus);panel.insertBefore(toolbar,helper);panel.insertBefore(viewer,helper);panel.insertBefore(accessible,helper);
        helper.textContent=t('Memuat pembaca PDF lokal…','Loading the local PDF reader…');
        const buttons=()=>{previous.disabled=job.drawing||!job.pdf||job.page<=1;next.disabled=job.drawing||!job.pdf||job.page>=job.pdf.numPages;minus.disabled=job.drawing||!job.pdf||job.zoom<=.75;plus.disabled=job.drawing||!job.pdf||job.zoom>=2;};buttons();
        async function draw(){
            if(!live()||job.drawing)return;job.drawing=true;buttons();
            try{
                const page=await job.pdf.getPage(job.page);if(!live())return;
                const base=page.getViewport({scale:1}),width=Math.max(240,Math.min(1100,viewer.clientWidth-24));
                const viewport=page.getViewport({scale:width/base.width*job.zoom}),density=Math.min(2,window.devicePixelRatio||1,Math.sqrt(4000000/(viewport.width*viewport.height)));
                canvas.width=Math.floor(viewport.width*density);canvas.height=Math.floor(viewport.height*density);canvas.style.width=Math.floor(viewport.width)+'px';canvas.style.height=Math.floor(viewport.height)+'px';
                job.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density!==1?[density,0,0,density,0,0]:null});await job.renderTask.promise;if(!live())return;
                canvas.dataset.rendered='true';canvas.dataset.page=String(job.page);canvas.setAttribute('aria-label',name+' · '+t('Halaman ','Page ')+job.page+' / '+job.pdf.numPages);
                position.textContent=job.page+' / '+job.pdf.numPages+' · '+Math.round(job.zoom*100)+'%';
                helper.textContent=t('PDF diproses di perangkat Anda. Gunakan tombol halaman untuk membaca seluruh dokumen.','The PDF is processed on your device. Use the page controls to read the complete document.');
                const text=await page.getTextContent();if(live())accessible.textContent=text.items.map(item=>item.str||'').join(' ').slice(0,12000);
            }catch(error){if(live()&&error.name!=='RenderingCancelledException')helper.textContent=t('Halaman PDF belum dapat ditampilkan. Gunakan Buka Pratinjau atau Unduh Berkas.','This PDF page could not be displayed. Use Open Preview or Download File.');}
            finally{job.drawing=false;if(live())buttons();}
        }
        previous.addEventListener('click',()=>{if(job.page>1){job.page--;draw();}});next.addEventListener('click',()=>{if(job.pdf&&job.page<job.pdf.numPages){job.page++;draw();}});
        minus.addEventListener('click',()=>{job.zoom=Math.max(.75,job.zoom-.25);draw();});plus.addEventListener('click',()=>{job.zoom=Math.min(2,job.zoom+.25);draw();});
        try{
            pdfLibrary ||= import('./vendor/pdfjs/pdf.min.mjs');const library=await pdfLibrary;if(!live())return;
            library.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',location.href).href;
            const bytes=new Uint8Array(await (await fetch(url)).arrayBuffer());if(!live())return;
            const base=new URL('./vendor/pdfjs/',location.href).href;
            job.loading=library.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/'});
            job.pdf=await job.loading.promise;if(!live())return;await draw();
        }catch(error){if(live())helper.textContent=t('PDF rusak, dilindungi kata sandi, atau tidak dapat dibaca. Gunakan Buka Pratinjau atau Unduh Berkas.','This PDF is damaged, password protected, or unreadable. Use Open Preview or Download File.');}
    }
    function render(panel,url,mime,name) {
        reset(panel); panel.hidden=false;
        const helper=panel.querySelector('p');
        const actions=document.createElement('div'); actions.className='document-preview-actions button-row';
        const open=document.createElement('a');open.href=url;open.target='_blank';open.rel='noopener';open.className='btn-secondary';open.textContent=t('Buka Pratinjau di Tab Baru','Open Preview in New Tab');
        const download=document.createElement('a');download.href=url;download.download=name;download.className='btn-secondary';download.textContent=t('Unduh Berkas','Download File');
        const canPreview=['application/pdf','image/png','image/jpeg'].includes(mime);
        if (canPreview) {
            if(mime!=='application/pdf'){const viewer=document.createElement('img');viewer.className='document-renderer';viewer.src=url;viewer.alt=t('Pratinjau: ','Preview: ')+name;panel.insertBefore(viewer,helper);}actions.append(open);
        }
        actions.append(download);panel.insertBefore(actions,helper);
        helper.textContent=canPreview?t('Periksa isi dokumen. Jika penampil kosong, gunakan Buka Pratinjau di Tab Baru atau Unduh Berkas.','Check the document contents. If the viewer is blank, use Open Preview in New Tab or Download File.'):t('Format Word atau arsip dibuka melalui aplikasi di perangkat Anda. Pilih Unduh Berkas.','Word documents and archives open in an app on your device. Select Download File.');
        if(mime==='application/pdf')pdfPreview(panel,url,name);
    }
    function trustedMime(bytes,mime,name) {
        const header=new TextDecoder().decode(bytes.slice(0,5));
        if(header==='%PDF-')return 'application/pdf';
        if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'image/png';
        if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
        if(['application/pdf','image/png','image/jpeg'].includes(mime))throw new Error(t('Isi berkas tidak sesuai format pratinjau.','The file content does not match its preview format.'));
        return 'application/octet-stream';
    }
    function clearLocal() {
        localUrls.forEach(url=>URL.revokeObjectURL(url));localUrls.clear();
        const dialog=document.getElementById('local-document-preview');if(dialog){reset(dialog.querySelector('.local-preview-content'));if(dialog.open)dialog.close();}
    }
    function dialog() {
        let el=document.getElementById('local-document-preview');if(el)return el;
        el=document.createElement('dialog');el.id='local-document-preview';el.className='overlay-dialog';el.setAttribute('aria-labelledby','local-preview-title');
        el.innerHTML='<div class="modal-card"><div class="local-preview-heading"><h2 id="local-preview-title"></h2><button type="button" class="btn-secondary" data-close-local-preview></button></div><div class="local-preview-content"><p class="field-helper"></p></div></div>';
        document.body.append(el);el.querySelector('button').addEventListener('click',clearLocal);el.addEventListener('cancel',event=>{event.preventDefault();clearLocal();});el.addEventListener('close',()=>{if(!el.open)clearLocal();});return el;
    }
    async function previewLocal(inputId) {
        const input=document.getElementById(inputId),file=input?.files?.[0];if(!file || currentUser.role!=='mhs')return;
        const epoch=sessionEpoch; const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
        if(epoch!==sessionEpoch || input.files[0]!==file)return;
        clearLocal();const el=dialog(),mime=trustedMime(bytes,file.type,file.name);
        const url=URL.createObjectURL(new Blob([file],{type:mime}));localUrls.add(url);
        el.querySelector('h2').textContent=file.name;el.querySelector('button').textContent=t('Tutup','Close');
        render(el.querySelector('.local-preview-content'),url,mime,file.name);el.showModal();
    }
    document.addEventListener('click',event=>{const button=event.target.closest('[data-local-preview]');if(button)previewLocal(button.dataset.localPreview).catch(error=>showToast(error.message,'error'));});
    window.IPCOSDocuments={render,reset,trustedMime,clearLocal};
})();
