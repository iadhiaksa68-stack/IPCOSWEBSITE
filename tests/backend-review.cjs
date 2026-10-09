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
