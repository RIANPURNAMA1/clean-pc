import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { File, Folder, FolderSearch, Square } from 'lucide-react'
import { api } from '../../services/api'
import { useAppStore } from '../../hooks/useAppStore'
import { Badge, Button, Card, EmptyState, ErrorState, PageTitle, ProgressBar, Spinner } from '../shared/ui'
import { formatBytes, formatNumber, percent } from '../../utils/format'
import type { DirAnalysis, KnownFolder } from '../../types'

const GB = 1024 ** 3

export function StoragePage() {
  const { system, systemError, loadSystem } = useAppStore()
  const [folders, setFolders] = useState<KnownFolder[]>([])
  const [depth, setDepth] = useState(6)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<DirAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadSystem()
    api
      .knownFolders()
      .then(setFolders)
      .catch(() => setFolders([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async (path: string) => {
    setBusy(path)
    setError(null)
    try {
      setResult(await api.analyze(path, depth))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analisis gagal.')
    } finally {
      setBusy(null)
    }
  }
  const pick = async () => {
    const p = await api.pickFolder()
    if (p) void run(p)
  }

  const chart = (system?.drives ?? []).map((d) => ({
    name: d.mount_point,
    Terpakai: +(d.used_bytes / GB).toFixed(1),
    Tersedia: +(d.available_bytes / GB).toFixed(1),
  }))
  const max = result?.entries[0]?.bytes ?? 0

  return (
    <div>
      <PageTitle
        title="Storage Analyzer"
        subtitle="Lihat pemakaian drive dan analisis ukuran folder yang Anda pilih (hanya baca)."
      />
      {systemError && <ErrorState message={systemError} onRetry={() => void loadSystem()} />}
      {!system && !systemError && <Spinner label="Membaca drive…" />}
      {system && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="mb-3 font-medium">Drive</div>
              {system.drives.length === 0 ? (
                <div className="text-muted">Tidak ada drive yang terdeteksi.</div>
              ) : (
                <ul className="space-y-4">
                  {system.drives.map((d) => (
                    <li key={d.mount_point}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">
                          {d.mount_point} {d.name && <span className="text-muted">({d.name})</span>}
                        </span>
                        <span className="text-muted">
                          {percent(d.used_bytes, d.total_bytes).toFixed(0)}% terpakai
                        </span>
                      </div>
                      <ProgressBar value={percent(d.used_bytes, d.total_bytes)} />
                      <div className="mt-1 text-xs text-muted">
                        {formatBytes(d.used_bytes)} dari {formatBytes(d.total_bytes)} • tersedia{' '}
                        {formatBytes(d.available_bytes)} • {d.file_system}
                        {d.is_removable && ' • removable'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-5">
              <div className="mb-3 font-medium">Grafik pemakaian (GB)</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart}>
                    <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
                    <XAxis dataKey="name" stroke="rgb(var(--muted))" />
                    <YAxis stroke="rgb(var(--muted))" />
                    <Tooltip
                      contentStyle={{
                        background: 'rgb(var(--surface))',
                        border: '1px solid rgb(var(--line))',
                        borderRadius: 6,
                      }}
                    />
                    <Bar dataKey="Terpakai" stackId="a" fill="rgb(59 130 246)" />
                    <Bar dataKey="Tersedia" stackId="a" fill="rgb(100 116 139)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="font-medium">Analisis folder</div>
              <div className="flex items-center gap-2">
                <label className="text-muted" htmlFor="depth">
                  Kedalaman maks.
                </label>
                <select
                  id="depth"
                  value={depth}
                  onChange={(e) => setDepth(+e.target.value)}
                  className="rounded-md border border-line bg-surface2 px-2 py-1.5"
                >
                  {[2, 4, 6, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <Button variant="primary" onClick={() => void pick()} disabled={!!busy}>
                  <FolderSearch className="h-4 w-4" /> Pilih folder…
                </Button>
                {busy && (
                  <Button variant="danger" onClick={() => void api.cancelAnalysis()}>
                    <Square className="h-4 w-4" /> Batalkan
                  </Button>
                )}
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {folders.map((f) => (
                <Button key={f.path} onClick={() => void run(f.path)} disabled={!!busy} title={f.path}>
                  {f.label}
                </Button>
              ))}
            </div>
            <p className="mb-3 text-xs text-muted">
              Analisis hanya membaca ukuran. Tautan simbolik dan reparse point dilewati, folder tanpa izin
              akses diabaikan, dan pemindaian dibatasi waktu/jumlah entri.
            </p>
            {busy && <Spinner label="Menganalisis folder…" />}
            {error && <ErrorState message={error} />}
            {!busy && !error && !result && (
              <EmptyState
                title="Belum ada folder dianalisis"
                hint="Pilih folder cepat di atas atau gunakan Pilih folder…"
              />
            )}
            {!busy && result && (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-muted">
                  <span className="break-all font-mono text-fg">{result.path}</span>
                  <Badge tone="accent">{formatBytes(result.total_bytes)}</Badge>
                  <Badge>{formatNumber(result.total_files)} file</Badge>
                  {result.skipped_dirs > 0 && (
                    <Badge tone="warn">{formatNumber(result.skipped_dirs)} dilewati</Badge>
                  )}
                  {result.truncated && <Badge tone="warn">Hasil sebagian (dibatasi)</Badge>}
                </div>
                {result.entries.length === 0 ? (
                  <EmptyState title="Folder kosong" />
                ) : (
                  <ul className="divide-y divide-line rounded-md border border-line">
                    {result.entries.map((e) => (
                      <li key={e.name} className="flex items-center gap-3 px-3 py-2">
                        {e.is_dir ? (
                          <Folder className="h-4 w-4 shrink-0 text-accent" />
                        ) : (
                          <File className="h-4 w-4 shrink-0 text-muted" />
                        )}
                        <span className="w-64 truncate" title={e.name}>
                          {e.name}
                        </span>
                        <div className="flex-1">
                          <ProgressBar value={percent(e.bytes, max)} />
                        </div>
                        <span className="w-24 text-right tabular-nums">{formatBytes(e.bytes)}</span>
                        <span className="w-24 text-right text-xs text-muted">
                          {formatNumber(e.files)} file
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
