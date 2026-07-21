import { useEffect, useState } from 'react';
import { Clock, Award, AlertOctagon } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';

interface HoraData {
  hora: number;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
}

interface Reincidente {
  vendedor: string;
  supervisor: string;
  equipe: string;
  campo_erro: string;
  vezes_errou: number;
}

interface TopQualidade {
  vendedor: string;
  equipe: string;
  supervisor: string;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
}

const campoLabels: Record<string, string> = {
  cep: 'CEP', logradouro: 'Logradouro', bairro: 'Bairro',
  cidade: 'Cidade', uf: 'UF', numero: 'Número', complemento: 'Complemento',
};

export function InsightsPage() {
  const [horas, setHoras] = useState<HoraData[]>([]);
  const [reincidentes, setReincidentes] = useState<Reincidente[]>([]);
  const [topQualidade, setTopQualidade] = useState<TopQualidade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setIsLoading(true);
    const [horasRes, reincRes, topRes] = await Promise.all([
      supabase.from('erros_por_hora').select('*'),
      supabase.from('reincidencia').select('*').limit(20),
      supabase.from('top_vendedores_qualidade').select('*'),
    ]);
    setHoras((horasRes.data ?? []) as HoraData[]);
    setReincidentes((reincRes.data ?? []) as Reincidente[]);
    setTopQualidade((topRes.data ?? []) as TopQualidade[]);
    setIsLoading(false);
  };

  const maxHora = Math.max(...horas.map(h => h.total_propostas), 1);
  const picoHora = horas.reduce((max, h) => h.taxa_erro_pct > (max?.taxa_erro_pct ?? 0) ? h : max, horas[0]);

  return (
    <AdminLayout title="Insights" subtitle="Analise inteligente - padroes, reincidencia e destaques">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-40 skeleton" />)}
        </div>
      ) : (
        <>
          {/* Horário de pico */}
          <div className="card p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Clock size={16} className="text-purple-500" />
                  Erros por Horario (ultimos 7 dias)
                </h3>
                {picoHora && (
                  <p className="text-xs text-gray-400 mt-1">
                    Pico de erros: <span className="font-semibold text-red-500">{picoHora.hora}h</span> ({picoHora.taxa_erro_pct}%)
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-end gap-1 h-32">
              {horas.map((h) => (
                <div key={h.hora} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className={`w-full rounded-t-sm transition-colors ${
                      h.taxa_erro_pct > 80 ? 'bg-red-500' : h.taxa_erro_pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ height: `${(h.total_propostas / maxHora) * 100}%`, minHeight: '2px' }}
                  />
                  <span className="text-[9px] text-gray-400 mt-1">{h.hora}h</span>
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    {h.hora}h: {h.total_propostas} props · {h.taxa_erro_pct}% erro
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Top Qualidade (melhores vendedores) */}
            <div className="card shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Award size={16} className="text-emerald-500" />
                  Destaque Qualidade (min. 5 propostas)
                </h3>
                <p className="text-xs text-gray-400">Vendedores com MENOR taxa de erro</p>
              </div>
              {topQualidade.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Dados insuficientes (min 5 propostas)</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {topQualidade.slice(0, 5).map((v, i) => (
                    <div key={v.vendedor} className="flex items-center justify-between px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{v.vendedor}</p>
                          <p className="text-xs text-gray-400">{v.equipe}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="badge bg-emerald-50 text-emerald-600">{v.taxa_erro_pct}%</span>
                        <p className="text-[10px] text-gray-400 mt-0.5">{v.total_propostas} props</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reincidência (vendedores que repetem o MESMO erro) */}
            <div className="card shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <AlertOctagon size={16} className="text-red-500" />
                  Reincidencia (mesmo erro 3+ vezes)
                </h3>
                <p className="text-xs text-gray-400">Vendedores que precisam de feedback direcionado</p>
              </div>
              {reincidentes.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Nenhuma reincidencia detectada</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {reincidentes.slice(0, 8).map((r) => (
                    <div key={`${r.vendedor}-${r.campo_erro}`} className="flex items-center justify-between px-6 py-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.vendedor}</p>
                        <p className="text-xs text-gray-400">{r.equipe} · Sup: {r.supervisor}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge bg-red-50 text-red-600">
                          {campoLabels[r.campo_erro] ?? r.campo_erro}
                        </span>
                        <span className="text-sm font-bold text-red-600">{r.vezes_errou}x</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
