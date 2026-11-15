import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Compass,
  Droplets,
  Loader2,
  MapPin,
  RefreshCw,
  Sun,
  Wind,
} from 'lucide-react';
import { Language, PageRoute } from '../types/climate';
import {
  CoreStudyRegionId,
  DailyForecastItem,
  fetchScienceOverview,
  fetchWeeklyForecast,
  isAbortError,
} from '../services/climateTelemetryClient';

export type { CoreStudyRegionId };

interface StudyRegionCardSpec {
  id: CoreStudyRegionId;
  code: string;
  nameEn: string;
  nameAr: string;
  subtitleEn: string;
  subtitleAr: string;
  coords: string;
  areaKm2: number;
  stressorsEn: string;
  stressorsAr: string;
}

interface WeeklyForecastStudySectionProps {
  lang: Language;
  activeRegionId?: CoreStudyRegionId;
  onSelectRegion?: (regionId: CoreStudyRegionId) => void;
  onNavigate?: (route: PageRoute) => void;
  selectionMode?: 'region' | 'search';
  focusCoords?: { lat: number; lon: number } | null;
  focusLocationName?: string;
}

const DEFAULT_REGIONS: StudyRegionCardSpec[] = [
  {
    id: 'nile-delta-north',
    code: 'EG-DELTA-N',
    nameEn: 'Northern Nile Delta',
    nameAr: 'شمال دلتا النيل',
    subtitleEn: 'Rosetta · Kafr El-Sheikh · Damietta',
    subtitleAr: 'رشيد · كفر الشيخ · دمياط',
    coords: '31.22° N · 30.88° E',
    areaKm2: 11800,
    stressorsEn: 'Coastal saltwater intrusion, winter rainfall shifts, agro moisture stress',
    stressorsAr: 'تداخل المياه المالحة، تغيرات أمطار الشتاء، إجهاد رطوبة التربة الزراعية',
  },
  {
    id: 'greater-cairo',
    code: 'EG-CAIRO-METRO',
    nameEn: 'Greater Cairo Basin',
    nameAr: 'حوض القاهرة الكبرى',
    subtitleEn: 'Cairo · Giza · Qalyubia',
    subtitleAr: 'القاهرة · الجيزة · القليوبية',
    coords: '30.04° N · 31.24° E',
    areaKm2: 1950,
    stressorsEn: 'Nocturnal urban heat amplification, extreme heat days, urban aerosol load',
    stressorsAr: 'تضخم الحرارة الليلية، أيام الحر الشديد، الأحمال الهوائية الحضرية',
  },
  {
    id: 'upper-egypt-agro',
    code: 'EG-UPPER-AGRO',
    nameEn: 'Upper Egypt Agricultural Region',
    nameAr: 'الممر الزراعي بصعيد مصر',
    subtitleEn: 'Minya–Asyut Nile Valley Corridor',
    subtitleAr: 'ممر وادي النيل (المنيا – أسيوط)',
    coords: '27.72° N · 30.82° E',
    areaKm2: 4200,
    stressorsEn: 'Continental summer heat extremes, high evaporative water demand',
    stressorsAr: 'تطرفات الحر القاري صيفاً، ارتفاع الطلب التبخري لمياه الري',
  },
];

function WeatherIconForCode({ code }: { code: number }) {
  const cls = 'w-6 h-6 text-[#00FF66] drop-shadow-[0_0_8px_rgba(0,255,102,0.55)]';
  if (code === 0) return <Sun className={cls} />;
  if (code === 1 || code === 2) return <CloudSun className={cls} />;
  if (code === 3) return <Cloud className={cls} />;
  if (code === 45 || code === 48) return <CloudFog className={cls} />;
  if (code >= 50 && code < 60) return <CloudDrizzle className={cls} />;
  if (code >= 60 && code < 90) return <CloudRain className={cls} />;
  if (code >= 95) return <CloudLightning className={cls} />;
  return <CloudSun className={cls} />;
}

