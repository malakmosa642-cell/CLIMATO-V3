export interface StudyRegionSpec {
  id: 'nile-delta-north' | 'greater-cairo' | 'upper-egypt-agro';
  nameEn: string;
  nameAr: string;
  classificationEn: string;
  classificationAr: string;
  centerLat: number;
  centerLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  approxAreaKm2: number;
  selectionRationaleEn: string;
  selectionRationaleAr: string;
  primaryClimateStressorsEn: string;
  primaryClimateStressorsAr: string;
  isDefault: boolean;
}

export interface ScientificDatasetSpec {
  id: 'merra-2' | 'gpm-imerg' | 'gldas' | 'grace-fo';
  variableKey: 'air_temperature' | 'precipitation' | 'soil_moisture' | 'terrestrial_water_storage';
  variableNameEn: string;
  variableNameAr: string;
  datasetName: string;
  productId: string;
  productVersion: string;
  targetVariableField: string;
  agency: string;
  documentationUrl: string;
  cmrShortName: string;
  cmrCollectionConceptId: string;
  accessMethod: string;
  endpointTemplate: string;
  requiredEnvVar: string;
  temporalResolution: string;
  spatialResolution: string;
  nativeFootprintKm: number;
  nativeUnit: string;
  normalizedUnit: string;
  normalizationFormula: string;
  coveragePeriod: string;
  qualityFlags: string;
  licensing: string;
  scaleLimitationEn: string;
  scaleLimitationAr: string;
}

export type ResearchClassification =
  | 'Operational data source'
  | 'Data discovery or processing tool'
  | 'Research or methodology reference'
  | 'Supporting satellite mission or documentation';

export interface ResearchSourceSpec {
  id: string;
  titleEn: string;
  titleAr: string;
  url: string;
  organization: string;
  classification: ResearchClassification;
  descriptionEn: string;
  descriptionAr: string;
  relevanceEn: string;
  relevanceAr: string;
  initialStatus:
    | 'PENDING_CONFIGURATION'
    | 'DISCOVERY_PORTAL'
    | 'METHODOLOGY_REFERENCE'
    | 'SUPPORTING_MISSION';
  probeUrl: string;
}

