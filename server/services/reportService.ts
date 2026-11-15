import { db } from '../db/database.ts';
import { DEFAULT_STUDY_REGIONS, SCIENTIFIC_DATASETS } from '../data/scientificCatalog.ts';
import { haversineKm } from './geospatialEngine.ts';
import { analyzeTimeSeriesTrends } from './trendAnalysisEngine.ts';

export interface ReportRecordRow {
  id: string;
  workspace_id: string;
  organization_name: string;
  sector: string;
  standard: string;
  module_ids: string;
  lat: number;
  lon: number;
  report_type: string;
  status: string;
  data_provenance: string;
  report_payload_json?: string | null;
  study_region_id?: string | null;
  created_at: string;
}

export interface ScientificReportSummary {
  studyRegion: {
    id: string;
    nameEn: string;
    nameAr: string;
    bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
    approxAreaKm2: number;
    withinBoundingBox: boolean;
  };
  periodCovered: {
    startDate: string | null;
    endDate: string | null;
  };
  trendSummaries: Array<{
    datasetId: string;
    productId: string;
    variableName: string;
    unit: string;
    provenanceType: string;
    validObservations: number;
    coveragePct: number;
    status: string;
    trendDirection: string;
    mannKendallZ: number | null;
    pValueTwoSided: number | null;
    hamedRaoModifiedPValue: number | null;
    theilSenSlopePerYear: number | null;
    ci95LowerPerYear: number | null;
    ci95UpperPerYear: number | null;
    scaleLimitation: string;
  }>;
  methodology: string;
  limitations: string[];
  demonstrationDisclosure: string;
}

