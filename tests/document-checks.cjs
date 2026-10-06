const {test} = require('node:test');
const assert = require('node:assert/strict');
const {documentStructureIssue} = require('../document-checks.js');
const {zip,pdf} = require('./fixtures.cjs');
test('Valid PDF accepted; renamed text and interrupted PDF rejected',()=>{
    assert.equal(documentStructureIssue(pdf(),'a.pdf'),'');
    assert.match(documentStructureIssue(Buffer.from('not a pdf'),'renamed.pdf'),/tidak sesuai/);
    assert.match(documentStructureIssue(pdf().subarray(0,15),'cut.pdf'),/belum lengkap/);
});
test('DOCX requires a complete Word container; ordinary ZIP cannot masquerade as DOCX',()=>{
    assert.equal(documentStructureIssue(zip(['[Content_Types].xml','word/document.xml']),'draft.docx'),'');
    assert.match(documentStructureIssue(zip(['hello.txt']),'draft.docx'),/tidak sesuai/);
    assert.match(documentStructureIssue(zip(['hello.txt']).subarray(0,40),'cut.zip'),/belum lengkap/);
});
test('ZIP directory and comments accepted; impossible offsets rejected without extraction',()=>{
    const regular=zip(['a.pdf','folder/b.pdf']); assert.equal(documentStructureIssue(regular,'bundle.zip'),'');
    const commented=Buffer.concat([regular,Buffer.from('comment')]);commented.writeUInt16LE(7,regular.length-2);
    assert.equal(documentStructureIssue(commented,'comment.zip'),'');
    const broken=Buffer.from(regular);broken.writeUInt32LE(0xfffffff0,broken.length-6);
    assert.match(documentStructureIssue(broken,'bad.zip'),/tidak terbaca/);
});
test('DOC, RAR and images require matching binary signatures; signed Apps Script bytes supported',()=>{
    const doc=Buffer.alloc(512);Buffer.from([208,207,17,224,161,177,26,225]).copy(doc);
    assert.equal(documentStructureIssue([...doc].map(n=>n>127?n-256:n),'a.doc'),'');
    assert.match(documentStructureIssue(pdf(),'a.doc'),/tidak sesuai/);
    const rar=Buffer.alloc(16);Buffer.from([82,97,114,33,26,7,1,0]).copy(rar);
    assert.equal(documentStructureIssue(rar,'a.rar'),'');
    assert.match(documentStructureIssue(pdf(),'a.png'),/tidak sesuai/);
});
