import { createContext, type ReactNode, useContext, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, BarChart3, Trophy, AlertTriangle,
  LogOut, Menu, ChevronRight, Shield, TrendingUp, Zap,
  ChevronsLeft, ChevronsRight, MessageSquare, Headphones, PhoneCall, Clock, FileWarning, ClipboardCheck, FileHeart, Rocket, Presentation, Send, Brain,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { logoutDashboardSession } from '../lib/sessionLogout';
import { fetchAtestadosStats } from '../lib/atestadosService';
import { hasDashboardSession } from '../lib/dashboardSession';
import { HeaderSync, PageHeaderProvider, usePageMeta } from '../lib/pageHeader';

export const ShellCtx = createContext(false);

const navItems: Array<{
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
  roles?: string[];
  badgeKey?: 'atestados_pendentes';
}> = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'Operadores', href: '/operadores' },
  { icon: Trophy, label: 'Supervisores', href: '/supervisores' },
  { icon: AlertTriangle, label: 'Erros', href: '/erros' },
  { icon: FileWarning, label: 'Advertências', href: '/advertencias', roles: ['admin', 'supervisor', 'viewer'] },
  { icon: ClipboardCheck, label: 'Controle DP', href: '/controle-dp', roles: ['admin'] },
  { icon: FileHeart, label: 'Atestados', href: '/atestados', roles: ['admin'], badgeKey: 'atestados_pendentes' },
  { icon: Send, label: 'Solicitar atestado', href: '/atestados-solicitar', roles: ['admin', 'supervisor', 'viewer'] },
  { icon: TrendingUp, label: 'Evolução', href: '/evolucao' },
  { icon: Zap, label: 'Insights', href: '/insights' },
  { icon: MessageSquare, label: 'SMS Prévio', href: '/sms' },
  { icon: Rocket, label: 'Disparos', href: '/disparos', roles: ['admin', 'supervisor'] },
  { icon: Brain, label: 'Inteligência', href: '/inteligencia', roles: ['admin', 'supervisor'] },
  { icon: Headphones, label: 'Operação', href: '/operacao' },
  { icon: PhoneCall, label: 'Chamadas', href: '/chamadas' },
  { icon: Clock, label: 'Hora a hora', href: '/hora', roles: ['admin'] },
  { icon: Presentation, label: 'RR', href: '/rr', roles: ['admin'] },
  { icon: BarChart3, label: 'Discagens', href: '/discagens', roles: ['admin', 'supervisor', 'viewer'] },
  { icon: Shield, label: 'Usuários', href: '/usuarios', roles: ['admin'] },
];

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

function navIsActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === '/atestados' && pathname.startsWith('/atestados-')) return false;
  return pathname.startsWith(`${href}/`);
}

export function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  const inShell = useContext(ShellCtx);
  if (inShell) {
    return (
      <HeaderSync title={title} subtitle={subtitle}>
        {children}
      </HeaderSync>
    );
  }
  return (
    <PageHeaderProvider>
      <HeaderSync title={title} subtitle={subtitle}>
        <AdminChrome>{children}</AdminChrome>
      </HeaderSync>
    </PageHeaderProvider>
  );
}

