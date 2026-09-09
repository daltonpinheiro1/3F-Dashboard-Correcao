import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { SortTh } from '../components/SortTh';
import { dashboardSessionHeaders, hasDashboardSession } from '../lib/dashboardSession';
import { useTableSortFields } from '../lib/tableSort';
import { PageAlert } from '../components/ui/PageAlert';

interface DashboardUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
}

export function UsuariosPage() {
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [newPassword, setNewPassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [listError, setListError] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    setListError('');
    try {
      if (!hasDashboardSession()) {
        setListError('Sessão inválida. Faça logout/login para listar usuários.');
        setUsers([]);
        return;
      }
      const response = await fetch('/api/dashboard-users', {
        headers: dashboardSessionHeaders(),
      });
      const body = (await response.json().catch(() => ({}))) as {
        users?: DashboardUser[];
        error?: string;
      };
      if (!response.ok) {
        setListError(body.error || 'Falha ao listar usuários.');
        setUsers([]);
        return;
      }
      setUsers(body.users ?? []);
    } catch (err) {
      console.error('fetchUsers error:', err);
      setListError('Falha ao listar usuários.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');
    const email = newEmail.trim().toLowerCase();
    const name = newName.trim();
    if (!email || !name || !newPassword) {
      setCreateError('Informe nome completo, e-mail e senha.');
      return;
    }
    if (name.length < 3) {
      setCreateError('O nome completo deve ter ao menos 3 caracteres.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCreateError('Informe um e-mail válido, como nome@empresa.com.');
      return;
    }
    if (newPassword.length < 6) {
      setCreateError('Senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (!hasDashboardSession()) {
      setCreateError('Sessão inválida. Faça logout/login.');
      return;
    }
    try {
      setCreateBusy(true);
      const r = await fetch('/api/dashboard-create-user', {
        method: 'POST',
        headers: dashboardSessionHeaders(),
        body: JSON.stringify({
          email,
          name,
          password: newPassword,
          role: newRole,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean };

      if (!r.ok) {
        setCreateError(data.error || `Erro ao criar (${r.status})`);
        return;
      }
      if (data.error) {
        setCreateError(data.error);
        return;
      }

      setCreateSuccess(`Usuário ${name} criado com sucesso.`);
      setShowForm(false);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('viewer');
      setTimeout(() => setCreateSuccess(''), 4000);
      void fetchUsers();
    } catch {
      setCreateError('Erro de conexão. Tente novamente.');
    } finally {
      setCreateBusy(false);
    }
  };

  const toggleActive = async (id: string) => {
    if (!hasDashboardSession()) {
      setListError('Reautentique-se para alterar status.');
      return;
    }
    setTogglingId(id);
    setListError('');
    try {
      const response = await fetch('/api/dashboard-users', {
        method: 'PATCH',
        headers: dashboardSessionHeaders(),
        body: JSON.stringify({ id }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setListError(body.error || 'Não foi possível alterar o acesso.');
        return;
      }
      await fetchUsers();
    } catch {
      setListError('Falha de conexão ao alterar o acesso. Tente novamente.');
    } finally {
      setTogglingId(null);
    }
  };

  const userRows = useMemo(
    () =>
      users.map((u) => ({
        ...u,
        _status: u.is_active ? 'Ativo' : 'Inativo',
      })),
    [users],
  );
  const {
    sorted: usersSorted,
    sortKey: userKey,
    sortDir: userDir,
    toggleSort: toggleUser,
  } = useTableSortFields(userRows, 'full_name', 'asc');

  return (
    <AdminLayout title="Gerenciar usuários" subtitle="Administração de criação e bloqueio de acessos">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <p className="text-sm text-gray-500">{users.length} usuário(s) cadastrado(s)</p>
        <button
          type="button"
          onClick={() => {
            setShowForm(!showForm);
            setCreateError('');
          }}
          className="btn-primary flex items-center gap-2"
          aria-expanded={showForm}
          aria-controls="novo-usuario-form"
        >
          <Plus size={16} />
          Novo usuário
        </button>
      </div>

      {listError && (
        <PageAlert variant="error" onDismiss={() => setListError('')}>{listError}</PageAlert>
      )}
      {createSuccess && (
        <PageAlert variant="success" onDismiss={() => setCreateSuccess('')}>{createSuccess}</PageAlert>
      )}

      {showForm && (
        <form id="novo-usuario-form" onSubmit={handleCreate} className="card p-5 shadow-sm mb-6 space-y-4" noValidate>
          <h2 className="text-sm font-semibold text-gray-800">Dados do novo usuário</h2>
          {createError && (
            <div role="alert" className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-sm text-red-700">{createError}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-gray-600" htmlFor="user-name">
              Nome completo *
              <input id="user-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field mt-1" autoComplete="name" required />
            </label>
            <label className="text-xs font-semibold text-gray-600" htmlFor="user-email">
              E-mail *
              <input id="user-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="input-field mt-1" autoComplete="email" required />
            </label>
            <label className="text-xs font-semibold text-gray-600" htmlFor="user-password">
              Senha temporária *
              <input id="user-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field mt-1" autoComplete="new-password" required minLength={6} aria-describedby="password-hint" />
              <span id="password-hint" className="block mt-1 font-normal text-gray-500">Mínimo de 6 caracteres.</span>
            </label>
            <label className="text-xs font-semibold text-gray-600" htmlFor="user-role">
              Perfil de acesso *
              <select id="user-role" value={newRole} onChange={(e) => setNewRole(e.target.value)} className="input-field mt-1">
                <option value="viewer">Visualizador</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={createBusy}>{createBusy ? 'Criando…' : 'Criar usuário'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary" disabled={createBusy}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card shadow-sm overflow-hidden" aria-live="polite">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Carregando…</div>
        ) : listError && usersSorted.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-gray-700">Não foi possível carregar os usuários</p>
            <button type="button" className="btn-secondary text-xs mt-4" onClick={() => void fetchUsers()}>
              Tentar novamente
            </button>
          </div>
        ) : usersSorted.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-gray-700">Nenhum usuário cadastrado</p>
            <p className="mt-1 text-xs text-gray-500">Crie o primeiro acesso para começar.</p>
            <button type="button" className="btn-primary text-xs mt-4" onClick={() => setShowForm(true)}>
              <Plus size={14} className="inline mr-1" /> Novo usuário
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Usuários cadastrados e seus perfis de acesso</caption>
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <SortTh label="Nome" col="full_name" sortKey={userKey} sortDir={userDir} onSort={toggleUser} align="left" className="px-4" />
                <SortTh label="Email" col="email" sortKey={userKey} sortDir={userDir} onSort={toggleUser} align="left" className="px-4" />
                <SortTh label="Perfil" col="role" sortKey={userKey} sortDir={userDir} onSort={toggleUser} align="left" className="px-4" />
                <SortTh label="Status" col="_status" sortKey={userKey} sortDir={userDir} onSort={toggleUser} align="left" className="px-4" />
                <th className="text-right px-4 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {(usersSorted as typeof userRows).map((u) => (
                <tr key={u.id} className="border-t border-gray-50">
                  <td className="px-4 py-2 font-medium">{u.full_name}</td>
                  <td className="px-4 py-2 text-gray-600">{u.email}</td>
                  <td className="px-4 py-2">{u.role}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-semibold ${u.is_active ? 'text-teal-700' : 'text-red-600'}`}>
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-semibold text-indigo-700 hover:underline disabled:text-gray-400"
                      onClick={() => void toggleActive(u.id)}
                      disabled={togglingId === u.id}
                      aria-label={`${u.is_active ? 'Desativar' : 'Ativar'} acesso de ${u.full_name}`}
                    >
                      {togglingId === u.id ? 'Salvando…' : u.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
