// Shared, dependency-free structural checks. No document content leaves the browser.
function documentStructureIssue(source, name) {
    const bytes = source instanceof Uint8Array ? source : Uint8Array.from(source, value => (value + 256) % 256);
    const ext = String(name).split('.').pop().toLowerCase();
    const starts = signature => signature.every((value, i) => bytes[i] === value);
    const text = (start, end) => Array.from(bytes.slice(start, end), value => String.fromCharCode(value)).join('');
    const mismatch = 'Isi berkas tidak sesuai format .' + ext + '. Pilih dokumen asli; mengganti nama ekstensi tidak mengubah format.';
    if (ext === 'pdf') {
        if (!/%PDF-[12]\.\d/.test(text(0, Math.min(1024, bytes.length)))) return mismatch;
        if (!/%%EOF/.test(text(Math.max(0, bytes.length - 2048), bytes.length))) return 'PDF tampaknya belum lengkap. Simpan atau ekspor ulang dokumen lalu pilih kembali.';
    } else if (ext === 'doc') {
        if (bytes.length < 512 || !starts([208,207,17,224,161,177,26,225])) return mismatch;
    } else if (ext === 'zip' || ext === 'docx') {
        const names = documentZipEntries(bytes);
        if (!names) return 'Struktur ' + ext.toUpperCase() + ' tidak terbaca atau belum lengkap. Buat ulang berkas sebelum mengirim.';
        if (ext === 'docx' && (!names.includes('[Content_Types].xml') || !names.includes('word/document.xml'))) return mismatch;
    } else if (ext === 'rar') {
        if (bytes.length < 16 || !starts([82,97,114,33,26,7]) || ![0,1].includes(bytes[6])) return mismatch;
    } else if (ext === 'png') {
        if (!starts([137,80,78,71,13,10,26,10]) || text(12,16) !== 'IHDR' || text(bytes.length-8,bytes.length-4) !== 'IEND') return mismatch;
    } else if (ext === 'jpg' || ext === 'jpeg') {
        if (!starts([255,216,255]) || bytes[bytes.length-2] !== 255 || bytes[bytes.length-1] !== 217) return mismatch;
    } else return 'Format dokumen belum didukung.';
    return '';
}

function documentZipEntries(bytes) {
    const u16 = i => bytes[i] + bytes[i+1] * 256;
    const u32 = i => (bytes[i] + bytes[i+1]*256 + bytes[i+2]*65536 + bytes[i+3]*16777216) >>> 0;
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (u32(i) === 0x06054b50 && i + 22 + u16(i+20) === bytes.length) { end = i; break; }
    }
    if (end < 0 || u16(end+4) || u16(end+6)) return null;
    const count = u16(end+10), size = u32(end+12), offset = u32(end+16);
    if (!count || count > 2000 || count !== u16(end+8) || offset + size !== end) return null;
    let cursor = offset;
    const names = [];
    for (let i = 0; i < count; i++) {
        if (cursor + 46 > end || u32(cursor) !== 0x02014b50) return null;
        const length = u16(cursor+28), extra = u16(cursor+30), comment = u16(cursor+32), local = u32(cursor+42);
        if (!length || cursor + 46 + length + extra + comment > end || local + 30 > offset || u32(local) !== 0x04034b50) return null;
        if (local + 30 + u16(local+26) + u16(local+28) + u32(cursor+20) > offset) return null;
        names.push(Array.from(bytes.slice(cursor+46,cursor+46+length), value => String.fromCharCode(value)).join(''));
        cursor += 46 + length + extra + comment;
    }
    return cursor === end ? names : null;
}
if (typeof module !== 'undefined') module.exports = { documentStructureIssue, documentZipEntries };
