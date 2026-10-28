import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { Card, PageTitle } from '../shared/ui'
import type { AppInfo } from '../../types'

export function AboutPage() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    api
      .appInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])
  return (
    <div>
      <PageTitle title="Tentang Aplikasi" />
      <div className="space-y-4">
        <Card className="p-5">
          <div className="text-lg font-semibold">CleanPC {info ? `v${info.version}` : ''}</div>
          <p className="mt-1 text-muted">
            Pembersih cache dan file sementara untuk Windows. Ringan, transparan, dan aman: tidak ada login,
            server, analytics, atau pengiriman data.
          </p>
          {info && (
            <p className="mt-2 text-xs text-muted">
              Tauri {info.tauri_version} • OS: {info.os}
            </p>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-2 font-medium">Yang dibersihkan</div>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Folder Temp Windows dan pengguna (dokumen, kunci, media, dan file baru dikecualikan).</li>
            <li>Cache thumbnail dan ikon File Explorer.</li>
            <li>Cache Chrome, Edge, Brave, Firefox saat browser ditutup.</li>
            <li>INetCache, cache shader DirectX, crash dump, dan arsip WER milik pengguna.</li>
          </ul>
          <div className="mb-2 mt-4 font-medium">Yang tidak pernah disentuh</div>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>System32, WinSxS, Windows Installer, registry, dan folder sistem lain.</li>
            <li>Documents, Desktop, Downloads, Pictures, Videos, OneDrive.</li>
            <li>Cookie, sandi, riwayat, dan sesi browser; database dan konfigurasi aplikasi.</li>
          </ul>
        </Card>
        <Card className="p-5 text-muted">
          Penghapusan bersifat permanen dan hanya terjadi setelah Anda meninjau hasil scan dan mengonfirmasi.
          Setiap file diperiksa ulang tepat sebelum dihapus. Jika WebView2 Runtime belum ada, installer akan
          mengunduhnya otomatis (Windows 11 sudah menyertakannya).
        </Card>
      </div>
    </div>
  )
}
