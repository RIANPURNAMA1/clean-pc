import { useEffect, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'
import { api } from '../../services/api'
import { Badge, Card, ErrorState, PageTitle, ProgressBar, Spinner, Stat } from '../shared/ui'
import { formatBytes, percent } from '../../utils/format'
import type { SystemInfo } from '../../types'

const MAX_POINTS = 60

export function HealthPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cpu, setCpu] = useState<{ t: number; v: number }[]>([])
  const [mem, setMem] = useState<{ t: number; v: number }[]>([])
  const tick = useRef(0)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const d = await api.liveStats()
        if (!alive) return
        setInfo(d)
        setError(null)
        tick.current += 1
        const t = tick.current
        if (d.cpu_usage != null)
          setCpu((p) => [...p.slice(-(MAX_POINTS - 1)), { t, v: +d.cpu_usage!.toFixed(1) }])
        if (d.memory_available != null)
          setMem((p) => [
            ...p.slice(-(MAX_POINTS - 1)),
            { t, v: +percent(d.memory_total - d.memory_available!, d.memory_total).toFixed(1) },
          ])
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Gagal membaca data sistem.')
      }
      if (alive) timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  const memUsed = info && info.memory_available != null ? info.memory_total - info.memory_available : null

  return (
    <div>
      <PageTitle
        title="PC Health"
        subtitle="Data aktual dari sistem, diperbarui setiap 2 detik hanya saat halaman ini dibuka."
      />
      {error && <ErrorState message={error} />}
      {!info && !error && <Spinner label="Membaca data sistem…" />}
      {info && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Stat
              label="CPU"
              value={info.cpu_usage != null ? `${info.cpu_usage.toFixed(0)}%` : 'Tidak tersedia'}
              hint={info.cpu_cores ? `${info.cpu_cores} thread logis` : undefined}
            />
            <Stat
              label="RAM terpakai"
              value={
                memUsed != null ? `${percent(memUsed, info.memory_total).toFixed(0)}%` : 'Tidak tersedia'
              }
              hint={
                memUsed != null ? `${formatBytes(memUsed)} dari ${formatBytes(info.memory_total)}` : undefined
              }
            />
            <Stat
              label="Kapasitas RAM"
              value={info.memory_total > 0 ? formatBytes(info.memory_total) : 'Tidak tersedia'}
            />
            <Stat label="Sistem operasi" value={info.os_version ?? info.os_name ?? 'Tidak tersedia'} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Spark title="Penggunaan CPU (%)" data={cpu} color="rgb(59 130 246)" />
            <Spark title="Penggunaan RAM (%)" data={mem} color="rgb(34 197 94)" />
          </div>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between font-medium">
              <span>Kapasitas disk</span>
              <Badge>Aktivitas baca/tulis disk: tidak tersedia</Badge>
            </div>
            <ul className="space-y-3">
              {info.drives.map((d) => (
                <li key={d.mount_point}>
                  <div className="mb-1 flex justify-between">
                    <span>{d.mount_point}</span>
                    <span className="text-muted">
                      {formatBytes(d.used_bytes)} / {formatBytes(d.total_bytes)}
                    </span>
                  </div>
                  <ProgressBar value={percent(d.used_bytes, d.total_bytes)} />
                </li>
              ))}
              {info.drives.length === 0 && <li className="text-muted">Informasi disk tidak tersedia.</li>}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}

function Spark({ title, data, color }: { title: string; data: { t: number; v: number }[]; color: string }) {
  return (
    <Card className="p-5">
      <div className="mb-2 font-medium">{title}</div>
      <div className="h-40">
        {data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-muted">Mengumpulkan data…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
              <YAxis domain={[0, 100]} stroke="rgb(var(--muted))" width={32} />
              <Line
                type="monotone"
                dataKey="v"
                stroke={color}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