export default function WeeklyForecastStudySection({
  lang,
  activeRegionId,
  onSelectRegion,
  onNavigate,
  selectionMode = 'region',
  focusCoords = null,
  focusLocationName,
}: WeeklyForecastStudySectionProps) {
  const isAr = lang === 'ar';
  const [internalRegionId, setInternalRegionId] = useState<CoreStudyRegionId>('nile-delta-north');
  const selectedRegionId = activeRegionId ?? internalRegionId;

  const [regions, setRegions] = useState<StudyRegionCardSpec[]>(DEFAULT_REGIONS);
  const [days, setDays] = useState<DailyForecastItem[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string>('Open-Meteo 7-Day Daily Forecast Feed');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState<number>(0);

  // Sync study region specs with backend catalog if available
  useEffect(() => {
    const ac = new AbortController();
    fetchScienceOverview(ac.signal)
      .then((data) => {
        if (Array.isArray(data?.regions) && data.regions.length >= 3) {
          setRegions(
            DEFAULT_REGIONS.map((def) => {
              const matched = data.regions.find((r) => r.id === def.id);
              if (!matched) return def;
              return {
                ...def,
                nameEn: matched.nameEn || def.nameEn,
                nameAr: matched.nameAr || def.nameAr,
                coords: `${Number(matched.centerLat).toFixed(2)}° N · ${Number(matched.centerLon).toFixed(2)}° E`,
                areaKm2: Number(matched.approxAreaKm2 || def.areaKm2),
                stressorsEn: matched.primaryClimateStressorsEn || def.stressorsEn,
                stressorsAr: matched.primaryClimateStressorsAr || def.stressorsAr,
              };
            })
          );
        }
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          // Default study regions remain cleanly populated
        }
      });
    return () => ac.abort();
  }, []);

  const loadForecast = useCallback(
    (signal: AbortSignal) => {
      setLoading(true);
      setError(null);

      const useSearchCoords = selectionMode === 'search' && focusCoords !== null;
      const promise = useSearchCoords
        ? fetchWeeklyForecast({ lat: focusCoords.lat, lon: focusCoords.lon, signal })
        : fetchWeeklyForecast({ regionId: selectedRegionId, signal });

      promise
        .then((data) => {
          setDays(Array.isArray(data.days) ? data.days : []);
          if (data.source) setSourceLabel(String(data.source));
        })
        .catch((err: unknown) => {
          if (isAbortError(err)) return;
          setError(
            err instanceof Error
              ? err.message
              : isAr
                ? 'تعذر تحميل التوقعات الأسبوعية حالياً.'
                : 'Weekly regional forecast temporarily unavailable.'
          );
        })
        .finally(() => {
          if (!signal.aborted) setLoading(false);
        });
    },
    [selectionMode, focusCoords?.lat, focusCoords?.lon, selectedRegionId, isAr]
  );

  // Fetch 7-day forecast whenever the active study region or searched coordinate changes
  useEffect(() => {
    const ac = new AbortController();
    loadForecast(ac.signal);
    return () => ac.abort();
  }, [loadForecast, retryTick]);

  const handleSelect = (id: CoreStudyRegionId) => {
    setInternalRegionId(id);
    onSelectRegion?.(id);
  };

  const formatDayParts = (isoDate: string, idx: number) => {
    const dt = new Date(`${isoDate}T12:00:00Z`);
    const weekday =
      idx === 0
        ? isAr
          ? 'اليوم'
          : 'Today'
        : dt.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { weekday: 'short' });
    const monthDay = dt.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
    return { weekday, monthDay };
  };

  const weekMin = days.length > 0 ? Math.min(...days.map((d) => d.tempMinC)) : 10;
  const weekMax = days.length > 0 ? Math.max(...days.map((d) => d.tempMaxC)) : 30;
  const weekSpan = Math.max(weekMax - weekMin, 1);
  const activeRegion = regions.find((r) => r.id === selectedRegionId) || regions[0];
  const displayTargetName =
    selectionMode === 'search' && focusLocationName
      ? focusLocationName
      : isAr
        ? activeRegion.nameAr
        : activeRegion.nameEn;

  return (
    <section
      id="weekly-forecast"
      className="relative py-20 lg:py-24 bg-[#050805] border-b border-[#00FF66]/18 overflow-hidden"
    >
      {/* Subtle emerald radar perimeter glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-[radial-gradient(ellipse_at_bottom,_rgba(0,255,102,0.08),_transparent_68%)]"
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00FF66]/10 border border-[#00FF66]/35 text-[11px] font-mono text-[#00FF66] tracking-wide">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isAr
                  ? 'التوقعات الأسبوعية · نطاقات الدراسة المصرية الثلاثة'
                  : '7-DAY REGIONAL FORECAST · CORE EGYPT STUDY CORRIDORS'}
              </span>
            </div>

            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white leading-[1.12] text-balance">
              {isAr
                ? 'النشرة الجوية الأسبوعية ومحدد مناطق الدراسة'
                : 'Weekly Atmospheric Forecast & Study Regions Selector'}
            </h2>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {isAr
                ? 'تبديل فوري بين شمال دلتا النيل والقاهرة الكبرى والممر الزراعي بالصعيد لعرض توقعات الطقس لمدة 7 أيام.'
                : 'Switch across Egypt’s three core climate study regions—or search any location above—to inspect live 7-day weather ranges and boundary stressors.'}
            </p>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('detective')}
              className="self-start lg:self-end px-4 py-2.5 rounded-xl border border-[#00FF66]/45 bg-[#00FF66]/10 text-[#00FF66] text-xs font-semibold hover:bg-[#00FF66]/20 transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Compass className="w-4 h-4" />
              <span>{isAr ? 'ضبط الحدود في المحقق العلمي' : 'Configure Bounds in Trend Detective'}</span>
            </button>
          )}
        </div>

        {/* 1. Interactive 3 Study Regions Selector */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          role="tablist"
          aria-label={isAr ? 'مناطق الدراسة الأساسية في مصر' : 'Core Egyptian Study Regions'}
        >
          {regions.map((region) => {
            const isSelected = selectionMode === 'region' && region.id === selectedRegionId;
            return (
              <button
                key={region.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleSelect(region.id)}
                className={`group relative text-start rounded-2xl p-5 border transition-all duration-300 cursor-pointer flex flex-col justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF66] ${
                  isSelected
                    ? 'bg-[#07160B]/88 backdrop-blur-xl border-[#00FF66] shadow-[0_0_32px_rgba(0,255,102,0.22),inset_0_1px_0_rgba(0,255,102,0.2)]'
                    : 'bg-[#071009]/65 backdrop-blur-md border-[#00FF66]/20 hover:border-[#00FF66]/60 hover:bg-[#07130A]/80'
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span
                    className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
                      isSelected
                        ? 'bg-[#00FF66]/18 border-[#00FF66]/60 text-[#00FF66]'
                        : 'bg-[#020403]/75 border-[#00FF66]/20 text-emerald-300/80'
                    }`}
                  >
                    {region.code}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {region.coords}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                    <MapPin
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-[#00FF66]' : 'text-[#10B981]'
                      }`}
                    />
                    <span>{isAr ? region.nameAr : region.nameEn}</span>
                  </h3>
                  <p className="text-xs font-mono text-emerald-300/85 mt-1">
                    {isAr ? region.subtitleAr : region.subtitleEn}
                  </p>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                  {isAr ? region.stressorsAr : region.stressorsEn}
                </p>

                <div className="pt-2.5 border-t border-[#00FF66]/15 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400 tabular-nums">
                    ~{region.areaKm2.toLocaleString()} km²
                  </span>
                  <span className={isSelected ? 'text-[#00FF66] font-semibold' : 'text-slate-400'}>
                    {isSelected
                      ? isAr
                        ? '● نطاق نشط'
                        : '● Active Forecast Lock'
                      : isAr
                        ? 'اختر النطاق'
                        : 'Select Corridor'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 2. Weekly Forecast Bar (Horizontal Scrollable on Mobile/Tablet, 7-Col Grid on Desktop) */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-mono text-[#00FF66]" aria-live="polite">
              <span>{displayTargetName}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-300">{isAr ? 'توقعات 7 أيام' : '7-Day Outlook'}</span>
              {loading && days.length > 0 && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00FF66]" />
              )}
            </div>
            <span className="text-[11px] font-mono text-slate-400">{sourceLabel}</span>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-rose-950/60 border border-rose-400/40 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setRetryTick((t) => t + 1)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-rose-300/40 text-rose-100 hover:bg-rose-900/50 transition-colors cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{isAr ? 'إعادة' : 'Retry'}</span>
              </button>
            </div>
          )}

          {loading && days.length === 0 ? (
            <div className="rounded-3xl bg-[#071009]/70 border border-[#00FF66]/20 p-8 flex items-center justify-center gap-3 text-xs font-mono text-[#00FF66]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {isAr
                  ? 'جاري جلب توقعات الأيام السبعة...'
                  : `Synchronizing 7-day forecast for ${displayTargetName}...`}
              </span>
            </div>
          ) : (
            <div
              className={`flex gap-3.5 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-7 lg:overflow-visible lg:pb-0 transition-opacity duration-300 ${
                loading ? 'opacity-60' : 'opacity-100'
              }`}
            >
              {days.map((day, idx) => {
                const { weekday, monthDay } = formatDayParts(day.date, idx);
                const leftPct = ((day.tempMinC - weekMin) / weekSpan) * 100;
                const widthPct = Math.max(((day.tempMaxC - day.tempMinC) / weekSpan) * 100, 14);
                const isToday = idx === 0;

                return (
                  <article
                    key={day.date}
                    className={`min-w-[168px] sm:min-w-[182px] lg:min-w-0 snap-start relative rounded-2xl p-4 flex flex-col justify-between gap-4 backdrop-blur-xl border transition-all duration-300 ${
                      isToday
                        ? 'bg-[#08170C]/85 border-[#00FF66]/75 shadow-[0_0_26px_rgba(0,255,102,0.18)]'
                        : 'bg-[#071009]/72 border-[#00FF66]/22 hover:border-[#00FF66]/70 hover:shadow-[0_0_24px_rgba(0,255,102,0.14)]'
                    }`}
                  >
                    {isToday && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-px inset-x-4 h-px bg-gradient-to-r from-transparent via-[#00FF66] to-transparent"
                      />
                    )}

                    {/* Day & Date */}
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`font-display text-sm font-bold ${
                          isToday ? 'text-[#00FF66]' : 'text-white'
                        }`}
                      >
                        {weekday}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {monthDay}
                      </span>
                    </div>

                    {/* Neon Weather Icon + Condition */}
                    <div className="flex flex-col items-center text-center gap-2 py-1">
                      <div className="w-12 h-12 rounded-2xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center shadow-[0_0_18px_rgba(0,255,102,0.16)]">
                        <WeatherIconForCode code={day.weatherCode} />
                      </div>
                      <span className="text-xs font-medium text-slate-200 leading-snug line-clamp-2 min-h-[2rem] flex items-center">
                        {isAr ? day.conditionAr : day.conditionEn}
                      </span>
                    </div>

                    {/* Temperature Range + Visual Neon Bar */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                        <span className="text-slate-400">{Math.round(day.tempMinC)}°</span>
                        <span className="text-white font-bold">{Math.round(day.tempMaxC)}°C</span>
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-[#020403] border border-[#00FF66]/20 relative overflow-hidden">
                        <div
                          className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-[#10B981] to-[#00FF66] shadow-[0_0_10px_rgba(0,255,102,0.55)]"
                          style={{
                            left: `${Math.min(Math.max(leftPct, 0), 86)}%`,
                            width: `${Math.min(widthPct, 100 - Math.min(Math.max(leftPct, 0), 86))}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Footer Wind & Rain Prob */}
                    <div className="pt-2.5 border-t border-[#00FF66]/15 flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                      <span className="inline-flex items-center gap-1" title="Max Wind">
                        <Wind className="w-3 h-3 text-[#10B981]" />
                        {Math.round(day.windMaxKmh)}
                      </span>
                      <span className="inline-flex items-center gap-1" title="Precipitation Probability">
                        <Droplets className="w-3 h-3 text-[#00FF66]" />
                        {Math.round(day.precipProbPct)}%
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