export const DEFAULT_STUDY_REGIONS: StudyRegionSpec[] = [
  {
    id: 'nile-delta-north',
    nameEn: 'Northern Nile Delta (Coastal & Agro Belt)',
    nameAr: 'شمال دلتا النيل (النطاق الساحلي والزراعي)',
    classificationEn: 'Coastal / Irrigated Agricultural Delta',
    classificationAr: 'دلتا ساحلية وزراعية مروية',
    centerLat: 31.22,
    centerLon: 30.88,
    minLat: 30.72,
    maxLat: 31.58,
    minLon: 29.90,
    maxLon: 31.95,
    approxAreaKm2: 11800,
    selectionRationaleEn:
      'Encompasses Rosetta, Kafr El-Sheikh, Burullus, and Damietta along Egypt’s low-lying Mediterranean margin. Selected to evaluate coastal thermal moderation, winter Mediterranean precipitation variability, shallow agricultural soil moisture, and regional groundwater/salinity vulnerability.',
    selectionRationaleAr:
      'يشمل رشيد وكفر الشيخ والبرلس ودمياط على الحافة المتوسطية المنخفضة لمصر. تم اختياره لتقييم توازن الحرارة الساحلية وتذبذب أمطار الشتاء المتوسطية ورطوبة التربة الزراعية الضحلة وهشاشة المياه الجوفية وتملح الدلتا.',
    primaryClimateStressorsEn:
      'Coastal saltwater intrusion, evapotranspiration spikes, winter rainfall shifts, agricultural moisture stress',
    primaryClimateStressorsAr:
      'تداخل المياه المالحة، ذروات البخر-نتح، تغيرات أمطار الشتاء، إجهاد رطوبة التربة الزراعية',
    isDefault: true,
  },
  {
    id: 'greater-cairo',
    nameEn: 'Greater Cairo Metropolitan Basin',
    nameAr: 'حوض القاهرة الكبرى الحضري',
    classificationEn: 'Dense Urban & Industrial Corridor',
    classificationAr: 'ممر حضري وصناعي كثيف',
    centerLat: 30.044,
    centerLon: 31.235,
    minLat: 29.82,
    maxLat: 30.26,
    minLon: 31.02,
    maxLon: 31.52,
    approxAreaKm2: 1950,
    selectionRationaleEn:
      'Covers the Nile apex urban agglomeration across Cairo, Giza, and Qalyubia (~1,950 km²). Selected as Egypt’s primary urban heat benchmark where impervious surfaces, dense population, and arid surroundings amplify warming trends relative to rural Nile Delta and Upper Valley baselines.',
    selectionRationaleAr:
      'يغطي التكتل الحضري عند رأس الدلتا عبر القاهرة والجيزة والقليوبية (~1,950 كم²). تم اختياره كمرجع أساسي لجزر الحرارة الحضرية في مصر حيث تضخم الأسطح العمرانية والكثافة السكانية اتجاهات الاحترار مقارنة بالأرياف.',
    primaryClimateStressorsEn:
      'Nocturnal urban heat amplification, extreme heat days, impervious runoff flash floods, urban aerosol loading',
    primaryClimateStressorsAr:
      'تضخم الحرارة الحضرية الليلية، أيام الحر الشديد، السيول الخاطفة فوق الأسطح غير المنفذة، الأحمال الهوائية',
    isDefault: true,
  },
  {
    id: 'upper-egypt-agro',
    nameEn: 'Upper Egypt Agricultural Corridor (Minya–Assiut)',
    nameAr: 'الممر الزراعي بصعيد مصر (المنيا – أسيوط)',
    classificationEn: 'Hyper-Arid River Valley Agriculture',
    classificationAr: 'زراعة الوادي الجاف في الصعيد',
    centerLat: 27.72,
    centerLon: 30.82,
    minLat: 27.10,
    maxLat: 28.35,
    minLon: 30.55,
    maxLon: 31.08,
    approxAreaKm2: 4200,
    selectionRationaleEn:
      'Spans the irrigated Nile Valley floodplain across Minya and Assiut (~4,200 km²). Selected to isolate continental hyper-arid warming and summer heat extremes far from Mediterranean humidity, contrasting canal-irrigated soil moisture against broad basin water storage trends.',
    selectionRationaleAr:
      'يمتد عبر السهل الفيضي المروي لوادي النيل بين المنيا وأسيوط (~4,200 كم²). تم اختياره لعزل الاحترار القاري شديد الجفاف وموجات الحر الصيفية بعيداً عن تأثير البحر المتوسط ومقارنة رطوبة الري بالتخزين المائي الحوضي.',
    primaryClimateStressorsEn:
      'Continental summer heat extremes, high evaporative water demand, near-zero baseline rainfall, irrigation dependency',
    primaryClimateStressorsAr:
      'تطرفات الحر الصيفي القاري، الطلب التبخري المرتفع، ندرة الهطول المطري، الاعتماد الكامل على مياه الري',
    isDefault: true,
  },
];

