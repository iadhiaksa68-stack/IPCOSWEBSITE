# Integrasi backend IPCOS

`Features.gs` adalah modul Apps Script tanpa kredensial. Folder backend tidak disertakan ke hosting Vercel. Backend aktif tetap berada pada proyek Google Apps Script terikat ke spreadsheet yang sama.

## Perubahan pada Kode.gs

- `handleRegistration`: pemeriksaan `featureCheckCreate` dilakukan di dalam lock transaksi yang sudah ada, sesudah pemeriksaan idempotensi. Label unggahan awal dinormalisasi dengan `featureLabels`; catatan pertama menyimpan status dan metadata dokumen dari `featureDocumentMetadata`.
- `handleUpdate`: `featureValidateRevision` memeriksa asosiasi berkas. Setiap perubahan status dicatat. Metadata dokumen ditempatkan dalam catatan terakhir sebelum satu commit baris, bersama status/link. Baseline berkas lama diperlakukan sebagai versi pertama; dokumen lama tetap disimpan dan tidak dimigrasi.
- `getDataForSession`: menambahkan konfigurasi layanan untuk kedua peran dan status cadangan hanya untuk admin.
- `doPost`: `save_services` memakai lock. `save_services`, `get_receipt`, `get_document`, dan `backup_status` diteruskan ke `featureDispatch`, yang memvalidasi sesi dan peran. Endpoint lama tetap digunakan.

## Penyimpanan

Tidak ada kolom atau sheet baru. Versi dokumen menggunakan JSON catatan yang sudah ada. Periode, target, progres dan lokasi cadangan memakai Script Properties. Cara login dan sesi tetap menggunakan mekanisme sebelumnya.

## Cadangan

Pemilik menjalankan `setupBackups` sekali. Fungsi ini membuat trigger harian sekitar 04.00 WIB dan trigger kelanjutan setiap 10 menit secara idempotent. Database disalin di bawah lock. Lampiran disalin maksimal 100 per batch dan 120 detik, memakai manifest untuk melanjutkan. Salinan baru dibuat privat dan tidak mempertahankan editor/viewer sumber. Salinan lama tidak dihapus otomatis.

Akun pelaksana wajib memiliki akses ke spreadsheet dan folder/lampiran sumber. `partial` atau `failed` tidak boleh dianggap cadangan lengkap. `verifyFeatureDeployment` memeriksa API dan PDF nyata serta melanjutkan satu batch cadangan; tidak mencatat identitas mahasiswa.

## Rilis dan rollback

Simpan kedua file Google Apps Script, perbarui deployment endpoint lama ke versi baru, lalu deploy frontend Vercel. Jangan mengganti endpoint atau ID spreadsheet. Untuk rollback, pilih deployment antarmuka dan versi backend sebelumnya yang sesuai. Panduan pemulihan ada di `recovery-guide.html`.

## Pengujian

70 pemeriksaan lulus: 20 transaksi backend/akses, 3 cadangan, 13 alur transaksi antarmuka, 8 regresi sesi, 6 kelompok tampilan responsif/keyboard, 9 pemeriksaan pratinjau/sesi/grafik, 8 fitur baru, dan 3 pemeriksaan dokumen privat. Transaksi menggunakan data simulasi. Kesesuaian fungsi transaksi yang diuji dengan sumber Google diverifikasi melalui hash. Google berhasil menghasilkan PDF nyata.

## Lampiran privat

`get_document` memvalidasi sesi, kepemilikan pengajuan dan kecocokan URL dengan kolom link sebelum membaca Drive. PDF/gambar dipratinjau sebagai blob lokal, format lain diunduh. Blob dicabut saat detail ditutup, berganti pengajuan atau logout. Respons terlambat tidak boleh membuka dokumen setelah sesi berubah.

## Perjalanan akademik dan pemeriksaan dokumen (6 Oktober 2026)

`Features.gs` sekarang menyertakan helper dari `document-checks.js` dan `Journey.gs`. Unggah hanya `Features.gs` ke modul yang sudah ada; jangan menambahkan salinan helper sebagai modul kedua. Pengujian memeriksa kesamaan sumber helper.

Tiga perubahan kecil di `Kode.gs`: respons `getDataForSession` menyertakan `...journeySnapshot(session)`; `doPost` meneruskan `get_journey` dan `save_progress` ke `journeyDispatch`; `auditFiles` memanggil `featureCheckDocumentBytes` sesudah decoding dan batas ukuran. Autentikasi, spreadsheet, kolom, endpoint, dan alur transaksi lama dipertahankan.

