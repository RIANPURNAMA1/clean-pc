import { create } from 'zustand'
import { api } from '../services/api'
import type {
  CategoryInfo,
  CleanProgressEvent,
  CleanReport,
  HistoryEntry,
  PageId,
  ScanDoneEvent,
  ScanProgressEvent,
  ScanResult,
  Settings,
  SystemInfo,
} from '../types'

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  message: string
}

type ScanState = 'idle' | 'scanning' | 'done' | 'cancelled'
type CleanState = 'idle' | 'cleaning' | 'done'

interface AppState {
  page: PageId
  setPage: (p: PageId) => void

  toasts: Toast[]
  toast: (kind: Toast['kind'], message: string) => void
  dismissToast: (id: number) => void

  settings: Settings | null
  loadSettings: () => Promise<void>
  saveSettings: (s: Settings) => Promise<void>

  system: SystemInfo | null
  systemError: string | null
  loadSystem: () => Promise<void>

  history: HistoryEntry[]
  loadHistory: () => Promise<void>

  categories: CategoryInfo[]
  categoriesError: string | null
  selected: string[]
  loadCategories: () => Promise<void>
  toggleCategory: (id: string) => void
  clearSelection: () => void

  scanState: ScanState
  scanId: string | null
  results: Record<string, ScanResult>
  progress: Record<string, { files: number; bytes: number }>
  scanIndex: number
  scanTotal: number
  reviewed: boolean
  startScan: () => Promise<void>
  cancelScan: () => Promise<void>

  reviewOpen: boolean
  setReviewOpen: (v: boolean) => void
  markReviewed: () => void

  confirmOpen: boolean
  setConfirmOpen: (v: boolean) => void
  cleanState: CleanState
  cleanProgress: { done: number; total: number; bytes: number }
  report: CleanReport | null
  dismissReport: () => void
  requestClean: () => void
  performClean: () => Promise<void>
  cancelClean: () => Promise<void>

  onScanProgress: (e: ScanProgressEvent) => void
  onScanDone: (e: ScanDoneEvent) => void
  onCleanProgress: (e: CleanProgressEvent) => void
  onCleanDone: (r: CleanReport) => void
  syncSession: () => Promise<void>
}

let toastSeq = 1
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Terjadi kesalahan.')

