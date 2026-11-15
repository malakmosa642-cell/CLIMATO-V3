import { ModuleSpec, SectorSpec } from '../types/climate';

export const MODULES: ModuleSpec[] = [
  {
    id: 'delta-risk',
    index: '01',
    title: {
      en: 'Delta Climate & Land Risk',
      ar: 'مخاطر المناخ والأراضي في الدلتا',
    },
    shortTitle: {
      en: 'Delta & Coastal Risk',
      ar: 'مخاطر الدلتا والسواحل',
    },
    tagline: {
      en: 'Coastal elevation drift, sea-level anomaly, and shoreline intrusion intelligence.',
      ar: 'تحليل انجراف الارتفاعات الساحلية وشذوذ مستوى البحر وتداخل المياه المالحة.',
    },
    description: {
      en: 'Combines radar altimetry, shoreline optical change tracking, and groundwater mass trends to quantify physical exposure across deltaic plains, ports, and coastal corridors.',
      ar: 'يدمج قياسات الارتفاع الرادارية وتتبع تغيرات الشواطئ البصرية واتجاهات الكتلة المائية الجوفية لقياس التعرض الفيزيائي في السهول الدلتاوية والموانئ والممرات الساحلية.',
    },
    mechanism: {
      en: 'Cross-correlates Sentinel-6 coastal altimetry with Landsat 30m shoreline delineation and GRACE-FO terrestrial mass anomalies.',
      ar: 'يربط قياسات الارتفاع الساحلي من Sentinel-6 مع ترسيم خط الساحل من Landsat بدقة 30 متراً وشذوذ الكتلة الأرضية من GRACE-FO.',
    },
    outcome: {
      en: 'Asset-level coastal risk zoning for underwriting, municipal zoning, and sovereign resilience planning.',
      ar: 'تصنيف مخاطر ساحلية على مستوى الأصول للاكتتاب التأميني والتخطيط البلدي ومرونة البنية التحتية.',
    },
    satelliteSources: ['Sentinel-6', 'Landsat', 'GRACE-FO', 'GPM'],
    primaryVariables: {
      en: 'Sea Surface Height Anomaly (mm) · Shoreline Retreat (m/yr) · Soil Salinity Proxy',
      ar: 'شذوذ ارتفاع سطح البحر (مم) · تراجع خط الساحل (م/سنة) · مؤشر ملوحة التربة',
    },
    targetSectors: ['real-estate', 'banking', 'insurance', 'government', 'municipalities', 'tourism'],
    sampleHighlight: {
      label: { en: 'Sample Coastal Anomaly (Rosetta AOI)', ar: 'شذوذ ساحلي نموذجي (نطاق رشيد)' },
      value: '+46.0',
      unit: 'mm',
      context: { en: 'Sample Sandbox Baseline · Not live telemetry', ar: 'خط أساس تجريبي · ليس قياساً حياً' },
    },
    imagePath: '/src/assets/images/sat_delta_monitoring_1794680963485.jpg',
  },
  {
    id: 'crop-health',
    index: '02',
    title: {
      en: 'Crop Health & Agro-Yield',
      ar: 'صحة المحاصيل والإنتاجية الزراعية',
    },
    shortTitle: {
      en: 'Crop Health',
      ar: 'صحة المحاصيل',
    },
    tagline: {
      en: 'Parcel-scale vegetation vigor, root-zone moisture, and export harvest readiness.',
      ar: 'متابعة حيوية الغطاء النباتي ورطوبة منطقة الجذور وجاهزية الحصاد التصديري.',
    },
    description: {
      en: 'Monitors seasonal phenology, chlorophyll stress, and irrigation uniformity across agricultural holdings and export supply sheds.',
      ar: 'يرصد الفينولوجيا الموسمية وإجهاد الكلوروفيل وتجانس الري عبر الحيازات الزراعية وسلاسل التوريد التصديرية.',
    },
    mechanism: {
      en: 'Blends MODIS 16-day NDVI/EVI baselines with Landsat 30m parcel boundaries, SMAP root-zone moisture, and NASA POWER degree-days.',
      ar: 'يمزج خطوط الأساس من MODIS لمؤشرات NDVI/EVI مع حدود القطع من Landsat بدقة 30 متراً ورطوبة التربة من SMAP ودرجات النمو الحرارية من NASA POWER.',
    },
    outcome: {
      en: 'Early detection of water stress and yield variance for agribusinesses, exporters, and agricultural lenders.',
      ar: 'اكتشاف مبكر للإجهاد المائي وتباين الإنتاجية للشركات الزراعية والمصدرين وجهات التمويل الزراعي.',
    },
    satelliteSources: ['MODIS', 'Landsat', 'SMAP', 'ECOSTRESS', 'NASA POWER'],
    primaryVariables: {
      en: 'NDVI / EVI Index · Root-Zone Soil Moisture (m³/m³) · Evaporative Stress Index',
      ar: 'مؤشر الغطاء النباتي NDVI/EVI · رطوبة منطقة الجذور · مؤشر الإجهاد التبخري',
    },
    targetSectors: ['agriculture', 'exporting', 'irrigation', 'banking', 'investment', 'insurance'],
    sampleHighlight: {
      label: { en: 'Sample NDVI Composite (East Delta AOI)', ar: 'مركب NDVI نموذجي (شرق الدلتا)' },
      value: '0.62',
      unit: 'index',
      context: { en: 'Sample Sandbox Baseline · Not live telemetry', ar: 'خط أساس تجريبي · ليس قياساً حياً' },
    },
    imagePath: '/src/assets/images/agro_multispectral_scan_1794680962356.jpg',
  },
  {
    id: 'urban-heat',
    index: '03',
    title: {
      en: 'Urban Heat Islands',
      ar: 'جزر الحرارة الحضرية',
    },
    shortTitle: {
      en: 'Urban Heat',
      ar: 'الحرارة الحضرية',
    },
    tagline: {
      en: 'High-resolution thermal stress mapping for districts, infrastructure, and public health.',
      ar: 'رسم خرائط الإجهاد الحراري عالية الدقة للأحياء والبنية التحتية والصحة العامة.',
    },
    description: {
      en: 'Pinpoints persistent daytime and nocturnal land surface temperature hotspots relative to vegetated urban reference zones.',
      ar: 'يحدد البؤر الحرارية المستمرة نهاراً وليلاً لدرجة حرارة سطح الأرض مقارنة بالمناطق الحضرية الخضراء المرجعية.',
    },
    mechanism: {
      en: 'Ingests ECOSTRESS 70m thermal radiometry and Landsat TIRS bands calibrated with urban impervious surface masks.',
      ar: 'يستوعب قياسات ECOSTRESS الحرارية بدقة 70 متراً ونطاقات Landsat TIRS المعايرة مع خرائط الأسطح العمرانية.',
    },
    outcome: {
      en: 'Targeted cooling corridor investments, grid peak-load readiness, and heat-health advisories.',
      ar: 'توجيه استثمارات ممرات التبريد الحضري والاستعداد لذروة أحمال الطاقة وإنذارات الصحة الحرارية.',
    },
    satelliteSources: ['ECOSTRESS', 'Landsat', 'MODIS', 'TROPOMI'],
    primaryVariables: {
      en: 'Land Surface Temp Anomaly (°C) · Canopy Cooling Deficit · Heatwave Duration',
      ar: 'شذوذ حرارة سطح الأرض (°م) · عجز التبريد النباتي · مدة الموجات الحارة',
    },
    targetSectors: ['municipalities', 'real-estate', 'healthcare', 'tourism', 'government', 'sustainability'],
    sampleHighlight: {
      label: { en: 'Sample Surface Delta (Cairo AOI)', ar: 'فارق حراري نموذجي (نطاق القاهرة)' },
      value: '+5.1',
      unit: '°C',
      context: { en: 'Sample Sandbox Baseline · Not live telemetry', ar: 'خط أساس تجريبي · ليس قياساً حياً' },
    },
    imagePath: '/src/assets/images/urban_heat_corridor_1794680963384.jpg',
  },
  {
    id: 'air-dust',
    index: '04',
    title: {
      en: 'Air Quality & Dust Plumes',
      ar: 'جودة الهواء وأعمدة الغبار',
    },
    shortTitle: {
      en: 'Air & Dust',
      ar: 'الهواء والغبار',
    },
    tagline: {
      en: 'Atmospheric NO2, aerosol optical depth, and regional dust storm corridor tracking.',
      ar: 'تتبع ثاني أكسيد النيتروجين والعمق البصري للهوائيات ومسارات العواصف الغبارية.',
    },
    description: {
      en: 'Tracks trace-gas emissions, industrial plumes, and transboundary mineral dust transport across logistics hubs, resorts, and metro areas.',
      ar: 'يتابع انبعاثات الغازات النزرة والأعمدة الصناعية وانتقال الغبار المعدني العابر للحدود عبر المراكز اللوجستية والمنتجعات والمدن.',
    },
    mechanism: {
      en: 'Fuses Sentinel-5P TROPOMI trace gases with MERRA-2 dust column mass density and MODIS aerosol optical depth.',
      ar: 'يدمج بيانات الغازات من Sentinel-5P TROPOMI مع كثافة عمود الغبار من MERRA-2 والعمق البصري للهوائيات من MODIS.',
    },
    outcome: {
      en: 'Respiratory risk planning for healthcare, outdoor tourism scheduling, and industrial compliance monitoring.',
      ar: 'تخطيط المخاطر التنفسية للقطاع الصحي وجدولة السياحة المفتوحة ومراقبة الامتثال الصناعي.',
    },
    satelliteSources: ['TROPOMI', 'MERRA-2', 'MODIS'],
    primaryVariables: {
      en: 'Aerosol Optical Depth (AOD) · Tropospheric NO2 (µmol/m²) · Dust Column Mass (g/m²)',
      ar: 'العمق البصري للهوائيات (AOD) · ثاني أكسيد النيتروجين · كتلة عمود الغبار',
    },
    targetSectors: ['healthcare', 'tourism', 'municipalities', 'government', 'exporting', 'sustainability'],
    sampleHighlight: {
      label: { en: 'Sample Optical Depth (Gulf Port AOI)', ar: 'عمق بصري نموذجي (ميناء الخليج)' },
      value: '0.64',
      unit: 'AOD',
      context: { en: 'Sample Sandbox Baseline · Not live telemetry', ar: 'خط أساس تجريبي · ليس قياساً حياً' },
    },
    imagePath: '/src/assets/images/urban_heat_corridor_1794680963384.jpg',
  },
  {
    id: 'esg-reporting',
    index: '05',
    title: {
      en: 'ESG & Climate Disclosure Reporting',
      ar: 'تقارير الاستدامة والإفصاح المناخي (ESG)',
    },
    shortTitle: {
      en: 'ESG Reporting',
      ar: 'تقارير الاستدامة',
    },
    tagline: {
      en: 'Audit-ready physical risk packs aligned with ISSB IFRS S2, CSRD, and TCFD.',
      ar: 'حزم إفصاح مخاطر فيزيائية جاهزة للتدقيق ومتوافقة مع ISSB S2 و CSRD و TCFD.',
    },
    description: {
      en: 'Translates multi-sensor geospatial indicators into standardized portfolio exposure schedules, provenance logs, and downloadable disclosure appendices.',
      ar: 'يحول المؤشرات الجيومكانية متعددة المستشعرات إلى جداول تعرض موحدة للمحافظ وسجلات مصدرية وملاحق إفصاح قابلة للتنزيل.',
    },
    mechanism: {
      en: 'Aggregates multi-module asset coordinates against harmonized satellite provenance records and disclosure templates.',
      ar: 'يجمع إحداثيات الأصول عبر الوحدات السبع مع سجلات موثوقة لمصادر الأقمار الصناعية وقوالب الإفصاح المعتمدة.',
    },
    outcome: {
      en: 'Accelerates annual sustainability reporting for banks, institutional investors, exporters, and listed enterprises.',
      ar: 'يسرع تقارير الاستدامة السنوية للبنوك والمستثمرين والمصدرين والشركات المدرجة.',
    },
    satelliteSources: ['TROPOMI', 'GRACE-FO', 'MERRA-2', 'NASA POWER'],
    primaryVariables: {
      en: 'Physical Risk Exposure Index · Water Stress Flag · Heat & Flood Hazard Tier',
      ar: 'مؤشر التعرض للمخاطر الفيزيائية · مؤشر الإجهاد المائي · مستوى مخاطر الحرارة والسيول',
    },
    targetSectors: ['sustainability', 'banking', 'investment', 'real-estate', 'exporting', 'government'],
    sampleHighlight: {
      label: { en: 'Sample Exposure Score (Alexandria AOI)', ar: 'مؤشر تعرض نموذجي (الإسكندرية)' },
      value: '46.0',
      unit: 'pts',
      context: { en: 'Sample Sandbox Baseline · Not live telemetry', ar: 'خط أساس تجريبي · ليس قياساً حياً' },
    },
    imagePath: '/src/assets/images/sat_delta_monitoring_1794680963485.jpg',
  },
  {
    id: 'water-monitoring',
    index: '06',
    title: {
      en: 'Water & Basin Monitoring',
      ar: 'مراقبة المياه والأحواض المائية',
    },
    shortTitle: {
      en: 'Water Monitoring',
      ar: 'مراقبة المياه',
    },
    tagline: {
      en: 'Surface water extent, precipitation anomalies, and aquifer storage balance.',
      ar: 'رصد امتداد المياه السطحية وشذوذ الأمطار وتوازن المخزون الجوفي.',
    },
    description: {
      en: 'Unifies hydrological signals from basin precipitation down to canal-fed irrigation districts and arid groundwater reserves.',
      ar: 'يوحد الإشارات الهيدرولوجية من معدلات أمطار الأحواض وصولاً إلى مناطق الري المرتبطة بالترع واحتياطيات المياه الجوفية.',
    },
    mechanism: {
      en: 'Pairs GRACE-FO terrestrial water mass anomalies with GPM IMERG precipitation, SMAP moisture, and Landsat water masks.',
      ar: 'يربط شذوذ الكتلة المائية من GRACE-FO مع أمطار GPM IMERG ورطوبة SMAP وأقنعة المياه السطحية من Landsat.',
    },
    outcome: {
      en: 'Supports allocation planning for irrigation authorities, sovereign water ministries, and water-intensive estates.',
      ar: 'يدعم تخطيط توزيع المياه لهيئات الري ووزارات الموارد المائية والمشاريع كثيفة الاستهلاك المائي.',
    },
    satelliteSources: ['GRACE-FO', 'GPM', 'SMAP', 'Sentinel-6', 'Landsat'],
    primaryVariables: {
      en: 'Terrestrial Water Anomaly (cm) · Surface Moisture (m³/m³) · IMERG Rainfall (mm)',
      ar: 'شذوذ المياه الأرضية (سم) · الرطوبة السطحية · أمطار IMERG (مم)',
    },
    targetSectors: ['irrigation', 'agriculture', 'government', 'municipalities', 'tourism', 'investment'],
    sampleHighlight: {
      label: { en: 'Sample Moisture Index (Upper Basin AOI)', ar: 'مؤشر رطوبة نموذجي (الحوض العلوي)' },
      value: '0.22',
      unit: 'm³/m³',
      context: { en: 'Sample Sandbox Baseline · Not live telemetry', ar: 'خط أساس تجريبي · ليس قياساً حياً' },
    },
    imagePath: '/src/assets/images/agro_multispectral_scan_1794680962356.jpg',
  },
  {
    id: 'trend-alerts',
    index: '07',
    title: {
      en: 'Coordinate-Based Trend Alerts',
      ar: 'تنبيهات الاتجاهات حسب الإحداثيات',
    },
    shortTitle: {
      en: 'Trend Alerts',
      ar: 'تنبيهات الإحداثيات',
    },
    tagline: {
      en: 'Automated geofence threshold rules and multi-year anomaly drift notifications.',
      ar: 'قواعد عتبات تلقائية للنطاقات الجغرافية وإشعارات انحراف الاتجاهات.',
    },
    description: {
      en: 'Registers exact latitude/longitude polygons and notifies risk, operations, or underwriting teams whenever indicators cross historical baselines.',
      ar: 'يسجل إحداثيات الطول والعرض الدقيقة وينبه فرق المخاطر والعمليات والاكتتاب فور تجاوز المؤشرات لخطوط الأساس التاريخية.',
    },
    mechanism: {
      en: 'Evaluates incoming multi-sensor time series against user-defined coordinate radii and dispatches webhook or email triggers.',
      ar: 'يقيم السلاسل الزمنية الواردة مقابل أنصاف أقطار الإحداثيات المحددة ويرسل إشعارات عبر Webhook أو البريد.',
    },
    outcome: {
      en: 'Turns passive satellite archives into real-time operational guardrails across distributed enterprise portfolios.',
      ar: 'يحول أرشيفات الأقمار الصناعية إلى ضوابط تشغيلية استباقية عبر محافظ المؤسسات الموزعة.',
    },
    satelliteSources: ['NASA POWER', 'MERRA-2', 'GPM', 'MODIS'],
    primaryVariables: {
      en: 'Threshold Breach Status · Baseline Z-Score · Webhook Dispatch Latency',
      ar: 'حالة تجاوز العتبة · الانحراف عن خط الأساس · استجابة التنبيه',
    },
    targetSectors: ['insurance', 'banking', 'agriculture', 'municipalities', 'exporting', 'healthcare'],
    sampleHighlight: {
      label: { en: 'Active Sandbox Geofence Rules', ar: 'قواعد المراقبة الجغرافية النموذجية' },
      value: '4',
      unit: 'rules',
      context: { en: 'Interactive SQLite-backed rule engine', ar: 'محرك قواعد تفاعلي مرتبط بقاعدة البيانات' },
    },
    imagePath: '/src/assets/images/sat_delta_monitoring_1794680963485.jpg',
  },
];

