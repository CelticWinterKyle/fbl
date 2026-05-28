"use client";
import { Component, Fragment, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Custom fallback. If omitted the default error card is shown. */
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
  /** Bumped on reset to force the child subtree to remount (re-run effects/fetches). */
  resetKey: number;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Unhandled render error:", error.message, info.componentStack);
  }

  // Clear the error AND remount the children so a transient bad render recovers
  // instead of immediately re-throwing with the same props.
  reset = () =>
    this.setState((s) => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }));

  render() {
    if (!this.state.hasError) {
      return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
    }

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-4 p-6">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-semibold text-gray-100">Something went wrong</h2>
        <p className="text-sm text-gray-400 max-w-sm">
          We hit a snag loading this view. Try again — if it keeps happening, refresh the page.
        </p>
        <button
          onClick={this.reset}
          className="mt-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-5 rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}
