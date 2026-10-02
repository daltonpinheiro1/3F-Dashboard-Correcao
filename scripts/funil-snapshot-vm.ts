/**
 * Roda na VM: monta o funil com a MESMA lógica do Pages, sem teto de páginas, e
 * publica em eva-dash/portabilidade/funil/{mes}/{modo}/ (resumo + uma fatia por arquivo).
 *
 * Build:  npm run build:funil-vm   → dist-vm/funil-snapshot.mjs
 * VM:     node --env-file=.env funil-snapshot.mjs [--meses 1]
 * Env:    QIGGER_SUPABASE_URL/QIGGER_SUPABASE_SERVICE_KEY (fila/CE) e
 *         SUPABASE_URL/SUPABASE_SERVICE_KEY (storage do dashboard).
 * Só imprime contagens — nenhum dado de proposta sai no log.
 */
import { montarUniverso } from '../functions/api/portabilidade-funil';
import { objFunil, particionarFunil } from '../functions/_lib/funilSnapshot';

const MODOS = ['operacional', 'gerencial'] as const;

function mesesBrt(n: number, agora = new Date()): string[] {
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function exigir(nome: string): string {
  const v = (process.env[nome] || '').trim();
  if (!v) throw new Error(`env ${nome} ausente`);
  return v;
}

async function main(): Promise<number> {
  const i = process.argv.indexOf('--meses');
  const n = Math.min(3, Math.max(1, Number(i > 0 ? process.argv[i + 1] : 1) || 1));
  const fila = { url: exigir('QIGGER_SUPABASE_URL').replace(/\/$/, ''), key: exigir('QIGGER_SUPABASE_SERVICE_KEY') };
  const dash = { url: exigir('SUPABASE_URL').replace(/\/$/, ''), key: exigir('SUPABASE_SERVICE_KEY') };

  // 502/520 do storage são passageiros: sem nova tentativa o mês/modo inteiro se perde.
  const ESPERAS_5XX_MS = [3_000, 10_000];
  const subir = async (obj: string, payload: unknown) => {
    const body = JSON.stringify(payload);
    for (let tentativa = 0; ; tentativa++) {
      const r = await fetch(`${dash.url}/storage/v1/object/eva-dash/${obj}`, {
        method: 'POST',
        headers: {
          apikey: dash.key,
          Authorization: `Bearer ${dash.key}`,
          'Content-Type': 'application/json',
          'x-upsert': 'true',
          'cache-control': 'no-cache, max-age=0',
        },
        body,
      });
      if (r.ok) return;
      const espera = ESPERAS_5XX_MS[tentativa];
      if (r.status < 500 || espera === undefined) throw new Error(`upload ${obj} HTTP ${r.status}`);
      await new Promise((ok) => setTimeout(ok, espera));
    }
  };

  let falhas = 0;
  for (const mes of mesesBrt(n)) {
    for (const modo of MODOS) {
      const t0 = Date.now();
      try {
        const built = await montarUniverso(fila, { mes, modo, semTeto: true });
        const { resumo, fatias } = particionarFunil(built);
        for (const [id, conteudo] of Object.entries(fatias)) {
          await subir(objFunil(mes, modo, `fatia-${id}`), conteudo);
        }
        // Resumo por último: o painel só troca para a VM quando tudo já subiu.
        await subir(objFunil(mes, modo, 'resumo'), resumo);
        const rec = built.reconciliacao;
        console.log(
          `${new Date().toISOString()} funil ${mes} ${modo} universo=${rec.universo} ` +
            `fecha=${rec.fecha} confianca=${rec.confianca} truncamentos=${rec.truncamentos.length} ` +
            `ms=${Date.now() - t0}`,
        );
      } catch (exc) {
        falhas += 1;
        console.log(`${new Date().toISOString()} funil ${mes} ${modo} FALHOU: ${exc instanceof Error ? exc.message : exc}`);
      }
    }
  }
  return falhas ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (exc) => {
    console.log(`funil-snapshot FALHOU: ${exc instanceof Error ? exc.message : exc}`);
    process.exit(1);
  },
);