export const SCIENTIFIC_DATASETS: ScientificDatasetSpec[] = [
  {
    id: 'merra-2',
    variableKey: 'air_temperature',
    variableNameEn: '2-Meter Air Temperature',
    variableNameAr: 'درجة حرارة الهواء على ارتفاع مترين',
    datasetName: 'NASA MERRA-2 Reanalysis (tavgM_2d_slv_Nx)',
    productId: 'M2TMNXSLV',
    productVersion: '5.12.4',
    targetVariableField: 'T2M',
    agency: 'NASA GMAO / GES DISC',
    documentationUrl: 'https://disc.gsfc.nasa.gov/datasets/M2TMNXSLV_5.12.4/summary',
    cmrShortName: 'M2TMNXSLV',
    cmrCollectionConceptId: 'C1276812863-GES_DISC',
    accessMethod: 'NASA Earthdata Login + GES DISC OPeNDAP / Subsetter / Giovanni',
    endpointTemplate:
      'https://goldsmr4.gesdisc.eosdis.nasa.gov/opendap/MERRA2_MONTHLY/M2TMNXSLV.5.12.4/',
    requiredEnvVar: 'NASA_EARTHDATA_TOKEN',
    temporalResolution: 'Monthly Mean (1980–Present)',
    spatialResolution: '0.5° lat × 0.625° lon (~55 km × 60 km)',
    nativeFootprintKm: 60,
    nativeUnit: 'K',
    normalizedUnit: '°C',
    normalizationFormula: 'T_celsius = T2M_kelvin - 273.15',
    coveragePeriod: '1980-01 to Present',
    qualityFlags: 'MERRA-2 assimilation quality & fill-value mask (1e+15)',
    licensing: 'NASA Earth Science Open Data Policy (Public Domain / CC0-equivalent)',
    scaleLimitationEn:
      'Coarse ~55×60 km grid cell mixes urban Cairo with surrounding desert; captures regional synoptic air temperature trends rather than street-level microclimates.',
    scaleLimitationAr:
      'تمزج الخلية الشبكية (~55×60 كم) النطاق الحضري للقاهرة بالصحراء المحيطة؛ لذا تعكس الاتجاهات الإقليمية لا المناخ المحلي على مستوى الشارع.',
  },
  {
    id: 'gpm-imerg',
    variableKey: 'precipitation',
    variableNameEn: 'Precipitation Rate / Monthly Accumulation',
    variableNameAr: 'معدل وتراكم الهطول المطري',
    datasetName: 'NASA GPM IMERG Final Precipitation L3',
    productId: 'GPM_3IMERGM',
    productVersion: '07',
    targetVariableField: 'precipitation',
    agency: 'NASA / JAXA / GES DISC',
    documentationUrl: 'https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGM_07/summary',
    cmrShortName: 'GPM_3IMERGM',
    cmrCollectionConceptId: 'C2723754864-GES_DISC',
    accessMethod: 'NASA Earthdata Login + GES DISC OPeNDAP / CMR / Giovanni',
    endpointTemplate:
      'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGM.07/',
    requiredEnvVar: 'NASA_EARTHDATA_TOKEN',
    temporalResolution: 'Monthly Final Run (2000-06–Present)',
    spatialResolution: '0.1° × 0.1° (~11.1 km × 9.6 km at 30°N)',
    nativeFootprintKm: 11,
    nativeUnit: 'mm/hr',
    normalizedUnit: 'mm/month',
    normalizationFormula: 'P_mm_month = precipitation_mm_hr * 24 * days_in_month',
    coveragePeriod: '2000-06 to Present',
    qualityFlags: 'precipitationQualityIndex, gaugeRelativeWeighting, fill (-9999.9)',
    licensing: 'NASA / JAXA GPM Open Data Policy (Free & Open with attribution)',
    scaleLimitationEn:
      'In hyper-arid Upper Egypt and Greater Cairo, zero-inflated monthly rainfall means extreme convective cloudbursts carry large gauge-calibration uncertainty.',
    scaleLimitationAr:
      'في المناطق شديدة الجفاف بالصعيد والقاهرة، كثرة الأشهر الصفرية تجعل العواصف الحملية النادرة ذات هامش عدم يقين أعلى في المعايرة.',
  },
  {
    id: 'gldas',
    variableKey: 'soil_moisture',
    variableNameEn: 'Surface & Root-Zone Soil Moisture (0–10 cm)',
    variableNameAr: 'رطوبة التربة السطحية (0–10 سم)',
    datasetName: 'NASA GLDAS Noah Land Surface Model L4 Monthly',
    productId: 'GLDAS_NOAH025_M',
    productVersion: '2.1',
    targetVariableField: 'SoilMoi0_10cm_inst',
    agency: 'NASA GSFC / GES DISC',
    documentationUrl: 'https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary',
    cmrShortName: 'GLDAS_NOAH025_M',
    cmrCollectionConceptId: 'C1342986035-GES_DISC',
    accessMethod: 'NASA Earthdata Login + GES DISC OPeNDAP / Giovanni / AppEEARS',
    endpointTemplate:
      'https://hydro1.gesdisc.eosdis.nasa.gov/opendap/GLDAS/GLDAS_NOAH025_M.2.1/',
    requiredEnvVar: 'NASA_EARTHDATA_TOKEN',
    temporalResolution: 'Monthly (2000-01–Present)',
    spatialResolution: '0.25° × 0.25° (~27.8 km × 24.0 km)',
    nativeFootprintKm: 28,
    nativeUnit: 'kg/m²',
    normalizedUnit: 'kg/m² (mm water)',
    normalizationFormula:
      'Native kg/m² preserved (1 kg/m² = 1 mm water depth in 0–10 cm layer; volumetric equivalent = value / 100 m³/m³)',
    coveragePeriod: '2000-01 to Present',
    qualityFlags: 'Noah LSM land-sea mask, desert bare-soil limits, fill (-9999)',
    licensing: 'NASA GES DISC Open Data Policy (Attribution requested)',
    scaleLimitationEn:
      'GLDAS Noah ~28 km cells average narrow irrigated Nile Valley parcels with adjacent desert sands and do not explicitly force managed canal irrigation schedules.',
    scaleLimitationAr:
      'تدمج خلايا GLDAS (~28 كم) الأراضي المروية الضيقة بوادي النيل مع الصحراء المجاورة، ولا تمثل جداول الري بالترع بشكل مباشر.',
  },
  {
    id: 'grace-fo',
    variableKey: 'terrestrial_water_storage',
    variableNameEn: 'Terrestrial Water Storage Anomaly (TWS)',
    variableNameAr: 'شذوذ تخزين المياه الأرضية (GRACE-FO)',
    datasetName: 'NASA GRACE & GRACE-FO JPL RL06.3 Mascon CRI Grid v4',
    productId: 'TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4',
    productVersion: 'RL06.3 v4',
    targetVariableField: 'lwe_thickness',
    agency: 'NASA JPL / GFZ / PO.DAAC',
    documentationUrl:
      'https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4',
    cmrShortName: 'TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4',
    cmrCollectionConceptId: 'C3165214266-POCLOUD',
    accessMethod: 'NASA Earthdata Login + PO.DAAC Harmony / Earthdata Cloud / Giovanni',
    endpointTemplate:
      'https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4/',
    requiredEnvVar: 'NASA_EARTHDATA_TOKEN',
    temporalResolution: 'Monthly with 2017-07 to 2018-05 inter-mission gap',
    spatialResolution: '3° equal-area mascons (~300 km native) sampled on 0.5° grid',
    nativeFootprintKm: 300,
    nativeUnit: 'cm (equivalent water thickness)',
    normalizedUnit: 'cm',
    normalizationFormula: 'Anomaly relative to 2004-01 to 2009-12 baseline (cm LWE); uncertainty column preserved',
    coveragePeriod: '2002-04 to Present (GRACE + GRACE-FO)',
    qualityFlags: 'CRI coastline leakage filter, land-mask scaling, inter-mission gap flag',
    licensing: 'NASA / JPL PO.DAAC Open Data Policy',
    scaleLimitationEn:
      'CRITICAL SCALE WARNING: GRACE-FO native resolution is ~300 km (3° mascon). It CANNOT provide parcel-level, city-district, or separate Cairo vs. Delta signals; Northern Nile Delta and Greater Cairo share overlapping mascon mass sensitivity.',
    scaleLimitationAr:
      'تحذير دقة حرج: الدقة الفيزيائية لـ GRACE-FO هي ~300 كم (كتلة 3°). لا يقدم قياسات على مستوى المزارع أو الأحياء، وتتداخل حساسية القاهرة الكبرى مع شمال الدلتا ضمن نفس النطاق الكتلي.',
  },
];

