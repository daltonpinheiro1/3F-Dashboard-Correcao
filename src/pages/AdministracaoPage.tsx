import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Save, Trash2 } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { PageAlert } from '../components/ui/PageAlert';
import { dashboardSessionHeaders, hasDashboardSession } from '../lib/dashboardSession';
import { ABA_CATALOG } from '../lib/abasCatalog';
import {
  applyMetasToStore,
  competenciaAtual,
  fetchMetas,
  type MetaCampanhaRow,
} from '../lib/metasApi';
import { CAMPANHA_FILTRO_OPTIONS } from '../lib/evaDash';
import { useMetaCpcStore } from '../store/metaCpcStore';

type Tab = 'metas' | 'perfis' | 'usuarios';

type Perfil = {
  id: string;
  slug: string;
  nome: string;
  abas: string[];
  is_system: boolean;
  usuarios: number;
};

type DashUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  perfil_id?: string;
  perfil_nome?: string;
  perfil_slug?: string;
};

const CAMPANHAS_META = CAMPANHA_FILTRO_OPTIONS.filter((c) => c.id !== 'TODAS');

export function AdministracaoPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['metas', 'perfis', 'usuarios'].includes(params.get('tab') || '')
    ? params.get('tab')
    : 'metas') as Tab;
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <AdminLayout title="Administração" subtitle="Metas da operação, perfis de acesso e usuários">
      <div className="flex gap-2 mb-5 flex-wrap">
        {(
          [
            ['metas', 'Metas'],
            ['perfis', 'Perfis'],
            ['usuarios', 'Usuários'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
              tab === id ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'metas' && <MetasTab />}
      {tab === 'perfis' && <PerfisTab />}
      {tab === 'usuarios' && <UsuariosTab />}
    </AdminLayout>
  );
}

function MetasTab() {
  const competencia = competenciaAtual();
  const [cpc, setCpc] = useState(65);
  const [rows, setRows] = useState<MetaCampanhaRow[]>([]);
  const [sups, setSups] = useState<Array<{ supervisor_name: string; cpc_pct: number }>>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const rankingHint = Object.keys(useMetaCpcStore.getState().metasSup);

  useEffect(() => {
    void (async () => {
      const payload = await fetchMetas(competencia);
      if (!payload) {
        setErr('Não foi possível carregar metas (API ou migration). Usando valores locais.');
        const s = useMetaCpcStore.getState();
        setCpc(s.metaDia);
        setRows([
          { campanha_op: 'PORTABILIDADE', cpc_pct: s.metaDia, vendas_mes: s.metaVendasMesPort, expediente_horas: s.expedienteHorasPort },
          { campanha_op: 'MIGRACAO', cpc_pct: s.metaDia, vendas_mes: s.metaVendasMesMig, expediente_horas: s.expedienteHorasMig },
          { campanha_op: 'ACAO_BKO', cpc_pct: s.metaDia, vendas_mes: s.metaVendasMesBko, expediente_horas: s.expedienteHorasBko },
          { campanha_op: 'CONTROLE_CONTROLE', cpc_pct: s.metaDia, vendas_mes: s.metaVendasMesCc, expediente_horas: s.expedienteHorasCc },
          { campanha_op: 'ALGAR', cpc_pct: s.metaDia, vendas_mes: s.metaVendasMesAlgar, expediente_horas: s.expedienteHorasAlgar },
        ]);
        setSups(Object.entries(s.metasSup).map(([supervisor_name, cpc_pct]) => ({ supervisor_name, cpc_pct })));
        return;
      }
      applyMetasToStore(payload);
      const todas = payload.campanhas.find((c) => c.campanha_op === 'TODAS');
      setCpc(Number(todas?.cpc_pct ?? 65));
      const by = Object.fromEntries(payload.campanhas.map((c) => [c.campanha_op, c]));
      setRows(
        CAMPANHAS_META.map((c) => {
          const src = by[c.id];
          return {
            campanha_op: c.id,
            cpc_pct: Number(src?.cpc_pct ?? 65),
            vendas_mes: Number(src?.vendas_mes ?? 0),
            expediente_horas: Number(src?.expediente_horas ?? 8),
          };
        }),
      );
      setSups(payload.supervisores || []);
    })();
  }, [competencia]);

  const save = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const campanhas = [
        { campanha_op: 'TODAS', cpc_pct: cpc, vendas_mes: 0, expediente_horas: 8 },
        ...rows,
      ];
      const r = await fetch('/api/metas', {
        method: 'PUT',
        headers: { ...dashboardSessionHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencia, campanhas, supervisores: sups }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error || 'Falha ao gravar.');
      applyMetasToStore({ competencia, campanhas, supervisores: sups });
      setMsg(`Metas ${competencia} gravadas.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao gravar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {err && <PageAlert variant="error">{err}</PageAlert>}
      {msg && <PageAlert variant="success">{msg}</PageAlert>}
      <p className="text-sm text-gray-500">Competência {competencia} · vale para todos os usuários.</p>
      <label className="text-xs text-gray-500 block max-w-xs">
        CPC casa %
        <input
          type="number"
          min={1}
          max={100}
          step={0.1}
          value={cpc}
          onChange={(e) => setCpc(Number(e.target.value))}
          className="input-field mt-1 w-full"
        />
      </label>
      <div className="overflow-x-auto card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-400">
              <th className="p-3">Campanha</th>
              <th className="p-3">CPC %</th>
              <th className="p-3">Vendas / mês</th>
              <th className="p-3">Expediente (h)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.campanha_op} className="border-t border-gray-100">
                <td className="p-3 font-medium">
                  {CAMPANHAS_META.find((c) => c.id === row.campanha_op)?.label || row.campanha_op}
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    className="input-field w-24"
                    value={row.cpc_pct}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...n[i], cpc_pct: Number(e.target.value) };
                      setRows(n);
                    }}
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    className="input-field w-28"
                    value={row.vendas_mes}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...n[i], vendas_mes: Number(e.target.value) };
                      setRows(n);
                    }}
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    min={4}
                    max={13}
                    className="input-field w-20"
                    value={row.expediente_horas}
                    onChange={(e) => {
                      const n = [...rows];
                      n[i] = { ...n[i], expediente_horas: Number(e.target.value) };
                      setRows(n);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card p-4">
        <h3 className="text-sm font-bold mb-2">CPC por supervisor</h3>
        <div className="space-y-2">
          {sups.map((s, i) => (
            <div key={`${s.supervisor_name}-${i}`} className="flex gap-2 items-center">
              <input
                className="input-field flex-1"
                value={s.supervisor_name}
                onChange={(e) => {
                  const n = [...sups];
                  n[i] = { ...n[i], supervisor_name: e.target.value };
                  setSups(n);
                }}
              />
              <input
                type="number"
                className="input-field w-24"
                value={s.cpc_pct}
                onChange={(e) => {
                  const n = [...sups];
                  n[i] = { ...n[i], cpc_pct: Number(e.target.value) };
                  setSups(n);
                }}
              />
              <button type="button" className="text-red-500" onClick={() => setSups(sups.filter((_, j) => j !== i))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-brand-navy font-semibold"
            onClick={() => setSups([...sups, { supervisor_name: rankingHint[0] || '', cpc_pct: cpc }])}
          >
            + supervisor
          </button>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={() => void save()} className="btn-primary inline-flex items-center gap-2">
        <Save size={16} /> {busy ? 'Gravando…' : 'Salvar metas'}
      </button>
    </div>
  );
}

function PerfisTab() {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [sel, setSel] = useState<Perfil | null>(null);
  const [nome, setNome] = useState('');
  const [abas, setAbas] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setErr('');
    const r = await fetch('/api/perfis', { headers: dashboardSessionHeaders() });
    const body = (await r.json().catch(() => ({}))) as { perfis?: Perfil[]; error?: string };
    if (!r.ok) {
      setErr(body.error || 'Falha ao listar perfis.');
      return;
    }
    setPerfis(
      (body.perfis || []).map((p) => ({
        ...p,
        abas: Array.isArray(p.abas) ? p.abas : [],
      })),
    );
  };

  useEffect(() => {
    void load();
  }, []);

  const pick = (p: Perfil) => {
    setSel(p);
    setNome(p.nome);
    setAbas([...p.abas]);
  };

  const toggleAba = (id: string) => {
    if (sel?.slug === 'admin' && id === 'administracao') return;
    setAbas((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const save = async () => {
    setErr('');
    setMsg('');
    const payload = { id: sel?.id, nome, abas: sel?.slug === 'admin' ? Array.from(new Set([...abas, 'administracao'])) : abas };
    const r = await fetch('/api/perfis', {
      method: sel ? 'PATCH' : 'POST',
      headers: { ...dashboardSessionHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setErr(body.error || 'Falha ao salvar perfil.');
      return;
    }
    setMsg('Perfil gravado.');
    setSel(null);
    setNome('');
    setAbas([]);
    await load();
  };

  const remove = async (p: Perfil) => {
    if (!confirm(`Excluir perfil ${p.nome}?`)) return;
    const r = await fetch(`/api/perfis?id=${encodeURIComponent(p.id)}`, {
      method: 'DELETE',
      headers: dashboardSessionHeaders(),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setErr(body.error || 'Não foi possível excluir.');
      return;
    }
    if (sel?.id === p.id) {
      setSel(null);
      setNome('');
      setAbas([]);
    }
    await load();
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        {err && <PageAlert variant="error">{err}</PageAlert>}
        {msg && <PageAlert variant="success">{msg}</PageAlert>}
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-sm">Perfis</h3>
          <button
            type="button"
            className="text-sm font-semibold text-brand-navy inline-flex items-center gap-1"
            onClick={() => {
              setSel(null);
              setNome('');
              setAbas(['dashboard']);
            }}
          >
            <Plus size={14} /> Novo
          </button>
        </div>
        <ul className="space-y-2">
          {perfis.map((p) => (
            <li key={p.id} className="card p-3 flex items-center gap-2">
              <button type="button" className="flex-1 text-left" onClick={() => pick(p)}>
                <div className="font-semibold text-sm">{p.nome}</div>
                <div className="text-xs text-gray-400">
                  {p.slug} · {p.abas.length} abas · {p.usuarios} usuário(s)
                  {p.is_system ? ' · sistema' : ''}
                </div>
              </button>
              {!p.is_system && (
                <button type="button" className="text-red-500" onClick={() => void remove(p)}>
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="card p-4">
        <h3 className="font-bold text-sm mb-3">{sel ? `Editar: ${sel.nome}` : 'Novo perfil'}</h3>
        <label className="text-xs text-gray-500 block mb-3">
          Nome
          <input className="input-field mt-1 w-full" value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <p className="text-xs text-gray-400 mb-2">Abas visíveis</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-80 overflow-y-auto mb-4">
          {ABA_CATALOG.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={abas.includes(a.id)}
                disabled={sel?.slug === 'admin' && a.id === 'administracao'}
                onChange={() => toggleAba(a.id)}
              />
              {a.label}
            </label>
          ))}
        </div>
        <button type="button" className="btn-primary" onClick={() => void save()}>
          Salvar perfil
        </button>
      </div>
    </div>
  );
}

function UsuariosTab() {
  const [users, setUsers] = useState<DashUser[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<DashUser | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [perfilId, setPerfilId] = useState('');

  const load = async () => {
    if (!hasDashboardSession()) {
      setErr('Sessão inválida.');
      return;
    }
    const [u, p] = await Promise.all([
      fetch('/api/dashboard-users', { headers: dashboardSessionHeaders() }),
      fetch('/api/perfis', { headers: dashboardSessionHeaders() }),
    ]);
    const ub = (await u.json().catch(() => ({}))) as { users?: DashUser[]; error?: string };
    const pb = (await p.json().catch(() => ({}))) as { perfis?: Perfil[]; error?: string };
    if (!u.ok) setErr(ub.error || 'Falha ao listar usuários.');
    else setUsers(ub.users || []);
    if (p.ok) setPerfis(pb.perfis || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const viewerId = useMemo(() => perfis.find((x) => x.slug === 'viewer')?.id || '', [perfis]);

  const resetForm = () => {
    setShowForm(false);
    setEdit(null);
    setFullName('');
    setEmail('');
    setPassword('');
    setPerfilId(viewerId);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const r = await fetch('/api/dashboard-create-user', {
      method: 'POST',
      headers: { ...dashboardSessionHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fullName,
        email,
        password,
        perfil_id: perfilId || undefined,
      }),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setErr(body.error || 'Falha ao criar.');
      return;
    }
    setMsg('Usuário criado.');
    resetForm();
    await load();
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setErr('');
    const r = await fetch('/api/dashboard-users', {
      method: 'PATCH',
      headers: { ...dashboardSessionHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: edit.id,
        full_name: fullName,
        perfil_id: perfilId || null,
        password: password || undefined,
      }),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setErr(body.error || 'Falha ao atualizar.');
      return;
    }
    setMsg('Usuário atualizado.');
    resetForm();
    await load();
  };

  const toggle = async (u: DashUser) => {
    const r = await fetch('/api/dashboard-users', {
      method: 'PATCH',
      headers: { ...dashboardSessionHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, toggle: true }),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setErr(body.error || 'Falha ao alterar acesso.');
      return;
    }
    await load();
  };

  return (
    <div>
      {err && <PageAlert variant="error">{err}</PageAlert>}
      {msg && <PageAlert variant="success">{msg}</PageAlert>}
      <div className="flex justify-end mb-3">
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-1"
          onClick={() => {
            setEdit(null);
            setShowForm(true);
            setFullName('');
            setEmail('');
            setPassword('');
            setPerfilId(viewerId);
          }}
        >
          <Plus size={14} /> Novo usuário
        </button>
      </div>
      {(showForm || edit) && (
        <form onSubmit={edit ? submitEdit : submitCreate} className="card p-4 mb-4 grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">
            Nome
            <input className="input-field mt-1 w-full" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label className="text-xs text-gray-500">
            Email
            <input
              className="input-field mt-1 w-full"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required={!edit}
              disabled={!!edit}
            />
          </label>
          <label className="text-xs text-gray-500">
            Perfil
            <select className="input-field mt-1 w-full" value={perfilId} onChange={(e) => setPerfilId(e.target.value)}>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            {edit ? 'Nova senha (opcional)' : 'Senha'}
            <input
              className="input-field mt-1 w-full"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!edit}
              minLength={6}
            />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary">
              {edit ? 'Salvar' : 'Criar'}
            </button>
            <button type="button" className="text-sm text-gray-500" onClick={resetForm}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <div className="overflow-x-auto card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-400">
              <th className="p-3">Nome</th>
              <th className="p-3">Email</th>
              <th className="p-3">Perfil</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="p-3">{u.full_name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.perfil_nome || u.role}</td>
                <td className="p-3">{u.is_active ? 'Ativo' : 'Inativo'}</td>
                <td className="p-3 text-right space-x-2">
                  <button
                    type="button"
                    className="text-brand-navy text-xs font-semibold"
                    onClick={() => {
                      setEdit(u);
                      setShowForm(false);
                      setFullName(u.full_name);
                      setEmail(u.email);
                      setPassword('');
                      setPerfilId(u.perfil_id || viewerId);
                    }}
                  >
                    Editar
                  </button>
                  <button type="button" className="text-xs font-semibold" onClick={() => void toggle(u)}>
                    {u.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
