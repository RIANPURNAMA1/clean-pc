import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { api } from '../../services/api'
import { useAppStore } from '../../hooks/useAppStore'
import { Badge, Button, Card, EmptyState, PageTitle } from '../shared/ui'
import { Modal } from '../shared/Modal'
import { formatBytes, formatDateTime, formatNumber } from '../../utils/format'

const catName = (id: string) =>
  ({
    windows_temp: 'Temp Windows',
    user_temp: 'Temp pengguna',
    thumbnail_cache: 'Thumbnail',
    browser_cache: 'Browser',
    app_cache: 'Cache aplikasi',
    app_logs: 'Log',
  })[id] ?? id

export function HistoryPage() {
  const { history, loadHistory, toast } = useAppStore()
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    void loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const clear = async () => {
    try {
      await api.clearHistory()
      await loadHistory()
      toast('success', 'Riwayat dihapus.')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Gagal menghapus riwayat.')
    }
    setConfirm(false)
  }
  return (
    <div>
      <PageTitle
        title="Riwayat"
        subtitle="Catatan lokal aktivitas scan dan pembersihan. Tidak menyimpan isi file maupun path lengkap."
        actions={
          <Button onClick={() => setConfirm(true)} disabled={history.length === 0}>
            <Trash2 className="h-4 w-4" /> Hapus riwayat
          </Button>
        }
      />
      {history.length === 0 ? (
        <Card>
          <EmptyState
            title="Belum ada riwayat"
            hint="Aktivitas scan dan pembersihan akan tercatat di sini."
          />
        </Card>
      ) : (
        <Card>
          <table className="w-full text-left">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Terdeteksi</th>
                <th className="px-4 py-3 text-right">Dibersihkan</th>
                <th className="px-4 py-3">Dilewati / gagal</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(h.timestamp_ms)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={h.kind === 'clean' ? 'ok' : 'accent'}>
                      {h.kind === 'clean' ? 'Pembersihan' : 'Scan'}
                    </Badge>
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-muted">
                    {h.categories.map(catName).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(h.files_found)} file
                    <div className="text-xs text-muted">
                      {h.kind === 'scan' ? formatBytes(h.bytes_found) : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {h.kind === 'clean' ? (
                      <>
                        {formatNumber(h.files_deleted)} file
                        <div className="text-xs text-muted">{formatBytes(h.bytes_deleted)}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {h.kind === 'clean' ? (
                      <>
                        {formatNumber(h.files_skipped)} dilewati • {formatNumber(h.files_failed)} gagal
                        {h.failure_reasons.map((r) => (
                          <div key={r}>• {r}</div>
                        ))}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {confirm && (
        <Modal
          title="Hapus seluruh riwayat?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button onClick={() => setConfirm(false)}>Batal</Button>
              <Button variant="danger" onClick={() => void clear()}>
                Hapus
              </Button>
            </>
          }
        >
          Catatan aktivitas akan dihapus permanen dari perangkat ini. File di komputer Anda tidak terpengaruh.
        </Modal>
      )}
    </div>
  )
}
