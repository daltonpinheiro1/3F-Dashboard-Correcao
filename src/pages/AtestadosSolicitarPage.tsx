import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { PageAlert } from '../components/ui/PageAlert';
import { ProtocolarPanel } from '../components/atestados/ProtocolarPanel';
import { useAuthStore } from '../store/authStore';
import { listAtestadosPage } from '../lib/atestadosService';
import { SupervisorAtestadosPanel } from '../components/atestados/SupervisorAtestadosPanel';
import {
  processarNotificacoesSupervisor,
  solicitarPermissaoNotificacao,
} from '../lib/atestadosSupervisorNotify';
import { resumoSupervisorLogado } from '../lib/atestadosSupervisorGerencial';
import type { Atestado } from '../lib/atestadosEscala';

/** Portal supervisor — envia atestado para fila do DP. Deep link: ?mat=&nome= */
export function AtestadosSolicitarPage() {
  const { userName, userEmail } = useAuthStore();
  const [params] = useSearchParams();
  const initialMatricula = params.get('mat') || params.get('matricula') || '';
  const initialNome = params.get('nome') || '';
  const [rows, setRows] = useState<Atestado[]>([]);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const carregar = useCallback(async () => {
    try {
      const page = await listAtestadosPage({ limit: 100 });
      setRows(page.rows);
      if (userEmail) {
        const novos = processarNotificacoesSupervisor(page.rows, userEmail);
        if (novos.length) {
          setOk(
            novos.map((n) => `${n.protocolo}: ${n.status}`).join(' · ') || '',
          );
        }
      }
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar solicitações');
    }
  }, [userEmail]);

  useEffect(() => {
    void carregar();
    void solicitarPermissaoNotificacao();
    const t = window.setInterval(() => void carregar(), 120_000);
    return () => window.clearInterval(t);
  }, [carregar]);

  const resumo = useMemo(
    () => resumoSupervisorLogado(rows, userEmail || '', userName || ''),
    [rows, userEmail, userName],
  );

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
          {initialNome ? (
            <p className="text-xs mt-2 text-blue-800">
              Colaborador pré-preenchido via link: <strong>{initialNome}</strong>
              {initialMatricula ? ` (${initialMatricula})` : ''}
            </p>
          ) : null}
        </div>
        <SupervisorAtestadosPanel resumo={resumo} />
        <ProtocolarPanel
          rows={rows}
          userName={userName || ''}
          userEmail={userEmail || ''}
          mode="solicitacao"
          initialNome={initialNome}
          initialMatricula={initialMatricula}
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
