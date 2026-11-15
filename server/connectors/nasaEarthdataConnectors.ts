import {
  RESEARCH_SOURCES,
  SCIENTIFIC_DATASETS,
  ScientificDatasetSpec,
  StudyRegionSpec,
} from '../data/scientificCatalog.ts';

export interface RawAcquiredRecord {
  obsDate: string; // YYYY-MM-DD (first of month)
  year: number;
  month: number;
  rawValue: number | null;
  uncertainty?: number | null;
  qualityFlag: string;
  sourceGranuleRef: string;
}

export interface CmrDiscoveryResult {
  datasetId: string;
  cmrShortName: string;
  conceptId: string;
  liveReachable: boolean;
  httpStatus: number | null;
  matchedCollectionTitle?: string;
  temporalExtent?: string;
  granuleHits?: number;
  sampleGranuleIds: string[];
  queryUrl: string;
  checkedAt: string;
  errorMessage?: string;
}

export interface ConnectorAcquisitionResult {
  datasetId: ScientificDatasetSpec['id'];
  status: 'CONNECTED_LIVE' | 'PENDING_CONFIGURATION' | 'UPSTREAM_AUTH_REQUIRED' | 'UPSTREAM_ERROR';
  provenanceType: 'LIVE_NASA_EARTHDATA' | 'PENDING_CONFIGURATION';
  earthdataTokenConfigured: boolean;
  cmrDiscovery: CmrDiscoveryResult | null;
  opendapRequestTemplate: string;
  configurationSteps: string[];
  records: RawAcquiredRecord[];
  message: string;
}

export interface ProbeSourceResult {
  id: string;
  url: string;
  probeUrl: string;
  reachable: boolean;
  httpStatus: number | null;
  integrationStatus:
    | 'LIVE_REACHABLE'
    | 'PENDING_CONFIGURATION'
    | 'DISCOVERY_PORTAL'
    | 'METHODOLOGY_REFERENCE'
    | 'SUPPORTING_MISSION'
    | 'UNREACHABLE';
  note: string;
  checkedAt: string;
}

export async function probeNasaCmrCollection(
  dataset: ScientificDatasetSpec,
  region?: StudyRegionSpec,
  startDate = '2015-01-01',
  endDate = '2025-12-31'
): Promise<CmrDiscoveryResult> {
  const checkedAt = new Date().toISOString();
  const collectionUrl = `https://cmr.earthdata.nasa.gov/search/collections.json?short_name=${encodeURIComponent(
    dataset.cmrShortName
  )}&page_size=1`;

  try {
    const colRes = await fetch(collectionUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'CLIMATO-TrendDetective/2.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!colRes.ok) {
      return {
        datasetId: dataset.id,
        cmrShortName: dataset.cmrShortName,
        conceptId: dataset.cmrCollectionConceptId,
        liveReachable: false,
        httpStatus: colRes.status,
        sampleGranuleIds: [],
        queryUrl: collectionUrl,
        checkedAt,
        errorMessage: `NASA CMR collection lookup returned HTTP ${colRes.status}`,
      };
    }

    const colJson = (await colRes.json()) as {
      feed?: {
        entry?: Array<{
          id?: string;
          title?: string;
          time_start?: string;
          time_end?: string;
        }>;
      };
    };

    const entry = colJson.feed?.entry?.[0];
    const resolvedConceptId = entry?.id || dataset.cmrCollectionConceptId;

    let granuleHits: number | undefined;
    let sampleGranuleIds: string[] = [];
    let finalQueryUrl = collectionUrl;

    if (region) {
      const bbox = `${region.minLon},${region.minLat},${region.maxLon},${region.maxLat}`;
      const granUrl = `https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id=${encodeURIComponent(
        resolvedConceptId
      )}&bounding_box=${encodeURIComponent(bbox)}&temporal=${encodeURIComponent(
        `${startDate}T00:00:00Z,${endDate}T23:59:59Z`
      )}&page_size=5`;
      finalQueryUrl = granUrl;

      const granRes = await fetch(granUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'CLIMATO-TrendDetective/2.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (granRes.ok) {
        const hitsHeader = granRes.headers.get('cmr-hits');
        granuleHits = hitsHeader ? Number(hitsHeader) : undefined;
        const granJson = (await granRes.json()) as {
          feed?: { entry?: Array<{ title?: string; producer_granule_id?: string }> };
        };
        sampleGranuleIds = (granJson.feed?.entry || [])
          .map((g) => g.producer_granule_id || g.title || '')
          .filter(Boolean)
          .slice(0, 5);
      }
    }

    return {
      datasetId: dataset.id,
      cmrShortName: dataset.cmrShortName,
      conceptId: resolvedConceptId,
      liveReachable: true,
      httpStatus: colRes.status,
      matchedCollectionTitle: entry?.title,
      temporalExtent: entry?.time_start
        ? `${entry.time_start.slice(0, 10)} → ${entry.time_end ? entry.time_end.slice(0, 10) : 'Present'}`
        : dataset.coveragePeriod,
      granuleHits,
      sampleGranuleIds,
      queryUrl: finalQueryUrl,
      checkedAt,
    };
  } catch (err) {
    return {
      datasetId: dataset.id,
      cmrShortName: dataset.cmrShortName,
      conceptId: dataset.cmrCollectionConceptId,
      liveReachable: false,
      httpStatus: null,
      sampleGranuleIds: [],
      queryUrl: collectionUrl,
      checkedAt,
      errorMessage: err instanceof Error ? err.message : 'Network error reaching NASA CMR',
    };
  }
}

