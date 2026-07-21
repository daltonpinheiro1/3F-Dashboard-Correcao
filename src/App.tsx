import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { OperadoresPage } from './pages/OperadoresPage';
import { SupervisoresPage } from './pages/SupervisoresPage';
import { ErrosPage } from './pages/ErrosPage';
import { EvolucaoPage } from './pages/EvolucaoPage';
import { InsightsPage } from './pages/InsightsPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { AuthGuard } from './components/AuthGuard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={<AuthGuard><DashboardPage /></AuthGuard>}
          />
          <Route
            path="/operadores"
            element={<AuthGuard><OperadoresPage /></AuthGuard>}
          />
          <Route
            path="/supervisores"
            element={<AuthGuard><SupervisoresPage /></AuthGuard>}
          />
          <Route
            path="/erros"
            element={<AuthGuard><ErrosPage /></AuthGuard>}
          />
          <Route
            path="/evolucao"
            element={<AuthGuard><EvolucaoPage /></AuthGuard>}
          />
          <Route
            path="/insights"
            element={<AuthGuard><InsightsPage /></AuthGuard>}
          />
          <Route
            path="/usuarios"
            element={<AuthGuard requireAdmin><UsuariosPage /></AuthGuard>}
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
