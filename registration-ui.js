/* Guided registration keeps the existing fields, uploads and transaction path. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    const steps=['service','data','files','review'];
    let activeStep='service',previousType='',generation=0;
    function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
    function refresh(){
        window.IPCOSUploads?.refresh();
        const select=el('reg-jenis-utama'),nav=el('registration-stepper');if(!select||!nav)return;
        const type=select.value,selected=SERVICE_TYPES.includes(type),review=!el('registration-review').hidden;
        if(previousType!==type)generation++;
        if(!selected)activeStep='service';else if(previousType!==type||activeStep==='review'&&!review)activeStep='data';
        if(selected&&review)activeStep='review';
        previousType=type;
        const requirements=selected?registrationRequirements(type):[],dataIds=new Set(selected?registrationTextSpecs(type).map(([id])=>id):[]);
        const dataReady=selected&&requirements.filter(item=>dataIds.has(item.id)).every(item=>item.ready);
        const filesReady=selected&&requirements.filter(item=>!dataIds.has(item.id)).every(item=>item.ready);
        const busy=isSubmittingRegistration||preflightBusy;
        nav.setAttribute('aria-label',t('Tahap pendaftaran','Registration steps'));
        nav.querySelectorAll('[data-registration-step]').forEach(button=>{
            const step=button.dataset.registrationStep,current=step===activeStep;
            button.disabled=busy||step!=='service'&&!selected||step==='review'&&!review&&el('btn-review-registration').disabled;
            if(current)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
            const done=step==='service'?selected:step==='data'?dataReady:step==='files'?filesReady:false;
            button.classList.toggle('is-complete',done);
            setText(button.querySelector('.registration-step-number'),done&&!current?'✓':String(steps.indexOf(step)+1));
        });
        setText(el('registration-selected-service'),selected?systemText(type):t('Mulai dari layanan yang Anda butuhkan','Start with the service you need'));
        setText(el('registration-companion-help'),selected?review?t('Periksa data dan isi berkas sebelum konfirmasi. Pengajuan dikirim hanya melalui Konfirmasi & Kirim.','Review your details and file contents before confirming. Only Confirm & Send submits your request.'):t('Gunakan daftar ini untuk melihat isian dan berkas yang masih perlu dilengkapi.','Use this list to find the details and files you still need to complete.'):t('Persyaratan dan format berkas akan tampil sesuai layanan yang dipilih.','Requirements and file formats will appear for the selected service.'));
        el('registration-shell').classList.toggle('registration-is-review',review);
        el('registration-shell').classList.toggle('registration-has-service',selected);
        el('registration-stepper').dataset.currentStep=activeStep;
        el('registration-main').querySelectorAll('[data-registration-files-next]').forEach(button=>button.disabled=busy||!!activeSameType(type)||!!(type&&serviceAvailability(type)));
    }
    function focusField(field){
        if(!field)return;
        field.scrollIntoView({block:'center',behavior:'instant'});
        field.focus({preventScroll:true});
    }
    function navigate(step){
        if(currentUser.role!=='mhs'||!getSessionToken()||isSubmittingRegistration||preflightBusy||!steps.includes(step))return;
        const type=el('reg-jenis-utama').value;if(step!=='service'&&!SERVICE_TYPES.includes(type))return;
        if(step==='review'){
            if(!el('registration-review').hidden)focusField(el('review-heading'));
            else if(!el('btn-review-registration').disabled)el('dynamic-exam-form').requestSubmit();
            return;
        }
        if(!el('registration-review').hidden)editRegistration();
        activeStep=step;refresh();
        focusField(step==='service'?el('reg-jenis-utama'):el((step==='data'?registrationTextSpecs(type):registrationSpecs(type))[0]?.[0]));
    }
    function nextFiles(){
        if(currentUser.role!=='mhs'||isSubmittingRegistration||preflightBusy||!registrationServiceAllowed())return;
        const type=el('reg-jenis-utama').value;let first='';
        registrationTextSpecs(type).forEach(([id])=>{const error=registrationTextIssue(id);setFieldError(id,error);if(error&&!first)first=id;});
        if(first){activeStep='data';refresh();focusField(el(first));return;}
        navigate('files');
    }
    function reset(){generation++;activeStep='service';previousType='';refresh();}
    document.addEventListener('click',event=>{
        const step=event.target.closest('[data-registration-step]');if(step&&!step.disabled)navigate(step.dataset.registrationStep);
        if(event.target.closest('[data-registration-files-next]'))nextFiles();
    });
    document.addEventListener('focusin',event=>{
        if(event.target.closest('#registration-data-step'))activeStep='data';
        else if(event.target.closest('#registration-document-step'))activeStep='files';
        else if(event.target.id==='reg-jenis-utama')activeStep='service';
        else if(event.target.closest('#registration-review'))activeStep='review';
        else return;
        refresh();
    });
    ['input','change'].forEach(name=>document.addEventListener(name,event=>{if(event.target.closest('#pendaftaran'))refresh();}));
    window.IPCOSRegistration=Object.freeze({refresh,reset,navigate,revision:()=>generation});
    refresh();
})();
