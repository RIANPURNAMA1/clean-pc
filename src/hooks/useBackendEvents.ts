import { useEffect } from 'react'
import { api, isTauri } from '../services/api'
import { useAppStore } from './useAppStore'
import type { CleanProgressEvent, CleanReport, ScanDoneEvent, ScanProgressEvent } from '../types'

/** Mendaftarkan listener event backend satu kali untuk seluruh aplikasi. */
export function useBackendEvents() {
  useEffect(() => {
    if (!isTauri()) return
    const st = useAppStore.getState()
    const subs = Promise.all([
      api.on<ScanProgressEvent>('scan_progress', st.onScanProgress),
      api.on<ScanDoneEvent>('scan_done', st.onScanDone),
      api.on<CleanProgressEvent>('clean_progress', st.onCleanProgress),
      api.on<CleanReport>('clean_done', st.onCleanDone),
    ])
    return () => {
      void subs.then((fns) => fns.forEach((f) => f()))
    }
  }, [])
}
