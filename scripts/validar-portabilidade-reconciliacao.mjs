#!/usr/bin/env node
/**
 * Valida reconciliação funil gerencial ↔ histórico via APIs do dashboard.
 *
 * Uso:
 *   DASHBOARD_URL=https://3f-dashboard-correcao.pages.dev \
 *   DASHBOARD_EMAIL=admin@3f.com \
 *   DASHBOARD_SESSION=<nonce> \
 *   node scripts/validar-portabilidade-reconciliacao.mjs
 *
 * Obtenha DASHBOARD_SESSION após login (localStorage 3f-dashboard-auth → state.sessionNonce).
 */
const BASE = (process.env.DASHBOARD_URL || 'https://3f-dashboard-correcao.pages.dev').replace(/\/$/, '');
const EMAIL = (process.env.DASHBOARD_EMAIL || '').trim().toLowerCase();
const SESSION = (process.env.DASHBOARD_SESSION || '').trim();
const MES = process.env.MES || mesAtualBrt();

function mesAtualBrt() {
  const sp = new Date(Date.now() - 3 * 3600_000);
  return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth() + 1).padStart(2, '0')}`;
}

function gap(campo, funil, historico) {
  if (funil === historico) return null;
  return { campo, funil, historico, delta: funil - historico };
}

function reconcilia(g, h, universoFunil) {
  if (!g || !h) return { ok: false, error: 'Funil ou histórico ausente para o mês.' };
  const sucessoFunil = g.sucesso_tim ?? (g.portados ?? 0) + (g.falha_parcial ?? 0);
  const sucessoHist = h.sucesso_tim ?? h.portados + h.falha_parcial;
  const gaps = [
    gap('portados', g.portados ?? 0, h.portados),
    gap('falha_parcial', g.falha_parcial ?? 0, h.falha_parcial),
    gap('canceladas', g.canceladas ?? 0, h.canceladas),
    gap('fechados', g.fechados ?? 0, h.fechados),
    gap('sucesso_tim', sucessoFunil, sucessoHist),
    gap('quebras', g.quebras ?? 0, h.quebras),
    gap('bko', g.bko ?? 0, h.bko),
    universoFunil != null && h.universo != null ? gap('universo', universoFunil, h.universo) : null,
  ].filter(Boolean);
  return { ok: gaps.length === 0, gaps, fonte: h.fonte, universoHist: h.universo };
}

async function fetchJson(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'X-Dashboard-Email': EMAIL,
      'X-Dashboard-Session': SESSION,
    },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status} ${path}`);
  return body;
}

async function main() {
  if (!EMAIL || !SESSION) {
    console.error('Defina DASHBOARD_EMAIL e DASHBOARD_SESSION.');
    process.exit(2);
  }

  console.log(`== reconciliação portabilidade · ${MES} ==`);
  console.log(`URL: ${BASE}`);

  const [funil, historico] = await Promise.all([
    fetchJson(`/api/portabilidade-funil?mes=${encodeURIComponent(MES)}&modo=gerencial`),
    fetchJson('/api/portabilidade-historico?meses=3'),
  ]);

  const h = (historico.serie || []).find((p) => p.mes === MES);
  const g = funil.gerencial;
  const rec = funil.reconciliacao;
  const r = reconcilia(g, h, rec?.universo);

  if (r.error) {
    console.error('ERRO:', r.error);
    process.exit(1);
  }

  console.log(`Fonte histórico: ${r.fonte || '?'}`);
  console.log(`Universo funil: ${rec?.universo ?? '—'} · histórico: ${r.universoHist ?? 'null'}`);

  if (r.ok) {
    console.log('OK: histórico replica funil gerencial deste mês.');
    if (r.fonte === 'count' || r.universoHist == null) {
      console.log('AVISO: RPC 027 não aplicada — universo histórico incompleto.');
    }
    process.exit(0);
  }

  console.log(`DIVERGÊNCIA em ${r.gaps.length} campo(s):`);
  for (const x of r.gaps) {
    console.log(`  ${x.campo}: funil ${x.funil} · histórico ${x.historico} (Δ ${x.delta})`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
