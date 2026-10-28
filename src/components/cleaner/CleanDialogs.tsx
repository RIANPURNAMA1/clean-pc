import { AlertTriangle } from 'lucide-react'
import { selectedTotals, useAppStore } from '../../hooks/useAppStore'
import { Modal } from '../shared/Modal'
import { Badge, Button, ProgressBar } from '../shared/ui'
import { formatBytes, formatDateTime, formatNumber, percent } from '../../utils/format'

export function CleanDialogs() {
  const s = useAppStore()
  const totals = selectedTotals(s)
  const includesBrowser = s.selected.includes('browser_cache')

  return (
    <>
      {s.confirmOpen && (
        <Modal
          title="Konfirmasi pembersihan"
          onClose={() => s.setConfirmOpen(false)}
          footer={
            <>
              <Button onClick={() => s.setConfirmOpen(false)}>Batal</Button>
              <Button variant="danger" onClick={() => void s.performClean()}>
                Hapus {formatNumber(totals.files)} file
              </Button>
            </>
          }
        >
          <p>
            Anda akan menghapus <b>{formatNumber(totals.files)}</b> file ({formatBytes(totals.bytes)}) dari{' '}
            <b>{s.selected.length}</b> kategori. File akan dihapus permanen (tidak masuk Recycle Bin).
          </p>
          <p className="mt-3 text-muted">
            Sebelum dihapus, setiap file diperiksa ulang. File yang berubah sejak scan, terkunci, atau berada
            di luar lokasi yang diizinkan akan dilewati.
          </p>
          {includesBrowser && (
            <div className="mt-3 flex gap-2 rounded-md border border-warn/40 bg-warn/10 p-3 text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Membersihkan cache browser membuat sebagian halaman dimuat ulang lebih lambat dan data offline
                diunduh kembali. Cookie, sandi, dan riwayat tidak disentuh.
              </span>
            </div>
          )}
        </Modal>
      )}

      {s.cleanState === 'cleaning' && (
        <Modal
          title="Membersihkan…"
          onClose={() => undefined}
          closable={false}
          footer={
            <Button variant="danger" onClick={() => void s.cancelClean()}>
              Batalkan
            </Button>
          }
        >
          <ProgressBar
            value={percent(s.cleanProgress.done, s.cleanProgress.total)}
            indeterminate={s.cleanProgress.total === 0}
          />
          <div className="mt-3 flex justify-between text-muted">
            <span>
              {formatNumber(s.cleanProgress.done)} / {formatNumber(s.cleanProgress.total)} file diproses
            </span>
            <span>{formatBytes(s.cleanProgress.bytes)} dibebaskan</span>
          </div>
        </Modal>
      )}

      {s.cleanState === 'done' && s.report && (
        <Modal
          title="Laporan pembersihan"
          onClose={s.dismissReport}
          footer={
            <Button variant="primary" onClick={s.dismissReport}>
              Tutup
            </Button>
          }
        >
          <div className="mb-4 text-muted">
            {formatDateTime(s.report.completed_at)}{' '}
            {s.report.cancelled && <Badge tone="warn">Dibatalkan sebagian</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Box label="Ruang dibebaskan" value={formatBytes(s.report.bytes_deleted)} tone="ok" />
            <Box label="File dihapus" value={formatNumber(s.report.files_deleted)} tone="ok" />
            <Box label="File dilewati" value={formatNumber(s.report.files_skipped)} />
            <Box
              label="File gagal"
              value={formatNumber(s.report.files_failed)}
              tone={s.report.files_failed ? 'danger' : undefined}
            />
          </div>
          {s.report.errors.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 font-medium">Rincian file yang tidak terhapus</div>
              <ul className="space-y-1 text-muted">
                {s.report.errors.map((e) => (
                  <li key={e.reason + e.kind} className="flex justify-between">
                    <span>{e.reason}</span>
                    <Badge tone={e.kind === 'failed' ? 'danger' : 'neutral'}>{formatNumber(e.count)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">
            Angka di atas dihitung dari file yang benar-benar berhasil dihapus. Lakukan scan ulang untuk
            melihat kondisi terbaru.
          </p>
        </Modal>
      )}
    </>
  )
}

function Box({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'danger' }) {
  const c = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : ''
  return (
    <div className="rounded-md border border-line bg-surface2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-semibold ${c}`}>{value}</div>
    </div>
  )
}