/** Ringkasan pilihan: hanya kategori terpilih yang sudah selesai discan. */
export function selectedTotals(s: Pick<AppState, 'selected' | 'results'>) {
  let files = 0
  let bytes = 0
  for (const id of s.selected) {
    const r = s.results[id]
    if (r && r.scan_status === 'completed') {
      files += r.eligible_files
      bytes += r.eligible_bytes
    }
  }
  return { files, bytes }
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'dashboard',
  setPage: (page) => set({ page }),

  toasts: [],
  toast: (kind, message) => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  settings: null,
  loadSettings: async () => {
    try {
      const settings = await api.getSettings()
      set({ settings })
    } catch (e) {
      get().toast('error', errMsg(e))
    }
  },
  saveSettings: async (s) => {
    try {
      const settings = await api.setSettings(s)
      set({ settings })
      await get().loadCategories()
      get().toast('success', 'Pengaturan disimpan.')
    } catch (e) {
      get().toast('error', errMsg(e))
    }
  },

  system: null,
  systemError: null,
  loadSystem: async () => {
    try {
      set({ system: await api.systemInfo(), systemError: null })
    } catch (e) {
      set({ systemError: errMsg(e) })
    }
  },

  history: [],
  loadHistory: async () => {
    try {
      set({ history: await api.history() })
    } catch {
      /* riwayat opsional */
    }
  },

  categories: [],
  categoriesError: null,
  selected: [],
  loadCategories: async () => {
    try {
      const categories = await api.categories()
      const enabled = get().settings?.enabled_categories
      set((s) => ({
        categories,
        categoriesError: null,
        selected: s.selected.length
          ? s.selected.filter((id) => categories.find((c) => c.id === id)?.available)
          : categories.filter((c) => c.available && (!enabled || enabled.includes(c.id))).map((c) => c.id),
      }))
    } catch (e) {
      set({ categoriesError: errMsg(e) })
    }
  },
  toggleCategory: (id) =>
    set((s) => ({
      selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id],
    })),
  clearSelection: () => set({ selected: [] }),

  scanState: 'idle',
  scanId: null,
  results: {},
  progress: {},
  scanIndex: 0,
  scanTotal: 0,
  reviewed: false,
  startScan: async () => {
    const s = get()
    if (s.scanState === 'scanning' || s.cleanState === 'cleaning') return
    const ids = s.selected.filter((id) => s.categories.find((c) => c.id === id)?.available)
    if (!ids.length) {
      s.toast('info', 'Pilih minimal satu kategori yang tersedia.')
      return
    }
    set({
      scanState: 'scanning',
      scanId: null,
      results: {},
      progress: {},
      reviewed: false,
      report: null,
      scanIndex: 0,
      scanTotal: ids.length,
    })
    try {
      set({ scanId: await api.startScan(ids) })
    } catch (e) {
      set({ scanState: 'idle' })
      get().toast('error', errMsg(e))
    }
  },
  cancelScan: async () => {
    try {
      await api.cancelScan()
    } catch (e) {
      get().toast('error', errMsg(e))
    }
  },

  reviewOpen: false,
  setReviewOpen: (reviewOpen) => set({ reviewOpen }),
  markReviewed: () => set({ reviewed: true }),

  confirmOpen: false,
  setConfirmOpen: (confirmOpen) => set({ confirmOpen }),
  cleanState: 'idle',
  cleanProgress: { done: 0, total: 0, bytes: 0 },
  report: null,
  dismissReport: () => set({ report: null, cleanState: 'idle' }),
  requestClean: () => {
    const s = get()
    if (s.scanState !== 'done' || !s.reviewed || s.cleanState === 'cleaning') return
    if (selectedTotals(s).files === 0) {
      s.toast('info', 'Tidak ada file yang memenuhi syarat pada kategori terpilih.')
      return
    }
    if (s.settings?.confirm_before_clean === false) void get().performClean()
    else set({ confirmOpen: true })
  },
  performClean: async () => {
    const s = get()
    if (!s.scanId) return
    set({ confirmOpen: false, cleanState: 'cleaning', cleanProgress: { done: 0, total: 0, bytes: 0 } })
    try {
      await api.startClean(s.scanId, s.selected, true)
    } catch (e) {
      set({ cleanState: 'idle' })
      get().toast('error', errMsg(e))
    }
  },
  cancelClean: async () => {
    try {
      await api.cancelClean()
    } catch (e) {
      get().toast('error', errMsg(e))
    }
  },

  onScanProgress: (e) =>
    set((s) => {
      const progress = { ...s.progress, [e.category_id]: { files: e.files_seen, bytes: e.bytes_seen } }
      const results = e.result ? { ...s.results, [e.category_id]: e.result } : s.results
      return { progress, results, scanId: s.scanId ?? e.scan_id, scanIndex: e.index, scanTotal: e.total }
    }),
  onScanDone: (e) => {
    const results: Record<string, ScanResult> = {}
    e.results.forEach((r) => (results[r.category_id] = r))
    set({ results, scanId: e.scan_id, scanState: e.cancelled ? 'cancelled' : 'done', reviewed: false })
    if (e.cancelled)
      get().toast('info', 'Scan dibatalkan. Hasil tidak dapat dibersihkan, lakukan scan ulang.')
    else get().toast('success', 'Scan selesai. Tinjau hasil sebelum membersihkan.')
    void get().loadHistory()
  },
  onCleanProgress: (e) => set({ cleanProgress: { done: e.done, total: e.total, bytes: e.bytes_deleted } }),
  onCleanDone: (report) => {
    set({
      cleanState: 'done',
      report,
      scanState: 'idle',
      results: {},
      progress: {},
      scanId: null,
      reviewed: false,
    })
    void get().loadHistory()
    void get().loadSystem()
  },
  syncSession: async () => {
    try {
      const st = await api.sessionStatus()
      if (st) {
        const results: Record<string, ScanResult> = {}
        st.results.forEach((r) => (results[r.category_id] = r))
        set({ scanId: st.scan_id, results, reviewed: st.reviewed, scanState: 'done' })
      }
    } catch {
      /* diabaikan */
    }
  },
}))