export function buildEnrichedReportBundle(report: ReportRecordRow): {
  disclaimer: string;
  isSampleData: boolean;
  dataProvenance: string;
  report: Omit<ReportRecordRow, 'report_payload_json'>;
  scientificSummary: ScientificReportSummary;
  sampleObservationsIncluded: Array<Record<string, unknown>>;
  exportedAt: string;
} {
  const regionRows = db.prepare('SELECT * FROM study_regions').all() as Array<Record<string, unknown>>;
  const regions =
    regionRows.length > 0
      ? regionRows.map((r) => ({
          id: String(r.id),
          nameEn: String(r.name_en),
          nameAr: String(r.name_ar),
          centerLat: Number(r.center_lat),
          centerLon: Number(r.center_lon),
          minLat: Number(r.min_lat),
          maxLat: Number(r.max_lat),
          minLon: Number(r.min_lon),
          maxLon: Number(r.max_lon),
          approxAreaKm2: Number(r.approx_area_km2),
        }))
      : DEFAULT_STUDY_REGIONS.map((r) => ({
          id: r.id,
          nameEn: r.nameEn,
          nameAr: r.nameAr,
          centerLat: r.centerLat,
          centerLon: r.centerLon,
          minLat: r.minLat,
          maxLat: r.maxLat,
          minLon: r.minLon,
          maxLon: r.maxLon,
          approxAreaKm2: r.approxAreaKm2,
        }));

  let matchedRegion = report.study_region_id
    ? regions.find((r) => r.id === report.study_region_id)
    : undefined;
  let insideBbox = false;

  if (!matchedRegion) {
    matchedRegion = regions.find(
      (r) =>
        report.lat >= r.minLat &&
        report.lat <= r.maxLat &&
        report.lon >= r.minLon &&
        report.lon <= r.maxLon
    );
    insideBbox = Boolean(matchedRegion);
  } else {
    insideBbox =
      report.lat >= matchedRegion.minLat &&
      report.lat <= matchedRegion.maxLat &&
      report.lon >= matchedRegion.minLon &&
      report.lon <= matchedRegion.maxLon;
  }

  if (!matchedRegion) {
    matchedRegion = regions.reduce((best, curr) => {
      const dBest = haversineKm(report.lat, report.lon, best.centerLat, best.centerLon);
      const dCurr = haversineKm(report.lat, report.lon, curr.centerLat, curr.centerLon);
      return dCurr < dBest ? curr : best;
    }, regions[0]);
  }

  const trendSummaries: ScientificReportSummary['trendSummaries'] = [];
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  let hasRealSciData = false;

  for (const ds of SCIENTIFIC_DATASETS) {
    const obsRows = db
      .prepare(
        `SELECT obs_date, year, month, normalized_value, is_missing, provenance_type
         FROM scientific_observations
         WHERE region_id = ? AND dataset_id = ? AND provenance_type IN ('LIVE_NASA_EARTHDATA', 'IMPORTED_OBSERVATIONS')
         ORDER BY obs_date ASC`
      )
      .all(matchedRegion.id, ds.id) as Array<{
      obs_date: string;
      year: number;
      month: number;
      normalized_value: number | null;
      is_missing: number;
      provenance_type: string;
    }>;

    if (obsRows.length > 0) {
      hasRealSciData = true;
      const pts = obsRows.map((o) => ({
        obsDate: o.obs_date,
        year: o.year,
        month: o.month,
        value: o.is_missing ? null : o.normalized_value,
      }));
      const trend = analyzeTimeSeriesTrends(pts, ds.normalizedUnit, { expectedSteps: pts.length });
      if (trend.diagnostics.startDate && (!minStart || trend.diagnostics.startDate < minStart)) {
        minStart = trend.diagnostics.startDate;
      }
      if (trend.diagnostics.endDate && (!maxEnd || trend.diagnostics.endDate > maxEnd)) {
        maxEnd = trend.diagnostics.endDate;
      }
      trendSummaries.push({
        datasetId: ds.id,
        productId: ds.productId,
        variableName: ds.variableNameEn,
        unit: ds.normalizedUnit,
        provenanceType: obsRows[obsRows.length - 1].provenance_type,
        validObservations: trend.diagnostics.validObservations,
        coveragePct: trend.diagnostics.coveragePct,
        status: trend.status,
        trendDirection: trend.mannKendall.trendDirection,
        mannKendallZ: trend.mannKendall.zScore,
        pValueTwoSided: trend.mannKendall.pValueTwoSided,
        hamedRaoModifiedPValue: trend.mannKendall.modifiedPValueTwoSided,
        theilSenSlopePerYear: trend.theilSen.slopePerYear,
        ci95LowerPerYear: trend.theilSen.ci95LowerPerYear,
        ci95UpperPerYear: trend.theilSen.ci95UpperPerYear,
        scaleLimitation: ds.scaleLimitationEn,
      });
    } else {
      trendSummaries.push({
        datasetId: ds.id,
        productId: ds.productId,
        variableName: ds.variableNameEn,
        unit: ds.normalizedUnit,
        provenanceType: 'INSUFFICIENT_DATA',
        validObservations: 0,
        coveragePct: 0,
        status: 'INSUFFICIENT_DATA',
        trendDirection: 'UNDETERMINED',
        mannKendallZ: null,
        pValueTwoSided: null,
        hamedRaoModifiedPValue: null,
        theilSenSlopePerYear: null,
        ci95LowerPerYear: null,
        ci95UpperPerYear: null,
        scaleLimitation: ds.scaleLimitationEn,
      });
    }
  }

  const sampleObservations = db
    .prepare(
      `SELECT o.* FROM sample_observations o
       JOIN aoi_locations a ON o.aoi_id = a.id
       WHERE a.workspace_id = ?
       ORDER BY o.id ASC
       LIMIT 32`
    )
    .all(report.workspace_id) as Array<Record<string, unknown>>;

  const provenance = hasRealSciData ? 'MIXED_SCIENTIFIC_AND_SAMPLE' : report.data_provenance || 'SAMPLE_DEMONSTRATION';
  const disclaimer = hasRealSciData
    ? 'SCIENTIFIC & DISCLOSURE PACK — Includes persisted NASA Earthdata/imported trend metrics alongside workspace sample telemetry. Review spatial resolution limitations before regulatory filing.'
    : 'SAMPLE DEMONSTRATION REPORT — Generated from platform sandbox records. Configure NASA_EARTHDATA_TOKEN or import verified Giovanni/AppEEARS series for audited disclosures.';

  const { report_payload_json: _ignored, ...cleanReport } = report;

  return {
    disclaimer,
    isSampleData: !hasRealSciData,
    dataProvenance: provenance,
    report: cleanReport,
    scientificSummary: {
      studyRegion: {
        id: matchedRegion.id,
        nameEn: matchedRegion.nameEn,
        nameAr: matchedRegion.nameAr,
        bbox: {
          minLat: matchedRegion.minLat,
          maxLat: matchedRegion.maxLat,
          minLon: matchedRegion.minLon,
          maxLon: matchedRegion.maxLon,
        },
        approxAreaKm2: matchedRegion.approxAreaKm2,
        withinBoundingBox: insideBbox,
      },
      periodCovered: {
        startDate: minStart,
        endDate: maxEnd,
      },
      trendSummaries,
      methodology:
        'Non-parametric Mann-Kendall monotonic trend test with tie-adjusted variance, Hamed-Rao (1998) lag-1 autocorrelation modification, and Theil-Sen median slope with 95% confidence bounds (minimum n >= 10, coverage >= 70%).',
      limitations: [
        'CRS EPSG:4326 bounding-box averaging mixes adjacent pixels when sensor footprint exceeds AOI dimensions.',
        'GRACE-FO (~300 km native mascon) cannot isolate parcel or urban district groundwater mass.',
        'Statistical significance measures temporal monotonicity only and does not imply physical causation.',
      ],
      demonstrationDisclosure: hasRealSciData
        ? 'Real/imported NASA series included where ingested; workspace KPI rows remain labeled SAMPLE_DEMONSTRATION.'
        : 'DEMONSTRATION_MODE: No ingested NASA Earthdata time series exist yet for this region; trend estimates report INSUFFICIENT_DATA rather than fabricated values.',
    },
    sampleObservationsIncluded: sampleObservations,
    exportedAt: new Date().toISOString(),
  };
}