export function buildOpendapQueryTemplate(
  dataset: ScientificDatasetSpec,
  region: StudyRegionSpec,
  startDate: string,
  endDate: string
): string {
  const bbox = `[lat:${region.minLat.toFixed(2)}..${region.maxLat.toFixed(2)}][lon:${region.minLon.toFixed(
    2
  )}..${region.maxLon.toFixed(2)}]`;
  return `${dataset.endpointTemplate}?${dataset.targetVariableField}${bbox}&temporal=${startDate}..${endDate}`;
}

/**
 * Executes real discovery via NASA CMR (unauthenticated public API) and attempts
 * authenticated granule extraction only when NASA_EARTHDATA_TOKEN is configured.
 * Never fabricates NASA satellite measurements.
 */
export async function acquireNasaDatasetForRegion(params: {
  dataset: ScientificDatasetSpec;
  region: StudyRegionSpec;
  startDate: string;
  endDate: string;
  probeCmr?: boolean;
}): Promise<ConnectorAcquisitionResult> {
  const { dataset, region, startDate, endDate, probeCmr = true } = params;
  const token = process.env.NASA_EARTHDATA_TOKEN?.trim() || '';
  const opendapTemplate = buildOpendapQueryTemplate(dataset, region, startDate, endDate);

  const cmrDiscovery = probeCmr
    ? await probeNasaCmrCollection(dataset, region, startDate, endDate)
    : null;

  const configurationSteps = [
    '1. Register a free NASA Earthdata Login account at https://urs.earthdata.nasa.gov/users/new.',
    '2. Authorize the "NASA GESDISC DATA ARCHIVE" and "PO.DAAC Drive / Harmony" applications in Earthdata URS profile.',
    '3. Generate an Earthdata Bearer Token in Profile -> Generate Token and export NASA_EARTHDATA_TOKEN in server environment.',
    `4. Alternatively, download region-averaged monthly CSV from NASA Giovanni (${dataset.cmrShortName} · ${dataset.targetVariableField}) and upload via the Data Import workflow.`,
  ];

  if (!token) {
    return {
      datasetId: dataset.id,
      status: 'PENDING_CONFIGURATION',
      provenanceType: 'PENDING_CONFIGURATION',
      earthdataTokenConfigured: false,
      cmrDiscovery,
      opendapRequestTemplate: opendapTemplate,
      configurationSteps,
      records: [],
      message:
        `NASA_EARTHDATA_TOKEN is not configured on the server. Live CMR catalog discovery verified ${
          cmrDiscovery?.granuleHits ?? 'matching'
        } granules, while direct OPeNDAP/Harmony pixel extraction for ${dataset.productId} (${dataset.targetVariableField}) awaits Earthdata authentication or Giovanni CSV import.`,
    };
  }

  // When NASA_EARTHDATA_TOKEN is provided, validate Earthdata OPeNDAP / Harmony endpoint authorization honestly
  try {
    const testRes = await fetch(dataset.endpointTemplate, {
      method: 'HEAD',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'CLIMATO-TrendDetective/2.0',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (testRes.status === 401 || testRes.status === 403) {
      return {
        datasetId: dataset.id,
        status: 'UPSTREAM_AUTH_REQUIRED',
        provenanceType: 'PENDING_CONFIGURATION',
        earthdataTokenConfigured: true,
        cmrDiscovery,
        opendapRequestTemplate: opendapTemplate,
        configurationSteps,
        records: [],
        message: `NASA Earthdata endpoint returned HTTP ${testRes.status}. Verify your token has GES DISC / PO.DAAC URS app authorization enabled.`,
      };
    }

    // Note: Directory-level OPeNDAP granule parsing requires specific granule NetCDF/ASCII filename indexing per month.
    // Report the exact authenticated HTTP status honestly and direct to granule ASCII/Giovanni CSV ingestion if raw NetCDF binary stream isn't parsed directly.
    return {
      datasetId: dataset.id,
      status: testRes.ok ? 'CONNECTED_LIVE' : 'UPSTREAM_ERROR',
      provenanceType: testRes.ok ? 'LIVE_NASA_EARTHDATA' : 'PENDING_CONFIGURATION',
      earthdataTokenConfigured: true,
      cmrDiscovery,
      opendapRequestTemplate: opendapTemplate,
      configurationSteps,
      records: [],
      message: testRes.ok
        ? `Authenticated NASA Earthdata endpoint responded HTTP ${testRes.status}. Resolved ${
            cmrDiscovery?.granuleHits ?? 0
          } granules in CMR; import Giovanni/AppEEARS CSV or supply granule ASCII time-series for region ${region.id}.`
        : `Upstream NASA endpoint returned HTTP ${testRes.status} for ${dataset.productId}.`,
    };
  } catch (err) {
    return {
      datasetId: dataset.id,
      status: 'UPSTREAM_ERROR',
      provenanceType: 'PENDING_CONFIGURATION',
      earthdataTokenConfigured: true,
      cmrDiscovery,
      opendapRequestTemplate: opendapTemplate,
      configurationSteps,
      records: [],
      message: `Unable to complete authenticated request to ${dataset.productId}: ${
        err instanceof Error ? err.message : 'Network error'
      }`,
    };
  }
}

/**
 * Parses real exported NASA Giovanni CSV, NASA AppEEARS CSV, or clean YYYY-MM / YYYY-MM-DD time-series CSV/JSON.
 * Rejects malformed rows cleanly and preserves missing markers (-9999, NaN, blank).
 */
export function parseImportedObservationSeries(params: {
  rawText: string;
  format?: 'csv' | 'json';
  sourceLabel?: string;
}): RawAcquiredRecord[] {
  const sourceRef = params.sourceLabel?.trim() || 'USER_IMPORTED_NASA_SERIES';
  const trimmed = params.rawText.trim();
  if (!trimmed) {
    throw new Error('Uploaded observation payload is empty.');
  }

  if (params.format === 'json' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as
      | Array<Record<string, unknown>>
      | { records?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> };
    const rows = Array.isArray(parsed) ? parsed : parsed.records || parsed.data || [];
    const results: RawAcquiredRecord[] = [];
    for (const row of rows) {
      const dateRaw = String(row.date ?? row.obsDate ?? row.time ?? row.period ?? '').trim();
      const normalizedDate = normalizeYearMonthDate(dateRaw);
      if (!normalizedDate) continue;
      const valRaw = row.value ?? row.rawValue ?? row.mean ?? row.T2M ?? row.precipitation ?? row.lwe_thickness;
      const num = valRaw === null || valRaw === undefined || valRaw === '' ? null : Number(valRaw);
      const isFill = num === null || !Number.isFinite(num) || num <= -999 || Math.abs(num) >= 1e14;
      results.push({
        obsDate: normalizedDate.obsDate,
        year: normalizedDate.year,
        month: normalizedDate.month,
        rawValue: isFill ? null : num,
        uncertainty: row.uncertainty !== undefined ? Number(row.uncertainty) : null,
        qualityFlag: isFill ? 'MISSING_OR_FILL' : String(row.qualityFlag || 'IMPORTED_VALID'),
        sourceGranuleRef: String(row.granule || sourceRef),
      });
    }
    return results;
  }

  // CSV parser handling NASA Giovanni metadata comment lines (# or header preamble before Time/Date row)
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const records: RawAcquiredRecord[] = [];
  let dateColIdx = 0;
  let valueColIdx = 1;
  let uncertaintyColIdx = -1;
  let headerParsed = false;

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) continue;
    const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 2) continue;

    if (!headerParsed) {
      const lower = cols.map((c) => c.toLowerCase());
      const looksLikeHeader = lower.some((c) =>
        ['time', 'date', 'month', 'period', 'timestamp', 'mean', 'value', 't2m', 'precip', 'soil', 'lwe'].some(
          (kw) => c.includes(kw)
        )
      );
      if (looksLikeHeader) {
        const dIdx = lower.findIndex((c) => ['time', 'date', 'period', 'timestamp', 'month'].some((k) => c.includes(k)));
        const vIdx = lower.findIndex(
          (c, idx) =>
            idx !== dIdx &&
            ['mean', 'value', 't2m', 'precip', 'soil', 'lwe', 'data', 'avg'].some((k) => c.includes(k))
        );
        const uIdx = lower.findIndex((c) => c.includes('uncert') || c.includes('std') || c.includes('err'));
        dateColIdx = dIdx >= 0 ? dIdx : 0;
        valueColIdx = vIdx >= 0 ? vIdx : dateColIdx === 0 ? 1 : 0;
        uncertaintyColIdx = uIdx;
        headerParsed = true;
        continue;
      }
      headerParsed = true;
    }

    const parsedDate = normalizeYearMonthDate(cols[dateColIdx] || '');
    if (!parsedDate) continue;

    const rawToken = cols[valueColIdx];
    const num = rawToken === undefined || rawToken === '' || /^na|nan|null|-+$/i.test(rawToken) ? null : Number(rawToken);
    const isFill = num === null || !Number.isFinite(num) || num <= -999 || Math.abs(num) >= 1e14;
    const uncVal =
      uncertaintyColIdx >= 0 && cols[uncertaintyColIdx] !== undefined && cols[uncertaintyColIdx] !== ''
        ? Number(cols[uncertaintyColIdx])
        : null;

    records.push({
      obsDate: parsedDate.obsDate,
      year: parsedDate.year,
      month: parsedDate.month,
      rawValue: isFill ? null : num,
      uncertainty: uncVal !== null && Number.isFinite(uncVal) ? uncVal : null,
      qualityFlag: isFill ? 'MISSING_OR_FILL' : 'IMPORTED_VALID',
      sourceGranuleRef: sourceRef,
    });
  }

  return records;
}

