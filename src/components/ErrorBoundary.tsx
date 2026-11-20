import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const raw = error instanceof Error ? error.message : String(error);
    return {
      hasError: true,
      message: raw.slice(0, 260),
    };
  }

  componentDidCatch(error: unknown): void {
    console.error('Studio ErrorBoundary caught error:', error);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] w-screen items-center justify-center bg-[#0B0D10] p-6 text-zinc-100">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-base font-semibold text-zinc-100">Studio Recovery</h1>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Something went wrong while communicating with the studio service. Your local session
              can be resumed immediately.
            </p>
            {this.state.message && (
              <p className="rounded-lg bg-black/40 border border-white/10 p-2.5 text-[11px] font-mono text-zinc-300 break-words">
                {this.state.message}
              </p>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Resume Studio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
