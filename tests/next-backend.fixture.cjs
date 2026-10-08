const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
module.exports=function fixture(){
    const state={properties:{},cache:new Map(),locked:false,lockAllowed:true,active:true,failWrite:false,failUpload:false,writeThenThrow:false,created:[]};
    const headers=['id','date','nim','nama','jenis','detail','link','status','note'];
    const revisionNote=JSON.stringify([{role:'admin',sender:'Admin Uji',time:'2026-10-07T01:00:00Z',message:'Berkas yang perlu diperbaiki:\n- Isian pengajuan\n\nInstruksi:\nPerbaiki judul.'}]);
    const rows=[headers,['fields','2026-10-01T01:00:00Z','A','Mahasiswa Uji A','Proposal','<b>Judul:</b> Judul awal','','Revision',revisionNote],['other','2026-10-01T01:00:00Z','B','Mahasiswa Uji B','Proposal','<b>Judul:</b> Data mahasiswa lain','','Revision',revisionNote]];
    function sheet(){return {getDataRange:()=>({getValues:()=>structuredClone(rows)}),getRange:(r)=>({setValues:values=>{if(state.failWrite)throw Error('Write failed');rows[r-1]=structuredClone(values[0]);if(state.writeThenThrow)throw Error('Acknowledgement lost');}})};}
    const props={getProperty:key=>state.properties[key]??null,setProperty:(key,value)=>{if(state.failWrite)throw Error('Write failed');state.properties[key]=value;},deleteProperty:key=>delete state.properties[key],getProperties:()=>({...state.properties})};
    const ctx={console,Uint8Array,SHEET_ID:'fixture',SHEET_REGISTRASI:'Registrasi',SHEET_DOSEN:'Dosen',DRIVE_FOLDER_ID:'fixture',
        PropertiesService:{getScriptProperties:()=>props},
        CacheService:{getScriptCache:()=>({get:key=>{const item=state.cache.get(key);return item&&item.expires>Date.now()?item.value:null;},put:(key,value,seconds)=>state.cache.set(key,{value,expires:Date.now()+seconds*1000})})},
        Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algorithm,value)=>[...crypto.createHash('sha256').update(String(value)).digest()],base64Decode:value=>[...Buffer.from(value,'base64')],newBlob:(value,mime,name)=>({getBytes:()=>[...Buffer.from(typeof value==='string'?value:value)],value,mime,name}),formatDate:(date,tz)=>new Date(date).toLocaleDateString('en-CA',{timeZone:tz==='UTC'?'UTC':'Asia/Jakarta'})},
        SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet()})},getOrCreateSheet:()=>sheet(),getSheetData:()=>rows.slice(1).map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i]]))),
        getSession:token=>token==='admin'?{role:'admin',nama:'Admin Uji'}:['student-A','student-B'].includes(token)?{role:'mhs',nim:token.slice(-1),nama:'Mahasiswa Uji '+token.slice(-1)}:null,
        auditStudent:nim=>state.active&&['A','B'].includes(nim)?{NIM:nim,Status:'Aktif'}:null,
        LockService:{getScriptLock:()=>({tryLock:()=>{if(state.locked||!state.lockAllowed)return false;state.locked=true;return true;},releaseLock:()=>state.locked=false,hasLock:()=>state.locked})},
        DriveApp:{getFolderById:()=>({getFoldersByName:()=>({hasNext:()=>true,next:()=>({createFile:blob=>{if(state.failUpload)throw Error('Upload failed');const file={blob,trashed:false,getUrl:()=> 'https://drive.google.com/file/d/fixture'+state.created.indexOf(file)+'/view',setTrashed:value=>file.trashed=value};state.created.push(file);return file;}})})})},
        ContentService:{MimeType:{JSON:'json'},createTextOutput:content=>({content,setMimeType(){return this;}})}
    };
    vm.createContext(ctx);vm.runInContext(fs.readFileSync('tests/backend-transactions.fixture.cjs','utf8')+'\n'+fs.readFileSync('backend/Features.gs','utf8')+'\n'+fs.readFileSync('backend/Next.gs','utf8'),ctx);
    ctx.auditStudent=nim=>state.active&&['A','B'].includes(nim)?{NIM:nim,Status:'Aktif'}:null;
    return {ctx,state,rows,headers,revisionNote,records:()=>rows.slice(1).map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i]])))};
};
