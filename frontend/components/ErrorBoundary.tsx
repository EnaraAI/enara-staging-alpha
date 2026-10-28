import React, { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled application error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertOctagon size={36} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Application Boundary Triggered</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              An unexpected system runtime exception occurred. The platform isolated the error state to prevent session corruptions.
            </p>

            {this.state.error && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left font-mono text-xs text-rose-300 overflow-x-auto mb-6 max-h-36">
                <p className="font-semibold mb-1">{this.state.error.toString()}</p>
                {this.state.errorInfo && (
                  <p className="text-slate-500 text-[10px] whitespace-pre-wrap mt-2">
                    {this.state.errorInfo.componentStack}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-950/30"
            >
              <RotateCcw size={18} />
              <span>Reload Application & Refresh Session</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
