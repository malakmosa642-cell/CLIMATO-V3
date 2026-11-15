import { useEffect, useState } from 'react';
import { BellPlus, KeyRound, Play, ShieldCheck, Trash2 } from 'lucide-react';
import type { AuthOrgSummary, AuthUserSummary } from '../components/AuthModal';
import DashboardShell from '../components/DashboardShell';
import SampleDataBanner from '../components/SampleDataBanner';
import { MODULES } from '../data/bilingualContent';
import { Language, ModuleId, PageRoute, TrendAlert } from '../types/climate';

interface AlertsViewProps {
  lang: Language;
  onNavigate: (route: PageRoute) => void;
  authUser?: AuthUserSummary | null;
  authOrg?: AuthOrgSummary | null;
  onOpenAuth?: () => void;
  onLogout?: () => void;
}

interface EvaluationResult {
  evaluationId: string;
  alertId: string;
  evaluationStatus?: 'EVALUATED' | 'INSUFFICIENT_DATA';
  observedValue: number | null;
  thresholdValue: number;
  operator: string;
  unit: string;
  breached: boolean;
  deliveryStatus: string;
  webhookSignatureHeader: string | null;
  evaluatedAt: string;
  detail?: string;
}

export default function AlertsView({
  lang,
  onNavigate,
  authUser,
  authOrg,
  onOpenAuth,
  onLogout,
}: AlertsViewProps) {
  const isAr = lang === 'ar';
  const [alerts, setAlerts] = useState<TrendAlert[]>([]);
  const [filterModule, setFilterModule] = useState<string>('all');
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [moduleId, setModuleId] = useState<ModuleId>('trend-alerts');
  const [lat, setLat] = useState('31.404');
  const [lon, setLon] = useState('30.416');
  const [radiusKm, setRadiusKm] = useState('18');
  const [metricKey, setMetricKey] = useState('surface_temp_anomaly_c');
  const [operator, setOperator] = useState('>');
  const [thresholdValue, setThresholdValue] = useState('4.0');
  const [unit, setUnit] = useState('°C');
  const [severity, setSeverity] = useState('Elevated');
  const [saving, setSaving] = useState(false);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [evaluationsMap, setEvaluationsMap] = useState<Record<string, EvaluationResult>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);

  const loadAlerts = () => {
    const params = filterModule !== 'all' ? `?moduleId=${filterModule}` : '';
    fetch(`/api/alerts${params}`, { credentials: 'include' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (r.status === 401) {
            setRequiresAuth(true);
            setAlerts([]);
          } else {
            setErrorMsg(d?.error?.message || 'Unable to load alerts.');
          }
          return;
        }
        setRequiresAuth(false);
        setErrorMsg(null);
        setAlerts(d.alerts || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadAlerts();
  }, [filterModule, authUser?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleEn.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          titleEn,
          titleAr: titleAr || titleEn,
          moduleId,
          lat: Number(lat),
          lon: Number(lon),
          radiusKm: Number(radiusKm),
          metricKey,
          operator,
          thresholdValue: Number(thresholdValue),
          unit,
          severity,
          channel: 'Webhook + Email',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error?.message || 'Unable to create alert rule.');
        if (res.status === 401) setRequiresAuth(true);
        return;
      }
      setTitleEn('');
      setTitleAr('');
      loadAlerts();
    } finally {
      setSaving(false);
    }
  };

  const evaluateNow = async (id: string) => {
    setEvaluatingId(id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/alerts/${id}/evaluate`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error?.message || 'Unable to evaluate alert.');
        return;
      }
      if (data.evaluation) {
        setEvaluationsMap((prev) => ({ ...prev, [id]: data.evaluation }));
        loadAlerts();
      }
    } finally {
      setEvaluatingId(null);
    }
  };

  const toggleAlert = async (alert: TrendAlert) => {
    const res = await fetch(`/api/alerts/${alert.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled: alert.enabled !== 1 }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data?.error?.message || 'Unable to update alert status.');
      return;
    }
    loadAlerts();
  };

  const deleteAlert = async (id: string) => {
    const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data?.error?.message || 'Unable to delete alert.');
      return;
    }
    loadAlerts();
  };

  return (
    <DashboardShell
      lang={lang}
      route="alerts"
      onNavigate={onNavigate}
      breadcrumb={isAr ? 'تنبيهات الاتجاهات حسب الإحداثيات' : 'Coordinate-Based Trend Alerts'}
      authUser={authUser}
      authOrg={authOrg}
      onOpenAuth={onOpenAuth}
      onLogout={onLogout}
    >
      <div className="space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          {isAr ? 'محرك تنبيهات الإحداثيات وتوقيع Webhook' : 'Coordinate-Based Trend Alerts & Geofence Evaluator'}
        </h1>
        <p className="text-sm text-slate-300 max-w-3xl">
          {isAr
            ? 'سجّل قواعد مراقبة بإحداثيات خط العرض والطول ونصف القطر وقيّم تجاوز العتبات مع توقيع HMAC-SHA256.'
            : 'Register lat/lon geofence threshold rules persisted in SQLite and trigger real server-side breach evaluations with HMAC-SHA256 signatures.'}
        </p>
      </div>

      <SampleDataBanner lang={lang} />

      {(requiresAuth || errorMsg) && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200 flex flex-wrap items-center justify-between gap-3">
          <span>
            {errorMsg ||
              (isAr
                ? 'يرجى تسجيل الدخول لإدارة وتقييم قواعد التنبيهات الخاصة بمؤسستك.'
                : 'Sign in to view, create, and evaluate tenant-isolated geofence alert rules.')}
          </span>
          {!authUser && onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-3 py-1.5 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{isAr ? 'تسجيل الدخول' : 'Sign In'}</span>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Create Alert Rule Form */}
        <form onSubmit={handleCreate} className="lg:col-span-5 glass-panel-elevated rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <BellPlus className="w-4 h-4 text-[#22FF3A]" />
            <span>{isAr ? 'إنشاء قاعدة تنبيه جديدة' : 'Register Coordinate Alert Rule'}</span>
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-slate-300">
              {isAr ? 'عنوان القاعدة (بالإنجليزية)' : 'Rule Title (English)'}
            </label>
            <input
              type="text"
              required
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="e.g. Delta East Salinity Threshold"
              className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-slate-300">
              {isAr ? 'عنوان القاعدة (بالعربية - اختياري)' : 'Rule Title (Arabic - Optional)'}
            </label>
            <input
              type="text"
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="مثال: عتبة ملوحة شرق الدلتا"
              className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-slate-300">{isAr ? 'الوحدة' : 'Module'}</label>
              <select
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value as ModuleId)}
                className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
              >
                {MODULES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.shortTitle[lang]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-slate-300">{isAr ? 'الأهمية' : 'Severity'}</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
              >
                <option value="Moderate">Moderate</option>
                <option value="Elevated">Elevated</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="block text-[11px] text-slate-300">Lat</label>
              <input
                type="number"
                step="0.001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] text-slate-300">Lon</label>
              <input
                type="number"
                step="0.001"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] text-slate-300">Radius (km)</label>
              <input
                type="number"
                value={radiusKm}
                onChange={(e) => setRadiusKm(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2 space-y-1">
              <label className="block text-[11px] text-slate-300">{isAr ? 'المتغير' : 'Metric Key'}</label>
              <input
                type="text"
                value={metricKey}
                onChange={(e) => setMetricKey(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] text-slate-300">Op</label>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-2 py-2 text-xs font-mono text-white"
              >
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value=">=">&gt;=</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] text-slate-300">{isAr ? 'العتبة' : 'Threshold'}</label>
              <input
                type="number"
                step="0.1"
                value={thresholdValue}
                onChange={(e) => setThresholdValue(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] text-slate-300">{isAr ? 'وحدة القياس' : 'Unit'}</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full bg-[#030A05] border border-emerald-900 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] transition-colors cursor-pointer"
          >
            {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : isAr ? 'إضافة قاعدة التنبيه' : 'Add Alert Rule'}
          </button>
        </form>

        {/* Active Alerts List */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-white">
              {isAr ? 'قواعد التنبيه المسجلة' : 'Configured Geofence Alert Rules'}
            </h2>
            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="bg-[#030A05] border border-emerald-900 rounded-lg px-3 py-1.5 text-xs text-slate-200"
            >
              <option value="all">{isAr ? 'كل الوحدات' : 'All Modules'}</option>
              {MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.shortTitle[lang]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                {isAr ? 'لا توجد قواعد تنبيه لهذه الوحدة.' : 'No alert rules configured for this filter.'}
              </div>
            ) : (
              alerts.map((al) => {
                const evalRes = evaluationsMap[al.id];
                return (
                  <div key={al.id} className="rounded-xl border border-emerald-950 bg-[#030A05] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-mono text-[#22FF3A]">
                          {al.module_id} · {al.lat.toFixed(3)}°, {al.lon.toFixed(3)}° · r={al.radius_km}km
                        </div>
                        <h3 className="text-sm font-semibold text-white mt-0.5">
                          {isAr ? al.title_ar : al.title_en}
                        </h3>
                      </div>
                      <span
                        className={`text-xs font-mono ${
                          al.severity === 'Critical' || al.severity === 'High'
                            ? 'text-rose-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {al.severity}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-emerald-950/80 text-xs">
                      <span className="font-mono text-slate-300 tabular-nums">
                        {al.metric_key} {al.operator} {al.threshold_value} {al.unit} · {al.channel}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => evaluateNow(al.id)}
                          disabled={evaluatingId === al.id}
                          className="px-2.5 py-1 rounded border border-[#22FF3A]/40 text-[#22FF3A] bg-[#22FF3A]/10 hover:bg-[#22FF3A]/20 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>
                            {evaluatingId === al.id
                              ? isAr ? 'جارٍ التقييم...' : 'Evaluating...'
                              : isAr ? 'تقييم الآن' : 'Evaluate Now'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleAlert(al)}
                          className={`px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                            al.enabled === 1
                              ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                              : 'border-slate-700 text-slate-400'
                          }`}
                        >
                          {al.enabled === 1 ? (isAr ? 'مفعّل' : 'Enabled') : isAr ? 'متوقف' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAlert(al.id)}
                          aria-label="Delete alert rule"
                          className="p-1.5 rounded border border-emerald-950 text-slate-400 hover:text-rose-300 hover:border-rose-500/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {evalRes && (
                      <div className="rounded-lg border border-emerald-900/70 bg-[#051209] p-3 text-[11px] font-mono space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`flex items-center gap-1.5 ${
                              evalRes.evaluationStatus === 'INSUFFICIENT_DATA'
                                ? 'text-amber-300'
                                : evalRes.breached
                                ? 'text-rose-300'
                                : 'text-[#22FF3A]'
                            }`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>
                              {evalRes.evaluationStatus === 'INSUFFICIENT_DATA'
                                ? isAr
                                  ? 'بيانات غير كافية (INSUFFICIENT_DATA)'
                                  : 'INSUFFICIENT_DATA'
                                : evalRes.breached
                                ? isAr
                                  ? `تجاوز العتبة (${evalRes.deliveryStatus})`
                                  : `THRESHOLD BREACHED (${evalRes.deliveryStatus})`
                                : isAr
                                ? 'ضمن النطاق الطبيعي'
                                : 'NOMINAL'}
                            </span>
                          </span>
                          <span className="text-slate-300 tabular-nums">
                            Observed:{' '}
                            {evalRes.observedValue !== null
                              ? `${evalRes.observedValue} ${evalRes.unit}`
                              : 'NULL'}{' '}
                            (Threshold: {evalRes.operator} {evalRes.thresholdValue})
                          </span>
                        </div>
                        {evalRes.webhookSignatureHeader && (
                          <div className="text-slate-400 truncate" dir="ltr">
                            X-Climato-Signature: {evalRes.webhookSignatureHeader}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
