import { Language, PageRoute } from '../types/climate';
import { UI_COPY } from '../data/bilingualContent';

interface FooterProps {
  lang: Language;
  onNavigate: (route: PageRoute) => void;
}

export default function Footer({ lang, onNavigate }: FooterProps) {
  const isAr = lang === 'ar';

  return (
    <footer className="border-t border-emerald-950/80 bg-[#020403] text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-3 md:col-span-2">
          <p className="font-display text-lg font-bold tracking-[0.14em] uppercase text-white">{UI_COPY.brand[lang]}</p>
          <p className="text-sm text-slate-400 max-w-md leading-relaxed">
            {isAr
              ? 'منصة ذكاء مناخي جيومكاني تركز على مصر ودلتا النيل لقطاعات العقارات والبنوك والاستثمار والزراعة والتصدير والري والحكومة والتأمين والاستدامة.'
              : 'Geospatial climate intelligence focused on Egypt and the Nile Delta, serving real estate, banking, investment, agriculture, exporting, irrigation, government, insurance, and ESG teams.'}
          </p>
          <p className="text-xs text-slate-500">
            {isAr
              ? 'مصادر الرصد المخطط تكاملها: Sentinel-6 · MODIS · Landsat · SMAP · GPM · TROPOMI · MERRA-2 · ECOSTRESS · GRACE-FO · NASA POWER'
              : 'Staged Satellite Sources: Sentinel-6 · MODIS · Landsat · SMAP · GPM · TROPOMI · MERRA-2 · ECOSTRESS · GRACE-FO · NASA POWER'}
          </p>
        </div>

        <div className="space-y-2.5 text-sm">
          <p className="font-semibold text-slate-200">{isAr ? 'المنتج والحلول' : 'Platform'}</p>
          <ul className="space-y-2">
            <li>
              <button type="button" onClick={() => onNavigate('detective')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.nav.detective[lang]}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('research')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.nav.research[lang]}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('modules')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.nav.modules[lang]}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('sectors')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.nav.sectors[lang]}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.nav.dashboard[lang]}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('reports')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.workspaceNav.reports[lang]}
              </button>
            </li>
          </ul>
        </div>

        <div className="space-y-2.5 text-sm">
          <p className="font-semibold text-slate-200">{isAr ? 'المطورون والأعمال' : 'Enterprise & API'}</p>
          <ul className="space-y-2">
            <li>
              <button type="button" onClick={() => onNavigate('api')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.nav.developers[lang]}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('pricing')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.nav.pricing[lang]}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('alerts')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.workspaceNav.alerts[lang]}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('contact')} className="hover:text-[#22FF3A] transition-colors cursor-pointer">
                {UI_COPY.nav.requestDemo[lang]}
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-emerald-950/60 px-4 sm:px-6 py-5 max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          {isAr
            ? `© ${new Date().getFullYear()} كليماتو (CLIMATO). جميع الحقوق محفوظة.`
            : `© ${new Date().getFullYear()} CLIMATO. All rights reserved.`}
        </span>
        <span>
          {isAr
            ? 'جميع الأرقام والرسوم المعروضة هي عينات تجريبية موضحة بوضوح ومفصولة عن القياسات الفضائية الحية.'
            : 'Visualizations display clearly labeled placeholder demonstration datasets distinct from live satellite streams.'}
        </span>
      </div>
    </footer>
  );
}
