import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useAppStore } from '../../hooks/useAppStore'
import { Button, Card, PageTitle, Spinner } from '../shared/ui'
import type { Settings } from '../../types'

const CATS = [
  ['windows_temp', 'File sementara Windows'],
  ['user_temp', 'File sementara pengguna'],
  ['thumbnail_cache', 'Cache thumbnail'],
  ['browser_cache', 'Cache browser'],
  ['app_cache', 'Cache aplikasi tertentu'],
  ['app_logs', 'Log dan laporan crash'],
] as const

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-3 last:border-0">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="max-w-md text-xs text-muted">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

const input = 'rounded-md border border-line bg-surface2 px-2.5 py-1.5'

export function SettingsPage() {
  const { settings, saveSettings, loadSettings } = useAppStore()
  const [draft, setDraft] = useState<Settings | null>(settings)
  useEffect(() => {
    if (!settings) void loadSettings()
    else setDraft(settings)
  }, [settings, loadSettings])

  if (!draft) return <Spinner label="Memuat pengaturan…" />
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft({ ...draft, [k]: v })
  const num =
    (k: 'min_age_minutes' | 'max_files_per_category' | 'max_scan_depth' | 'history_retention_days') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, Math.max(0, Number(e.target.value) || 0))
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  return (
    <div>
      <PageTitle
        title="Pengaturan"
        actions={
          <Button variant="primary" disabled={!dirty} onClick={() => void saveSettings(draft)}>
            <Save className="h-4 w-4" /> Simpan
          </Button>
        }
      />
      <div className="space-y-4">
        <Card className="px-5">
          <Row label="Tema aplikasi">
            <select
              className={input}
              value={draft.theme}
              onChange={(e) => set('theme', e.target.value as Settings['theme'])}
            >
              <option value="dark">Gelap</option>
              <option value="light">Terang</option>
            </select>
          </Row>
          <Row label="Bahasa antarmuka" hint="Saat ini hanya Bahasa Indonesia yang tersedia.">
            <select className={input} value="id" disabled>
              <option value="id">Bahasa Indonesia</option>
            </select>
          </Row>
          <Row
            label="Konfirmasi sebelum membersihkan"
            hint="Dianjurkan tetap aktif. Penghapusan selalu memerlukan klik eksplisit Anda dan hasil scan yang sudah ditinjau."
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--accent))]"
              checked={draft.confirm_before_clean}
              onChange={(e) => set('confirm_before_clean', e.target.checked)}
            />
          </Row>
        </Card>
        <Card className="px-5">
          <div className="pt-4 font-medium">Kategori scan</div>
          <div className="grid grid-cols-2 gap-2 py-3">
            {CATS.map(([id, name]) => (
              <label key={id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                  checked={draft.enabled_categories.includes(id)}
                  onChange={(e) =>
                    set(
                      'enabled_categories',
                      e.target.checked
                        ? [...draft.enabled_categories, id]
                        : draft.enabled_categories.filter((c) => c !== id),
                    )
                  }
                />
                {name}
              </label>
            ))}
          </div>
          <Row
            label="Bersihkan cache browser"
            hint="Jika dimatikan, kategori cache browser tidak akan dipindai maupun dibersihkan. Cookie, sandi, dan riwayat tidak pernah disentuh."
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--accent))]"
              checked={draft.clean_browser_cache}
              onChange={(e) => set('clean_browser_cache', e.target.checked)}
            />
          </Row>
        </Card>
        <Card className="px-5">
          <Row
            label="Usia minimum file (menit)"
            hint="File yang diubah lebih baru dari ini dilewati agar tidak mengganggu aplikasi yang sedang berjalan."
          >
            <input
              type="number"
              min={0}
              className={`${input} w-28`}
              value={draft.min_age_minutes}
              onChange={num('min_age_minutes')}
            />
          </Row>
          <Row label="Batas file per kategori" hint="Membatasi cakupan scan (1.000 – 1.000.000).">
            <input
              type="number"
              min={1000}
              className={`${input} w-28`}
              value={draft.max_files_per_category}
              onChange={num('max_files_per_category')}
            />
          </Row>
          <Row label="Kedalaman folder maksimum" hint="1 – 20.">
            <input
              type="number"
              min={1}
              max={20}
              className={`${input} w-28`}
              value={draft.max_scan_depth}
              onChange={num('max_scan_depth')}
            />
          </Row>
          <Row label="Retensi riwayat (hari)" hint="Catatan lebih lama dari ini dihapus otomatis.">
            <input
              type="number"
              min={1}
              className={`${input} w-28`}
              value={draft.history_retention_days}
              onChange={num('history_retention_days')}
            />
          </Row>
        </Card>
        <p className="text-xs text-muted">
          Pembersihan otomatis terjadwal tidak tersedia dan tidak pernah dijalankan tanpa tindakan Anda.
        </p>
      </div>
    </div>
  )
}
