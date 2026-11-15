import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Database,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FlaskConical,
  Layers,
  MapPin,
  Play,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import {
  Language,
  PageRoute,
  ProvenanceMode,
  ScienceDatasetId,
  ScientificDataset,
  ScientificPipelineResult,
  StudyRegion,
  StudyRegionId,
  TemporalAggregationMode,
} from '../types/climate';

interface TrendDetectiveViewProps {
  lang: Language;
  onNavigate: (route: PageRoute) => void;
}

const REGION_COLORS: Record<StudyRegionId, string> = {
  'nile-delta-north': '#22FF3A',
  'greater-cairo': '#22D3EE',
  'upper-egypt-agro': '#F59E0B',
};

const DATASET_ACCENTS: Record<ScienceDatasetId, string> = {
  'merra-2': '#F59E0B',
  'gpm-imerg': '#22D3EE',
  gldas: '#22FF3A',
  'grace-fo': '#38BDF8',
};

export default function TrendDetectiveView({ lang, onNavigate }: TrendDetectiveViewProps) {
  const isAr = lang === 'ar';

  const [regions, setRegions] = useState<StudyRegion[]>([]);
  const [datasets, setDatasets] = useState<ScientificDataset[]>([]);
  const [earthdataConfigured, setEarthdataConfigured] = useState(false);

  // Investigation controls
  const [selectedDatasetId, setSelectedDatasetId] = useState<ScienceDatasetId>('merra-2');
  const [focusRegionId, setFocusRegionId] = useState<StudyRegionId>('nile-delta-north');
  const [startDate, setStartDate] = useState<string>('2015-01-01');
  const [endDate, setEndDate] = useState<string>('2024-12-31');
  const [temporalAggregation, setTemporalAggregation] = useState<TemporalAggregationMode>('monthly');
  const [mode, setMode] = useState<ProvenanceMode>('LIVE_NASA_EARTHDATA');

  // Comparison results
  const [loading, setLoading] = useState(false);
  const [regionalResults, setRegionalResults] = useState<ScientificPipelineResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Region coordinate editor
  const [editingRegionId, setEditingRegionId] = useState<StudyRegionId | null>(null);
  const [editDraft, setEditDraft] = useState<{
    centerLat: string;
    centerLon: string;
    minLat: string;
    maxLat: string;
    minLon: string;
    maxLon: string;
    selectionRationaleEn: string;
    selectionRationaleAr: string;
  } | null>(null);
  const [savingRegion, setSavingRegion] = useState(false);

  // CSV/JSON real observation importer
  const [showImportDrawer, setShowImportDrawer] = useState(false);
  const [importRegionId, setImportRegionId] = useState<StudyRegionId>('nile-delta-north');
  const [importSourceLabel, setImportSourceLabel] = useState('NASA_GIOVANNI_AREA_AVG_CSV');
  const [importAlreadyNormalized, setImportAlreadyNormalized] = useState(true);
  const [importRawText, setImportRawText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedOverrideMap, setImportedOverrideMap] = useState<Record<string, ScientificPipelineResult>>({});

  // Grace-FO ~300km footprint overlay on Egypt SVG map
  const [showFootprintOverlay, setShowFootprintOverlay] = useState(true);

  const loadOverview = () => {
    fetch('/api/science/overview')
      .then((r) => r.json())
      .then((data) => {
        setRegions(data.regions || []);
        setDatasets(data.datasets || []);
        setEarthdataConfigured(Boolean(data.connectorStatus?.nasaEarthdataTokenConfigured));
      })
      .catch(() => {});
  };

  const runComparison = async (
    dsId = selectedDatasetId,
    sDate = startDate,
    eDate = endDate,
    tAgg = temporalAggregation,
    runMode = mode
  ) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const qs = new URLSearchParams({
        datasetId: dsId,
        startDate: sDate,
        endDate: eDate,
        temporalAggregation: tAgg,
        mode: runMode,
      });
      const res = await fetch(`/api/science/compare?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Comparison failed');
      setRegionalResults(data.regionalAnalyses || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to execute regional comparison');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    runComparison('merra-2', '2015-01-01', '2024-12-31', 'monthly', 'LIVE_NASA_EARTHDATA');
  }, []);

  const handleSelectDataset = (dsId: ScienceDatasetId) => {
    setSelectedDatasetId(dsId);
    runComparison(dsId, startDate, endDate, temporalAggregation, mode);
  };

  const handleSelectMode = (nextMode: ProvenanceMode) => {
    setMode(nextMode);
    runComparison(selectedDatasetId, startDate, endDate, temporalAggregation, nextMode);
  };

  const startEditRegion = (r: StudyRegion) => {
    setEditingRegionId(r.id);
    setEditDraft({
      centerLat: String(r.centerLat),
      centerLon: String(r.centerLon),
      minLat: String(r.minLat),
      maxLat: String(r.maxLat),
      minLon: String(r.minLon),
      maxLon: String(r.maxLon),
      selectionRationaleEn: r.selectionRationaleEn,
      selectionRationaleAr: r.selectionRationaleAr,
    });
  };

  const saveRegionEdit = async () => {
    if (!editingRegionId || !editDraft) return;
    setSavingRegion(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/science/regions/${editingRegionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          centerLat: Number(editDraft.centerLat),
          centerLon: Number(editDraft.centerLon),
          minLat: Number(editDraft.minLat),
          maxLat: Number(editDraft.maxLat),
          minLon: Number(editDraft.minLon),
          maxLon: Number(editDraft.maxLon),
          selectionRationaleEn: editDraft.selectionRationaleEn,
          selectionRationaleAr: editDraft.selectionRationaleAr,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to update coordinates');
      setEditingRegionId(null);
      setEditDraft(null);
      loadOverview();
      runComparison();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid region coordinates');
    } finally {
      setSavingRegion(false);
    }
  };

  const resetAllRegions = async () => {
    await fetch('/api/science/regions/reset', { method: 'POST' });
    setEditingRegionId(null);
    loadOverview();
    runComparison();
  };

  const handleCsvFileUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportRawText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const submitImportedSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importRawText.trim()) return;
    setImporting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/science/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: selectedDatasetId,
          regionId: importRegionId,
          startDate,
          endDate,
          temporalAggregation,
          rawText: importRawText,
          format: importRawText.trim().startsWith('[') || importRawText.trim().startsWith('{') ? 'json' : 'csv',
          alreadyNormalized: importAlreadyNormalized,
          sourceLabel: importSourceLabel,
        }),
      });
      const data = (await res.json()) as ScientificPipelineResult & { error?: { message: string } };
      if (!res.ok) throw new Error(data?.error?.message || 'CSV import failed');
      setImportedOverrideMap((prev) => ({
        ...prev,
        [`${selectedDatasetId}:${importRegionId}`]: data,
      }));
      setFocusRegionId(importRegionId);
      setShowImportDrawer(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to parse imported file');
    } finally {
      setImporting(false);
    }
  };

  const effectiveResults: ScientificPipelineResult[] = regionalResults.map((res) => {
    const key = `${selectedDatasetId}:${res.region.id}`;
    return importedOverrideMap[key] || res;
  });

  const activeDataset = datasets.find((d) => d.id === selectedDatasetId) || effectiveResults[0]?.dataset;
  const focusResult =
    effectiveResults.find((r) => r.region.id === focusRegionId) || effectiveResults[0] || null;
  const hasAnySeries = effectiveResults.some((r) => r.series.length > 0 && r.trendReport);

  // Coordinate mapper for Egypt SVG Comparison Map (Lon 24.5..35.8, Lat 21.8..32.0)
  const mapProject = (lon: number, lat: number): [number, number] => {
    const x = ((lon - 24.5) / (35.8 - 24.5)) * 340 + 20;
    const y = ((32.0 - lat) / (32.0 - 21.8)) * 310 + 18;
    return [x, y];
  };

  return (
    <DashboardShell
      lang={lang}
      route="detective"
      onNavigate={onNavigate}
      breadcrumb={isAr ? 'محقق اتجاهات نظام الأرض بمصر' : 'Egypt Earth System Trend Detective'}
    >
      <div className="space-y-6">
        {/* MISSION HEADER */}
        <section className="glass-panel-elevated rounded-2xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-2 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#22FF3A]">
                <FlaskConical className="w-4 h-4 text-[#00FF66]" />
                <span>EGYPT EARTH SYSTEM TREND DETECTIVE</span>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-300">MERRA-2 · GPM IMERG · GLDAS · GRACE-FO</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {isAr
                  ? 'التحقيق العلمي المقارن لاتجاهات المناخ والمياه في أقاليم مصر الثلاثة'
                  : 'Comparative Non-Parametric Trend Investigation Across Three Egyptian Regions'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {isAr
                  ? 'تحليل مقارن لدرجة الحرارة والهطول ورطوبة التربة وتخزين المياه الأرضية بين شمال دلتا النيل والقاهرة الكبرى والممر الزراعي بالصعيد باستخدام اختبار مان-كيندال وميل ثيل-سين وضوابط كفاية البيانات.'
                  : 'Investigates air temperature, precipitation, soil moisture, and terrestrial water storage across Northern Nile Delta, Greater Cairo, and Upper Egypt using Mann-Kendall, Theil-Sen 95% confidence bounds, and strict sample-coverage rules.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowImportDrawer((prev) => !prev)}
                className="px-3.5 py-2 rounded-lg border border-[#00FF66]/45 bg-[#00FF66]/10 text-emerald-200 text-xs font-semibold hover:border-[#00FF66] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isAr ? 'استيراد بيانات Giovanni / AppEEARS CSV' : 'Import Giovanni / AppEEARS CSV'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('research')}
                className="px-3.5 py-2 rounded-lg border border-emerald-900 bg-[#040B06] text-slate-200 text-xs font-medium hover:border-[#22FF3A]/50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#22FF3A]" />
                <span>{isAr ? 'مركز الأبحاث (12 مصدراً)' : 'Research Hub (12 Links)'}</span>
              </button>
            </div>
          </div>

          {/* 4 NASA DATASET VARIABLE SELECTORS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {datasets.map((ds) => {
              const active = ds.id === selectedDatasetId;
              const accent = DATASET_ACCENTS[ds.id];
              return (
                <button
                  key={ds.id}
                  type="button"
                  onClick={() => handleSelectDataset(ds.id)}
                  className={`text-start rounded-xl p-4 border transition-colors cursor-pointer flex flex-col justify-between gap-2.5 ${
                    active
                      ? 'bg-[#071A0D] border-[#22FF3A]/65'
                      : 'bg-[#040B06]/90 border-emerald-950 hover:border-emerald-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold" style={{ color: accent }}>
                      {ds.productId}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">{ds.normalizedUnit}</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {isAr ? ds.variableNameAr : ds.variableNameEn}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">{ds.datasetName}</div>
                  </div>
                  <div className="text-[11px] font-mono text-emerald-300/90 pt-1 border-t border-emerald-950/70">
                    {ds.spatialResolution}
                  </div>
                </button>
              );
            })}
          </div>

          {/* PERIOD, TEMPORAL AGGREGATION & PROVENANCE MODE BAR */}
          <div className="flex flex-wrap items-end justify-between gap-4 pt-3 border-t border-emerald-950/80 text-xs">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">{isAr ? 'من تاريخ' : 'Start Date'}</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">{isAr ? 'إلى تاريخ' : 'End Date'}</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">{isAr ? 'التجميع الزمني' : 'Cadence'}</label>
                <select
                  value={temporalAggregation}
                  onChange={(e) => setTemporalAggregation(e.target.value as TemporalAggregationMode)}
                  className="bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="monthly">{isAr ? 'شهري (Monthly)' : 'Monthly'}</option>
                  <option value="seasonal">{isAr ? 'موسمي (DJF/MAM/JJA/SON)' : 'Seasonal (DJF/MAM/JJA/SON)'}</option>
                  <option value="annual">{isAr ? 'سنوي (Annual)' : 'Annual'}</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => runComparison()}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer h-[32px]"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{loading ? (isAr ? 'جارٍ التشغيل...' : 'Running...') : isAr ? 'تحديث التحليل' : 'Run Pipeline'}</span>
              </button>
            </div>

            {/* Honest Acquisition Mode Selector */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#030A05] border border-emerald-950">
              <button
                type="button"
                onClick={() => handleSelectMode('LIVE_NASA_EARTHDATA')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  mode === 'LIVE_NASA_EARTHDATA'
                    ? 'bg-[#00FF66]/20 text-[#00FF66] border border-[#00FF66]/45'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isAr ? 'اتصال NASA Earthdata / CMR الحقيقي' : 'Live NASA CMR & Earthdata'}
              </button>
              <button
                type="button"
                onClick={() => handleSelectMode('METHODOLOGICAL_TEST_FIXTURE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  mode === 'METHODOLOGICAL_TEST_FIXTURE'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isAr ? 'بيانات اختبار منهجية (ليست رصداً حقيقياً)' : 'Methodological Validation Fixture (Non-Real)'}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}
        </section>

        {/* NON-REAL / PENDING CONFIGURATION PROVENANCE BANNER */}
        {mode === 'METHODOLOGICAL_TEST_FIXTURE' ? (
          <div className="rounded-xl border border-amber-500/45 bg-amber-950/25 px-4 py-3 flex items-start gap-3 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
            <div>
              <strong className="font-mono text-amber-300">METHODOLOGICAL_TEST_FIXTURE (NON-OBSERVATIONAL): </strong>
              {isAr
                ? 'أنت تعرض الآن مصفوفة اختبار منهجية مخصصة للتحقق من معادلات مان-كيندال وميل ثيل-سين وفترة الثقة 95% وفجوة GRACE-FO 2017–2018. هذه الأرقام ليست قياسات قمر صناعي حقيقية؛ لرفع قياسات حقيقية استخدم "استيراد Giovanni CSV" أو أضف NASA_EARTHDATA_TOKEN.'
                : 'These series are deterministic methodological validation fixtures exercising Mann-Kendall, Theil-Sen, 95% CIs, Lag-1 ACF, and the GRACE-FO 2017–2018 inter-mission gap. They are NOT real NASA satellite measurements. Use "Import Giovanni / AppEEARS CSV" or configure NASA_EARTHDATA_TOKEN for real observations.'}
            </div>
          </div>
        ) : (
          !earthdataConfigured &&
          effectiveResults.some((r) => r.status === 'PENDING_CONFIGURATION') && (
            <div className="rounded-xl border border-[#00FF66]/35 bg-[#041008]/75 px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-3 text-emerald-100">
                <Clock className="w-4 h-4 shrink-0 mt-0.5 text-[#00FF66]" />
                <div>
                  <strong className="font-mono text-[#00FF66]">PENDING_CONFIGURATION · NASA_EARTHDATA_TOKEN NOT SET: </strong>
                  {isAr
                    ? 'تم فحص فهرس NASA CMR الحي وتأكيد توفر الحزم، ولكن تحميل السلاسل الرقمية من GES DISC / PO.DAAC ينتظر مفتاح NASA_EARTHDATA_TOKEN. لن يتم اختلاق أي قراءات فضائية.'
                    : 'Live NASA CMR discovery verified matching granules over Egypt, while numerical OPeNDAP/Harmony downloads await NASA_EARTHDATA_TOKEN. CLIMATO will never fabricate fake satellite observations. Import real Giovanni CSVs or inspect the Statistical Engine using the Validation Fixture toggle.'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowImportDrawer(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#00FF66]/18 border border-[#00FF66]/50 text-[#00FF66] font-semibold cursor-pointer whitespace-nowrap"
                >
                  {isAr ? 'استيراد Giovanni CSV' : 'Import Real CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMode('METHODOLOGICAL_TEST_FIXTURE')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-200 font-semibold cursor-pointer whitespace-nowrap"
                >
                  {isAr ? 'اختبار معادلات الاتجاه' : 'Run Math Fixture'}
                </button>
              </div>
            </div>
          )
        )}

        {/* GIOVANNI / APPEEARS REAL OBSERVATION CSV IMPORTER */}
        {showImportDrawer && (
          <form onSubmit={submitImportedSeries} className="glass-panel rounded-2xl p-6 border border-[#00FF66]/45 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <FileSpreadsheet className="w-4 h-4 text-[#00FF66]" />
                <span>
                  {isAr
                    ? `استيراد سلسلة زمنية حقيقية (${activeDataset?.productId}) بصيغة CSV أو JSON`
                    : `Import Real NASA Giovanni / AppEEARS Time Series (${activeDataset?.productId})`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowImportDrawer(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 block">{isAr ? 'المنطقة المستهدفة' : 'Target Study Region'}</label>
                <select
                  value={importRegionId}
                  onChange={(e) => setImportRegionId(e.target.value as StudyRegionId)}
                  className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-3 py-2 text-white"
                >
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {isAr ? r.nameAr : r.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-slate-300 block">{isAr ? 'مرجع الملف / المصدر' : 'Source Granule / Export Label'}</label>
                <input
                  type="text"
                  value={importSourceLabel}
                  onChange={(e) => setImportSourceLabel(e.target.value)}
                  className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-3 py-2 font-mono text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-300 block">{isAr ? 'رفع ملف CSV/JSON' : 'Upload .CSV / .JSON File'}</label>
                <input
                  type="file"
                  accept=".csv,.txt,.json"
                  onChange={(e) => handleCsvFileUpload(e.target.files?.[0])}
                  className="w-full text-slate-300 file:me-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[#22FF3A]/20 file:text-[#22FF3A] file:text-xs"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={importAlreadyNormalized}
                onChange={(e) => setImportAlreadyNormalized(e.target.checked)}
                className="accent-[#22FF3A]"
              />
              <span>
                {isAr
                  ? `القيم بالفعل بالوحدة المعيارية (${activeDataset?.normalizedUnit}) وليست بالوحدة الخام (${activeDataset?.nativeUnit})`
                  : `Values are already in ${activeDataset?.normalizedUnit} (uncheck if raw ${activeDataset?.nativeUnit})`}
              </span>
            </label>

            <textarea
              dir="ltr"
              rows={5}
              required
              value={importRawText}
              onChange={(e) => setImportRawText(e.target.value)}
              placeholder={`# NASA Giovanni CSV or YYYY-MM,value\n2015-01-01,14.2\n2015-02-01,15.8\n...`}
              className="w-full bg-[#020503] border border-emerald-950 rounded-xl p-3 text-xs font-mono text-emerald-200"
            />

            <div className="flex justify-end gap-3">
              <button
                type="submit"
                disabled={importing}
                className="px-4 py-2 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] disabled:opacity-60 cursor-pointer"
              >
                {importing ? (isAr ? 'جارٍ التحليل والحفظ...' : 'Processing Pipeline...') : isAr ? 'تشغيل مسار البيانات وحساب الاتجاه' : 'Ingest & Run Trend Analysis'}
              </button>
            </div>
          </form>
        )}

        {/* REGIONAL CONFIGURATOR + EGYPT TREND COMPARISON MAP */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Interactive Egypt Study Regions Map */}
          <div className="lg:col-span-5 glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#22FF3A]" />
                <span>{isAr ? 'خريطة مقارنة أقاليم مصر الثلاثة' : 'Egypt Study Areas & Scale Map'}</span>
              </h2>
              <label className="flex items-center gap-1.5 text-[11px] text-[#00FF66] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFootprintOverlay}
                  onChange={(e) => setShowFootprintOverlay(e.target.checked)}
                  className="accent-[#00FF66]"
                />
                <span>{isAr ? 'إظهار نطاق الدقة الفيزيائية' : 'Sensor Footprint'}</span>
              </label>
            </div>

            <svg
              viewBox="0 0 380 345"
              className="w-full h-72 rounded-xl border border-emerald-950 bg-[#020604]"
              role="img"
              aria-label="Egypt Three Study Regions Map"
            >
              {/* Lat/Lon Grid */}
              {[24, 26, 28, 30, 32].map((lat) => {
                const [, y] = mapProject(25, lat);
                return (
                  <g key={lat}>
                    <line x1={20} y1={y} x2={360} y2={y} stroke="rgba(34,255,58,0.08)" strokeWidth="1" />
                    <text x={6} y={y + 3} className="fill-slate-500 text-[8px] font-mono">
                      {lat}°N
                    </text>
                  </g>
                );
              })}
              {[26, 28, 30, 32, 34].map((lon) => {
                const [x] = mapProject(lon, 22);
                return (
                  <g key={lon}>
                    <line x1={x} y1={18} x2={x} y2={328} stroke="rgba(34,255,58,0.08)" strokeWidth="1" />
                    <text x={x - 7} y={339} className="fill-slate-500 text-[8px] font-mono">
                      {lon}°E
                    </text>
                  </g>
                );
              })}

              {/* Stylized Egypt Territorial Polygon */}
              <polygon
                points={[
                  mapProject(25.1, 31.6),
                  mapProject(29.8, 31.2),
                  mapProject(31.2, 31.55),
                  mapProject(32.5, 31.25),
                  mapProject(34.2, 31.3),
                  mapProject(34.9, 29.5),
                  mapProject(33.8, 27.8),
                  mapProject(35.5, 24.0),
                  mapProject(36.6, 22.0),
                  mapProject(25.0, 22.0),
                ]
                  .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
                  .join(' ')}
                fill="rgba(16,185,129,0.06)"
                stroke="rgba(34,255,58,0.35)"
                strokeWidth="1.2"
              />

              {/* Nile River & Delta Branches */}
              <polyline
                points={[
                  mapProject(31.3, 22.2),
                  mapProject(32.85, 24.08),
                  mapProject(32.64, 25.68),
                  mapProject(31.18, 27.18),
                  mapProject(30.78, 28.9),
                  mapProject(31.22, 30.08),
                ]
                  .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke="#10B981"
                strokeWidth="2.2"
              />
              <polyline
                points={[mapProject(30.4, 31.45), mapProject(31.22, 30.15), mapProject(31.83, 31.48)]
                  .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke="#22FF3A"
                strokeWidth="1.8"
              />

              {/* 3 Configurable Study Region Bounding Boxes */}
              {regions.map((reg) => {
                const [x1, y1] = mapProject(reg.minLon, reg.maxLat);
                const [x2, y2] = mapProject(reg.maxLon, reg.minLat);
                const [cx, cy] = mapProject(reg.centerLon, reg.centerLat);
                const color = REGION_COLORS[reg.id];
                const active = reg.id === focusRegionId;
                const matchedRes = effectiveResults.find((r) => r.region.id === reg.id);
                const slope = matchedRes?.trendReport?.theilSen.slopePerYear;

                // ~300 km GRACE-FO mascon visual radius (~1.35 degrees half-width)
                const footprintDeg = activeDataset ? activeDataset.nativeFootprintKm / 111.32 : 0.5;
                const [fx1, fy1] = mapProject(reg.centerLon - footprintDeg / 2, reg.centerLat + footprintDeg / 2);
                const [fx2, fy2] = mapProject(reg.centerLon + footprintDeg / 2, reg.centerLat - footprintDeg / 2);

                return (
                  <g
                    key={reg.id}
                    onClick={() => setFocusRegionId(reg.id)}
                    className="cursor-pointer"
                  >
                    {showFootprintOverlay && active && activeDataset && (
                      <rect
                        x={fx1}
                        y={fy1}
                        width={Math.max(8, fx2 - fx1)}
                        height={Math.max(8, fy2 - fy1)}
                        fill="rgba(34,211,238,0.06)"
                        stroke="#22D3EE"
                        strokeDasharray="4 3"
                        strokeWidth="1.2"
                      />
                    )}
                    <rect
                      x={x1}
                      y={y1}
                      width={Math.max(10, x2 - x1)}
                      height={Math.max(10, y2 - y1)}
                      fill={active ? `${color}30` : `${color}16`}
                      stroke={color}
                      strokeWidth={active ? 2.2 : 1.2}
                    />
                    <circle cx={cx} cy={cy} r={active ? 4 : 3} fill={color} />
                    <text
                      x={x2 + 6}
                      y={cy + 3}
                      className="fill-white text-[9px] font-mono font-semibold"
                    >
                      {reg.id === 'nile-delta-north' ? 'Delta' : reg.id === 'greater-cairo' ? 'Cairo' : 'Upper EG'}
                      {slope !== null && slope !== undefined
                        ? ` (${slope > 0 ? '+' : ''}${slope.toFixed(3)}/yr)`
                        : ''}
                    </text>
                  </g>
                );
              })}
            </svg>

            {activeDataset && (
              <div className="rounded-xl border border-amber-500/35 bg-amber-950/15 p-3 text-[11px] text-amber-200 leading-relaxed">
                <strong className="font-mono text-amber-300">
                  {activeDataset.productId} ({activeDataset.spatialResolution}):{' '}
                </strong>
                {isAr ? activeDataset.scaleLimitationAr : activeDataset.scaleLimitationEn}
              </div>
            )}
          </div>

          {/* 3 Region Rationale & Live Coordinate Editor Cards */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#00FF66]" />
                <span>
                  {isAr ? 'تحديد وتخصيص مناطق الدراسة الثلاث (قابلة للتعديل)' : 'Configurable Egyptian Study Areas & Selection Justification'}
                </span>
              </h2>
              <button
                type="button"
                onClick={resetAllRegions}
                className="text-xs text-slate-400 hover:text-[#22FF3A] inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isAr ? 'استعادة الافتراضي' : 'Reset Bounds'}</span>
              </button>
            </div>

            {regions.map((reg) => {
              const isFocus = reg.id === focusRegionId;
              const isEditing = editingRegionId === reg.id;
              const color = REGION_COLORS[reg.id];

              return (
                <div
                  key={reg.id}
                  className={`glass-panel rounded-2xl p-4 space-y-3 transition-colors ${
                    isFocus ? 'border-[#22FF3A]/55 bg-[#051209]' : 'border-emerald-950/90'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setFocusRegionId(reg.id)}
                      className="text-start space-y-0.5 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <h3 className="font-display text-sm sm:text-base font-bold text-white">
                          {isAr ? reg.nameAr : reg.nameEn}
                        </h3>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                        Center {reg.centerLat.toFixed(2)}°N, {reg.centerLon.toFixed(2)}°E · BBox [{reg.minLat.toFixed(2)}..
                        {reg.maxLat.toFixed(2)}°N, {reg.minLon.toFixed(2)}..{reg.maxLon.toFixed(2)}°E] · ~
                        {reg.approxAreaKm2.toLocaleString()} km²
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => (isEditing ? setEditingRegionId(null) : startEditRegion(reg))}
                      className="px-2.5 py-1 rounded-lg border border-emerald-900 text-[11px] text-slate-300 hover:border-[#22FF3A]/50 hover:text-[#22FF3A] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>{isEditing ? (isAr ? 'إلغاء' : 'Cancel') : isAr ? 'تعديل الإحداثيات' : 'Edit Bounds'}</span>
                    </button>
                  </div>

                  {!isEditing ? (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {isAr ? reg.selectionRationaleAr : reg.selectionRationaleEn}
                    </p>
                  ) : (
                    editDraft && (
                      <div className="space-y-3 pt-2 border-t border-emerald-950/80 text-xs">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-400">minLat</span>
                            <input
                              type="number"
                              step="0.01"
                              value={editDraft.minLat}
                              onChange={(e) => setEditDraft({ ...editDraft, minLat: e.target.value })}
                              className="w-full bg-[#020503] border border-emerald-900 rounded px-2 py-1 text-white"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-400">maxLat</span>
                            <input
                              type="number"
                              step="0.01"
                              value={editDraft.maxLat}
                              onChange={(e) => setEditDraft({ ...editDraft, maxLat: e.target.value })}
                              className="w-full bg-[#020503] border border-emerald-900 rounded px-2 py-1 text-white"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-400">minLon</span>
                            <input
                              type="number"
                              step="0.01"
                              value={editDraft.minLon}
                              onChange={(e) => setEditDraft({ ...editDraft, minLon: e.target.value })}
                              className="w-full bg-[#020503] border border-emerald-900 rounded px-2 py-1 text-white"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] text-slate-400">maxLon</span>
                            <input
                              type="number"
                              step="0.01"
                              value={editDraft.maxLon}
                              onChange={(e) => setEditDraft({ ...editDraft, maxLon: e.target.value })}
                              className="w-full bg-[#020503] border border-emerald-900 rounded px-2 py-1 text-white"
                            />
                          </label>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={saveRegionEdit}
                            disabled={savingRegion}
                            className="px-3.5 py-1.5 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{savingRegion ? 'Saving...' : isAr ? 'حفظ وإعادة الحساب' : 'Save & Recompute'}</span>
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* REGIONAL COMPARISON TIME-SERIES & TREND RATE CHARTS */}
        {hasAnySeries ? (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Multi-Region Synchronized Time-Series SVG */}
            <div className="lg:col-span-7 glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-mono text-emerald-300">
                    {activeDataset?.productId} · {activeDataset?.normalizedUnit} · {temporalAggregation.toUpperCase()}
                  </div>
                  <h2 className="font-display text-lg font-bold text-white">
                    {isAr
                      ? `مقارنة السلسلة الزمنية عبر الأقاليم الثلاثة (${activeDataset?.variableNameAr})`
                      : `3-Region Time Series Comparison (${activeDataset?.variableNameEn})`}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
                  {effectiveResults.map((r) => (
                    <span key={r.region.id} className="inline-flex items-center gap-1.5 text-slate-300">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: REGION_COLORS[r.region.id] }}
                      />
                      {r.region.id === 'nile-delta-north'
                        ? isAr ? 'شمال الدلتا' : 'N. Delta'
                        : r.region.id === 'greater-cairo'
                        ? isAr ? 'القاهرة الكبرى' : 'Cairo'
                        : isAr ? 'الصعيد' : 'Upper EG'}
                    </span>
                  ))}
                </div>
              </div>

              {(() => {
                const validSeriesList = effectiveResults.filter((r) => r.series.length > 0);
                const allValues = validSeriesList
                  .flatMap((r) => r.series.map((p) => p.normalizedValue))
                  .filter((v): v is number => v !== null && Number.isFinite(v));

                if (allValues.length === 0) return null;
                const minV = Math.min(...allValues);
                const maxV = Math.max(...allValues);
                const span = maxV - minV || 1;
                const w = 640;
                const h = 240;
                const padL = 46;
                const padR = 16;
                const padT = 16;
                const padB = 28;
                const baseSeries = validSeriesList[0].series;
                const nPts = baseSeries.length;

                const xAt = (idx: number) =>
                  padL + (nPts <= 1 ? 0 : (idx / (nPts - 1)) * (w - padL - padR));
                const yAt = (val: number) =>
                  padT + (1 - (val - (minV - span * 0.08)) / (span * 1.16)) * (h - padT - padB);

                return (
                  <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-60 overflow-visible" role="img" aria-label="Regional time series">
                    {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                      const y = padT + t * (h - padT - padB);
                      const labelVal = maxV + span * 0.08 - t * (span * 1.16);
                      return (
                        <g key={t}>
                          <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="rgba(34,255,58,0.1)" strokeWidth="1" />
                          <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[9px] font-mono tabular-nums">
                            {labelVal.toFixed(1)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Highlight missing months (e.g. GRACE-FO 2017-2018 gap) */}
                    {baseSeries.map((pt, idx) =>
                      pt.isMissing ? (
                        <rect
                          key={`gap-${pt.obsDate}`}
                          x={xAt(idx) - 2}
                          y={padT}
                          width={4}
                          height={h - padT - padB}
                          fill="rgba(244,63,94,0.18)"
                        />
                      ) : null
                    )}

                    {/* Polyline segments breaking cleanly over missing values */}
                    {validSeriesList.map((regRes) => {
                      const color = REGION_COLORS[regRes.region.id];
                      const segments: string[] = [];
                      let currentPath = '';
                      regRes.series.forEach((pt, idx) => {
                        if (pt.normalizedValue === null) {
                          if (currentPath) {
                            segments.push(currentPath);
                            currentPath = '';
                          }
                        } else {
                          const x = xAt(idx).toFixed(1);
                          const y = yAt(pt.normalizedValue).toFixed(1);
                          currentPath += currentPath ? ` L ${x} ${y}` : `M ${x} ${y}`;
                        }
                      });
                      if (currentPath) segments.push(currentPath);

                      return (
                        <g key={regRes.region.id}>
                          {segments.map((d, si) => (
                            <path
                              key={si}
                              d={d}
                              fill="none"
                              stroke={color}
                              strokeWidth={regRes.region.id === focusRegionId ? 2.2 : 1.4}
                              strokeOpacity={regRes.region.id === focusRegionId ? 0.98 : 0.72}
                            />
                          ))}
                        </g>
                      );
                    })}

                    {/* X-axis start/mid/end dates */}
                    {[0, Math.floor(nPts / 2), nPts - 1].map((idx) =>
                      baseSeries[idx] ? (
                        <text
                          key={idx}
                          x={xAt(idx)}
                          y={h - 6}
                          textAnchor="middle"
                          className="fill-slate-400 text-[9px] font-mono"
                        >
                          {baseSeries[idx].obsDate.slice(0, 7)}
                        </text>
                      ) : null
                    )}
                  </svg>
                );
              })()}

              <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-950/70">
                <span>
                  {isAr
                    ? 'الخطوط تنقطع تلقائياً عند الأشهر المفقودة دون اختلاق قيم بديلة.'
                    : 'Lines break transparently over missing months (shaded rose) — zero fabricated gap-filling.'}
                </span>
                <span className="font-mono text-[#00FF66]">
                  {focusResult?.provenanceType}
                </span>
              </div>
            </div>

            {/* Annual Change Rate + 95% Confidence Interval Whiskers */}
            <div className="lg:col-span-5 glass-panel rounded-2xl p-6 space-y-4">
              <div>
                <div className="text-[11px] font-mono text-[#22FF3A]">THEIL-SEN SLOPE ± 95% CI</div>
                <h2 className="font-display text-lg font-bold text-white">
                  {isAr ? 'معدل التغير السنوي وحدود عدم اليقين' : 'Annual Change Rate & 95% Confidence Bounds'}
                </h2>
              </div>

              <div className="space-y-4 pt-1">
                {effectiveResults.map((res) => {
                  const rep = res.trendReport;
                  const slope = rep?.theilSen.slopePerYear;
                  const ciL = rep?.theilSen.ci95LowerPerYear;
                  const ciU = rep?.theilSen.ci95UpperPerYear;
                  const color = REGION_COLORS[res.region.id];

                  return (
                    <div
                      key={res.region.id}
                      onClick={() => setFocusRegionId(res.region.id)}
                      className={`rounded-xl p-4 border cursor-pointer transition-colors space-y-2 ${
                        res.region.id === focusRegionId
                          ? 'bg-[#071A0D] border-[#22FF3A]/55'
                          : 'bg-[#040B06] border-emerald-950 hover:border-emerald-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-white flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                          {isAr ? res.region.nameAr : res.region.nameEn}
                        </span>
                        <span
                          className={`font-mono text-[11px] px-2 py-0.5 rounded border ${
                            rep?.status === 'SIGNIFICANT_TREND'
                              ? 'text-[#22FF3A] border-[#22FF3A]/40 bg-[#22FF3A]/10'
                              : rep?.status === 'INSUFFICIENT_DATA'
                              ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                              : 'text-slate-300 border-slate-700 bg-slate-900/50'
                          }`}
                        >
                          {rep?.status || res.status}
                        </span>
                      </div>

                      {rep && rep.status !== 'INSUFFICIENT_DATA' && slope !== null && slope !== undefined ? (
                        <>
                          <div className="flex items-baseline justify-between font-mono tabular-nums">
                            <span className="text-lg font-bold" style={{ color }}>
                              {slope > 0 ? '+' : ''}
                              {slope.toFixed(4)} {rep.theilSen.unitPerYear}
                            </span>
                            <span className="text-xs text-slate-400">
                              p={rep.mannKendall.pValueTwoSided?.toFixed(4)} · ACF ρ₁={rep.diagnostics.lag1Autocorrelation ?? '—'}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                            95% CI: [{ciL !== null && ciL !== undefined ? ciL.toFixed(4) : '—'},{' '}
                            {ciU !== null && ciU !== undefined ? ciU.toFixed(4) : '—'}] {rep.theilSen.unitPerYear}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-rose-200">
                          {rep?.insufficientReason || 'Insufficient valid observations to compute reliable trend.'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          /* LIVE CMR DISCOVERY PANEL WHEN CREDENTIALS ARE PENDING */
          <section className="glass-panel rounded-2xl p-6 space-y-4 border border-[#00FF66]/35">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono text-[#00FF66]">LIVE NASA CMR CATALOG VERIFICATION</div>
                <h2 className="font-display text-xl font-bold text-white">
                  {isAr
                    ? `استكشاف حزم بيانات ${activeDataset?.productId} عبر NASA CMR (متصل الآن)`
                    : `Live NASA CMR Granule Discovery for ${activeDataset?.productId} (Pending Earthdata Token for Pixel Extraction)`}
                </h2>
              </div>
              <span className="font-mono text-xs px-2.5 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">
                PENDING_CONFIGURATION
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {effectiveResults.map((res) => (
                <div key={res.region.id} className="rounded-xl bg-[#040B06] border border-emerald-950 p-4 space-y-2.5 text-xs">
                  <div className="font-semibold text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: REGION_COLORS[res.region.id] }} />
                    {isAr ? res.region.nameAr : res.region.nameEn}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    CMR Concept: <span className="text-emerald-300">{res.cmrDiscovery?.conceptId || activeDataset?.cmrCollectionConceptId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">{isAr ? 'الحزم المتاحة بالنطاق:' : 'Matching Granules in BBox:'}</span>
                    <strong className="font-mono text-[#22FF3A] tabular-nums">
                      {res.cmrDiscovery?.granuleHits ?? '—'}
                    </strong>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 break-all bg-[#020503] p-2 rounded border border-emerald-950/70">
                    {res.opendapRequestTemplate}
                  </div>
                </div>
              ))}
            </div>

            {focusResult?.configurationSteps && focusResult.configurationSteps.length > 0 && (
              <div className="rounded-xl bg-[#030A05] border border-emerald-950 p-4 space-y-1.5 text-xs text-slate-300">
                <div className="font-semibold text-white">
                  {isAr ? 'خطوات تفعيل السحب الآلي من NASA Earthdata أو التصدير من Giovanni:' : 'Steps to Enable Programmatic NASA Earthdata Extraction or Giovanni Import:'}
                </div>
                {focusResult.configurationSteps.map((step, i) => (
                  <div key={i} className="font-mono text-[11px] text-slate-300">
                    {step}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* DETAILED STATISTICAL TABLE + SEASONAL ANALYSIS + 9-STAGE PIPELINE */}
        {focusResult?.trendReport && (
          <section className="space-y-6">
            {/* Full 3-Region Statistical Diagnostics Table */}
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-emerald-950 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-white">
                  {isAr
                    ? 'جدول المقارنة الإحصائية (مان-كيندال، ثيل-سين، والارتباط الذاتي)'
                    : 'Statistical Comparison Matrix (Mann-Kendall, Hamed-Rao ACF & Theil-Sen)'}
                </h2>
                <span className="font-mono text-xs text-slate-400">α = 0.05 (two-sided)</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-[#030A05] text-slate-400 border-b border-emerald-950">
                    <tr>
                      <th className="py-3 px-4 text-start">{isAr ? 'الإقليم' : 'Region'}</th>
                      <th className="py-3 px-3 text-start">n / Cov%</th>
                      <th className="py-3 px-3 text-start">MK S / Z</th>
                      <th className="py-3 px-3 text-start">p-value</th>
                      <th className="py-3 px-3 text-start">ACF ρ₁ / Mod p</th>
                      <th className="py-3 px-3 text-start">Theil-Sen /yr</th>
                      <th className="py-3 px-3 text-start">95% CI</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'النتيجة' : 'Verdict'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-950/60 font-mono tabular-nums">
                    {effectiveResults.map((res) => {
                      const tr = res.trendReport;
                      if (!tr) return null;
                      return (
                        <tr key={res.region.id} className={res.region.id === focusRegionId ? 'bg-[#071A0D]/70' : ''}>
                          <td className="py-3 px-4 font-sans font-semibold text-white whitespace-nowrap">
                            {isAr ? res.region.nameAr : res.region.nameEn}
                          </td>
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                            {tr.diagnostics.validObservations}/{tr.diagnostics.totalExpectedSteps} ({tr.diagnostics.coveragePct}%)
                          </td>
                          <td className="py-3 px-3 text-slate-200 whitespace-nowrap">
                            {tr.mannKendall.sStatistic ?? '—'} / {tr.mannKendall.zScore ?? '—'}
                          </td>
                          <td className="py-3 px-3 text-emerald-300 whitespace-nowrap">
                            {tr.mannKendall.pValueTwoSided !== null ? tr.mannKendall.pValueTwoSided.toFixed(4) : '—'}
                          </td>
                          <td className="py-3 px-3 text-amber-300 whitespace-nowrap">
                            {tr.diagnostics.lag1Autocorrelation ?? '—'} /{' '}
                            {tr.mannKendall.modifiedPValueTwoSided !== null
                              ? tr.mannKendall.modifiedPValueTwoSided.toFixed(4)
                              : '—'}
                          </td>
                          <td className="py-3 px-3 text-[#22FF3A] whitespace-nowrap">
                            {tr.theilSen.slopePerYear !== null
                              ? `${tr.theilSen.slopePerYear > 0 ? '+' : ''}${tr.theilSen.slopePerYear.toFixed(4)}`
                              : '—'}
                          </td>
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                            {tr.theilSen.ci95LowerPerYear !== null
                              ? `[${tr.theilSen.ci95LowerPerYear.toFixed(3)}, ${tr.theilSen.ci95UpperPerYear?.toFixed(3)}]`
                              : '—'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={
                                tr.status === 'SIGNIFICANT_TREND'
                                  ? 'text-[#22FF3A]'
                                  : tr.status === 'INSUFFICIENT_DATA'
                                  ? 'text-rose-300'
                                  : 'text-slate-400'
                              }
                            >
                              {tr.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Focus Region Seasonal Analysis & Pipeline 9-Stage Provenance */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 glass-panel rounded-2xl p-5 space-y-4">
                <h3 className="font-display text-base font-bold text-white">
                  {isAr
                    ? `التحليل الموسمي (${focusResult.region.nameAr})`
                    : `Seasonal Breakdown (${focusResult.region.nameEn})`}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {focusResult.trendReport.seasonalBreakdown.map((sb) => (
                    <div key={sb.season} className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{isAr ? sb.labelAr : sb.labelEn}</span>
                        <span className={`font-mono text-[11px] ${sb.isSignificant05 ? 'text-[#22FF3A]' : 'text-slate-400'}`}>
                          {sb.status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT' : `p=${sb.pValue?.toFixed(3)}`}
                        </span>
                      </div>
                      {sb.theilSenSlopePerYear !== null ? (
                        <div className="font-mono text-[#00FF66] tabular-nums">
                          {sb.theilSenSlopePerYear > 0 ? '+' : ''}
                          {sb.theilSenSlopePerYear.toFixed(4)} {focusResult.dataset.normalizedUnit}/yr ({sb.validYears} yrs)
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">{sb.note}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Methodological Limitations & Uncertainty */}
                <div className="rounded-xl bg-[#030A05] border border-emerald-950 p-4 space-y-2">
                  <div className="text-xs font-semibold text-amber-300">
                    {isAr ? 'القيود المنهجية وعدم اليقين' : 'Methodological Limitations & Uncertainty'}
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-300 list-disc ps-4">
                    {(isAr
                      ? focusResult.trendReport.methodologicalLimitationsAr
                      : focusResult.trendReport.methodologicalLimitationsEn
                    ).map((lim, idx) => (
                      <li key={idx}>{lim}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="lg:col-span-6 glass-panel rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#22FF3A]" />
                    <span>{isAr ? 'مراحل مسار المعالجة العلمية (9 مراحل)' : 'Reproducible 9-Stage Data Pipeline'}</span>
                  </h3>
                  <span className="font-mono text-[11px] text-emerald-300">hash:{focusResult.queryHash}</span>
                </div>

                <div className="space-y-2">
                  {focusResult.stages.map((st) => (
                    <div
                      key={st.stage}
                      className="rounded-lg bg-[#040B06] border border-emerald-950/90 px-3.5 py-2.5 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-white">{st.stage}</div>
                        <div className="text-[11px] text-slate-400 leading-relaxed">{st.summary}</div>
                      </div>
                      <span
                        className={`font-mono text-[10px] shrink-0 px-2 py-0.5 rounded ${
                          st.status === 'COMPLETED'
                            ? 'text-[#22FF3A] bg-[#22FF3A]/10'
                            : st.status === 'WARNING'
                            ? 'text-amber-300 bg-amber-500/10'
                            : 'text-emerald-300 bg-emerald-500/10'
                        }`}
                      >
                        {st.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* DATASET PROVENANCE & OFFICIAL METADATA SPECIFICATION */}
        {activeDataset && (
          <section className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-[#22FF3A]" />
                <span>
                  {isAr
                    ? `البيانات الوصفية الرسمية للمصدر: ${activeDataset.datasetName}`
                    : `Official Dataset Provenance & Metadata: ${activeDataset.datasetName}`}
                </span>
              </h2>
              <a
                href={activeDataset.documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="text-xs font-mono text-[#22FF3A] hover:underline inline-flex items-center gap-1"
              >
                <span>{activeDataset.productId} Docs</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 space-y-1">
                <div className="text-slate-400">{isAr ? 'المنتج والإصدار' : 'Product & Version'}</div>
                <div className="font-mono text-white font-semibold">
                  {activeDataset.productId} v{activeDataset.productVersion} ({activeDataset.targetVariableField})
                </div>
              </div>
              <div className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 space-y-1">
                <div className="text-slate-400">{isAr ? 'الدقة المكانية والزمنية' : 'Spatial & Temporal Resolution'}</div>
                <div className="font-mono text-emerald-300">
                  {activeDataset.spatialResolution} · {activeDataset.temporalResolution}
                </div>
              </div>
              <div className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 space-y-1">
                <div className="text-slate-400">{isAr ? 'التطبيع والوحدات' : 'Units & Normalization'}</div>
                <div className="font-mono text-[#22FF3A]">
                  {activeDataset.nativeUnit} → {activeDataset.normalizedUnit}
                </div>
              </div>
              <div className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 space-y-1">
                <div className="text-slate-400">{isAr ? 'طريقة الوصول' : 'Access Method & Auth'}</div>
                <div className="text-slate-200">{activeDataset.accessMethod}</div>
              </div>
              <div className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 space-y-1">
                <div className="text-slate-400">{isAr ? 'أعلام الجودة والتغطية' : 'Quality Flags & Coverage'}</div>
                <div className="text-slate-200">
                  {activeDataset.qualityFlags} · {activeDataset.coveragePeriod}
                </div>
              </div>
              <div className="rounded-xl bg-[#040B06] border border-emerald-950 p-3.5 space-y-1">
                <div className="text-slate-400">{isAr ? 'الترخيص والجهة' : 'Agency & Licensing'}</div>
                <div className="text-slate-200">
                  {activeDataset.agency} · {activeDataset.licensing}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#22FF3A]" />
              <span>Normalization Rule: {activeDataset.normalizationFormula}</span>
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
