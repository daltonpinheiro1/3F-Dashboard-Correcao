import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; fallbackLabel?: string }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Erro inesperado' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      return (
        <div className="card p-6 shadow-sm text-center my-4">
          <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" />
          <p className="text-sm font-bold text-gray-800 mb-1">
            {this.props.fallbackLabel || 'Algo deu errado'}
          </p>
          <p className="text-xs text-gray-500 mb-4">{this.state.message}</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="btn-secondary text-xs py-2 px-4 inline-flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
