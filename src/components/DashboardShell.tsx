import { ReactNode } from 'react';
import {
  BarChart3,
  BellRing,
  BookOpen,
  Briefcase,
  Code2,
  CreditCard,
  FileSpreadsheet,
  KeyRound,
  LogOut,
  Microscope,
  ShieldCheck,
} from 'lucide-react';
import { Language, PageRoute } from '../types/climate';
import { UI_COPY } from '../data/bilingualContent';
import type { AuthOrgSummary, AuthUserSummary } from './AuthModal';

interface DashboardShellProps {
  lang: Language;
  route: PageRoute;
  onNavigate: (route: PageRoute) => void;
  breadcrumb: string;
  authUser?: AuthUserSummary | null;
  authOrg?: AuthOrgSummary | null;
  onOpenAuth?: () => void;
  onLogout?: () => void;
  children: ReactNode;
}

export default function DashboardShell({
  lang,
  route,
  onNavigate,
  breadcrumb,
  authUser,
  authOrg,
  onOpenAuth,
  onLogout,
  children,
}: DashboardShellProps) {
  const isAr = lang === 'ar';

  const items: Array<{ route: PageRoute; label: string; icon: typeof BarChart3 }> = [
    { route: 'detective', label: UI_COPY.workspaceNav.detective[lang], icon: Microscope },
    { route: 'research', label: UI_COPY.workspaceNav.research[lang], icon: BookOpen },
    { route: 'dashboard', label: UI_COPY.workspaceNav.overview[lang], icon: BarChart3 },
    { route: 'workspaces', label: UI_COPY.workspaceNav.workspaces[lang], icon: Briefcase },
    { route: 'reports', label: UI_COPY.workspaceNav.reports[lang], icon: FileSpreadsheet },
    { route: 'alerts', label: UI_COPY.workspaceNav.alerts[lang], icon: BellRing },
    { route: 'api', label: UI_COPY.workspaceNav.api[lang], icon: Code2 },
    { route: 'pricing', label: UI_COPY.workspaceNav.pricing[lang], icon: CreditCard },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-60 shrink-0 space-y-2" aria-label="Workspace navigation">
        <div className="glass-panel rounded-xl p-3 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400">
            {isAr ? 'مساحة العمل المؤسسية' : 'Enterprise Console'}
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            const active = route === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#22FF3A]/15 text-[#22FF3A] border border-[#22FF3A]/40'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#22FF3A]' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-emerald-950/80">
          <div className="text-xs text-slate-400 font-medium">
            {UI_COPY.brand[lang]} / <span className="text-slate-200">{breadcrumb}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {authUser ? (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-emerald-900/80 bg-[#030A05] text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#22FF3A] shrink-0" />
                <span className="text-slate-200 font-medium truncate max-w-[180px]">
                  {authOrg?.name || authUser.fullName}
                </span>
                <span className="font-mono text-[#22FF3A]">{authUser.role}</span>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    title={isAr ? 'تسجيل الخروج' : 'Sign Out'}
                    className="ms-1 text-slate-400 hover:text-rose-300 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              onOpenAuth && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-3 py-1.5 rounded-lg border border-[#22FF3A]/40 bg-[#22FF3A]/10 text-xs font-semibold text-[#22FF3A] hover:bg-[#22FF3A]/20 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تسجيل الدخول / إنشاء مؤسسة' : 'Sign In / Register'}</span>
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="px-3 py-1.5 rounded-lg border border-emerald-900/70 text-xs font-medium text-slate-200 hover:border-[#22FF3A]/55 whitespace-nowrap cursor-pointer"
            >
              {isAr ? 'تصدير تقرير' : 'Export ESG Pack'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="px-3 py-1.5 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] whitespace-nowrap cursor-pointer"
            >
              {isAr ? 'ترقية للاشتراك الحي' : 'Request Live Pipeline'}
            </button>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
