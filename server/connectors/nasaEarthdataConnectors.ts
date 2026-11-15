import crypto from 'node:crypto';
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
  granuleLinks?: Array<{
    granuleId: string;
    timeStart?: string;
    downloadUrl: string;
    opendapUrl?: string;
  }>;
  queryUrl: string;
  checkedAt: string;
  errorMessage?: string;
}

export interface ConnectorAcquisitionResult {
  datasetId: ScientificDatasetSpec['id'];
  status: 'CONNECTED_LIVE' | 'PENDING_CONFIGURATION' | 'UPSTREAM_AUTH_REQUIRED' | 'UPSTREAM_ERROR';
  blockerCode?: 'BLOCKED_BY_CREDENTIALS' | null;
  provenanceType: 'LIVE_NASA_EARTHDATA' | 'PENDING_CONFIGURATION';
  earthdataTokenConfigured: boolean;
  cmrDiscovery: CmrDiscoveryResult | null;
  opendapRequestTemplate: string;
  configurationSteps: string[];
  records: RawAcquiredRecord[];
  provenanceChecksum?: string | null;
  downloadedGranulesCount?: number;
  extractedUnit?: string | null;
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

const TRUSTED_EARTHDATA_HOSTS = [
  'earthdata.nasa.gov',
  'gesdisc.eosdis.nasa.gov',
  'podaac.earthdata.nasa.gov',
  'nsidc.org',
  'lpdaac.usgs.gov',
];

function isTrustedAuthHost(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    const allowedTestHosts = (process.env.NASA_EARTHDATA_ALLOWED_TEST_HOSTS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allowedTestHosts.includes(parsed.hostname.toLowerCase())) {
      return true;
    }
    if (process.env.NODE_ENV === 'test' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')) {
      return true;
    }
    const base = getCmrBaseUrl();
    if (base && targetUrl.startsWith(base)) return true;
    return TRUSTED_EARTHDATA_HOSTS.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}

function getCmrBaseUrl(): string {
  return (process.env.CLIMATO_NASA_CMR_BASE_URL?.trim() || 'https://cmr.earthdata.nasa.gov').replace(/\/+$/, '');
}

export async function probeNasaCmrCollection(
  dataset: ScientificDatasetSpec,
  region?: StudyRegionSpec,
  startDate = '2015-01-01',
  endDate = '2025-12-31'
): Promise<CmrDiscoveryResult> {
  const checkedAt = new Date().toISOString();
  const cmrBase = getCmrBaseUrl();
  const collectionUrl = `${cmrBase}/search/collections.json?short_name=${encodeURIComponent(
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
        granuleLinks: [],
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
    const granuleLinks: NonNullable<CmrDiscoveryResult['granuleLinks']> = [];
    let finalQueryUrl = collectionUrl;

    if (region) {
      const bbox = `${region.minLon},${region.minLat},${region.maxLon},${region.maxLat}`;
      const granUrl = `${cmrBase}/search/granules.json?collection_concept_id=${encodeURIComponent(
        resolvedConceptId
      )}&bounding_box=${encodeURIComponent(bbox)}&temporal=${encodeURIComponent(
        `${startDate}T00:00:00Z,${endDate}T23:59:59Z`
      )}&page_size=120`;
      finalQueryUrl = granUrl;

      const granRes = await fetch(granUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'CLIMATO-TrendDetective/2.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (granRes.ok) {
        const hitsHeader = granRes.headers.get('cmr-hits');
        granuleHits = hitsHeader ? Number(hitsHeader) : undefined;
        const granJson = (await granRes.json()) as {
          feed?: {
            entry?: Array<{
              id?: string;
              title?: string;
              producer_granule_id?: string;
              time_start?: string;
              links?: Array<{ href?: string; rel?: string; title?: string; type?: string; inherited?: boolean }>;
            }>;
          };
        };

        const entries = granJson.feed?.entry || [];
        if (granuleHits === undefined) {
          granuleHits = entries.length;
        }
        sampleGranuleIds = entries
          .map((g) => g.producer_granule_id || g.title || g.id || '')
          .filter(Boolean)
          .slice(0, 5);

        for (const g of entries) {
          const links = g.links || [];
          const opendapLink = links.find(
            (l) =>
              l.href &&
              (l.href.includes('/opendap/') ||
                l.href.endsWith('.ascii') ||
                l.rel?.includes('service'))
          )?.href;
          const dataLink = links.find(
            (l) =>
              l.href &&
              !l.inherited &&
              (l.rel?.endsWith('/data#') ||
                l.href.endsWith('.nc') ||
                l.href.endsWith('.nc4') ||
                l.href.endsWith('.csv') ||
                l.href.endsWith('.json') ||
                l.href.includes('opendap'))
          )?.href || links.find((l) => l.href && /^https?:\/\//i.test(l.href))?.href;

          const resolvedDownload = opendapLink || dataLink;
          if (resolvedDownload) {
            granuleLinks.push({
              granuleId: g.producer_granule_id || g.title || g.id || 'granule',
              timeStart: g.time_start,
              downloadUrl: resolvedDownload,
              opendapUrl: opendapLink,
            });
          }
        }
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
        ? `${entry.time_start.slice(0, 10)} -> ${entry.time_end ? entry.time_end.slice(0, 10) : 'Present'}`
        : dataset.coveragePeriod,
      granuleHits,
      sampleGranuleIds,
      granuleLinks,
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
      granuleLinks: [],
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

async function fetchWithEarthdataAuth(
  url: string,
  token: string,
  maxRedirects = 4
): Promise<{ status: number; ok: boolean; buffer: Buffer; contentType: string }> {
  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const headers: Record<string, string> = {
      'User-Agent': 'CLIMATO-TrendDetective/2.0',
    };
    if (isTrustedAuthHost(currentUrl)) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(currentUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        return {
          status: res.status,
          ok: false,
          buffer: Buffer.alloc(0),
          contentType: res.headers.get('content-type') || '',
        };
      }
      currentUrl = new URL(loc, currentUrl).toString();
      continue;
    }

    const arrayBuf = await res.arrayBuffer();
    return {
      status: res.status,
      ok: res.ok,
      buffer: Buffer.from(arrayBuf),
      contentType: res.headers.get('content-type') || '',
    };
  }

  throw new Error('Exceeded maximum Earthdata authentication redirects.');
}

/**
 * Pure TypeScript reader for Classic NetCDF3 (CDF\x01 / CDF\x02 64-bit offset) gridded scientific files.
 * Extracts lat, lon, time, units, fill value, and computes spatial bounding-box mean.
 */
export function parseNetCdfClassicGrid(
  buf: Buffer,
  options: {
    targetVariable: string;
    region: StudyRegionSpec;
    granuleRef: string;
    fallbackTimeStart?: string;
  }
): {
  records: RawAcquiredRecord[];
  extractedUnit: string | null;
} {
  if (buf.length < 12 || buf.toString('ascii', 0, 3) !== 'CDF') {
    throw new Error('Not a valid NetCDF classic binary stream.');
  }
  const version = buf[3]; // 1 = 32-bit offset, 2 = 64-bit offset
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported NetCDF binary version ${version}.`);
  }

  let pos = 4;
  const readU32 = () => {
    const v = buf.readUInt32BE(pos);
    pos += 4;
    return v;
  };
  const readI32 = () => {
    const v = buf.readInt32BE(pos);
    pos += 4;
    return v;
  };
  const pad4 = (len: number) => (len % 4 === 0 ? 0 : 4 - (len % 4));
  const readString = () => {
    const len = readU32();
    const s = buf.toString('utf8', pos, pos + len);
    pos += len + pad4(len);
    return s;
  };
  const ncTypeSize = (t: number) => (t <= 2 ? 1 : t === 3 ? 2 : t === 4 || t === 5 ? 4 : 8);

  const readAttrValue = (ncType: number, nelems: number): unknown => {
    const byteLen = nelems * ncTypeSize(ncType);
    const start = pos;
    pos += byteLen + pad4(byteLen);
    if (ncType === 2) {
      return buf.toString('utf8', start, start + nelems).replace(/\0+$/, '');
    }
    if (ncType === 5 && nelems >= 1) return buf.readFloatBE(start);
    if (ncType === 6 && nelems >= 1) return buf.readDoubleBE(start);
    if (ncType === 4 && nelems >= 1) return buf.readInt32BE(start);
    return null;
  };

  const readAttList = (): Record<string, unknown> => {
    const tag = readU32();
    const attrs: Record<string, unknown> = {};
    if (tag === 0) {
      readU32(); // 0 count
      return attrs;
    }
    const count = readU32();
    for (let i = 0; i < count; i++) {
      const name = readString();
      const ncType = readU32();
      const nelems = readU32();
      attrs[name] = readAttrValue(ncType, nelems);
    }
    return attrs;
  };

  const numrecs = readU32();

  // Dimensions
  const dimTag = readU32();
  const dims: Array<{ name: string; size: number }> = [];
  if (dimTag === 0) {
    readU32();
  } else {
    const dimCount = readU32();
    for (let i = 0; i < dimCount; i++) {
      const name = readString();
      const size = readU32();
      dims.push({ name, size });
    }
  }

  // Global attributes
  readAttList();

  // Variables
  const varTag = readU32();
  interface NcVar {
    name: string;
    dimIds: number[];
    attrs: Record<string, unknown>;
    ncType: number;
    vsize: number;
    begin: number;
  }
  const vars: NcVar[] = [];
  if (varTag !== 0) {
    const varCount = readU32();
    for (let i = 0; i < varCount; i++) {
      const name = readString();
      const ndims = readU32();
      const dimIds: number[] = [];
      for (let d = 0; d < ndims; d++) dimIds.push(readI32());
      const attrs = readAttList();
      const ncType = readU32();
      const vsize = readU32();
      const begin = version === 2 ? Number(buf.readBigUInt64BE(pos)) : readU32();
      if (version === 2) pos += 8;
      vars.push({ name, dimIds, attrs, ncType, vsize, begin });
    }
  }

  const readNumericVar = (v: NcVar): number[] => {
    const count = Math.floor(v.vsize / ncTypeSize(v.ncType));
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const off = v.begin + i * ncTypeSize(v.ncType);
      if (off + ncTypeSize(v.ncType) > buf.length) break;
      if (v.ncType === 5) out.push(buf.readFloatBE(off));
      else if (v.ncType === 6) out.push(buf.readDoubleBE(off));
      else if (v.ncType === 4) out.push(buf.readInt32BE(off));
      else if (v.ncType === 3) out.push(buf.readInt16BE(off));
    }
    return out;
  };

  const latVar = vars.find((v) => /^(lat|latitude|y)$/i.test(v.name));
  const lonVar = vars.find((v) => /^(lon|longitude|x)$/i.test(v.name));
  const timeVar = vars.find((v) => /^(time|t)$/i.test(v.name));
  const dataVar =
    vars.find((v) => v.name.toLowerCase() === options.targetVariable.toLowerCase()) ||
    vars.find((v) => v.dimIds.length >= 2 && v !== latVar && v !== lonVar && v !== timeVar);

  if (!dataVar) {
    throw new Error(`Target variable '${options.targetVariable}' not found in NetCDF granule.`);
  }

  const lats = latVar ? readNumericVar(latVar) : [];
  const lons = lonVar ? readNumericVar(lonVar) : [];
  const times = timeVar ? readNumericVar(timeVar) : [];
  const fillVal = Number(dataVar.attrs._FillValue ?? dataVar.attrs.missing_value ?? -9999);
  const extractedUnit =
    typeof dataVar.attrs.units === 'string' ? dataVar.attrs.units : null;

  const isUnlimited = dataVar.dimIds.length > 0 && dims[dataVar.dimIds[0]]?.size === 0;
  const nTime =
    dataVar.dimIds.length === 3
      ? isUnlimited
        ? Math.max(1, numrecs)
        : dims[dataVar.dimIds[0]]?.size || 1
      : 1;
  const nLat =
    dataVar.dimIds.length >= 2
      ? dims[dataVar.dimIds[dataVar.dimIds.length - 2]]?.size || Math.max(1, lats.length)
      : 1;
  const nLon =
    dataVar.dimIds.length >= 1
      ? dims[dataVar.dimIds[dataVar.dimIds.length - 1]]?.size || Math.max(1, lons.length)
      : 1;

  const elemSize = ncTypeSize(dataVar.ncType);
  const slabBytes = nLat * nLon * elemSize;
  const recordStride = isUnlimited
    ? vars
        .filter((v) => v.dimIds.length > 0 && dims[v.dimIds[0]]?.size === 0)
        .reduce((acc, v) => acc + v.vsize, 0)
    : slabBytes;

  const timeUnits = typeof timeVar?.attrs.units === 'string' ? timeVar.attrs.units : '';
  const resolveObsDate = (tIdx: number): { obsDate: string; year: number; month: number } => {
    const match = timeUnits.match(/(days|hours|months)\s+since\s+(\d{4}-\d{2}-\d{2})/i);
    if (match && times[tIdx] !== undefined) {
      const base = new Date(`${match[2]}T00:00:00Z`);
      const val = times[tIdx];
      if (match[1].toLowerCase() === 'days') {
        base.setUTCDate(base.getUTCDate() + Math.round(val));
      } else if (match[1].toLowerCase() === 'hours') {
        base.setUTCHours(base.getUTCHours() + Math.round(val));
      } else {
        base.setUTCMonth(base.getUTCMonth() + Math.round(val));
      }
      const yr = base.getUTCFullYear();
      const mo = base.getUTCMonth() + 1;
      return { obsDate: `${yr}-${String(mo).padStart(2, '0')}-01`, year: yr, month: mo };
    }
    const fallback = options.fallbackTimeStart
      ? normalizeYearMonthDate(options.fallbackTimeStart)
      : null;
    if (fallback) return fallback;
    throw new Error('Unable to extract observation timestamp from NetCDF time coordinate.');
  };

  const results: RawAcquiredRecord[] = [];
  for (let t = 0; t < nTime; t++) {
    const { obsDate, year, month } = resolveObsDate(t);
    const vals: number[] = [];
    const baseOffset = dataVar.begin + t * recordStride;

    for (let i = 0; i < nLat; i++) {
      const lat = lats[i];
      if (
        lats.length > 0 &&
        (lat < options.region.minLat || lat > options.region.maxLat)
      ) {
        continue;
      }
      for (let j = 0; j < nLon; j++) {
        const lon = lons[j];
        if (
          lons.length > 0 &&
          (lon < options.region.minLon || lon > options.region.maxLon)
        ) {
          continue;
        }
        const off = baseOffset + (i * nLon + j) * elemSize;
        if (off + elemSize > buf.length) continue;
        const v = dataVar.ncType === 6 ? buf.readDoubleBE(off) : buf.readFloatBE(off);
        if (
          !Number.isFinite(v) ||
          Math.abs(v - fillVal) < 1e-4 ||
          v <= -999 ||
          Math.abs(v) >= 1e14
        ) {
          continue;
        }
        vals.push(v);
      }
    }

    const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    results.push({
      obsDate,
      year,
      month,
      rawValue: mean !== null ? Number(mean.toFixed(5)) : null,
      qualityFlag: mean !== null ? 'NASA_NETCDF_VALID' : 'MISSING_OR_FILL',
      sourceGranuleRef: options.granuleRef,
    });
  }

  return { records: results, extractedUnit };
}

