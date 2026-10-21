const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./next-backend.fixture.cjs');let f;
const url='https://drive.google.com/file/d/current/view';
beforeEach(()=>{f=fixture();f.rows[1][7]='Pending';f.rows[1][6]='<a href="'+url+'">Form ACC Seminar Proposal</a>';f.rows[1][8]=JSON.stringify([{role:'mhs',message:'Submitted',documents:[{label:'Form ACC Seminar Proposal',url,fileName:'acc.pdf',version:1}]}]);});
const state=token=>f.ctx.nextDispatch({action:'get_document_review',id:'fields',token:token===undefined?'admin':token});
const review=()=>({action:'save_document_review',id:'fields',token:'admin',version:state().version,requestId:'review-test-123',reviews:[{url,label:'Form ACC Seminar Proposal',status:'revision',note:'Use a signed document.'}]});
test('Review reads require ownership and active student; mutations are admin-only',()=>{
    assert.equal(state('student-A').status,'success');assert.throws(()=>state('student-B'));assert.throws(()=>state(''));
    f.state.active=false;assert.throws(()=>state('student-A'));assert.throws(()=>f.ctx.nextDispatch({...review(),token:'student-A'}));
    for(const action of ['get_document_review','save_document_review','archive_request','restore_request'])assert.throws(()=>f.ctx.nextDispatch({action,id:'fields',token:''}));
});
test('Saved per-document reviews preserve every academic field and do not supersede correction instructions',()=>{
    const before=f.rows[1].slice(),result=f.ctx.nextDispatch(review());assert.equal(result.reviews[0].note,'Use a signed document.');
    f.rows[1].forEach((value,i)=>{if(i!==8)assert.equal(value,before[i]);});assert.equal(JSON.parse(f.rows[1][8]).at(-1).role,'system');assert.equal(f.state.created.length,0);
});
test('Wrong files, duplicates, invalid labels/statuses and missing correction reasons cannot be saved',()=>{
    const original=f.rows[1][8];for(const change of [{url:'https://evil.example/private.pdf'},{label:'Injected'},{status:'Accepted'},{status:'revision',note:''},{note:'x'.repeat(2001)}])assert.throws(()=>f.ctx.nextDispatch({...review(),reviews:[{...review().reviews[0],...change}]}));
    assert.throws(()=>f.ctx.nextDispatch({...review(),reviews:[review().reviews[0],review().reviews[0]]}));assert.equal(f.rows[1][8],original);
});
const pageReference=(overrides={})=>({page:5,pages:12,fingerprint:'a'.repeat(64),version:1,...overrides});
const referencedReview=(pageRef=pageReference())=>{const payload=review();payload.reviews[0].pageRef=pageRef;return payload;};
const plain=value=>JSON.parse(JSON.stringify(value));
test('PDF page references round-trip to the owning student without changing academic data or reading Drive',()=>{
    const before=f.rows.map(row=>row.slice()),payload=referencedReview({...pageReference(),extra:'discard this'});
    const result=f.ctx.nextDispatch(payload);assert.deepEqual(plain(result.reviews[0].pageRef),pageReference());
    assert.deepEqual(plain(state('student-A').reviews),plain(result.reviews));assert.throws(()=>state('student-B'));
    assert.deepEqual(JSON.parse(f.rows[1][8]).at(-1).reviews[0].pageRef,pageReference());
    f.rows[1].forEach((value,i)=>{if(i!==8)assert.equal(value,before[1][i]);});assert.deepEqual(f.rows[2],before[2]);assert.equal(f.state.created.length,0);
    for(const token of ['admin','student-A'])assert.equal(f.ctx.nextDispatch({action:'get_review_capabilities',token}).notePageReferences,true);
    assert.throws(()=>f.ctx.nextDispatch({action:'get_review_capabilities',token:''}));
});
test('Malformed PDF references, out-of-range pages and mismatched versions fail before any write',()=>{
    const before=plain(f.rows),invalid=[false,'page 5',[],{},
        pageReference({page:0}),pageReference({page:1.5}),pageReference({page:'5'}),pageReference({page:13}),pageReference({page:100001,pages:100001}),
        pageReference({pages:0}),pageReference({pages:12.5}),pageReference({pages:'12'}),pageReference({pages:100001}),
        pageReference({fingerprint:'a'.repeat(63)}),pageReference({fingerprint:'A'.repeat(64)}),pageReference({fingerprint:'g'.repeat(64)}),pageReference({fingerprint:123}),
        pageReference({version:0}),pageReference({version:2}),pageReference({version:-1}),pageReference({version:1.5}),pageReference({version:'1'})];
    for(const pageRef of invalid){assert.throws(()=>f.ctx.nextDispatch(referencedReview(pageRef)),/halaman|Versi/);assert.deepEqual(f.rows,before);assert.equal(f.state.locked,false);}
});
test('References use the matched document metadata version and legacy unversioned files use zero',()=>{
    for(const [index,version] of ['2',0,-1,1.5,'unknown',null].entries()){
        const logs=JSON.parse(f.rows[1][8]);logs[0].documents[0].version=version;f.rows[1][8]=JSON.stringify(logs);
        const expected=version==='2'?2:0,payload=referencedReview(pageReference({version:expected}));payload.requestId='reference-version-'+index;
        assert.equal(f.ctx.nextDispatch(payload).reviews[0].pageRef.version,expected);
    }
    f.rows[1][8]=JSON.stringify([{role:'mhs',message:'Legacy submission'}]);
    assert.equal(f.ctx.nextDispatch(referencedReview(pageReference({version:0}))).reviews[0].pageRef.version,0);
});
test('Clearing a reference preserves the review note and unreferenced reviews keep their compatible shape',()=>{
    f.ctx.nextDispatch(referencedReview());const payload=referencedReview(null);payload.requestId='reference-clear-123';
    const result=f.ctx.nextDispatch(payload);assert.deepEqual(plain(result.reviews[0]),review().reviews[0]);assert.equal(Object.hasOwn(result.reviews[0],'pageRef'),false);
    assert.equal(Object.hasOwn(state('student-A').reviews[0],'pageRef'),false);
    const without=review();without.requestId='reference-unset-123';assert.equal(Object.hasOwn(f.ctx.nextDispatch(without).reviews[0],'pageRef'),false);
});
test('Referenced-note retries are idempotent and concurrent or changed references are rejected',()=>{
    const stale=referencedReview();f.rows[1][5]='Concurrent academic update';assert.throws(()=>f.ctx.nextDispatch(stale),/berubah/);
    const payload=referencedReview(),before=f.rows[1].slice();f.state.writeThenThrow=true;
    assert.equal(f.ctx.nextDispatch(payload).status,'success');const count=JSON.parse(f.rows[1][8]).length;
    assert.deepEqual(plain(f.ctx.nextDispatch(payload).reviews[0].pageRef),pageReference());assert.equal(JSON.parse(f.rows[1][8]).length,count);
    for(const change of [{page:6},{fingerprint:'b'.repeat(64)},{version:0}])assert.throws(()=>f.ctx.nextDispatch({...payload,reviews:[{...payload.reviews[0],pageRef:pageReference(change)}]}),/berbeda/);
    f.rows[1].forEach((value,i)=>{if(i!==8)assert.equal(value,before[i]);});assert.equal(f.state.locked,false);
});
test('Review versions prevent overwriting concurrent updates and old documents do not inherit reviews',()=>{
    const stale=review();f.rows[1][5]='Changed title';assert.throws(()=>f.ctx.nextDispatch(stale),/berubah/);f.ctx.nextDispatch(review());
    const logs=JSON.parse(f.rows[1][8]);logs.push({documents:[{label:'Form ACC Seminar Proposal',url:'https://drive.google.com/file/d/new/view',fileName:'new.pdf',version:2}]});f.rows[1][6]+='<a href="https://drive.google.com/file/d/new/view">New</a>';f.rows[1][8]=JSON.stringify(logs);
    assert.equal(state().reviews.length,0);assert.throws(()=>f.ctx.nextDispatch({...review(),requestId:'review-new-123'}),/terbaru/);
});
test('Failed writes never acknowledge success; lost acknowledgements and retries do not duplicate review history',()=>{
    const payload=review(),original=f.rows[1][8];f.state.failWrite=true;assert.throws(()=>f.ctx.nextDispatch(payload));assert.equal(f.rows[1][8],original);
    f.state.failWrite=false;f.state.writeThenThrow=true;assert.equal(f.ctx.nextDispatch(payload).status,'success');const count=JSON.parse(f.rows[1][8]).length;
    assert.equal(f.ctx.nextDispatch(payload).status,'success');assert.equal(JSON.parse(f.rows[1][8]).length,count);assert.throws(()=>f.ctx.nextDispatch({...payload,reviews:[{...payload.reviews[0],note:'Different'}]}),/berbeda/);assert.equal(f.state.locked,false);
});
test('Only completed requests can be archived; restore preserves files, status, identity and dates',()=>{
    const payload=()=>({action:'archive_request',token:'admin',id:'fields',version:state().version,requestId:'archive-test-123',reason:'End of semester'});
    assert.throws(()=>f.ctx.nextDispatch(payload()),/selesai/);f.rows[1][7]='Accepted';const before=f.rows[1].slice(),save=payload();
    assert.throws(()=>f.ctx.nextDispatch({...save,token:'student-A'}));assert.throws(()=>f.ctx.nextDispatch({...save,reason:''}));assert.throws(()=>f.ctx.nextDispatch({...save,version:'stale'}));
    assert.equal(f.ctx.nextDispatch(save).archived,true);assert.equal(state('student-A').archived,true);
    const count=JSON.parse(f.rows[1][8]).length;f.ctx.nextDispatch(save);assert.equal(JSON.parse(f.rows[1][8]).length,count);
    const restored=f.ctx.nextDispatch({...payload(),action:'restore_request',version:state().version,requestId:'restore-test-123'});assert.equal(restored.archived,false);
    f.rows[1].forEach((value,i)=>{if(i!==8)assert.equal(value,before[i]);});assert.equal(f.state.created.length,0);assert.equal(f.rows.length,3);
});
test('Closed requests cannot receive new review metadata and student-facing state does not expose other records',()=>{
    f.rows[1][7]='Accepted';assert.throws(()=>f.ctx.nextDispatch(review()),/menunggu/);const result=state('student-A');assert(!JSON.stringify(result).includes('Data mahasiswa lain'));
});

