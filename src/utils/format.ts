const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/** Format byte (basis 1024) tanpa mengubah nilai sumber. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  let v = bytes
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${UNITS[i]}`
}

export const formatNumber = (n: number) => n.toLocaleString('id-ID')

export function formatDateTime(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

export const percent = (part: number, total: number) => (total > 0 ? Math.min(100, (part / total) * 100) : 0)
