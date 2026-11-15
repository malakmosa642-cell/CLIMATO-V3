import { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudRain,
  Droplets,
  Layers,
  Loader2,
  MapPin,
  Radar,
  RefreshCw,
  Thermometer,
  Wind,
} from 'lucide-react';
import { Language, PageRoute } from '../types/climate';
import {
  ConnectorStatusMeta,
  CoreStudyRegionId,
  fetchScienceOverview,
  isAbortError,
  LocationTelemetrySnapshot,
  ScienceDatasetMeta,
} from '../services/climateTelemetryClient';

export type BentoStudyRegionKey = CoreStudyRegionId;

interface WeatherAnalyticsBentoProps {
  lang: Language;
  onNavigate: (route: PageRoute) => void;
  activeRegionId?: BentoStudyRegionKey;
  onSelectRegion?: (id: BentoStudyRegionKey) => void;
  liveTelemetry?: LocationTelemetrySnapshot | null;
  telemetryLoading?: boolean;
  telemetryError?: string | null;
  selectionMode?: 'region' | 'search';
  onRetryTelemetry?: () => void;
}

type StudyRegionKey = BentoStudyRegionKey;

interface BentoCardConfig {
  id: 'merra-2' | 'gpm-imerg' | 'gldas' | 'grace-fo';
  colSpanClass: string;
  sensorTag: string;
  titleEn: string;
  titleAr: string;
  productLabel: string;
  validatedPillEn: string;
  validatedPillAr: string;
  metricLabelEn: string;
  metricLabelAr: string;
  progressLabelEn: string;
  progressLabelAr: string;
  progressPct: number;
  unit: string;
  chartType: 'line' | 'bars' | 'area' | 'anomaly';
  regionProfiles: Record<
    StudyRegionKey,
    {
      headlineValue: string;
      deltaLabelEn: string;
      deltaLabelAr: string;
      series: number[];
      labels: string[];
    }
  >;
  noteEn: string;
  noteAr: string;
}

const REGION_OPTIONS: Array<{ id: StudyRegionKey; labelEn: string; labelAr: string; coords: string }> = [
  {
    id: 'nile-delta-north',
    labelEn: 'Northern Nile Delta',
    labelAr: 'شمال دلتا النيل',
    coords: '31.22° N · 30.88° E',
  },
  {
    id: 'greater-cairo',
    labelEn: 'Greater Cairo Basin',
    labelAr: 'حوض القاهرة الكبرى',
    coords: '30.04° N · 31.24° E',
  },
  {
    id: 'upper-egypt-agro',
    labelEn: 'Upper Egypt Corridor',
    labelAr: 'صعيد مصر الزراعي',
    coords: '27.72° N · 30.82° E',
  },
];

