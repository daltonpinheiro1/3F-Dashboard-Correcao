/**
 * Meta mensal — portados (% do universo cohort).
 * Padrão: 40% portados.
 *
 * Secrets Pages:
 *   PORTABILIDADE_META_PORTADOS_PCT=40
 *   PORTABILIDADE_META_JSON={"2026-08":{"portados_pct":40},"default":{"portados_pct":40}}
 *   (legado numérico = meta absoluta de portados: {"2026-08":2600})
 */
export const DEFAULT_META_PORTADOS_PCT = 40;

export type MetaMes = {
  mes: string;
  portados_pct: number;
  meta_portados: number | null;
  universo: number | null;
  fonte: 'default' | 'json' | 'env' | 'absoluto' | null;
};

type EnvMeta = {
  PORTABILIDADE_META_JSON?: string;
  PORTABILIDADE_META_PORTADOS_PCT?: string;
  /** @deprecated use PORTABILIDADE_META_PORTADOS_PCT */
  PORTABILIDADE_META_SUCESSO_TIM?: string;
};

function parsePct(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

function parseJsonEntry(v: unknown): { portados_pct?: number; portados_abs?: number } | null {
  if (typeof v === 'number' && v > 0) {
    return { portados_abs: Math.round(v) };
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const pct = parsePct(o.portados_pct ?? o.pct ?? o.meta_portados_pct);
    const abs = typeof o.portados === 'number' ? Math.round(o.portados) : null;
    if (pct != null || abs != null) {
      return { portados_pct: pct ?? undefined, portados_abs: abs ?? undefined };
    }
  }
  return null;
}

export function resolveMetaPortados(
  env: EnvMeta,
  mes: string,
  universo?: number | null,
): MetaMes {
  const uni = universo && universo > 0 ? universo : null;
  const jsonRaw = (env.PORTABILIDADE_META_JSON || '').trim();

  if (jsonRaw) {
    try {
      const o = JSON.parse(jsonRaw) as Record<string, unknown>;
      const entry = parseJsonEntry(o[mes] ?? o.default);
      if (entry?.portados_abs) {
        return {
          mes,
          portados_pct: uni ? Math.round((entry.portados_abs / uni) * 1000) / 10 : DEFAULT_META_PORTADOS_PCT,
          meta_portados: entry.portados_abs,
          universo: uni,
          fonte: 'absoluto',
        };
      }
      if (entry?.portados_pct && uni) {
        return {
          mes,
          portados_pct: entry.portados_pct,
          meta_portados: Math.round((uni * entry.portados_pct) / 100),
          universo: uni,
          fonte: 'json',
        };
      }
    } catch {
      /* ignore */
    }
  }

  const envPct = parsePct(env.PORTABILIDADE_META_PORTADOS_PCT);
  if (envPct != null) {
    return {
      mes,
      portados_pct: envPct,
      meta_portados: uni ? Math.round((uni * envPct) / 100) : null,
      universo: uni,
      fonte: 'env',
    };
  }

  return {
    mes,
    portados_pct: DEFAULT_META_PORTADOS_PCT,
    meta_portados: uni ? Math.round((uni * DEFAULT_META_PORTADOS_PCT) / 100) : null,
    universo: uni,
    fonte: 'default',
  };
}

export function pctMeta(atual: number, meta: number): number {
  if (!meta) return 0;
  return Math.round((atual / meta) * 1000) / 10;
}

/** @deprecated use resolveMetaPortados */
export function parseMetaSucessoTim(env: EnvMeta, mes: string): MetaMes {
  return resolveMetaPortados(env, mes, null);
}
