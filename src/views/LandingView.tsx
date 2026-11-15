import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Layers,
  Satellite,
  CheckCircle2,
  Send,
  Globe2,
  Compass,
  Crosshair,
  Activity,
  FlaskConical,
  BookOpen,
  MapPin,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import CinematicEarthStage, { EGYPT_BEACONS } from '../components/CinematicEarthStage';
import HeroWeatherCard from '../components/HeroWeatherCard';
import WeatherAnalyticsBento from '../components/WeatherAnalyticsBento';
import WeeklyForecastStudySection from '../components/WeeklyForecastStudySection';
import {
  CoreStudyRegionId,
  fetchLocationTelemetry,
  isAbortError,
  LocationTelemetrySnapshot,
} from '../services/climateTelemetryClient';
import SampleDataBanner from '../components/SampleDataBanner';
import { ModuleExposureRadar, TimeSeriesChart } from '../components/TelemetryCharts';
import { MODULES, SECTORS, UI_COPY } from '../data/bilingualContent';
import {
  AoiLocation,
  Language,
  ModuleId,
  PageRoute,
  SampleObservation,
  SatelliteConnector,
  SectorId,
} from '../types/climate';

gsap.registerPlugin(ScrollTrigger);

interface LandingViewProps {
  lang: Language;
  aois: AoiLocation[];
  connectors: SatelliteConnector[];
  onNavigate: (
    route: PageRoute,
    opts?: { moduleId?: ModuleId; sectorId?: SectorId; aoiId?: string; planInterest?: string }
  ) => void;
}

interface SpectralLayerSpec {
  id: string;
  index: string;
  title: { en: string; ar: string };
  subtitle: { en: string; ar: string };
  coords: string;
  sensors: string[];
  imagePath: string;
  description: { en: string; ar: string };
  seriesLabel: { en: string; ar: string };
  unit: string;
  points: Array<{ label: string; sample: number; baseline: number }>;
}

interface AnalyzeResult {
  requestId?: string;
  coordinates: { lat: number; lon: number; projection: string };
  regionClassification: { corridorCode: string; labelEn: string; labelAr: string };
  nearestRegisteredAoi: {
    id: string;
    nameEn: string;
    nameAr: string;
    distanceKm: number;
    withinGeofence: boolean;
  } | null;
  compositeRiskScore: number;
  riskTier: string;
  indices: {
    coastalExposure: { score: number; anomalyMm: number; unit: string };
    urbanHeatDelta: { score: number; deltaC: number; unit: string };
    agroMoistureStress: { score: number; ndviProxy: number; unit: string };
    dustAerosolTier: { score: number; aodProxy: number; unit: string };
  };
  dataProvenance: string;
}

const SPECTRAL_LAYERS: SpectralLayerSpec[] = [
  {
    id: 'delta-altimetry',
    index: '01',
    title: { en: 'Nile Delta Coastal & Altimetry', ar: 'الساحل والارتفاعات بدلتا النيل' },
    subtitle: { en: 'Shoreline Perimeter · Placeholder Layer', ar: 'نطاق السواحل الشمالية · طبقة نموذجية' },
    coords: '31.404° N · 30.416° E',
    sensors: ['Sentinel-6', 'Landsat 8/9', 'GRACE-FO'],
    imagePath: '/src/assets/images/sat_delta_monitoring_1794680963485.jpg',
    description: {
      en: 'Combines coastal radar altimetry and multi-decade optical shoreline mapping across Rosetta, Alexandria, and Damietta to model low-elevation inundation corridors.',
      ar: 'يدمج قياسات الارتفاع الرادارية الساحلية ورسم خطوط الساحل البصرية عبر رشيد والإسكندرية ودمياط لنمذجة ممرات الغمر منخفضة الارتفاع.',
    },
    seriesLabel: { en: 'Sample Coastal Elevation Anomaly', ar: 'شذوذ الارتفاع الساحلي النموذجي' },
    unit: 'mm',
    points: [
      { label: 'Q1', sample: 38, baseline: 32 },
      { label: 'Q2', sample: 41, baseline: 32 },
      { label: 'Q3', sample: 44, baseline: 32 },
      { label: 'Q4', sample: 46, baseline: 32 },
    ],
  },
  {
    id: 'agro-ndvi',
    index: '02',
    title: { en: 'Multispectral Crop & Root Moisture', ar: 'الأطياف الزراعية ورطوبة الجذور' },
    subtitle: { en: 'East Delta & Toshka · Placeholder Layer', ar: 'شرق الدلتا وتوشكى · طبقة نموذجية' },
    coords: '30.732° N · 31.719° E',
    sensors: ['MODIS', 'Landsat 8/9', 'SMAP', 'ECOSTRESS'],
    imagePath: '/src/assets/images/agro_multispectral_scan_1794680962356.jpg',
    description: {
      en: 'Tracks photosynthetic vigor (NDVI/EVI), pivot irrigation uniformity, and root-zone soil moisture deficits across Nile Delta farms and desert reclamation corridors.',
      ar: 'يتابع حيوية الغطاء النباتي (NDVI/EVI) وتجانس الري المحوري وعجز رطوبة منطقة الجذور في مزارع الدلتا ومشاريع الاستصلاح الصحراوي.',
    },
    seriesLabel: { en: 'Sample Vegetation Vigor Index', ar: 'مؤشر الغطاء النباتي النموذجي' },
    unit: 'NDVI',
    points: [
      { label: 'Q1', sample: 0.64, baseline: 0.66 },
      { label: 'Q2', sample: 0.68, baseline: 0.66 },
      { label: 'Q3', sample: 0.59, baseline: 0.66 },
      { label: 'Q4', sample: 0.62, baseline: 0.66 },
    ],
  },
  {
    id: 'air-aerosol',
    index: '03',
    title: { en: 'Atmospheric Dust & Trace Gases', ar: 'أعمدة الغبار وجودة الهواء' },
    subtitle: { en: 'Mediterranean & Cairo Corridor · Placeholder Layer', ar: 'الممر المتوسطي والقاهرة · طبقة نموذجية' },
    coords: '30.044° N · 31.235° E',
    sensors: ['TROPOMI', 'MERRA-2', 'MODIS'],
    imagePath: '/src/assets/images/climato_dust_plume_mediterranean_1794682442517.jpg',
    description: {
      en: 'Monitors Saharan Khamsin mineral dust transport, aerosol optical depth, and urban NO2 columns over Cairo, logistics corridors, and Red Sea ports.',
      ar: 'يرصد انتقال غبار الخماسين الصحراوي والعمق البصري للهوائيات وأعمدة ثاني أكسيد النيتروجين فوق القاهرة والممرات اللوجستية والموانئ.',
    },
    seriesLabel: { en: 'Sample Aerosol Optical Depth', ar: 'العمق البصري للهوائيات النموذجي' },
    unit: 'AOD',
    points: [
      { label: 'Q1', sample: 0.42, baseline: 0.35 },
      { label: 'Q2', sample: 0.58, baseline: 0.35 },
      { label: 'Q3', sample: 0.64, baseline: 0.35 },
      { label: 'Q4', sample: 0.45, baseline: 0.35 },
    ],
  },
  {
    id: 'orbital-fleet',
    index: '04',
    title: { en: 'Multi-Sensor Orbital Architecture', ar: 'البنية المدارية متعددة المستشعرات' },
    subtitle: { en: 'Staged 10-Connector Pipeline · Non-Live', ar: 'مسار تكامل من 10 أقمار · جاهز للربط' },
    coords: '26.820° N · 30.802° E',
    sensors: ['Sentinel-6', 'ECOSTRESS', 'GPM', 'NASA POWER'],
    imagePath: '/src/assets/images/climato_orbital_satellite_1794682442303.jpg',
    description: {
      en: 'Standardized ingestion connectors harmonize radar altimetry, 70m thermal radiometry, gravimetry, and agroclimatology into a unified coordinate API.',
      ar: 'موصلات قياسية توحد قياسات الارتفاع الراداري والإشعاع الحراري بدقة 70 متراً والجاذبية المائية والأرصاد الزراعية في واجهة برمجية واحدة.',
    },
    seriesLabel: { en: 'Sample Surface Temp Anomaly', ar: 'شذوذ حرارة السطح النموذجي' },
    unit: '°C',
    points: [
      { label: 'Q1', sample: 3.2, baseline: 2.1 },
      { label: 'Q2', sample: 4.6, baseline: 2.1 },
      { label: 'Q3', sample: 5.1, baseline: 2.1 },
      { label: 'Q4', sample: 3.8, baseline: 2.1 },
    ],
  },
];

const FALLBACK_OBS: SampleObservation[] = [
  {
    id: 1,
    aoi_id: 'aoi-rosetta',
    aoi_name_en: 'Rosetta Coastal Perimeter (Sample)',
    aoi_name_ar: 'النطاق الساحلي برشيد (نموذج)',
    lat: 31.404,
    lon: 30.416,
    workspace_id: 'ws-delta-agro',
    module_id: 'delta-risk',
    source_name: 'Sentinel-6 + Landsat',
    period_label: '2026-Q1',
    metric_key: 'coastal_elevation_anomaly_mm',
    metric_value: 38,
    unit: 'mm',
    baseline_value: 32,
    anomaly_delta: 6,
    is_sample_data: 1,
    data_provenance: 'SAMPLE_DEMONSTRATION',
  },
  {
    id: 2,
    aoi_id: 'aoi-rosetta',
    aoi_name_en: 'Rosetta Coastal Perimeter (Sample)',
    aoi_name_ar: 'النطاق الساحلي برشيد (نموذج)',
    lat: 31.404,
    lon: 30.416,
    workspace_id: 'ws-delta-agro',
    module_id: 'delta-risk',
    source_name: 'Sentinel-6 + Landsat',
    period_label: '2026-Q2',
    metric_key: 'coastal_elevation_anomaly_mm',
    metric_value: 41,
    unit: 'mm',
    baseline_value: 32,
    anomaly_delta: 9,
    is_sample_data: 1,
    data_provenance: 'SAMPLE_DEMONSTRATION',
  },
  {
    id: 3,
    aoi_id: 'aoi-rosetta',
    aoi_name_en: 'Rosetta Coastal Perimeter (Sample)',
    aoi_name_ar: 'النطاق الساحلي برشيد (نموذج)',
    lat: 31.404,
    lon: 30.416,
    workspace_id: 'ws-delta-agro',
    module_id: 'delta-risk',
    source_name: 'Sentinel-6 + Landsat',
    period_label: '2026-Q3',
    metric_key: 'coastal_elevation_anomaly_mm',
    metric_value: 44,
    unit: 'mm',
    baseline_value: 32,
    anomaly_delta: 12,
    is_sample_data: 1,
    data_provenance: 'SAMPLE_DEMONSTRATION',
  },
  {
    id: 4,
    aoi_id: 'aoi-rosetta',
    aoi_name_en: 'Rosetta Coastal Perimeter (Sample)',
    aoi_name_ar: 'النطاق الساحلي برشيد (نموذج)',
    lat: 31.404,
    lon: 30.416,
    workspace_id: 'ws-delta-agro',
    module_id: 'delta-risk',
    source_name: 'Sentinel-6 + Landsat',
    period_label: '2026-Q4',
    metric_key: 'coastal_elevation_anomaly_mm',
    metric_value: 46,
    unit: 'mm',
    baseline_value: 32,
    anomaly_delta: 14,
    is_sample_data: 1,
    data_provenance: 'SAMPLE_DEMONSTRATION',
  },
];

