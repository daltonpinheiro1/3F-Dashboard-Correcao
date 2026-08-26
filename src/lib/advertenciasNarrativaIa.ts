import { TEXTO_MODELO_OFICIAL } from './advertenciasEscala';
import { dashboardSessionHeaders } from './dashboardSession';

export type NarrativaIaResult = {
  narrativa: string;
  explicacao: string;
  modelo?: string;
};

/**
 * Chama Pages Function /api/advertencia-narrativa (OpenAI no server).
 * Auth por sessão do usuário — secret nunca vai ao browser.
 */
export async function melhorarNarrativaAdvertencia(input: {
  rascunho: string;
  motivo: string;
  submotivo: string;
  nivelLabel: string;
  colaboradorNome: string;
  dataOcorrido: string;
}): Promise<NarrativaIaResult> {
  const motivoDoc = input.submotivo || input.motivo;
  const r = await fetch('/api/advertencia-narrativa', {
    method: 'POST',
    headers: dashboardSessionHeaders(),
    body: JSON.stringify({
      rascunho: input.rascunho,
      motivo: input.motivo,
      submotivo: input.submotivo,
      nivel_label: input.nivelLabel,
      colaborador_nome: input.colaboradorNome,
      data_ocorrido: input.dataOcorrido,
      clausula_modelo: TEXTO_MODELO_OFICIAL(motivoDoc.toLowerCase()),
    }),
  });

  const data = (await r.json().catch(() => ({}))) as {
    narrativa?: string;
    explicacao?: string;
    modelo?: string;
    error?: string;
    detalhe?: string;
  };

  if (!r.ok) {
    throw new Error(data.error || `Falha na IA (${r.status})${data.detalhe ? `: ${data.detalhe}` : ''}`);
  }
  if (!data.narrativa?.trim()) {
    throw new Error('IA não retornou narrativa.');
  }

  return {
    narrativa: data.narrativa.trim(),
    explicacao: (data.explicacao || '').trim(),
    modelo: data.modelo,
  };
}
