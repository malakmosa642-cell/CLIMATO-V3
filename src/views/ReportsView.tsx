import { useEffect, useState } from 'react';
import { Download, FileText, CheckCircle2 } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import SampleDataBanner from '../components/SampleDataBanner';
import { MODULES, SECTORS } from '../data/bilingualContent';
import { Language, ModuleId, PageRoute, ReportRecord } from '../types/climate';

interface ReportsViewProps {
  lang: Language;
  onNavigate: (route: PageRoute) => void;
}

export default function ReportsView({ lang, onNavigate }: ReportsViewProps) {
  const isAr = lang === 'ar';
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [orgName, setOrgName] = useState('Mediterranean Coastal Portfolio (Sample)');
  const [sector, setSector] = useState(SECTORS[1].title.en);
  const [standard, setStandard] = useState('ISSB IFRS S2');
  const [reportType, setReportType] = useState<'Standard Sandbox Export' | 'Custom Paid Report Request'>('Standard Sandbox Export');
  const [selectedModules, setSelectedModules] = useState<ModuleId[]>(['delta-risk', 'esg-reporting']);
  const [lat, setLat] = useState('31.200');
  const [lon, setLon] = useState('29.918');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadReports = () => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((d) => setReports(d.reports || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadReports();
  }, []);

  const toggleModule = (id: ModuleId) => {
    setSelectedModules((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]
    );
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: orgName,
          sector,
          standard,
          moduleIds: selectedModules,
          lat: Number(lat),
          lon: Number(lon),
          reportType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate report');
      setFeedback(
        isAr
          ? `تم تسجيل التقرير (${data.report.id}) بنجاح.`
          : `Report (${data.report.id}) generated in sandbox ledger.`
      );
      loadReports();
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell
      lang={lang}
      route="reports"
      onNavigate={onNavigate}
      breadcrumb={isAr ? 'مولد تقارير المناخ و ESG' : 'Climate & ESG Report Flows'}
    >
      <div className="space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          {isAr ? 'تقارير المخاطر المناخية والإفصاح المستدام (ESG)' : 'Downloadable Climate & ESG Disclosure Reports'}
        </h1>
        <p className="text-sm text-slate-300 max-w-3xl">
          {isAr
            ? 'أنشئ حزم إفصاح متوافقة مع ISSB S2 و CSRD و TCFD من بيانات العينة النموذجية أو اطلب تقريراً مدفوعاً مخصصاً.'
            : 'Export structured ISSB S2, CSRD, and TCFD physical-risk packs from the sandbox dataset, or commission a bespoke paid report.'}
        </p>
      </div>

      <SampleDataBanner lang={lang} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Report Generator Form */}
        <form onSubmit={handleGenerate} className="lg:col-span-6 glass-panel-elevated rounded-2xl p-6 space-y-5">
          <h2 className="font-display text-lg font-bold text-white">
            {isAr ? 'إعداد التقرير أو طلب تقرير مخصص' : 'Configure Report Deliverable'}
          </h2>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              {isAr ? 'اسم المؤسسة / المحفظة' : 'Organization / Portfolio Name'}
            </label>
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#22FF3A]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {isAr ? 'القطاع' : 'Target Sector'}
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
              >
                {SECTORS.map((s) => (
                  <option key={s.id} value={s.title.en}>
                    {s.title[lang]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {isAr ? 'معيار الإفصاح' : 'Disclosure Standard'}
              </label>
              <select
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
              >
                <option value="ISSB IFRS S2">ISSB IFRS S2 (Climate Disclosures)</option>
                <option value="CSRD ESRS E1/E4">EU CSRD (ESRS E1 / E4)</option>
                <option value="TCFD Physical Risk">TCFD Physical & Transition Risk</option>
                <option value="Municipal Resilience Brief">Municipal & Sovereign Resilience Brief</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {isAr ? 'خط العرض (Latitude)' : 'Center Latitude'}
              </label>
              <input
                type="number"
                step="0.001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#22FF3A]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {isAr ? 'خط الطول (Longitude)' : 'Center Longitude'}
              </label>
              <input
                type="number"
                step="0.001"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#22FF3A]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">
              {isAr ? 'الوحدات المشمولة في التقرير' : 'Included Intelligence Modules'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MODULES.map((mod) => {
                const checked = selectedModules.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleModule(mod.id)}
                    className={`text-start px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                      checked
                        ? 'bg-[#22FF3A]/15 border-[#22FF3A]/50 text-[#22FF3A]'
                        : 'bg-[#030A05] border-emerald-950 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mod.index}. {mod.shortTitle[lang]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">
              {isAr ? 'نوع الطلب' : 'Deliverable Mode'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['Standard Sandbox Export', 'Custom Paid Report Request'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setReportType(mode)}
                  className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    reportType === mode
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                      : 'bg-[#030A05] border-emerald-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode === 'Standard Sandbox Export'
                    ? isAr ? 'تصدير فوري (نموذج تجريبي)' : 'Standard Sandbox Export'
                    : isAr ? 'طلب تقرير مدفوع مخصص' : 'Custom Paid Report Request'}
                </button>
              ))}
            </div>
          </div>

          {feedback && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#22FF3A] shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-[#22FF3A] text-[#020503] text-sm font-semibold hover:bg-[#4DFF60] disabled:opacity-60 transition-colors cursor-pointer"
          >
            {submitting
              ? isAr ? 'جارٍ الإنشاء...' : 'Processing...'
              : reportType === 'Custom Paid Report Request'
              ? isAr ? 'إرسال طلب التقرير المخصص' : 'Submit Custom Report Request'
              : isAr ? 'إنشاء تقرير جاهز للتنزيل' : 'Generate Downloadable Sample Report'}
          </button>
        </form>

        {/* Generated Reports Queue & Download Actions */}
        <div className="lg:col-span-6 space-y-4">
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">
                {isAr ? 'سجل التقارير والتنزيـل' : 'Report Ledger & File Exports'}
              </h2>
              <span className="text-xs font-mono text-amber-300">SAMPLE_DEMONSTRATION</span>
            </div>

            <div className="space-y-3">
              {reports.map((rep) => (
                <div
                  key={rep.id}
                  className="rounded-xl border border-emerald-950 bg-[#030A05] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono text-[#22FF3A]">
                        <FileText className="w-3.5 h-3.5" />
                        <span>{rep.id}</span>
                        <span>·</span>
                        <span>{rep.standard}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white mt-1">{rep.organization_name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {rep.sector} · {rep.lat.toFixed(3)}°, {rep.lon.toFixed(3)}°
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-300 whitespace-nowrap">
                      {rep.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-950/80">
                    <span className="text-[11px] text-slate-400">{rep.report_type}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/reports/${rep.id}/export?format=csv`}
                        download
                        className="px-3 py-1.5 rounded-md border border-emerald-900 text-xs text-slate-200 hover:border-[#22FF3A]/50 inline-flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5 text-[#22FF3A]" />
                        <span>CSV</span>
                      </a>
                      <a
                        href={`/api/reports/${rep.id}/export?format=json`}
                        download
                        className="px-3 py-1.5 rounded-md border border-emerald-900 text-xs text-slate-200 hover:border-emerald-400/50 inline-flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>JSON</span>
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
