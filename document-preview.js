/* Local previews only. Private Drive files still pass through the authenticated API. */
(() => {
    const t = (id,en) => uxText(id,en);
    function message(node,id,en) { node.dataset.documentId=id;node.dataset.documentEn=en;node.textContent=t(id,en); }
    const localUrls = new Set();
    const jobs=new Map();let pdfLibrary,pdfLibraryAttempt=0;
    const readingKey='ipcos_pdf_reading_positions';let readingPositions=null;
    const validReading=value=>value&&typeof value==='object'&&Number.isInteger(value.page)&&Number.isInteger(value.pages)&&value.pages>0&&value.pages<=100000&&value.page>=1&&value.page<=value.pages&&Number.isFinite(value.zoom)&&value.zoom>=.75&&value.zoom<=2&&[0,90,180,270].includes(value.rotation)&&['top','left'].every(key=>Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1);
    function positions(){
        if(readingPositions)return readingPositions;
        readingPositions=new Map();
        try{const raw=sessionStorage.getItem(readingKey);if(raw&&raw.length<50000){const saved=JSON.parse(raw);if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [key,value]of Object.entries(saved).slice(-60))if(/^[a-f0-9]{64}$/.test(key)&&validReading(value))readingPositions.set(key,{page:value.page,pages:value.pages,zoom:value.zoom,rotation:value.rotation,top:value.top,left:value.left});}}catch(_){/* Reading remains available when storage is blocked. */}
        return readingPositions;
    }
    function storeReading(key,value){
        if(!key)return;const saved=positions();saved.delete(key);if(value)saved.set(key,value);while(saved.size>60)saved.delete(saved.keys().next().value);
        try{if(saved.size)sessionStorage.setItem(readingKey,JSON.stringify(Object.fromEntries(saved)));else sessionStorage.removeItem(readingKey);}catch(_){/* Keep only the in-memory position for this page. */}
    }
    const hex=buffer=>Array.from(new Uint8Array(buffer),byte=>byte.toString(16).padStart(2,'0')).join('');
    async function fingerprint(bytes){try{return crypto.subtle?hex(await crypto.subtle.digest('SHA-256',bytes)):'';}catch(_){return '';}}
    async function readingIdentity(context,content,token,role){
        if(!context||!token||!['admin','mhs'].includes(role)||typeof context.documentUrl!=='string'||!context.documentUrl||!String(context.requestId||'')||!crypto.subtle)return '';
        try{if(!content)return '';const identity=JSON.stringify([token,role,String(context.requestId),context.documentUrl,Number(context.version)||0,content]);return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)));}catch(_){return '';}
    }
    const changedPosition=panel=>document.dispatchEvent(new CustomEvent('ipcos:pdf-position',{detail:{panel}}));
    function clearReading(){readingPositions=null;try{sessionStorage.removeItem(readingKey);}catch(_){}jobs.forEach(job=>{job.readingId='';job.trackReading=false;});}
    function saveVisibleReadings(){jobs.forEach(job=>job.saveReading?.());}
    window.addEventListener('pagehide',saveVisibleReadings);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)saveVisibleReadings();});
    function loadPdfLibrary() {
        if(!pdfLibrary){
            const attempt=pdfLibraryAttempt++,suffix=attempt?'?retry='+attempt:'';
            const pending=(attempt?import('./vendor/pdfjs/pdf.min.mjs?retry='+attempt):import('./vendor/pdfjs/pdf.min.mjs')).then(library=>({library,workerSrc:new URL('./vendor/pdfjs/pdf.worker.min.mjs'+suffix,location.href).href})).catch(error=>{if(pdfLibrary===pending)pdfLibrary=null;throw error;});
            pdfLibrary=pending;
        }
        return pdfLibrary;
    }
    function reset(panel) {
        if (!panel) return;
        panel.querySelectorAll('.comparison-panel').forEach(reset);
        panel.querySelectorAll('.document-comparison,.comparison-tools').forEach(node=>node.remove());
        const job=jobs.get(panel);if(job){job.saveReading?.();job.cancelled=true;job.renderTask?.cancel();job.loading?.destroy().catch(()=>{});document.removeEventListener('fullscreenchange',job.fullscreenChanged);if(job.closeExpanded)panel.removeEventListener('keydown',job.closeExpanded);job.resizeObserver?.disconnect();clearTimeout(job.resizeTimer);clearTimeout(job.readingTimer);jobs.delete(panel);}
        panel.querySelector('iframe')?.setAttribute('src','about:blank');
        panel.querySelector('iframe')?.setAttribute('hidden','');
        if(document.fullscreenElement===panel)document.exitFullscreen().catch(()=>{});panel.classList.remove('document-expanded');
        panel.querySelectorAll('.document-renderer,.document-preview-actions,.pdf-preview-toolbar,.pdf-accessible-text,.pdf-search-status,.pdf-reading-resume,[data-pdf-reference-status]').forEach(el=>el.remove());changedPosition(panel);
    }
    async function pdfPreview(panel,url,name,context) {
        const epoch=sessionEpoch,token=getSessionToken(),role=currentUser.role,job={cancelled:false,page:1,zoom:1,rotation:0,drawing:false,searching:false,searchId:0,readingId:'',trackReading:false};jobs.set(panel,job);
        const live=()=>!job.cancelled&&epoch===sessionEpoch&&token===getSessionToken()&&panel.isConnected&&jobs.get(panel)===job;
        const helper=panel.querySelector('p'),toolbar=document.createElement('div');toolbar.className='pdf-preview-toolbar';
        const retry=document.createElement('button');retry.type='button';retry.className='btn-secondary';retry.dataset.documentRetry='';retry.dataset.documentId='Muat Ulang Pratinjau';retry.dataset.documentEn='Reload Preview';retry.textContent=t(retry.dataset.documentId,retry.dataset.documentEn);retry.hidden=true;
        retry.addEventListener('click',()=>{if(live())render(panel,url,'application/pdf',name,context);});panel.querySelector('.document-preview-actions').append(retry);
        const viewer=document.createElement('div');viewer.className='document-renderer pdf-canvas-viewer';viewer.tabIndex=0;viewer.setAttribute('aria-label',t('Dokumen PDF','PDF Document'));
        const canvas=document.createElement('canvas');canvas.setAttribute('role','img');viewer.append(canvas);
        const referenceStatus=document.createElement('p');referenceStatus.className='field-helper pdf-reference-status';referenceStatus.dataset.pdfReferenceStatus='';referenceStatus.setAttribute('role','status');referenceStatus.hidden=true;
        const referenceMessage=(id,en)=>{job.referenceMessage=[id,en];referenceStatus.textContent=t(id,en);referenceStatus.hidden=false;};
        job.capture=()=>{
            if(!live()||job.drawing||!job.pdf||!job.confirmedReading||canvas.dataset.rendered!=='true'||!context?.requestId||!context.documentUrl||!/^[a-f0-9]{64}$/.test(job.fingerprint||'')||job.confirmedReading.page!==job.page)return null;
            return {page:job.confirmedReading.page,pages:job.pdf.numPages,fingerprint:job.fingerprint,version:Number(context.version)||0,requestId:String(context.requestId),documentUrl:context.documentUrl};
        };
        const resume=document.createElement('div');resume.className='pdf-reading-resume';resume.hidden=true;resume.setAttribute('role','group');
        const resumeText=document.createElement('p'),continueReading=document.createElement('button'),startReading=document.createElement('button');
        for(const [button,action]of [[continueReading,'continue'],[startReading,'start']]){button.type='button';button.className='btn-secondary';button.dataset.pdfReadingAction=action;}
        const resumeActions=document.createElement('div');resumeActions.className='pdf-reading-actions';resumeActions.append(continueReading,startReading);resume.append(resumeText,resumeActions);
        const resumeLabels=()=>{resume.setAttribute('aria-label',t('Posisi baca tersimpan','Saved Reading Position'));resumeText.textContent=t('Posisi terakhir: halaman ','Last position: page ')+(job.resume?.page||1);continueReading.textContent=t('Lanjut Halaman ','Continue Page ')+(job.resume?.page||1);startReading.textContent=t('Mulai dari Awal','Start Over');};
        const scrollReading=()=>({top:viewer.scrollHeight>viewer.clientHeight?Math.min(1,Math.max(0,viewer.scrollTop/(viewer.scrollHeight-viewer.clientHeight))):0,left:viewer.scrollWidth>viewer.clientWidth?Math.min(1,Math.max(0,viewer.scrollLeft/(viewer.scrollWidth-viewer.clientWidth))):0});
        const restoreScroll=value=>{viewer.scrollTop=value.top*Math.max(0,viewer.scrollHeight-viewer.clientHeight);viewer.scrollLeft=value.left*Math.max(0,viewer.scrollWidth-viewer.clientWidth);};
        job.saveReading=()=>{
            if(!live()||!job.readingId||!job.trackReading||!job.confirmedReading||canvas.dataset.rendered!=='true')return;
            const value={...job.confirmedReading};if(viewer.clientWidth>0&&viewer.getClientRects().length)Object.assign(value,scrollReading());
            job.confirmedReading=value;storeReading(job.readingId,value.page===1&&value.zoom===1&&!value.rotation&&!value.top&&!value.left?null:value);
        };
        const beginReading=()=>{job.resume=null;resume.hidden=true;job.trackReading=true;};
        viewer.addEventListener('scroll',()=>{clearTimeout(job.readingTimer);job.readingTimer=setTimeout(job.saveReading,120);},{passive:true});
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
        panel.insertBefore(resume,helper);if(context?.pageRef)panel.insertBefore(referenceStatus,helper);panel.insertBefore(toolbar,helper);panel.insertBefore(viewer,helper);panel.insertBefore(accessible,helper);panel.insertBefore(searchStatus,helper);
        message(helper,'Memuat pembaca PDF lokal…','Loading the local PDF reader…');
        let hits=[],hitIndex=-1;
        const buttons=()=>{previous.disabled=job.drawing||!job.pdf||job.page<=1;next.disabled=job.drawing||!job.pdf||job.page>=job.pdf.numPages;minus.disabled=job.drawing||!job.pdf||job.zoom<=.75;plus.disabled=job.drawing||!job.pdf||job.zoom>=2;rotate.disabled=go.disabled=pageInput.disabled=job.drawing||!job.pdf;find.disabled=!job.pdf||job.searching;nextMatch.disabled=job.drawing||job.searching;continueReading.disabled=startReading.disabled=job.drawing||!job.pdf;};buttons();
        continueReading.addEventListener('click',()=>{if(!live()||job.drawing||!job.resume)return;const value=job.resume;beginReading();job.page=value.page;job.zoom=value.zoom;job.rotation=value.rotation;job.restoreReading=value;viewer.focus({preventScroll:true});draw();});
        startReading.addEventListener('click',()=>{if(!live()||job.drawing||!job.pdf)return;beginReading();storeReading(job.readingId,null);job.page=1;job.zoom=1;job.rotation=0;job.restoreReading={top:0,left:0};viewer.focus({preventScroll:true});draw();});
        async function draw(preserveReading=false){
            if(!live()||job.drawing||!job.pdf)return;
            if(viewer.clientWidth<=0||!viewer.getClientRects().length){job.pendingDraw=true;return;}
            job.pendingDraw=false;job.drawing=true;buttons();changedPosition(panel);
            try{
                const page=await job.pdf.getPage(job.page);if(!live())return;if(viewer.clientWidth<=0||!viewer.getClientRects().length){job.pendingDraw=true;return;}
                const reading=preserveReading?{top:viewer.scrollTop,left:viewer.scrollLeft,width:canvas.clientWidth,height:canvas.clientHeight}:null;
                job.renderedWidth=viewer.clientWidth;
                const base=page.getViewport({scale:1,rotation:page.rotate+job.rotation}),width=Math.max(240,Math.min(1100,viewer.clientWidth-24));
                const viewport=page.getViewport({scale:width/base.width*job.zoom,rotation:page.rotate+job.rotation}),density=Math.min(2,window.devicePixelRatio||1,Math.sqrt(4000000/(viewport.width*viewport.height)));
                canvas.width=Math.floor(viewport.width*density);canvas.height=Math.floor(viewport.height*density);canvas.style.width=Math.floor(viewport.width)+'px';canvas.style.height=Math.floor(viewport.height)+'px';
                if(reading){viewer.scrollTop=reading.height?reading.top*canvas.clientHeight/reading.height:reading.top;viewer.scrollLeft=reading.width?reading.left*canvas.clientWidth/reading.width:reading.left;}
                canvas.dataset.rendered='false';job.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density!==1?[density,0,0,density,0,0]:null});await job.renderTask.promise;if(!live())return;
                canvas.dataset.rendered='true';canvas.dataset.page=String(job.page);canvas.dataset.rotation=String(job.rotation);canvas.setAttribute('aria-label',name+' · '+t('Halaman ','Page ')+job.page+' / '+job.pdf.numPages);
                if(job.restoreReading){restoreScroll(job.restoreReading);job.restoreReading=null;}
                job.confirmedReading={page:job.page,pages:job.pdf.numPages,zoom:job.zoom,rotation:job.rotation,...scrollReading()};job.saveReading();
                if(job.referenceTarget===job.page){referenceMessage('Halaman '+job.page+' dibuka dari catatan pemeriksaan.','Page '+job.page+' opened from the review note.');job.referenceTarget=null;if(context?.focusReference!==false){viewer.focus({preventScroll:true});viewer.scrollIntoView({block:'nearest',behavior:'instant'});}}
                position.textContent=job.page+' / '+job.pdf.numPages+' · '+Math.round(job.zoom*100)+'%';pageInput.value=String(job.page);
                message(helper,'PDF diproses di perangkat Anda. Pencarian tersedia untuk PDF yang memiliki teks.','The PDF is processed on your device. Search works with PDFs containing text.');
                const text=await page.getTextContent();if(live())accessible.textContent=text.items.map(item=>item.str||'').join(' ').slice(0,12000);
            }catch(error){if(live()&&error.name!=='RenderingCancelledException'){retry.hidden=false;message(helper,'Halaman PDF belum dapat ditampilkan. Muat Ulang Pratinjau atau buka berkas di tab baru.','This PDF page could not be displayed. Reload Preview or open the file in a new tab.');}}
            finally{job.drawing=false;if(live()){buttons();changedPosition(panel);if(job.redraw){const resize=job.resizeRedraw;job.redraw=false;job.resizeRedraw=false;draw(resize);}}}
        }
        previous.addEventListener('click',()=>{if(job.page>1&&!job.drawing){beginReading();job.page--;draw();}});next.addEventListener('click',()=>{if(job.pdf&&!job.drawing&&job.page<job.pdf.numPages){beginReading();job.page++;draw();}});
        minus.addEventListener('click',()=>{if(job.drawing)return;beginReading();job.zoom=Math.max(.75,job.zoom-.25);draw();});plus.addEventListener('click',()=>{if(job.drawing)return;beginReading();job.zoom=Math.min(2,job.zoom+.25);draw();});rotate.addEventListener('click',()=>{if(job.drawing)return;beginReading();job.rotation=(job.rotation+90)%360;draw();});
        jump.addEventListener('submit',event=>{event.preventDefault();const page=Number(pageInput.value);if(!job.pdf||job.drawing)return;if(!Number.isInteger(page)||page<1||page>job.pdf.numPages){pageInput.value=String(job.page);return;}beginReading();job.page=page;draw();});
        const showMatch=async()=>{if(!live()||!hits.length||job.drawing)return;beginReading();hitIndex=(hitIndex+1)%hits.length;const matched=hits[hitIndex],searchId=job.searchId;job.page=matched.page;await draw();if(live()&&searchId===job.searchId)searchStatus.textContent=(hitIndex+1)+' / '+hits.length+' · '+t('Halaman ','Page ')+job.page+' · '+matched.snippet;};
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
        let lastWidth=viewer.clientWidth;job.resizeObserver=new ResizeObserver(()=>{const width=viewer.clientWidth;if(!live()||width<=0||!viewer.getClientRects().length||(width===lastWidth&&width===job.renderedWidth&&!job.pendingDraw))return;lastWidth=width;clearTimeout(job.resizeTimer);job.resizeTimer=setTimeout(()=>{if(!live()||viewer.clientWidth<=0||(viewer.clientWidth===job.renderedWidth&&!job.pendingDraw))return;if(job.drawing){job.redraw=true;job.resizeRedraw=true;}else draw(true);},100);});job.resizeObserver.observe(viewer);
        job.translate=()=>{if(job.referenceMessage)referenceStatus.textContent=t(...job.referenceMessage);resumeLabels();viewer.setAttribute('aria-label',t('Dokumen PDF','PDF Document'));toolsTitle.textContent=t('Alat PDF','PDF Tools');previous.setAttribute('aria-label',t('Halaman Sebelumnya','Previous Page'));next.setAttribute('aria-label',t('Halaman Berikutnya','Next Page'));minus.setAttribute('aria-label',t('Perkecil PDF','Zoom Out'));plus.setAttribute('aria-label',t('Perbesar PDF','Zoom In'));rotate.setAttribute('aria-label',t('Putar Halaman','Rotate Page'));pageInput.setAttribute('aria-label',t('Nomor Halaman','Page Number'));go.textContent=t('Ke Halaman','Go to Page');query.placeholder=t('Cari teks di PDF','Search PDF text');query.setAttribute('aria-label',query.placeholder);find.textContent=t('Cari','Search');nextMatch.textContent=t('Hasil Berikutnya','Next Match');job.fullscreenChanged();};
        let libraryRequest;
        try{
            libraryRequest=loadPdfLibrary();const {library,workerSrc}=await libraryRequest;if(!live())return;
            library.GlobalWorkerOptions.workerSrc=workerSrc;
            const bytes=new Uint8Array(await (await fetch(url)).arrayBuffer());if(!live())return;
            const base=new URL('./vendor/pdfjs/',location.href).href;
            const content=fingerprint(bytes),identity=content.then(value=>readingIdentity(context,value,token,role));
            job.loading=library.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/'});
            const [pdf,key,contentHash]=await Promise.all([job.loading.promise,identity,content]);if(!live())return;job.pdf=pdf;job.readingId=key;job.fingerprint=contentHash;
            const saved=key?positions().get(key):null;
            const target=window.IPCOSPageNotes?.normalize(context?.pageRef),targetMatches=target&&target.fingerprint===contentHash&&target.version===(Number(context?.version)||0)&&target.pages===pdf.numPages&&target.page<=pdf.numPages;
            if(targetMatches){job.page=target.page;job.referenceTarget=target.page;job.trackReading=true;job.restoreReading={top:0,left:0};}
            else if(context?.pageRef){referenceMessage('Rujukan halaman tidak sesuai dengan isi atau versi PDF ini. Periksa dokumen sebelum melanjutkan.','The page reference does not match this PDF content or version. Check the document before continuing.');job.trackReading=!saved;}
            else if(saved&&saved.pages===pdf.numPages&&validReading(saved)){job.resume=saved;resumeLabels();resume.hidden=false;}
            else{if(saved)storeReading(key,null);job.trackReading=true;}
            pageInput.max=String(job.pdf.numPages);await draw();
        }catch(error){if(!['PasswordException','InvalidPDFException','AbortException'].includes(error.name)&&pdfLibrary===libraryRequest)pdfLibrary=null;if(live()){retry.hidden=false;if(error.name==='PasswordException')message(helper,'PDF memerlukan kata sandi. Buka Pratinjau di Tab Baru untuk membacanya.','This PDF requires a password. Open Preview in New Tab to read it.');else message(helper,'Pembaca PDF belum dapat memuat dokumen. Muat Ulang Pratinjau, buka di tab baru, atau unduh berkas.','The PDF reader could not load this document. Reload Preview, open it in a new tab, or download the file.');}}
    }
    function render(panel,url,mime,name,context=null) {
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
        if(context?.pageRef&&mime!=='application/pdf'){
            const status=document.createElement('p');status.className='field-helper pdf-reference-status';status.dataset.pdfReferenceStatus='';status.setAttribute('role','status');
            message(status,'Rujukan halaman ini memerlukan PDF yang diperiksa. Isi berkas sekarang bukan PDF.','This page reference requires the reviewed PDF. The current file is not a PDF.');panel.insertBefore(status,helper);
        }
        message(helper,...(canPreview?['Periksa isi dokumen. Jika penampil kosong, gunakan Buka Pratinjau di Tab Baru atau Unduh Berkas.','Check the document contents. If the viewer is blank, use Open Preview in New Tab or Download File.']:['Format Word atau arsip dibuka melalui aplikasi di perangkat Anda. Pilih Unduh Berkas.','Word documents and archives open in an app on your device. Select Download File.']));
        if(mime==='application/pdf')pdfPreview(panel,url,name,context);
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
        el.innerHTML='<div class="modal-card"><div class="local-preview-heading"><h2 id="local-preview-title" data-preserve-case></h2><button type="button" class="btn-secondary" data-close-local-preview></button></div><div class="local-preview-content"><p class="field-helper"></p></div></div>';
        document.body.append(el);el.querySelector('button').addEventListener('click',clearLocal);el.addEventListener('cancel',event=>{event.preventDefault();clearLocal();});el.addEventListener('close',()=>{if(!el.open)clearLocal();});return el;
    }
    async function previewLocal(inputId,index=0) {
        const input=document.getElementById(inputId),file=input?.files?.[index];if(!file || currentUser.role!=='mhs')return;
        const epoch=sessionEpoch; const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
        if(epoch!==sessionEpoch || input.files[index]!==file)return;
        clearLocal();const el=dialog(),mime=trustedMime(bytes,file.type,file.name);
        const url=URL.createObjectURL(new Blob([file],{type:mime}));localUrls.add(url);
        el.querySelector('h2').textContent=file.name;el.querySelector('button').textContent=t('Tutup','Close');
        render(el.querySelector('.local-preview-content'),url,mime,file.name);el.showModal();
    }
    document.addEventListener('click',event=>{const button=event.target.closest('[data-local-preview]');if(button)previewLocal(button.dataset.localPreview,Number(button.dataset.localPreviewIndex||0)).catch(error=>showToast(error.message,'error'));});
    window.IPCOSDocuments={render,reset,trustedMime,clearLocal,clearReading,currentPage:panel=>jobs.get(panel)?.capture?.()||null,languageChanged:()=>{jobs.forEach(job=>job.translate?.());document.querySelectorAll('[data-document-id]').forEach(node=>{node.textContent=t(node.dataset.documentId,node.dataset.documentEn);if(node.dataset.documentAria)node.setAttribute('aria-label',node.textContent);});}};
})();