/**
 * Parses OPeNDAP ASCII (.ascii) or JSON spatial subset response into monthly region averages.
 */
export function parseOpendapAsciiOrJsonGranule(
  text: string,
  options: {
    targetVariable: string;
    region: StudyRegionSpec;
    granuleRef: string;
    fallbackTimeStart?: string;
  }
): { records: RawAcquiredRecord[]; extractedUnit: string | null } {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = parseImportedObservationSeries({
      rawText: trimmed,
      format: 'json',
      sourceLabel: options.granuleRef,
    });
    return { records: parsed, extractedUnit: null };
  }

  // OPeNDAP ASCII grid format: look for lines containing numeric vectors or variable data rows
  if (/^\d{4}-\d{2}/.test(trimmed) || trimmed.startsWith('#') || trimmed.includes(',') || trimmed.includes('Dataset')) {
    const lines = trimmed.split(/\r?\n/);
    const latLine = lines.find((l) => /(?:^|\.)lat(?:\[\d+\])?\s*[=,]/i.test(l.trim()));
    const lonLine = lines.find((l) => /(?:^|\.)lon(?:\[\d+\])?\s*[=,]/i.test(l.trim()));
    if (latLine && lonLine) {
      const extractCoords = (line: string): number[] => {
        const rhs = line.includes('=') ? line.slice(line.indexOf('=') + 1) : line;
        return rhs
          .split(',')
          .map((n) => Number(n.trim()))
          .filter(Number.isFinite);
      };
      const lats = extractCoords(latLine);
      const lons = extractCoords(lonLine);
      const valsByTime = new Map<number, number[]>();
      const rowRegex = /^(?:[A-Za-z0-9_.]+)?\[(\d+)\]\[(\d+)\],\s*(.+)$/;
      for (const l of lines) {
        const m = l.trim().match(rowRegex);
        if (!m) continue;
        const timeIdx = Number(m[1]);
        const latIdx = Number(m[2]);
        const lat = lats[latIdx];
        if (lats.length > 0 && lat !== undefined && (lat < options.region.minLat || lat > options.region.maxLat)) {
          continue;
        }
        const cells = m[3].split(',').map((s) => Number(s.trim()));
        const bucket = valsByTime.get(timeIdx) || [];
        cells.forEach((v, lonIdx) => {
          const lon = lons[lonIdx];
          if (lons.length > 0 && lon !== undefined && (lon < options.region.minLon || lon > options.region.maxLon)) {
            return;
          }
          if (Number.isFinite(v) && v > -999 && Math.abs(v) < 1e14) {
            bucket.push(v);
          }
        });
        valsByTime.set(timeIdx, bucket);
      }
      const baseDateInfo = options.fallbackTimeStart
        ? normalizeYearMonthDate(options.fallbackTimeStart)
        : null;
      if (baseDateInfo && valsByTime.size > 0) {
        const sortedTimes = Array.from(valsByTime.keys()).sort((a, b) => a - b);
        const records: RawAcquiredRecord[] = [];
        for (const tIdx of sortedTimes) {
          const bucket = valsByTime.get(tIdx) || [];
          const d = new Date(Date.UTC(baseDateInfo.year, baseDateInfo.month - 1 + tIdx, 1));
          const yr = d.getUTCFullYear();
          const mo = d.getUTCMonth() + 1;
          const mean = bucket.length > 0 ? bucket.reduce((a, b) => a + b, 0) / bucket.length : null;
          records.push({
            obsDate: `${yr}-${String(mo).padStart(2, '0')}-01`,
            year: yr,
            month: mo,
            rawValue: mean !== null ? Number(mean.toFixed(5)) : null,
            qualityFlag: mean !== null ? 'NASA_OPENDAP_VALID' : 'MISSING_OR_FILL',
            sourceGranuleRef: options.granuleRef,
          });
        }
        if (records.length > 0) {
          return { records, extractedUnit: null };
        }
      }
    }

    // Fallback to standard CSV time-series parsing
    const csvRecs = parseImportedObservationSeries({
      rawText: trimmed,
      format: 'csv',
      sourceLabel: options.granuleRef,
    });
    return { records: csvRecs, extractedUnit: null };
  }

  return { records: [], extractedUnit: null };
}

