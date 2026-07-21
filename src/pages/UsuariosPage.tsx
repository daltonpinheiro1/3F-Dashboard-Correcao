import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('dashboard_users')
      .select('id, email, full_name, role, is_active, last_login_at')
      .order('created_at', { ascending: false });
    setUsers((data ?? []) as DashboardUser[]);
    setIsLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newName || !newPassword) return;

    // Create user via RPC (hashes password server-side)
    await supabase.rpc('create_dashboard_user', {
      p_email: newEmail.trim().toLowerCase(),
      p_name: newName.trim(),
      p_password: newPassword,
      p_role: newRole,
    });

    setShowForm(false);
    setNewEmail('');
    setNewName('');
    setNewPassword('');
    setNewRole('viewer');
    fetchUsers();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase
      .from('dashboard_users')
      .update({ is_active: !current })
      .eq('id', id);
    fetchUsers();
  };

  return (
    <AdminLayout title="Gerenciar Usuarios" subtitle="Admin - criar e desativar acessos">
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500">{users.length} usuarios cadastrados</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Novo usuario
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 shadow-sm mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="input-field"
              placeholder="Nome completo"
              required
            />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="input-field"
              placeholder="Email"
              required
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-field"
              placeholder="Senha"
              required
              minLength={6}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="input-field"
            >
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

      {/* Users table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="card h-14 skeleton" />)}
        </div>
      ) : (
        <div className="card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 text-xs">
                <th className="text-left px-6 py-3 font-medium">Nome</th>
                <th className="text-left px-6 py-3 font-medium">Email</th>
                <th className="text-left px-6 py-3 font-medium">Role</th>
                <th className="text-left px-6 py-3 font-medium">Status</th>
                <th className="text-left px-6 py-3 font-medium">Ultimo login</th>
                <th className="text-right px-6 py-3 font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-semibold text-gray-900">{u.full_name}</td>
                  <td className="px-6 py-3 text-gray-600">{u.email}</td>
                  <td className="px-6 py-3">
                    <span className={`badge ${
                      u.role === 'admin' ? 'bg-purple-50 text-purple-600'
                      : u.role === 'supervisor' ? 'bg-blue-50 text-blue-600'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`badge ${u.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-400">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString('pt-BR') : 'Nunca'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => toggleActive(u.id, u.is_active)}
                      className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                        u.is_active
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {u.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
