import { normalizarBriefingRr, pareceJsonBriefing } from '../../lib/rrBriefing';

function blocos(md: string): string[] {
  const parts = md.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : md.trim() ? [md.trim()] : [];
}

function renderBloco(bloco: string, i: number) {
  const lines = bloco.split('\n');
  const h = lines[0]?.match(/^(#{1,3})\s+(.+)$/);
  if (h) {
    const Tag = (h[1].length === 1 ? 'h2' : 'h3') as 'h2' | 'h3';
    const rest = lines.slice(1);
    return (
      <div key={i}>
        <Tag className="mb-1 text-sm font-bold text-slate-900">{h[2]}</Tag>
        {rest.length ? <Lista lines={rest} /> : null}
      </div>
    );
  }
  return <Lista key={i} lines={lines} />;
}

function Lista({ lines }: { lines: string[] }) {
  const items = lines.filter((l) => /^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l));
  if (items.length === lines.filter(Boolean).length && items.length) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((l, i) => (
          <li key={i}>{l.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-sm leading-relaxed text-slate-700">
      {lines.join(' ')}
    </p>
  );
}

export function RrBriefingView({ texto }: { texto: string }) {
  const md = normalizarBriefingRr(texto);
  if (!md) {
    return <p className="text-sm text-slate-500">Briefing sem prosa útil — gere de novo.</p>;
  }
  if (pareceJsonBriefing(md)) {
    return (
      <p className="text-sm text-rose-700">
        A IA devolveu JSON. Clique em Atualizar briefing IA — a tela não mostra payload.
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="rr-briefing-md">
      {blocos(md).map(renderBloco)}
    </div>
  );
}
