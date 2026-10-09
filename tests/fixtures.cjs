exports.pdf = (text='Test document') => Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% '+text+'\n%%EOF');
// A genuinely renderable PDF, including pages, font, xref and trailer. Preview
// tests must not mistake assigning a blob URL to an invalid PDF for rendering.
exports.previewPdf = (text='IPCOS preview test',pages=1) => {
    const printable=String(text).normalize('NFKD').replace(/[^\x20-\x7e]/g,' ').replace(/[\\()]/g,'\\$&');
    const stream='BT /F1 18 Tf 50 740 Td ('+printable+') Tj ET';
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'];
    const kids=['3 0 R'];for(let page=2;page<=Math.min(5,pages);page++){const id=objects.length+1,kidStream=stream.replace(') Tj ET',' - Page '+page+') Tj ET');kids.push(id+' 0 R');objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents '+(id+1)+' 0 R >>','<< /Length '+Buffer.byteLength(kidStream)+' >>\nstream\n'+kidStream+'\nendstream');}objects[1]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+kids.length+' >>';
    let output='%PDF-1.4\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(output));output+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
    const xref=Buffer.byteLength(output);output+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
    return Buffer.from(output);
};
exports.zip = names => {
    const local=[],central=[];let offset=0,size=0;
    for (const name of names) {
        const filename=Buffer.from(name),header=Buffer.alloc(30),entry=Buffer.alloc(46);
        header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(filename.length,26);
        entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);
        local.push(header,filename);central.push(entry,filename);offset+=header.length+filename.length;size+=entry.length+filename.length;
    }
    const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);
    return Buffer.concat([...local,...central,end]);
};
