function getDataForSession(session) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const allRegistrations = getSheetData(getOrCreateSheet(ss, SHEET_REGISTRASI, ['id', 'date', 'nim', 'nama', 'jenis', 'detail', 'link', 'status', 'note']));
  const scopedRegistrations = session.role === 'admin' ? allRegistrations : allRegistrations.filter(r => String(r.nim || r.NIM).trim() === String(session.nim));
  const registrations = scopedRegistrations.map(r => {
    r.reviewVersion = nextRevisionVersion(r);
    r.catatanAdmin = r.note || '';
    if (r.detail && r.detail.includes('Dosen Pembimbing:')) {
      const match = r.detail.match(/Dosen Pembimbing:<\/b>\s*([^<]+)/);
      if (match && match[1]) {
        r.dospem = match[1].trim();
        r.detail = r.detail.split("<br><br><b style='color:#E03F4F;'>Dosen Pembimbing:")[0];
      }
    }
    return r;
  });
  const students = session.role === 'admin' ? getSheetData(getOrCreateSheet(ss, SHEET_MAHASISWA, ['NIM', 'Nama', 'Status'])) : [];
  const announcements = getSheetData(getOrCreateSheet(ss, SHEET_PENGUMUMAN, ['date', 'message', 'type']));
  const contents = getSheetData(getOrCreateSheet(ss, SHEET_KONTEN, ['Tipe', 'DataJSON']));
  const dosenSheet = ss.getSheetByName(SHEET_DOSEN);
  const dosens = dosenSheet ? getSheetData(dosenSheet) : [];
  return { status: 'success', registrations: registrations, students: students, announcements: announcements, contents: contents, dosens: dosens, services:featureConfig(), ...journeySnapshot(session), backup:session.role === 'admin' ? featureBackupStatus() : null };
}