Progres pribadi menggunakan Script Properties dengan kunci hash NIM, pembatasan poin yang valid, akses pemilik, dan lock saat patch disimpan. Setiap nilai dibatasi 8 KB. Catatan progres ikut manifest cadangan privat, tanpa sesi atau kredensial. Untuk pemulihan, salin entri `preparation` dari manifest ke Script Properties melalui pemilik proyek.

Jalankan `verifyJourneyDeployment` sebelum memperbarui deployment lama. Pemeriksaan ini membaca data transaksi tanpa mengubahnya, memakai catatan persiapan sementara yang dipulihkan, dan hanya mencatat enam hasil boolean. Pengujian seluruh transaksi menggunakan data simulasi.

## Draf, revisi isian dan kesehatan layanan (8 Oktober 2026)

Tambahkan file `Next.gs` terpisah, dengan isi tepat dari `backend/Next.gs`. Jangan menyalin ulang `Features.gs` atau helper Journey/SOP. Di dalam `doPost`, tepat setelah parsing `data`, tambahkan:

```js
if (NEXT_ACTIONS.includes(data.action))
  return ContentService.createTextOutput(JSON.stringify(nextDispatch(data)))
    .setMimeType(ContentService.MimeType.JSON);
```

Rute baru memakai validasi sesi dan lock sendiri. Jalankan `verifyNextDeployment`: empat boolean wajib `true`. Pemeriksaan hanya memakai kunci draf diagnostik sementara yang dipulihkan, tanpa perubahan data akademik. Perbarui deployment aktif endpoint yang sama ke versi baru, lalu terbitkan frontend setelah seluruh gate lulus.

Draf teks menggunakan `IPCOS_DRAFT_<hash NIM>`: batas 8 KB, 14 hari, allowlist kolom, CAS revision dan ID retry. Tidak menyimpan berkas. Kunci kedaluwarsa dipangkas pada penyimpanan baru. Revisi isian memakai satu commit pada baris pengajuan yang sama, versi detail/status/catatan/link, pemeriksaan pemilik dan izin revisi admin, validasi unggahan serta rollback berkas baru jika commit gagal. Data akademik tidak dimigrasi.

Ringkasan gangguan menggunakan `IPCOS_HEALTH_YYYY-MM-DD`, agregat tanpa pesan/stack/URL/NIM/nama berkas/token; hanya admin dapat membacanya. Retensi tujuh hari, cache rate limit dan bucket terbatas. Draft dan ringkasan ini tidak dimasukkan ke cadangan catatan akademik; keduanya data sementara.


## Pemeriksaan per berkas dan arsip (9 Oktober 2026)

Ganti hanya isi `Next.gs` dengan sumber lokal terbaru. `doPost` sudah meneruskan seluruh `NEXT_ACTIONS`, sehingga tidak perlu mengubah `Kode.gs`, `Features.gs`, kredensial, endpoint atau skema spreadsheet. Terbitkan versi baru pada deployment lama setelah izin akses backend tersedia.

Rute baru: `get_review_capabilities`, `get_document_review`, `save_document_review`, `archive_request`, `restore_request`. Semua memvalidasi sesi. Pembacaan hasil pemeriksaan hanya untuk admin atau mahasiswa aktif pemilik pengajuan; penyimpanan dan pengelolaan arsip hanya untuk admin. Mutasi memakai lock, versi snapshot, ID retry dan pemeriksaan hasil commit jika respons penulisan terputus.

Hasil per berkas disimpan dalam event `kind:document_review`, role `system`, sehingga tidak menggantikan instruksi revisi admin yang digunakan validasi lama. Event arsip `kind:archive` mempertahankan seluruh baris, lampiran, status dan kuota. Hanya status `Accepted` dapat diarsipkan/dipulihkan. Keduanya memakai kolom `note` yang sudah ada, ikut cadangan spreadsheet, dan mempertahankan catatan lama berbentuk teks. Tidak ada migrasi atau pengarsipan otomatis pada data produksi.

Frontend memeriksa kapabilitas terlebih dahulu. Jika backend lama masih aktif, kontrol mutasi baru tidak tersedia. Perbaikan PDF, pratinjau mahasiswa, penataan panel dan indikator bahasa SOP tetap dapat diterbitkan secara mandiri.