/**
 * Executes real discovery via NASA CMR and authenticated download + extraction
 * ONLY when NASA_EARTHDATA_TOKEN is configured.
 * Reports BLOCKED_BY_CREDENTIALS when credentials are missing; never fabricates data.
 */
export async function acquireNasaDatasetForRegion(params: {
  dataset: ScientificDatasetSpec;
  region: StudyRegionSpec;
  startDate: string;
  endDate: string;
  probeCmr?: boolean;
  skipCmrProbe?: boolean;
  cmrDiscoveryOverride?: CmrDiscoveryResult | null;
}): Promise<ConnectorAcquisitionResult> {
  const {
    dataset,
    region,
    startDate,
    endDate,
    probeCmr = true,
    skipCmrProbe = false,
    cmrDiscoveryOverride,
  } = params;
  const token = process.env.NASA_EARTHDATA_TOKEN?.trim() || '';
  const opendapTemplate = buildOpendapQueryTemplate(dataset, region, startDate, endDate);

  const cmrDiscovery =
    cmrDiscoveryOverride !== undefined
      ? cmrDiscoveryOverride
      : probeCmr && !skipCmrProbe
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
      blockerCode: 'BLOCKED_BY_CREDENTIALS',
      provenanceType: 'PENDING_CONFIGURATION',
      earthdataTokenConfigured: false,
      cmrDiscovery,
      opendapRequestTemplate: opendapTemplate,
      configurationSteps,
      records: [],
      provenanceChecksum: null,
      downloadedGranulesCount: 0,
      message:
        `BLOCKED_BY_CREDENTIALS: NASA_EARTHDATA_TOKEN is not configured on the server. Live CMR catalog discovery verified ${
          cmrDiscovery?.granuleHits ?? 'matching'
        } granules, while real granule download & NetCDF/OPeNDAP extraction for ${dataset.productId} (${dataset.targetVariableField}) cannot proceed without Earthdata credentials.`,
    };
  }

  // Authenticated download workflow using CMR granule links
  try {
    const granuleLinks = cmrDiscovery?.granuleLinks || [];
    if (granuleLinks.length === 0) {
      // Fallback: check endpoint authentication explicitly
      const probeRes = await fetchWithEarthdataAuth(dataset.endpointTemplate, token);
      if (probeRes.status === 401 || probeRes.status === 403) {
        return {
          datasetId: dataset.id,
          status: 'UPSTREAM_AUTH_REQUIRED',
          blockerCode: 'BLOCKED_BY_CREDENTIALS',
          provenanceType: 'PENDING_CONFIGURATION',
          earthdataTokenConfigured: true,
          cmrDiscovery,
          opendapRequestTemplate: opendapTemplate,
          configurationSteps,
          records: [],
          message: `NASA Earthdata endpoint returned HTTP ${probeRes.status}. Verify GES DISC / PO.DAAC URS authorization for NASA_EARTHDATA_TOKEN.`,
        };
      }
      return {
        datasetId: dataset.id,
        status: 'UPSTREAM_ERROR',
        provenanceType: 'PENDING_CONFIGURATION',
        earthdataTokenConfigured: true,
        cmrDiscovery,
        opendapRequestTemplate: opendapTemplate,
        configurationSteps,
        records: [],
        message: `Authenticated CMR search returned 0 downloadable granule links for ${dataset.productId} over [${startDate}, ${endDate}].`,
      };
    }

    const acquiredAll: RawAcquiredRecord[] = [];
    const hashBuilder = crypto.createHash('sha256');
    let downloadedCount = 0;
    let extractedUnit: string | null = null;

    for (const gran of granuleLinks.slice(0, 120)) {
      const targetUrl = gran.opendapUrl || gran.downloadUrl;
      const dl = await fetchWithEarthdataAuth(targetUrl, token);

      if (dl.status === 401 || dl.status === 403) {
        return {
          datasetId: dataset.id,
          status: 'UPSTREAM_AUTH_REQUIRED',
          blockerCode: 'BLOCKED_BY_CREDENTIALS',
          provenanceType: 'PENDING_CONFIGURATION',
          earthdataTokenConfigured: true,
          cmrDiscovery,
          opendapRequestTemplate: opendapTemplate,
          configurationSteps,
          records: [],
          message: `Earthdata granule download returned HTTP ${dl.status} for ${gran.granuleId}. Verify URS application authorization.`,
        };
      }

      if (!dl.ok || dl.buffer.length === 0) {
        continue;
      }

      const fileSha = crypto.createHash('sha256').update(dl.buffer).digest('hex');
      hashBuilder.update(`${gran.granuleId}:${fileSha};`);
      downloadedCount += 1;

      if (dl.buffer.length >= 4 && dl.buffer.toString('ascii', 0, 3) === 'CDF') {
        const parsed = parseNetCdfClassicGrid(dl.buffer, {
          targetVariable: dataset.targetVariableField,
          region,
          granuleRef: `${gran.granuleId}#sha256=${fileSha.slice(0, 12)}`,
          fallbackTimeStart: gran.timeStart,
        });
        if (parsed.extractedUnit) extractedUnit = parsed.extractedUnit;
        acquiredAll.push(...parsed.records);
      } else {
        const text = dl.buffer.toString('utf8');
        const parsed = parseOpendapAsciiOrJsonGranule(text, {
          targetVariable: dataset.targetVariableField,
          region,
          granuleRef: `${gran.granuleId}#sha256=${fileSha.slice(0, 12)}`,
          fallbackTimeStart: gran.timeStart,
        });
        if (parsed.extractedUnit) extractedUnit = parsed.extractedUnit;
        acquiredAll.push(...parsed.records);
      }
    }

    const provenanceChecksum = downloadedCount > 0 ? hashBuilder.digest('hex') : null;
    if (downloadedCount === 0 || acquiredAll.length === 0) {
      return {
        datasetId: dataset.id,
        status: 'UPSTREAM_ERROR',
        provenanceType: 'PENDING_CONFIGURATION',
        earthdataTokenConfigured: true,
        cmrDiscovery,
        opendapRequestTemplate: opendapTemplate,
        configurationSteps,
        records: [],
        provenanceChecksum,
        downloadedGranulesCount: downloadedCount,
        message: `Downloaded ${downloadedCount} granules for ${dataset.productId}, but could not extract decodable variable arrays for ${dataset.targetVariableField}.`,
      };
    }

    return {
      datasetId: dataset.id,
      status: 'CONNECTED_LIVE',
      blockerCode: null,
      provenanceType: 'LIVE_NASA_EARTHDATA',
      earthdataTokenConfigured: true,
      cmrDiscovery,
      opendapRequestTemplate: opendapTemplate,
      configurationSteps,
      records: acquiredAll,
      provenanceChecksum,
      downloadedGranulesCount: downloadedCount,
      extractedUnit: extractedUnit || dataset.nativeUnit,
      message: `Downloaded and verified ${downloadedCount} NASA granules (${acquiredAll.length} time steps) for ${dataset.productId} over ${region.id} (checksum ${provenanceChecksum?.slice(0, 12)}).`,
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
      message: `Unable to complete authenticated download for ${dataset.productId}: ${
        err instanceof Error ? err.message : 'Network error'
      }`,
    };
  }
}

