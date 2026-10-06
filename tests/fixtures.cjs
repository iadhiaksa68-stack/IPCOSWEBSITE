exports.pdf = (text='Test document') => Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% '+text+'\n%%EOF');
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
