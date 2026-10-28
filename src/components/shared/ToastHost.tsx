import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { useAppStore } from '../../hooks/useAppStore'

const icons = { info: Info, success: CheckCircle2, error: XCircle }
const tones = { info: 'text-accent', success: 'text-ok', error: 'text-danger' }

export function ToastHost() {
  const toasts = useAppStore((s) => s.toasts)
  const dismiss = useAppStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.kind]
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex items-start gap-3 rounded-md border border-line bg-surface p-3 text-left shadow-lg"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tones[t.kind]}`} />
            <span>{t.message}</span>
          </button>
        )
      })}
    </div>
  )
}
