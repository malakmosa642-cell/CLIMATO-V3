import { Check } from 'lucide-react';
import { UI_COPY } from '../data/bilingualContent';
import { Language, PageRoute } from '../types/climate';

interface PricingViewProps {
  lang: Language;
  onNavigate: (route: PageRoute, opts?: { planInterest?: string }) => void;
}

export default function PricingView({ lang, onNavigate }: PricingViewProps) {
  const isAr = lang === 'ar';

  const comparisonRows = [
    {
      label: { en: 'Monitored AOIs', ar: 'مناطق الاهتمام (AOIs)' },
      vals: [
        isAr ? 'حتى 3 مناطق نموذجية' : 'Up to 3 Sample AOIs',
        isAr ? '25 منطقة ومضلع مخصص' : '25 Custom Polygons',
        isAr ? '100+ منطقة وشبكات وطنية' : '100+ AOIs & National Grids',
      ],
    },
    {
      label: { en: 'Active Modules', ar: 'الوحدات النشطة' },
      vals: [
        isAr ? '7 (بيانات تجريبية)' : 'All 7 (Demo Dataset)',
        isAr ? 'حتى 4 وحدات حية/مرحلية' : 'Up to 4 Modules',
        isAr ? 'جميع الوحدات السبع' : 'All 7 Modules',
      ],
    },
    {
      label: { en: 'ESG & Climate Exports', ar: 'تقارير ESG والمناخ' },
      vals: [
        isAr ? 'تصدير CSV / JSON تجريبي' : 'Sample CSV / JSON Export',
        isAr ? 'حزم ISSB S2 و CSRD و TCFD' : 'ISSB S2, CSRD & TCFD Packs',
        isAr ? 'قوالب مخصصة + مراجعة استشارية' : 'Custom Templates + Advisory',
      ],
    },
    {
      label: { en: 'Coordinate Trend Alerts', ar: 'تنبيهات الإحداثيات' },
      vals: [
        isAr ? 'قواعد تجربة داخل الواجهة' : 'Sandbox UI Rules',
        isAr ? 'إشعارات Webhook وبريد إلكتروني' : 'Webhook & Email Dispatch',
        isAr ? 'توجيه متعدد الفرق مع SLA' : 'Multi-Team Routing + SLA',
      ],
    },
    {
      label: { en: 'Developer API Access', ar: 'وصول واجهة API' },
      vals: [
        isAr ? 'نقطة اختبار تجريبية' : 'Sandbox Preview Endpoint',
        isAr ? 'مفاتيح REST محددة الحصة' : 'Metered Production REST Keys',
        isAr ? 'سعة مخصصة + تكامل SSO' : 'Dedicated Throughput + SSO',
      ],
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-12">
      <div className="space-y-3 max-w-3xl">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
          {UI_COPY.pricing.title[lang]}
        </h1>
        <p className="text-sm sm:text-base text-slate-300">{UI_COPY.pricing.subtitle[lang]}</p>
      </div>

      {/* 3 B2B Subscription Tiers (No invented prices) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {UI_COPY.pricing.tiers.map((tier, idx) => (
          <div
            key={tier.id}
            className={`rounded-2xl p-6 flex flex-col justify-between gap-6 ${
              idx === 1 ? 'glass-panel-elevated border-[#22FF3A]/45' : 'glass-panel'
            }`}
          >
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-[#22FF3A]">{tier.audience[lang]}</div>
                <h2 className="font-display text-2xl font-bold text-white mt-1">{tier.name[lang]}</h2>
              </div>

              <div className="py-3 border-y border-emerald-950/80 text-sm font-semibold text-emerald-300">
                {tier.commercialLabel[lang]}
              </div>

              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-200">
                {[tier.aoiLimit[lang], tier.cadence[lang], tier.apiQuota[lang], tier.modules[lang]].map((feat) => (
                  <li key={feat} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#22FF3A] shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() =>
                tier.id === 'sandbox'
                  ? onNavigate('dashboard')
                  : onNavigate('contact', { planInterest: tier.name.en })
              }
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                idx === 1
                  ? 'bg-[#22FF3A] text-[#020503] hover:bg-[#4DFF60]'
                  : 'border border-emerald-900 text-slate-200 hover:border-[#22FF3A]/50 hover:text-white'
              }`}
            >
              {tier.cta[lang]}
            </button>
          </div>
        ))}
      </div>

      {/* Paid Custom Reports & API Metering Add-On Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6 space-y-3">
          <div className="text-xs font-mono text-emerald-300">
            {isAr ? 'مخرجات حسب الطلب' : 'ON-DEMAND DELIVERABLES'}
          </div>
          <h3 className="font-display text-xl font-bold text-white">
            {isAr ? 'التقارير المناخية و ESG المدفوعة المخصصة' : 'Paid Custom Climate & ESG Reports'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {isAr
              ? 'مصممة لعمليات الاستحواذ العقاري، التقييم الائتماني، مشاريع الري، وتدقيق المصدرين وفق معايير ISSB S2 و CSRD. يتم تحديد النطاق والرسوم حسب عدد الإحداثيات والعمق التاريخي.'
              : 'Commission one-off portfolio physical risk dossiers, parcel due-diligence packs, or ISSB S2 / CSRD appendices scoped by AOI count and historical archive depth.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="text-xs font-semibold text-[#22FF3A] hover:text-[#4DFF60] cursor-pointer"
          >
            {isAr ? 'إعداد طلب تقرير مخصص ←' : 'Configure Custom Report →'}
          </button>
        </div>

        <div className="glass-panel rounded-2xl p-6 space-y-3">
          <div className="text-xs font-mono text-[#22FF3A]">
            {isAr ? 'واجهة برمجة التطبيقات' : 'PROGRAMMATIC DATA ACCESS'}
          </div>
          <h3 className="font-display text-xl font-bold text-white">
            {isAr ? 'حزم الوصول البرمجي API وتنبيهات Webhook' : 'Metered REST API & Webhook Integrations'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {isAr
              ? 'اربط أنظمة الاكتتاب البنكي أو التأميني أو منصات المدن الذكية مباشرة ببيانات الإحداثيات الجغرافية مع توثيق مصدر كل قمر صناعي.'
              : 'Connect core banking, insurance underwriting, or municipal command systems directly to standardized coordinate summaries and threshold webhooks.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('api')}
            className="text-xs font-semibold text-[#22FF3A] hover:text-[#4DFF60] cursor-pointer"
          >
            {isAr ? 'معاينة بوابة المطورين ←' : 'Explore API Portal →'}
          </button>
        </div>
      </div>

      {/* Capability Comparison Matrix */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-emerald-950">
          <h3 className="font-display text-lg font-bold text-white">
            {isAr ? 'مقارنة القدرات وحدود التشغيل' : 'Capability & Quota Comparison Matrix'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-[#030A05] text-slate-400 border-b border-emerald-950">
              <tr>
                <th className="py-3 px-4 text-start font-medium">{isAr ? 'القدرة' : 'Capability'}</th>
                {UI_COPY.pricing.tiers.map((t) => (
                  <th key={t.id} className="py-3 px-4 text-start font-semibold text-slate-200">
                    {t.name[lang]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-950/60">
              {comparisonRows.map((row) => (
                <tr key={row.label.en}>
                  <td className="py-3 px-4 font-medium text-white whitespace-nowrap">{row.label[lang]}</td>
                  {row.vals.map((v, i) => (
                    <td key={i} className="py-3 px-4 text-slate-300">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
