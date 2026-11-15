import { useState } from 'react';
import { Menu, X, Languages } from 'lucide-react';
import { Language, PageRoute } from '../types/climate';
import { UI_COPY } from '../data/bilingualContent';

interface NavbarProps {
  lang: Language;
  onToggleLang: () => void;
  route: PageRoute;
  onNavigate: (route: PageRoute) => void;
}

export default function Navbar({ lang, onToggleLang, route, onNavigate }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{ route: PageRoute; label: string }> = [
    { route: 'detective', label: UI_COPY.nav.detective[lang] },
    { route: 'research', label: UI_COPY.nav.research[lang] },
    { route: 'modules', label: UI_COPY.nav.modules[lang] },
    { route: 'dashboard', label: UI_COPY.nav.dashboard[lang] },
    { route: 'api', label: UI_COPY.nav.developers[lang] },
    { route: 'pricing', label: UI_COPY.nav.pricing[lang] },
  ];

  const handleNav = (target: PageRoute) => {
    onNavigate(target);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#00FF66]/20 bg-[#020403]/92 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav('landing')}
          className="font-display text-lg font-bold tracking-[0.14em] uppercase text-white hover:text-[#22FF3A] transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2.5"
        >
          <svg
            viewBox="0 0 28 28"
            className="w-6 h-6 text-[#22FF3A] shrink-0"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="14" cy="14" r="10.5" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.9" />
            <ellipse cx="14" cy="14" rx="13" ry="4.5" transform="rotate(-24 14 14)" stroke="#10B981" strokeWidth="1.35" />
            <circle cx="14" cy="14" r="3" fill="currentColor" />
          </svg>
          <span>{UI_COPY.brand[lang]}</span>
        </button>

        {/* Zone 2: 5 concise single-line nav links */}
        <nav className="hidden lg:flex items-center gap-6" aria-label="Primary">
          {navItems.map((item) => {
            const active =
              route === item.route ||
              (item.route === 'dashboard' &&
                (route === 'workspaces' || route === 'reports' || route === 'alerts'));
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => handleNav(item.route)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                  active
                    ? 'text-[#22FF3A] border-[#22FF3A]'
                    : 'text-slate-300 hover:text-white border-transparent hover:border-slate-600'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Language Switch + 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleLang}
            aria-label={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
            className="px-2.5 py-1.5 rounded-lg border border-emerald-900/80 text-xs font-medium text-slate-200 hover:border-[#22FF3A]/55 hover:text-[#22FF3A] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5 text-[#22FF3A]" />
            <span>{lang === 'en' ? 'العربية' : 'EN'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleNav('contact')}
            className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {UI_COPY.nav.requestDemo[lang]}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 rounded-lg border border-emerald-950 text-slate-200 hover:text-white"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-emerald-950 bg-[#040A06] px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => handleNav(item.route)}
              className={`w-full text-start px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                route === item.route
                  ? 'bg-[#22FF3A]/15 text-[#22FF3A]'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleNav('contact')}
            className="w-full mt-2 px-4 py-2.5 rounded-lg bg-[#22FF3A] text-[#020503] text-sm font-bold hover:bg-[#4DFF60] transition-colors"
          >
            {UI_COPY.nav.requestDemo[lang]}
          </button>
        </div>
      )}
    </header>
  );
}
