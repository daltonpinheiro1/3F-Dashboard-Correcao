/**
 * Funil pré-calculado na VM (eva-dash/portabilidade/funil/{mes}/{modo}/…).
 * No Pages o universo completo não cabe em 50 subrequests; a VM lê sem teto e
 * publica resumo.json + fatia-{id}.json. Sem arquivo fresco, o endpoint cai no ao vivo.
 */

import { sbFetch, type EnvAuth } from './auth';

export const FUNIL_PREFIXO = 'portabilidade/funil';
/** VM publica a cada 30 min; acima disso o painel prefere o ao vivo (parcial) a um número velho. */
export const FUNIL_IDADE_MAX_MS = 75 * 60_000;

export function objFunil(mes: string, modo: string, arquivo: string): string {
  return `${FUNIL_PREFIXO}/${mes}/${modo}/${arquivo}.json`;
}

export function funilFresco(raw: unknown, agora = Date.now()): boolean {
  const t = Date.parse(String((raw as { gerado_em?: unknown } | null)?.gerado_em || ''));
  if (!Number.isFinite(t)) return false;
  const idade = agora - t;
  return idade <= FUNIL_IDADE_MAX_MS && idade >= -5 * 60_000;
}

export async function lerFunilSnapshot<T>(env: EnvAuth, obj: string, agora = Date.now()): Promise<T | null> {
  try {
    const r = await sbFetch(env, `/storage/v1/object/eva-dash/${obj}`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const raw = await r.json().catch(() => null);
    return funilFresco(raw, agora) ? (raw as T) : null;
  } catch {
    return null;
  }
}

type Montado<I extends { fatia: string }> = {
  gerado_em: string;
  periodo: unknown;
  reconciliacao: unknown;
  meta: Record<string, unknown>;
  _items: I[];
};

/** Um arquivo por fatia (inclusive vazias: vazio ≠ ausente) + resumo sem os itens. */
export function particionarFunil<B extends Montado<{ fatia: string }>>(built: B) {
  type I = B['_items'][number];
  const { _items, ...resumo } = built;
  const fatias: Record<string, { gerado_em: string; periodo: unknown; reconciliacao: unknown; items: I[] }> = {};
  for (const id of Object.keys(built.meta)) {
    fatias[id] = { gerado_em: built.gerado_em, periodo: built.periodo, reconciliacao: built.reconciliacao, items: [] };
  }
  for (const it of _items) fatias[it.fatia]?.items.push(it);
  return { resumo, fatias };
}