export const SECTORS: SectorSpec[] = [
  {
    id: 'real-estate',
    title: { en: 'Real Estate & Urban Development', ar: 'العقارات والتطوير العمراني' },
    summary: {
      en: 'Site selection, coastal elevation risk screening, and thermal comfort benchmarking for masterplans.',
      ar: 'اختيار المواقع وفحص مخاطر الارتفاعات الساحلية وقياس الراحة الحرارية للمخططات العمرانية.',
    },
    keyModules: ['delta-risk', 'urban-heat', 'esg-reporting'],
    decisionWorkflow: {
      en: 'Screen parcel coordinates before land acquisition and model 10-year heat and shoreline drift exposure.',
      ar: 'فحص إحداثيات الأراضي قبل الاستحواذ ونمذجة التعرض الحراري وانجراف السواحل.',
    },
    complianceFocus: { en: 'Green building thermal baselines & physical asset disclosures', ar: 'خطوط الأساس الحرارية للمباني الخضراء وإفصاحات الأصول' },
    deliverable: { en: 'Parcel Physical Risk Dossier', ar: 'ملف المخاطر الفيزيائية للقطعة' },
  },
  {
    id: 'banking',
    title: { en: 'Banking & Credit Underwriting', ar: 'البنوك والائتمان المصرفي' },
    summary: {
      en: 'Geospatial collateral stress testing for agricultural loans, coastal mortgages, and corporate portfolios.',
      ar: 'اختبار إجهاد الضمانات العقارية والزراعية وتقييم مخاطر محافظ الائتمان.',
    },
    keyModules: ['esg-reporting', 'delta-risk', 'crop-health'],
    decisionWorkflow: {
      en: 'Map borrower asset coordinates against water scarcity, heat stress, and delta inundation tiers.',
      ar: 'ربط إحداثيات أصول المقترضين بمستويات ندرة المياه والإجهاد الحراري ومخاطر الدلتا.',
    },
    complianceFocus: { en: 'Central bank climate stress-test templates & ISSB S2', ar: 'نماذج اختبارات الإجهاد المناخي للبنوك المركزية و ISSB S2' },
    deliverable: { en: 'Portfolio Collateral Heat-Map Pack', ar: 'حزمة خرائط مخاطر الضمانات' },
  },
  {
    id: 'investment',
    title: { en: 'Institutional Investment & Funds', ar: 'الاستثمار المؤسسي والصناديق' },
    summary: {
      en: 'Independent Earth-observation due diligence for infrastructure, agribusiness, and private equity assets.',
      ar: 'فحص نافٍ للجهالة عبر رصد الأرض لصناديق البنية التحتية والزراعة والأسهم الخاصة.',
    },
    keyModules: ['esg-reporting', 'water-monitoring', 'crop-health'],
    decisionWorkflow: {
      en: 'Verify multi-year vegetation, water balance, and heat trends prior to capital deployment.',
      ar: 'التحقق من اتجاهات الغطاء النباتي والميزان المائي والحرارة لعدة سنوات قبل ضخ رأس المال.',
    },
    complianceFocus: { en: 'SFDR Principal Adverse Impacts & TCFD scenario data', ar: 'مؤشرات التأثير السلبي SFDR وبيانات سيناريوهات TCFD' },
    deliverable: { en: 'Pre-Acquisition Climate Due Diligence Brief', ar: 'موجز العناية الواجبة المناخية قبل الاستحواذ' },
  },
  {
    id: 'agriculture',
    title: { en: 'Commercial Agriculture', ar: 'الزراعة التجارية الكبرى' },
    summary: {
      en: 'Field-level vegetation vigor, evapotranspiration anomalies, and soil moisture tracking across seasons.',
      ar: 'متابعة حيوية المحاصيل وشذوذ البخر-نتح ورطوبة التربة على مستوى الحقول والمواسم.',
    },
    keyModules: ['crop-health', 'water-monitoring', 'trend-alerts'],
    decisionWorkflow: {
      en: 'Detect under-irrigated pivots and thermal crop stress early via automated coordinate alerts.',
      ar: 'اكتشاف نقص الري والإجهاد الحراري للمحاصيل مبكراً عبر تنبيهات الإحداثيات التلقائية.',
    },
    complianceFocus: { en: 'Sustainable land stewardship & water-use efficiency logs', ar: 'سجلات كفاءة استخدام المياه والإدارة المستدامة للأراضي' },
    deliverable: { en: 'Seasonal Agronomic Anomaly Feed', ar: 'تغذية الشذوذ الزراعي الموسمي' },
  },
  {
    id: 'exporting',
    title: { en: 'Agri-Exporting & Supply Chains', ar: 'التصدير الزراعي وسلاسل الإمداد' },
    summary: {
      en: 'Origin verification, harvest timing intelligence, and EU/global deforestation & climate compliance.',
      ar: 'التحقق من المنشأ واستشراف توقيت الحصاد والامتثال البيئي لمتطلبات التصدير العالمية.',
    },
    keyModules: ['crop-health', 'esg-reporting', 'air-dust'],
    decisionWorkflow: {
      en: 'Monitor supplier farm clusters for heatwaves, dust events, and yield continuity before shipment contracts.',
      ar: 'مراقبة تجمعات مزارع الموردين لموجات الحر والغبار واستمرارية الإنتاج قبل عقود الشحن.',
    },
    complianceFocus: { en: 'CSRD supply-chain traceability & exporter ESG packs', ar: 'تتبع سلاسل التوريد CSRD وحزم استدامة المصدرين' },
    deliverable: { en: 'Exporter Origin & Climate Certificate', ar: 'شهادة المنشأ والمناخ للمصدرين' },
  },
  {
    id: 'irrigation',
    title: { en: 'Irrigation & Water Utilities', ar: 'الري ومرافق الموارد المائية' },
    summary: {
      en: 'Basin-wide moisture deficits, groundwater mass shifts, and precipitation anomaly forecasting.',
      ar: 'رصد عجز الرطوبة على مستوى الأحواض وتغيرات الكتلة الجوفية وشذوذ الهطول.',
    },
    keyModules: ['water-monitoring', 'crop-health', 'trend-alerts'],
    decisionWorkflow: {
      en: 'Reallocate canal schedules based on SMAP root-zone dryness and ECOSTRESS evaporative stress.',
      ar: 'إعادة جدولة توزيع المياه استناداً إلى جفاف منطقة الجذور من SMAP وإجهاد البخر من ECOSTRESS.',
    },
    complianceFocus: { en: 'National water accounting & drought preparedness', ar: 'المحاسبة المائية الوطنية والاستعداد للجفاف' },
    deliverable: { en: 'Basin Hydrological Balance Report', ar: 'تقرير التوازن الهيدرولوجي للحوض' },
  },
  {
    id: 'government',
    title: { en: 'National Ministries & Agencies', ar: 'الوزارات والهيئات الحكومية' },
    summary: {
      en: 'Sovereign geospatial observatories for food security, coastal protection, and NDC climate tracking.',
      ar: 'مراصد جيومكانية سيادية للأمن الغذائي وحماية السواحل ومتابعة المساهمات المحددة وطنياً.',
    },
    keyModules: ['delta-risk', 'water-monitoring', 'air-dust', 'esg-reporting'],
    decisionWorkflow: {
      en: 'Maintain unified multi-governorate climate telemetry across 10 open and commercial satellite streams.',
      ar: 'إدارة قياسات مناخية موحدة عبر المحافظات بالربط مع 10 مصادر فضائية قياسية.',
    },
    complianceFocus: { en: 'UNFCCC National Communications & SDG 13 indicators', ar: 'البلاغات الوطنية للاتفاقية الإطارية ومؤشرات الهدف 13' },
    deliverable: { en: 'Sovereign Climate Observatory Feed', ar: 'تغذية المرصد المناخي السيادي' },
  },
  {
    id: 'municipalities',
    title: { en: 'Municipalities & Smart Cities', ar: 'البلديات والمدن الذكية' },
    summary: {
      en: 'Neighborhood thermal mapping, urban air corridor tracking, and stormwater flood readiness.',
      ar: 'رسم خرائط الحرارة على مستوى الأحياء وتتبع ممرات الهواء والجاهزية لمخاطر السيول.',
    },
    keyModules: ['urban-heat', 'air-dust', 'trend-alerts'],
    decisionWorkflow: {
      en: 'Prioritize tree-canopy cooling and reflective roofing in districts with the steepest thermal deltas.',
      ar: 'تحديد أولويات التشجير والأسطح العاكسة في الأحياء الأعلى في الفارق الحراري.',
    },
    complianceFocus: { en: 'Local Climate Action Plans & urban resilience audits', ar: 'خطط العمل المناخي المحلية وتدقيق مرونة المدن' },
    deliverable: { en: 'District Thermal & Air Action Atlas', ar: 'أطلس العمل الحراري وجودة الهواء للأحياء' },
  },
  {
    id: 'insurance',
    title: { en: 'Insurance & Reinsurance', ar: 'التأمين وإعادة التأمين' },
    summary: {
      en: 'Parametric trigger design, coastal hazard pricing, and post-event geospatial loss verification.',
      ar: 'تصميم مؤشرات التأمين البارامتري وتسعير الأخطار الساحلية والتحقق من الأضرار.',
    },
    keyModules: ['delta-risk', 'trend-alerts', 'water-monitoring'],
    decisionWorkflow: {
      en: 'Calibrate parametric thresholds on GPM rainfall, Sentinel-6 surge proxies, and MODIS crop anomalies.',
      ar: 'معايرة العتبات البارامترية على أمطار GPM وارتفاع سطح البحر من Sentinel-6 وشذوذ المحاصيل.',
    },
    complianceFocus: { en: 'Actuarial hazard transparency & Solvency climate addenda', ar: 'شفافية التسعير الإكتواري وملاحق الملاءة المناخية' },
    deliverable: { en: 'Parametric Trigger Verification Log', ar: 'سجل التحقق من عتبات التأمين البارامتري' },
  },
  {
    id: 'healthcare',
    title: { en: 'Healthcare Systems & Public Health', ar: 'الرعاية الصحية والصحة العامة' },
    summary: {
      en: 'Early warning correlations for extreme heatwaves, dust storms, and NO2 respiratory burden.',
      ar: 'إنذار مبكر لارتباط موجات الحر والعواصف الغبارية وتركيزات NO2 بالأعباء التنفسية.',
    },
    keyModules: ['air-dust', 'urban-heat', 'trend-alerts'],
    decisionWorkflow: {
      en: 'Alert hospital networks ahead of combined thermal and particulate-matter spikes by district.',
      ar: 'تنبيه شبكات المستشفيات قبل ذروات الحرارة والجسيمات العالقة على مستوى الأحياء.',
    },
    complianceFocus: { en: 'Climate-health preparedness & hospital surge readiness', ar: 'الجاهزية المناخية الصحية واستعداد الطوارئ' },
    deliverable: { en: 'District Heat & Respiratory Risk Bulletin', ar: 'نشرة مخاطر الحرارة والجهاز التنفسي' },
  },
  {
    id: 'tourism',
    title: { en: 'Coastal & Heritage Tourism', ar: 'السياحة الساحلية والتراثية' },
    summary: {
      en: 'Resort shoreline stability, seasonal thermal comfort indexing, and dust visibility advisories.',
      ar: 'متابعة استقرار شواطئ المنتجعات ومؤشرات الراحة الحرارية وتنبيهات صفاء الأجواء.',
    },
    keyModules: ['delta-risk', 'urban-heat', 'air-dust'],
    decisionWorkflow: {
      en: 'Protect coastal resort infrastructure and optimize outdoor excursion windows around dust and heat forecasts.',
      ar: 'حماية البنية التحتية الساحلية للمنتجعات وتخطيط الأنشطة المفتوحة وفق توقعات الحرارة والغبار.',
    },
    complianceFocus: { en: 'Sustainable destination certification & coastal asset care', ar: 'شهادات الوجهات السياحية المستدامة وحماية السواحل' },
    deliverable: { en: 'Destination Climate Comfort Briefing', ar: 'موجز الراحة المناخية للوجهات السياحية' },
  },
  {
    id: 'sustainability',
    title: { en: 'Sustainability & ESG Advisory', ar: 'استشارات الاستدامة والتقارير' },
    summary: {
      en: 'Multi-client workspace console for standardized physical climate risk and natural capital audits.',
      ar: 'منصة عمل متعددة العملاء لتدقيق المخاطر المناخية الفيزيائية ورأس المال الطبيعي.',
    },
    keyModules: ['esg-reporting', 'crop-health', 'water-monitoring', 'urban-heat'],
    decisionWorkflow: {
      en: 'Generate repeatable bilingual client disclosures directly from verified coordinate datasets.',
      ar: 'إصدار تقارير إفصاح ثنائية اللغة قابلة للتكرار استناداً إلى إحداثيات الأصول.',
    },
    complianceFocus: { en: 'ISSB S2, CSRD ESRS E1/E4, TNFD, and GRI 303/305', ar: 'معايير ISSB S2 و CSRD و TNFD و GRI' },
    deliverable: { en: 'Multi-Framework Bilingual ESG Pack', ar: 'حزمة الإفصاح ثنائية اللغة متعددة المعايير' },
  },
];

