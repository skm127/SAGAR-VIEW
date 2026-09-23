import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application rendering failed', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-boundary" role="alert">
          <p className="app-error-eyebrow">SAGAR VIEW RECOVERY</p>
          <h1>Unable to render this ocean view.</h1>
          <p>Reload the workstation to restore the latest available data and controls.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload workstation
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
