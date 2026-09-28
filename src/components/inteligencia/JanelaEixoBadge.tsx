import type { JanelaEixo } from '../../lib/intelPeriodo';

export function JanelaEixoBadge({ janela }: { janela: JanelaEixo | null }) {
  if (!janela) return null;
  const aoVivo = janela === 'ao vivo';
  return (
    <span
      className={`ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide align-middle ${
        aoVivo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
      title={aoVivo ? 'Valor de agora; não segue o período filtrado' : 'Segue o período filtrado'}
    >
      {aoVivo ? 'ao vivo' : 'período'}
    </span>
  );
}
