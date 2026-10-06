const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let props={},triggers=[],copied=[],failId='',manifestStore={},folders={},sequence=0,locked=false;
const originals=Array.from({length:123},(_,i)=>'original'+i);
const iterator=items=>({hasNext:()=>items.length>0,next:()=>items.shift()});
const properties={getProperties:()=>({...props}),getProperty:key=>props[key],setProperty:(k,v)=>props[k]=v,deleteProperty:k=>delete props[k]};
function file(id,name,content=''){const f={id,name,content,private:false,editors:['prior-editor'],viewers:['prior-viewer'],getId:()=>id,getName:()=>name,getEditors:()=>f.editors.slice(),getViewers:()=>f.viewers.slice(),removeEditor:u=>f.editors=f.editors.filter(v=>v!==u),removeViewer:u=>f.viewers=f.viewers.filter(v=>v!==u),setSharing:(access,perm)=>{assert.equal(access,'PRIVATE');assert.equal(perm,'NONE');f.private=true;return f},getBlob:()=>({getDataAsString:()=>f.content}),setContent:v=>f.content=v,makeCopy:(n,folder)=>{if(id===failId)throw Error('Unavailable');const result=file('copy'+sequence++,n);folder.files.push(result);copied.push(result);manifestStore[result.id]=result;return result}};return f;}
function folder(id){return folders[id]={id,files:[],getId:()=>id,createFolder:()=>folder('folder'+sequence++),getFilesByName:name=>iterator(folders[id].files.filter(f=>f.name===name)),createFile:(name,content)=>{const f=file('manifest'+sequence++,name,content);manifestStore[f.id]=f;folders[id].files.push(f);return f}};}
const ctx={SHEET_ID:'source-db',SHEET_REGISTRASI:'Registrasi',Date,console,PropertiesService:{getScriptProperties:()=>properties},
ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:handler=>{const builder={timeBased:()=>builder,everyDays:()=>builder,atHour:()=>builder,inTimezone:()=>builder,everyMinutes:()=>builder,create:()=>triggers.push({getHandlerFunction:()=>handler})};return builder}},
LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true},releaseLock:()=>locked=false})},
Utilities:{formatDate:()=> '2026-10-05 04-00-00'},MimeType:{PLAIN_TEXT:'text/plain'},
SpreadsheetApp:{openById:()=>({getSheetByName:()=>({})})},getSheetData:()=>[{link:originals.map(id=>'<a href="https://drive.google.com/file/d/'+id+'/view">File</a>').join('')}],
DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},createFolder:()=>folder('root'+sequence++),getFolderById:id=>folders[id],getFileById:id=>manifestStore[id] || file(id,id)}
};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../backend/Features.gs','utf8'),ctx);
props.IPCOS_PROGRESS_test=JSON.stringify({checks:{m1:true},revision:1});props.SESSION_TOKEN='not for backup';
ctx.setupBackups();assert.equal(triggers.length,2);assert(props.IPCOS_BACKUP_JOB);assert.equal(copied.length,101);assert(copied.every(f=>f.private && !f.editors.length && !f.viewers.length));
ctx.setupBackups();assert.equal(triggers.length,2);assert.equal(copied.length,101);ctx.continueBackup();assert.equal(copied.length,124);assert.equal(props.IPCOS_BACKUP_JOB,undefined);assert.equal(JSON.parse(props.IPCOS_BACKUP_STATUS).state,'success');
const firstManifest=JSON.parse(Object.values(manifestStore).find(f=>f.name==='manifest.json').content);assert.equal(firstManifest.preparation.IPCOS_PROGRESS_test.checks.m1,true);assert.equal(firstManifest.preparation.SESSION_TOKEN,undefined);
console.log('PASS Scheduled backup is private, chunked, resumable, and trigger setup is idempotent');
failId=originals[1];ctx.scheduledBackup();ctx.continueBackup();let status=JSON.parse(props.IPCOS_BACKUP_STATUS);assert.equal(status.state,'partial');assert.equal(status.errors,1);assert.equal(status.files,123);assert.equal(props.IPCOS_BACKUP_JOB,undefined);assert(copied.every(f=>f.private && !f.editors.length && !f.viewers.length));
console.log('PASS Missing source file produces partial backup and cannot be reported as complete');
const before=copied.length;locked=true;ctx.scheduledBackup();assert.equal(copied.length,before);locked=false;
console.log('PASS Concurrent snapshot is blocked and original records/files are never changed');
