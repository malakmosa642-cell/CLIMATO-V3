import { ArrowLeft, ArrowRight, Building2 } from 'lucide-react';
import { MODULES, SECTORS } from '../data/bilingualContent';
import { Language, ModuleId, PageRoute, SectorId } from '../types/climate';

interface SectorsViewProps {
  lang: Language;
  selectedSectorId: SectorId;
  onSelectSector: (id: SectorId) => void;
  onNavigate: (route: PageRoute, opts?: { moduleId?: ModuleId }) => void;
}

export default function SectorsView({
  lang,
  selectedSectorId,
  onSelectSector,
  onNavigate,
}: SectorsViewProps) {
  const isAr = lang === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;
  const activeSector = SECTORS.find((s) => s.id === selectedSectorId) || SECTORS[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-2 max-w-3xl">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
          {isAr ? 'حلول القطاعات الاثني عشر' : 'Solutions Across 12 Enterprise & Sovereign Sectors'}
        </h1>
        <p className="text-slate-300 text-sm sm:text-base">
          {isAr
            ? 'واجهات عمل ومؤشرات مخصصة لقطاعات العقارات، البنوك، الاستثمار، الزراعة، التصدير، الري، الحكومة، البلديات، التأمين، الرعاية الصحية، السياحة، وتقارير الاستدامة.'
            : 'Sector-specific intelligence views spanning real estate, banking, investment, agriculture, exporting, irrigation, government, municipalities, insurance, healthcare, tourism, and ESG reporting.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sector Selector Grid */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
          {SECTORS.map((sec) => {
            const isSelected = sec.id === activeSector.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => onSelectSector(sec.id)}
                className={`text-start px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#07180B] border-[#22FF3A]/50 text-white'
                    : 'bg-[#030A05]/80 border-emerald-950/90 text-slate-300 hover:border-emerald-800 hover:text-white'
                }`}
              >
                <div className="text-sm font-semibold">{sec.title[lang]}</div>
                <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{sec.deliverable[lang]}</div>
              </button>
            );
          })}
        </div>

        {/* Active Sector Customer View */}
        <div className="lg:col-span-7 glass-panel-elevated rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-[#22FF3A] font-medium">
                <Building2 className="w-4 h-4" />
                <span>{isAr ? 'ملف القطاع المخصص' : 'Sector Workspace Blueprint'}</span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {activeSector.title[lang]}
              </h2>
            </div>
          </div>

          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
            {activeSector.summary[lang]}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-emerald-950">
            <div className="rounded-xl bg-[#030A05] border border-emerald-950 p-4 space-y-1.5">
              <div className="text-xs font-semibold text-[#22FF3A]">
                {isAr ? 'مسار اتخاذ القرار' : 'Operational Workflow'}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {activeSector.decisionWorkflow[lang]}
              </p>
            </div>
            <div className="rounded-xl bg-[#030A05] border border-emerald-950 p-4 space-y-1.5">
              <div className="text-xs font-semibold text-emerald-300">
                {isAr ? 'الامتثال والمعايير' : 'Compliance & Standards'}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {activeSector.complianceFocus[lang]}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-emerald-950">
            <div className="text-xs font-semibold text-slate-300">
              {isAr ? 'الوحدات المفعلة لهذا القطاع' : 'Recommended Platform Modules'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeSector.keyModules.map((modId) => {
                const mod = MODULES.find((m) => m.id === modId);
                if (!mod) return null;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => onNavigate('dashboard', { moduleId: mod.id })}
                    className="text-start rounded-xl border border-emerald-950 bg-[#030A05] p-3.5 hover:border-[#22FF3A]/50 transition-colors cursor-pointer"
                  >
                    <div className="text-xs font-mono text-[#22FF3A]">{mod.index}</div>
                    <div className="text-sm font-semibold text-white mt-0.5">{mod.title[lang]}</div>
                    <div className="text-xs text-slate-400 mt-1">{mod.tagline[lang]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-emerald-950">
            <div>
              <div className="text-xs text-slate-400">{isAr ? 'المخرج الأساسي' : 'Primary Deliverable'}</div>
              <div className="text-sm font-semibold text-emerald-300">{activeSector.deliverable[lang]}</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="px-4 py-2.5 rounded-lg border border-emerald-900 text-slate-200 text-xs font-semibold hover:border-[#22FF3A]/50 cursor-pointer"
              >
                {isAr ? 'إنشاء تقرير القطاع' : 'Build Sector Report'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="px-4 py-2.5 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-semibold hover:bg-[#4DFF60] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>{isAr ? 'طلب عرض للقطاع' : 'Request Sector Demo'}</span>
                <ArrowIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
