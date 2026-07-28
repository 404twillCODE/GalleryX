import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('GalleryX crashed inside the UI boundary:', error, info)
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-base-bg text-neutral-300">
          <div className="max-w-md text-center space-y-3">
            <div className="text-lg font-medium text-white">Something went wrong</div>
            <p className="text-sm text-neutral-400">
              GalleryX hit an unexpected error and recovered the window instead of crashing. You can try
              reloading the app.
            </p>
            <pre className="text-xs text-left text-red-400/80 bg-black/30 rounded-lg p-3 overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
            <button
              className="mt-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm no-drag"
              onClick={() => location.reload()}
            >
              Reload GalleryX
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
