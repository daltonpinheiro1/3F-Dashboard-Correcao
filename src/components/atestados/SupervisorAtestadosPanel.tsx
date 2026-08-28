import { Clock, FileCheck, FileHeart, FileX } from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import { STATUS_CHIP, STATUS_LABELS, TIPO_LABELS } from '../../lib/atestadosEscala';
import type { ResumoSupervisorLogado } from '../../lib/atestadosSupervisorGerencial';

export function SupervisorAtestadosPanel({ resumo }: { resumo: ResumoSupervisorLogado }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-indigo-950">Visão geral — suas solicitações</p>
        <p className="text-xs text-indigo-800 mt-0.5">
          Acompanhamento dos atestados que você enviou ao DP · atualiza a cada 2 min
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total enviados" value={resumo.total} icon={FileHeart} />
        <KpiCard label="Aguardando DP" value={resumo.pendentes} icon={Clock} warn={resumo.pendentes > 0} />
        <KpiCard label="Aprovados" value={resumo.aprovados} icon={FileCheck} />
        <KpiCard label="Recusados" value={resumo.recusados} icon={FileX} critical={resumo.recusados > 0} />
      </div>

      {resumo.recentes.length > 0 ? (
        <div className="card overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Últimas solicitações</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="p-3">Protocolo</th>
                <th className="p-3">Colaborador</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Status</th>
                <th className="p-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {resumo.recentes.map((r) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="p-3 font-mono text-xs">{r.protocolo}</td>
                  <td className="p-3">{r.colaborador_nome}</td>
                  <td className="p-3 text-xs">{TIPO_LABELS[r.tipo]}</td>
                  <td className="p-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_CHIP[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-gray-500">{r.data_inicio || r.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-6">Nenhuma solicitação registrada ainda.</p>
      )}
    </div>
  );
}
