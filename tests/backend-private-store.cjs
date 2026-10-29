const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
// Synthetic Apps Script services: one spreadsheet with an optional private sheet, Script Properties and a cache.
function setup({withSheet=false}={}){
    const properties={},cache=new Map(),sheets=new Map();
    function fakeSheet(){
        const cells=[];
        const sheet={hidden:false,
            getLastRow:()=>cells.length,
            getRange:(a,c,nr=1,nc=1)=>{if(typeof a==='string')return {setNumberFormat:()=>{}};return {
                getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>cells[a-1+i]?.[c-1+j]??'')),
                setValues:values=>values.forEach((row,i)=>{cells[a-1+i]=cells[a-1+i]||[];row.forEach((value,j)=>cells[a-1+i][c-1+j]=value);})};},
            setFrozenRows:()=>{},hideSheet:()=>{sheet.hidden=true;},cells};
        return sheet;
    }
    const spreadsheet={getSheetByName:name=>sheets.get(name)||null,insertSheet:name=>{const sheet=fakeSheet();sheets.set(name,sheet);return sheet;}};
    const props={getProperty:key=>properties[key]??null,setProperty:(key,value)=>{properties[key]=String(value);},deleteProperty:key=>{delete properties[key];},getProperties:()=>({...properties})};
    const logins=[];
    const ctx={console,SHEET_ID:'fixture',
        SpreadsheetApp:{openById:()=>spreadsheet},PropertiesService:{getScriptProperties:()=>props},
        CacheService:{getScriptCache:()=>({get:key=>cache.get(key)??null,put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})},
        LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
        Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,value)=>[...crypto.createHash('sha256').update(String(value)).digest()],newBlob:value=>({getBytes:()=>[...Buffer.from(String(value))]})},
        handleAdminLogin:data=>{logins.push(data.username);return data.password==='right'?{status:'success',token:'t'}:{status:'error',message:'Username atau Password Admin salah!'};}};
    vm.createContext(ctx);vm.runInContext(fs.readFileSync('backend/Next.gs','utf8'),ctx);
    if(withSheet)ctx.migratePrivateDataToSheet();
    return {ctx,properties,sheets,cache,logins};
}
test('without the private sheet, per-student data stays in Script Properties',()=>{
    const {ctx,properties}=setup();
    ctx.ipcosPrivateProps().setProperty('IPCOS_DRAFT_abc','{"a":1}');
    assert.equal(properties.IPCOS_DRAFT_abc,'{"a":1}');
});
test('migration moves only per-student keys and later writes go to the hidden sheet',()=>{
    const {ctx,properties,sheets}=setup();
    Object.assign(properties,{IPCOS_PROGRESS_x:'{"p":1}',IPCOS_ACADEMIC_y:'{"l":2}',IPCOS_INTL_META:'{"m":3}',IPCOS_SERVICE_CONFIG:'{}',IPCOS_HEALTH_2026_10_29:'{}'});
    const result=ctx.migratePrivateDataToSheet();
    assert.equal(result.moved,3);
    assert.deepEqual(Object.keys(properties).sort(),['IPCOS_HEALTH_2026_10_29','IPCOS_SERVICE_CONFIG']);
    const sheet=sheets.get('IPCOS_DataPribadi');assert.equal(sheet.hidden,true);
    const store=ctx.ipcosPrivateProps();
    assert.equal(store.getProperty('IPCOS_PROGRESS_x'),'{"p":1}');
    store.setProperty('IPCOS_PROGRESS_x','{"p":2}');store.setProperty('IPCOS_DRAFT_new','{"d":1}');store.setProperty('IPCOS_SERVICE_CONFIG','{"s":1}');
    assert.equal(ctx.ipcosPrivateProps().getProperty('IPCOS_PROGRESS_x'),'{"p":2}');
    assert.equal(properties.IPCOS_DRAFT_new,undefined);assert.equal(properties.IPCOS_SERVICE_CONFIG,'{"s":1}');
    store.deleteProperty('IPCOS_DRAFT_new');
    const fresh=ctx.ipcosPrivateProps();
    assert.equal(fresh.getProperty('IPCOS_DRAFT_new'),null);
    assert.equal(fresh.getProperties().IPCOS_DRAFT_new,undefined);
    assert.equal(fresh.getProperties().IPCOS_ACADEMIC_y,'{"l":2}');
    assert.equal(ctx.migratePrivateDataToSheet().moved,0,'migration is idempotent');
});
test('an unmigrated property is still readable and moves on its next write',()=>{
    const {ctx,properties}=setup({withSheet:true});
    properties.IPCOS_DRAFT_late='{"old":true}';
    const store=ctx.ipcosPrivateProps();
    assert.equal(store.getProperty('IPCOS_DRAFT_late'),'{"old":true}');
    store.setProperty('IPCOS_DRAFT_late','{"old":false}');
    assert.equal(properties.IPCOS_DRAFT_late,undefined);
    assert.equal(ctx.ipcosPrivateProps().getProperty('IPCOS_DRAFT_late'),'{"old":false}');
});
test('admin login locks after five failures and success clears the counter',()=>{
    const {ctx,logins,cache}=setup();
    for(let i=0;i<5;i++)assert.equal(ctx.nextDispatch({action:'admin_login',username:'Admin',password:'wrong'}).status,'error');
    const locked=ctx.nextDispatch({action:'admin_login',username:'admin',password:'right'});
    assert.match(locked.message,/15 menit/);assert.equal(logins.length,5,'locked attempts never reach the password check');
    cache.clear();
    assert.equal(ctx.nextDispatch({action:'admin_login',username:'admin',password:'right'}).status,'success');
    assert.equal([...cache.keys()].some(key=>key.startsWith('IPCOS_ADMIN_FAIL_')&&key!=='IPCOS_ADMIN_FAIL_ALL'),false);
});