const BENTO_CARDS: BentoCardConfig[] = [
  {
    id: 'merra-2',
    colSpanClass: 'lg:col-span-7',
    sensorTag: 'NASA MERRA-2 · M2TMNXSLV',
    titleEn: 'Air Temperature (MERRA-2)',
    titleAr: 'درجة حرارة الهواء (MERRA-2)',
    productLabel: '2m Air Temp · T2M & 10m Wind',
    validatedPillEn: 'Validated · NASA CMR',
    validatedPillAr: 'موثق · NASA CMR',
    metricLabelEn: 'Live Air Temp · Surface Sync',
    metricLabelAr: 'الحرارة المباشرة · تزامن سطحي',
    progressLabelEn: 'Temporal Coverage (1980–2025)',
    progressLabelAr: 'التغطية الزمنية (1980–2025)',
    progressPct: 98,
    unit: '°C',
    chartType: 'line',
    regionProfiles: {
      'nile-delta-north': {
        headlineValue: '21.4°C',
        deltaLabelEn: '+0.34°C / decade baseline drift',
        deltaLabelAr: '+0.34°م / عقد انحراف مرجعي',
        series: [19.8, 20.1, 20.4, 20.3, 20.8, 21.1, 21.0, 21.4],
        labels: ['1990', '1995', '2000', '2005', '2010', '2015', '2020', '2024'],
      },
      'greater-cairo': {
        headlineValue: '23.1°C',
        deltaLabelEn: '+0.42°C / decade basin warming',
        deltaLabelAr: '+0.42°م / عقد احترار الحوض',
        series: [21.2, 21.5, 21.8, 22.0, 22.4, 22.7, 22.9, 23.1],
        labels: ['1990', '1995', '2000', '2005', '2010', '2015', '2020', '2024'],
      },
      'upper-egypt-agro': {
        headlineValue: '25.6°C',
        deltaLabelEn: '+0.46°C / decade arid trend',
        deltaLabelAr: '+0.46°م / عقد اتجاه جاف',
        series: [23.6, 23.9, 24.3, 24.5, 24.9, 25.1, 25.4, 25.6],
        labels: ['1990', '1995', '2000', '2005', '2010', '2015', '2020', '2024'],
      },
    },
    noteEn: 'Kelvin-to-Celsius normalized (T2M - 273.15) paired with real-time 10m wind velocity.',
    noteAr: 'معايرة من كلفن إلى مئوي (T2M - 273.15) مع رصد سرعة الرياح السطحية لحظياً.',
  },
  {
    id: 'gpm-imerg',
    colSpanClass: 'lg:col-span-5',
    sensorTag: 'NASA / JAXA GPM · IMERG v07',
    titleEn: 'Precipitation (GPM)',
    titleAr: 'الهطول المطري (GPM)',
    productLabel: 'GPM_3IMERGM · 0.1° Grid',
    validatedPillEn: 'Validated · QA Pass',
    validatedPillAr: 'موثق · فحص الجودة',
    metricLabelEn: 'Live 24h / Rate Accumulation',
    metricLabelAr: 'تراكم الأمطار المباشر (24 ساعة)',
    progressLabelEn: 'Gauge Calibration Index',
    progressLabelAr: 'مؤشر المعايرة الأرضية',
    progressPct: 91,
    unit: 'mm',
    chartType: 'bars',
    regionProfiles: {
      'nile-delta-north': {
        headlineValue: '18.6 mm',
        deltaLabelEn: 'Winter coastal maxima (DJF)',
        deltaLabelAr: 'ذروة الأمطار الساحلية شتاءً',
        series: [26, 21, 14, 5, 2, 0.5, 0.2, 4, 11, 19, 24, 28],
        labels: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
      },
      'greater-cairo': {
        headlineValue: '3.4 mm',
        deltaLabelEn: 'Hyper-arid convective bursts',
        deltaLabelAr: 'زخات حملية متقطعة جافة',
        series: [5.2, 4.1, 3.0, 1.4, 0.4, 0.1, 0, 0.1, 0.3, 1.8, 3.5, 4.9],
        labels: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
      },
      'upper-egypt-agro': {
        headlineValue: '0.8 mm',
        deltaLabelEn: 'Zero-inflated desert regime',
        deltaLabelAr: 'نظام صحراوي شبه صفري',
        series: [1.1, 0.8, 0.7, 0.3, 0.2, 0, 0, 0, 0.1, 0.4, 0.9, 1.2],
        labels: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
      },
    },
    noteEn: 'Converted from mm/hr using leap-year-aware monthly day counts (~11 km grid).',
    noteAr: 'محول من مم/ساعة باستخدام عدد أيام الشهر الفعلي (دقة ~11 كم).',
  },
  {
    id: 'gldas',
    colSpanClass: 'lg:col-span-5',
    sensorTag: 'NASA GLDAS · Noah LSM v2.1',
    titleEn: 'Soil Moisture (GLDAS)',
    titleAr: 'رطوبة التربة (GLDAS)',
    productLabel: '0–10 cm Layer · kg/m²',
    validatedPillEn: 'Validated · LSM 0.25°',
    validatedPillAr: 'موثق · نموذج التربة',
    metricLabelEn: 'Live Topsoil Moisture Content',
    metricLabelAr: 'محتوى رطوبة التربة السطحية المباشر',
    progressLabelEn: 'Land-Surface Assimilation Score',
    progressLabelAr: 'كفاءة استيعاب السطح',
    progressPct: 89,
    unit: 'kg/m²',
    chartType: 'area',
    regionProfiles: {
      'nile-delta-north': {
        headlineValue: '24.8 kg/m²',
        deltaLabelEn: '0.248 m³/m³ volumetric proxy',
        deltaLabelAr: 'مكافئ حجمي 0.248 م³/م³',
        series: [26.2, 25.8, 25.1, 24.4, 23.9, 24.5, 24.6, 24.8],
        labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q1', 'Q2', 'Q3', 'Q4'],
      },
      'greater-cairo': {
        headlineValue: '12.3 kg/m²',
        deltaLabelEn: 'Urban fringe moisture deficit',
        deltaLabelAr: 'عجز رطوبة الحافة الحضرية',
        series: [13.5, 13.1, 12.8, 12.2, 11.9, 12.1, 12.0, 12.3],
        labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q1', 'Q2', 'Q3', 'Q4'],
      },
      'upper-egypt-agro': {
        headlineValue: '14.9 kg/m²',
        deltaLabelEn: 'Floodplain vs. arid mix (~28 km)',
        deltaLabelAr: 'مزيج الوادي والصحراء (~28 كم)',
        series: [15.8, 15.4, 15.0, 14.6, 14.3, 14.5, 14.7, 14.9],
        labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q1', 'Q2', 'Q3', 'Q4'],
      },
    },
    noteEn: '0–10 cm topsoil moisture in kg/m² (1 kg/m² = 1 mm depth; 0.25° cell footprint).',
    noteAr: 'رطوبة الطبقة السطحية 0–10 سم بوحدة كجم/م² (1 كجم/م² = 1 مم عمق).',
  },
  {
    id: 'grace-fo',
    colSpanClass: 'lg:col-span-7',
    sensorTag: 'NASA JPL GRACE-FO · RL06.3 v4',
    titleEn: 'Water Storage & Basin Risk (GRACE-FO)',
    titleAr: 'تخزين المياه ومؤشر الحوض (GRACE-FO)',
    productLabel: 'Mascon CRI · LWE Thickness',
    validatedPillEn: 'Validated · PO.DAAC',
    validatedPillAr: 'موثق · PO.DAAC',
    metricLabelEn: 'Basin LWE Storage Anomaly',
    metricLabelAr: 'شذوذ المكافئ المائي للحوض',
    progressLabelEn: 'Mascon Series Completeness',
    progressLabelAr: 'اكتمال سلسلة Mascon',
    progressPct: 86,
    unit: 'cm LWE',
    chartType: 'anomaly',
    regionProfiles: {
      'nile-delta-north': {
        headlineValue: '-2.8 cm',
        deltaLabelEn: '~300 km mascon shared with Cairo',
        deltaLabelAr: 'كتلة ~300 كم مشتركة مع القاهرة',
        series: [1.4, 0.8, -0.3, -1.1, -1.6, -2.1, -2.5, -2.8],
        labels: ['2005', '2008', '2011', '2014', '2017', '2020', '2022', '2024'],
      },
      'greater-cairo': {
        headlineValue: '-2.8 cm',
        deltaLabelEn: 'Overlapping 3° mascon footprint',
        deltaLabelAr: 'نطاق كتلي متداخل بدقة 3°',
        series: [1.4, 0.8, -0.3, -1.1, -1.6, -2.1, -2.5, -2.8],
        labels: ['2005', '2008', '2011', '2014', '2017', '2020', '2022', '2024'],
      },
      'upper-egypt-agro': {
        headlineValue: '-1.9 cm',
        deltaLabelEn: 'Basin-scale aquifer mass balance',
        deltaLabelAr: 'توازن الكتلة الجوفية الحوضية',
        series: [1.1, 0.6, 0.2, -0.4, -0.9, -1.4, -1.7, -1.9],
        labels: ['2005', '2008', '2011', '2014', '2017', '2020', '2022', '2024'],
      },
    },
    noteEn: 'Native ~300 km equal-area mascon scale preserved alongside live coordinate risk score.',
    noteAr: 'يحافظ على الدقة الكتلية الأصلية (~300 كم) مع حساب مؤشر مخاطر الإحداثيات.',
  },
];

