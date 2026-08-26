import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPage } from './pages/LoginPage';
import { lazy } from 'react';
import { AuthGuard } from './components/AuthGuard';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));

const OperadoresPage = lazy(() => import('./pages/OperadoresPage').then((m) => ({ default: m.OperadoresPage })));
const SupervisoresPage = lazy(() => import('./pages/SupervisoresPage').then((m) => ({ default: m.SupervisoresPage })));
const ErrosPage = lazy(() => import('./pages/ErrosPage').then((m) => ({ default: m.ErrosPage })));
const EvolucaoPage = lazy(() => import('./pages/EvolucaoPage').then((m) => ({ default: m.EvolucaoPage })));
const InsightsPage = lazy(() => import('./pages/InsightsPage').then((m) => ({ default: m.InsightsPage })));
const UsuariosPage = lazy(() => import('./pages/UsuariosPage').then((m) => ({ default: m.UsuariosPage })));
const SmsPage = lazy(() => import('./pages/SmsPage').then((m) => ({ default: m.SmsPage })));
const OperacaoPage = lazy(() => import('./pages/OperacaoPage').then((m) => ({ default: m.OperacaoPage })));
const ChamadasPage = lazy(() => import('./pages/ChamadasPage').then((m) => ({ default: m.ChamadasPage })));
const HoraPage = lazy(() => import('./pages/HoraPage').then((m) => ({ default: m.HoraPage })));
const DiscagensPage = lazy(() => import('./pages/DiscagensPage').then((m) => ({ default: m.DiscagensPage })));
const AdvertenciasPage = lazy(() => import('./pages/AdvertenciasPage'));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3" role="status" aria-live="polite">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" aria-hidden />
      <span className="text-sm text-gray-500 font-medium">Carregando painel…</span>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function App() {
  return (
    <ErrorBoundary fallbackLabel="Erro na aplicação">
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<AuthGuard><DashboardPage /></AuthGuard>} />
            <Route path="/operadores" element={<AuthGuard><OperadoresPage /></AuthGuard>} />
            <Route path="/supervisores" element={<AuthGuard><SupervisoresPage /></AuthGuard>} />
            <Route path="/erros" element={<AuthGuard><ErrosPage /></AuthGuard>} />
            <Route path="/evolucao" element={<AuthGuard><EvolucaoPage /></AuthGuard>} />
            <Route path="/insights" element={<AuthGuard><InsightsPage /></AuthGuard>} />
            <Route path="/sms" element={<AuthGuard><SmsPage /></AuthGuard>} />
            <Route path="/operacao" element={<AuthGuard><OperacaoPage /></AuthGuard>} />
            <Route path="/chamadas" element={<AuthGuard><ChamadasPage /></AuthGuard>} />
            <Route path="/hora" element={<AuthGuard requireAdmin><HoraPage /></AuthGuard>} />
            <Route path="/discagens" element={<AuthGuard roles={['admin', 'supervisor', 'viewer']}><DiscagensPage /></AuthGuard>} />
            <Route path="/advertencias" element={<AuthGuard requireAdmin><AdvertenciasPage /></AuthGuard>} />
            <Route path="/usuarios" element={<AuthGuard requireAdmin><UsuariosPage /></AuthGuard>} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
