import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Error capturado:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-300 gap-4 p-8">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-semibold text-white">Ocurrió un error inesperado</h1>
          <p className="text-sm text-gray-400 text-center max-w-md">
            La aplicación encontró un problema. Por favor recarga la página o contacta al administrador.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-2 text-xs text-red-400 bg-gray-900 rounded p-3 max-w-xl overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
          >
            Recargar aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
