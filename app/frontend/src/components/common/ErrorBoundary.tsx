import { Component, type ReactNode } from"react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // eslint-disable-next-line no-console
    console.error("[Foreko] render error", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base p-6">
        <div className="max-w-xl space-y-4 rounded-panel border border-anomaly/40 border-l-2 border-l-anomaly bg-bg-surface/40 backdrop-blur-sm p-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-anomaly">
            Something broke
          </p>
          <h1 className="font-display text-2xl font-semibold text-text-primary">
            Foreko hit an unexpected error
          </h1>
          <p className="text-sm text-text-secondary">
            The UI encountered a problem and stopped. Your data is still safe, nothing leaves this machine. You can try reloading the page, or restart the app.
          </p>
          <details className="rounded border border-border/60 bg-bg-elevated/40 px-3 py-2 text-xs text-text-muted">
            <summary className="cursor-pointer font-mono uppercase tracking-widest">
              Technical details
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-text-secondary">
              {error.name}: {error.message}
              {error.stack ? `\n\n${error.stack}` :""}
            </pre>
          </details>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={this.reload}
              className="btn-terminal-primary"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.reset}
              className="border border-text-muted/40 bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary transition-all hover:border-accent hover:text-accent"
            >
              Dismiss and continue
            </button>
          </div>
        </div>
      </div>
    );
  }
}
