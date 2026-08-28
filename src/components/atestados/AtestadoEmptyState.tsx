import type { ReactNode } from 'react';
import { FileHeart, Inbox, Sparkles } from 'lucide-react';

export function AtestadoEmptyState({
  variant,
  action,
}: {
  variant: 'acervo' | 'inss' | 'absenteismo' | 'duplicidades';
  action?: ReactNode;
}) {
  const cfg = {
    acervo: {
      icon: Inbox,
      title: 'Acervo vazio',
      text: 'Nenhum atestado corresponde aos filtros. Protocolar o primeiro ou limpe a busca.',
    },
    inss: {
      icon: FileHeart,
      title: 'Nenhum caso INSS neste ano',
      text: 'Não há afastamentos acima de 15 dias — fila INSS limpa.',
    },
    absenteismo: {
      icon: Sparkles,
      title: 'Sem padrões detectados',
      text: 'Nenhuma frequência ou CID recorrente na janela de 60 dias.',
    },
    duplicidades: {
      icon: FileHeart,
      title: 'Sem sobreposições',
      text: 'Nenhum período duplicado detectado no ano selecionado.',
    },
  }[variant];

  const Icon = cfg.icon;
  return (
    <div className="card p-8 text-center space-y-3">
      <Icon className="mx-auto text-gray-300" size={40} />
      <h4 className="text-sm font-semibold text-gray-800">{cfg.title}</h4>
      <p className="text-xs text-gray-500 max-w-sm mx-auto">{cfg.text}</p>
      {action}
    </div>
  );
}