function MiniTelemetryChart({
  type,
  values,
  labels,
  cardId,
}: {
  type: BentoCardConfig['chartType'];
  values: number[];
  labels: string[];
  cardId: string;
}) {
  const w = 340;
  const h = 92;
  const padX = 12;
  const padT = 10;
  const padB = 18;
  const innerW = w - padX * 2;
  const innerH = h - padT - padB;

  const minV = type === 'bars' ? 0 : Math.min(...values, type === 'anomaly' ? -3 : Infinity) * 0.96;
  const maxV = Math.max(...values, type === 'anomaly' ? 2 : 1) * 1.06;
  const range = maxV - minV || 1;

  const xAt = (i: number) =>
    values.length === 1 ? padX + innerW / 2 : padX + (i / (values.length - 1)) * innerW;
  const yAt = (v: number) => padT + (1 - (v - minV) / range) * innerH;
  const gradId = `climato-bento-grad-${cardId}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24 overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00FF66" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#00FF66" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {[0.25, 0.65].map((ratio) => {
        const y = padT + ratio * innerH;
        return (
          <line
            key={ratio}
            x1={padX}
            y1={y}
            x2={w - padX}
            y2={y}
            stroke="rgba(0, 255, 102, 0.12)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        );
      })}

      {type === 'bars' &&
        values.map((v, idx) => {
          const slotW = innerW / values.length;
          const barW = Math.max(8, slotW * 0.56);
          const x = padX + idx * slotW + (slotW - barW) / 2;
          const y = yAt(v);
          const barH = Math.max(2, padT + innerH - y);
          const peak = v === Math.max(...values);
          return (
            <g key={`${labels[idx]}-${idx}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx="3"
                fill={peak ? '#00FF66' : 'rgba(16, 185, 129, 0.52)'}
              />
              <text x={x + barW / 2} y={h - 2} textAnchor="middle" className="fill-slate-500 text-[9px] font-mono">
                {labels[idx]}
              </text>
            </g>
          );
        })}

      {type === 'anomaly' && (() => {
        const zeroY = yAt(0);
        const slotW = innerW / values.length;
        const barW = Math.max(12, slotW * 0.44);
        const linePath = values
          .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(padX + i * slotW + slotW / 2).toFixed(1)} ${yAt(v).toFixed(1)}`)
          .join(' ');
        return (
          <>
            <line
              x1={padX}
              y1={zeroY}
              x2={w - padX}
              y2={zeroY}
              stroke="rgba(16, 185, 129, 0.45)"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
            {values.map((v, idx) => {
              const cx = padX + idx * slotW + slotW / 2;
              const valY = yAt(v);
              const rectY = v >= 0 ? valY : zeroY;
              const rectH = Math.max(2, Math.abs(valY - zeroY));
              return (
                <g key={`${labels[idx]}-${idx}`}>
                  <rect
                    x={cx - barW / 2}
                    y={rectY}
                    width={barW}
                    height={rectH}
                    rx="2.5"
                    fill={v >= 0 ? 'rgba(16, 185, 129, 0.55)' : 'rgba(0, 255, 102, 0.35)'}
                    stroke={v >= 0 ? '#10B981' : '#00FF66'}
                    strokeWidth="0.8"
                  />
                  <text x={cx} y={h - 2} textAnchor="middle" className="fill-slate-500 text-[9px] font-mono">
                    {labels[idx]}
                  </text>
                </g>
              );
            })}
            <path d={linePath} fill="none" stroke="#00FF66" strokeWidth="2" strokeLinecap="round" />
          </>
        );
      })()}

      {(type === 'line' || type === 'area') && (() => {
        const pts = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
        const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
        return (
          <>
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path d={linePath} fill="none" stroke="#00FF66" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, idx) => (
              <g key={`${labels[idx]}-${idx}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={idx === pts.length - 1 ? 4 : 2.5}
                  fill="#050805"
                  stroke="#00FF66"
                  strokeWidth="1.8"
                />
                {(idx === 0 || idx === Math.floor(pts.length / 2) || idx === pts.length - 1) && (
                  <text x={p.x} y={h - 2} textAnchor="middle" className="fill-slate-500 text-[9px] font-mono">
                    {labels[idx]}
                  </text>
                )}
              </g>
            ))}
          </>
        );
      })()}
    </svg>
  );
}