test('Archiving a legacy plain-text history preserves the original note and backup-compatible row',()=>{f.rows[1][7]='Accepted';f.rows[1][8]='Legacy note must stay';const result=f.ctx.nextDispatch({action:'archive_request',token:'admin',id:'fields',version:state().version,requestId:'archive-legacy-123',reason:'Semester archive'});assert.equal(JSON.parse(result.note)[0].message,'Legacy note must stay');assert.equal(f.rows[1][7],'Accepted');});

function sessionData(){
    const fs=require('node:fs'),vm=require('node:vm');Object.assign(f.ctx,{SHEET_MAHASISWA:'Mahasiswa',SHEET_PENGUMUMAN:'Pengumuman',SHEET_KONTEN:'KontenWeb',journeySnapshot:()=>({}),featureBackupStatus:()=>null});vm.runInContext(fs.readFileSync('backend/SessionData.gs','utf8'),f.ctx);return f.ctx.getDataForSession(f.ctx.getSession('admin'));
}
test('Session data emits a raw-row version before removing the supervisor display suffix',()=>{
    f.rows[1][5]+="<br><br><b style='color:#E03F4F;'>Dosen Pembimbing:</b> Supervisor";
    const before=f.rows[1].slice(),raw=f.records()[0],item=sessionData().registrations[0];
    assert.equal(item.reviewVersion,f.ctx.nextRevisionVersion(raw));assert.equal(item.detail,'<b>Judul:</b> Judul awal');assert.equal(item.dospem,'Supervisor');
    const result=f.ctx.nextDispatch({...review(),version:item.reviewVersion});assert.equal(result.status,'success');f.rows[1].forEach((value,i)=>{if(i!==8)assert.equal(value,before[i]);});
});
test('Raw versions still detect changes hidden by display formatting and status whitespace',()=>{
    f.rows[1][7]='Resubmitted';f.rows[1][5]+="<br><br><b style='color:#E03F4F;'>Dosen Pembimbing:</b> Supervisor";
    const token=sessionData().registrations[0].reviewVersion;f.rows[1][5]=f.rows[1][5].replace('Supervisor','Changed supervisor');
    assert.throws(()=>f.ctx.nextDispatch({...review(),version:token}),/berubah/);assert.notEqual(sessionData().registrations[0].reviewVersion,token);
    f.rows[1][7]='Pending ';assert.equal(sessionData().registrations[0].reviewVersion,f.ctx.nextRevisionVersion(f.records()[0]));
});
test('Student session tokens describe only that student’s visible requests',()=>{
    sessionData();const scoped=f.ctx.getDataForSession(f.ctx.getSession('student-A'));assert.equal(scoped.registrations.length,1);assert.equal(scoped.registrations[0].id,'fields');assert.equal(scoped.students.length,0);assert(!JSON.stringify(scoped.registrations).includes('Data mahasiswa lain'));
});
