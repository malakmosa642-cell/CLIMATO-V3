import { BilingualText } from '../types/climate';

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export type CodeLanguage = 'curl' | 'python' | 'javascript' | 'typescript';

export interface ApiParamDoc {
  name: string;
  location: 'path' | 'query' | 'body';
  type: string;
  required: boolean;
  example: string;
  description: BilingualText;
}

export interface ApiEndpointDoc {
  id: string;
  category: 'modules' | 'reports' | 'alerts' | 'connectors';
  method: ApiMethod;
  path: string;
  title: BilingualText;
  summary: BilingualText;
  scope: string;
  params: ApiParamDoc[];
  defaultQuery?: Record<string, string>;
  defaultPathParams?: Record<string, string>;
  defaultBody?: string;
  sampleResponse: string;
}

export const API_ENDPOINTS: ApiEndpointDoc[] = [
  {
    id: 'climate-summary',
    category: 'modules',
    method: 'GET',
    path: '/api/v1/climate/summary',
    title: {
      en: 'Coordinate Satellite Summary',
      ar: 'ملخص الإحداثيات الفضائي',
    },
    summary: {
      en: 'Fetches a coordinate-indexed staged telemetry preview from any of the 10 Earth observation connectors with explicit provenance flags.',
      ar: 'يجلب معاينة مرحلية مرتبطة بالإحداثيات من أي من موصلات الأقمار الصناعية العشرة مع وسم مصدر البيانات.',
    },
    scope: 'connectors:read',
    params: [
      {
        name: 'connector',
        location: 'query',
        type: 'string',
        required: true,
        example: 'sentinel-6',
        description: {
          en: 'Connector identifier (sentinel-6, modis, landsat, smap, gpm, tropomi, merra-2, ecostress, grace-fo, nasa-power).',
          ar: 'معرف الموصل الفضائي (sentinel-6, modis, landsat, smap, gpm, tropomi, merra-2, ecostress, grace-fo, nasa-power).',
        },
      },
      {
        name: 'lat',
        location: 'query',
        type: 'number',
        required: true,
        example: '31.404',
        description: {
          en: 'WGS84 latitude in decimal degrees [-90, 90].',
          ar: 'خط العرض وفق WGS84 بالدرجات العشرية [-90, 90].',
        },
      },
      {
        name: 'lon',
        location: 'query',
        type: 'number',
        required: true,
        example: '30.416',
        description: {
          en: 'WGS84 longitude in decimal degrees [-180, 180].',
          ar: 'خط الطول وفق WGS84 بالدرجات العشرية [-180, 180].',
        },
      },
    ],
    defaultQuery: { connector: 'sentinel-6', lat: '31.404', lon: '30.416' },
    sampleResponse: JSON.stringify(
      {
        connectorId: 'sentinel-6',
        sourceName: 'Sentinel-6 Michael Freilich',
        coordinates: { lat: 31.404, lon: 30.416 },
        isSampleData: true,
        dataProvenance: 'SAMPLE_DEMONSTRATION',
        liveIntegrationReady: true,
        requiredEnvVar: 'COPERNICUS_DATA_SPACE_TOKEN',
        credentialsConfigured: false,
        samplePayload: {
          variable: 'sea_surface_height_anomaly',
          value: 28.76,
          unit: 'mm',
          period: '2026-Q4 (Sample Baseline)',
        },
      },
      null,
      2
    ),
  },
  {
    id: 'climate-analyze',
    category: 'modules',
    method: 'POST',
    path: '/api/v1/climate/analyze',
    title: {
      en: 'Multi-Hazard Coordinate Risk Profile',
      ar: 'تحليل المخاطر متعددة الأبعاد للإحداثيات',
    },
    summary: {
      en: 'Computes an Egypt-corridor geospatial risk composite across coastal exposure, urban heat, agro-moisture, and dust aerosols with Haversine matching to nearest registered AOI.',
      ar: 'يحسب ملف المخاطر الجيومكانية في مصر عبر التعرض الساحلي والحرارة الحضرية ورطوبة المحاصيل والغبار مع مطابقة المسافة لأقرب موقع مسجل.',
    },
    scope: 'geospatial:analyze',
    params: [
      {
        name: 'lat',
        location: 'body',
        type: 'number',
        required: true,
        example: '31.404',
        description: { en: 'Target WGS84 latitude.', ar: 'خط العرض WGS84.' },
      },
      {
        name: 'lon',
        location: 'body',
        type: 'number',
        required: true,
        example: '30.416',
        description: { en: 'Target WGS84 longitude.', ar: 'خط الطول WGS84.' },
      },
    ],
    defaultBody: JSON.stringify({ lat: 31.404, lon: 30.416 }, null, 2),
    sampleResponse: JSON.stringify(
      {
        coordinates: { lat: 31.404, lon: 30.416, projection: 'EPSG:4326' },
        regionClassification: {
          corridorCode: 'EG-MED-DELTA',
          labelEn: 'Northern Nile Delta & Mediterranean Coast',
        },
        compositeRiskScore: 68,
        riskTier: 'ELEVATED',
        isSampleData: true,
        dataProvenance: 'SAMPLE_DEMONSTRATION',
      },
      null,
      2
    ),
  },
  {
    id: 'module-data',
    category: 'modules',
    method: 'GET',
    path: '/api/v1/modules/{moduleId}/data',
    title: {
      en: 'Query Module Time-Series Data',
      ar: 'استعلام بيانات الوحدات السبع',
    },
    summary: {
      en: 'Retrieves structured quarterly sample observations, baseline values, and anomaly deltas for any of the 7 climate intelligence modules.',
      ar: 'يسترجع القراءات الفصلية النموذجية وقيم الأساس والانحرافات لأي من وحدات الذكاء المناخي السبع.',
    },
    scope: 'modules:read',
    params: [
      {
        name: 'moduleId',
        location: 'path',
        type: 'enum',
        required: true,
        example: 'delta-risk',
        description: {
          en: 'One of: delta-risk, crop-health, urban-heat, air-dust, esg-reporting, water-monitoring, trend-alerts.',
          ar: 'أحد القيم: delta-risk, crop-health, urban-heat, air-dust, esg-reporting, water-monitoring, trend-alerts.',
        },
      },
      {
        name: 'aoiId',
        location: 'query',
        type: 'string',
        required: false,
        example: 'all',
        description: {
          en: 'Optional AOI filter (e.g. aoi-rosetta, aoi-sharqia, aoi-cairo, aoi-jubail, aoi-toshka, aoi-alex).',
          ar: 'تصفية اختيارية حسب منطقة الاهتمام الجغرافية (AOI).',
        },
      },
      {
        name: 'period',
        location: 'query',
        type: 'string',
        required: false,
        example: 'all',
        description: {
          en: 'Optional quarter filter (2026-Q1 through 2026-Q4).',
          ar: 'تصفية اختيارية حسب الربع السنوي.',
        },
      },
    ],
    defaultPathParams: { moduleId: 'delta-risk' },
    defaultQuery: { aoiId: 'all', period: 'all' },
    sampleResponse: JSON.stringify(
      {
        moduleId: 'delta-risk',
        isSampleData: true,
        dataProvenance: 'SAMPLE_DEMONSTRATION',
        count: 4,
        records: [
          {
            aoi_id: 'aoi-rosetta',
            source_name: 'Sentinel-6 + Landsat',
            period_label: '2026-Q4',
            metric_key: 'coastal_elevation_anomaly_mm',
            metric_value: 46,
            unit: 'mm',
            baseline_value: 32,
            anomaly_delta: 14,
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'connectors-list',
    category: 'connectors',
    method: 'GET',
    path: '/api/v1/connectors',
    title: {
      en: 'List Staged Satellite Connectors',
      ar: 'قائمة موصلات الأقمار الصناعية',
    },
    summary: {
      en: 'Returns integration metadata, temporal cadence, spatial resolution, and credential readiness for all 10 satellite sources.',
      ar: 'يعرض بيانات التكامل والدقة المكانية والتكرار الزمني وجاهزية الاعتماد لجميع المصادر الفضائية العشرة.',
    },
    scope: 'connectors:read',
    params: [],
    sampleResponse: JSON.stringify(
      {
        dataProvenance: 'STAGED_CONNECTOR_REGISTRY',
        count: 10,
        connectors: [
          {
            id: 'sentinel-6',
            source_name: 'Sentinel-6 Michael Freilich',
            agency: 'EUMETSAT / ESA / NASA',
            spatial_resolution: '300 m along-track',
            integration_stage: 'STAGED_ADAPTER_READY',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'reports-list',
    category: 'reports',
    method: 'GET',
    path: '/api/v1/reports',
    title: {
      en: 'List Climate & ESG Reports',
      ar: 'عرض سجل تقارير المناخ و ESG',
    },
    summary: {
      en: 'Lists generated sandbox disclosure packs and scoped custom report orders with status and provenance tags.',
      ar: 'يسرد حزم الإفصاح النموذجية وطلبات التقارير المخصصة وحالتها ووسوم المصدرية.',
    },
    scope: 'reports:read',
    params: [],
    sampleResponse: JSON.stringify(
      {
        isSampleData: true,
        dataProvenance: 'SAMPLE_DEMONSTRATION',
        reports: [
          {
            id: 'rep-sample-101',
            organization_name: 'Mediterranean Coastal Asset Fund (Sample)',
            standard: 'ISSB IFRS S2',
            status: 'READY_SAMPLE',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'reports-create',
    category: 'reports',
    method: 'POST',
    path: '/api/v1/reports',
    title: {
      en: 'Generate ESG / Climate Report',
      ar: 'توليد تقرير مناخي أو إفصاح ESG',
    },
    summary: {
      en: 'Creates a downloadable ISSB S2, CSRD, or TCFD report record and returns direct CSV and JSON export URLs.',
      ar: 'ينشئ سجل تقرير متوافق مع ISSB S2 أو CSRD أو TCFD ويعيد روابط تنزيل CSV و JSON.',
    },
    scope: 'reports:write',
    params: [
      {
        name: 'organizationName',
        location: 'body',
        type: 'string',
        required: true,
        example: 'Nile Delta Logistics REIT',
        description: { en: 'Reporting entity or fund name.', ar: 'اسم الجهة أو المحفظة.' },
      },
      {
        name: 'sector',
        location: 'body',
        type: 'string',
        required: true,
        example: 'Real Estate & Urban Development',
        description: { en: 'Target business sector.', ar: 'القطاع الاقتصادي المستهدف.' },
      },
      {
        name: 'standard',
        location: 'body',
        type: 'string',
        required: true,
        example: 'ISSB IFRS S2',
        description: { en: 'Disclosure framework (ISSB IFRS S2, CSRD ESRS E1/E4, TCFD Physical Risk).', ar: 'معيار الإفصاح المطلوب.' },
      },
      {
        name: 'moduleIds',
        location: 'body',
        type: 'string[]',
        required: true,
        example: '["delta-risk", "esg-reporting"]',
        description: { en: 'Array of module IDs to include in the report pack.', ar: 'مصفوفة معرفات الوحدات المشمولة.' },
      },
    ],
    defaultBody: JSON.stringify(
      {
        organizationName: 'API Sandbox Coastal Trust',
        sector: 'Banking & Credit Underwriting',
        standard: 'ISSB IFRS S2',
        moduleIds: ['delta-risk', 'esg-reporting', 'urban-heat'],
        lat: 31.2,
        lon: 29.918,
        reportType: 'Standard Sandbox Export',
      },
      null,
      2
    ),
    sampleResponse: JSON.stringify(
      {
        isSampleData: true,
        dataProvenance: 'SAMPLE_DEMONSTRATION',
        exportUrls: {
          json: '/api/reports/rep-sample-101/export?format=json',
          csv: '/api/reports/rep-sample-101/export?format=csv',
        },
      },
      null,
      2
    ),
  },
  {
    id: 'alerts-list',
    category: 'alerts',
    method: 'GET',
    path: '/api/v1/alerts',
    title: {
      en: 'List Coordinate Trend Alerts',
      ar: 'قائمة تنبيهات الإحداثيات',
    },
    summary: {
      en: 'Returns all registered latitude/longitude geofence threshold rules, operators, channels, and active states.',
      ar: 'يعيد جميع قواعد المراقبة الجغرافية المسجلة حسب خط العرض والطول وقنوات الإشعار.',
    },
    scope: 'alerts:read',
    params: [
      {
        name: 'moduleId',
        location: 'query',
        type: 'string',
        required: false,
        example: 'all',
        description: { en: 'Optional module filter.', ar: 'تصفية اختيارية حسب الوحدة.' },
      },
    ],
    defaultQuery: { moduleId: 'all' },
    sampleResponse: JSON.stringify(
      {
        isSampleData: true,
        dataProvenance: 'SAMPLE_DEMONSTRATION',
        alerts: [
          {
            id: 'alt-001',
            title_en: 'Rosetta Coastal Sea-Level Anomaly Watch',
            module_id: 'delta-risk',
            lat: 31.404,
            lon: 30.416,
            radius_km: 18,
            operator: '>',
            threshold_value: 40,
            unit: 'mm',
            enabled: 1,
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'alerts-create',
    category: 'alerts',
    method: 'POST',
    path: '/api/v1/alerts',
    title: {
      en: 'Create Coordinate Alert Rule',
      ar: 'إنشاء قاعدة تنبيه إحداثيات',
    },
    summary: {
      en: 'Registers a new coordinate-based geofence alert threshold persisted in the database.',
      ar: 'يسجل قاعدة عتبة جديدة لمراقبة الإحداثيات الجغرافية في قاعدة البيانات.',
    },
    scope: 'alerts:write',
    params: [
      { name: 'titleEn', location: 'body', type: 'string', required: true, example: 'East Delta Heat Threshold', description: { en: 'Rule title.', ar: 'عنوان القاعدة.' } },
      { name: 'moduleId', location: 'body', type: 'string', required: true, example: 'urban-heat', description: { en: 'Target climate module.', ar: 'الوحدة المستهدفة.' } },
      { name: 'lat', location: 'body', type: 'number', required: true, example: '30.044', description: { en: 'Center latitude.', ar: 'خط العرض.' } },
      { name: 'lon', location: 'body', type: 'number', required: true, example: '31.235', description: { en: 'Center longitude.', ar: 'خط الطول.' } },
      { name: 'thresholdValue', location: 'body', type: 'number', required: true, example: '4.2', description: { en: 'Numeric breach threshold.', ar: 'القيمة الحدية للتنبيه.' } },
    ],
    defaultBody: JSON.stringify(
      {
        titleEn: 'API Sandbox Thermal Alert',
        titleAr: 'تنبيه حراري تجريبي عبر API',
        moduleId: 'urban-heat',
        lat: 30.044,
        lon: 31.235,
        radiusKm: 20,
        metricKey: 'surface_temp_anomaly_c',
        operator: '>',
        thresholdValue: 4.2,
        unit: '°C',
        severity: 'High',
        channel: 'Webhook + Email',
      },
      null,
      2
    ),
    sampleResponse: JSON.stringify(
      {
        isSampleData: true,
        alert: {
          id: 'alt-example',
          module_id: 'urban-heat',
          threshold_value: 4.2,
          enabled: 1,
        },
      },
      null,
      2
    ),
  },
  {
    id: 'alerts-evaluate',
    category: 'alerts',
    method: 'POST',
    path: '/api/v1/alerts/{id}/evaluate',
    title: {
      en: 'Evaluate Geofence Alert & Sign Webhook',
      ar: 'تقييم قاعدة التنبيه وتوقيع Webhook',
    },
    summary: {
      en: 'Evaluates an existing coordinate alert rule against sample observations, records the evaluation in SQLite, and returns an HMAC-SHA256 signed webhook signature.',
      ar: 'يقيّم قاعدة التنبيه الجغرافية مقابل القياسات النموذجية ويسجل النتيجة مع توقيع HMAC-SHA256.',
    },
    scope: 'alerts:write',
    params: [
      {
        name: 'id',
        location: 'path',
        type: 'string',
        required: true,
        example: 'alt-001',
        description: { en: 'Target trend alert ID.', ar: 'معرف قاعدة التنبيه.' },
      },
    ],
    defaultPathParams: { id: 'alt-001' },
    defaultBody: '{}',
    sampleResponse: JSON.stringify(
      {
        isSampleData: true,
        dataProvenance: 'SAMPLE_DEMONSTRATION',
        evaluation: {
          alertId: 'alt-001',
          observedValue: 46,
          thresholdValue: 40,
          breached: true,
          deliveryStatus: 'SANDBOX_WEBHOOK_SIGNED',
          webhookSignatureHeader: 'sha256=9c84e...',
        },
      },
      null,
      2
    ),
  },
];

export const MODULE_API_SPECS = [
  {
    id: 'delta-risk',
    name: { en: 'Delta Climate & Land Risk', ar: 'مخاطر المناخ والأراضي في الدلتا' },
    sources: 'Sentinel-6, Landsat, GRACE-FO',
    metrics: 'coastal_elevation_anomaly_mm, shoreline_retreat_m',
  },
  {
    id: 'crop-health',
    name: { en: 'Crop Health & Agro-Yield', ar: 'صحة المحاصيل والإنتاجية' },
    sources: 'MODIS, Landsat, SMAP, NASA POWER',
    metrics: 'ndvi_vigor_index, root_zone_moisture_m3',
  },
  {
    id: 'urban-heat',
    name: { en: 'Urban Heat Islands', ar: 'جزر الحرارة الحضرية' },
    sources: 'ECOSTRESS, Landsat TIRS, MODIS',
    metrics: 'surface_temp_anomaly_c, canopy_cooling_deficit',
  },
  {
    id: 'air-dust',
    name: { en: 'Air Quality & Dust Plumes', ar: 'جودة الهواء وأعمدة الغبار' },
    sources: 'TROPOMI, MERRA-2, MODIS',
    metrics: 'aerosol_optical_depth, no2_tropospheric_umol',
  },
  {
    id: 'esg-reporting',
    name: { en: 'ESG & Climate Reporting', ar: 'تقارير الاستدامة والإفصاح' },
    sources: 'Multi-Source Harmonized',
    metrics: 'physical_risk_exposure_idx, issb_s2_hazard_tier',
  },
  {
    id: 'water-monitoring',
    name: { en: 'Water & Basin Monitoring', ar: 'مراقبة المياه والأحواض' },
    sources: 'GRACE-FO, GPM, SMAP, Sentinel-6',
    metrics: 'soil_moisture_index, lwe_thickness_anomaly_cm',
  },
  {
    id: 'trend-alerts',
    name: { en: 'Coordinate Trend Alerts', ar: 'تنبيهات الاتجاهات بالإحداثيات' },
    sources: 'NASA POWER, MERRA-2, GPM',
    metrics: 'salinity_proxy_drift, threshold_breach_zscore',
  },
];

export function buildCodeSnippet(
  codeLang: CodeLanguage,
  method: ApiMethod,
  resolvedPath: string,
  token: string,
  body?: string
): string {
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://api.climato.example';
  const fullUrl = `${baseUrl}${resolvedPath}`;
  const hasBody = method === 'POST' || method === 'PATCH';

  if (codeLang === 'curl') {
    return [
      `curl -X ${method} "${fullUrl}" \\`,
      `  -H "Authorization: Bearer ${token}" \\`,
      `  -H "Accept: application/json"${hasBody ? ' \\' : ''}`,
      hasBody ? `  -H "Content-Type: application/json" \\\n  -d '${(body || '{}').replace(/\n/g, ' ')}'` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (codeLang === 'python') {
    if (hasBody) {
      return `import requests

url = "${fullUrl}"
headers = {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json",
}
payload = ${body || '{}'}

response = requests.request("${method}", url, headers=headers, json=payload, timeout=15)
response.raise_for_status()
data = response.json()
print("Provenance:", response.headers.get("X-Climato-Data-Provenance"))
print(data)`;
    }
    return `import requests

url = "${fullUrl}"
headers = {"Authorization": "Bearer ${token}"}

response = requests.get(url, headers=headers, timeout=15)
response.raise_for_status()
print("Rate remaining:", response.headers.get("X-RateLimit-Remaining"))
print(response.json())`;
  }

  if (codeLang === 'typescript') {
    return `interface ClimateApiEnvelope<T = unknown> {
  isSampleData: boolean;
  dataProvenance: "SAMPLE_DEMONSTRATION" | "LIVE_VERIFIED";
  [key: string]: T | boolean | string;
}

const response = await fetch("${fullUrl}", {
  method: "${method}",
  headers: {
    "Authorization": "Bearer ${token}",${hasBody ? '\n    "Content-Type": "application/json",' : ''}
  },${hasBody ? `\n  body: JSON.stringify(${body || '{}'}),` : ''}
});

if (!response.ok) {
  throw new Error(\`CLIMATO API error \${response.status}\`);
}

const payload = (await response.json()) as ClimateApiEnvelope;
console.log(payload.dataProvenance, payload);`;
  }

  // javascript
  return `const response = await fetch("${fullUrl}", {
  method: "${method}",
  headers: {
    "Authorization": "Bearer ${token}",${hasBody ? '\n    "Content-Type": "application/json",' : ''}
  },${hasBody ? `\n  body: JSON.stringify(${body || '{}'}),` : ''}
});

const data = await response.json();
console.log("Provenance:", response.headers.get("X-Climato-Data-Provenance"));
console.log(data);`;
}
