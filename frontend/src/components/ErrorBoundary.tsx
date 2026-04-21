import React, { Component, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto text-center mt-20 bg-zinc-50 border border-zinc-200 rounded-xl">
          <h2 className="text-xl font-bold text-zinc-900 mb-2">Unexpected Error</h2>
          <p className="text-zinc-500 text-sm mb-6 max-h-32 overflow-auto font-data">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-amber-500 text-white rounded font-medium hover:bg-amber-600"
          >
            Reload application
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
