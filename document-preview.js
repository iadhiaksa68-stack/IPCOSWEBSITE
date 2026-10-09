/* Local previews only. Private Drive files still pass through the authenticated API. */
(() => {
    const t = (id,en) => uxText(id,en);
    const localUrls = new Set();
    const jobs=new Map();let pdfLibrary;
    function reset(panel) {
        if (!panel) return;
        panel.querySelectorAll('.comparison-panel').forEach(reset);
        panel.querySelectorAll('.document-comparison,.comparison-tools').forEach(node=>node.remove());
        const job=jobs.get(panel);if(job){job.cancelled=true;job.renderTask?.cancel();job.loading?.destroy().catch(()=>{});document.removeEventListener('fullscreenchange',job.fullscreenChanged);if(job.closeExpanded)panel.removeEventListener('keydown',job.closeExpanded);job.resizeObserver?.disconnect();clearTimeout(job.resizeTimer);jobs.delete(panel);}
        panel.querySelector('iframe')?.setAttribute('src','about:blank');
        panel.querySelector('iframe')?.setAttribute('hidden','');
        if(document.fullscreenElement===panel)document.exitFullscreen().catch(()=>{});panel.classList.remove('document-expanded');
        panel.querySelectorAll('.document-renderer,.document-preview-actions,.pdf-preview-toolbar,.pdf-accessible-text,.pdf-search-status').forEach(el=>el.remove());
    }
    async function pdfPreview(panel,url,name) {
        const epoch=sessionEpoch,job={cancelled:false,page:1,zoom:1,rotation:0,drawing:false,searching:false,searchId:0};jobs.set(panel,job);
        const live=()=>!job.cancelled&&epoch===sessionEpoch&&panel.isConnected&&jobs.get(panel)===job;
        const helper=panel.querySelector('p'),toolbar=document.createElement('div');toolbar.className='pdf-preview-toolbar';
        const viewer=document.createElement('div');viewer.className='document-renderer pdf-canvas-viewer';
        const canvas=document.createElement('canvas');canvas.setAttribute('role','img');viewer.append(canvas);
        const accessible=document.createElement('p');accessible.className='sr-only pdf-accessible-text';
        const previous=document.createElement('button'),next=document.createElement('button'),minus=document.createElement('button'),plus=document.createElement('button'),rotate=document.createElement('button'),expand=document.createElement('button'),position=document.createElement('span');
        for(const button of [previous,next,minus,plus,rotate,expand]){button.type='button';button.className='btn-secondary';}
        previous.textContent='‹';next.textContent='›';minus.textContent='−';plus.textContent='+';rotate.textContent='↻';expand.textContent='⛶';
        previous.setAttribute('aria-label',t('Halaman Sebelumnya','Previous Page'));next.setAttribute('aria-label',t('Halaman Berikutnya','Next Page'));minus.setAttribute('aria-label',t('Perkecil PDF','Zoom Out'));plus.setAttribute('aria-label',t('Perbesar PDF','Zoom In'));rotate.setAttribute('aria-label',t('Putar Halaman','Rotate Page'));expand.setAttribute('aria-label',t('Layar Penuh','Fullscreen'));position.setAttribute('role','status');
        const jump=document.createElement('form');jump.className='pdf-page-jump';
        const pageInput=document.createElement('input');pageInput.type='number';pageInput.min='1';pageInput.value='1';pageInput.setAttribute('aria-label',t('Nomor Halaman','Page Number'));
        const go=document.createElement('button');go.type='submit';go.className='btn-secondary';go.textContent=t('Ke Halaman','Go to Page');jump.append(pageInput,go);
        const search=document.createElement('form');search.className='pdf-text-search';
        const query=document.createElement('input');query.type='search';query.maxLength=120;query.placeholder=t('Cari teks di PDF','Search PDF text');query.setAttribute('aria-label',query.placeholder);
        const find=document.createElement('button');find.type='submit';find.className='btn-secondary';find.textContent=t('Cari','Search');
        const nextMatch=document.createElement('button');nextMatch.type='button';nextMatch.className='btn-secondary';nextMatch.textContent=t('Hasil Berikutnya','Next Match');nextMatch.hidden=true;
        const searchStatus=document.createElement('p');searchStatus.className='field-helper pdf-search-status';searchStatus.setAttribute('role','status');searchStatus.hidden=true;
        search.append(query,find,nextMatch);const tools=document.createElement('details');tools.className='pdf-tools';const toolsTitle=document.createElement('summary');toolsTitle.textContent=t('Alat PDF','PDF Tools');const extra=document.createElement('div');extra.className='pdf-extra-tools';extra.append(minus,plus,rotate,jump,search);tools.append(toolsTitle,extra);toolbar.append(previous,position,next,expand,tools);
        panel.insertBefore(toolbar,helper);panel.insertBefore(viewer,helper);panel.insertBefore(accessible,helper);panel.insertBefore(searchStatus,helper);
        helper.textContent=t('Memuat pembaca PDF lokal…','Loading the local PDF reader…');
        let hits=[],hitIndex=-1;
        const buttons=()=>{previous.disabled=job.drawing||!job.pdf||job.page<=1;next.disabled=job.drawing||!job.pdf||job.page>=job.pdf.numPages;minus.disabled=job.drawing||!job.pdf||job.zoom<=.75;plus.disabled=job.drawing||!job.pdf||job.zoom>=2;rotate.disabled=go.disabled=pageInput.disabled=job.drawing||!job.pdf;find.disabled=!job.pdf||job.searching;nextMatch.disabled=job.drawing||job.searching;};buttons();
        async function draw(){
            if(!live()||job.drawing||!job.pdf)return;job.drawing=true;buttons();
            try{
                const page=await job.pdf.getPage(job.page);if(!live())return;
                job.renderedWidth=viewer.clientWidth;
                const base=page.getViewport({scale:1,rotation:page.rotate+job.rotation}),width=Math.max(240,Math.min(1100,viewer.clientWidth-24));
                const viewport=page.getViewport({scale:width/base.width*job.zoom,rotation:page.rotate+job.rotation}),density=Math.min(2,window.devicePixelRatio||1,Math.sqrt(4000000/(viewport.width*viewport.height)));
                canvas.width=Math.floor(viewport.width*density);canvas.height=Math.floor(viewport.height*density);canvas.style.width=Math.floor(viewport.width)+'px';canvas.style.height=Math.floor(viewport.height)+'px';
                canvas.dataset.rendered='false';job.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density!==1?[density,0,0,density,0,0]:null});await job.renderTask.promise;if(!live())return;
                canvas.dataset.rendered='true';canvas.dataset.page=String(job.page);canvas.dataset.rotation=String(job.rotation);canvas.setAttribute('aria-label',name+' · '+t('Halaman ','Page ')+job.page+' / '+job.pdf.numPages);
                position.textContent=job.page+' / '+job.pdf.numPages+' · '+Math.round(job.zoom*100)+'%';pageInput.value=String(job.page);
                helper.textContent=t('PDF diproses di perangkat Anda. Pencarian tersedia untuk PDF yang memiliki teks.','The PDF is processed on your device. Search works with PDFs containing text.');
                const text=await page.getTextContent();if(live())accessible.textContent=text.items.map(item=>item.str||'').join(' ').slice(0,12000);
            }catch(error){if(live()&&error.name!=='RenderingCancelledException')helper.textContent=t('Halaman PDF belum dapat ditampilkan. Gunakan Buka Pratinjau atau Unduh Berkas.','This PDF page could not be displayed. Use Open Preview or Download File.');}
            finally{job.drawing=false;if(live()){buttons();if(job.redraw){job.redraw=false;draw();}}}
        }
        previous.addEventListener('click',()=>{if(job.page>1){job.page--;draw();}});next.addEventListener('click',()=>{if(job.pdf&&job.page<job.pdf.numPages){job.page++;draw();}});
        minus.addEventListener('click',()=>{job.zoom=Math.max(.75,job.zoom-.25);draw();});plus.addEventListener('click',()=>{job.zoom=Math.min(2,job.zoom+.25);draw();});rotate.addEventListener('click',()=>{job.rotation=(job.rotation+90)%360;draw();});
        jump.addEventListener('submit',event=>{event.preventDefault();const page=Number(pageInput.value);if(!job.pdf||job.drawing)return;if(!Number.isInteger(page)||page<1||page>job.pdf.numPages){pageInput.value=String(job.page);return;}job.page=page;draw();});
        const showMatch=async()=>{if(!live()||!hits.length||job.drawing)return;hitIndex=(hitIndex+1)%hits.length;const matched=hits[hitIndex],searchId=job.searchId;job.page=matched.page;await draw();if(live()&&searchId===job.searchId)searchStatus.textContent=(hitIndex+1)+' / '+hits.length+' · '+t('Halaman ','Page ')+job.page+' · '+matched.snippet;};
        nextMatch.addEventListener('click',showMatch);
        query.addEventListener('input',()=>{job.searchId++;job.searching=false;hits=[];hitIndex=-1;nextMatch.hidden=true;searchStatus.hidden=true;buttons();});
        search.addEventListener('submit',async event=>{
            event.preventDefault();if(!job.pdf||job.searching)return;const term=query.value.trim().toLocaleLowerCase();if(!term)return;
            const searchId=++job.searchId;job.searching=true;hits=[];hitIndex=-1;nextMatch.hidden=true;searchStatus.hidden=false;buttons();
            const current=()=>live()&&job.searchId===searchId;
            try{
                let characters=0;
                for(let number=1;number<=job.pdf.numPages&&number<=300;number++){
                    if(!current())return;searchStatus.textContent=t('Mencari di halaman ','Searching page ')+number+' / '+job.pdf.numPages;
                    const page=await job.pdf.getPage(number),content=await page.getTextContent();if(!current())return;
                    const text=content.items.map(item=>item.str||'').join(' ').slice(0,100000);characters+=text.length;
                    const index=text.toLocaleLowerCase().indexOf(term);if(index>=0)hits.push({page:number,snippet:text.slice(Math.max(0,index-35),index+term.length+65)});
                    if(characters>=2000000)break;
                    await new Promise(resolve=>setTimeout(resolve,0));
                }
                if(!current())return;nextMatch.hidden=hits.length<2;
                if(hits.length){while(job.drawing&&current())await new Promise(resolve=>setTimeout(resolve,16));if(current())await showMatch();}
                else searchStatus.textContent=t('Teks tidak ditemukan. PDF hasil pindai mungkin tidak memiliki lapisan teks.','No text found. Scanned PDFs may not contain a text layer.');
                if(current()&&(job.pdf.numPages>300||characters>=2000000))searchStatus.textContent+=' '+t('Pencarian dibatasi agar perangkat tetap ringan.','Search is limited to keep your device responsive.');
            }catch(error){if(current())searchStatus.textContent=t('Pencarian belum berhasil. Coba lagi.','Search failed. Please try again.');}
            finally{if(current()){job.searching=false;buttons();}}
        });
        expand.addEventListener('click',async()=>{
            try{if(panel.classList.contains('document-expanded'))panel.classList.remove('document-expanded');else if(document.fullscreenElement===panel)await document.exitFullscreen();else if(panel.requestFullscreen)await panel.requestFullscreen();else panel.classList.toggle('document-expanded');}
            catch(_){panel.classList.toggle('document-expanded');}
            job.fullscreenChanged();
        });
        job.fullscreenChanged=()=>{if(!live())return;expand.setAttribute('aria-label',document.fullscreenElement===panel||panel.classList.contains('document-expanded')?t('Keluar dari Layar Penuh','Exit Fullscreen'):t('Layar Penuh','Fullscreen'));};document.addEventListener('fullscreenchange',job.fullscreenChanged);
        const closeExpanded=event=>{if(event.key==='Escape'&&panel.classList.contains('document-expanded')){event.stopPropagation();panel.classList.remove('document-expanded');job.fullscreenChanged();}};panel.addEventListener('keydown',closeExpanded);job.closeExpanded=closeExpanded;
        let lastWidth=viewer.clientWidth;job.resizeObserver=new ResizeObserver(()=>{if(!live()||viewer.clientWidth===lastWidth)return;lastWidth=viewer.clientWidth;clearTimeout(job.resizeTimer);job.resizeTimer=setTimeout(()=>{if(viewer.clientWidth===job.renderedWidth)return;if(job.drawing)job.redraw=true;else draw();},100);});job.resizeObserver.observe(viewer);
        job.translate=()=>{toolsTitle.textContent=t('Alat PDF','PDF Tools');previous.setAttribute('aria-label',t('Halaman Sebelumnya','Previous Page'));next.setAttribute('aria-label',t('Halaman Berikutnya','Next Page'));minus.setAttribute('aria-label',t('Perkecil PDF','Zoom Out'));plus.setAttribute('aria-label',t('Perbesar PDF','Zoom In'));rotate.setAttribute('aria-label',t('Putar Halaman','Rotate Page'));pageInput.setAttribute('aria-label',t('Nomor Halaman','Page Number'));go.textContent=t('Ke Halaman','Go to Page');query.placeholder=t('Cari teks di PDF','Search PDF text');query.setAttribute('aria-label',query.placeholder);find.textContent=t('Cari','Search');nextMatch.textContent=t('Hasil Berikutnya','Next Match');job.fullscreenChanged();};
        try{
            pdfLibrary ||= import('./vendor/pdfjs/pdf.min.mjs');const library=await pdfLibrary;if(!live())return;
            library.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',location.href).href;
            const bytes=new Uint8Array(await (await fetch(url)).arrayBuffer());if(!live())return;
            const base=new URL('./vendor/pdfjs/',location.href).href;
            job.loading=library.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/'});
            job.pdf=await job.loading.promise;if(!live())return;pageInput.max=String(job.pdf.numPages);await draw();
        }catch(error){if(live())helper.textContent=t('PDF rusak, dilindungi kata sandi, atau tidak dapat dibaca. Gunakan Buka Pratinjau atau Unduh Berkas.','This PDF is damaged, password protected, or unreadable. Use Open Preview or Download File.');}
    }
    function render(panel,url,mime,name) {
        reset(panel); panel.hidden=false;
        const helper=panel.querySelector('p');
        const actions=document.createElement('div'); actions.className='document-preview-actions button-row';
        const open=document.createElement('a');open.href=url;open.target='_blank';open.rel='noopener';open.className='btn-secondary';open.dataset.documentId='Buka Pratinjau di Tab Baru';open.dataset.documentEn='Open Preview in New Tab';open.textContent=t(open.dataset.documentId,open.dataset.documentEn);
        const download=document.createElement('a');download.href=url;download.download=name;download.className='btn-secondary';download.dataset.documentId='Unduh Berkas';download.dataset.documentEn='Download File';download.textContent=t(download.dataset.documentId,download.dataset.documentEn);
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
    window.IPCOSDocuments={render,reset,trustedMime,clearLocal,languageChanged:()=>{jobs.forEach(job=>job.translate?.());document.querySelectorAll('[data-document-id]').forEach(node=>{node.textContent=t(node.dataset.documentId,node.dataset.documentEn);if(node.dataset.documentAria)node.setAttribute('aria-label',node.textContent);});}};
})();
