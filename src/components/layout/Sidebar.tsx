import { Activity, Eraser, HardDrive, History, Info, LayoutDashboard, Settings } from 'lucide-react'
import type { PageId } from '../../types'
import { useAppStore } from '../../hooks/useAppStore'

const items: { id: PageId; label: string; icon: typeof Info }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'cleaner', label: 'Junk Cleaner', icon: Eraser },
  { id: 'storage', label: 'Storage Analyzer', icon: HardDrive },
  { id: 'health', label: 'PC Health', icon: Activity },
  { id: 'history', label: 'Riwayat', icon: History },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
  { id: 'about', label: 'Tentang Aplikasi', icon: Info },
]

export function Sidebar() {
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white">
          <Eraser className="h-4 w-4" />
        </div>
        <div className="text-base font-semibold tracking-tight">CleanPC</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-left transition ${
              page === id
                ? 'bg-accent/15 font-medium text-accent'
                : 'text-muted hover:bg-surface2 hover:text-fg'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      <div className="border-t border-line px-5 py-3 text-xs text-muted">
        Semua proses berjalan lokal di perangkat Anda.
      </div>
    </aside>
  )
}
