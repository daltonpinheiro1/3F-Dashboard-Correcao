import { type ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, BarChart3, Trophy, AlertTriangle,
  LogOut, Menu, ChevronRight, Shield, TrendingUp, Zap,
  ChevronsLeft, ChevronsRight, MessageSquare, Headphones, PhoneCall, Clock, FileWarning
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const navItems: Array<{
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
  /** Se definido, só esses roles veem o item. Sem roles = todos autenticados. */
  roles?: string[];
}> = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'Operadores', href: '/operadores' },
  { icon: Trophy, label: 'Supervisores', href: '/supervisores' },
  { icon: AlertTriangle, label: 'Erros', href: '/erros' },
  { icon: FileWarning, label: 'Advertências', href: '/advertencias', roles: ['admin'] },
  { icon: TrendingUp, label: 'Evolução', href: '/evolucao' },
  { icon: Zap, label: 'Insights', href: '/insights' },
  { icon: MessageSquare, label: 'SMS Prévio', href: '/sms' },
  { icon: Headphones, label: 'Operação', href: '/operacao' },
  { icon: PhoneCall, label: 'Chamadas', href: '/chamadas' },
  { icon: Clock, label: 'Hora a hora', href: '/hora', roles: ['admin'] },
  { icon: BarChart3, label: 'Discagens', href: '/discagens', roles: ['admin', 'supervisor', 'viewer'] },
  { icon: Shield, label: 'Usuários', href: '/usuarios', roles: ['admin'] },
];

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { userName, userEmail, userRole, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleCollapse = () => {
    setCollapsed((prev) => !prev);
  };

  const filteredNav = navItems.filter(
    (item) => !item.roles?.length || item.roles.map((r) => r.toLowerCase()).includes((userRole || '').toLowerCase()),
  );

  // Shared sidebar content renderer (NOT a component — plain JSX)
  const renderSidebar = (isMobile: boolean) => {
    const isCollapsed = !isMobile && collapsed;
    return (
      <div className="flex flex-col h-full bg-gray-900">
        {/* Brand */}
        <div className={`border-b border-gray-800 ${isCollapsed ? 'p-3' : 'p-5'}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className={`${isCollapsed ? 'w-8 h-8' : 'w-9 h-9'} rounded-xl shadow overflow-hidden flex-shrink-0`}>
              <img src="/logo-3f-oficial.png" alt="3F Contact Center" className="w-full h-full object-cover" />
            </div>
            {!isCollapsed && (
              <div>
                <div className="text-white font-bold text-sm leading-none">3F Contact Center</div>
                <div className="text-gray-500 text-xs font-medium leading-none mt-0.5">Correção Cadastral</div>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className={`flex-1 ${isCollapsed ? 'p-2' : 'p-4'} space-y-1 overflow-y-auto`}>
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                title={isCollapsed ? item.label : undefined}
                className={`flex items-center ${isCollapsed ? 'justify-center' : ''} gap-3 ${isCollapsed ? 'px-2 py-2.5' : 'px-3 py-2.5'} rounded-xl text-sm font-medium transition-all duration-150 group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <item.icon size={18} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-white'}`} />
                {!isCollapsed && item.label}
                {!isCollapsed && isActive && <ChevronRight size={14} className="ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        {!isMobile && (
          <div className="px-3 py-2 border-t border-gray-800">
            <button
              type="button"
              onClick={toggleCollapse}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl text-xs font-medium transition-all cursor-pointer"
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
              {!collapsed && <span>Recolher</span>}
            </button>
          </div>
        )}

        {/* User */}
        <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t border-gray-800`}>
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-3 mb-3 px-2">
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-300 text-xs font-bold">
                    {userName?.charAt(0).toUpperCase() ?? 'A'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-xs font-semibold truncate">{userName}</div>
                  <div className="text-gray-500 text-xs truncate">{userEmail}</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-xl text-sm font-medium transition-all"
              >
                <LogOut size={16} />
                Sair
              </button>
            </>
          ) : (
            <button
              onClick={handleLogout}
              title="Sair"
              className="w-full flex items-center justify-center py-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-xl transition-all"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <div
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 z-30 transition-all duration-300 ease-in-out ${
          collapsed ? 'lg:w-[68px]' : 'lg:w-60'
        }`}
      >
        {renderSidebar(false)}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <button
            type="button"
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-[min(85vw,280px)] flex flex-col animate-slide-up sm:animate-none shadow-2xl">
            {renderSidebar(true)}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 ${collapsed ? 'lg:pl-[68px]' : 'lg:pl-60'} flex flex-col min-h-[100dvh] transition-all duration-300 ease-in-out`}>
        {/* Top bar */}
        <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/80 sticky top-0 z-20 shadow-sm supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between px-4 sm:px-6 min-h-[56px] h-14">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                aria-label="Abrir menu"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-gray-900 leading-tight truncate">{title}</h1>
                {subtitle && <p className="text-[10px] sm:text-xs text-gray-400 leading-tight truncate">{subtitle}</p>}
              </div>
            </div>
            <div className="hidden sm:flex text-xs text-gray-400 font-medium shrink-0">
              <BarChart3 size={14} className="inline mr-1" />
              Bot Processamento
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 pb-safe page-enter">
          {children}
        </main>
      </div>
    </div>
  );
}