function normalizeYearMonthDate(input: string): { obsDate: string; year: number; month: number } | null {
  const clean = input.trim();
  // Match YYYY-MM-DD or YYYY/MM/DD or YYYY-MM
  const m = clean.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1950 || year > 2100) {
    return null;
  }
  return {
    obsDate: `${year}-${String(month).padStart(2, '0')}-01`,
    year,
    month,
  };
}

/**
 * Live HTTP probe for the 12 Research Hub URLs. Only marks reachable if HTTP 200-399 succeeds.
 * Operational data sources remain PENDING_CONFIGURATION if required server API credentials are missing.
 */
export async function probeAllResearchSources(): Promise<ProbeSourceResult[]> {
  const hasEarthdata = Boolean(process.env.NASA_EARTHDATA_TOKEN?.trim());
  const hasNoaa = Boolean(process.env.NOAA_CDO_TOKEN?.trim());

  const checks = await Promise.all(
    RESEARCH_SOURCES.map(async (src): Promise<ProbeSourceResult> => {
      const checkedAt = new Date().toISOString();
      try {
        const res = await fetch(src.probeUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'CLIMATO-TrendDetective/2.0' },
          signal: AbortSignal.timeout(6500),
        });
        const reachable = res.status >= 200 && res.status < 400;

        let integrationStatus: ProbeSourceResult['integrationStatus'];
        let note = `Live HTTP ${res.status} verified from server.`;

        if (src.id === 'noaa-cdo') {
          integrationStatus = hasNoaa ? (reachable ? 'LIVE_REACHABLE' : 'UNREACHABLE') : 'PENDING_CONFIGURATION';
          note = hasNoaa
            ? `NOAA CDO reachable (HTTP ${res.status}) with NOAA_CDO_TOKEN configured.`
            : `NOAA CDO web portal responded HTTP ${res.status}; programmatic station API requires NOAA_CDO_TOKEN.`;
        } else if (src.id === 'nasa-ges-disc-hydrology' || src.id === 'nasa-appeears') {
          integrationStatus = hasEarthdata
            ? reachable
              ? 'LIVE_REACHABLE'
              : 'UNREACHABLE'
            : 'PENDING_CONFIGURATION';
          note = hasEarthdata
            ? `Endpoint responded HTTP ${res.status} with NASA_EARTHDATA_TOKEN configured.`
            : `Public endpoint responded HTTP ${res.status}; authenticated extraction requires NASA_EARTHDATA_TOKEN.`;
        } else if (!reachable) {
          integrationStatus = 'UNREACHABLE';
          note = `Upstream probe returned HTTP ${res.status}.`;
        } else if (src.classification === 'Data discovery or processing tool') {
          integrationStatus = 'DISCOVERY_PORTAL';
        } else if (src.classification === 'Research or methodology reference') {
          integrationStatus = 'METHODOLOGY_REFERENCE';
        } else {
          integrationStatus = 'SUPPORTING_MISSION';
        }

        return {
          id: src.id,
          url: src.url,
          probeUrl: src.probeUrl,
          reachable,
          httpStatus: res.status,
          integrationStatus,
          note,
          checkedAt,
        };
      } catch (err) {
        return {
          id: src.id,
          url: src.url,
          probeUrl: src.probeUrl,
          reachable: false,
          httpStatus: null,
          integrationStatus: src.initialStatus === 'PENDING_CONFIGURATION' ? 'PENDING_CONFIGURATION' : 'UNREACHABLE',
          note: err instanceof Error ? err.message : 'Probe timeout or network error',
          checkedAt,
        };
      }
    })
  );

  return checks;
}

export function listScienceConnectorStatuses() {
  const hasEarthdata = Boolean(process.env.NASA_EARTHDATA_TOKEN?.trim());
  const hasNoaa = Boolean(process.env.NOAA_CDO_TOKEN?.trim());

  return {
    nasaEarthdataTokenConfigured: hasEarthdata,
    noaaCdoTokenConfigured: hasNoaa,
    datasets: SCIENTIFIC_DATASETS.map((d) => ({
      id: d.id,
      productId: d.productId,
      requiredEnvVar: d.requiredEnvVar,
      credentialsConfigured: d.requiredEnvVar === 'NASA_EARTHDATA_TOKEN' ? hasEarthdata : false,
      extractionStatus: hasEarthdata ? 'CREDENTIALS_SET_READY' : 'PENDING_CONFIGURATION',
      cmrDiscoveryMode: 'PUBLIC_UNAUTHENTICATED_API',
    })),
  };
}
