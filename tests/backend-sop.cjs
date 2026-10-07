const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sopSource=fs.readFileSync('backend/Sop.gs','utf8'), deployed=fs.readFileSync('backend/Features.gs','utf8');
const pdf=Buffer.from('%PDF-1.4\nSOP test fixture\n%%EOF');
let context,rows,properties,session,locked,lockAllowed,writeFailure,writeThenFailure,flushFailure,uploadFailure,privacyFailure,created,folders,files,fileSequence;
function privateObject(id) {
  const object={id,editors:['old-editor'],viewers:['old-viewer'],private:false,trashed:false,
    getId:()=>id,setSharing:(access,permission)=>{assert.equal(access,'PRIVATE');assert.equal(permission,'NONE');if(privacyFailure===true || (privacyFailure==='file' && id.startsWith('sop_file_')))throw Error('Privacy failed');object.private=true;return object;},
    getEditors:()=>object.editors.slice(),getViewers:()=>object.viewers.slice(),removeEditor:user=>{object.editors=object.editors.filter(value=>value!==user);},removeViewer:user=>{object.viewers=object.viewers.filter(value=>value!==user);},setTrashed:value=>{object.trashed=value;}};
  return object;
}
function folder(id) {
  const object=privateObject(id);
  object.createFile=blob=>{
    if(uploadFailure===created.length+1)throw Error('Upload failed');
    const file=privateObject('sop_file_'+String(++fileSequence).padStart(8,'0'));
    file.blob=blob;file.getName=()=>blob.name;file.getSize=()=>blob.bytes.length;file.getMimeType=()=>blob.mime;file.getBlob=()=>({getBytes:()=>file.blob.bytes});
    created.push(file);files[file.id]=file;return file;
  };
  folders[id]=object;return object;
}
function sheet() {
  return {getDataRange:()=>({getValues:()=>structuredClone(rows)}),
    getRange:(row,column)=>({setValue:value=>{if(writeFailure)throw Error('Storage failed');rows[row-1][column-1]=value;if(writeThenFailure)throw Error('Acknowledgement failed');}}),
    appendRow:row=>{if(writeFailure)throw Error('Storage failed');rows.push(Array.from(row));if(writeThenFailure)throw Error('Acknowledgement failed');}};
}
beforeEach(()=>{
  rows=[['Tipe','DataJSON','Extra'],['faq','[{"title":"Existing FAQ","items":[]}]','Keep this academic content']];properties={};session={role:'admin'};locked=false;lockAllowed=true;writeFailure=false;writeThenFailure=false;flushFailure=false;uploadFailure=0;privacyFailure=false;created=[];folders={};files={};fileSequence=0;
  context={Uint8Array,Date,console,SHEET_ID:'fixture',getSession:()=>session,
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key],setProperty:(key,value)=>{properties[key]=value;}})},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>{assert.equal(name,'KontenWeb');return sheet();}}),flush:()=>{if(flushFailure)throw Error('Flush failed');}},
    getSheetData:()=>rows.slice(1).map(row=>Object.fromEntries(rows[0].map((key,index)=>[key,row[index]]))),
    Utilities:{base64Decode:value=>Array.from(Buffer.from(value,'base64')),base64Encode:bytes=>Buffer.from(bytes).toString('base64'),newBlob:(bytes,mime,name)=>({bytes:Array.from(bytes),mime,name})},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},createFolder:()=>folder('private_folder'),getFolderById:id=>{if(!folders[id])throw Error('Folder unavailable');return folders[id];},getFileById:id=>{if(!files[id])throw Error('File unavailable');return files[id];}},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(!lockAllowed || locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},
    featurePrivateFile:file=>{file.setSharing('PRIVATE','NONE');file.getEditors().forEach(user=>file.removeEditor(user));file.getViewers().forEach(user=>file.removeViewer(user));return file;}};
  vm.createContext(context);vm.runInContext(deployed,context);
});
function document(type='sop_magang') {
  return {schema:1,type,revision:0,updatedAt:'',title:'SOP Magang',titleEn:'Internship SOP',intro:'Read the instructions.',introEn:'Read the instructions.',sections:[{id:'section_a',title:'Preparation',titleEn:'Preparation',body:'First step\nSecond step',bodyEn:'First step\nSecond step',links:[],files:[]}],lastRequestId:''};
}
function uploadedDocument(buffer=pdf,type='sop_magang') {
  const doc=document(type),id='new-00000000-0000-4000-a000-000000000001';
  doc.sections[0].files=[{id,fileName:'guide.pdf',mimeType:'application/pdf',size:buffer.length}];
  return {doc,uploads:[{id,blockId:'section_a',fileName:'guide.pdf',mimeType:'application/pdf',base64:buffer.toString('base64')}]};
}
function save(doc=document(),uploads=[],requestId='request_0001',revision=doc.revision) {
  return context.sopDispatch({action:'save_sop',type:doc.type,document:doc,revision,requestId,uploads});
}
function read(type='sop_magang') {return context.sopDispatch({action:'get_sop',type}).document;}
test('Deployable Features includes the exact tested SOP module before unchanged shared suffix',()=>{
  assert(deployed.includes(sopSource+'\n// Academic journey helpers\n'));
  assert(deployed.endsWith(fs.readFileSync('document-checks.js','utf8')+'\n'+fs.readFileSync('backend/Journey.gs','utf8')));
  assert(deployed.includes("if (['get_sop','save_sop','get_sop_file'].includes(data.action)) return sopDispatch(data,session);"));
});
test('Only authenticated student/admin sessions read SOP and only admin can publish',()=>{
  assert.equal(read().revision,0);session={role:'mhs',nim:'test'};assert.equal(read().sections.length,0);assert.throws(()=>save(),/admin/);
  for(const value of [null,{role:'guest'}]){session=value;assert.throws(()=>read(),/Sesi/);assert.throws(()=>save(),/Sesi/);assert.throws(()=>context.sopDispatch({action:'get_sop_file',type:'sop_magang',fileId:'forged_00000'}),/Sesi/);}
  assert.equal(rows.length,2);assert.equal(created.length,0);
});
test('Feature dispatcher routes SOP reads before the admin-only management gate',()=>{
  session={role:'mhs',nim:'test'};assert.equal(context.featureDispatch({action:'get_sop',type:'sop_magang'}).document.revision,0);
  assert.throws(()=>context.featureDispatch({action:'save_sop',type:'sop_magang',document:document(),requestId:'request_0001',revision:0}),/admin/);
  assert.throws(()=>context.featureDispatch({action:'backup_status'}),/admin/);session=null;assert.throws(()=>context.featureDispatch({action:'get_sop',type:'sop_magang'}),/Sesi/);
});
test('Publishing and updating SOP preserves existing sheet rows, columns and the other SOP',()=>{
  const before=JSON.stringify(rows[1]);const first=save();assert.equal(first.document.revision,1);assert.equal(rows[2].length,3);assert.equal(rows[2][0],'sop_magang');assert.equal(rows[2][2],'');
  const second=save(document('sop_tugas_akhir'),[],'request_0002');assert.equal(second.document.revision,1);
  const changed=JSON.parse(JSON.stringify(first.document));changed.title='Updated SOP';changed.sections[0].body+='\nNew line';
  const updated=save(changed,[],'request_0003');assert.equal(updated.document.revision,2);assert.match(read().sections[0].body,/New line/);assert.equal(read('sop_tugas_akhir').revision,1);assert.equal(JSON.stringify(rows[1]),before);assert.equal(rows.length,4);
});
test('Conflicting admin revisions and lock contention leave the published SOP unchanged',()=>{
  save();assert.throws(()=>save(document(),[],'request_0002'),/diperbarui admin lain/);assert.equal(read().revision,1);
  lockAllowed=false;assert.throws(()=>save(read(),[],'request_0003'),/sedang disimpan/);assert.equal(read().revision,1);assert.equal(locked,false);
});
test('Direct server calls cannot publish empty or titleless sections before touching Drive',()=>{
  const blank=document();blank.intro='';blank.introEn='';blank.sections=[];
  assert.equal(context.sopValidate(blank,'sop_magang',false).sections.length,0);assert.throws(()=>save(blank),/pengantar atau bagian/);
  const titleless=uploadedDocument();titleless.doc.sections[0].title=' ';assert.throws(()=>save(titleless.doc,titleless.uploads),/judul dan teks/);
  const emptySection=document();emptySection.sections[0].body='';emptySection.sections[0].bodyEn='';assert.throws(()=>save(emptySection),/judul dan teks/);
  assert.equal(created.length,0);assert.equal(Object.keys(folders).length,0);assert.equal(rows.length,2);assert.equal(locked,false);
  const introOnly=document();introOnly.sections=[];assert.equal(save(introOnly).document.sections.length,0);
});
test('Retrying the same request returns the committed document without creating duplicate files',()=>{
  const fixture=uploadedDocument();const first=save(fixture.doc,fixture.uploads);assert.equal(created.length,1);
  const retry=save(fixture.doc,fixture.uploads);assert.equal(retry.document.sections[0].files[0].id,first.document.sections[0].files[0].id);assert.equal(retry.document.revision,1);assert.equal(created.length,1);assert.equal(locked,false);
});
test('All new SOP folders and files are private, and download checks exact published membership',()=>{
  const fixture=uploadedDocument();const result=save(fixture.doc,fixture.uploads),id=result.document.sections[0].files[0].id;
  assert.equal(folders.private_folder.private,true);assert.equal(folders.private_folder.editors.length,0);assert(created.every(file=>file.private && !file.editors.length && !file.viewers.length));
  session={role:'mhs',nim:'test'};const download=context.sopDispatch({action:'get_sop_file',type:'sop_magang',fileId:id});assert.equal(download.base64,pdf.toString('base64'));assert.equal(download.fileName,'guide.pdf');
  assert.throws(()=>context.sopDispatch({action:'get_sop_file',type:'sop_tugas_akhir',fileId:id}),/tidak termasuk/);assert.throws(()=>context.sopDispatch({action:'get_sop_file',type:'sop_magang',fileId:'arbitrary_file_id'}),/tidak termasuk/);
});
test('Forged existing file IDs and unused/missing new uploads are rejected before file creation',()=>{
  const fixture=uploadedDocument();fixture.doc.sections[0].files[0].id='forged_file_00000';assert.throws(()=>save(fixture.doc),/tidak termasuk/);
  const missing=uploadedDocument();assert.throws(()=>save(missing.doc),/Pilih ulang/);
  assert.throws(()=>save(document(),missing.uploads),/tidak termasuk/);assert.equal(created.length,0);assert.equal(properties.IPCOS_SOP_FOLDER,undefined);
});
test('Malformed format, MIME, base64, attachment size and IDs are validated before any upload',()=>{
  const mutations=[fixture=>fixture.uploads[0].base64='!!!!',fixture=>fixture.uploads[0].mimeType='text/html',fixture=>fixture.uploads[0].blockId='different_section',fixture=>fixture.doc.sections[0].files[0].size=pdf.length+1,fixture=>fixture.doc.sections[0].files[0].fileName='payload.svg',fixture=>fixture.uploads[0].base64=Buffer.from('renamed text').toString('base64')];
  mutations.forEach(change=>{const fixture=uploadedDocument();change(fixture);assert.throws(()=>save(fixture.doc,fixture.uploads));});
  const fakePdf=Buffer.from('renamed text'), fixture=uploadedDocument(fakePdf);assert.throws(()=>save(fixture.doc,fixture.uploads),/tidak sesuai/);
  assert.equal(created.length,0);assert.equal(rows.length,2);assert.equal(locked,false);
});
test('Partial upload failure, privacy failure and persistence failure discard only new files',()=>{
  const existing=save(uploadedDocument().doc,uploadedDocument().uploads).document;const oldFile=created[0];
  const changed=JSON.parse(JSON.stringify(existing));const first=uploadedDocument();changed.sections[0].files.push(first.doc.sections[0].files[0]);
  const second=structuredClone(first.uploads[0]);second.id='new-00000000-0000-4000-a000-000000000002';changed.sections[0].files.push({...first.doc.sections[0].files[0],id:second.id});
  uploadFailure=3;assert.throws(()=>save(changed,[...first.uploads,second],'request_0002'),/Upload failed/);assert.equal(created[1].trashed,true);assert.equal(oldFile.trashed,false);assert.equal(read().revision,1);
  uploadFailure=0;writeFailure=true;const writeDoc=JSON.parse(JSON.stringify(existing));writeDoc.sections[0].files.push(first.doc.sections[0].files[0]);assert.throws(()=>save(writeDoc,first.uploads,'request_0003'),/Storage failed/);assert.equal(created.at(-1).trashed,true);assert.equal(oldFile.trashed,false);assert.equal(read().revision,1);
  writeFailure=false;privacyFailure='file';assert.throws(()=>save(writeDoc,first.uploads,'request_0004'),/Privacy failed/);assert.equal(created.at(-1).trashed,true);assert.equal(read().revision,1);assert.equal(oldFile.trashed,false);assert.equal(locked,false);
});
test('An acknowledgement failure after committing does not trash published files or falsely fail',()=>{
  writeThenFailure=true;const fixture=uploadedDocument(),result=save(fixture.doc,fixture.uploads);assert.equal(result.status,'success');assert.equal(result.document.revision,1);assert.equal(created[0].trashed,false);
  assert.equal(read().revision,1);assert.equal(locked,false);
});
test('Removing published attachments keeps original files private and revokes portal access',()=>{
  const fixture=uploadedDocument(),first=save(fixture.doc,fixture.uploads).document,id=first.sections[0].files[0].id;first.sections[0].files=[];
  save(first,[],'request_0002');assert.equal(files[id].trashed,false);assert.equal(files[id].private,true);
  assert.throws(()=>context.sopDispatch({action:'get_sop_file',type:'sop_magang',fileId:id}),/tidak termasuk/);
});
test('Tampered file bytes or MIME cannot be returned as an approved SOP attachment',()=>{
  const fixture=uploadedDocument(),first=save(fixture.doc,fixture.uploads).document,id=first.sections[0].files[0].id;
  files[id].blob.bytes=Array.from(Buffer.from('tampered file'));assert.throws(()=>context.sopDispatch({action:'get_sop_file',type:'sop_magang',fileId:id}),/berubah|tidak sesuai/);
  files[id].blob.bytes=Array.from(pdf);files[id].blob.mime='text/html';assert.throws(()=>context.sopDispatch({action:'get_sop_file',type:'sop_magang',fileId:id}),/berubah/);
});
test('Corrupt, duplicate or structurally incompatible SOP storage is never silently overwritten',()=>{
  rows.push(['sop_magang','broken','']);assert.throws(()=>read(),/belum dapat dibaca/);assert.throws(()=>save(),/belum dapat dibaca/);assert.equal(rows[2][1],'broken');rows[2][1]=JSON.stringify(document());rows.push([...rows[2]]);assert.throws(()=>save(),/ganda/);assert.equal(locked,false);
  rows=[['wrong','columns']];assert.throws(()=>save(),/Struktur/);assert.equal(rows.length,1);
});
test('Unsafe URLs, excessive content and duplicate section/link/file IDs cannot be published',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','https://user:pass@example.com/path','https://example.com/\nscript','https://example.com/<script>']){const doc=document();doc.sections[0].links=[{id:'link_a',label:'Link',labelEn:'Link',url}];assert.throws(()=>save(doc));}
  const valid=document();valid.sections[0].links=[{id:'link_a',label:'Guide',labelEn:'Guide',url:'https://example.com/guide?year=2026#start'}];assert.equal(save(valid).document.sections[0].links[0].url,valid.sections[0].links[0].url);
  const oversized=document();oversized.title='a'.repeat(201);assert.throws(()=>context.sopValidate(oversized,'sop_magang',true));oversized.title='Title';oversized.sections[0].body='b'.repeat(6001);assert.throws(()=>context.sopValidate(oversized,'sop_magang',true));
  const excessive=document();excessive.sections=Array.from({length:21},(_,index)=>({...document().sections[0],id:'block_'+index}));assert.throws(()=>context.sopValidate(excessive,'sop_magang',true),/20/);
  const duplicate=document();duplicate.sections.push(structuredClone(duplicate.sections[0]));assert.throws(()=>context.sopValidate(duplicate,'sop_magang',true),/ganda/);
  const sevenFiles=uploadedDocument().doc;sevenFiles.sections[0].files=Array.from({length:7},(_,index)=>({...sevenFiles.sections[0].files[0],id:'new-file_0000'+index}));assert.throws(()=>context.sopValidate(sevenFiles,'sop_magang',true),/enam lampiran/);
  const sevenLinks=document();sevenLinks.sections[0].links=Array.from({length:7},(_,index)=>({id:'link_'+index,label:'Guide',labelEn:'Guide',url:'https://example.com'}));assert.throws(()=>context.sopValidate(sevenLinks,'sop_magang',true),/enam tautan/);
  const tooLong=document();tooLong.sections=Array.from({length:8},(_,index)=>({...document().sections[0],id:'block_'+index,body:'a'.repeat(5900)}));assert.throws(()=>context.sopValidate(tooLong,'sop_magang',true),/45.000/);
});
test('New upload batches above 12 MB fail before Drive is touched',()=>{
  const buffer=Buffer.alloc(4*1024*1024+1,32);Buffer.from('%PDF-1.4\n').copy(buffer);Buffer.from('\n%%EOF').copy(buffer,buffer.length-6);const fixture=uploadedDocument(buffer);
  fixture.doc.sections[0].files=Array.from({length:3},(_,index)=>({...fixture.doc.sections[0].files[0],id:'new-00000000-0000-4000-a000-00000000000'+index}));
  fixture.uploads=fixture.doc.sections[0].files.map(file=>({...fixture.uploads[0],id:file.id}));assert.throws(()=>save(fixture.doc,fixture.uploads),/12 MB/);assert.equal(created.length,0);assert.equal(rows.length,2);
});
test('Backup includes only current SOP attachments and omits unrelated content and auth properties',()=>{
  const fixture=uploadedDocument();const first=save(fixture.doc,fixture.uploads).document;const secondFixture=uploadedDocument(pdf,'sop_tugas_akhir'),second=save(secondFixture.doc,secondFixture.uploads,'request_0002').document;
  properties.SESSION_SECRET='not included';const ids=Array.from(context.sopBackupFiles());assert.deepEqual(ids,[first.sections[0].files[0].id,second.sections[0].files[0].id]);
  first.sections[0].files=[];save(first,[],'request_0003');assert.deepEqual(Array.from(context.sopBackupFiles()),[second.sections[0].files[0].id]);
});
test('Owner deployment diagnostic is read-only and logs only boolean results',()=>{
  const logs=[];context.console={log:line=>logs.push(line)};session=null;
  const before=JSON.stringify(rows), result=context.verifySopDeployment();
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{headersValid:true,internshipReadable:true,finalProjectReadable:true,studentWriteDenied:true,anonymousDenied:true});
  assert.equal(logs.length,1);assert(Object.values(JSON.parse(logs[0])).every(value=>typeof value==='boolean'));assert.equal(JSON.stringify(rows),before);assert.equal(created.length,0);assert.equal(Object.keys(properties).length,0);
});
