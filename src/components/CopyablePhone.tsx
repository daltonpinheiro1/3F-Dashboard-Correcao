import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { formatPhoneFull, phoneDigitsForCopy } from '../lib/evaDash';

type Props = {
  areaCode?: number | null;
  phone?: string | null;
  className?: string;
};

/** Telefone completo com clique para copiar (monitoramento). */
export function CopyablePhone({ areaCode, phone, className = '' }: Props) {
  const [copied, setCopied] = useState(false);
  const label = formatPhoneFull(areaCode, phone);
  const digits = phoneDigitsForCopy(areaCode, phone);

  const onCopy = useCallback(async () => {
    if (label === '—') return;
    const text = digits || label.replace(/\D/g, '') || label;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }, [digits, label]);

  if (label === '—') {
    return <span className={`text-gray-400 ${className}`}>—</span>;
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      title={digits ? `Copiar ${digits}` : 'Copiar telefone'}
      className={`inline-flex items-center gap-1 tabular-nums text-left text-gray-800 hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded ${className}`}
    >
      <span>{label}</span>
      {copied ? (
        <Check size={12} className="shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <Copy size={12} className="shrink-0 opacity-40" aria-hidden />
      )}
      <span className="sr-only">{copied ? 'Copiado' : 'Clique para copiar'}</span>
    </button>
  );
}
