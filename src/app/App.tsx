import { useEffect } from 'react'
import { Sidebar } from '../components/layout/Sidebar'
import { Header } from '../components/layout/Header'
import { ToastHost } from '../components/shared/ToastHost'
import { DashboardPage } from '../components/dashboard/DashboardPage'
import { JunkCleanerPage } from '../components/cleaner/JunkCleanerPage'
import { ReviewDialog } from '../components/cleaner/ReviewDialog'
import { CleanDialogs } from '../components/cleaner/CleanDialogs'
import { StoragePage } from '../components/storage/StoragePage'
import { HealthPage } from '../components/system/HealthPage'
import { HistoryPage } from '../components/history/HistoryPage'
import { SettingsPage } from '../components/settings/SettingsPage'
import { AboutPage } from '../components/settings/AboutPage'
import { useAppStore } from '../hooks/useAppStore'
import { useBackendEvents } from '../hooks/useBackendEvents'
import { isTauri } from '../services/api'

export function App() {
  const page = useAppStore((s) => s.page)
  const theme = useAppStore((s) => s.settings?.theme ?? 'dark')
  const reviewOpen = useAppStore((s) => s.reviewOpen)
  useBackendEvents()

  useEffect(() => {
    const st = useAppStore.getState()
    void st.loadSettings().then(() => st.loadCategories())
    void st.loadSystem()
    void st.syncSession()
  }, [])

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light')
    document.documentElement.classList.add(theme)
  }, [theme])

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        {!isTauri() && (
          <div className="bg-warn/15 px-6 py-2 text-warn">
            Mode browser: fitur sistem tidak tersedia. Jalankan aplikasi desktop CleanPC (npm run tauri dev).
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          {page === 'dashboard' && <DashboardPage />}
          {page === 'cleaner' && <JunkCleanerPage />}
          {page === 'storage' && <StoragePage />}
          {page === 'health' && <HealthPage />}
          {page === 'history' && <HistoryPage />}
          {page === 'settings' && <SettingsPage />}
          {page === 'about' && <AboutPage />}
        </main>
      </div>
      {reviewOpen && <ReviewDialog />}
      <CleanDialogs />
      <ToastHost />
    </div>
  )
}
