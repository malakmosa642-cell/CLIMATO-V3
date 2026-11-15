import { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Globe2,
  Microscope,
  RefreshCw,
  Satellite,
  ShieldAlert,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { Language, PageRoute, ResearchSourceItem } from '../types/climate';

interface ResearchHubViewProps {
  lang: Language;
  onNavigate: (route: PageRoute) => void;
}

interface CmrProbeItem {
  datasetId: string;
  cmrShortName: string;
  conceptId: string;
  liveReachable: boolean;
  httpStatus: number | null;
  matchedCollectionTitle?: string;
  temporalExtent?: string;
  granuleHits?: number;
  sampleGranuleIds: string[];
  checkedAt: string;
}

const CLASSIFICATIONS = [
  'ALL',
  'Operational data source',
  'Data discovery or processing tool',
  'Research or methodology reference',
  'Supporting satellite mission or documentation',
] as const;

export default function ResearchHubView({ lang, onNavigate }: ResearchHubViewProps) {
  const isAr = lang === 'ar';
  const [sources, setSources] = useState<ResearchSourceItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<(typeof CLASSIFICATIONS)[number]>('ALL');
  const [earthdataConfigured, setEarthdataConfigured] = useState(false);
  const [noaaConfigured, setNoaaConfigured] = useState(false);
  const [probing, setProbing] = useState(false);
  const [cmrProbes, setCmrProbes] = useState<CmrProbeItem[]>([]);
  const [lastProbeTime, setLastProbeTime] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadOverview = () => {
    fetch('/api/science/overview')
      .then((r) => r.json())
      .then((data) => {
        setSources(data.researchSources || []);
        setEarthdataConfigured(Boolean(data.connectorStatus?.nasaEarthdataTokenConfigured));
        setNoaaConfigured(Boolean(data.connectorStatus?.noaaCdoTokenConfigured));
      })
      .catch(() => setErrorMsg(isAr ? 'تعذر تحميل سجل المصادر.' : 'Unable to load research hub registry.'));
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const runLiveProbe = async () => {
    setProbing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/science/probe-sources', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Probe failed');
      setCmrProbes(data.cmrProbes || []);
      setLastProbeTime(data.probedAt || new Date().toISOString());
      loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to probe external sources');
    } finally {
      setProbing(false);
    }
  };

  const filteredSources =
    activeFilter === 'ALL' ? sources : sources.filter((s) => s.classification === activeFilter);

  const getStatusMeta = (status: string) => {
    switch (status) {
      case 'LIVE_REACHABLE':
        return {
          label: isAr ? 'متصل ومختبر' : 'Connected & Verified',
          cls: 'text-[#22FF3A] border-[#22FF3A]/40 bg-[#22FF3A]/10',
          icon: CheckCircle2,
        };
      case 'PENDING_CONFIGURATION':
        return {
          label: isAr ? 'بانتظار إعداد المفاتيح' : 'Pending Configuration',
          cls: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
          icon: Clock,
        };
      case 'DISCOVERY_PORTAL':
        return {
          label: isAr ? 'بوابة استكشاف ومعالجة' : 'Discovery & Processing Portal',
          cls: 'text-[#00FF66] border-[#00FF66]/40 bg-[#00FF66]/10',
          icon: Globe2,
        };
      case 'METHODOLOGY_REFERENCE':
        return {
          label: isAr ? 'مرجع منهجي وإحصائي' : 'Methodology Reference',
          cls: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          icon: BookOpen,
        };
      case 'SUPPORTING_MISSION':
        return {
          label: isAr ? 'مهمة فضائية داعمة' : 'Supporting Mission Doc',
          cls: 'text-emerald-200 border-emerald-400/40 bg-emerald-500/10',
          icon: Satellite,
        };
      default:
        return {
          label: status,
          cls: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
          icon: ShieldAlert,
        };
    }
  };

  const translateClassification = (c: (typeof CLASSIFICATIONS)[number]) => {
    if (!isAr) return c === 'ALL' ? 'All 12 Sources' : c;
    switch (c) {
      case 'ALL':
        return 'جميع المصادر (12)';
      case 'Operational data source':
        return 'مصدر بيانات تشغيلي';
      case 'Data discovery or processing tool':
        return 'أداة استكشاف ومعالجة';
      case 'Research or methodology reference':
        return 'مرجع بحثي ومنهجي';
      case 'Supporting satellite mission or documentation':
        return 'مهمة فضائية أو توثيق داعم';
    }
  };

  return (
    <DashboardShell
      lang={lang}
      route="research"
      onNavigate={onNavigate}
      breadcrumb={isAr ? 'مركز البيانات والأبحاث العلمية' : 'Data Sources & Research Hub'}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="glass-panel-elevated rounded-2xl p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="text-xs font-mono text-[#00FF66]">
                {isAr
                  ? '12 مصدراً علمياً موثقاً · تصنيف الحالة الحقيقية دون ادعاءات اتصال وهمية'
                  : '12 Verified Research & Earth Observation Links · Honest Connectivity Auditing'}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {isAr
                  ? 'مركز مصادر البيانات والأبحاث — محقق اتجاهات نظام الأرض بمصر'
                  : 'Data Sources & Research Hub — Egypt Earth System Trend Detective'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {isAr
                  ? 'يحفظ هذا المركز كل الروابط العلمية والوكالات الفضائية المعتمدة في الدراسة مع توضيح التصنيف ودورها في التحليل، ولا يضع علامة "متصل" على أي مصدر تشغيلي قبل نجاح الفحص والاعتماد الفعلي.'
                  : 'Preserves every scientific data portal, methodology reference, and supporting satellite mission with its exact URL, classification, and live server-side verification state.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={runLiveProbe}
                disabled={probing}
                className="px-4 py-2.5 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] disabled:opacity-60 transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
                <span>
                  {probing
                    ? isAr
                      ? 'جارٍ الفحص الحي...'
                      : 'Probing Endpoints...'
                    : isAr
                    ? 'فحص اتصال المصادر و NASA CMR'
                    : 'Run Live HTTP & NASA CMR Probe'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('detective')}
                className="px-4 py-2.5 rounded-lg border border-[#00FF66]/40 bg-[#00FF66]/10 text-emerald-200 text-xs font-semibold hover:border-[#00FF66] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Microscope className="w-3.5 h-3.5" />
                <span>{isAr ? 'فتح محقق الاتجاهات' : 'Open Trend Detective'}</span>
              </button>
            </div>
          </div>

          {/* Credential Readiness Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-emerald-950/80 text-xs">
            <div className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 flex items-center justify-between gap-2">
              <span className="text-slate-400">NASA_EARTHDATA_TOKEN</span>
              <span className={`font-mono font-semibold ${earthdataConfigured ? 'text-[#22FF3A]' : 'text-amber-300'}`}>
                {earthdataConfigured ? 'CONFIGURED' : 'PENDING_CONFIGURATION'}
              </span>
            </div>
            <div className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 flex items-center justify-between gap-2">
              <span className="text-slate-400">NOAA_CDO_TOKEN</span>
              <span className={`font-mono font-semibold ${noaaConfigured ? 'text-[#22FF3A]' : 'text-amber-300'}`}>
                {noaaConfigured ? 'CONFIGURED' : 'PENDING_CONFIGURATION'}
              </span>
            </div>
            <div className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 flex items-center justify-between gap-2">
              <span className="text-slate-400">{isAr ? 'آخر فحص حي' : 'Last Live Probe'}</span>
              <span className="font-mono text-[#00FF66] tabular-nums">
                {lastProbeTime ? lastProbeTime.slice(0, 19).replace('T', ' ') : isAr ? 'لم يُنفذ بعد' : 'Not yet run'}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Live NASA CMR Probe Results if executed */}
        {cmrProbes.length > 0 && (
          <div className="glass-panel rounded-2xl p-5 space-y-3 border border-[#00FF66]/30">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-white">
                {isAr
                  ? 'نتائج الفحص الحي لفهرس NASA CMR (الأربع مجموعات العلمية فوق شمال الدلتا)'
                  : 'Live NASA CMR Catalog & Granule Discovery Results (Northern Nile Delta BBox)'}
              </h2>
              <span className="text-[11px] font-mono text-[#22FF3A]">PUBLIC_CMR_REST_200</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {cmrProbes.map((cp) => (
                <div key={cp.datasetId} className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#00FF66]">{cp.cmrShortName}</span>
                    <span className={`font-mono text-[11px] ${cp.liveReachable ? 'text-[#22FF3A]' : 'text-rose-300'}`}>
                      HTTP {cp.httpStatus ?? 'ERR'}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400 truncate">{cp.conceptId}</div>
                  <div className="text-slate-200">
                    {isAr ? 'الحزم المتاحة (2015–2025):' : 'Granule Hits (2015–2025):'}{' '}
                    <strong className="font-mono text-[#22FF3A] tabular-nums">{cp.granuleHits ?? '—'}</strong>
                  </div>
                  {cp.temporalExtent && (
                    <div className="text-[11px] font-mono text-slate-400">{cp.temporalExtent}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Classification Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 me-1">
            <Filter className="w-3.5 h-3.5 text-[#22FF3A]" />
            <span>{isAr ? 'تصنيف المصدر:' : 'Classification:'}</span>
          </div>
          {CLASSIFICATIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeFilter === c
                  ? 'bg-[#22FF3A] text-[#020503] font-bold'
                  : 'bg-[#040B06] border border-emerald-950 text-slate-300 hover:border-[#22FF3A]/40 hover:text-white'
              }`}
            >
              {translateClassification(c)}
            </button>
          ))}
        </div>

        {/* All 12 Preserved Research Links */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredSources.map((src) => {
            const meta = getStatusMeta(src.integrationStatus);
            const StatusIcon = meta.icon;
            return (
              <article
                key={src.id}
                className="glass-panel rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-[#22FF3A]/40 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="text-[11px] font-mono text-emerald-300">
                        {translateClassification(src.classification)}
                      </span>
                      <h3 className="font-display text-lg font-bold text-white">
                        {isAr ? src.titleAr : src.titleEn}
                      </h3>
                      <p className="text-xs text-emerald-300/90 font-medium">{src.organization}</p>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono shrink-0 ${meta.cls}`}>
                      <StatusIcon className="w-3 h-3" />
                      <span>{meta.label}</span>
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {isAr ? src.descriptionAr : src.descriptionEn}
                  </p>

                  <div className="rounded-xl bg-[#040B06] border border-emerald-950/90 p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-[#22FF3A]">
                      {isAr ? 'الصلة بمشروع محقق اتجاهات مصر:' : 'Relevance to Egypt Trend Detective:'}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {isAr ? src.relevanceAr : src.relevanceEn}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-emerald-950/80 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="font-mono text-[#22FF3A] hover:text-[#4DFF60] inline-flex items-center gap-1.5 break-all underline underline-offset-4"
                    >
                      <span>{src.url}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  </div>

                  {(src.lastProbeStatus !== null || src.probeNote) && (
                    <div className="text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
                      <span>{src.probeNote}</span>
                      {src.lastProbeStatus !== null && (
                        <span className="text-[#00FF66]">HTTP {src.lastProbeStatus}</span>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