export default function LandingView({ lang, aois, connectors, onNavigate }: LandingViewProps) {
  const isAr = lang === 'ar';
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const orbitalWrapperRef = useRef<HTMLDivElement | null>(null);
  const heroPortalRef = useRef<HTMLDivElement | null>(null);
  const dataSectionRef = useRef<HTMLElement | null>(null);
  const shutterLeftRef = useRef<HTMLDivElement | null>(null);
  const shutterRightRef = useRef<HTMLDivElement | null>(null);
  const apertureRingRef = useRef<HTMLDivElement | null>(null);
  const dataParallaxRef = useRef<HTMLDivElement | null>(null);
  const solutionsSectionRef = useRef<HTMLElement | null>(null);
  const monumentalGlobeRef = useRef<HTMLDivElement | null>(null);
  const blueprintSectionRef = useRef<HTMLElement | null>(null);
  const blueprintGridRef = useRef<HTMLDivElement | null>(null);
  const zoomProgressRef = useRef<number>(0);

  const [activeBeaconId, setActiveBeaconId] = useState<string>('nile-delta-north');
  const [selectedCoreRegion, setSelectedCoreRegion] = useState<CoreStudyRegionId>('nile-delta-north');
  const [selectionMode, setSelectionMode] = useState<'region' | 'search'>('region');
  const [orbitResetSignal, setOrbitResetSignal] = useState<number>(0);
  const [heroFocusCoord, setHeroFocusCoord] = useState<{ lat: number; lon: number } | null>({
    lat: 31.22,
    lon: 30.88,
  });
  const [liveTelemetry, setLiveTelemetry] = useState<LocationTelemetrySnapshot | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState<boolean>(true);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const telemetryAbortRef = useRef<AbortController | null>(null);
  const lastTelemetryRequestRef = useRef<{ regionId?: CoreStudyRegionId; query?: string }>({
    regionId: 'nile-delta-north',
  });
  const [activeLayerIdx, setActiveLayerIdx] = useState<number>(0);
  const [activeStudyRegionIdx, setActiveStudyRegionIdx] = useState<number>(0);
  const [previewAoiId, setPreviewAoiId] = useState<string>('aoi-rosetta');
  const [previewModuleId, setPreviewModuleId] = useState<ModuleId>('delta-risk');
  const [observations, setObservations] = useState<SampleObservation[]>(FALLBACK_OBS);

  // Live backend Coordinate Risk Analyzer state (Scene 5)
  const [probeLat, setProbeLat] = useState<string>('31.404');
  const [probeLon, setProbeLon] = useState<string>('30.416');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);

  // Quick demo request state in Section 6 (Business)
  const [demoName, setDemoName] = useState('');
  const [demoEmail, setDemoEmail] = useState('');
  const [demoOrg, setDemoOrg] = useState('');
  const [demoInterest, setDemoInterest] = useState('Enterprise & Sovereign');
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoReceipt, setDemoReceipt] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);

  const executeTelemetrySync = async (target: { regionId?: CoreStudyRegionId; query?: string }) => {
    telemetryAbortRef.current?.abort();
    const ac = new AbortController();
    telemetryAbortRef.current = ac;
    lastTelemetryRequestRef.current = target;

    setTelemetryLoading(true);
    setTelemetryError(null);

    try {
      const snapshot = await fetchLocationTelemetry({
        regionId: target.regionId,
        query: target.query,
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      setLiveTelemetry(snapshot);
      if (snapshot?.coordinates) {
        setHeroFocusCoord({
          lat: Number(snapshot.coordinates.lat),
          lon: Number(snapshot.coordinates.lon),
        });
      }
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      setTelemetryError(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر تحديث القياسات الجوية المباشرة حالياً.'
            : 'Unable to synchronize live atmospheric telemetry.'
      );
    } finally {
      if (!ac.signal.aborted) {
        setTelemetryLoading(false);
      }
    }
  };

  const handleSelectCoreRegion = (regionId: CoreStudyRegionId) => {
    setSelectedCoreRegion(regionId);
    setActiveBeaconId(regionId);
    setSelectionMode('region');
    void executeTelemetrySync({ regionId });
  };

  const handleHeroSearchQuery = (query: string) => {
    setSelectionMode('search');
    void executeTelemetrySync({ query });
  };

  const handleRetryTelemetry = () => {
    void executeTelemetrySync(lastTelemetryRequestRef.current);
  };

  // Fetch initial regional telemetry, sample observations & initial coordinate analysis
  useEffect(() => {
    void executeTelemetrySync({ regionId: 'nile-delta-north' });

    fetch('/api/observations')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.observations?.length) {
          setObservations(data.observations);
        }
      })
      .catch(() => {});

    fetch('/api/climate/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 31.404, lon: 30.416 }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.compositeRiskScore !== undefined) {
          setAnalyzeResult(data);
        }
      })
      .catch(() => {});

    return () => {
      telemetryAbortRef.current?.abort();
    };
  }, []);

  const runCoordinateAnalysis = async (latVal?: number, lonVal?: number) => {
    const targetLat = latVal ?? Number(probeLat);
    const targetLon = lonVal ?? Number(probeLon);
    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/climate/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: targetLat, lon: targetLon }),
      });
      const data = await res.json();
      if (res.ok) setAnalyzeResult(data);
    } finally {
      setAnalyzing(false);
    }
  };

  // GSAP ScrollTrigger storytelling choreography matching video transitions
  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      zoomProgressRef.current = 0.65;
      return;
    }

    const ctx = gsap.context(() => {
      // 1. Scroll-driven 3D Earth camera flight + Hero Portal Ring Zoom
      if (orbitalWrapperRef.current) {
        ScrollTrigger.create({
          trigger: orbitalWrapperRef.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.75,
          onUpdate: (self) => {
            zoomProgressRef.current = self.progress;
          },
        });
      }

      if (heroPortalRef.current && orbitalWrapperRef.current) {
        gsap.fromTo(
          heroPortalRef.current,
          { scale: 1, y: 0, opacity: 1 },
          {
            scale: 0.96,
            y: -16,
            opacity: 0.12,
            ease: 'none',
            scrollTrigger: {
              trigger: orbitalWrapperRef.current,
              start: 'top top',
              end: '24% top',
              scrub: true,
            },
          }
        );
      }

      // 2. Video-Inspired Split-Aperture Curtain Transition into Scene 3 (The Data)
      if (dataSectionRef.current && shutterLeftRef.current && shutterRightRef.current) {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: dataSectionRef.current,
            start: 'top 78%',
            end: 'top 18%',
            scrub: 0.7,
          },
        });
        tl.to(shutterLeftRef.current, { xPercent: -102, ease: 'power2.inOut' }, 0)
          .to(shutterRightRef.current, { xPercent: 102, ease: 'power2.inOut' }, 0);
        if (apertureRingRef.current) {
          tl.fromTo(
            apertureRingRef.current,
            { scale: 0.45, opacity: 0.95 },
            { scale: 2.2, opacity: 0, ease: 'power2.out' },
            0
          );
        }
      }

      // Subtle parallax on Satellite Imagery inside Scene 3
      if (dataSectionRef.current && dataParallaxRef.current) {
        gsap.fromTo(
          dataParallaxRef.current,
          { yPercent: -5 },
          {
            yPercent: 5,
            ease: 'none',
            scrollTrigger: {
              trigger: dataSectionRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          }
        );
      }

      // 3. Video-Inspired Monumental Rising Orbital Ring in Scene 4 (The Solutions)
      if (solutionsSectionRef.current && monumentalGlobeRef.current) {
        gsap.fromTo(
          monumentalGlobeRef.current,
          { y: 90, scale: 0.88, opacity: 0.35 },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: solutionsSectionRef.current,
              start: 'top 80%',
              end: 'top 25%',
              scrub: 0.8,
            },
          }
        );
      }

      // 4. Video-Inspired Blueprint Grid Reveal in Scene 6 (Business)
      if (blueprintSectionRef.current && blueprintGridRef.current) {
        gsap.fromTo(
          blueprintGridRef.current,
          { opacity: 0.15, scale: 1.06 },
          {
            opacity: 0.9,
            scale: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: blueprintSectionRef.current,
              start: 'top 85%',
              end: 'top 30%',
              scrub: 0.7,
            },
          }
        );
      }

      // 5. Editorial reveal animations (compositor properties only: opacity & transform)
      gsap.utils.toArray<HTMLElement>('.climato-reveal').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 26,
          duration: 0.7,
          ease: 'power3.out',
          clearProps: 'transform',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true,
          },
        });
      });

      gsap.from('.climato-solution-card', {
        opacity: 0,
        y: 22,
        duration: 0.6,
        stagger: 0.06,
        ease: 'power3.out',
        clearProps: 'transform',
        scrollTrigger: {
          trigger: '.climato-solutions-grid',
          start: 'top 84%',
          once: true,
        },
      });
    }, rootRef);

    return () => {
      ctx.revert();
    };
  }, [lang]);

  const activeLayer = SPECTRAL_LAYERS[activeLayerIdx];
  const activeBeacon = EGYPT_BEACONS.find((b) => b.id === activeBeaconId) || EGYPT_BEACONS[0];

  const egyptChallenges = [
    {
      index: '01',
      beaconId: 'nile-delta-north',
      title: {
        en: 'Northern Nile Delta · Coastal & Agricultural Corridor',
        ar: 'شمال دلتا النيل · النطاق الساحلي والزراعي',
      },
      coords: '31.22° N · 30.88° E',
      body: {
        en: 'Low-lying Mediterranean corridors across Rosetta, Kafr El-Sheikh, and Damietta face coastal saltwater intrusion, thermal shifts, and soil moisture stress.',
        ar: 'تواجه الممرات الساحلية المنخفضة عبر رشيد وكفر الشيخ ودمياط تداخل المياه المالحة وتقلبات الحرارة وإجهاد رطوبة التربة الزراعية.',
      },
      sampleMetric: {
        label: { en: 'Sample Baseline Variance', ar: 'التباين النموذجي لخط الأساس' },
        value: '+46.0 mm',
      },
    },
    {
      index: '02',
      beaconId: 'greater-cairo',
      title: {
        en: 'Greater Cairo · Dense Urban & Thermal Basin',
        ar: 'القاهرة الكبرى · الحوض الحضري والحراري',
      },
      coords: '30.04° N · 31.24° E',
      body: {
        en: 'Impervious urban districts amplify nocturnal land surface temperatures alongside seasonal Saharan Khamsin dust corridors.',
        ar: 'تضخم الأحياء العمرانية الكثيفة درجات حرارة الأسطح الليلية بالتزامن مع موجات غبار الخماسين الموسمية.',
      },
      sampleMetric: {
        label: { en: 'Sample Urban Surface Delta', ar: 'الفارق الحراري النموذجي' },
        value: '+5.1 °C',
      },
    },
    {
      index: '03',
      beaconId: 'upper-egypt-agro',
      title: {
        en: 'Upper Egypt Agricultural Corridor · Minya–Assiut',
        ar: 'الممر الزراعي بالصعيد · المنيا – أسيوط',
      },
      coords: '27.72° N · 30.82° E',
      body: {
        en: 'Hyper-arid irrigated Nile Valley farms experience intense summer heat extremes, high evaporative demand, and basin water-balance pressure.',
        ar: 'تشهد أراضي الوادي المروية في الصعيد تطرفات الحر الصيفي وارتفاع البخر وضغوط التوازن المائي الحوضي.',
      },
      sampleMetric: {
        label: { en: 'Sample Soil Moisture Window', ar: 'مؤشر رطوبة التربة النموذجي' },
        value: '17.6 kg/m²',
      },
    },
  ];

  const studyRegionsStory = [
    {
      id: 'nile-delta-north',
      code: 'REGION 01 · COASTAL AGRO DELTA',
      title: { en: 'Northern Nile Delta', ar: 'شمال دلتا النيل' },
      coords: '31.22° N, 30.88° E · ~11,800 km²',
      bbox: [30.72, 29.9, 31.58, 31.95],
      color: '#22FF3A',
      rationale: {
        en: 'Selected to track Mediterranean coastal moderation, winter IMERG rainfall variance, and GLDAS root-zone moisture across rice and citrus belts.',
        ar: 'تم اختيارها لمتابعة توازن الحرارة المتوسطية وتذبذب أمطار الشتاء ورطوبة التربة الزراعية في نطاقات الأرز والموالح.',
      },
    },
    {
      id: 'greater-cairo',
      code: 'REGION 02 · METROPOLITAN HEAT BASIN',
      title: { en: 'Greater Cairo Basin', ar: 'حوض القاهرة الكبرى' },
      coords: '30.04° N, 31.24° E · ~1,950 km²',
      bbox: [29.82, 31.02, 30.26, 31.52],
      color: '#22D3EE',
      rationale: {
        en: 'Selected as Egypt’s urban thermal benchmark contrasting dense city asphalt and Nile-apex humidity against rural agricultural valleys.',
        ar: 'تم اختيارها كمرجع حضري حراري لمقارنة التكتل العمراني ورأس الدلتا مع الأودية الزراعية المحيطة.',
      },
    },
    {
      id: 'upper-egypt-agro',
      code: 'REGION 03 · HYPER-ARID VALLEY AGRO',
      title: { en: 'Upper Egypt Agricultural Corridor', ar: 'الممر الزراعي بصعيد مصر' },
      coords: '27.72° N, 30.82° E · ~4,200 km²',
      bbox: [27.1, 30.55, 28.35, 31.08],
      color: '#F59E0B',
      rationale: {
        en: 'Selected across Minya–Assiut to isolate continental hyper-arid warming and canal-irrigated moisture signals against GRACE-FO basin mass.',
        ar: 'تم اختيارها بين المنيا وأسيوط لعزل الاحترار القاري الجاف ومقارنة رطوبة الري بالتخزين المائي لـ GRACE-FO.',
      },
    },
  ];

  const nasaScientificLayers = [
    {
      id: 'merra-2',
      variable: { en: 'Air Temperature (2m)', ar: 'درجة حرارة الهواء (2م)' },
      product: 'NASA MERRA-2 · M2TMNXSLV v5.12.4',
      resolution: '0.5° × 0.625° (~60 km)',
      unit: 'K → °C',
      color: '#F59E0B',
      note: {
        en: 'Monthly global reanalysis air temperature; requires NASA_EARTHDATA_TOKEN for OPeNDAP extraction (CMR metadata live).',
        ar: 'إعادة تحليل شهرية لحرارة الهواء؛ يتطلب NASA_EARTHDATA_TOKEN للسحب المباشر عبر OPeNDAP (فهرس CMR متصل حياً).',
      },
    },
    {
      id: 'gpm-imerg',
      variable: { en: 'Precipitation Rate', ar: 'معدل الهطول المطري' },
      product: 'NASA GPM IMERG · GPM_3IMERGM v07',
      resolution: '0.1° × 0.1° (~11 km)',
      unit: 'mm/hr → mm/month',
      color: '#22D3EE',
      note: {
        en: 'Multi-satellite precipitation calibrated with gauges; captures Mediterranean winter storms and Upper Egypt zero-inflated dry spells.',
        ar: 'هطول مطري معاير متعدد الأقمار يرصد عواصف الشتاء المتوسطية وجفاف الصعيد.',
      },
    },
    {
      id: 'gldas',
      variable: { en: 'Soil Moisture (0–10 cm)', ar: 'رطوبة التربة (0–10 سم)' },
      product: 'NASA GLDAS · GLDAS_NOAH025_M v2.1',
      resolution: '0.25° × 0.25° (~28 km)',
      unit: 'kg/m² (mm water)',
      color: '#22FF3A',
      note: {
        en: 'Noah Land Surface Model hydrological moisture; native 28 km cells average irrigated valley strips with desert margins.',
        ar: 'نموذج سطح الأرض الهيدرولوجي لرطوبة التربة؛ الخلايا بمساحة 28 كم تمزج الوادي المروي بالهوامش الصحراوية.',
      },
    },
    {
      id: 'grace-fo',
      variable: { en: 'Terrestrial Water Storage', ar: 'تخزين المياه الأرضية' },
      product: 'NASA GRACE-FO · JPL RL06.3 Mascon CRI v4',
      resolution: '3° Mascon (~300 km) on 0.5° grid',
      unit: 'cm LWE anomaly',
      color: '#38BDF8',
      note: {
        en: 'Basin-scale gravimetric water mass only (~300 km footprint covers both Cairo & Delta; never implies parcel-level precision).',
        ar: 'كتلة مائية حوضية بدقة ~300 كم تغطي القاهرة والدلتا معاً ولا تعني دقة على مستوى القطعة الزراعية.',
      },
    },
  ];

  const egyptAois = aois.filter((a) => a.region_code.startsWith('EG-'));
  const previewAois = egyptAois.length > 0 ? egyptAois : aois.slice(0, 4);
  const currentPreviewAoi = previewAois.find((a) => a.id === previewAoiId) || previewAois[0];

  const matchingObs = observations.filter(
    (o) =>
      (currentPreviewAoi ? o.aoi_id === currentPreviewAoi.id : true) &&
      o.module_id === previewModuleId
  );
  const chartObs =
    matchingObs.length > 0
      ? matchingObs
      : observations.filter((o) => o.module_id === previewModuleId).slice(0, 4);
  const finalChartObs = chartObs.length > 0 ? chartObs : FALLBACK_OBS;
  const latestPreviewPoint = finalChartObs[finalChartObs.length - 1];

  const handleQuickDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDemoError(null);
    setDemoSubmitting(true);
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: demoName,
          workEmail: demoEmail,
          organization: demoOrg,
          sector: 'Enterprise & Climate Risk (Egypt)',
          planInterest: demoInterest,
          modulesInterested: ['delta-risk', 'crop-health', 'esg-reporting'],
          notes: 'Submitted from CLIMATO Landing Page Business section',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setDemoReceipt(data.referenceId);
    } catch (err: unknown) {
      setDemoError(err instanceof Error ? err.message : 'Unable to record request.');
    } finally {
      setDemoSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div ref={rootRef} className="bg-[#020403] text-slate-100 overflow-x-clip">
      {/* ===================================================================== */}
      {/* SCENE 1 (HERO) + SCENE 2 (THE CHALLENGE): STICKY 3D ORBITAL JOURNEY   */}
      {/* ===================================================================== */}
      <div ref={orbitalWrapperRef} className="relative">
        {/* Sticky Full-Screen Deep Black & Neon Green 3D Earth Viewport */}
        <div
          className="sticky top-16 h-[calc(100vh-4rem)] w-full overflow-hidden pointer-events-auto"
          style={{
            background:
              'radial-gradient(ellipse at 20% 20%, rgba(0, 255, 102, 0.11) 0%, transparent 50%), radial-gradient(ellipse at 82% 28%, rgba(16, 185, 129, 0.12) 0%, transparent 54%), radial-gradient(circle at 50% 55%, rgba(6, 78, 59, 0.22) 0%, transparent 65%), linear-gradient(180deg, #020403 0%, #050805 58%, #020403 100%)',
          }}
        >
          <CinematicEarthStage
            lang={lang}
            zoomProgressRef={zoomProgressRef}
            activeBeaconId={activeBeaconId}
            onSelectBeacon={(id) => {
              setActiveBeaconId(id);
              if (id === 'nile-delta-north' || id === 'greater-cairo' || id === 'upper-egypt-agro') {
                handleSelectCoreRegion(id);
              }
            }}
            focusCoord={heroFocusCoord}
            resetSignal={orbitResetSignal}
          />
          {/* Subtle atmospheric vignette & bottom transition scrim */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_38%,rgba(2,4,3,0.72)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#020403] via-[#020403]/75 to-transparent" />
        </div>

        {/* Overlay Narrative Layer flowing over the sticky 3D stage */}
        <div className="relative z-10 -mt-[calc(100vh-4rem)] pointer-events-none">
          {/* SCENE 1: FUTURISTIC SPACE-WEATHER HERO */}
          <section
            id="hero"
            className="min-h-[calc(100vh-4rem)] max-w-7xl mx-auto px-4 sm:px-6 flex flex-col justify-between py-8 lg:py-12"
          >
            {/* Top Radar Eyebrow */}
            <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
              <div className="inline-flex items-center gap-2 text-xs font-mono text-[#00FF66] tracking-wide">
                <Compass className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                <span>{UI_COPY.hero.kicker[lang]}</span>
              </div>
              <span className="text-xs font-mono text-emerald-300/80 hidden sm:inline">
                {isAr ? 'القاهرة · دلتا النيل · الرصد العالمي' : 'Cairo · Nile Delta · Global Atmospheric Feed'}
              </span>
            </div>

            {/* Centered Headline + Glassmorphism Weather Search Card */}
            <div className="my-auto py-5 sm:py-8 flex flex-col items-center text-center gap-6">
              <div className="max-w-3xl space-y-3 pointer-events-auto">
                <h1
                  className="font-display font-bold text-white leading-[1.06] tracking-tight text-balance drop-shadow-[0_4px_24px_rgba(2,4,3,0.85)]"
                  style={{ fontSize: 'clamp(2.15rem, 4.6vw, 3.85rem)' }}
                >
                  {UI_COPY.hero.headline[lang]}
                </h1>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">
                  {UI_COPY.hero.subheadline[lang]}
                </p>
              </div>

              <div ref={heroPortalRef} className="w-full pointer-events-auto">
                <HeroWeatherCard
                  lang={lang}
                  telemetry={liveTelemetry}
                  loading={telemetryLoading}
                  error={telemetryError}
                  onSearchQuery={handleHeroSearchQuery}
                  onRetry={handleRetryTelemetry}
                  onFocusLocation={(coords) => setHeroFocusCoord(coords)}
                />
              </div>

              {/* Primary Platform CTAs */}
              <div className="flex flex-wrap items-center justify-center gap-3 pointer-events-auto pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('detective')}
                  className="px-6 py-3 rounded-xl bg-[#00FF66] text-[#020503] text-sm font-bold hover:bg-[#38FF88] transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-[0_0_24px_rgba(0,255,102,0.34)]"
                >
                  <FlaskConical className="w-4 h-4" />
                  <span>{isAr ? 'افتح محقق اتجاهات مصر' : 'Launch Egypt Trend Detective'}</span>
                  <ArrowIcon className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('analytics-bento')}
                  className="px-5 py-3 rounded-xl border border-[#00FF66]/40 bg-[#050805]/85 text-[#00FF66] text-sm font-medium hover:border-[#00FF66] hover:bg-[#07120A] transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isAr ? 'تحليلات ناسا الفضائية' : 'NASA Data Analytics'}
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('business-demo')}
                  className="px-5 py-3 rounded-xl border border-[#10B981]/45 bg-[#050805]/85 text-slate-100 text-sm font-medium hover:border-[#00FF66] hover:text-[#00FF66] transition-colors whitespace-nowrap cursor-pointer"
                >
                  {UI_COPY.hero.secondaryCta[lang]}
                </button>
              </div>
            </div>

            {/* Bottom Scroll Cue & Interactive 3D Orbit Reset */}
            <div className="flex flex-wrap items-center justify-between gap-4 pointer-events-auto pt-2">
              <button
                type="button"
                onClick={() => scrollToSection('analytics-bento')}
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-[#00FF66] transition-colors cursor-pointer"
              >
                <ChevronDown className="w-4 h-4 text-[#00FF66]" />
                <span>
                  {isAr ? '01. مرر لاستكشاف تحليلات الطقس والهبوط نحو مصر' : '01. Scroll for Satellite Weather Analytics & Egypt Descent'}
                </span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOrbitResetSignal((n) => n + 1)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#00FF66]/25 bg-[#050805]/80 text-[11px] font-mono text-emerald-300/90 hover:border-[#00FF66] hover:text-[#00FF66] transition-colors cursor-pointer"
                  title={isAr ? 'إعادة ضبط زاوية الكرة الأرضية ثلاثية الأبعاد' : 'Reset 3D Earth orbit orientation'}
                >
                  <RotateCcw className="w-3 h-3 text-[#00FF66]" />
                  <span>{isAr ? 'اسحب الكوكب · إعادة ضبط' : 'Drag Earth · Reset Orbit'}</span>
                </button>
                <span className="hidden sm:inline-block font-mono text-xs text-emerald-300/80 tabular-nums">
                  {heroFocusCoord
                    ? `${heroFocusCoord.lat.toFixed(2)}° N · ${heroFocusCoord.lon.toFixed(2)}° E`
                    : `${activeBeacon.lat.toFixed(2)}° N · ${activeBeacon.lon.toFixed(2)}° E`}
                </span>
              </div>
            </div>
          </section>

          {/* WEATHER ANALYTICS & DATA CARDS BENTO SECTION (RIGHT BELOW HERO) */}
          <div className="pointer-events-auto">
            <WeatherAnalyticsBento
              lang={lang}
              activeRegionId={selectedCoreRegion}
              onSelectRegion={handleSelectCoreRegion}
              liveTelemetry={liveTelemetry}
              telemetryLoading={telemetryLoading}
              telemetryError={telemetryError}
              selectionMode={selectionMode}
              onRetryTelemetry={handleRetryTelemetry}
              onNavigate={(r) => onNavigate(r)}
            />
          </div>

          {/* WEEKLY FORECAST & STUDY REGIONS SECTION (RIGHT BELOW ANALYTICS BENTO) */}
          <div className="pointer-events-auto">
            <WeeklyForecastStudySection
              lang={lang}
              activeRegionId={selectedCoreRegion}
              onSelectRegion={handleSelectCoreRegion}
              selectionMode={selectionMode}
              focusCoords={heroFocusCoord}
              focusLocationName={liveTelemetry?.location?.name}
              onNavigate={(r) => onNavigate(r)}
            />
          </div>

          {/* SCENE 2: THE CHALLENGE (Zoomed to Egypt & Nile Delta) */}
          <section
            id="challenge"
            className="min-h-screen max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-28 flex flex-col justify-center"
          >
            <div className="max-w-xl space-y-6 pointer-events-auto">
              <div className="climato-reveal space-y-3">
                <p className="text-xs font-mono text-[#00FF66] tracking-wide">
                  {isAr ? '02. الاقتراب من إفريقيا ومصر' : '02. Approaching Africa & Egypt · Orbital Transition'}
                </p>
                <h2 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-white leading-[1.14] text-balance">
                  {isAr
                    ? 'إقليم استراتيجي في مواجهة ضغوط مناخية متسارعة'
                    : 'A Concentrated Climate Frontier Demanding Orbital Precision'}
                </h2>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  {isAr
                    ? 'بين ساحل الدلتا المهدد بالملوحة وهبوط التربة، وضغوط المياه والزراعة، وموجات الحر الحضرية في القاهرة، تحتاج المؤسسات إلى قراءة جغرافية دقيقة قبل اتخاذ القرار.'
                    : 'With Egypt’s population, agriculture, and coastal infrastructure concentrated along the Nile and its Delta, physical climate shifts carry outsized economic impact.'}
                </p>
              </div>

              {/* Interactive Challenge Beats (solid obsidian translucent surface; zero backdrop-filter over WebGL) */}
              <div className="space-y-3">
                {egyptChallenges.map((item) => {
                  const active = activeBeaconId === item.beaconId;
                  return (
                    <button
                      key={item.index}
                      type="button"
                      onClick={() => setActiveBeaconId(item.beaconId)}
                      className={`w-full text-start rounded-xl p-5 border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#06140B]/94 border-[#22FF3A]/65'
                          : 'bg-[#030905]/88 border-emerald-950/90 hover:border-emerald-700'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-display text-base font-semibold text-white">
                          <span className="font-mono text-[#22FF3A] me-2">{item.index}.</span>
                          {item.title[lang]}
                        </h3>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                          {item.coords}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
                        {item.body[lang]}
                      </p>
                      <div className="mt-3 pt-2.5 border-t border-emerald-950/80 flex items-center justify-between text-xs">
                        <span className="text-slate-400">{item.sampleMetric.label[lang]}</span>
                        <span className="font-mono font-semibold text-[#22FF3A] tabular-nums">
                          {item.sampleMetric.value}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-slate-400">
                {isAr
                  ? 'انقر على أي تحدٍ لتركيز الكاميرا المدارية على نطاقه في مصر (قيم توضيحية).'
                  : 'Select any risk corridor to lock the orbital camera onto its Egyptian coordinates (illustrative baseline values).'}
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SCENE 3: THE DATA — SPLIT-APERTURE CURTAIN & SATELLITE IMAGERY        */}
      {/* ===================================================================== */}
      <section
        id="data"
        ref={dataSectionRef}
        className="relative min-h-screen py-24 lg:py-32 border-t border-emerald-950/80 bg-[#030704] space-grid-bg flex items-center overflow-hidden"
      >
        {/* Video-inspired Split-Aperture Curtains sliding open on scroll */}
        <div
          ref={shutterLeftRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[#020403] border-r border-[#22FF3A]/35 z-20"
        />
        <div
          ref={shutterRightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[#020403] border-l border-[#22FF3A]/35 z-20"
        />
        <div
          ref={apertureRingRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 rounded-2xl border-2 border-[#22FF3A] bg-[#22FF3A]/10 z-30"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full space-y-12 relative z-10">
          <div className="climato-reveal flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <p className="text-xs font-mono text-[#22FF3A] tracking-wide">
                {isAr ? '03. التكبير نحو دلتا النيل وكشف الطبقات البيئية' : '03. Nile Delta Zoom & Geographic / Environmental Layers'}
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white text-balance">
                {isAr
                  ? 'طبقات رصد فضائية متعددة الأطياف فوق دلتا النيل والقاهرة والصعيد'
                  : 'Zooming Into the Nile Delta · Spectral & Environmental Observation Layers'}
              </h2>
            </div>

            {/* Interactive Layer Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#050C07] border border-emerald-950">
              {SPECTRAL_LAYERS.map((layer, idx) => (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setActiveLayerIdx(idx)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeLayerIdx === idx
                      ? 'bg-[#22FF3A] text-[#020503] font-bold'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {layer.index}. {layer.title[lang]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Cinematic Satellite Imagery Frame with GSAP Parallax */}
            <div className="lg:col-span-7 rounded-2xl overflow-hidden border border-[#22FF3A]/25 bg-[#040B06] relative min-h-[340px] sm:min-h-[440px] flex flex-col justify-end">
              <div ref={dataParallaxRef} className="absolute inset-0 scale-105">
                <img
                  src={activeLayer.imagePath}
                  alt={activeLayer.title[lang]}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#020403] via-[#020403]/45 to-transparent" />

              <div className="relative z-10 p-6 sm:p-8 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#22FF3A]">
                  <span>{activeLayer.subtitle[lang]}</span>
                  <span className="tabular-nums">{activeLayer.coords}</span>
                </div>
                <h3 className="font-display text-2xl font-bold text-white">
                  {activeLayer.title[lang]}
                </h3>
                <p className="text-sm text-slate-200 max-w-2xl leading-relaxed">
                  {activeLayer.description[lang]}
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3 text-xs font-mono text-emerald-300">
                  <span>{activeLayer.sensors.join(' · ')}</span>
                  <span aria-hidden="true" className="text-slate-600">/</span>
                  <span className="text-amber-300">
                    {isAr ? 'أصل بصري توضيحي' : 'Illustrative Visual Asset'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Environmental Curve Visualization + Staged Sensor List */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-6">
              <div className="glass-surface-blur rounded-2xl p-6 space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono text-slate-400">
                      {isAr ? 'مؤشر طبقة العينة النموذجية' : 'Sample Layer Trajectory'}
                    </div>
                    <h4 className="font-display text-lg font-semibold text-white mt-0.5">
                      {activeLayer.seriesLabel[lang]}
                    </h4>
                  </div>
                  <span className="font-mono text-xs text-amber-300 whitespace-nowrap">
                    {isAr ? 'بيانات نموذجية' : 'SAMPLE DATA'}
                  </span>
                </div>

                {/* Clean SVG Layer Comparison Chart */}
                {(() => {
                  const pts = activeLayer.points;
                  const all = pts.flatMap((p) => [p.sample, p.baseline]);
                  const minV = Math.min(...all) * 0.85;
                  const maxV = Math.max(...all) * 1.12 || 1;
                  const w = 420;
                  const h = 170;
                  const padX = 36;
                  const padY = 22;
                  const xAt = (i: number) => padX + (i / (pts.length - 1)) * (w - padX * 2);
                  const yAt = (v: number) =>
                    padY + (1 - (v - minV) / (maxV - minV || 1)) * (h - padY * 2);

                  const samplePath = pts
                    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.sample).toFixed(1)}`)
                    .join(' ');
                  const basePath = pts
                    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.baseline).toFixed(1)}`)
                    .join(' ');

                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44 overflow-visible" role="img" aria-label={activeLayer.title[lang]}>
                      {[0, 0.5, 1].map((t) => {
                        const y = padY + t * (h - padY * 2);
                        return (
                          <line
                            key={t}
                            x1={padX}
                            y1={y}
                            x2={w - padX}
                            y2={y}
                            stroke="rgba(34,255,58,0.12)"
                            strokeWidth="1"
                          />
                        );
                      })}
                      <path
                        d={basePath}
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="1.75"
                        strokeDasharray="5 4"
                      />
                      <path
                        d={samplePath}
                        fill="none"
                        stroke="#22FF3A"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      {pts.map((p, i) => (
                        <g key={p.label}>
                          <circle
                            cx={xAt(i)}
                            cy={yAt(p.sample)}
                            r="4.5"
                            fill="#020403"
                            stroke="#22FF3A"
                            strokeWidth="2"
                          />
                          <text
                            x={xAt(i)}
                            y={h - 2}
                            textAnchor="middle"
                            className="fill-slate-400 text-[10px] font-mono"
                          >
                            {p.label}
                          </text>
                        </g>
                      ))}
                    </svg>
                  );
                })()}

                <div className="pt-3 border-t border-emerald-950/80 flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="text-slate-400">
                    {isAr ? 'أحدث قراءة نموذجية' : 'Latest Placeholder Point'}
                  </span>
                  <span className="text-[#22FF3A] font-semibold">
                    {activeLayer.points[activeLayer.points.length - 1].sample} {activeLayer.unit}
                  </span>
                </div>
              </div>

              {/* Staged 10-Sensor Connector Matrix */}
              <div className="glass-surface-blur rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#22FF3A]">
                    <Satellite className="w-4 h-4" />
                    <span>
                      {isAr ? '10 موصلات أقمار صناعية مهيأة للتكامل' : '10 Staged Satellite Connectors'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('api')}
                    className="text-xs font-medium text-emerald-300 hover:text-[#22FF3A] cursor-pointer whitespace-nowrap"
                  >
                    {isAr ? 'بوابة المطورين ←' : 'API Specs →'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {(connectors.length > 0
                    ? connectors.slice(0, 6)
                    : [
                        { id: 'sentinel-6', source_name: 'Sentinel-6', spatial_resolution: '300 m altimetry' },
                        { id: 'modis', source_name: 'MODIS Terra/Aqua', spatial_resolution: '250 m – 1 km' },
                        { id: 'landsat', source_name: 'Landsat 8 & 9', spatial_resolution: '30 m optical' },
                        { id: 'smap', source_name: 'SMAP L-Band', spatial_resolution: '3–9 km moisture' },
                        { id: 'ecostress', source_name: 'ECOSTRESS ISS', spatial_resolution: '70 m thermal' },
                        { id: 'tropomi', source_name: 'Sentinel-5P TROPOMI', spatial_resolution: '3.5 × 5.5 km' },
                      ]
                  ).map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-emerald-950/90 bg-[#040B06] px-3 py-2 flex flex-col justify-between"
                    >
                      <span className="font-medium text-white truncate">{c.source_name}</span>
                      <span className="font-mono text-[11px] text-slate-400 truncate">
                        {c.spatial_resolution}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SCENE 4: THREE EGYPTIAN STUDY REGIONS (ANIMATED MAP TRANSITIONS)      */}
      {/* ===================================================================== */}
      <section
        id="study-regions"
        className="py-24 lg:py-28 border-t border-emerald-950/80 bg-[#020503] flex items-center"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full space-y-10">
          <div className="climato-reveal flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <p className="text-xs font-mono text-[#00FF66] tracking-wide">
                {isAr ? '04. مناطق الدراسة المصرية الثلاث' : '04. Three Configurable Study Areas Across Egypt'}
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white text-balance">
                {isAr
                  ? 'مقارنة مكانية بين شمال الدلتا والقاهرة الكبرى والصعيد'
                  : 'Northern Nile Delta, Greater Cairo & Upper Egypt Agricultural Corridor'}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('detective')}
              className="px-4 py-2.5 rounded-lg border border-[#22FF3A]/45 bg-[#22FF3A]/10 text-[#22FF3A] text-xs font-semibold hover:bg-[#22FF3A]/20 transition-colors inline-flex items-center gap-2 self-start cursor-pointer"
            >
              <MapPin className="w-4 h-4" />
              <span>{isAr ? 'تخصيص الإحداثيات في المحقق العلمي' : 'Configure Bounds in Trend Detective'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Animated Egypt Corridor Map */}
            <div className="lg:col-span-5 glass-panel rounded-2xl p-5">
              <svg viewBox="0 0 360 320" className="w-full h-72 rounded-xl bg-[#020604] border border-emerald-950" role="img" aria-label="Egypt 3 Study Regions Transition Map">
                <polygon
                  points="35,28 158,34 196,24 236,36 276,34 294,75 266,120 315,212 336,282 32,282"
                  fill="rgba(16,185,129,0.06)"
                  stroke="rgba(34,255,58,0.3)"
                  strokeWidth="1.2"
                />
                <path d="M 190 278 L 222 232 L 218 190 L 185 150 L 176 112 L 190 76" fill="none" stroke="#10B981" strokeWidth="2.5" />
                <path d="M 164 42 L 190 76 L 214 40" fill="none" stroke="#22FF3A" strokeWidth="2" />

                {studyRegionsStory.map((reg, idx) => {
                  const active = idx === activeStudyRegionIdx;
                  const boxCoords =
                    idx === 0
                      ? { x: 150, y: 34, w: 68, h: 30, cx: 184, cy: 49 }
                      : idx === 1
                      ? { x: 176, y: 74, w: 28, h: 24, cx: 190, cy: 86 }
                      : { x: 168, y: 126, w: 30, h: 42, cx: 183, cy: 147 };
                  return (
                    <g
                      key={reg.id}
                      onClick={() => {
                        setActiveStudyRegionIdx(idx);
                        setActiveBeaconId(reg.id);
                      }}
                      className="cursor-pointer"
                    >
                      <rect
                        x={boxCoords.x}
                        y={boxCoords.y}
                        width={boxCoords.w}
                        height={boxCoords.h}
                        rx="3"
                        fill={active ? `${reg.color}38` : `${reg.color}16`}
                        stroke={reg.color}
                        strokeWidth={active ? 2.4 : 1.1}
                      />
                      <circle cx={boxCoords.cx} cy={boxCoords.cy} r={active ? 5 : 3} fill={reg.color} />
                      <text x={boxCoords.x + boxCoords.w + 8} y={boxCoords.cy + 4} className="fill-white text-[10px] font-mono">
                        {reg.title[lang]}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="lg:col-span-7 space-y-3">
              {studyRegionsStory.map((reg, idx) => {
                const active = idx === activeStudyRegionIdx;
                return (
                  <button
                    key={reg.id}
                    type="button"
                    onClick={() => {
                      setActiveStudyRegionIdx(idx);
                      setActiveBeaconId(reg.id);
                    }}
                    className={`w-full text-start rounded-2xl p-5 border transition-colors cursor-pointer space-y-2 ${
                      active
                        ? 'bg-[#071A0D] border-[#22FF3A]/60'
                        : 'bg-[#040B06] border-emerald-950 hover:border-emerald-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <span style={{ color: reg.color }}>{reg.code}</span>
                      <span className="text-slate-400 tabular-nums">{reg.coords}</span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-white">{reg.title[lang]}</h3>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{reg.rationale[lang]}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SCENE 5: FOUR NASA SATELLITE DATASETS AS SCIENTIFIC VISUAL LAYERS     */}
      {/* ===================================================================== */}
      <section
        id="nasa-datasets"
        className="py-24 lg:py-28 border-t border-emerald-950/80 bg-[#030704] space-grid-bg flex items-center"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full space-y-10">
          <div className="climato-reveal space-y-3 max-w-3xl">
            <p className="text-xs font-mono text-[#22FF3A] tracking-wide">
              {isAr ? '05. مجموعات البيانات المدارية الأربع (NASA)' : '05. Primary NASA Earth Observation Datasets'}
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white text-balance">
              {isAr
                ? 'MERRA-2 و GPM IMERG و GLDAS و GRACE-FO مع الحفاظ على الدقة الفيزيائية'
                : 'MERRA-2, GPM IMERG, GLDAS & GRACE-FO — Native Resolution Preserved'}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {isAr
                ? 'يستعلم كل مسار عن فهرس NASA CMR الفعلي ويحترم حدود الدقة المكانية لكل مستشعر دون اختلاق قياسات غير موثقة.'
                : 'Each layer maps directly to its official NASA product ID, unit normalization rule, quality flags, and spatial footprint bounds without substituting coarse products for parcel precision.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {nasaScientificLayers.map((ds) => (
              <div
                key={ds.id}
                className="glass-panel rounded-2xl p-5 flex flex-col justify-between gap-4 border-emerald-950 hover:border-[#00FF66]/55 transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span style={{ color: ds.color }} className="font-bold">
                      {ds.id.toUpperCase()}
                    </span>
                    <span className="text-slate-400">{ds.unit}</span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">{ds.variable[lang]}</h3>
                  <div className="text-xs font-mono text-emerald-300">{ds.product}</div>
                  <p className="text-xs text-slate-300 leading-relaxed">{ds.note[lang]}</p>
                </div>

                <div className="pt-3 border-t border-emerald-950/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>{ds.resolution}</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('detective')}
                    className="text-[#22FF3A] hover:underline cursor-pointer"
                  >
                    {isAr ? 'معاينة ←' : 'Inspect →'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SCENE 4: THE SOLUTIONS — VIDEO-INSPIRED MONUMENTAL ORBITAL SHOWCASE   */}
      {/* ===================================================================== */}
      <section
        id="solutions"
        ref={solutionsSectionRef}
        className="min-h-screen py-24 lg:py-32 border-t border-emerald-950/80 bg-[#020503] flex items-center"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full space-y-12">
          {/* Monumental Sticky Split Header + Rising Orbital Emblem (Video 00:08–00:09 choreography) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 flex justify-center">
              <div
                ref={monumentalGlobeRef}
                className="relative w-72 h-72 sm:w-80 sm:h-80 rounded-full border border-[#22FF3A]/40 bg-radial from-[#22FF3A]/15 via-[#041409] to-[#020403] flex items-center justify-center p-6"
              >
                <svg viewBox="0 0 240 240" className="w-full h-full" aria-hidden="true">
                  <circle cx="120" cy="120" r="106" stroke="#10B981" strokeWidth="1" strokeDasharray="4 6" strokeOpacity="0.45" fill="none" />
                  <circle cx="120" cy="120" r="86" stroke="#22FF3A" strokeWidth="3.2" strokeOpacity="0.92" fill="rgba(34,255,58,0.04)" />
                  <path d="M 120 34 A 86 86 0 0 1 196 160 L 120 120 Z" fill="rgba(34,255,58,0.12)" />
                  <path d="M 120 206 A 86 86 0 0 1 44 80 L 120 120 Z" fill="rgba(16,185,129,0.12)" />
                  <circle cx="120" cy="120" r="36" stroke="#22FF3A" strokeWidth="1.6" fill="#030D06" />
                  {/* Stylized Nile Delta inside core ring */}
                  <path d="M 120 144 L 120 116 L 106 96 M 120 116 L 134 96" stroke="#22FF3A" strokeWidth="2.8" strokeLinecap="round" fill="none" />
                  <circle cx="120" cy="116" r="3.5" fill="#22FF3A" />
                </svg>
                <div className="absolute bottom-5 text-center">
                  <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#22FF3A]">
                    CLIMATO CORE · 7 MODULES
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 climato-reveal space-y-4">
              <p className="text-xs font-mono text-[#22FF3A] tracking-wide">
                {isAr ? '04. منظومة الحلول السبع' : '04. The Solutions · Seven Core Intelligence Modules'}
              </p>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-white leading-[1.12] text-balance">
                {isAr
                  ? 'حلول جيومكانية متكاملة للمخاطر، الزراعة، المدن، والاستدامة'
                  : 'From Coastal Risk to ESG Disclosures — Seven Unified Modules'}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                {isAr
                  ? 'كل وحدة تحول القياسات المدارية والمعايرة الجغرافية إلى قرارات تشغيلية ومالية قابلة للتنفيذ عبر اثني عشر قطاعاً مصرياً وإقليمياً.'
                  : 'Each module translates multi-sensor orbital observations into calibrated risk indicators, compliance packs, and operational alerts tailored for Egypt and MENA.'}
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('modules')}
                  className="text-sm font-semibold text-[#22FF3A] hover:text-[#4DFF60] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <span>{isAr ? 'تفاصيل الوحدات السبع' : 'Explore Module Specifications'}</span>
                  <ArrowIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Asymmetric Editorial Grid of 7 Modules */}
          <div className="climato-solutions-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((mod, idx) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => onNavigate('dashboard', { moduleId: mod.id })}
                className={`climato-solution-card text-start glass-panel rounded-2xl p-6 hover:border-[#22FF3A]/55 transition-colors flex flex-col justify-between gap-5 cursor-pointer ${
                  idx === 0 ? 'lg:col-span-2 bg-gradient-to-br from-[#071A0D] to-[#030905]' : ''
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs text-[#22FF3A]">{mod.index}.</span>
                    <span className="font-mono text-[11px] text-slate-400 truncate">
                      {mod.satelliteSources.slice(0, 3).join(' · ')}
                    </span>
                  </div>

                  <h3 className="font-display text-xl font-bold text-white">
                    {mod.title[lang]}
                  </h3>

                  <p className="text-sm text-slate-300 leading-relaxed">
                    {mod.description[lang]}
                  </p>
                </div>

                <div className="pt-4 border-t border-emerald-950/80 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block">{mod.sampleHighlight.label[lang]}</span>
                    <span className="font-mono font-semibold text-[#22FF3A] tabular-nums">
                      {mod.sampleHighlight.value} {mod.sampleHighlight.unit}
                    </span>
                  </div>
                  <span className="font-medium text-emerald-300 inline-flex items-center gap-1 whitespace-nowrap">
                    <span>{isAr ? 'معاينة' : 'Inspect'}</span>
                    <ArrowIcon className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* 12 Sectors Compact Directory */}
          <div className="climato-reveal glass-panel rounded-2xl p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
                <Layers className="w-4 h-4 text-[#22FF3A]" />
                <span>
                  {isAr
                    ? 'مصممة لاثني عشر قطاعاً حيوياً في السوق المصري والإقليمي'
                    : 'Tailored Workflows Across 12 Egyptian & Regional Enterprise Sectors'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('sectors')}
                className="text-xs font-semibold text-[#22FF3A] hover:text-[#4DFF60] cursor-pointer whitespace-nowrap"
              >
                {isAr ? 'عرض دليل القطاعات ←' : 'Open Sector Guide →'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {SECTORS.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => onNavigate('sectors', { sectorId: sec.id })}
                  className="text-start rounded-lg border border-emerald-950/90 bg-[#040B06] px-3 py-2.5 text-xs font-medium text-slate-200 hover:border-[#22FF3A]/50 hover:text-[#22FF3A] transition-colors cursor-pointer truncate"
                >
                  {sec.title[lang]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SCENE 6: TIME-SERIES, TREND COMPARISONS & INTERACTIVE PLATFORM        */}
      {/* ===================================================================== */}
      <section
        id="platform"
        className="min-h-screen py-24 lg:py-32 border-t border-emerald-950/80 bg-[#030704] flex items-center"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full space-y-10">
          <div className="climato-reveal flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <p className="text-xs font-mono text-[#00FF66] tracking-wide">
                {isAr ? '06. السلاسل الزمنية ومقارنة الاتجاهات ومنصة التشغيل' : '06. Animated Time-Series, Trend Comparisons & Command Platform'}
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white text-balance">
                {isAr
                  ? 'لوحة تحكم مؤسسية داكنة ومحرك تحليل الإحداثيات الفوري'
                  : 'Time-Series Comparisons, Risk Radar & Live Coordinate Engine'}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('dashboard', { aoiId: currentPreviewAoi?.id, moduleId: previewModuleId })}
              className="px-5 py-3 rounded-lg bg-[#22FF3A] text-[#020503] text-sm font-bold hover:bg-[#4DFF60] transition-colors inline-flex items-center gap-2 whitespace-nowrap self-start lg:self-auto cursor-pointer"
            >
              <span>{isAr ? 'تشغيل لوحة التحكم الكاملة' : 'Launch Full Interactive Dashboard'}</span>
              <ArrowIcon className="w-4 h-4" />
            </button>
          </div>

          <SampleDataBanner lang={lang} />

          {/* Sophisticated Dark SaaS Glass Preview Frame */}
          <div className="climato-reveal glass-surface-blur rounded-2xl p-5 sm:p-8 space-y-6">
            {/* Preview Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-emerald-950/80">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Globe2 className="w-4 h-4 text-[#22FF3A]" />
                  <span>{isAr ? 'نطاق المراقبة في مصر:' : 'Egypt Sample AOI:'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {previewAois.map((aoi) => (
                    <button
                      key={aoi.id}
                      type="button"
                      onClick={() => {
                        setPreviewAoiId(aoi.id);
                        setPreviewModuleId(aoi.primary_module);
                        setProbeLat(String(aoi.lat));
                        setProbeLon(String(aoi.lon));
                        runCoordinateAnalysis(aoi.lat, aoi.lon);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        currentPreviewAoi?.id === aoi.id
                          ? 'bg-[#22FF3A]/20 text-[#22FF3A] border border-[#22FF3A]/50'
                          : 'bg-[#040B06] text-slate-300 border border-emerald-950 hover:text-white'
                      }`}
                    >
                      {isAr ? aoi.name_ar : aoi.name_en}
                    </button>
                  ))}
                </div>
              </div>

              <select
                aria-label={isAr ? 'اختر الوحدة للعرض' : 'Select preview module'}
                value={previewModuleId}
                onChange={(e) => setPreviewModuleId(e.target.value as ModuleId)}
                className="bg-[#040B06] border border-emerald-900 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#22FF3A]"
              >
                {MODULES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.index}. {m.shortTitle[lang]}
                  </option>
                ))}
              </select>
            </div>

            {/* 4 Tabular KPI Summary Cells */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-emerald-950 bg-[#040B06]/90 p-4 space-y-1">
                <div className="text-xs text-slate-400">{isAr ? 'الإحداثيات' : 'Target Coordinate'}</div>
                <div className="font-mono text-sm sm:text-base font-semibold text-[#22FF3A] tabular-nums">
                  {currentPreviewAoi
                    ? `${currentPreviewAoi.lat.toFixed(3)}°N, ${currentPreviewAoi.lon.toFixed(3)}°E`
                    : '31.404°N, 30.416°E'}
                </div>
                <div className="text-[11px] text-slate-500">{isAr ? 'عينة توضيحية' : 'Sample AOI'}</div>
              </div>

              <div className="rounded-xl border border-emerald-950 bg-[#040B06]/90 p-4 space-y-1">
                <div className="text-xs text-slate-400">{isAr ? 'القراءة النموذجية' : 'Sample Reading'}</div>
                <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
                  {latestPreviewPoint.metric_value}{' '}
                  <span className="text-xs text-slate-400 font-normal">{latestPreviewPoint.unit}</span>
                </div>
                <div className="text-[11px] font-mono text-amber-300">SAMPLE_PLACEHOLDER</div>
              </div>

              <div className="rounded-xl border border-emerald-950 bg-[#040B06]/90 p-4 space-y-1">
                <div className="text-xs text-slate-400">{isAr ? 'الانحراف عن الأساس' : 'Baseline Delta'}</div>
                <div className="font-mono text-xl sm:text-2xl font-bold text-emerald-300 tabular-nums">
                  {latestPreviewPoint.anomaly_delta > 0
                    ? `+${latestPreviewPoint.anomaly_delta}`
                    : latestPreviewPoint.anomaly_delta}{' '}
                  <span className="text-xs text-slate-400 font-normal">{latestPreviewPoint.unit}</span>
                </div>
                <div className="text-[11px] text-slate-400">{latestPreviewPoint.period_label}</div>
              </div>

              <div className="rounded-xl border border-emerald-950 bg-[#040B06]/90 p-4 space-y-1">
                <div className="text-xs text-slate-400">{isAr ? 'المستشعر المرجعي' : 'Staged Sensor'}</div>
                <div className="text-sm font-semibold text-white truncate">
                  {latestPreviewPoint.source_name}
                </div>
                <div className="text-[11px] text-slate-400">
                  {isAr ? 'موصل جاهز للربط' : 'Connector Staged'}
                </div>
              </div>
            </div>

            {/* Interactive Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                <TimeSeriesChart
                  lang={lang}
                  observations={finalChartObs}
                  title={
                    isAr
                      ? 'الاتجاه الزمني الفصلي (بيانات نموذجية توضيحية)'
                      : 'Quarterly Sample Trajectory (Placeholder Demonstration)'
                  }
                />
              </div>
              <div className="lg:col-span-4">
                <ModuleExposureRadar lang={lang} selectedModuleId={previewModuleId} />
              </div>
            </div>

            {/* Interactive Coordinate Risk Engine Widget (Powered by POST /api/climate/analyze) */}
            <div className="rounded-xl border border-[#22FF3A]/25 bg-[#030A05] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Crosshair className="w-4 h-4 text-[#22FF3A]" />
                  <span>
                    {isAr
                      ? 'محرك تقييم المخاطر الفوري حسب الإحداثيات (POST /api/climate/analyze)'
                      : 'Backend Coordinate Risk Analyzer (POST /api/climate/analyze)'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    step="0.001"
                    value={probeLat}
                    onChange={(e) => setProbeLat(e.target.value)}
                    aria-label="Latitude"
                    className="w-24 bg-[#020403] border border-emerald-900 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#22FF3A]"
                  />
                  <input
                    type="number"
                    step="0.001"
                    value={probeLon}
                    onChange={(e) => setProbeLon(e.target.value)}
                    aria-label="Longitude"
                    className="w-24 bg-[#020403] border border-emerald-900 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#22FF3A]"
                  />
                  <button
                    type="button"
                    onClick={() => runCoordinateAnalysis()}
                    disabled={analyzing}
                    className="px-3.5 py-1.5 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] disabled:opacity-60 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>{analyzing ? (isAr ? 'جارٍ التحليل...' : 'Analyzing...') : isAr ? 'تحليل الإحداثي' : 'Analyze Coordinate'}</span>
                  </button>
                </div>
              </div>

              {analyzeResult && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-emerald-950/80 text-xs">
                  <div className="rounded-lg bg-[#050F08] border border-emerald-950 p-3">
                    <div className="text-slate-400">{isAr ? 'النطاق الجغرافي' : 'Corridor Classification'}</div>
                    <div className="font-semibold text-white mt-0.5">
                      {isAr ? analyzeResult.regionClassification.labelAr : analyzeResult.regionClassification.labelEn}
                    </div>
                    <div className="font-mono text-[11px] text-[#22FF3A] mt-0.5">
                      {analyzeResult.regionClassification.corridorCode}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#050F08] border border-emerald-950 p-3">
                    <div className="text-slate-400">{isAr ? 'مؤشر المخاطر المركب' : 'Composite Sample Score'}</div>
                    <div className="font-mono text-lg font-bold text-[#22FF3A] mt-0.5 tabular-nums">
                      {analyzeResult.compositeRiskScore}/100 · {analyzeResult.riskTier}
                    </div>
                    <div className="font-mono text-[10px] text-amber-300">
                      {analyzeResult.dataProvenance}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#050F08] border border-emerald-950 p-3">
                    <div className="text-slate-400">{isAr ? 'أقرب موقع مسجل (Haversine)' : 'Nearest AOI (Haversine)'}</div>
                    <div className="font-semibold text-white mt-0.5 truncate">
                      {analyzeResult.nearestRegisteredAoi
                        ? isAr
                          ? analyzeResult.nearestRegisteredAoi.nameAr
                          : analyzeResult.nearestRegisteredAoi.nameEn
                        : '—'}
                    </div>
                    <div className="font-mono text-[11px] text-emerald-300 tabular-nums mt-0.5">
                      {analyzeResult.nearestRegisteredAoi
                        ? `${analyzeResult.nearestRegisteredAoi.distanceKm} km`
                        : '—'}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#050F08] border border-emerald-950 p-3">
                    <div className="text-slate-400">{isAr ? 'القراءات الفيزيائية النموذجية' : 'Sample Hazard Signals'}</div>
                    <div className="font-mono text-[11px] text-slate-200 mt-1 space-y-0.5 tabular-nums">
                      <div>
                        Coastal: {analyzeResult.indices.coastalExposure.anomalyMm} mm · Heat: +{analyzeResult.indices.urbanHeatDelta.deltaC}°C
                      </div>
                      <div>
                        NDVI: {analyzeResult.indices.agroMoistureStress.ndviProxy} · AOD: {analyzeResult.indices.dustAerosolTier.aodProxy}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SCENE 7: SCIENTIFIC FINDINGS, UNCERTAINTY & STATISTICAL EVIDENCE      */}
      {/* ===================================================================== */}
      <section
        id="scientific-evidence"
        className="py-24 lg:py-28 border-t border-emerald-950/80 bg-[#020503] flex items-center"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full space-y-10">
          <div className="climato-reveal flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <p className="text-xs font-mono text-[#22FF3A] tracking-wide">
                {isAr ? '07. الأدلة الإحصائية وعدم اليقين والشفافية البحثية' : '07. Scientific Findings, Uncertainty & Statistical Discipline'}
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white text-balance">
                {isAr
                  ? 'اختبار مان-كيندال، ميل ثيل-سين، ورفض الدلالة عند نقص البيانات'
                  : 'Mann-Kendall, Theil-Sen 95% CIs & Strict Insufficient-Data Guards'}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                {isAr
                  ? 'لا يعلن المحرك الإحصائي أي اتجاه معنوي عندما يقل عدد العينات عن 10 أو تهبط التغطية عن 70%، ويطبق تصحيح حامد-راو للارتباط الذاتي.'
                  : 'Every regional trend reports exact two-sided p-values, Hamed-Rao lag-1 autocorrelation adjustments, seasonal DJF/MAM/JJA/SON slopes, and explicitly suppresses significance whenever sample size or coverage falls short.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('detective')}
                className="px-5 py-2.5 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] inline-flex items-center gap-2 cursor-pointer"
              >
                <FlaskConical className="w-4 h-4" />
                <span>{isAr ? 'فتح المختبر الإحصائي' : 'Open Statistical Workbench'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('research')}
                className="px-5 py-2.5 rounded-lg border border-[#00FF66]/40 bg-[#00FF66]/10 text-emerald-200 text-xs font-semibold hover:border-[#00FF66] inline-flex items-center gap-2 cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>{isAr ? 'استعراض الـ 12 مرجعاً' : 'Explore 12 Research Sources'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="glass-panel rounded-2xl p-6 space-y-2.5">
              <div className="font-mono text-xs text-[#22FF3A]">01 · NON-PARAMETRIC RIGOR</div>
              <h3 className="font-display text-lg font-bold text-white">
                {isAr ? 'مان-كيندال + ميل ثيل-سين' : 'Mann-Kendall + Theil-Sen Estimator'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {isAr
                  ? 'مقاوم للقيم الشاذة والبيانات غير الطبيعية مثل هطول الأمطار المتقطع في الصعيد وشمال الدلتا، مع حساب حدود الثقة 95%.'
                  : 'Outlier-resistant rank trend testing paired with median pairwise annual slopes (/yr & /decade) and non-parametric 95% confidence bounds.'}
              </p>
            </div>

            <div className="glass-panel rounded-2xl p-6 space-y-2.5">
              <div className="font-mono text-xs text-emerald-300">02 · AUTOCORRELATION & GAPS</div>
              <h3 className="font-display text-lg font-bold text-white">
                {isAr ? 'فحص الارتباط الذاتي والفجوات' : 'Lag-1 ACF & Inter-Mission Gaps'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {isAr
                  ? 'يرصد فجوة GRACE/GRACE-FO (2017–2018) ويبلغ عن معامل Lag-1 ACF وحجم العينة الفعلي لتفادي تضخيم الدلالة.'
                  : 'Preserves real gaps (including GRACE/GRACE-FO 2017–2018) without synthetic fill and displays lag-1 ACF ρ₁ + Hamed-Rao modified variance.'}
              </p>
            </div>

            <div className="glass-panel rounded-2xl p-6 space-y-2.5 border-amber-500/30">
              <div className="font-mono text-xs text-amber-300 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>03 · SCALE & AUTH HONESTY</span>
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                {isAr ? 'لا ادعاءات دقة أو اتصال وهمي' : 'Explicit Scale Limits & Pending Auth'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {isAr
                  ? 'لا يتم تعليم أي مصدر كـ "متصل" قبل اختباره حياً، ولا يُفترض أن GRACE-FO (~300 كم) يقدم قياسات على مستوى المزارع.'
                  : 'Never claims parcel-level water precision from ~300 km GRACE-FO mascons and never marks NASA/NOAA operational feeds connected without real credentials.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SCENE 8: BUSINESS — MODULES, API, PAID REPORTS & CUSTOMER DASHBOARD   */}
      {/* ===================================================================== */}
      <section
        id="business"
        ref={blueprintSectionRef}
        className="relative min-h-screen py-24 lg:py-32 border-t border-emerald-950/80 bg-[#020403] flex items-center overflow-hidden"
      >
        {/* Video-inspired Architectural Drafting Blueprint Grid Reveal */}
        <div
          ref={blueprintGridRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 blueprint-grid-bg"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full space-y-14 relative z-10">
          <div className="climato-reveal space-y-3 max-w-2xl">
            <p className="text-xs font-mono text-[#22FF3A] tracking-wide">
              {isAr ? '08. وحدات الأعمال وواجهة API والتقارير ولوحة العملاء' : '08. Business · Modules, API, Paid Reports & Customer Dashboard'}
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white text-balance">
              {isAr
                ? 'ثلاثة مسارات مرنة للشركات والمؤسسات والجهات السيادية في مصر'
                : 'Enterprise Subscriptions, Paid Reports & Programmatic API Access'}
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              {isAr
                ? 'ابدأ بنطاق استكشافي أو فعّل اشتراكاً قطاعياً سنوياً أو اطلب تقارير امتثال مخصصة وواجهة برمجة تطبيقات.'
                : 'Deploy CLIMATO across your portfolio with transparent B2B tiers, commissioned disclosure packs, or metered coordinate APIs.'}
            </p>
          </div>

          {/* 3 Commercial Pillars */}
          <div className="climato-reveal grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="glass-panel rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <span className="font-mono text-xs text-[#22FF3A]">01.</span>
                <h3 className="font-display text-xl font-bold text-white">
                  {isAr ? 'اشتراكات المؤسسات والقطاعات' : 'Enterprise Subscriptions'}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {isAr
                    ? 'مساحات عمل مخصصة لمحافظ العقار والبنوك والزراعة والهيئات الحكومية مع مراقبة 25 إلى 100+ موقع مخصص.'
                    : 'Dedicated bilingual workspaces for banks, agribusinesses, developers, and ministries covering 25 to 100+ custom polygons.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('pricing')}
                className="text-xs font-semibold text-[#22FF3A] hover:text-[#4DFF60] inline-flex items-center gap-1.5 cursor-pointer self-start"
              >
                <span>{isAr ? 'مقارنة باقات الأعمال' : 'Compare B2B Tiers'}</span>
                <ArrowIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="glass-panel rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <span className="font-mono text-xs text-emerald-400">02.</span>
                <h3 className="font-display text-xl font-bold text-white">
                  {isAr ? 'التقارير المناخية و ESG المدفوعة' : 'Paid Climate & ESG Reports'}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {isAr
                    ? 'إصدار تقارير إفصاح مخصصة متوافقة مع ISSB IFRS S2 و CSRD و TCFD لعمليات الاستحواذ والتقييم الائتماني والتصدير.'
                    : 'Commission audit-ready ISSB IFRS S2, CSRD, and TCFD physical climate risk dossiers for acquisitions, credit reviews, and exports.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="text-xs font-semibold text-emerald-300 hover:text-[#22FF3A] inline-flex items-center gap-1.5 cursor-pointer self-start"
              >
                <span>{isAr ? 'إعداد تقرير مخصص' : 'Open Report Studio'}</span>
                <ArrowIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="glass-panel rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <span className="font-mono text-xs text-[#22FF3A]">03.</span>
                <h3 className="font-display text-xl font-bold text-white">
                  {isAr ? 'وصول واجهة البرمجة API والتنبيهات' : 'API Access & Trend Webhooks'}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {isAr
                    ? 'اربط أنظمتك الداخلية بنقاط REST قياسية ومراقبة عتبات الإحداثيات الجغرافية مع توقيع HMAC-SHA256.'
                    : 'Integrate standardized coordinate risk indices and HMAC-SHA256 signed geofence threshold webhooks into underwriting and ERP systems.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('api')}
                className="text-xs font-semibold text-[#22FF3A] hover:text-[#4DFF60] inline-flex items-center gap-1.5 cursor-pointer self-start"
              >
                <span>{isAr ? 'استكشاف بوابة المطورين' : 'Inspect Developer API'}</span>
                <ArrowIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Integrated Request-a-Demo CTA Block */}
          <div
            id="business-demo"
            className="climato-reveal glass-panel-elevated rounded-2xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-mono text-[#22FF3A]">
                {isAr ? 'ابدأ مع كليماتو' : 'Partner With CLIMATO'}
              </p>
              <h3 className="font-display text-2xl sm:text-3xl font-bold text-white text-balance">
                {isAr
                  ? 'اطلب عرضاً مؤسسياً مخصصاً لمحفظتك في مصر'
                  : 'Request a Tailored Demonstration for Your Egyptian Portfolio'}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                {isAr
                  ? 'شاركنا نطاق الأصول أو المحافظ الزراعية أو الساحلية المستهدفة وسيقوم فريقنا بتجهيز جلسة عرض تفاعلية.'
                  : 'Share your organization and priority domain. We will configure an interactive walkthrough covering your target governorates, basins, or coastal assets.'}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('contact')}
                  className="text-xs font-medium text-slate-300 hover:text-[#22FF3A] underline underline-offset-4 cursor-pointer"
                >
                  {isAr ? 'أو افتح نموذج تحديد النطاق التفصيلي' : 'Or open the full multi-module scoping form'}
                </button>
              </div>
            </div>

            <div className="lg:col-span-7">
              {demoReceipt ? (
                <div className="rounded-xl border border-[#22FF3A]/40 bg-[#040B06] p-6 space-y-3">
                  <div className="flex items-center gap-2.5 text-[#22FF3A]">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-display text-lg font-bold text-white">
                      {isAr ? 'تم تسجيل طلب العرض بنجاح' : 'Demo Request Recorded'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300">
                    {isAr ? 'الرقم المرجعي:' : 'Reference ID:'}{' '}
                    <strong className="font-mono text-[#22FF3A]">{demoReceipt}</strong>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDemoReceipt(null);
                      setDemoName('');
                      setDemoEmail('');
                      setDemoOrg('');
                    }}
                    className="px-4 py-2 rounded-lg border border-emerald-900 text-xs text-slate-200 hover:border-[#22FF3A]/50 cursor-pointer"
                  >
                    {isAr ? 'إرسال طلب آخر' : 'Submit Another Inquiry'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleQuickDemoSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        {isAr ? 'الاسم الكامل *' : 'Full Name *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={demoName}
                        onChange={(e) => setDemoName(e.target.value)}
                        placeholder={isAr ? 'م. أحمد منصور' : 'Ahmed Mansour'}
                        className="w-full bg-[#020503] border border-emerald-900 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#22FF3A]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        {isAr ? 'البريد الإلكتروني للعمل *' : 'Work Email *'}
                      </label>
                      <input
                        type="email"
                        required
                        value={demoEmail}
                        onChange={(e) => setDemoEmail(e.target.value)}
                        placeholder="name@organization.eg"
                        className="w-full bg-[#020503] border border-emerald-900 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#22FF3A]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        {isAr ? 'المؤسسة / الشركة *' : 'Organization *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={demoOrg}
                        onChange={(e) => setDemoOrg(e.target.value)}
                        placeholder={isAr ? 'مجموعة دلتا العقارية' : 'Nile Delta Holdings'}
                        className="w-full bg-[#020503] border border-emerald-900 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#22FF3A]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        {isAr ? 'المسار التجاري' : 'Commercial Track'}
                      </label>
                      <select
                        value={demoInterest}
                        onChange={(e) => setDemoInterest(e.target.value)}
                        className="w-full bg-[#020503] border border-emerald-900 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#22FF3A]"
                      >
                        <option value="Enterprise & Sovereign">
                          {isAr ? 'اشتراك مؤسسي / سيادي' : 'Enterprise & Sovereign Subscription'}
                        </option>
                        <option value="Sector Pro">
                          {isAr ? 'الباقة القطاعية الاحترافية' : 'Sector Pro Subscription'}
                        </option>
                        <option value="Paid Custom Report">
                          {isAr ? 'تقرير مناخي / ESG مدفوع' : 'Paid Custom Climate / ESG Report'}
                        </option>
                        <option value="API Access Agreement">
                          {isAr ? 'اتفاقية وصول API' : 'Programmatic API Access'}
                        </option>
                      </select>
                    </div>
                  </div>

                  {demoError && (
                    <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
                      {demoError}
                    </div>
                  )}

                  <div className="pt-1 flex flex-wrap items-center justify-between gap-4">
                    <button
                      type="submit"
                      disabled={demoSubmitting}
                      className="px-6 py-3 rounded-lg bg-[#22FF3A] text-[#020503] text-sm font-bold hover:bg-[#4DFF60] disabled:opacity-60 transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <Send className="w-4 h-4" />
                      <span>
                        {demoSubmitting
                          ? isAr ? 'جارٍ الإرسال...' : 'Submitting...'
                          : UI_COPY.nav.requestDemo[lang]}
                      </span>
                    </button>

                    <span className="text-xs text-slate-400">
                      {isAr ? 'يتكامل مباشرة مع قاعدة بيانات المنصة' : 'Persists directly to platform demo queue'}
                    </span>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
