import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, ClipboardList } from 'lucide-react';
import type { RrHorizonte } from '../../lib/rrHorizonte';
import {
  acaoAtrasada,
  buildRrAcao,
  fetchRrAcoes,
  persistRrAcao,
  persistRrAcaoStatus,
  type RrAcao,
} from '../../lib/rrAcoes';

export function RrAcoesCiclo({
  dataRef,
  campanha,
  horizonte,
  ownerDefault,
  podeEditar,
}: {
  dataRef: string;
  campanha: string;
  horizonte: RrHorizonte;
  ownerDefault: string;
  podeEditar: boolean;
}) {
  const [acoes, setAcoes] = useState<RrAcao[]>([]);
  const [erro, setErro] = useState('');
  const [titulo, setTitulo] = useState('');
  const [owner, setOwner] = useState(ownerDefault);
  const [prazo, setPrazo] = useState(dataRef);

  useEffect(() => {
    let active = true;
    void fetchRrAcoes(campanha).then((rows) => {
      if (active) setAcoes(rows);
    });
    return () => {
      active = false;
    };
  }, [campanha]);

  const { atuais, anteriores } = useMemo(
    () => ({
      atuais: acoes.filter(
        (a) => a.campanha === campanha && a.horizonte === horizonte && a.dataRef === dataRef,
      ),
      anteriores: acoes.filter(
        (a) => a.campanha === campanha && a.status === 'aberta' && a.dataRef < dataRef,
      ),
    }),
    [acoes, campanha, horizonte, dataRef],
  );

  const add = async () => {
    if (!titulo.trim() || !podeEditar) return;
    const a = buildRrAcao({
      dataRef,
      campanha,
      horizonte,
      titulo,
      owner: owner || ownerDefault,
      prazo: prazo || dataRef,
    });
    setErro('');
    setAcoes((rows) => [...rows.filter((x) => x.id !== a.id), a]);
    try {
      const saved = await persistRrAcao(a);
      setAcoes((rows) => [...rows.filter((x) => x.id !== saved.id), saved]);
      setTitulo('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar ação.');
    }
  };

  const setStatus = async (id: string, status: RrAcao['status']) => {
    setErro('');
    setAcoes((rows) => rows.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      await persistRrAcaoStatus(id, status);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao atualizar ação.');
      const rows = await fetchRrAcoes(campanha);
      setAcoes(rows);
    }
  };

  return (
    <section className="mb-6 min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-1 flex items-center gap-2 text-sm font-bold text-gray-800">
        <ClipboardList size={16} className="text-slate-600" />
        Ciclo de ações
      </p>
      <p className="mb-3 text-[11px] text-gray-400">
        Dono + prazo · volta na próxima RR · sincronizado entre salas
      </p>
      {erro ? <p className="mb-3 text-xs text-rose-700" role="alert">{erro}</p> : null}

      {anteriores.length ? (
        <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50/60 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-800">O que ficou da última</p>
          <ul className="space-y-1.5">
            {anteriores.map((a) => (
              <Linha key={a.id} acao={a} hoje={dataRef} onStatus={setStatus} podeEditar={podeEditar} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="mb-3 text-[11px] text-slate-400">Nenhuma ação aberta de reunião anterior neste recorte.</p>
      )}

      <ul className="mb-3 space-y-1.5">
        {atuais.map((a) => (
          <Linha key={a.id} acao={a} hoje={dataRef} onStatus={setStatus} podeEditar={podeEditar} />
        ))}
        {!atuais.length ? <li className="text-sm text-slate-400">Sem ação neste horizonte ainda.</li> : null}
      </ul>

      {podeEditar ? (
        <form
          className="flex min-w-0 flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className="min-w-[12rem] flex-1 text-[11px] text-slate-500">
            Ação
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
              placeholder="Ex.: coaching Bruno até 16h"
            />
          </label>
          <label className="w-36 text-[11px] text-slate-500">
            Dono
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
            />
          </label>
          <label className="w-36 text-[11px] text-slate-500">
            Prazo
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Registrar
          </button>
        </form>
      ) : (
        <p className="text-[11px] text-slate-400">Só admin registra ação.</p>
      )}
      {acoes.length > 80 ? (
        <p className="mt-2 text-[10px] text-slate-400">Histórico limitado às 300 ações mais recentes.</p>
      ) : null}
    </section>
  );
}

function Linha({
  acao,
  hoje,
  onStatus,
  podeEditar,
}: {
  acao: RrAcao;
  hoje: string;
  onStatus: (id: string, s: RrAcao['status']) => void;
  podeEditar: boolean;
}) {
  const atrasada = acaoAtrasada(acao, hoje);
  return (
    <li className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{acao.titulo}</p>
        <p className="text-[11px] text-slate-500">
          {acao.owner} · prazo {acao.prazo}
          {atrasada ? ' · atrasada' : ''} · {acao.dataRef}
        </p>
      </div>
      {podeEditar && acao.status === 'aberta' ? (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onStatus(acao.id, 'feita')}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase text-emerald-800"
          >
            <CheckCircle2 size={12} />
            Feita
          </button>
          <button
            type="button"
            onClick={() => onStatus(acao.id, 'sem_efeito')}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-600"
          >
            <Circle size={12} />
            Sem efeito
          </button>
        </div>
      ) : (
        <span className="shrink-0 text-[10px] font-bold uppercase text-slate-500">{acao.status}</span>
      )}
    </li>
  );
}
