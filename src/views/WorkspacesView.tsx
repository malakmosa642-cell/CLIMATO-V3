import { useState } from 'react';
import { ArrowLeft, ArrowRight, MapPin, Plus } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import SampleDataBanner from '../components/SampleDataBanner';
import { MODULES } from '../data/bilingualContent';
import { AoiLocation, Language, ModuleId, PageRoute, WorkspaceRecord } from '../types/climate';

interface WorkspacesViewProps {
  lang: Language;
  workspaces: WorkspaceRecord[];
  aois: AoiLocation[];
  onNavigate: (route: PageRoute, opts?: { moduleId?: ModuleId; aoiId?: string }) => void;
  onRefresh?: () => void;
}

export default function WorkspacesView({
  lang,
  workspaces,
  aois,
  onNavigate,
  onRefresh,
}: WorkspacesViewProps) {
  const isAr = lang === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const [wsId, setWsId] = useState(workspaces[0]?.id || 'ws-delta-agro');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [lat, setLat] = useState('31.42');
  const [lon, setLon] = useState('31.81');
  const [primaryModule, setPrimaryModule] = useState<ModuleId>('delta-risk');
  const [saving, setSaving] = useState(false);

  const handleCreateAoi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameEn.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/aois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: wsId || 'ws-delta-agro',
          nameEn: nameEn.trim(),
          nameAr: nameAr.trim() || nameEn.trim(),
          lat: Number(lat),
          lon: Number(lon),
          radiusKm: 20,
          regionCode: 'EG-CUSTOM',
          primaryModule,
        }),
      });
      if (res.ok) {
        setNameEn('');
        setNameAr('');
        onRefresh?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell
      lang={lang}
      route="workspaces"
      onNavigate={onNavigate}
      breadcrumb={isAr ? 'مساحات عمل العملاء والقطاعات' : 'Customer Workspaces'}
    >
      <div className="space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          {isAr ? 'مساحات العمل القطاعية ونطاقات الاهتمام (AOIs)' : 'Sector Customer Workspaces & AOI Registry'}
        </h1>
        <p className="text-sm text-slate-300 max-w-3xl">
          {isAr
            ? 'نماذج توضيحية لمساحات العمل متعددة الأدوار، مع إمكانية تسجيل منطقة اهتمام جغرافية جديدة داخل قاعدة البيانات.'
            : 'Multi-tenant workspace configurations showing sector roles, active intelligence modules, and custom Egyptian AOI coordinate registration.'}
        </p>
      </div>

      <SampleDataBanner lang={lang} />

      {/* Register Custom Egyptian AOI Form */}
      <form onSubmit={handleCreateAoi} className="glass-panel-elevated rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#22FF3A]">
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'تسجيل منطقة اهتمام جغرافية جديدة (AOI)' : 'Register New AOI Coordinate Polygon'}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <select
            value={wsId}
            onChange={(e) => setWsId(e.target.value)}
            className="bg-[#030A05] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {isAr ? ws.name_ar : ws.name_en}
              </option>
            ))}
          </select>

          <input
            type="text"
            required
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder={isAr ? 'الاسم بالإنجليزية (مثال: Damietta Port)' : 'AOI Name (e.g. Damietta Port)'}
            className="bg-[#030A05] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
          />

          <input
            type="text"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder={isAr ? 'الاسم بالعربية (اختياري)' : 'Arabic Name (Optional)'}
            className="bg-[#030A05] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.001"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              aria-label="AOI Latitude"
              className="bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs font-mono text-[#22FF3A]"
            />
            <input
              type="number"
              step="0.001"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              aria-label="AOI Longitude"
              className="bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs font-mono text-[#22FF3A]"
            />
          </div>

          <select
            value={primaryModule}
            onChange={(e) => setPrimaryModule(e.target.value as ModuleId)}
            className="bg-[#030A05] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white"
          >
            {MODULES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.shortTitle[lang]}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] cursor-pointer"
          >
            {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : isAr ? 'تسجيل النطاق' : 'Register AOI'}
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {workspaces.map((ws) => {
          const wsAois = aois.filter((a) => a.workspace_id === ws.id);
          const moduleIds = ws.active_modules.split(',') as ModuleId[];
          return (
            <div key={ws.id} className="glass-panel rounded-2xl p-6 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="font-mono text-[#22FF3A]">{ws.plan_tier}</span>
                  <span>{ws.sector}</span>
                </div>

                <h2 className="font-display text-xl font-bold text-white">
                  {isAr ? ws.name_ar : ws.name_en}
                </h2>

                <div className="text-xs text-slate-300">
                  {isAr ? 'الدور الرئيسي: ' : 'Primary Role: '}
                  <span className="text-white font-medium">{isAr ? ws.owner_role_ar : ws.owner_role_en}</span>
                  {' · '}
                  <span className="font-mono text-slate-400">
                    {wsAois.length} / {ws.aoi_limit} {isAr ? 'مناطق' : 'AOIs'}
                  </span>
                </div>

                <div className="pt-3 border-t border-emerald-950/80 space-y-2">
                  <div className="text-xs font-medium text-slate-400">
                    {isAr ? 'الوحدات المفعلة' : 'Active Modules'}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-emerald-300">
                    {moduleIds.map((mId) => {
                      const mod = MODULES.find((m) => m.id === mId);
                      return mod ? <span key={mId}>{mod.shortTitle[lang]}</span> : null;
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-emerald-950/80 space-y-2">
                  <div className="text-xs font-medium text-slate-400">
                    {isAr ? 'مناطق الاهتمام المسجلة (AOIs)' : 'Registered AOI Coordinates'}
                  </div>
                  <div className="space-y-1.5">
                    {wsAois.map((aoi) => (
                      <button
                        key={aoi.id}
                        type="button"
                        onClick={() => onNavigate('dashboard', { aoiId: aoi.id, moduleId: aoi.primary_module })}
                        className="w-full flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded-lg bg-[#030A05] border border-emerald-950 hover:border-[#22FF3A]/50 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 text-slate-200 truncate">
                          <MapPin className="w-3.5 h-3.5 text-[#22FF3A] shrink-0" />
                          <span className="truncate">{isAr ? aoi.name_ar : aoi.name_en}</span>
                        </span>
                        <span className="font-mono text-slate-400 tabular-nums shrink-0">
                          {aoi.lat.toFixed(2)}°, {aoi.lon.toFixed(2)}°
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onNavigate('dashboard', {
                    aoiId: wsAois[0]?.id,
                    moduleId: (moduleIds[0] as ModuleId) || 'delta-risk',
                  })
                }
                className="w-full py-2.5 px-4 rounded-lg border border-[#22FF3A]/40 text-[#22FF3A] text-xs font-semibold hover:bg-[#22FF3A]/10 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{isAr ? 'فتح مساحة العمل في التحليلات' : 'Open Workspace Analytics'}</span>
                <ArrowIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </DashboardShell>
  );
}
