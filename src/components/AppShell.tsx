import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AdminChrome, ShellCtx } from './AdminLayout';
import { ErrorBoundary } from './ErrorBoundary';
import { PageHeaderProvider } from '../lib/pageHeader';

export function PageLoader({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${compact ? 'min-h-[40vh]' : 'min-h-[50vh]'}`}
      role="status"
      aria-live="polite"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" aria-hidden />
      <span className="text-sm font-medium text-gray-500">Carregando painel…</span>
    </div>
  );
}

/** Chrome fixo: só o Outlet anima / suspende. Evita a sidebar sumir a cada rota lazy. */
export function AppShell() {
  const loc = useLocation();
  return (
    <ShellCtx.Provider value={true}>
      <PageHeaderProvider>
        <AdminChrome>
          <ErrorBoundary key={loc.pathname} fallbackLabel="Erro nesta tela">
            <Suspense fallback={<PageLoader compact />}>
              <div key={loc.pathname} className="page-enter">
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </AdminChrome>
      </PageHeaderProvider>
    </ShellCtx.Provider>
  );
}
