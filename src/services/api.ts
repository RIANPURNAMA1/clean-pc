import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import type * as T from '../types'

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function call<R>(cmd: string, args?: Record<string, unknown>): Promise<R> {
  if (!isTauri()) throw new Error('Aplikasi harus dijalankan melalui CleanPC (Tauri), bukan browser biasa.')
  try {
    return await invoke<R>(cmd, args)
  } catch (e) {
    throw new Error(
      typeof e === 'string' ? e : e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.',
    )
  }
}

export const api = {
  appInfo: () => call<T.AppInfo>('app_info'),
  systemInfo: () => call<T.SystemInfo>('get_system_info'),
  liveStats: () => call<T.SystemInfo>('get_live_stats'),
  categories: () => call<T.CategoryInfo[]>('list_categories'),
  startScan: (categoryIds: string[]) => call<string>('start_scan', { categoryIds }),
  cancelScan: () => call<void>('cancel_scan'),
  scanItems: (
    scanId: string,
    categoryId: string,
    sortBy: string,
    descending: boolean,
    offset: number,
    limit: number,
  ) => call<T.ItemPage>('get_scan_items', { scanId, categoryId, sortBy, descending, offset, limit }),
  markReviewed: (scanId: string) => call<void>('mark_reviewed', { scanId }),
  sessionStatus: () => call<T.SessionStatus | null>('session_status'),
  startClean: (scanId: string, categoryIds: string[], confirmed: boolean) =>
    call<string>('start_clean', { scanId, categoryIds, confirmed }),
  cancelClean: () => call<void>('cancel_clean'),
  knownFolders: () => call<T.KnownFolder[]>('known_folders'),
  analyze: (path: string, maxDepth: number) => call<T.DirAnalysis>('analyze_directory', { path, maxDepth }),
  cancelAnalysis: () => call<void>('cancel_analysis'),
  history: () => call<T.HistoryEntry[]>('history_list'),
  clearHistory: () => call<void>('history_clear'),
  getSettings: () => call<T.Settings>('settings_get'),
  setSettings: (settings: T.Settings) => call<T.Settings>('settings_set', { settings }),
  pickFolder: async (): Promise<string | null> => {
    if (!isTauri()) return null
    const r = await open({ directory: true, multiple: false, title: 'Pilih folder untuk dianalisis' })
    return typeof r === 'string' ? r : null
  },
  on: <P>(event: string, cb: (p: P) => void): Promise<UnlistenFn> => listen<P>(event, (e) => cb(e.payload)),
}
