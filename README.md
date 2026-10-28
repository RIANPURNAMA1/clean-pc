# CleanPC

Aplikasi desktop pembersih cache dan file sementara untuk **Windows 10/11**.
Stack: **Tauri 2 + Rust** (backend native) dan **React + TypeScript + Vite + Tailwind** (UI, Bahasa Indonesia).
Semua berjalan lokal: tanpa login, server, analytics, atau pengiriman data.

## Status jujur

| Hal | Status |
|---|---|
| Logika inti (path guard, scanner, cleaner, analyzer, settings, riwayat) | Selesai. **17 tes otomatis lulus** (Linux, direktori sementara) |
| Backend Tauri (17 command, event progress, pembatalan) | Ter-compile bersih (`cargo check`, tanpa warning) di Linux |
| Frontend (7 halaman, dialog, state loading/empty/error) | `tsc`, ESLint, Prettier, `vite build` lulus |
| **Dijalankan & diuji di Windows 11** | **Belum.** Dibuat di lingkungan Linux; ujilah dulu memakai checklist di bawah |
| Installer `.exe`/`.msi` | **Belum pernah dibangun.** Bangun lewat langkah di bawah atau GitHub Actions |
| Tampilan UI | Belum diperiksa secara visual di jendela asli |
| Code signing | Belum. Installer tanpa tanda tangan memicu peringatan SmartScreen; untuk distribusi luas gunakan sertifikat code signing |

Belum ada / keterbatasan yang disengaja:
- Aktivitas baca/tulis disk di PC Health ditampilkan sebagai "tidak tersedia" (hanya kapasitas yang ditampilkan).
- Bahasa antarmuka hanya Indonesia.
- Folder kosong yang tersisa setelah pembersihan tidak dihapus (lebih aman).
- File thumbcache biasanya dikunci Explorer, jadi banyak yang akan dilaporkan "dilewati".
- File di `C:\Windows\Temp` yang butuh hak administrator dilewati (aplikasi tidak pernah meminta elevasi).

## Prasyarat (Windows)
1. [Node.js 20+](https://nodejs.org)
2. [Rust](https://rustup.rs) (toolchain `stable-x86_64-pc-windows-msvc`)
3. **Visual Studio Build Tools** dengan workload "Desktop development with C++"
4. **WebView2 Runtime**: sudah ada di Windows 11. Pada Windows 10 lama, installer CleanPC mengunduhnya otomatis (`downloadBootstrapper`). Untuk instalasi offline ubah `webviewInstallMode` di `src-tauri/tauri.conf.json` menjadi `embedBootstrapper`/`offlineInstaller`.

## Menjalankan dan membangun

```powershell
npm install
npm run tauri dev        # mode pengembangan
npm run tauri build      # installer produksi
```

Hasil build: `target\release\bundle\nsis\CleanPC_0.1.0_x64-setup.exe` (instal per-pengguna, tanpa admin) dan `target\release\bundle\msi\*.msi`.

**Tanpa Windows di tangan:** unggah folder ini ke repository GitHub; workflow `.github/workflows/build-windows.yml` menjalankan tes, lint, dan membangun installer di runner Windows, hasilnya ada di *Actions → Artifacts*.

## Pengujian

```powershell
npm run test:rust   # 17 tes keamanan (path traversal, symlink, file berubah, dst.)
npm run lint ; npm run typecheck ; npm run format:check
```

Tes memakai direktori sementara; tidak pernah menyentuh folder Windows atau data pengguna.

## Checklist uji manual di Windows 11

1. Dashboard menampilkan nama PC, versi Windows, dan kapasitas drive C: yang cocok dengan File Explorer.
2. Buat file uji di `%TEMP%` (mis. `echo x > %TEMP%\uji.tmp`, lalu atur usia minimum ke 0 di Pengaturan). Scan → Review Results → file muncul "Layak".
3. Clean Selected → konfirmasi → laporan; file `uji.tmp` hilang, file `.docx`/`.pdf` di Temp tetap ada.
4. Buka Chrome/Edge, scan cache browser: harus ada peringatan dan file "Dilewati: Browser sedang berjalan". Tutup browser, scan ulang, baru "Layak".
5. Cancel Scan di tengah scan: tombol Clean menjadi nonaktif.
6. Buat junction `mklink /J %TEMP%\tautan C:\Users\<nama>\Documents`; scan tidak boleh menghitung isi Documents dan menampilkan peringatan tautan dilewati.
7. Storage Analyzer pada folder Unduhan: ukuran cocok dengan Properties folder (perkiraan).
8. PC Health: CPU/RAM bergerak; menutup halaman menghentikan polling.
9. Riwayat mencatat scan dan pembersihan tanpa path.

## Arsitektur

```
crates/cleanpc-core/   Logika inti tanpa Tauri (mudah diuji)
  guard.rs     lokasi terlarang, validasi root, deteksi reparse point
  rules.rs     aturan eksplisit per kategori (lokasi, pola nama, pengecualian)
  scanner.rs   pemindaian + pembatalan + progress
  cleaner.rs   validasi ulang tiap item sebelum menghapus
  analyzer.rs  ukuran direktori (hanya baca)
  store.rs     pengaturan + riwayat (JSON lokal, tanpa path)
src-tauri/     Tauri 2: command, event, state (capabilities: core:default + dialog:allow-open)
src/           React/TS: halaman, store (Zustand), service API
```

### Model keamanan
- Frontend **tidak pernah mengirim path untuk dihapus**. Backend menyimpan hasil scan; frontend hanya mengirim `scan_id` + id kategori.
- Pembersihan butuh: hasil scan ada, sudah ditinjau (`mark_reviewed`), dan `confirmed = true`.
- Tiap file divalidasi ulang: bukan symlink/reparse point, path kanonik tetap di dalam root kategori, pola nama cocok, bukan dokumen/kunci, tidak berubah sejak scan (ukuran + waktu ubah), cukup lama, browser tidak berjalan.
- Root yang sama dengan/induk dari folder terlindungi (System32, WinSxS, Installer, Documents, Desktop, Downloads, Pictures, Videos, OneDrive, AppData\Roaming, profil pengguna, Windows) ditolak.
- Tidak ada `del /s`, `rd /s`, atau shell; hanya `std::fs` dengan validasi. Aplikasi tidak meminta hak administrator.
