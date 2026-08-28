import { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { PageAlert } from '../components/ui/PageAlert';
import { ProtocolarPanel } from '../components/atestados/ProtocolarPanel';
import { useAuthStore } from '../store/authStore';
import { listAtestadosPage } from '../lib/atestadosService';
import type { Atestado } from '../lib/atestadosEscala';

/** Portal supervisor — envia atestado para fila do DP. */
export function AtestadosSolicitarPage() {
  const { userName, userEmail } = useAuthStore();
  const [rows, setRows] = useState<Atestado[]>([]);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const carregar = useCallback(async () => {
    try {
      const page = await listAtestadosPage({ limit: 100 });
      setRows(page.rows);
    } catch {
      /* opcional */
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <AdminLayout
      title="Solicitar atestado"
      subtitle="Envie a foto e dados — o DP analisa e protocola"
    >
      <div className="space-y-4">
        {erro && (
          <PageAlert variant="error" onDismiss={() => setErro('')}>
            {erro}
          </PageAlert>
        )}
        {ok && (
          <PageAlert variant="success" onDismiss={() => setOk('')}>
            {ok}
          </PageAlert>
        )}
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Sua solicitação entra na fila do DP com status <strong>Protocolado</strong>. Você receberá
          retorno após análise (aprovação ou recusa).
        </div>
        <ProtocolarPanel
          rows={rows}
          userName={userName || ''}
          userEmail={userEmail || ''}
          mode="solicitacao"
          onCreated={(a) => {
            setRows((prev) => [a, ...prev]);
            setOk(`Solicitação ${a.protocolo} enviada ao DP.`);
          }}
          onError={setErro}
        />
      </div>
    </AdminLayout>
  );
}

export default AtestadosSolicitarPage;
