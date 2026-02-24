'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#0a0a0a',
            color: '#e0e0e0',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: '2rem',
          }}
        >
          <h1 style={{ color: '#ef4444', fontSize: '1.5rem', marginBottom: '1rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#999', maxWidth: 480, textAlign: 'center', lineHeight: 1.6, fontSize: '0.9rem' }}>
            Titan encountered an unexpected error. Press <code style={{ background: '#1e1e1e', padding: '2px 6px', borderRadius: 4 }}>F12</code> to
            open DevTools for details.
          </p>
          <pre
            style={{
              marginTop: '1.5rem',
              maxWidth: 600,
              maxHeight: 200,
              overflow: 'auto',
              background: '#111',
              border: '1px solid #333',
              borderRadius: 6,
              padding: '0.75rem 1rem',
              fontSize: '0.8rem',
              color: '#ef4444',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              marginTop: '1.5rem',
              padding: '0.6rem 1.4rem',
              border: '1px solid #333',
              borderRadius: 6,
              background: '#111',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
