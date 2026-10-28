import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownUp, Eraser, Eye, RefreshCw, ScanSearch, Square, XCircle } from 'lucide-react'
import { selectedTotals, useAppStore } from '../../hooks/useAppStore'
import { Badge, Button, Card, EmptyState, ErrorState, PageTitle, ProgressBar, Spinner } from '../shared/ui'
import { formatBytes, formatNumber } from '../../utils/format'
import type { CategoryInfo, ScanResult } from '../../types'

type SortKey = 'name' | 'files' | 'size'

function statusBadge(c: CategoryInfo, r: ScanResult | undefined, scanning: boolean, current: boolean) {
  if (!c.available) return <Badge tone="neutral">Tidak tersedia</Badge>
  if (scanning && current) return <Badge tone="accent">Memindai…</Badge>
  if (scanning && !r) return <Badge>Menunggu</Badge>
  if (!r) return <Badge>Belum discan</Badge>
  if (r.scan_status === 'completed') return <Badge tone="ok">Selesai</Badge>
  if (r.scan_status === 'cancelled') return <Badge tone="warn">Dibatalkan</Badge>
  return <Badge>Tidak tersedia</Badge>
}

export function JunkCleanerPage() {
  const s = useAppStore()
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [desc, setDesc] = useState(false)

  useEffect(() => {
    void s.loadCategories()
    void s.syncSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scanning = s.scanState === 'scanning'
  const cleaning = s.cleanState === 'cleaning'
  const totals = selectedTotals(s)
  const currentId = scanning
    ? s.selected.filter((id) => s.categories.find((c) => c.id === id)?.available)[s.scanIndex]
    : undefined

  const rows = useMemo(() => {
    const list = [...s.categories]
    const val = (c: CategoryInfo) =>
      sortKey === 'files'
        ? (s.results[c.id]?.files_found ?? -1)
        : sortKey === 'size'
          ? (s.results[c.id]?.total_bytes ?? -1)
          : c.name.toLowerCase()
    list.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1)
    })
    return list
  }, [s.categories, s.results, sortKey, desc])

  const setSort = (k: SortKey) => {
    if (k === sortKey) setDesc(!desc)
    else {
      setSortKey(k)
      setDesc(k !== 'name')
    }
  }
  const hasResults = Object.keys(s.results).length > 0
  const canReview = s.scanState === 'done' && hasResults
  const canClean = s.scanState === 'done' && s.reviewed && totals.files > 0 && !cleaning
  const overall = s.scanTotal > 0 ? (s.scanIndex / s.scanTotal) * 100 : 0

  return (
    <div>
      <PageTitle
        title="Junk Cleaner"
        subtitle="Pindai, tinjau, lalu bersihkan file sementara dan cache yang aman dihapus."
        actions={
          <>
            {scanning ? (
              <Button variant="danger" onClick={() => void s.cancelScan()}>
                <Square className="h-4 w-4" /> Cancel Scan
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void s.startScan()}
                disabled={cleaning || s.selected.length === 0}
              >
                <ScanSearch className="h-4 w-4" /> Scan Now
              </Button>
            )}
            <Button onClick={() => void s.startScan()} disabled={scanning || cleaning || !hasResults}>
              <RefreshCw className="h-4 w-4" /> Rescan
            </Button>
            <Button onClick={() => s.setReviewOpen(true)} disabled={!canReview}>
              <Eye className="h-4 w-4" /> Review Results
            </Button>
            <Button
              variant="primary"
              onClick={s.requestClean}
              disabled={!canClean}
              title={s.reviewed ? '' : 'Tinjau hasil terlebih dahulu.'}
            >
              <Eraser className="h-4 w-4" /> Clean Selected
            </Button>
            <Button
              variant="ghost"
              onClick={s.clearSelection}
              disabled={scanning || cleaning || s.selected.length === 0}
            >
              <XCircle className="h-4 w-4" /> Clear Selection
            </Button>
          </>
        }
      />

      {s.categoriesError && (
        <ErrorState message={s.categoriesError} onRetry={() => void s.loadCategories()} />
      )}
      {!s.categoriesError && s.categories.length === 0 && <Spinner label="Memuat kategori…" />}

      {scanning && (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex justify-between text-muted">
            <span>
              Memindai kategori {Math.min(s.scanIndex + 1, s.scanTotal)} dari {s.scanTotal}
            </span>
            <span>
              {currentId
                ? `${formatNumber(s.progress[currentId]?.files ?? 0)} file • ${formatBytes(s.progress[currentId]?.bytes ?? 0)}`
                : ''}
            </span>
          </div>
          <ProgressBar value={overall} indeterminate={overall === 0} />
        </Card>
      )}

      {s.scanState === 'done' && !s.reviewed && hasResults && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-4 py-2.5 text-warn">
          <AlertTriangle className="h-4 w-4" /> Scan selesai. Klik <b>Review Results</b> untuk meninjau file
          sebelum membersihkan.
        </div>
      )}

      {s.categories.length > 0 && (
        <Card>
          <table className="w-full text-left">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-4 py-3" />
                <HeadCell label="Kategori" onClick={() => setSort('name')} />
                <HeadCell label="File" onClick={() => setSort('files')} right />
                <HeadCell label="Ukuran" onClick={() => setSort('size')} right />
                <th className="px-4 py-3">Status scan</th>
                <th className="px-4 py-3">Pembersihan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const r = s.results[c.id]
                const cleaned = s.report?.by_category.find((x) => x.category_id === c.id)
                return (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[rgb(var(--accent))]"
                        checked={s.selected.includes(c.id)}
                        disabled={!c.available || scanning || cleaning}
                        onChange={() => s.toggleCategory(c.id)}
                        aria-label={`Pilih ${c.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="max-w-md text-xs text-muted">{c.description}</div>
                      {c.warning && <div className="mt-1 text-xs text-warn">{c.warning}</div>}
                      {r?.warnings.map((w) => (
                        <div key={w} className="mt-1 text-xs text-muted">
                          • {w}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r ? (
                        <>
                          {formatNumber(r.files_found)}
                          <div className="text-xs text-muted">{formatNumber(r.eligible_files)} layak</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r ? (
                        <>
                          {formatBytes(r.total_bytes)}
                          <div className="text-xs text-muted">{formatBytes(r.eligible_bytes)} layak</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(c, r, scanning, c.id === currentId)}</td>
                    <td className="px-4 py-3">
                      {cleaning && s.selected.includes(c.id) ? (
                        <Badge tone="warn">Berjalan…</Badge>
                      ) : cleaned ? (
                        <Badge tone="ok">
                          {formatNumber(cleaned.files_deleted)} file • {formatBytes(cleaned.bytes_deleted)}
                        </Badge>
                      ) : (
                        <Badge>—</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-muted">
            <span>
              Dipilih: <b className="text-fg">{s.selected.length}</b> kategori
            </span>
            <span className="flex items-center gap-1">
              <ArrowDownUp className="h-3.5 w-3.5" /> Urutkan dengan klik judul kolom
            </span>
            <span>
              Layak dibersihkan: <b className="text-fg">{formatNumber(totals.files)}</b> file •{' '}
              <b className="text-fg">{formatBytes(totals.bytes)}</b>
            </span>
          </div>
        </Card>
      )}
      {s.categories.length > 0 && !hasResults && !scanning && (
        <EmptyState
          title="Belum ada hasil scan"
          hint="Pilih kategori lalu tekan Scan Now. Tidak ada file yang dihapus sebelum Anda meninjau dan mengonfirmasi."
        />
      )}
    </div>
  )
}

function HeadCell({
  label,
  onClick,
  right = false,
}: {
  label: string
  onClick: () => void
  right?: boolean
}) {
  return (
    <th className={`px-4 py-3 ${right ? 'text-right' : ''}`}>
      <button onClick={onClick} className="uppercase tracking-wide hover:text-fg">
        {label}
      </button>
    </th>
  )
}
