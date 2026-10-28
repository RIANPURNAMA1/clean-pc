import { Loader2 } from 'lucide-react'
import { useAppStore } from '../../hooks/useAppStore'
import { Badge } from '../shared/ui'

export function Header() {
  const scanState = useAppStore((s) => s.scanState)
  const cleanState = useAppStore((s) => s.cleanState)
  const system = useAppStore((s) => s.system)
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-6">
      <div className="text-muted">{system?.device_name ?? 'Perangkat'}</div>
      <div className="flex items-center gap-2">
        {scanState === 'scanning' && (
          <Badge tone="accent">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Memindai
          </Badge>
        )}
        {cleanState === 'cleaning' && (
          <Badge tone="warn">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Membersihkan
          </Badge>
        )}
        {scanState !== 'scanning' && cleanState !== 'cleaning' && <Badge>Siap</Badge>}
      </div>
    </header>
  )
}
