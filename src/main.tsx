import { createRoot } from 'react-dom/client'
import { Component, type ReactNode } from 'react'
import App from './App.tsx'
// Self-hosted fonts (were a render-blocking Google Fonts stylesheet on another origin).
// Only the subsets a page actually uses are downloaded (unicode-range).
import '@fontsource-variable/big-shoulders/wght.css'
import '@fontsource-variable/inter/wght.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './index.css'

// index.html paints a static copy of the home hero while this bundle loads. If it is already on
// screen, React's hero appears without replaying its entrance animation (see landing.css).
if (document.getElementById('boot-shell') && performance.getEntriesByType('paint').length > 0) {
  document.documentElement.setAttribute('data-booted', '')
}

// ── ErrorBoundary ──────────────────────────────────────────────────────────
// Prevents blank-page crashes on Vercel by catching any React runtime errors.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '2rem',
          fontFamily: 'system-ui, sans-serif', background: '#0f0f10', color: '#f1f5f9',
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            Something went wrong 😕
          </h1>
          <pre style={{
            background: '#1e1e2e', padding: '1rem', borderRadius: '0.5rem',
            maxWidth: '600px', width: '100%', overflow: 'auto',
            fontSize: '0.8rem', color: '#f87171', whiteSpace: 'pre-wrap',
          }}>
            {(this.state.error as Error).message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.5rem', padding: '0.6rem 1.5rem', borderRadius: '0.5rem',
              background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.9rem',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

console.log("React app is mounting...");
const rootElement = document.getElementById("root");
console.log("Root element found:", rootElement);

createRoot(rootElement!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
