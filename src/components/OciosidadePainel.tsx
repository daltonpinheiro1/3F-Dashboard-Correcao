import { fmtDur, fmtPerda } from '../lib/evaDash';
import type { OciosidadeResumo } from '../lib/ociosidade';

export function OciosidadePainel({ resumo }: { resumo: OciosidadeResumo }) {
  if (!resumo.medido) {
    return (
      <div className="card p-5 shadow-sm mb-6">
        <h2 className="text-sm font-bold text-gray-800">Ociosidade entre ligações</h2>
        <p className="text-xs text-gray-400 mt-1">
          A jornada deste recorte ainda não trouxe o tempo disponível do EVA.
        </p>
      </div>
    );
  }

  return (
    <div className="card shadow-sm mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">Ociosidade entre ligações</h2>
        <p className="text-xs text-gray-400 mt-1">
          Tempo disponível esperando a próxima chamada, na jornada do dia. Pausa e atendimento ficam de fora.
          A perda estima quantos atendimentos cabiam nesse intervalo (espera ÷ TMA) e quantas vendas isso representava.
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4">
        <Tile label="Espera" value={fmtDur(resumo.espera)} hint={`${resumo.pct.toFixed(1)}% do logado`} />
        <Tile label="Espera média" value={fmtDur(resumo.intervaloMedio)} hint="por atendimento" />
        <Tile label="Em ligação" value={fmtDur(resumo.falando)} hint={`pós-tab ${fmtDur(resumo.tabulando)}`} />
        <Tile label="Atendimentos no vão" value={fmtPerda(resumo.chamadasPerdidas)} hint="cabiam na espera" warn />
        <Tile label="Vendas no vão" value={fmtPerda(resumo.vendasPerdidas)} hint="sucesso ÷ tabs × atendimentos" warn />
      </div>
      {resumo.ofensores.length > 0 && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Operador</th>
                <th className="text-right px-3 py-2">Espera</th>
                <th className="text-right px-3 py-2">Média</th>
                <th className="text-right px-3 py-2">% logado</th>
                <th className="text-right px-3 py-2">Vendas no vão</th>
              </tr>
            </thead>
            <tbody>
              {resumo.ofensores.map((o) => (
                <tr key={`${o.nome}-${o.supervisor}`} className="border-t border-gray-50">
                  <td className="px-4 py-2">
                    <p className="font-medium text-gray-800">{o.nome}</p>
                    <p className="text-[11px] text-gray-400">{o.supervisor}</p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtDur(o.espera)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtDur(o.intervaloMedio)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${o.pct >= 25 ? 'text-rose-700' : 'text-gray-700'}`}>
                    {o.pct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-rose-700">{fmtPerda(o.vendasPerdidas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={`text-lg font-black tabular-nums ${warn ? 'text-rose-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[10px] text-gray-400">{hint}</p>
    </div>
  );
}
