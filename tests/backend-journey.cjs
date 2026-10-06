const {test,beforeEach} = require('node:test');
const assert = require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
let properties,session,active,locked,lockAllowed,failWrite,contents,ctx;
beforeEach(()=>{
    properties={};session={role:'mhs',nim:'A'};active=true;locked=false;lockAllowed=true;failWrite=false;contents=[];
    ctx={Uint8Array,PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key],setProperty:(key,value)=>{if(failWrite)throw Error('Storage full');properties[key]=value},getProperties:()=>({...properties})})},
        Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algorithm,value)=>[...crypto.createHash(algorithm).update(value).digest()],newBlob:value=>({getBytes:()=>Buffer.from(value)})},
        LockService:{getScriptLock:()=>({tryLock:()=>{locked=lockAllowed;return lockAllowed},releaseLock:()=>{locked=false}})},
        getSession:()=>session,auditStudent:nim=>active && ['A','B'].includes(nim)?{NIM:nim}:null,featureRegistrations:()=>[{nim:'A'}],getDataForSession:()=>({contents})};
    vm.createContext(ctx);vm.runInContext(fs.readFileSync('document-checks.js','utf8')+'\n'+fs.readFileSync('backend/Journey.gs','utf8'),ctx);
});
test('The deployable Features module contains the exact tested journey and document helpers',()=>{
    const deployed=fs.readFileSync('backend/Features.gs','utf8');
    assert(deployed.endsWith(fs.readFileSync('document-checks.js','utf8')+'\n'+fs.readFileSync('backend/Journey.gs','utf8')));
});
test('Only own student progress can be read or changed; unauthenticated and admin writes denied',()=>{
    assert.equal(ctx.journeyDispatch({action:'get_journey'}).journey.exists,false);
    assert.throws(()=>ctx.journeyDispatch({action:'save_progress',nim:'B',changes:{m1:true}}),/lain/);
    session=null;assert.throws(()=>ctx.journeyDispatch({action:'get_journey'}),/Sesi/);
    session={role:'admin'};assert.throws(()=>ctx.journeyDispatch({action:'save_progress',nim:'A',changes:{m1:true}}),/Hanya/);
    assert.equal(Object.keys(properties).length,0);
});
test('Patch updates merge across devices, retain unrelated checks and support unchecking',()=>{
    ctx.journeyDispatch({action:'save_progress',changes:{m1:true}});
    ctx.journeyDispatch({action:'save_progress',changes:{s1:true}});
    const result=ctx.journeyDispatch({action:'save_progress',changes:{m1:false}}).journey;
    assert.equal(result.checks.m1,false);assert.equal(result.checks.s1,true);assert.equal(result.revision,3);assert.equal(locked,false);
});
test('Inactive students, invalid points and malformed changes cannot alter saved progress',()=>{
    for(const changes of [{bogus:true},{m1:'true'},[],{},JSON.parse('{"__proto__":true}')]) assert.throws(()=>ctx.journeyDispatch({action:'save_progress',changes}));
    active=false;assert.throws(()=>ctx.journeyDispatch({action:'save_progress',changes:{m1:true}}),/aktif/);assert.equal(Object.keys(properties).length,0);
});
test('Admin can read a known student but not arbitrary accounts; students remain isolated',()=>{
    ctx.journeyDispatch({action:'save_progress',changes:{m1:true}});
    session={role:'mhs',nim:'B'};assert.equal(ctx.journeyDispatch({action:'get_journey'}).journey.exists,false);
    session={role:'admin'};assert.equal(ctx.journeyDispatch({action:'get_journey',nim:'A'}).journey.checks.m1,true);
    assert.throws(()=>ctx.journeyDispatch({action:'get_journey',nim:'missing'}),/tidak ditemukan/);
});
test('Admin-edited checklist IDs are accepted; removed IDs are rejected and stale checks pruned',()=>{
    ctx.journeyDispatch({action:'save_progress',changes:{m1:true}});
    contents=[{Tipe:'magang',DataJSON:JSON.stringify([{items:[{id:'custom'}]}])}];
    assert.throws(()=>ctx.journeyDispatch({action:'save_progress',changes:{m1:false}}));
    const result=ctx.journeyDispatch({action:'save_progress',changes:{custom:true}}).journey;
    assert.equal(result.checks.custom,true);assert.equal(result.checks.m1,undefined);
});
test('Lock contention and storage failures do not produce successful acknowledgements',()=>{
    lockAllowed=false;assert.throws(()=>ctx.journeyDispatch({action:'save_progress',changes:{m1:true}}),/sedang/);
    lockAllowed=true;failWrite=true;assert.throws(()=>ctx.journeyDispatch({action:'save_progress',changes:{m1:true}}),/Storage/);assert.equal(locked,false);assert.equal(Object.keys(properties).length,0);
});
test('Corrupt preparation is not silently overwritten and cannot break transaction snapshot',()=>{
    properties[ctx.journeyPropertyKey('A')]='broken';assert.throws(()=>ctx.journeyDispatch({action:'save_progress',changes:{m1:true}}));
    assert.equal(ctx.journeySnapshot({role:'mhs',nim:'A'}).journeyUnavailable,true);assert.equal(locked,false);
});
test('Progress backup includes only progress properties, omitting sessions and secrets',()=>{
    ctx.journeyDispatch({action:'save_progress',changes:{m1:true}});properties.SESSION_TOKEN='private';properties.ADMIN_SECRET='private';
    assert.equal(Object.keys(ctx.journeyBackup()).length,1);assert.equal(ctx.journeyBackup().ADMIN_SECRET,undefined);
});
test('Server enforces service-specific formats beyond browser validation',()=>{
    assert.throws(()=>ctx.featureCheckSubmissionFiles([{fileName:'x.docx'}],'Proposal'),/Format/);
    ctx.featureCheckSubmissionFiles([{fileName:'x.pdf'},{fileName:'draft.docx'}],'Outline');
    assert.throws(()=>ctx.featureCheckDocumentBytes({fileName:'x.pdf',bytes:Buffer.from('renamed text')}),/tidak sesuai/);
});
