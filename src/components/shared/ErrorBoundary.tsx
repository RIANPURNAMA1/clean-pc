import { Component, type ErrorInfo, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg p-8 text-center text-fg">
        <h1 className="text-lg font-semibold">Terjadi kesalahan pada tampilan</h1>
        <p className="max-w-md text-muted">{this.state.error.message}</p>
        <button className="rounded-md bg-accent px-4 py-2 text-white" onClick={() => location.reload()}>
          Muat ulang aplikasi
        </button>
      </div>
    )
  }
}
