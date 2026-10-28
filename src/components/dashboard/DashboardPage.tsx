import { useEffect } from 'react'
import { Eraser, ScanSearch } from 'lucide-react'
import { selectedTotals, useAppStore } from '../../hooks/useAppStore'
import { Badge, Button, Card, ErrorState, PageTitle, ProgressBar, Spinner, Stat } from '../shared/ui'
import { formatBytes, formatDateTime, formatNumber, percent } from '../../utils/format'

export function DashboardPage() {
  const s = useAppStore()
  useEffect(() => {
    void s.loadSystem()
    void s.loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sys = s.system
  const drive = sys?.drives.find((d) => d.mount_point === sys.primary_drive) ?? sys?.drives[0]
  const totals = selectedTotals(s)
  const lastScan = s.history.find((h) => h.kind === 'scan')
  const canClean = s.scanState === 'done' && s.reviewed && totals.files > 0 && s.cleanState !== 'cleaning'
  const found = Object.values(s.results).reduce((a, r) => a + r.files_found, 0)
  const hasLive = s.scanState === 'done'

  const scanNow = () => {
    s.setPage('cleaner')
    void s.startScan()
  }
  const cleanNow = () => {
    s.setPage('cleaner')
    s.requestClean()
  }

  return (
    <div>
      <PageTitle
        title="Dashboard"
        subtitle="Ringkasan perangkat dan hasil pemindaian terakhir."
        actions={
          <>
            <Button
              variant="primary"
              onClick={scanNow}
              disabled={s.scanState === 'scanning' || s.cleanState === 'cleaning'}
            >
              <ScanSearch className="h-4 w-4" /> Scan Now
            </Button>
            <Button
              onClick={cleanNow}
              disabled={!canClean}
              title={canClean ? '' : 'Aktif setelah scan selesai dan hasilnya ditinjau di Junk Cleaner.'}
            >
              <Eraser className="h-4 w-4" /> Clean Now
            </Button>
          </>
        }
      />
      {s.systemError && <ErrorState message={s.systemError} onRetry={() => void s.loadSystem()} />}
      {!sys && !s.systemError && <Spinner label="Membaca informasi sistem…" />}
      {sys && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Nama perangkat" value={sys.device_name ?? 'Tidak tersedia'} />
            <Stat label="Sistem operasi" value={sys.os_version ?? sys.os_name ?? 'Tidak tersedia'} />
            <Stat
              label="Estimasi dapat dibebaskan"
              value={hasLive ? formatBytes(totals.bytes) : '—'}
              hint={
                hasLive
                  ? `${formatNumber(totals.files)} file memenuhi syarat (kategori terpilih)`
                  : 'Jalankan scan untuk mengetahui'
              }
            />
          </div>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-medium">Drive utama {drive ? `(${drive.mount_point})` : ''}</div>
              {drive && <Badge>{drive.file_system || 'FS tidak diketahui'}</Badge>}
            </div>
            {drive ? (
              <>
                <ProgressBar value={percent(drive.used_bytes, drive.total_bytes)} />
                <div className="mt-3 grid grid-cols-3 gap-4 text-muted">
                  <div>
                    Kapasitas: <span className="text-fg">{formatBytes(drive.total_bytes)}</span>
                  </div>
                  <div>
                    Terpakai: <span className="text-fg">{formatBytes(drive.used_bytes)}</span>
                  </div>
                  <div>
                    Tersedia: <span className="text-fg">{formatBytes(drive.available_bytes)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-muted">Informasi drive tidak tersedia.</div>
            )}
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="mb-2 font-medium">Scan terakhir</div>
              {hasLive ? (
                <div className="text-muted">
                  Sesi ini: <span className="text-fg">{formatNumber(found)}</span> file terdeteksi,{' '}
                  <span className="text-fg">
                    {formatBytes(Object.values(s.results).reduce((a, r) => a + r.total_bytes, 0))}
                  </span>
                  .
                  {!s.reviewed && <div className="mt-1 text-warn">Hasil belum ditinjau di Junk Cleaner.</div>}
                </div>
              ) : lastScan ? (
                <div className="text-muted">
                  {formatDateTime(lastScan.timestamp_ms)}:{' '}
                  <span className="text-fg">{formatNumber(lastScan.files_found)}</span> file terdeteksi,{' '}
                  <span className="text-fg">{formatBytes(lastScan.bytes_found)}</span>. Lakukan scan ulang
                  sebelum membersihkan.
                </div>
              ) : (
                <div className="text-muted">Belum ada scan. Tekan Scan Now untuk memulai.</div>
              )}
            </Card>
            <Card className="p-5">
              <div className="mb-2 font-medium">Aktivitas terakhir</div>
              {s.history.length === 0 ? (
                <div className="text-muted">Belum ada aktivitas.</div>
              ) : (
                <ul className="space-y-1.5">
                  {s.history.slice(0, 4).map((h) => (
                    <li key={h.id} className="flex items-center justify-between text-muted">
                      <span>
                        <Badge tone={h.kind === 'clean' ? 'ok' : 'accent'}>
                          {h.kind === 'clean' ? 'Bersih' : 'Scan'}
                        </Badge>{' '}
                        {h.kind === 'clean'
                          ? `${formatBytes(h.bytes_deleted)} dibebaskan`
                          : `${formatBytes(h.bytes_found)} terdeteksi`}
                      </span>
                      <span className="text-xs">{formatDateTime(h.timestamp_ms)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
