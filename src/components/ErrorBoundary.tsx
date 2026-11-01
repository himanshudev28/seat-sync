import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /**
   * Inside the page layout: render a <div> (the layout already has the <main>), no full-screen height,
   * and "Try again" re-renders the page instead of reloading — unless the crash was a failed chunk load.
   */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    const err = this.state.error;
    // A stale deploy leaves lazy chunks missing; only a full reload fetches the new ones.
    const chunkFailed =
      !!err && /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(err.message);
    this.setState({ hasError: false, error: null });
    if (!this.props.inline || chunkFailed) window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const Root = this.props.inline ? "div" : "main";
      return (
        <Root
          role="alert"
          className={`flex flex-col items-center justify-center gap-8 bg-background px-4 text-center ${
            this.props.inline ? "py-24" : "min-h-screen"
          }`}
        >
          {/* Friendly geometric mark (coral accent), not an alarm icon. */}
          <div aria-hidden="true" className="relative h-24 w-24">
            <div className="absolute inset-0 rotate-6 rounded-3xl bg-accent" />
            <div className="absolute inset-3 -rotate-6 rounded-2xl border-2 border-primary/60" />
            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
          </div>
          <div className="max-w-md">
            <h1 className="font-display text-section font-bold text-foreground">Something went wrong</h1>
            <p className="mt-3 text-muted-foreground">
              Don't worry, your tickets are safe. Reload the page to try again, or head back home.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-4 rounded-xl bg-surface-elevated p-3 text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">Error details (development only)</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all">{this.state.error.message}</pre>
              </details>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="pill" onClick={this.handleReload}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => (window.location.href = "/")}>
              Go home
            </Button>
          </div>
        </Root>
      );
    }

    return this.props.children;
  }
}