export const RESEARCH_SOURCES: ResearchSourceSpec[] = [
  {
    id: 'nasa-giovanni',
    titleEn: 'NASA Giovanni',
    titleAr: 'منصة NASA Giovanni',
    url: 'https://giovanni.gsfc.nasa.gov/giovanni/',
    organization: 'NASA Goddard Earth Sciences Data and Information Services Center (GES DISC)',
    classification: 'Data discovery or processing tool',
    descriptionEn:
      'Web-based Earth observation analysis environment enabling interactive time-series, area-averaged trends, and CSV downloads for MERRA-2, GPM IMERG, and GLDAS without bulk HDF/NetCDF staging.',
    descriptionAr:
      'بيئة تحليل ويب من ناسا تتيح استخراج السلاسل الزمنية والمتوسطات المكانية وتنزيل ملفات CSV لبيانات MERRA-2 و GPM IMERG و GLDAS مباشرة.',
    relevanceEn:
      'Primary interactive workbench for verifying and exporting region-averaged CSV series for Northern Nile Delta, Greater Cairo, and Upper Egypt.',
    relevanceAr:
      'أداة مرجعية رئيسية للتحقق وتصدير السلاسل الزمنية بصيغة CSV لمناطق الدراسة المصرية الثلاث.',
    initialStatus: 'DISCOVERY_PORTAL',
    probeUrl: 'https://giovanni.gsfc.nasa.gov/giovanni/',
  },
  {
    id: 'nasa-ges-disc-hydrology',
    titleEn: 'NASA GES DISC Hydrology Time Series',
    titleAr: 'سلاسل الهيدرولوجيا الزمنية NASA GES DISC',
    url: 'https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series',
    organization: 'NASA GES DISC',
    classification: 'Operational data source',
    descriptionEn:
      'Documented NASA GES DISC hydrological data rods and OPeNDAP time-series service covering GLDAS soil moisture, GPM IMERG precipitation, and MERRA-2 atmospheric fluxes.',
    descriptionAr:
      'خدمات بيانات الهيدرولوجيا الموثقة من ناسا (Data Rods & OPeNDAP) لبيانات رطوبة التربة GLDAS وأمطار GPM IMERG ومتغيرات MERRA-2.',
    relevanceEn:
      'Defines the official NASA Earthdata token-authenticated endpoints and point/area extraction protocols used by CLIMATO connectors.',
    relevanceAr:
      'تحدد نقاط الوصول الرسمية الموثقة وبروتوكولات استخراج السلاسل الزمنية لموصلات كليماتو.',
    initialStatus: 'PENDING_CONFIGURATION',
    probeUrl: 'https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series',
  },
  {
    id: 'nasa-appeears',
    titleEn: 'NASA AppEEARS',
    titleAr: 'منصة NASA AppEEARS',
    url: 'https://appeears.earthdatacloud.nasa.gov/',
    organization: 'NASA LP DAAC / Earthdata Cloud',
    classification: 'Operational data source',
    descriptionEn:
      'Application for Extracting and Exploring Analysis Ready Samples (AppEEARS) with REST API for polygon and point subsetting of MODIS, SMAP, ECOSTRESS, and land-surface products.',
    descriptionAr:
      'واجهة وخدمة REST برمجية لاستخراج عينات جاهزة للتحليل للمضلعات والنقاط عبر منتجات رصد الأرض في سحابة ناسا.',
    relevanceEn:
      'Supports Earthdata-authenticated asynchronous polygon extraction and analysis-ready CSV imports into CLIMATO.',
    relevanceAr:
      'تدعم استخراج المضلعات الجغرافية المؤتمت واستيراد ملفات CSV الجاهزة للتحليل إلى كليماتو.',
    initialStatus: 'PENDING_CONFIGURATION',
    probeUrl: 'https://appeears.earthdatacloud.nasa.gov/api/product?limit=1',
  },
  {
    id: 'noaa-cdo',
    titleEn: 'NOAA Climate Data Online (CDO)',
    titleAr: 'بيانات المناخ عبر الإنترنت NOAA CDO',
    url: 'https://www.ncei.noaa.gov/cdo-web/',
    organization: 'NOAA National Centers for Environmental Information (NCEI)',
    classification: 'Operational data source',
    descriptionEn:
      'Global historical surface weather station archive (GHCN-Daily / GSOM) providing ground-truth meteorological reference records via token-authenticated CDO v2 API.',
    descriptionAr:
      'أرشيف محطات الطقس السطحية التاريخية العالمي (GHCN) لتوفير قراءات أرضية مرجعية عبر واجهة CDO v2 الموثقة.',
    relevanceEn:
      'Cross-validates satellite reanalysis air temperature (MERRA-2) and precipitation (IMERG) against Egyptian airport/synoptic weather stations (Requires NOAA_CDO_TOKEN).',
    relevanceAr:
      'يُستخدم للتحقق الأرضي من حرارة MERRA-2 وأمطار IMERG مقارنة بمحطات الأرصاد المصرية (يتطلب NOAA_CDO_TOKEN).',
    initialStatus: 'PENDING_CONFIGURATION',
    probeUrl: 'https://www.ncei.noaa.gov/cdo-web/',
  },
  {
    id: 'knmi-climate-explorer',
    titleEn: 'KNMI Climate Explorer',
    titleAr: 'مستكشف المناخ KNMI',
    url: 'https://climexp.knmi.nl/',
    organization: 'Royal Netherlands Meteorological Institute (KNMI)',
    classification: 'Data discovery or processing tool',
    descriptionEn:
      'Independent climate research portal offering global observational indices, gridded reanalysis inspection, seasonal trend diagnostics, and regional time-series correlation tools.',
    descriptionAr:
      'بوابة بحثية مناخية مستقلة توفر مؤشرات الرصد العالمية وفحص إعادة التحليل والاتجاهات الموسمية وأدوات الارتباط الإقليمي.',
    relevanceEn:
      'Independent benchmark tool for cross-checking regional North Africa / Eastern Mediterranean warming and seasonal anomalies.',
    relevanceAr:
      'أداة مرجعية مستقلة لمراجعة اتجاهات الاحترار والشذوذ الموسمي في شمال إفريقيا وشرق المتوسط.',
    initialStatus: 'DISCOVERY_PORTAL',
    probeUrl: 'https://climexp.knmi.nl/',
  },
  {
    id: 'statistical-trend-methods',
    titleEn: 'Statistical Test Methods to Detect Trends in Time Series Data',
    titleAr: 'الاختبارات الإحصائية لكشف الاتجاهات في السلاسل الزمنية',
    url: 'https://medium.com/@snp.kriss/statistical-test-methods-to-detect-trends-in-time-series-data-b361a0ec530b',
    organization: 'Methodological Reference (Non-Parametric Trend Literature)',
    classification: 'Research or methodology reference',
    descriptionEn:
      'Technical walkthrough of non-parametric trend detection in hydrometeorological series, contrasting Mann-Kendall test assumptions, Sen’s slope robustness to outliers, and seasonality.',
    descriptionAr:
      'شرح تقني للاختبارات اللامعلمية لكشف الاتجاهات الهيدرومناخية ومقارنة افتراضات اختبار مان-كيندال وميل ثيل-سين ومراعاة الموسمية.',
    relevanceEn:
      'Guides CLIMATO’s choice of rank-based Mann-Kendall + Theil-Sen over ordinary least squares for skewed rainfall and water storage data.',
    relevanceAr:
      'يدعم اعتماد كليماتو لاختبار مان-كيندال وميل ثيل-سين اللامعلمي بدلاً من الانحدار الخطي التقليدي.',
    initialStatus: 'METHODOLOGY_REFERENCE',
    probeUrl:
      'https://medium.com/@snp.kriss/statistical-test-methods-to-detect-trends-in-time-series-data-b361a0ec530b',
  },
  {
    id: 'statistical-significance',
    titleEn: 'A Comprehensive Guide to Statistical Significance',
    titleAr: 'الدليل الشامل للدلالة الإحصائية',
    url: 'https://www.statsig.com/perspectives/a-comprehensive-guide-to-statistical-significance',
    organization: 'Statsig Perspectives',
    classification: 'Research or methodology reference',
    descriptionEn:
      'Methodological reference on p-values, confidence intervals, statistical power, minimum sample sizes, and avoiding false-positive significance claims under noisy or underpowered regimes.',
    descriptionAr:
      'مرجع منهجي حول قيم p وفترات الثقة والقوة الإحصائية والحد الأدنى لحجم العينة وتجنب ادعاء الدلالة عند نقص البيانات.',
    relevanceEn:
      'Informs CLIMATO’s strict INSUFFICIENT_DATA guardrails (minimum n, 70% coverage requirement, 95% confidence bounds, and lag-1 autocorrelation disclosures).',
    relevanceAr:
      'يؤسس لضوابط رفض الدلالة الإحصائية عند ضعف التغطية أو صغر حجم العينة وعرض فترات الثقة 95%.',
    initialStatus: 'METHODOLOGY_REFERENCE',
    probeUrl: 'https://www.statsig.com/perspectives/a-comprehensive-guide-to-statistical-significance',
  },
  {
    id: 'radarsat-rcm',
    titleEn: 'RADARSAT Constellation Mission (RCM)',
    titleAr: 'مهمة كوكبة رادارسات (RCM)',
    url: 'https://donnees-data.asc-csa.gc.ca/en/dataset/rcm',
    organization: 'Canadian Space Agency (CSA / ASC)',
    classification: 'Supporting satellite mission or documentation',
    descriptionEn:
      'C-band Synthetic Aperture Radar (SAR) constellation dataset providing all-weather, cloud-independent coastline, soil surface roughness, and subsidence deformation monitoring.',
    descriptionAr:
      'بيانات رادار الفتحة التركيبية (SAR) لرصد السواحل وتشوه وهبوط التربة وخشونة السطح في جميع الظروف الجوية.',
    relevanceEn:
      'Complements optical and gravimetric layers for future Northern Nile Delta subsidence, wetland inundation, and coastal erosion diagnostics.',
    relevanceAr:
      'مكمل مستقبلي لمتابعة هبوط أراضي شمال الدلتا وتآكل السواحل ومراقبة الأراضي الرطبة.',
    initialStatus: 'SUPPORTING_MISSION',
    probeUrl: 'https://donnees-data.asc-csa.gc.ca/en/dataset/rcm',
  },
  {
    id: 'geo-ca',
    titleEn: 'GEO.ca Open Geospatial Portal',
    titleAr: 'بوابة GEO.ca الجيومكانية المفتوحة',
    url: 'https://geo.ca/',
    organization: 'Natural Resources Canada (NRCan / Government of Canada)',
    classification: 'Data discovery or processing tool',
    descriptionEn:
      'Open geospatial metadata federation showcasing interoperable OGC/STAC standards, spatial metadata cataloging, and multi-agency Earth observation discovery patterns.',
    descriptionAr:
      'بوابة فيدرالية للبيانات الجيومكانية المفتوحة تعرض معايير OGC/STAC وفهرسة البيانات الوصفية واكتشاف الأرصاد متعددة الوكالات.',
    relevanceEn:
      'Architectural reference for CLIMATO’s geospatial catalog schema, bounding-box indexing, and standardized metadata provenance records.',
    relevanceAr:
      'مرجع معماري لتنظيم فهرسة النطاقات الجغرافية وسجلات البيانات الوصفية وموثوقية المصادر.',
    initialStatus: 'DISCOVERY_PORTAL',
    probeUrl: 'https://geo.ca/',
  },
  {
    id: 'swot-mission',
    titleEn: 'SWOT (Surface Water and Ocean Topography)',
    titleAr: 'مهمة SWOT لطبوغرافيا المياه السطحية والمحيطات',
    url: 'https://www.asc-csa.gc.ca/eng/satellites/swot/',
    organization: 'NASA / CNES / CSA / UK Space Agency',
    classification: 'Supporting satellite mission or documentation',
    descriptionEn:
      'Ka-band Radar Interferometer mission measuring river discharge, lake/reservoir water surface elevation, and coastal sea-level slopes at unprecedented spatial detail.',
    descriptionAr:
      'مهمة تداخل راداري لقياس مناسيب وتصريفات الأنهار والخزانات المائية وانحدار مستوى سطح البحر الساحلي بدقة غير مسبوقة.',
    relevanceEn:
      'Directly relevant to Nile mainstem water-level tracking, Lake Nasser volume dynamics, and Rosetta/Damietta coastal sea-level hazards.',
    relevanceAr:
      'ذات صلة مباشرة بمتابعة مناسيب النيل وبحيرة ناصر ومخاطر سواحل رشيد ودمياط.',
    initialStatus: 'SUPPORTING_MISSION',
    probeUrl: 'https://www.asc-csa.gc.ca/eng/satellites/swot/',
  },
  {
    id: 'csa-ecosystem-monitoring',
    titleEn: 'Monitoring and Protecting Our Ecosystems from Space',
    titleAr: 'رصد وحماية النظم البيئية من الفضاء',
    url: 'https://www.asc-csa.gc.ca/eng/satellites/everyday-lives/monitoring-and-protecting-our-ecosystems-from-space.asp',
    organization: 'Canadian Space Agency (CSA)',
    classification: 'Supporting satellite mission or documentation',
    descriptionEn:
      'Scientific documentation detailing how multi-sensor satellite missions monitor wetlands, agricultural resilience, drought progression, and coastal ecosystem stress.',
    descriptionAr:
      'توثيق علمي يوضح كيفية توظيف الأقمار الصناعية متعددة المستشعرات في مراقبة الأراضي الرطبة والمرونة الزراعية والجفاف والسواحل.',
    relevanceEn:
      'Contextualizes how satellite indicators translate into Nile Delta wetland conservation and agricultural adaptation decisions.',
    relevanceAr:
      'يؤطر ربط مؤشرات الأقمار الصناعية بحماية البحيرات الشمالية والتكيف الزراعي في الدلتا.',
    initialStatus: 'SUPPORTING_MISSION',
    probeUrl:
      'https://www.asc-csa.gc.ca/eng/satellites/everyday-lives/monitoring-and-protecting-our-ecosystems-from-space.asp',
  },
  {
    id: 'csa-sar-tutorial',
    titleEn: 'CSA Synthetic Aperture Radar (SAR) Tutorial',
    titleAr: 'دليل رادار الفتحة التركيبية (SAR) التطبيقي',
    url: 'https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial',
    organization: 'Canadian Space Agency (GitHub Open Educational Repository)',
    classification: 'Research or methodology reference',
    descriptionEn:
      'Open-source Python notebooks and methodological tutorials covering SAR backscatter calibration, speckle filtering, moisture sensitivity, and coastal flood segmentation.',
    descriptionAr:
      'دفاتر برمجية مفتوحة المصدر لمعايرة الارتداد الراداري وتصفية الضوضاء وحساسية رطوبة التربة ورصد الفيضانات الساحلية.',
    relevanceEn:
      'Provides reproducible radar signal-processing workflows for future SAR soil moisture and Nile Delta inundation extensions.',
    relevanceAr:
      'يوفر منهجيات قابلة للتكرار لمعالجة إشارات الرادار لرطوبة التربة وفيضانات شمال الدلتا.',
    initialStatus: 'METHODOLOGY_REFERENCE',
    probeUrl: 'https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial',
  },
];
