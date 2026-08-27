import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { SortTh } from '../components/SortTh';
import { supabase } from '../lib/supabase';
import { dashboardSessionHeaders, hasDashboardSession } from '../lib/dashboardSession';
import { useTableSortFields } from '../lib/tableSort';
import { useAuthStore } from '../store/authStore';

interface DashboardUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
}

export function UsuariosPage() {
  const userEmail = useAuthStore((s) => s.userEmail);
  const sessionNonce = useAuthStore((s) => s.sessionNonce);
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

  useEffect(() => {
    void fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    setListError('');
    try {
      if (!hasDashboardSession() || !userEmail || !sessionNonce) {
        setListError('Sessão inválida. Faça logout/login para listar usuários.');
        setUsers([]);
        return;
      }
      const bySession = await supabase.rpc('list_dashboard_users_by_session', {
        p_email: userEmail,
        p_nonce: sessionNonce,
      });
      if (bySession.error) {
        setListError(bySession.error.message);
        setUsers([]);
        return;
      }
      setUsers((bySession.data ?? []) as DashboardUser[]);
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
    if (!newEmail || !newName || !newPassword) {
      setCreateError('Preencha todos os campos.');
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
      const r = await fetch('/api/dashboard-create-user', {
        method: 'POST',
        headers: dashboardSessionHeaders(),
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          name: newName.trim(),
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

      setCreateSuccess(`Usuário ${newName.trim()} criado com sucesso!`);
      setShowForm(false);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('viewer');
      setTimeout(() => setCreateSuccess(''), 4000);
      void fetchUsers();
    } catch {
      setCreateError('Erro de conexão. Tente novamente.');
    }
  };

  const toggleActive = async (id: string) => {
    if (!userEmail || !sessionNonce || !hasDashboardSession()) {
      setListError('Reautentique-se para alterar status.');
      return;
    }
    const bySession = await supabase.rpc('toggle_user_active_by_session', {
      p_email: userEmail,
      p_nonce: sessionNonce,
      p_user_id: id,
    });
    if (bySession.error) {
      setListError(bySession.error.message);
      return;
    }
    void fetchUsers();
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
    <AdminLayout title="Gerenciar Usuarios" subtitle="Admin - criar e desativar acessos">
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500">{users.length} usuarios cadastrados</p>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Novo usuario
        </button>
      </div>

      {listError && (
        <div className="card p-4 mb-4 bg-amber-50 border-amber-200 text-amber-900 text-sm">{listError}</div>
      )}
      {createSuccess && (
        <div className="card p-4 mb-4 bg-emerald-50 border-emerald-200 text-emerald-700 text-sm font-medium">{createSuccess}</div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 shadow-sm mb-6 space-y-3">
          {createError && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-sm text-red-600">{createError}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field" placeholder="Nome completo" required />
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="input-field" placeholder="Email" required />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field" placeholder="Senha" required minLength={6} />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="input-field">
              <option value="viewer">Viewer</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Criar</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      )}

      <div className="card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Carregando…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <SortTh label="Nome" col="full_name" sortKey={userKey} sortDir={userDir} onSort={toggleUser} align="left" className="px-4" />
                <SortTh label="Email" col="email" sortKey={userKey} sortDir={userDir} onSort={toggleUser} align="left" className="px-4" />
                <SortTh label="Role" col="role" sortKey={userKey} sortDir={userDir} onSort={toggleUser} align="left" className="px-4" />
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
                    <button type="button" className="text-xs font-semibold text-indigo-700 hover:underline" onClick={() => void toggleActive(u.id)}>
                      {u.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