export function renderReportCsv(bundle: ReturnType<typeof buildEnrichedReportBundle>): string {
  const lines: string[] = [
    `# CLIMATO ESG & Scientific Trend Disclosure Pack`,
    `# Report ID: ${bundle.report.id}`,
    `# Organization: ${bundle.report.organization_name}`,
    `# Standard: ${bundle.report.standard}`,
    `# Study Region: ${bundle.scientificSummary.studyRegion.nameEn} (${bundle.scientificSummary.studyRegion.id})`,
    `# Data Provenance: ${bundle.dataProvenance}`,
    `# Methodology: ${bundle.scientificSummary.methodology}`,
    `# Disclosure: ${bundle.disclaimer}`,
    `# Period: ${bundle.scientificSummary.periodCovered.startDate || 'N/A'} to ${bundle.scientificSummary.periodCovered.endDate || 'N/A'}`,
  ];

  for (const t of bundle.scientificSummary.trendSummaries) {
    lines.push(
      `# Trend [${t.productId}]: status=${t.status} direction=${t.trendDirection} slope=${
        t.theilSenSlopePerYear ?? 'N/A'
      } ${t.unit}/yr CI95=[${t.ci95LowerPerYear ?? 'N/A'},${t.ci95UpperPerYear ?? 'N/A'}] p=${
        t.pValueTwoSided ?? 'N/A'
      } provenance=${t.provenanceType}`
    );
  }

  const headers = [
    'report_id',
    'workspace_id',
    'organization',
    'standard',
    'data_provenance',
    'aoi_id',
    'module_id',
    'source_name',
    'period_label',
    'metric_key',
    'metric_value',
    'unit',
  ];
  lines.push(headers.join(','));

  for (const obs of bundle.sampleObservationsIncluded) {
    lines.push(
      [
        bundle.report.id,
        bundle.report.workspace_id,
        `"${String(bundle.report.organization_name).replace(/"/g, '""')}"`,
        `"${String(bundle.report.standard).replace(/"/g, '""')}"`,
        obs.data_provenance || 'SAMPLE_DEMONSTRATION',
        obs.aoi_id,
        obs.module_id,
        `"${String(obs.source_name).replace(/"/g, '""')}"`,
        obs.period_label,
        obs.metric_key,
        obs.metric_value,
        obs.unit,
      ].join(',')
    );
  }

  return lines.join('\n');
}

function escapePdfText(input: string): string {
  // Replace non-ASCII characters with ASCII transliteration/fallback for standard Helvetica PDF Type1 encoding
  const ascii = input.replace(/[^\x20-\x7E]/g, (ch) => {
    if (ch === '°') return ' deg';
    if (ch === '—' || ch === '–') return '-';
    if (ch === '·') return '|';
    if (ch === '²') return '2';
    if (ch === '³') return '3';
    return ' ';
  });
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLines(text: string, maxChars = 88): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ` ${w}`;
    } else {
      out.push(current);
      current = w;
    }
  }
  if (current) out.push(current);
  return out.length > 0 ? out : [''];
}

