"use client";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Custom fallback. If omitted the default error card is shown. */
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Unhandled render error:", error.message, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-4 p-6">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-semibold text-gray-100">Something went wrong</h2>
        {this.state.error?.message && (
          <p className="text-sm text-gray-400 max-w-sm font-mono">
            {this.state.error.message}
          </p>
        )}
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
