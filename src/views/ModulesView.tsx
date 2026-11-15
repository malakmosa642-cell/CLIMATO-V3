import { ArrowLeft, ArrowRight, CheckCircle2, Satellite } from 'lucide-react';
import { MODULES, SECTORS } from '../data/bilingualContent';
import { Language, ModuleId, PageRoute } from '../types/climate';
import SampleDataBanner from '../components/SampleDataBanner';

interface ModulesViewProps {
  lang: Language;
  selectedModuleId: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  onNavigate: (route: PageRoute, opts?: { moduleId?: ModuleId }) => void;
}

export default function ModulesView({
  lang,
  selectedModuleId,
  onSelectModule,
  onNavigate,
}: ModulesViewProps) {
  const isAr = lang === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;
  const active = MODULES.find((m) => m.id === selectedModuleId) || MODULES[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-3">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
          {isAr ? 'وحدات الذكاء المناخي السبع' : 'Seven Core Climate Intelligence Modules'}
        </h1>
        <p className="text-slate-300 max-w-3xl text-sm sm:text-base">
          {isAr
            ? 'صفحات الحلول التفصيلية لكل وحدة: آلية الاستشعار عن بُعد، مصادر الأقمار الصناعية، القطاعات المستفيدة، والمؤشرات النموذجية.'
            : 'Detailed product specifications for all seven geospatial modules, linking satellite provenance to enterprise decision outcomes.'}
        </p>
        <SampleDataBanner lang={lang} />
      </div>

      {/* Horizontal Module Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2" role="tablist">
        {MODULES.map((mod) => {
          const isActive = mod.id === active.id;
          return (
            <button
              key={mod.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectModule(mod.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#22FF3A] text-[#020503] font-semibold'
                  : 'bg-[#030A05] text-slate-300 border border-emerald-950 hover:border-[#22FF3A]/40 hover:text-white'
              }`}
            >
              {mod.index}. {mod.shortTitle[lang]}
            </button>
          );
        })}
      </div>

      {/* Selected Module Deep Dive */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 glass-panel-elevated rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-mono text-[#22FF3A]">
              {active.index} · {active.satelliteSources.join(' · ')}
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              {active.title[lang]}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {active.description[lang]}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-emerald-950">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[#22FF3A]">
                {isAr ? 'الآلية التقنية ومصادر الرصد' : 'Interface & Sensing Mechanism'}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{active.mechanism[lang]}</p>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-emerald-300">
                {isAr ? 'القيمة المؤسسية القابلة للقياس' : 'Enterprise Outcome'}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{active.outcome[lang]}</p>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-emerald-950">
            <div className="text-xs font-semibold text-slate-300">
              {isAr ? 'المتغيرات والقياسات الرئيسية' : 'Primary Geospatial Variables'}
            </div>
            <p className="text-sm font-mono text-slate-200">{active.primaryVariables[lang]}</p>
          </div>

          <div className="space-y-2 pt-4 border-t border-emerald-950">
            <div className="text-xs font-semibold text-slate-300">
              {isAr ? 'القطاعات المستهدفة لهذه الوحدة' : 'Aligned Business Sectors'}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-300">
              {active.targetSectors.map((secId) => {
                const sec = SECTORS.find((s) => s.id === secId);
                if (!sec) return null;
                return (
                  <span key={secId} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#22FF3A]" />
                    {sec.title[lang]}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-4">
            <button
              type="button"
              onClick={() => onNavigate('dashboard', { moduleId: active.id })}
              className="px-5 py-2.5 rounded-lg bg-[#22FF3A] text-[#020503] text-sm font-semibold hover:bg-[#4DFF60] transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <span>{isAr ? 'فتح البيانات النموذجية في لوحة التحكم' : 'Launch Module Dashboard'}</span>
              <ArrowIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="px-5 py-2.5 rounded-lg border border-emerald-900 text-slate-200 text-sm font-medium hover:border-[#22FF3A]/50 transition-colors cursor-pointer"
            >
              {isAr ? 'توليد تقرير لهذه الوحدة' : 'Generate Module Report'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-2xl overflow-hidden border border-emerald-950 bg-[#030A05] h-64 relative">
            <img
              src={active.imagePath}
              alt={active.title[lang]}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#020403] via-transparent to-transparent" />
            <div className="absolute bottom-4 start-4 end-4 flex items-center justify-between text-xs text-slate-200">
              <span>{active.sampleHighlight.label[lang]}</span>
              <span className="font-mono font-bold text-[#22FF3A] tabular-nums">
                {active.sampleHighlight.value} {active.sampleHighlight.unit}
              </span>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 space-y-4 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#22FF3A]">
              <Satellite className="w-4 h-4" />
              <span>{isAr ? 'مصادر الأقمار الصناعية المرتبطة' : 'Mapped Satellite Constellations'}</span>
            </div>
            <div className="space-y-2.5">
              {active.satelliteSources.map((src) => (
                <div key={src} className="flex items-center justify-between text-sm py-2 border-b border-emerald-950/80 last:border-0">
                  <span className="font-medium text-white">{src}</span>
                  <span className="text-xs font-mono text-amber-300">
                    {isAr ? 'مهيأ للتكامل المرحلي' : 'STAGED_ADAPTER'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
