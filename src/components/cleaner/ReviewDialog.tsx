import { useCallback, useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useAppStore } from '../../hooks/useAppStore'
import { Modal } from '../shared/Modal'
import { Badge, Button, EmptyState, ErrorState, Spinner } from '../shared/ui'
import { formatBytes, formatDateTime, formatNumber } from '../../utils/format'
import type { ItemPage } from '../../types'

const PAGE = 100
type Sort = 'size' | 'modified' | 'path' | 'status'

export function ReviewDialog() {
  const { results, scanId, selected, setReviewOpen, markReviewed, toast } = useAppStore()
  const cats = Object.values(results).filter((r) => r.scan_status === 'completed' && r.files_found > 0)
  const [cat, setCat] = useState(
    cats.find((c) => selected.includes(c.category_id))?.category_id ?? cats[0]?.category_id ?? '',
  )
  const [sort, setSort] = useState<Sort>('size')
  const [desc, setDesc] = useState(true)
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<ItemPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!scanId || !cat) return
    setError(null)
    try {
      setPage(await api.scanItems(scanId, cat, sort, desc, offset, PAGE))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat daftar file.')
    }
  }, [scanId, cat, sort, desc, offset])

  useEffect(() => {
    void load()
  }, [load])

  const finish = async () => {
    if (scanId) {
      try {
        await api.markReviewed(scanId)
        markReviewed()
      } catch (e) {
        toast('error', e instanceof Error ? e.message : 'Gagal menandai hasil telah ditinjau.')
      }
    }
    setReviewOpen(false)
  }

  const head = (key: Sort, label: string) => (
    <button
      className="uppercase tracking-wide hover:text-fg"
      onClick={() => {
        if (sort === key) setDesc(!desc)
        else {
          setSort(key)
          setDesc(true)
        }
        setOffset(0)
      }}
    >
      {label} {sort === key ? (desc ? '↓' : '↑') : ''}
    </button>
  )

  return (
    <Modal
      wide
      title="Tinjau hasil scan"
      onClose={() => void finish()}
      footer={
        <Button variant="primary" onClick={() => void finish()}>
          Selesai meninjau
        </Button>
      }
    >
      {cats.length === 0 ? (
        <EmptyState
          title="Tidak ada file pada hasil scan"
          hint="Tidak ada yang perlu dibersihkan dari kategori yang dipindai."
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {cats.map((c) => (
              <button
                key={c.category_id}
                onClick={() => {
                  setCat(c.category_id)
                  setOffset(0)
                }}
                className={`rounded-md border px-3 py-1.5 ${cat === c.category_id ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg'}`}
              >
                {c.category_name} <span className="text-xs">({formatNumber(c.files_found)})</span>
              </button>
            ))}
          </div>
          <p className="mb-3 text-xs text-muted">
            File berlabel “Dilewati” tidak akan dihapus (misalnya baru diubah, dokumen/kunci, atau browser
            sedang berjalan). Path ditampilkan secara ringkas dan hanya untuk dilihat.
          </p>
          {error && <ErrorState message={error} onRetry={() => void load()} />}
          {!page && !error && <Spinner />}
          {page && (
            <>
              <div className="overflow-auto rounded-md border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface2 text-muted">
                    <tr>
                      <th className="px-3 py-2">{head('path', 'Lokasi')}</th>
                      <th className="px-3 py-2 text-right">{head('size', 'Ukuran')}</th>
                      <th className="px-3 py-2">{head('modified', 'Diubah')}</th>
                      <th className="px-3 py-2">{head('status', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((it) => (
                      <tr key={it.id} className="border-t border-line">
                        <td className="max-w-[420px] truncate px-3 py-1.5 font-mono" title={it.display_path}>
                          {it.display_path}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatBytes(it.size)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-muted">
                          {formatDateTime(it.modified_ms)}
                        </td>
                        <td className="px-3 py-1.5">
                          {it.eligible ? (
                            <Badge tone="ok">Layak</Badge>
                          ) : (
                            <Badge tone="warn">Dilewati: {it.reason}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between text-muted">
                <span>
                  {formatNumber(Math.min(offset + 1, page.total))}–
                  {formatNumber(Math.min(offset + PAGE, page.total))} dari {formatNumber(page.total)}
                </span>
                <span className="flex gap-2">
                  <Button onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0}>
                    Sebelumnya
                  </Button>
                  <Button onClick={() => setOffset(offset + PAGE)} disabled={offset + PAGE >= page.total}>
                    Berikutnya
                  </Button>
                </span>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
