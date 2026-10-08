const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fixture=require('./next-backend.fixture.cjs'),{pdf}=require('./fixtures.cjs');
let f;beforeEach(()=>f=fixture());
const data=()=>({action:'save_form_draft',token:'student-A',revision:0,requestId:'draft-request-1',fields:{'reg-jenis-utama':'Proposal','reg-judul':'Judul draf'}});
function form(){return f.ctx.nextDispatch({action:'get_revision_form',token:'student-A',id:'fields'});}
function revision(){return {action:'revise_request',token:'student-A',id:'fields',requestId:'revision-request-1',version:form().version,fields:{title:'Judul baru'},noteText:'Judul diperbaiki',files:[]};}
test('Cloud drafts remain owner-only; admin, expired sessions and inactive students cannot read or write',()=>{
    f.ctx.nextDispatch(data());assert.equal(f.ctx.nextDispatch({action:'get_form_draft',token:'student-B',nim:'A'}).draft.exists,false);
    for(const token of ['admin','',null])assert.throws(()=>f.ctx.nextDispatch({...data(),token}));f.state.active=false;assert.throws(()=>f.ctx.nextDispatch(data()));
    assert(!Object.keys(f.state.properties).some(key=>key==='IPCOS_DRAFT_A'));
});
test('Cross-device conflicts preserve the committed draft; replay and clearing are versioned',()=>{
    const saved=f.ctx.nextDispatch(data());assert.equal(saved.draft.revision,1);assert.equal(f.ctx.nextDispatch(data()).draft.revision,1);
    const conflict=f.ctx.nextDispatch({...data(),requestId:'draft-request-2',fields:{'reg-judul':'Different device'}});assert.equal(conflict.status,'conflict');assert.equal(conflict.draft.fields['reg-judul'],'Judul draf');
    const cleared=f.ctx.nextDispatch({...data(),revision:1,requestId:'clear-request-1',fields:{}});assert.equal(cleared.draft.exists,false);assert.equal(cleared.draft.revision,2);
});
test('Malformed drafts, unsupported types and storage/lock failures never acknowledge success',()=>{
    for(const fields of [{secret:'x'},{'reg-judul':'x'.repeat(501)},{'reg-alasan-ganti':'x'.repeat(2001)},{'reg-jenis-utama':'Unknown'},[],{'reg-judul':42}])assert.throws(()=>f.ctx.nextDispatch({...data(),fields}));
    f.state.lockAllowed=false;assert.throws(()=>f.ctx.nextDispatch(data()));f.state.lockAllowed=true;f.state.failWrite=true;assert.throws(()=>f.ctx.nextDispatch(data()));assert.equal(f.state.locked,false);assert.equal(Object.keys(f.state.properties).length,0);
});
test('Expired drafts are not restored; corrupt cloud data is never silently overwritten',()=>{
    f.ctx.nextDispatch(data());const key=f.ctx.nextDraftKey('A'),saved=JSON.parse(f.state.properties[key]);saved.updatedAt='2020-01-01T00:00:00Z';f.state.properties[key]=JSON.stringify(saved);
    assert.equal(f.ctx.nextDispatch({action:'get_form_draft',token:'student-A'}).draft.exists,false);
    for(const fields of [[],{secret:'x'},{'reg-judul':42}]){const corrupt=JSON.stringify({...saved,fields});f.state.properties[key]=corrupt;assert.throws(()=>f.ctx.nextDispatch({...data(),revision:1}));assert.equal(f.state.properties[key],corrupt);}
    f.state.properties[key]='broken';assert.throws(()=>f.ctx.nextDispatch({...data(),revision:1}));assert.equal(f.state.properties[key],'broken');
});
test('Field-only corrections update the same request, preserve files and log escaped before/after values',()=>{
    const payload={...revision(),fields:{title:'<script>alert(1)</script> Judul baru'}};f.ctx.nextDispatch(payload);
    assert.equal(f.rows[1][0],'fields');assert.equal(f.rows[1][7],'Resubmitted');assert.equal(f.rows[1][6],'');assert.equal(f.state.created.length,0);assert(f.rows[1][5].includes('&lt;script&gt;'));
    const log=JSON.parse(f.rows[1][8]).at(-1);assert.equal(log.fieldChanges[0].before,'Judul awal');assert.equal(log.fieldChanges[0].after,payload.fields.title);assert.equal(f.rows[1].length,9);
});
test('Correction ownership, requested-field permission, current version and privileged field injection are checked server-side',()=>{
    const payload=revision();for(const change of [{token:'student-B'},{token:'admin'},{token:''},{version:'stale'},{fields:{title:'x',dospem:'Injected'}},{fields:{title:''}},{fields:{title:'x'.repeat(501)}},{fields:{title:'Judul awal'}}])assert.throws(()=>f.ctx.nextDispatch({...payload,...change}));
    f.rows[1][8]='[]';assert.throws(()=>f.ctx.nextDispatch(payload));assert.equal(f.rows[1][7],'Revision');
});
test('Requested document corrections still require every file, even alongside field corrections',()=>{
    f.rows[1][8]=JSON.stringify([{role:'admin',message:'Berkas yang perlu diperbaiki:\n- Isian pengajuan\n- Form ACC Seminar Proposal\n\nInstruksi:\nPerbaiki.'}]);const payload=revision();assert.throws(()=>f.ctx.nextDispatch(payload),/dokumen/);
    const file={label:'Form ACC Seminar Proposal',fileName:'proof.pdf',base64:pdf('proof').toString('base64')};f.ctx.nextDispatch({...payload,files:[file]});assert.equal(f.state.created.length,1);assert.equal(JSON.parse(f.rows[1][8]).at(-1).documents[0].version,2);
});
test('Failed correction commits discard only new uploads and preserve prior fields/status; lost acknowledgement retains committed files',()=>{
    const payload=revision(),file={label:'Form ACC Seminar Proposal',fileName:'proof.pdf',base64:pdf('proof').toString('base64')};f.state.failWrite=true;assert.throws(()=>f.ctx.nextDispatch({...payload,files:[file]}));assert(f.state.created[0].trashed);assert.equal(f.rows[1][5],'<b>Judul:</b> Judul awal');assert.equal(f.rows[1][7],'Revision');
    f.state.failWrite=false;f.state.writeThenThrow=true;assert.equal(f.ctx.nextDispatch({...payload,files:[file]}).status,'success');assert.equal(f.state.created[1].trashed,false);assert.equal(f.rows[1][7],'Resubmitted');assert.equal(f.state.locked,false);
});
test('Correction retry cannot duplicate history; changed payload reusing a request ID is rejected',()=>{
    const payload=revision();f.ctx.nextDispatch(payload);const count=JSON.parse(f.rows[1][8]).length;assert.equal(f.ctx.nextDispatch(payload).status,'success');assert.equal(JSON.parse(f.rows[1][8]).length,count);
    assert.throws(()=>f.ctx.nextDispatch({...payload,fields:{title:'Another edit'}}),/tercatat/);f.rows[1][7]='Accepted';assert.equal(f.ctx.nextDispatch(payload).recordStatus,'Accepted');
});
test('Supervisor-change fields can be corrected without assigning a supervisor or changing quota',()=>{
    f.rows[1][4]='Pergantian Pembimbing';f.rows[1][5]='<b>Dosen Lama:</b> Lama<br><b>Dosen Baru:</b> Baru<br><b>Alasan:</b> Awal';const payload={...revision(),fields:{oldSupervisor:'Lama',newSupervisor:'Usulan Baru',reason:'Alasan baru'}};
    assert.throws(()=>f.ctx.nextDispatch({...payload,fields:{...payload.fields,newSupervisor:'Lama'}}),/berbeda/);f.ctx.nextDispatch(payload);assert(!f.rows[1][5].includes('Dosen Pembimbing:'));assert(f.rows[1][5].includes('Usulan Baru'));
});
test('Health reports contain only allowlisted aggregate metadata; student access and event injection are denied',()=>{
    f.ctx.nextDispatch({action:'report_health',token:'student-A',code:'network',operation:'create',message:'SECRET NIM A private.pdf',fields:{title:'Secret'}});
    const raw=JSON.stringify(f.state.properties);assert(!raw.includes('SECRET'));assert(!raw.includes('private.pdf'));assert(!raw.includes('Secret'));assert(!raw.includes('student-A'));
    assert.throws(()=>f.ctx.nextDispatch({action:'get_health',token:'student-A'}));const result=f.ctx.nextDispatch({action:'get_health',token:'admin'});assert.equal(result.events[0].count,1);
    assert.throws(()=>f.ctx.nextDispatch({action:'report_health',token:'admin',code:'SECRET',operation:'create'}));assert.throws(()=>f.ctx.nextDispatch({action:'report_health',token:'admin',code:'network',operation:'admin_login'}));
});
test('Health reports are rate limited, retain seven days and leave unrelated properties untouched',()=>{
    const payload={action:'report_health',token:'student-A',code:'network',operation:'create'};f.state.properties.IPCOS_HEALTH_2020='unchanged';f.state.properties['IPCOS_HEALTH_2020-01-01']='{}';f.state.properties.SESSION='untouched';f.ctx.nextDispatch(payload);f.ctx.nextDispatch(payload);
    assert.equal(f.ctx.nextDispatch({action:'get_health',token:'admin'}).events[0].count,1);assert.equal(f.state.properties['IPCOS_HEALTH_2020-01-01'],undefined);assert.equal(f.state.properties.SESSION,'untouched');assert.equal(f.state.properties.IPCOS_HEALTH_2020,'unchanged');
});
test('All extension routes deny anonymous requests through the deployed doPost wrapper',()=>{
    for(const action of f.ctx.NEXT_ACTIONS||['get_form_draft','save_form_draft','get_revision_form','revise_request','report_health','get_health'])assert.equal(JSON.parse(f.ctx.doPost({postData:{contents:JSON.stringify({action,token:''})}}).content).status,'error');
});