export function AdminChrome({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { userName, userEmail, userRole } = useAuthStore();
  const { title, subtitle } = usePageMeta();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [atestadosPendentes, setAtestadosPendentes] = useState(0);

  useEffect(() => {
    if (userRole !== 'admin' || !hasDashboardSession()) return;
    const load = () => {
      void fetchAtestadosStats().then((s) => {
        if (s) setAtestadosPendentes(s.pendentes || 0);
      });
    };
    load();
    const t = window.setInterval(load, 120_000);
    return () => window.clearInterval(t);
  }, [userRole]);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const handleLogout = () => {
    logoutDashboardSession();
    navigate('/login');
  };

  const filteredNav = navItems.filter(
    (item) => !item.roles?.length || item.roles.map((r) => r.toLowerCase()).includes((userRole || '').toLowerCase()),
  );

  const renderSidebar = (isMobile: boolean) => {
    const isCollapsed = !isMobile && collapsed;
    return (
      <div className={`sidebar-shell flex h-full flex-col ${isCollapsed ? 'sidebar-shell-collapsed' : ''}`}>
        <div className={`sidebar-brand ${isCollapsed ? 'p-3' : 'px-4 py-5'}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className={`${isCollapsed ? 'h-9 w-9' : 'h-10 w-10'} sidebar-logo`}>
              <img src="/logo-3f-oficial.png" alt="3F Contact Center" className="h-full w-full object-cover" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="text-[13px] font-bold leading-none tracking-tight text-white">3F Contact Center</div>
                <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Correção Cadastral
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className={`sidebar-nav flex-1 space-y-0.5 overflow-y-auto ${isCollapsed ? 'p-2' : 'px-3 py-3'}`}>
          {filteredNav.map((item) => {
            const isActive = navIsActive(location.pathname, item.href);
            const showBadge = item.badgeKey === 'atestados_pendentes' && atestadosPendentes > 0;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                title={isCollapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`sidebar-link ${isCollapsed ? 'sidebar-link-icon' : ''} ${
                  isActive ? 'sidebar-link-active' : ''
                }`}
              >
                <span className="relative flex-shrink-0">
                  <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                  {isCollapsed && showBadge && <span className="sidebar-dot" />}
                </span>
                {!isCollapsed && <span className="truncate">{item.label}</span>}
                {!isCollapsed && showBadge && (
                  <span className="sidebar-badge">
                    {atestadosPendentes > 99 ? '99+' : atestadosPendentes}
                  </span>
                )}
                {!isCollapsed && isActive && !showBadge && (
                  <ChevronRight size={14} className="ml-auto opacity-70" />
                )}
              </Link>
            );
          })}
        </nav>

        {!isMobile && (
          <div className="px-2 py-2">
            <button
              type="button"
              onClick={() => setCollapsed((p) => !p)}
              className="sidebar-link w-full justify-center text-[11px]"
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
              {!collapsed && <span>Recolher</span>}
            </button>
          </div>
        )}

        <div className={`sidebar-user ${isCollapsed ? 'p-2' : 'p-3'}`}>
          {!isCollapsed ? (
            <>
              <div className="mb-2 flex items-center gap-3 px-1">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white shadow-inner">
                  {userName?.charAt(0).toUpperCase() ?? 'A'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-white">{userName}</div>
                  <div className="truncate text-[10px] text-slate-400">{userEmail}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="sidebar-link w-full text-slate-400 hover:bg-red-950/40 hover:text-red-300"
              >
                <LogOut size={16} />
                Sair
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              title="Sair"
              className="sidebar-link sidebar-link-icon w-full hover:bg-red-950/40 hover:text-red-300"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <div
        className={`z-30 hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          collapsed ? 'lg:w-[72px]' : 'lg:w-60'
        }`}
      >
        {renderSidebar(false)}
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <button
            type="button"
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex w-[min(85vw,280px)] flex-col shadow-2xl animate-slide-up sm:animate-none">
            {renderSidebar(true)}
          </div>
        </div>
      )}

      <div
        className={`flex min-h-[100dvh] flex-1 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-60'
        }`}
      >
        <header className="sticky top-0 z-20 border-b border-gray-200/80 bg-white/90 shadow-sm backdrop-blur-md supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 min-h-[56px] items-center justify-between px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:hidden"
                aria-label="Abrir menu"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold leading-tight text-gray-900 sm:text-base">{title}</h1>
                {subtitle && <p className="truncate text-[10px] leading-tight text-gray-400 sm:text-xs">{subtitle}</p>}
              </div>
            </div>
            <div className="hidden shrink-0 text-xs font-medium text-gray-400 sm:flex sm:items-center">
              <BarChart3 size={14} className="mr-1 inline" />
              Bot Processamento
            </div>
          </div>
        </header>

        <main className="flex-1 p-3 pb-safe sm:p-6 lg:p-8">{children}</main>
      </div>
      <div id="toast-root" className="toast-root" aria-live="polite" aria-relevant="additions" />
    </div>
  );
}
