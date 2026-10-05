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