export const acquireRealNasaEarthdataSeries = acquireNasaDatasetForRegion;

/**
 * Parses real exported NASA Giovanni CSV, NASA AppEEARS CSV, or clean YYYY-MM / YYYY-MM-DD time-series CSV/JSON.
 * Strictly rejects empty payloads, synthetic fixture labels, malformed rows without valid dates/numbers,
 * duplicate timestamps, and out-of-bounds coordinates.
 */
export function parseImportedObservationSeries(params: {
  rawText: string;
  format?: 'csv' | 'json';
  sourceLabel?: string;
}): RawAcquiredRecord[] {
  const sourceRef = params.sourceLabel?.trim() || 'USER_IMPORTED_NASA_SERIES';
  if (/METHODOLOGICAL_TEST_FIXTURE|FAKE|SYNTHETIC_BENCHMARK/i.test(sourceRef)) {
    throw new Error('Synthetic or fixture labels cannot be imported as real observations.');
  }

  const trimmed = params.rawText.trim();
  if (!trimmed) {
    throw new Error('Uploaded observation payload is empty.');
  }

  const seenDates = new Set<string>();

  if (params.format === 'json' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Malformed JSON observation payload.');
    }

    const rows = Array.isArray(parsed)
      ? parsed
      : (parsed as { records?: unknown[]; data?: unknown[] }).records ||
        (parsed as { data?: unknown[] }).data ||
        null;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('JSON observation payload must contain a non-empty array of records.');
    }

    const results: RawAcquiredRecord[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      if (!row || typeof row !== 'object') {
        throw new Error(`Malformed observation object at index ${i}.`);
      }
      const dateRaw = String(row.date ?? row.obsDate ?? row.time ?? row.period ?? '').trim();
      const normalizedDate = normalizeYearMonthDate(dateRaw);
      if (!normalizedDate) {
        throw new Error(`Invalid or unrecognized date '${dateRaw}' at row ${i + 1}.`);
      }
      if (seenDates.has(normalizedDate.obsDate)) {
        throw new Error(`Duplicate observation timestamp '${normalizedDate.obsDate}' detected in import.`);
      }
      seenDates.add(normalizedDate.obsDate);

      if (row.lat !== undefined || row.lon !== undefined) {
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          throw new Error(`Out-of-bounds WGS84 coordinates at row ${i + 1}.`);
        }
      }

      const valRaw = row.value ?? row.rawValue ?? row.mean ?? row.T2M ?? row.precipitation ?? row.lwe_thickness;
      let num: number | null;
      if (valRaw === null || valRaw === undefined || valRaw === '') {
        num = null;
      } else {
        num = Number(valRaw);
        if (!Number.isFinite(num)) {
          throw new Error(`Non-numeric observation value '${String(valRaw)}' at row ${i + 1}.`);
        }
      }
      const isFill = num === null || num <= -999 || Math.abs(num) >= 1e14;
      results.push({
        obsDate: normalizedDate.obsDate,
        year: normalizedDate.year,
        month: normalizedDate.month,
        rawValue: isFill ? null : num,
        uncertainty: row.uncertainty !== undefined && row.uncertainty !== null ? Number(row.uncertainty) : null,
        qualityFlag: isFill ? 'MISSING_OR_FILL' : String(row.qualityFlag || 'IMPORTED_VALID'),
        sourceGranuleRef: String(row.granule || sourceRef),
      });
    }
    return results;
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const records: RawAcquiredRecord[] = [];
  let dateColIdx = 0;
  let valueColIdx = 1;
  let uncertaintyColIdx = -1;
  let latColIdx = -1;
  let lonColIdx = -1;
  let headerParsed = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (line.startsWith('#') || line.startsWith('//')) continue;
    const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 2) {
      throw new Error(`Malformed CSV row at line ${lineIdx + 1}: expected at least 2 comma-separated columns.`);
    }

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
        latColIdx = lower.findIndex((c) => c === 'lat' || c === 'latitude');
        lonColIdx = lower.findIndex((c) => c === 'lon' || c === 'longitude');
        dateColIdx = dIdx >= 0 ? dIdx : 0;
        valueColIdx = vIdx >= 0 ? vIdx : dateColIdx === 0 ? 1 : 0;
        uncertaintyColIdx = uIdx;
        headerParsed = true;
        continue;
      }
      headerParsed = true;
    }

    const parsedDate = normalizeYearMonthDate(cols[dateColIdx] || '');
    if (!parsedDate) {
      throw new Error(`Invalid date token '${cols[dateColIdx] || ''}' in CSV line ${lineIdx + 1}.`);
    }
    if (seenDates.has(parsedDate.obsDate)) {
      throw new Error(`Duplicate observation timestamp '${parsedDate.obsDate}' in CSV line ${lineIdx + 1}.`);
    }
    seenDates.add(parsedDate.obsDate);

    if (latColIdx >= 0 && cols[latColIdx] !== undefined) {
      const lat = Number(cols[latColIdx]);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error(`Invalid latitude '${cols[latColIdx]}' in CSV line ${lineIdx + 1}.`);
      }
    }
    if (lonColIdx >= 0 && cols[lonColIdx] !== undefined) {
      const lon = Number(cols[lonColIdx]);
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        throw new Error(`Invalid longitude '${cols[lonColIdx]}' in CSV line ${lineIdx + 1}.`);
      }
    }

    const rawToken = cols[valueColIdx];
    const isExplicitMissing =
      rawToken === undefined || rawToken === '' || /^(na|nan|null|-+)$/i.test(rawToken);
    let num: number | null = null;
    if (!isExplicitMissing) {
      num = Number(rawToken);
      if (!Number.isFinite(num)) {
        throw new Error(`Non-numeric observation value '${rawToken}' in CSV line ${lineIdx + 1}.`);
      }
    }

    const isFill = num === null || num <= -999 || Math.abs(num) >= 1e14;
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

  if (records.length === 0) {
    throw new Error('No valid observation records were found in the uploaded CSV payload.');
  }

  return records;
}

function normalizeYearMonthDate(input: string): { obsDate: string; year: number; month: number } | null {
  const clean = input.trim();
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
      blockerCode: hasEarthdata ? null : 'BLOCKED_BY_CREDENTIALS',
      cmrDiscoveryMode: 'PUBLIC_UNAUTHENTICATED_API',
    })),
  };
}