export function renderReportPdf(bundle: ReturnType<typeof buildEnrichedReportBundle>): Buffer {
  const rawLines: string[] = [
    'CLIMATO GEOSPATIAL & SCIENTIFIC DISCLOSURE REPORT',
    '========================================================================',
    `Report ID:        ${bundle.report.id}`,
    `Workspace ID:     ${bundle.report.workspace_id}`,
    `Organization:     ${bundle.report.organization_name}`,
    `Sector:           ${bundle.report.sector}`,
    `Standard:         ${bundle.report.standard}`,
    `Coordinates:      ${bundle.report.lat.toFixed(4)} N, ${bundle.report.lon.toFixed(4)} E (EPSG:4326)`,
    `Study Region:     ${bundle.scientificSummary.studyRegion.nameEn} (${bundle.scientificSummary.studyRegion.id})`,
    `Data Provenance:  ${bundle.dataProvenance}`,
    `Period Covered:   ${bundle.scientificSummary.periodCovered.startDate || 'N/A'} to ${
      bundle.scientificSummary.periodCovered.endDate || 'N/A'
    }`,
    `Exported At:      ${bundle.exportedAt}`,
    '',
    'DISCLOSURE & PROVENANCE NOTICE:',
    ...wrapLines(bundle.disclaimer),
    '',
    'SCIENTIFIC TREND ANALYSES (NASA MERRA-2, GPM IMERG, GLDAS, GRACE-FO):',
    '------------------------------------------------------------------------',
  ];

  for (const t of bundle.scientificSummary.trendSummaries) {
    rawLines.push(
      `${t.productId} (${t.variableName}) | Provenance: ${t.provenanceType} | Status: ${t.status}`
    );
    rawLines.push(
      `  Samples: ${t.validObservations} (${t.coveragePct}% cov) | Slope: ${
        t.theilSenSlopePerYear !== null ? `${t.theilSenSlopePerYear} ${t.unit}/yr` : 'INSUFFICIENT_DATA'
      } | CI95: [${t.ci95LowerPerYear ?? 'N/A'}, ${t.ci95UpperPerYear ?? 'N/A'}] | p=${
        t.pValueTwoSided ?? 'N/A'
      }`
    );
    rawLines.push(...wrapLines(`  Scale Note: ${t.scaleLimitation}`, 86));
  }

  rawLines.push('', 'STATISTICAL METHODOLOGY:', ...wrapLines(bundle.scientificSummary.methodology));
  rawLines.push('', 'LIMITATIONS & UNCERTAINTIES:');
  for (const lim of bundle.scientificSummary.limitations) {
    rawLines.push(...wrapLines(`- ${lim}`, 86));
  }
  rawLines.push('', 'WORKSPACE OBSERVATION LEDGER (SAMPLE_DEMONSTRATION):');
  for (const obs of bundle.sampleObservationsIncluded.slice(0, 12)) {
    rawLines.push(
      `  ${obs.aoi_id} | ${obs.module_id} | ${obs.period_label} | ${obs.metric_key}: ${obs.metric_value} ${obs.unit}`
    );
  }

  // Paginate lines across PDF pages (max 50 lines per page)
  const linesPerPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < rawLines.length; i += linesPerPage) {
    pages.push(rawLines.slice(i, i + linesPerPage));
  }

  // Build valid PDF 1.4 objects:
  // 1: Catalog, 2: Pages, 3: Font (Helvetica), then pairs (Page N, Content N)
  const objects: string[] = [];
  const pageObjIds: number[] = [];

  // Placeholder slots for 1, 2, 3
  objects.push('');
  objects.push('');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (const pageLines of pages) {
    const pageObjId = objects.length + 1;
    const contentObjId = objects.length + 2;
    pageObjIds.push(pageObjId);

    const streamOps: string[] = ['BT', '/F1 9 Tf', '42 752 Td', '13 TL'];
    pageLines.forEach((line, idx) => {
      const escaped = escapePdfText(line);
      if (idx === 0) {
        streamOps.push(`(${escaped}) Tj`);
      } else {
        streamOps.push(`T* (${escaped}) Tj`);
      }
    });
    streamOps.push('ET');
    const streamBody = streamOps.join('\n');

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjId} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(streamBody, 'utf8')} >>\nstream\n${streamBody}\nendstream`);
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${
    pageObjIds.length
  } >>`;

  const chunks: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [0];
  let byteOffset = Buffer.byteLength(chunks[0], 'utf8');

  for (let i = 0; i < objects.length; i++) {
    offsets.push(byteOffset);
    const entry = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    chunks.push(entry);
    byteOffset += Buffer.byteLength(entry, 'utf8');
  }

  const xrefOffset = byteOffset;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (let i = 1; i <= objects.length; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  xrefLines.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
  chunks.push(...xrefLines);

  return Buffer.from(chunks.join(''), 'utf8');
}
