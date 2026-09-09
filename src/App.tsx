import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPage } from './pages/LoginPage';
import { AuthGuard } from './components/AuthGuard';
import { AppShell, PageLoader } from './components/AppShell';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));

const OperadoresPage = lazy(() => import('./pages/OperadoresPage').then((m) => ({ default: m.OperadoresPage })));
const SupervisoresPage = lazy(() => import('./pages/SupervisoresPage').then((m) => ({ default: m.SupervisoresPage })));
const ErrosPage = lazy(() => import('./pages/ErrosPage').then((m) => ({ default: m.ErrosPage })));
const EvolucaoPage = lazy(() => import('./pages/EvolucaoPage').then((m) => ({ default: m.EvolucaoPage })));
const InsightsPage = lazy(() => import('./pages/InsightsPage').then((m) => ({ default: m.InsightsPage })));
const AdministracaoPage = lazy(() => import('./pages/AdministracaoPage').then((m) => ({ default: m.AdministracaoPage })));
const SmsPage = lazy(() => import('./pages/SmsPage').then((m) => ({ default: m.SmsPage })));
const DisparosPage = lazy(() => import('./pages/DisparosPage').then((m) => ({ default: m.DisparosPage })));
const OperacaoPage = lazy(() => import('./pages/OperacaoPage').then((m) => ({ default: m.OperacaoPage })));
const ChamadasPage = lazy(() => import('./pages/ChamadasPage').then((m) => ({ default: m.ChamadasPage })));
const HoraPage = lazy(() => import('./pages/HoraPage').then((m) => ({ default: m.HoraPage })));
const RrPage = lazy(() => import('./pages/RrPage').then((m) => ({ default: m.RrPage })));
const DiscagensPage = lazy(() => import('./pages/DiscagensPage').then((m) => ({ default: m.DiscagensPage })));
const InteligenciaPage = lazy(() => import('./pages/InteligenciaPage'));
const AdvertenciasPage = lazy(() => import('./pages/AdvertenciasPage'));
const ControleDpPage = lazy(() => import('./pages/ControleDpPage'));
const AtestadosPage = lazy(() => import('./pages/AtestadosPage'));
const AtestadosSolicitarPage = lazy(() => import('./pages/AtestadosSolicitarPage'));

function App() {
  return (
    <ErrorBoundary fallbackLabel="Erro na aplicação">
      <BrowserRouter>
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/rr/tv"
              element={
                <AuthGuard aba="rr">
                  <Suspense fallback={<PageLoader />}>
                    <RrPage />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route element={<AuthGuard><AppShell /></AuthGuard>}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/operadores" element={<OperadoresPage />} />
              <Route path="/supervisores" element={<SupervisoresPage />} />
              <Route path="/erros" element={<ErrosPage />} />
              <Route path="/evolucao" element={<EvolucaoPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/sms" element={<SmsPage />} />
              <Route path="/disparos" element={<AuthGuard aba="disparos"><DisparosPage /></AuthGuard>} />
              <Route path="/operacao" element={<AuthGuard aba="operacao"><OperacaoPage /></AuthGuard>} />
              <Route path="/chamadas" element={<AuthGuard aba="chamadas"><ChamadasPage /></AuthGuard>} />
              <Route path="/hora" element={<AuthGuard aba="hora"><HoraPage /></AuthGuard>} />
              <Route path="/rr" element={<AuthGuard aba="rr"><RrPage /></AuthGuard>} />
              <Route path="/discagens" element={<AuthGuard aba="discagens"><DiscagensPage /></AuthGuard>} />
              <Route path="/inteligencia" element={<AuthGuard aba="inteligencia"><InteligenciaPage /></AuthGuard>} />
              <Route path="/advertencias" element={<AuthGuard aba="advertencias"><AdvertenciasPage /></AuthGuard>} />
              <Route path="/controle-dp" element={<AuthGuard aba="controle-dp"><ControleDpPage /></AuthGuard>} />
              <Route path="/atestados" element={<AuthGuard aba="atestados"><AtestadosPage /></AuthGuard>} />
              <Route
                path="/atestados-solicitar"
                element={
                  <AuthGuard aba="atestados-solicitar">
                    <AtestadosSolicitarPage />
                  </AuthGuard>
                }
              />
              <Route path="/administracao" element={<AuthGuard requireAdmin><AdministracaoPage /></AuthGuard>} />
              <Route path="/usuarios" element={<Navigate to="/administracao?tab=usuarios" replace />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
