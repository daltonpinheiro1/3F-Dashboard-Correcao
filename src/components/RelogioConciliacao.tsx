import { useEffect, useState } from 'react';
import {
  arquivoVencido,
  horaCurta,
  relogioCoerente,
  textoAtraso,
  type RelogioConciliacao as Relogio,
} from '../lib/relogioConciliacao';

export function RelogioConciliacao() {
  const [dado, setDado] = useState<Relogio | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/conciliacao', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (vivo && relogioCoerente(json)) setDado(json);
      })
      .catch(() => {
        if (vivo) setDado(null);
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!dado) return null;

  const vencido = arquivoVencido(dado.gerado_em);
  const consulta = dado.divida_consulta;
  const mudou = dado.mudou?.primeiro_arquivo
    ? 'primeiro recorte carregado'
    : `${dado.mudou?.status_mudou ?? 0} status mudaram no recorte · ${dado.mudou?.entrou ?? 0} entradas · ${dado.mudou?.saiu ?? 0} saídas`;

  return (
    <section
      className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700 shadow-sm"
      aria-label="Relógio da conciliação"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Interseção com o arquivo oficial</h2>
        <span className="text-slate-500">Gerado {horaCurta(dado.gerado_em)} BRT</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Selo rotulo="Oficial" valor={horaCurta(dado.oficial_em)} />
        <Selo rotulo="Cópia SMS" valor={horaCurta(dado.sms_em)} />
        <Selo rotulo="Arquivo" valor={dado.arquivo_em || dado.arquivo_ref} />
        <Selo rotulo="Na interseção" valor={String(dado.intersecao)} />
        <Selo rotulo="Coerentes" valor={String(dado.coerentes)} />
        <Selo rotulo="Arquivo fechou, ticket aberto" valor={String(dado.divida)} destaque={dado.divida > 0} />
        <Selo rotulo="Quarentena do estorno" valor={String(dado.quarentena)} />
        {consulta ? (
          <Selo
            rotulo="Consultas da dívida"
            valor={`${consulta.concluidas} concluídas · ${consulta.pendentes} na fila · ${consulta.falhas} falhas`}
          />
        ) : null}
      </div>
      {vencido ? (
        <p className="mt-2 rounded-md bg-amber-100 px-2 py-1 font-semibold text-amber-950" role="status">
          Arquivo com mais de 7 dias. Gere um recorte novo antes de confiar nesta dívida.
        </p>
      ) : null}
      <p className="mt-2 text-slate-500">
        Casamento por acesso e data: {dado.confianca.acesso_e_data}. Só pelo acesso: {dado.confianca.acesso}.
        Fora do recorte: {dado.so_arquivo} linhas do arquivo e o restante das {dado.oficial_os} OS.
        {' '}
        {mudou}.
        {' '}
        {textoAtraso(dado.atraso_sms_horas)}
        {' '}
        {dado.nota}
      </p>
    </section>
  );
}

function Selo({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 ${
        destaque ? 'bg-amber-100 font-semibold text-amber-900' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {rotulo}: {valor}
    </span>
  );
}