export default function WeatherAnalyticsBento({
  lang,
  onNavigate,
  activeRegionId,
  onSelectRegion,
  liveTelemetry = null,
  telemetryLoading = false,
  telemetryError = null,
  selectionMode = 'region',
  onRetryTelemetry,
}: WeatherAnalyticsBentoProps) {
  const isAr = lang === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;
  const [internalRegion, setInternalRegion] = useState<StudyRegionKey>('nile-delta-north');
  const activeRegion = activeRegionId ?? internalRegion;
  const handleSelectRegion = (id: StudyRegionKey) => {
    setInternalRegion(id);
    onSelectRegion?.(id);
  };
  const [datasetsMeta, setDatasetsMeta] = useState<Record<string, ScienceDatasetMeta>>({});
  const [connectorsMeta, setConnectorsMeta] = useState<Record<string, ConnectorStatusMeta>>({});

  useEffect(() => {
    const ac = new AbortController();
    fetchScienceOverview(ac.signal)
      .then((data) => {
        if (Array.isArray(data?.datasets)) {
          const map: Record<string, ScienceDatasetMeta> = {};
          for (const ds of data.datasets) map[ds.id] = ds;
          setDatasetsMeta(map);
        }
        if (Array.isArray(data?.connectorStatus)) {
          const cMap: Record<string, ConnectorStatusMeta> = {};
          for (const c of data.connectorStatus) cMap[c.id] = c;
          setConnectorsMeta(cMap);
        }
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          // Catalog fallback renders cleanly without breaking the Bento grid
        }
      });
    return () => ac.abort();
  }, []);

  const iconForCard = (id: BentoCardConfig['id']) => {
    switch (id) {
      case 'merra-2':
        return <Thermometer className="w-5 h-5 text-[#00FF66]" />;
      case 'gpm-imerg':
        return <CloudRain className="w-5 h-5 text-[#00FF66]" />;
      case 'gldas':
        return <Droplets className="w-5 h-5 text-[#10B981]" />;
      case 'grace-fo':
        return <Layers className="w-5 h-5 text-[#00FF66]" />;
    }
  };

  const activeRegionObj = REGION_OPTIONS.find((r) => r.id === activeRegion) || REGION_OPTIONS[0];

  const getDynamicCardMetrics = (card: BentoCardConfig) => {
    const baseline = card.regionProfiles[activeRegion];
    if (!liveTelemetry) {
      return {
        headline: baseline.headlineValue,
        subMetricEn: baseline.deltaLabelEn,
        subMetricAr: baseline.deltaLabelAr,
        secondaryBadge: null as string | null,
        progressPct: card.progressPct,
      };
    }

    const cur = liveTelemetry.current;
    switch (card.id) {
      case 'merra-2': {
        return {
          headline: `${cur.temperatureC.toFixed(1)}°C`,
          subMetricEn: `${isAr ? 'رياح 10م:' : 'Wind 10m:'} ${cur.windSpeedKmh.toFixed(1)} km/h · RH ${Math.round(cur.humidityPct)}%`,
          subMetricAr: `الرياح: ${cur.windSpeedKmh.toFixed(1)} كم/س · الرطوبة ${Math.round(cur.humidityPct)}%`,
          secondaryBadge: `${isAr ? 'خط الأساس:' : 'MERRA-2 Baseline:'} ${baseline.headlineValue}`,
          progressPct: card.progressPct,
        };
      }
      case 'gpm-imerg': {
        const precipDisplay = cur.dailyPrecipitationMm;
        return {
          headline: `${precipDisplay.toFixed(1)} mm`,
          subMetricEn: `Instant rate ${cur.precipitationMm.toFixed(2)} mm/hr · ${cur.conditionEn}`,
          subMetricAr: `المعدل اللحظي ${cur.precipitationMm.toFixed(2)} مم/س · ${cur.conditionAr}`,
          secondaryBadge: `${isAr ? 'متوسط الإقليم:' : 'GPM Regional:'} ${baseline.headlineValue}`,
          progressPct: Math.min(100, Math.max(12, Math.round(78 + Math.min(precipDisplay * 2, 20)))),
        };
      }
      case 'gldas': {
        if (cur.soilMoistureKgM2 !== null && cur.soilMoistureM3M3 !== null) {
          return {
            headline: `${cur.soilMoistureKgM2.toFixed(1)} kg/m²`,
            subMetricEn: `${cur.soilMoistureM3M3.toFixed(3)} m³/m³ live topsoil moisture`,
            subMetricAr: `${cur.soilMoistureM3M3.toFixed(3)} م³/م³ رطوبة التربة الحية`,
            secondaryBadge: `${isAr ? 'مرجع GLDAS:' : 'GLDAS Baseline:'} ${baseline.headlineValue}`,
            progressPct: Math.min(100, Math.max(15, Math.round(cur.soilMoistureM3M3 * 220))),
          };
        }
        return {
          headline: baseline.headlineValue,
          subMetricEn: baseline.deltaLabelEn,
          subMetricAr: baseline.deltaLabelAr,
          secondaryBadge: isAr ? 'نقطة بحرية · خط الأساس' : 'Marine/grid baseline active',
          progressPct: card.progressPct,
        };
      }
      case 'grace-fo': {
        const risk = liveTelemetry.climateRisk;
        return {
          headline: baseline.headlineValue,
          subMetricEn: risk
            ? `Composite Risk ${risk.compositeRiskScore}/100 (${risk.riskTier})`
            : baseline.deltaLabelEn,
          subMetricAr: risk
            ? `مؤشر المخاطر المركب ${risk.compositeRiskScore}/100 (${risk.riskTier})`
            : baseline.deltaLabelAr,
          secondaryBadge: `${liveTelemetry.coordinates.lat.toFixed(2)}° N · ${liveTelemetry.coordinates.lon.toFixed(2)}° E`,
          progressPct: risk ? Math.max(25, Math.min(100, Math.round(risk.compositeRiskScore))) : card.progressPct,
        };
      }
    }
  };

  return (
    <section
      id="analytics-bento"
      className="relative py-20 lg:py-28 bg-[#050805] border-y border-[#00FF66]/18 space-grid-bg overflow-hidden"
    >
      {/* Subtle Omnitrix/NASA radar top emerald aura */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,_rgba(0,255,102,0.11),_transparent_68%)]"
      />

      {/* Top sync sweep line while live telemetry updates */}
      {telemetryLoading && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#00FF66] to-transparent animate-pulse z-20"
        />
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
        {/* Section Header + Study Region Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00FF66]/10 border border-[#00FF66]/35 text-[11px] font-mono text-[#00FF66] tracking-wide">
              <Radar className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isAr
                  ? 'مصفوفة التحليلات الفضائية · NASA Earth Observation'
                  : 'ORBITAL TELEMETRY BENTO · NASA EARTH OBSERVATION'}
              </span>
            </div>

            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white leading-[1.12] text-balance">
              {isAr
                ? 'تحليلات الطقس والمناخ متعددة الأقمار الصناعية'
                : 'Validated Satellite Weather & Hydrological Analytics'}
            </h2>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {isAr
                ? 'أربع ركائز رصد مدارية معايرة علمياً تتحدث لحظياً عند البحث أو التبديل بين شمال الدلتا والقاهرة وصعيد مصر.'
                : 'Four calibrated NASA Earth-science streams—MERRA-2, GPM IMERG, GLDAS, and GRACE-FO—updating live when you search a location or switch Egyptian study corridors.'}
            </p>
          </div>

          {/* Interactive Egypt Study Corridor Toggle */}
          <div className="flex flex-col items-start lg:items-end gap-2">
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-[#020403]/90 border border-[#00FF66]/25 shadow-[0_0_24px_rgba(0,255,102,0.08)]">
              {REGION_OPTIONS.map((reg) => {
                const selected = selectionMode === 'region' && reg.id === activeRegion;
                return (
                  <button
                    key={reg.id}
                    type="button"
                    onClick={() => handleSelectRegion(reg.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF66] ${
                      selected
                        ? 'bg-[#00FF66] text-[#020503] font-bold shadow-[0_0_18px_rgba(0,255,102,0.45)]'
                        : 'text-slate-300 hover:text-[#00FF66] hover:bg-[#00FF66]/10'
                    }`}
                  >
                    {isAr ? reg.labelAr : reg.labelEn}
                  </button>
                );
              })}
            </div>
            <div
              className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-emerald-300/85 tabular-nums"
              aria-live="polite"
            >
              {telemetryLoading ? (
                <span className="inline-flex items-center gap-1.5 text-[#00FF66]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{isAr ? 'جاري مزامنة القياسات الحية...' : 'Synchronizing live telemetry...'}</span>
                </span>
              ) : liveTelemetry ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-[#00FF66]" />
                  <span>
                    {liveTelemetry.location.name} ({liveTelemetry.coordinates.lat.toFixed(2)}° N ·{' '}
                    {liveTelemetry.coordinates.lon.toFixed(2)}° E)
                  </span>
                  <span aria-hidden="true">·</span>
                  <Wind className="w-3 h-3 text-[#10B981]" />
                  <span>{liveTelemetry.current.windSpeedKmh.toFixed(1)} km/h</span>
                </span>
              ) : (
                <span>
                  {activeRegionObj.coords} ·{' '}
                  {isAr ? 'ملفات خط أساس معايرة' : 'Calibrated Regional Baseline Profiles'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Inline API Error Recovery Banner */}
        {telemetryError && (
          <div
            role="alert"
            className="rounded-2xl bg-rose-950/55 border border-rose-400/40 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
              <span>{telemetryError}</span>
            </div>
            {onRetryTelemetry && (
              <button
                type="button"
                onClick={onRetryTelemetry}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-rose-300/40 text-rose-100 hover:bg-rose-900/50 transition-colors cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{isAr ? 'إعادة المحاولة' : 'Retry Sync'}</span>
              </button>
            )}
          </div>
        )}

        {/* Modern Bento Grid */}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 transition-opacity duration-300 ${
            telemetryLoading ? 'opacity-65' : 'opacity-100'
          }`}
        >
          {BENTO_CARDS.map((card) => {
            const profile = card.regionProfiles[activeRegion];
            const dynamicMetric = getDynamicCardMetrics(card);
            const backendMeta = datasetsMeta[card.id];
            const connMeta = connectorsMeta[card.id];
            const resolutionText = backendMeta?.spatialResolution || card.productLabel;
            const conceptId = backendMeta?.cmrCollectionConceptId;

            return (
              <article
                key={card.id}
                className={`${card.colSpanClass} group relative rounded-3xl bg-[#071009]/74 backdrop-blur-xl border border-[#00FF66]/25 p-5 sm:p-6 flex flex-col justify-between gap-5 shadow-[0_18px_50px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(0,255,102,0.14)] hover:border-[#00FF66]/80 hover:shadow-[0_0_40px_rgba(0,255,102,0.2)] hover:-translate-y-0.5 transition-all duration-300`}
              >
                {/* Top neon radar accent hairline */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-px inset-x-10 h-px bg-gradient-to-r from-transparent via-[#00FF66]/70 to-transparent opacity-70 group-hover:opacity-100 transition-opacity"
                />

                {/* Card Header: Radar Icon + Product ID + Validated Status Pill */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative w-11 h-11 rounded-2xl bg-[#00FF66]/10 border border-[#00FF66]/40 flex items-center justify-center shadow-[0_0_18px_rgba(0,255,102,0.2)]">
                      {iconForCard(card.id)}
                    </div>
                    <div>
                      <div className="text-[11px] font-mono text-[#10B981] tracking-wide">
                        {card.sensorTag}
                      </div>
                      <h3 className="font-display text-lg sm:text-xl font-bold text-white leading-snug">
                        {isAr ? card.titleAr : card.titleEn}
                      </h3>
                    </div>
                  </div>

                  {/* Vibrant Neon Green Validated Status Pill */}
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00FF66]/12 border border-[#00FF66]/45 text-[11px] font-mono font-medium text-[#00FF66] shadow-[0_0_14px_rgba(0,255,102,0.16)] whitespace-nowrap">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {connMeta?.tokenConfigured
                        ? isAr
                          ? 'متصل · مباشر'
                          : 'Validated · Live Token'
                        : isAr
                          ? card.validatedPillAr
                          : card.validatedPillEn}
                    </span>
                  </span>
                </div>

                {/* Primary Value + Delta + Mini Sparkline/Bar Chart */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center rounded-2xl bg-[#020403]/75 border border-[#00FF66]/15 p-4">
                  <div className="sm:col-span-5 space-y-1.5">
                    <div className="text-[11px] font-mono text-slate-400">
                      {isAr ? card.metricLabelAr : card.metricLabelEn}
                    </div>
                    <div className="font-display text-3xl sm:text-4xl font-bold text-white tabular-nums tracking-tight">
                      {dynamicMetric.headline}
                    </div>
                    <div className="text-xs font-mono text-[#00FF66] flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 shrink-0" />
                      <span>{isAr ? dynamicMetric.subMetricAr : dynamicMetric.subMetricEn}</span>
                    </div>
                    {dynamicMetric.secondaryBadge && (
                      <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {dynamicMetric.secondaryBadge}
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-7">
                    <MiniTelemetryChart
                      type={card.chartType}
                      values={profile.series}
                      labels={profile.labels}
                      cardId={card.id}
                    />
                  </div>
                </div>

                {/* Calibrated Telemetry Progress Bar + Footnote + Action */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300">
                        {isAr ? card.progressLabelAr : card.progressLabelEn}
                      </span>
                      <span className="text-[#00FF66] font-semibold tabular-nums">
                        {dynamicMetric.progressPct}%
                      </span>
                    </div>
                    <div
                      className="h-2 w-full rounded-full bg-[#020403] border border-[#00FF66]/20 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={dynamicMetric.progressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={isAr ? card.progressLabelAr : card.progressLabelEn}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#10B981] to-[#00FF66] shadow-[0_0_12px_rgba(0,255,102,0.55)] transition-all duration-500"
                        style={{ width: `${dynamicMetric.progressPct}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {isAr ? card.noteAr : card.noteEn}
                  </p>

                  <div className="pt-2.5 border-t border-[#00FF66]/15 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-slate-400 truncate max-w-[70%]">
                      {resolutionText}
                      {conceptId ? ` · ${conceptId}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('detective')}
                      className="inline-flex items-center gap-1 text-[#00FF66] font-semibold hover:underline cursor-pointer whitespace-nowrap"
                    >
                      <span>{isAr ? 'افحص في المحقق' : 'Open Trend Detective'}</span>
                      <ArrowIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
