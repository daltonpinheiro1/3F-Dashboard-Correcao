import { normalizarBriefingRr, pareceJsonBriefing } from '../../lib/rrBriefing';

function blocos(md: string): string[] {
  const parts = md.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : md.trim() ? [md.trim()] : [];
}

function Lista({ lines, size }: { lines: string[]; size: 'sm' | 'lg' }) {
  const text = size === 'lg' ? 'text-lg' : 'text-sm';
  const items = lines.filter((l) => /^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l));
  if (items.length === lines.filter(Boolean).length && items.length) {
    return (
      <ul className={`list-disc space-y-1 pl-5 ${text} text-slate-700`}>
        {items.map((l, i) => (
          <li key={i}>{l.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')}</li>
        ))}
      </ul>
    );
  }
  return <p className={`${text} leading-relaxed text-slate-700`}>{lines.join(' ')}</p>;
}

export function RrBriefingView({ texto, size = 'sm' }: { texto: string; size?: 'sm' | 'lg' }) {
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
      {blocos(md).map((bloco, i) => {
        const lines = bloco.split('\n');
        const h = lines[0]?.match(/^(#{1,3})\s+(.+)$/);
        if (h) {
          const Tag = (h[1].length === 1 ? 'h2' : 'h3') as 'h2' | 'h3';
          const rest = lines.slice(1);
          return (
            <div key={i}>
              <Tag className={`mb-1 font-bold text-slate-900 ${size === 'lg' ? 'text-xl' : 'text-sm'}`}>{h[2]}</Tag>
              {rest.length ? <Lista lines={rest} size={size} /> : null}
            </div>
          );
        }
        return <Lista key={i} lines={lines} size={size} />;
      })}
    </div>
  );
}
