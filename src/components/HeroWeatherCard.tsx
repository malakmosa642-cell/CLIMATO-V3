import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Droplets,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Thermometer,
  Wind,
} from 'lucide-react';
import { Language } from '../types/climate';
import {
  fetchLocationTelemetry,
  isAbortError,
  LocationTelemetrySnapshot,
} from '../services/climateTelemetryClient';

export type HeroWeatherData = LocationTelemetrySnapshot;

interface HeroWeatherCardProps {
  lang: Language;
  telemetry?: LocationTelemetrySnapshot | null;
  loading?: boolean;
  error?: string | null;
  onSearchQuery?: (query: string) => void;
  onRetry?: () => void;
  onFocusLocation?: (coords: { lat: number; lon: number }) => void;
}

const QUICK_LOCATIONS = [
  { query: 'Cairo', labelEn: 'Cairo', labelAr: 'القاهرة' },
  { query: 'Alexandria', labelEn: 'Alexandria', labelAr: 'الإسكندرية' },
  { query: 'Aswan', labelEn: 'Aswan', labelAr: 'أسوان' },
  { query: 'London', labelEn: 'London', labelAr: 'لندن' },
  { query: 'Tokyo', labelEn: 'Tokyo', labelAr: 'طوكيو' },
];

export default function HeroWeatherCard({
  lang,
  telemetry: controlledTelemetry,
  loading: controlledLoading,
  error: controlledError,
  onSearchQuery,
  onRetry,
  onFocusLocation,
}: HeroWeatherCardProps) {
  const isAr = lang === 'ar';
  const isControlled = onSearchQuery !== undefined;

  const [query, setQuery] = useState('Cairo');
  const [activeQuick, setActiveQuick] = useState('Cairo');
  const [internalLoading, setInternalLoading] = useState(!isControlled);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [internalWeather, setInternalWeather] = useState<LocationTelemetrySnapshot | null>(null);

  const weather = isControlled ? (controlledTelemetry ?? null) : internalWeather;
  const loading = isControlled ? Boolean(controlledLoading) : internalLoading;
  const error = isControlled ? (controlledError ?? null) : internalError;

  // Keep input synchronized when user clicks a study region tab or 3D Earth beacon
  useEffect(() => {
    if (!isControlled || !weather?.location?.name) return;
    setQuery(weather.location.name);
    const matchedQuick = QUICK_LOCATIONS.find(
      (q) => q.query.toLowerCase() === weather.location.name.toLowerCase()
    );
    setActiveQuick(matchedQuick ? matchedQuick.query : '');
  }, [isControlled, weather?.location?.name]);

  const loadStandalone = async (searchText: string, signal?: AbortSignal) => {
    const trimmed = searchText.trim();
    if (!trimmed) return;
    setInternalLoading(true);
    setInternalError(null);
    try {
      const data = await fetchLocationTelemetry({ query: trimmed, signal });
      setInternalWeather(data);
      onFocusLocation?.({
        lat: Number(data.coordinates.lat),
        lon: Number(data.coordinates.lon),
      });
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      setInternalError(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر جلب بيانات الطقس المباشرة حالياً.'
            : 'Live atmospheric feed unavailable right now.'
      );
    } finally {
      if (!signal?.aborted) setInternalLoading(false);
    }
  };

  useEffect(() => {
    if (isControlled) return;
    const ac = new AbortController();
    void loadStandalone('Cairo', ac.signal);
    return () => ac.abort();
  }, [isControlled]);

  const triggerSearch = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (isControlled) {
      onSearchQuery?.(trimmed);
    } else {
      void loadStandalone(trimmed);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuick('');
    triggerSearch(query);
  };

  const handleQuickPick = (cityQuery: string) => {
    setQuery(cityQuery);
    setActiveQuick(cityQuery);
    triggerSearch(cityQuery);
  };

  const formatCoord = (val: number, pos: string, neg: string) =>
    `${Math.abs(val).toFixed(2)}° ${val >= 0 ? pos : neg}`;

  return (
    <div
      className="relative w-full max-w-2xl mx-auto rounded-3xl bg-[#050805]/74 backdrop-blur-xl border border-[#00FF66]/25 p-5 sm:p-7 shadow-[0_24px_80px_rgba(0,255,102,0.14),0_0_1px_rgba(0,255,102,0.35),inset_0_1px_0_rgba(0,255,102,0.18)] overflow-hidden"
      aria-label={isAr ? 'بطاقة البحث الجوي المباشر' : 'Live atmospheric weather search'}
    >
      {/* Top radar hairline accent + live sync shimmer */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-px inset-x-10 h-[2px] bg-gradient-to-r from-transparent via-[#00FF66] to-transparent transition-opacity duration-300 ${
          loading ? 'opacity-100 animate-pulse' : 'opacity-75'
        }`}
      />

      {/* Sleek Climato Radar Emblem + Active Location Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/40 flex items-center justify-center shadow-[0_0_22px_rgba(0,255,102,0.28)]">
            <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="11" stroke="#00FF66" strokeWidth="1.6" strokeOpacity="0.9" />
              <ellipse
                cx="16"
                cy="16"
                rx="14"
                ry="4.8"
                transform="rotate(-24 16 16)"
                stroke="#10B981"
                strokeWidth="1.35"
              />
              <path
                d="M 16 2 V 6 M 16 26 V 30 M 2 16 H 6 M 26 16 H 30"
                stroke="#00FF66"
                strokeWidth="1.3"
                strokeOpacity="0.7"
              />
              <circle cx="16" cy="16" r="3.2" fill="#00FF66" />
            </svg>
          </div>
          <div className="text-start">
            <div className="font-display text-base sm:text-lg font-bold tracking-[0.18em] uppercase text-white">
              {isAr ? 'كليماتو' : 'CLIMATO'}
            </div>
            <p className="text-[11px] font-mono text-[#00FF66]/85 tracking-wide">
              {isAr ? 'مسبار الطقس والمدار الفضائي' : 'Orbital Atmospheric Radar'}
            </p>
          </div>
        </div>

        {weather && (
          <div
            className={`text-start sm:text-end transition-opacity duration-300 ${
              loading ? 'opacity-55' : 'opacity-100'
            }`}
            aria-live="polite"
          >
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-white">
              <MapPin className="w-3.5 h-3.5 text-[#00FF66] shrink-0" />
              <span>
                {weather.location.name}
                {weather.location.country ? `, ${weather.location.country}` : ''}
              </span>
            </div>
            <div className="text-[11px] font-mono text-emerald-300/85 tabular-nums mt-0.5">
              {formatCoord(weather.coordinates.lat, 'N', 'S')} ·{' '}
              {formatCoord(weather.coordinates.lon, 'E', 'W')}
            </div>
          </div>
        )}
      </div>

      {/* Futuristic Search Bar + Glowing Neon Green Search Button */}
      <form
        onSubmit={handleSubmit}
        className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
      >
        <label htmlFor="hero-weather-search" className="sr-only">
          {isAr ? 'ابحث عن مدينة أو إحداثيات' : 'Search city or WGS84 coordinates'}
        </label>
        <div className="relative flex-1">
          <Search
            className={`w-4 h-4 text-[#00FF66]/80 absolute top-1/2 -translate-y-1/2 pointer-events-none ${
              isAr ? 'right-4' : 'left-4'
            }`}
          />
          <input
            id="hero-weather-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isAr
                ? 'ابحث عن مدينة أو إحداثيات (مثال: Cairo، Alexandria، 31.20, 29.92)...'
                : 'Search city or coordinates (e.g. Cairo, Alexandria, Tokyo)...'
            }
            className={`w-full rounded-2xl bg-[#020403]/85 border border-[#00FF66]/25 py-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00FF66] focus:ring-2 focus:ring-[#00FF66]/30 transition-all ${
              isAr ? 'pr-11 pl-4' : 'pl-11 pr-4'
            }`}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-6 py-3.5 rounded-2xl bg-[#00FF66] text-[#020503] text-sm font-bold tracking-wide shadow-[0_0_24px_rgba(0,255,102,0.45)] hover:shadow-[0_0_34px_rgba(0,255,102,0.68)] hover:bg-[#38FF88] active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF66]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span>{isAr ? 'رصد الطقس' : 'Search Sky'}</span>
        </button>
      </form>

      {/* Quick Location Switchers */}
      <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
        <span className="text-[11px] font-mono text-slate-400 me-1">
          {isAr ? 'نطاقات سريعة:' : 'Quick lock:'}
        </span>
        {QUICK_LOCATIONS.map((item) => {
          const active = activeQuick === item.query;
          return (
            <button
              key={item.query}
              type="button"
              onClick={() => handleQuickPick(item.query)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF66] ${
                active
                  ? 'bg-[#00FF66]/18 text-[#00FF66] border border-[#00FF66]/55'
                  : 'bg-[#020403]/70 text-slate-300 border border-[#00FF66]/15 hover:border-[#00FF66]/50 hover:text-[#00FF66]'
              }`}
            >
              {isAr ? item.labelAr : item.labelEn}
            </button>
          );
        })}
      </div>

      {/* Honest Error State with Retry Action */}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-rose-950/60 border border-rose-400/40 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-2.5"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => (onRetry ? onRetry() : triggerSearch(query))}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-300/40 text-rose-100 hover:bg-rose-900/50 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{isAr ? 'إعادة' : 'Retry'}</span>
          </button>
        </div>
      )}

      {/* Quick-Stats Metrics: Temperature, Humidity, Wind Speed */}
      <div
        className={`mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 transition-opacity duration-300 ${
          loading && weather ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {/* Temperature */}
        <div className="rounded-2xl bg-[#020503]/75 border border-[#00FF66]/20 p-4 text-start transition-all hover:border-[#00FF66]/65 hover:shadow-[0_0_24px_rgba(0,255,102,0.12)]">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span>{isAr ? 'درجة الحرارة' : 'Temperature'}</span>
            <Thermometer className="w-4 h-4 text-[#00FF66] shrink-0" />
          </div>
          <div className="mt-2 font-display text-2xl sm:text-3xl font-bold text-white tabular-nums">
            {loading && !weather ? '—' : `${weather?.current.temperatureC.toFixed(1) ?? '—'}°C`}
          </div>
          <div className="mt-1 text-[11px] font-mono text-emerald-300/85 truncate">
            {weather
              ? isAr
                ? weather.current.conditionAr
                : weather.current.conditionEn
              : isAr
                ? 'جاري القياس...'
                : 'Awaiting reading'}
          </div>
        </div>

        {/* Humidity */}
        <div className="rounded-2xl bg-[#020503]/75 border border-[#00FF66]/20 p-4 text-start transition-all hover:border-[#00FF66]/65 hover:shadow-[0_0_24px_rgba(0,255,102,0.12)]">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span>{isAr ? 'الرطوبة النسبية' : 'Humidity'}</span>
            <Droplets className="w-4 h-4 text-[#10B981] shrink-0" />
          </div>
          <div className="mt-2 font-display text-2xl sm:text-3xl font-bold text-white tabular-nums">
            {loading && !weather ? '—' : `${Math.round(weather?.current.humidityPct ?? 0)}%`}
          </div>
          <div className="mt-1 text-[11px] font-mono text-emerald-300/85 truncate">
            {weather?.current.apparentTemperatureC !== null &&
            weather?.current.apparentTemperatureC !== undefined
              ? `${isAr ? 'المحسوسة' : 'Feels like'} ${weather.current.apparentTemperatureC.toFixed(1)}°C`
              : isAr
                ? 'رطوبة السطح'
                : 'Relative surface RH'}
          </div>
        </div>

        {/* Wind Speed */}
        <div className="rounded-2xl bg-[#020503]/75 border border-[#00FF66]/20 p-4 text-start transition-all hover:border-[#00FF66]/65 hover:shadow-[0_0_24px_rgba(0,255,102,0.12)]">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span>{isAr ? 'سرعة الرياح' : 'Wind Speed'}</span>
            <Wind className="w-4 h-4 text-[#00FF66] shrink-0" />
          </div>
          <div className="mt-2 font-display text-2xl sm:text-3xl font-bold text-white tabular-nums">
            {loading && !weather ? '—' : `${weather?.current.windSpeedKmh.toFixed(1) ?? '—'} `}
            <span className="text-sm font-mono font-medium text-slate-300">km/h</span>
          </div>
          <div className="mt-1 text-[11px] font-mono text-emerald-300/85 truncate">
            {weather?.climateRisk
              ? `${isAr ? 'مؤشر المخاطر' : 'Risk Index'} ${weather.climateRisk.compositeRiskScore}/100`
              : isAr
                ? 'ارتفاع ١٠ أمتار'
                : '10m surface flow'}
          </div>
        </div>
      </div>

      {/* Transparent Feed Footer */}
      {weather && (
        <div className="mt-4 pt-3 border-t border-[#00FF66]/15 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
          <span>{weather.source}</span>
          <span className="tabular-nums">
            {isAr ? 'رصد:' : 'Observed:'} {weather.current.observedAt.replace('T', ' ')}
          </span>
        </div>
      )}
    </div>
  );
}