export const UI_COPY = {
  brand: { en: 'CLIMATO', ar: 'كليماتو' },
  nav: {
    detective: { en: 'Trend Detective', ar: 'محقق الاتجاهات' },
    research: { en: 'Research Hub', ar: 'مركز الأبحاث' },
    platform: { en: 'Platform', ar: 'المنصة' },
    modules: { en: 'Solutions', ar: 'الحلول' },
    sectors: { en: 'Sectors', ar: 'القطاعات' },
    dashboard: { en: 'Platform', ar: 'المنصة' },
    developers: { en: 'API', ar: 'واجهة API' },
    pricing: { en: 'Enterprise', ar: 'الأعمال' },
    requestDemo: { en: 'Request Demo', ar: 'اطلب عرضاً' },
  },
  workspaceNav: {
    detective: { en: 'Trend Detective', ar: 'محقق الاتجاهات' },
    research: { en: 'Research & Data Hub', ar: 'مركز البيانات والأبحاث' },
    overview: { en: 'Analytics Console', ar: 'لوحة التحليلات' },
    workspaces: { en: 'Customer Workspaces', ar: 'مساحات العملاء' },
    reports: { en: 'ESG & Climate Reports', ar: 'التقارير والإفصاح' },
    alerts: { en: 'Trend Alerts', ar: 'تنبيهات الإحداثيات' },
    api: { en: 'Developer API', ar: 'واجهة البرمجة' },
    pricing: { en: 'B2B Plans', ar: 'باقات الأعمال' },
    contact: { en: 'Contact & Demo', ar: 'التواصل والعرض' },
  },
  dataBanner: {
    label: {
      en: 'Sample Demonstration Mode — Placeholder geospatial datasets shown; live satellite ingestion connectors are staged for credentialed deployment.',
      ar: 'وضع العرض النموذجي — البيانات المعروضة نماذج تجريبية وليست قياسات فضائية حية؛ موصلات الأقمار الصناعية جاهزة للربط المرحلي.',
    },
  },
  hero: {
    kicker: {
      en: 'Geospatial Climate Intelligence · Focused on Egypt & The Nile Delta',
      ar: 'ذكاء مناخي جيومكاني من المدار · مخصص لمصر ودلتا النيل',
    },
    headline: {
      en: 'Planetary Observation, Calibrated for Egypt’s Climate Frontier',
      ar: 'رصد الأرض من الفضاء... برؤية مناخية دقيقة لمصر',
    },
    subheadline: {
      en: 'From Nile Delta coastlines to Cairo’s thermal corridors and Upper Egypt’s basins, CLIMATO transforms multi-satellite telemetry into decisive risk, agricultural, and ESG intelligence.',
      ar: 'من سواحل دلتا النيل إلى الممرات الحرارية بالقاهرة وأحواض المياه بصعيد مصر، تحول كليماتو بيانات الأقمار الصناعية إلى ذكاء استراتيجي للمخاطر والزراعة والاستدامة.',
    },
    primaryCta: { en: 'Explore Platform Preview', ar: 'استكشف معاينة المنصة' },
    secondaryCta: { en: 'Request Demo', ar: 'اطلب عرضاً مؤسسياً' },
  },
  pricing: {
    title: { en: 'B2B Subscription Tiers & Custom Deliverables', ar: 'باقات اشتراك الأعمال والتقارير المخصصة' },
    subtitle: {
      en: 'Transparent capability limits without fabricated pricing claims. Select a tier structure or commission bespoke geospatial reports.',
      ar: 'هيكلة واضحة للقدرات وحدود الاستخدام دون أسعار افتراضية. اختر الباقة المناسبة لمؤسستك أو اطلب تقريراً جيومكانياً مخصصاً.',
    },
    tiers: [
      {
        id: 'sandbox',
        name: { en: 'Explorer Sandbox', ar: 'بيئة الاستكشاف' },
        audience: { en: 'For evaluation & technical scoping', ar: 'للتقييم الفني ودراسة الجدوى' },
        commercialLabel: { en: 'Evaluation Agreement', ar: 'اتفاقية تقييم فني' },
        aoiLimit: { en: 'Up to 3 Sample AOIs', ar: 'حتى 3 مناطق اهتمام نموذجية' },
        cadence: { en: 'Sample quarterly archive', ar: 'أرشيف فصلي نموذجي' },
        apiQuota: { en: 'Sandbox REST preview', ar: 'معاينة تجريبية لواجهة API' },
        modules: { en: 'All 7 modules (demo dataset)', ar: 'الوحدات السبع (بيانات تجريبية)' },
        cta: { en: 'Launch Dashboard', ar: 'افتح لوحة التحكم' },
      },
      {
        id: 'sector-pro',
        name: { en: 'Sector Pro', ar: 'الباقة القطاعية الاحترافية' },
        audience: { en: 'For single-sector risk, agro, or municipal teams', ar: 'لفرق المخاطر والزراعة والبلديات' },
        commercialLabel: { en: 'Annual B2B Subscription (Custom Quote)', ar: 'اشتراك سنوي للأعمال (عرض مخصص)' },
        aoiLimit: { en: '25 Monitored AOIs · Custom polygons', ar: '25 منطقة مراقبة · مضلعات مخصصة' },
        cadence: { en: 'Staged multi-satellite refresh', ar: 'تحديث مرحلي متعدد الأقمار' },
        apiQuota: { en: 'Production REST & Webhook alerts', ar: 'واجهة API وإشعارات Webhook' },
        modules: { en: 'Up to 4 active intelligence modules', ar: 'حتى 4 وحدات ذكاء مناخي نشطة' },
        cta: { en: 'Request Sector Quote', ar: 'اطلب عرض الباقة القطاعية' },
      },
      {
        id: 'enterprise',
        name: { en: 'Enterprise & Sovereign', ar: 'المؤسسات والجهات السيادية' },
        audience: { en: 'For banks, insurers, ministries & multi-region portfolios', ar: 'للبنوك وشركات التأمين والوزارات' },
        commercialLabel: { en: 'Enterprise License & SLA', ar: 'ترخيص مؤسسي واتفاقية مستوى خدمة' },
        aoiLimit: { en: '100+ AOIs & national grids', ar: 'أكثر من 100 منطقة وشبكات وطنية' },
        cadence: { en: 'Priority ingestion pipeline & historical depth', ar: 'أولوية معالجة البيانات والأرشيف التاريخي' },
        apiQuota: { en: 'Dedicated API throughput + SSO', ar: 'سعة API مخصصة وتسجيل دخول موحد' },
        modules: { en: 'All 7 modules + custom ESG templates', ar: 'جميع الوحدات السبع + قوالب ESG مخصصة' },
        cta: { en: 'Schedule Architecture Call', ar: 'احجز جلسة معمارية' },
      },
    ],
  },
};
