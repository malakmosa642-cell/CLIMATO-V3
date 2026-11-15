import { useEffect, useState } from 'react';
import { Globe2, Map, Search } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import EarthGlobe3D from '../components/EarthGlobe3D';
import SampleDataBanner from '../components/SampleDataBanner';
import type { AuthOrgSummary, AuthUserSummary } from '../components/AuthModal';
import { ModuleExposureRadar, TimeSeriesChart } from '../components/TelemetryCharts';
import { MODULES } from '../data/bilingualContent';
import {
  AoiLocation,
  Language,
  ModuleId,
  PageRoute,
  SampleObservation,
  WorkspaceRecord,
} from '../types/climate';

interface DashboardViewProps {
  lang: Language;
  workspaces: WorkspaceRecord[];
  aois: AoiLocation[];
  selectedModuleId: ModuleId | 'all';
  selectedAoiId: string;
  onSelectModule: (id: ModuleId | 'all') => void;
  onSelectAoi: (id: string) => void;
  onNavigate: (route: PageRoute) => void;
  authUser?: AuthUserSummary | null;
  authOrg?: AuthOrgSummary | null;
  onOpenAuth?: () => void;
  onLogout?: () => void;
}

export default function DashboardView({
  lang,
  workspaces,
  aois,
  selectedModuleId,
  selectedAoiId,
  onSelectModule,
  onSelectAoi,
  onNavigate,
  authUser,
  authOrg,
  onOpenAuth,
  onLogout,
}: DashboardViewProps) {
  const isAr = lang === 'ar';
  const [observations, setObservations] = useState<SampleObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'globe' | 'map2d'>('globe');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (selectedModuleId !== 'all') params.set('moduleId', selectedModuleId);
    if (selectedAoiId !== 'all') params.set('aoiId', selectedAoiId);

    fetch(`/api/observations?${params.toString()}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load sample observations');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setObservations(data.observations || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Error loading observations');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedModuleId, selectedAoiId]);

  const filteredObservations = observations.filter((o) => {
    if (selectedWorkspaceId !== 'all' && o.workspace_id !== selectedWorkspaceId) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.aoi_name_en.toLowerCase().includes(q) ||
      o.aoi_name_ar.toLowerCase().includes(q) ||
      o.source_name.toLowerCase().includes(q) ||
      o.metric_key.toLowerCase().includes(q)
    );
  });

  const activeAoi = aois.find((a) => a.id === selectedAoiId) || aois[0];
  const latestObs = filteredObservations[filteredObservations.length - 1];
  const chartModule = selectedModuleId === 'all' ? activeAoi?.primary_module || 'delta-risk' : selectedModuleId;
  const chartObservations = filteredObservations.filter(
    (o) => o.module_id === chartModule && (selectedAoiId === 'all' ? o.aoi_id === activeAoi?.id : true)
  );
  const displayChartObs = chartObservations.length > 0 ? chartObservations : filteredObservations.slice(0, 4);

  return (
    <DashboardShell
      lang={lang}
      route="dashboard"
      onNavigate={onNavigate}
      breadcrumb={isAr ? 'لوحة التحليلات الجيومكانية (بيانات نموذجية)' : 'Geospatial Analytics Console (Sample Mode)'}
      authUser={authUser}
      authOrg={authOrg}
      onOpenAuth={onOpenAuth}
      onLogout={onLogout}
    >
      <SampleDataBanner lang={lang} />

      {/* Filter Controls Bar */}
      <div className="glass-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label={isAr ? 'مساحة عمل العميل' : 'Customer Workspace'}
            value={selectedWorkspaceId}
            onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            className="bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#22FF3A]"
          >
            <option value="all">{isAr ? 'جميع مساحات العمل' : 'All Customer Workspaces'}</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {isAr ? ws.name_ar : ws.name_en}
              </option>
            ))}
          </select>

          <select
            aria-label={isAr ? 'الوحدة المناخية' : 'Climate Module'}
            value={selectedModuleId}
            onChange={(e) => onSelectModule(e.target.value as ModuleId | 'all')}
            className="bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#22FF3A]"
          >
            <option value="all">{isAr ? 'جميع الوحدات السبع' : 'All 7 Modules'}</option>
            {MODULES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.index}. {m.title[lang]}
              </option>
            ))}
          </select>

          <select
            aria-label={isAr ? 'نقطة الاهتمام الجغرافية' : 'Area of Interest'}
            value={selectedAoiId}
            onChange={(e) => onSelectAoi(e.target.value)}
            className="bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#22FF3A]"
          >
            <option value="all">{isAr ? 'جميع المواقع النموذجية' : 'All Sample AOIs'}</option>
            {aois.map((a) => (
              <option key={a.id} value={a.id}>
                {isAr ? a.name_ar : a.name_en}
              </option>
            ))}
          </select>
        </div>

        {/* 3D Globe vs 2D Coordinate Grid View Toggle */}
        <div className="flex items-center gap-1 p-1 bg-[#020604] border border-emerald-950 rounded-lg">
          <button
            type="button"
            onClick={() => setViewMode('globe')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'globe' ? 'bg-[#22FF3A]/15 text-[#22FF3A] border border-[#22FF3A]/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>{isAr ? 'مجسم 3D' : '3D Globe'}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('map2d')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'map2d' ? 'bg-[#22FF3A]/15 text-[#22FF3A] border border-[#22FF3A]/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>{isAr ? 'شبكة الإحداثيات' : '2D Coordinate Grid'}</span>
          </button>
        </div>
      </div>

      {/* Top KPI Summary Strip (Explicitly Labeled Sample) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-400">{isAr ? 'الموقع المحدد' : 'Focused Sample AOI'}</div>
          <div className="text-sm font-semibold text-white truncate">
            {activeAoi ? (isAr ? activeAoi.name_ar : activeAoi.name_en) : '—'}
          </div>
          <div className="text-xs font-mono text-[#22FF3A] tabular-nums">
            {activeAoi ? `${activeAoi.lat.toFixed(3)}°N, ${activeAoi.lon.toFixed(3)}°E` : '—'}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-400">{isAr ? 'أحدث قراءة نموذجية' : 'Latest Sample Reading'}</div>
          <div className="text-2xl font-mono font-bold text-white tabular-nums">
            {latestObs ? latestObs.metric_value : '—'}{' '}
            <span className="text-xs text-slate-400 font-normal">{latestObs?.unit}</span>
          </div>
          <div className="text-xs text-amber-300 font-mono">SAMPLE_DEMONSTRATION</div>
        </div>

        <div className="glass-panel rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-400">{isAr ? 'الانحراف عن خط الأساس' : 'Baseline Delta (Sample)'}</div>
          <div
            className={`text-2xl font-mono font-bold tabular-nums ${
              (latestObs?.anomaly_delta ?? 0) > 0 ? 'text-amber-300' : 'text-emerald-300'
            }`}
          >
            {latestObs
              ? `${latestObs.anomaly_delta > 0 ? '+' : ''}${latestObs.anomaly_delta} ${latestObs.unit}`
              : '—'}
          </div>
          <div className="text-xs text-slate-400">{latestObs?.period_label || '2026-Q4'}</div>
        </div>

        <div className="glass-panel rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-400">{isAr ? 'المصدر الفضائي المرجعي' : 'Staged Sensor Source'}</div>
          <div className="text-sm font-semibold text-emerald-300 truncate">
            {latestObs?.source_name || 'Sentinel-6 / MODIS'}
          </div>
          <div className="text-xs text-slate-400">
            {isAr ? 'موصل جاهز للربط المرحلي' : 'Adapter staged · Non-live'}
          </div>
        </div>
      </div>

      {/* Main Spatial Viewport */}
      {viewMode === 'globe' ? (
        <EarthGlobe3D
          lang={lang}
          aois={aois}
          selectedAoiId={selectedAoiId === 'all' ? undefined : selectedAoiId}
          onSelectAoi={(aoi) => onSelectAoi(aoi.id)}
          heightClass="h-[380px] sm:h-[440px]"
          compactDock
        />
      ) : (
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {isAr ? 'مصفوفة الإحداثيات الإقليمية (نطاق الشرق الأوسط وشمال أفريقيا)' : 'Regional Coordinate Projection Matrix (MENA & Mediterranean Basin)'}
              </h3>
              <p className="text-xs text-slate-400">
                {isAr ? 'انقر على أي موقع لتحديث السلاسل الزمنية أدناه' : 'Click any AOI marker to filter the time-series observations below'}
              </p>
            </div>
            <span className="text-xs font-mono text-amber-300">SAMPLE AOI OVERLAY</span>
          </div>

          <div className="relative w-full h-72 rounded-xl border border-[#22FF3A]/20 bg-[#020604] overflow-hidden">
            {/* Clean SVG graticule map */}
            <svg viewBox="0 0 800 320" className="w-full h-full">
              {[80, 160, 240, 320, 400, 480, 560, 640, 720].map((x) => (
                <line key={x} x1={x} y1={0} x2={x} y2={320} stroke="rgba(34,255,58,0.08)" strokeWidth="1" />
              ))}
              {[64, 128, 192, 256].map((y) => (
                <line key={y} x1={0} y1={y} x2={800} y2={y} stroke="rgba(34,255,58,0.08)" strokeWidth="1" />
              ))}
              {/* Nile corridor schematic curve */}
              <path
                d="M 285 280 Q 290 190 278 125 L 260 95 M 278 125 L 298 95"
                fill="none"
                stroke="rgba(34,255,58,0.65)"
                strokeWidth="2.5"
              />
              {/* Mediterranean & Red Sea schematic coastlines */}
              <path
                d="M 60 88 Q 220 96 360 85 T 540 105"
                fill="none"
                stroke="rgba(16,185,129,0.4)"
                strokeWidth="1.5"
              />
              <path
                d="M 335 120 L 420 265"
                fill="none"
                stroke="rgba(16,185,129,0.4)"
                strokeWidth="1.5"
              />

              {aois.map((aoi) => {
                // Map lon [20..55] -> x [100..700], lat [18..36] -> y [280..40]
                const px = Math.min(Math.max(((aoi.lon - 20) / 35) * 600 + 100, 60), 740);
                const py = Math.min(Math.max(((36 - aoi.lat) / 18) * 240 + 40, 35), 285);
                const active = aoi.id === selectedAoiId;
                return (
                  <g
                    key={aoi.id}
                    className="cursor-pointer"
                    onClick={() => onSelectAoi(aoi.id)}
                  >
                    <circle
                      cx={px}
                      cy={py}
                      r={active ? 18 : 12}
                      fill={active ? 'rgba(34,255,58,0.22)' : 'rgba(16,185,129,0.14)'}
                      stroke={active ? '#22FF3A' : '#10B981'}
                      strokeWidth="1.5"
                    />
                    <circle cx={px} cy={py} r={4} fill={active ? '#22FF3A' : '#34D399'} />
                    <text
                      x={px}
                      y={py - 18}
                      textAnchor="middle"
                      className="fill-slate-200 text-[10px] font-medium"
                    >
                      {isAr ? aoi.name_ar : aoi.name_en}
                    </text>
                    <text
                      x={px}
                      y={py + 25}
                      textAnchor="middle"
                      className="fill-[#22FF3A] text-[9px] font-mono"
                    >
                      {aoi.lat.toFixed(2)}°, {aoi.lon.toFixed(2)}°
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <TimeSeriesChart
            lang={lang}
            observations={displayChartObs}
            title={
              isAr
                ? 'السلسلة الزمنية الفصلية للقياسات النموذجية'
                : 'Quarterly Sample Observation Trend'
            }
          />
        </div>
        <div className="lg:col-span-4">
          <ModuleExposureRadar
            lang={lang}
            selectedModuleId={selectedModuleId === 'all' ? 'delta-risk' : selectedModuleId}
          />
        </div>
      </div>

      {/* High-Density Sample Observations Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="p-4 border-b border-emerald-950/80 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              {isAr ? 'سجل القراءات النموذجية حسب الإحداثيات' : 'Sample Geospatial Observation Ledger'}
            </h3>
            <p className="text-xs text-slate-400">
              {isAr ? 'جميع الصفوف موسومة بوضوح كبيانات عرض نموذجية' : 'Every row explicitly tagged SAMPLE_DEMONSTRATION'}
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث بالموقع أو القمر الصناعي...' : 'Filter AOI, sensor, or metric...'}
              className="bg-[#030A05] border border-emerald-950 rounded-lg ps-8 pe-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#22FF3A] w-60"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-9 rounded bg-emerald-950/40" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-rose-300">{error}</div>
        ) : filteredObservations.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {isAr ? 'لا توجد سجلات مطابقة لعوامل التصفية الحالية.' : 'No sample observations match the active filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-[#030A05] text-slate-400 border-b border-emerald-950/80">
                <tr>
                  <th className="py-3 px-4 text-start font-medium">{isAr ? 'الموقع' : 'AOI'}</th>
                  <th className="py-3 px-4 text-start font-medium">{isAr ? 'المصدر' : 'Source'}</th>
                  <th className="py-3 px-4 text-start font-medium">{isAr ? 'الفترة' : 'Period'}</th>
                  <th className="py-3 px-4 text-start font-medium">{isAr ? 'المتغير' : 'Metric'}</th>
                  <th className="py-3 px-4 text-end font-medium">{isAr ? 'القيمة' : 'Value'}</th>
                  <th className="py-3 px-4 text-end font-medium">{isAr ? 'الانحراف' : 'Delta'}</th>
                  <th className="py-3 px-4 text-start font-medium">{isAr ? 'المصدرية' : 'Provenance'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-950/60">
                {filteredObservations.map((row) => (
                  <tr key={row.id} className="hover:bg-[#22FF3A]/[0.03] transition-colors">
                    <td className="py-2.5 px-4 text-slate-200 font-medium whitespace-nowrap">
                      {isAr ? row.aoi_name_ar : row.aoi_name_en}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">{row.source_name}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">{row.period_label}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">{row.metric_key}</td>
                    <td className="py-2.5 px-4 font-mono text-end text-[#22FF3A] tabular-nums whitespace-nowrap">
                      {row.metric_value} {row.unit}
                    </td>
                    <td
                      className={`py-2.5 px-4 font-mono text-end tabular-nums whitespace-nowrap ${
                        row.anomaly_delta >= 0 ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      {row.anomaly_delta > 0 ? `+${row.anomaly_delta}` : row.anomaly_delta} {row.unit}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-amber-300 whitespace-nowrap">
                      {row.data_provenance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
