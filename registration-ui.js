/* A single active panel preserves the original inputs and selected File objects. */
(() => {
    'use strict';
    const el=id=>document.getElementById(id),t=(id,en)=>uxText(id,en);
    const steps=['service','data','files','review'];
    let activeStep='service',previousType='',generation=0;
    const panels={service:'registration-service-step',data:'registration-data-step',files:'registration-document-step'};
    function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
    function refresh(){
        window.IPCOSUploads?.refresh();
        const select=el('reg-jenis-utama'),nav=el('registration-stepper');if(!select||!nav)return;
        const type=select.value,selected=SERVICE_TYPES.includes(type),review=!el('registration-review').hidden;
        if(previousType!==type){generation++;activeStep='service';}
        if(!selected)activeStep='service';
        else if(review)activeStep='review';
        else if(activeStep==='review')activeStep='data';
        previousType=type;
        const requirements=selected?registrationRequirements(type):[],dataIds=new Set(selected?registrationTextSpecs(type).map(([id])=>id):[]);
        const dataReady=selected&&requirements.filter(item=>dataIds.has(item.id)).every(item=>item.ready);
        const filesReady=selected&&requirements.filter(item=>!dataIds.has(item.id)).every(item=>item.ready);
        const status=el('form-submit-status');
        if(status.dataset.registrationValidation&&(activeStep==='service'||activeStep==='data'&&dataReady||activeStep==='files'&&dataReady&&filesReady)){
            status.textContent='';delete status.dataset.registrationValidation;
        }
        const busy=isSubmittingRegistration||preflightBusy,blocked=selected&&!!(activeSameType(type)||serviceAvailability(type));
        nav.setAttribute('aria-label',t('Tahap pendaftaran','Registration steps'));
        nav.querySelectorAll('[data-registration-step]').forEach(button=>{
            const step=button.dataset.registrationStep,current=step===activeStep;
            button.disabled=busy||step!=='service'&&(!selected||blocked);
            if(current)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
            button.setAttribute('aria-controls',step==='review'?'registration-review':panels[step]);
            const done=step==='service'?selected:step==='data'?dataReady:step==='files'?filesReady:false;
            button.classList.toggle('is-complete',done);
            setText(button.querySelector('.registration-step-number'),done&&!current?'✓':String(steps.indexOf(step)+1));
        });
        Object.entries(panels).forEach(([step,id])=>el(id).hidden=step!==activeStep);
        el('dynamic-exam-form').hidden=activeStep==='service';
        el('registration-shell').dataset.currentStep=activeStep;
        nav.dataset.currentStep=activeStep;
        el('registration-shell').classList.toggle('registration-is-review',review);
        el('registration-shell').classList.toggle('registration-has-service',selected);
        el('registration-service-next').disabled=busy||!selected||blocked;
        el('registration-service-actions').hidden=activeStep!=='service';
        el('registration-shell').classList.toggle('registration-service-blocked',blocked);
        const next=el('registration-data-next'),back=el('registration-back');
        next.hidden=activeStep!=='data';next.disabled=busy||blocked;
        back.hidden=activeStep==='service';back.disabled=busy;
        if(el('btn-edit-registration'))el('btn-edit-registration').disabled=busy;
        setText(back.querySelector('span'),activeStep==='data'?t('Kembali ke Layanan','Back to Service'):activeStep==='files'?t('Kembali ke Data','Back to Details'):t('Kembali ke Berkas','Back to Files'));
        el('btn-review-registration').hidden=activeStep!=='files';
        el('btn-review-registration').disabled=busy||blocked;
        setText(el('registration-selected-service'),selected?systemText(type):t('Mulai dari layanan yang Anda butuhkan','Start with the service you need'));
        const help={
            service:t('Pilih layanan, lalu lanjutkan untuk mengisi data pengajuan.','Choose a service, then continue to your request details.'),
            data:t('Lengkapi data pada tahap ini. Anda dapat kembali tanpa kehilangan isian.','Complete this stage. You can go back without losing your inputs.'),
            files:t('Pilih dan periksa berkas. Berkas tetap tersedia saat berpindah tahap dalam tab ini.','Choose and check your files. Selected files stay available when moving between stages in this tab.'),
            review:t('Periksa data dan isi berkas. Pengajuan dikirim hanya melalui Konfirmasi & Kirim.','Check your details and file contents. Only Confirm & Send submits your request.')
        };
        setText(el('registration-companion-help'),help[activeStep]);
    }
    function focusField(field){
        if(!field)return;
        field.scrollIntoView({block:'center',behavior:'instant'});
        field.focus({preventScroll:true});
    }
    function allowed(){return currentUser.role==='mhs'&&!!getSessionToken()&&!isSubmittingRegistration&&!preflightBusy;}
    function reveal(step){
        if(!el('registration-review').hidden)editRegistration();
        activeStep=step;refresh();
    }
    function focus(id){
        if(!allowed())return;
        const field=el(id);if(!field)return;
        const step=id==='reg-jenis-utama'?'service':field.closest('#registration-data-step')?'data':field.closest('#registration-document-step')?'files':null;
        if(!step)return;
        reveal(step);focusField(field);
    }
    function validData(){
        const type=el('reg-jenis-utama').value;let first='';
        registrationTextSpecs(type).forEach(([id])=>{const error=registrationTextIssue(id);setFieldError(id,error);if(error&&!first)first=id;});
        if(first){focus(first);return false;}
        return true;
    }
    function navigate(step){
        if(!allowed()||!steps.includes(step))return;
        const type=el('reg-jenis-utama').value;
        if(step!=='service'){
            if(!SERVICE_TYPES.includes(type)){focus('reg-jenis-utama');return;}
            const returning=steps.indexOf(step)<steps.indexOf(activeStep);
            if(!returning&&!registrationServiceAllowed()){reveal('service');focusField(el('reg-jenis-utama'));return;}
        }
        if(step==='review'){
            if(!el('registration-review').hidden){focusField(el('review-heading'));return;}
            // Full review validates all fields and reveals the first failing panel.
            reviewRegistration(new Event('submit',{cancelable:true}));return;
        }
        if(step==='files'&&steps.indexOf(activeStep)<2&&!validData())return;
        reveal(step);
        focusField(step==='service'?el('reg-jenis-utama'):el((step==='data'?registrationTextSpecs(type):registrationSpecs(type))[0]?.[0]));
    }
    function next(){if(activeStep==='service')navigate('data');else if(activeStep==='data')navigate('files');}
    function back(){navigate(steps[Math.max(0,steps.indexOf(activeStep)-1)]);}
    function submit(event){
        // Enter advances through the current stage; confirmation remains explicit.
        if(activeStep==='service'||activeStep==='data'){event.preventDefault();next();return;}
        reviewRegistration(event);
    }
    function reset(){generation++;activeStep='service';previousType='';refresh();}
    document.addEventListener('click',event=>{
        const step=event.target.closest('[data-registration-step]');if(step&&!step.disabled)navigate(step.dataset.registrationStep);
        if(event.target.closest('[data-registration-files-next],#registration-service-next'))next();
        if(event.target.closest('#registration-back'))back();
    });
    ['input','change'].forEach(name=>document.addEventListener(name,event=>{if(event.target.closest('#pendaftaran'))refresh();}));
    window.IPCOSRegistration=Object.freeze({refresh,reset,navigate,focus,submit,revision:()=>generation,current:()=>activeStep});
    refresh();
})();
