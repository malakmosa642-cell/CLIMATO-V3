import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  acquireRealNasaEarthdataSeries,
  parseImportedObservationSeries,
  parseNetCdfClassicGrid,
  parseOpendapAsciiOrJsonGranule,
  probeNasaCmrCollection,
} from '../server/connectors/nasaEarthdataConnectors.ts';
import { DEFAULT_STUDY_REGIONS, SCIENTIFIC_DATASETS } from '../server/data/scientificCatalog.ts';
import { initDatabase } from '../server/db/database.ts';
import { computeScientificCoordinateProfile, haversineKm } from '../server/services/geospatialEngine.ts';
import { runScientificPipeline } from '../server/services/scientificPipeline.ts';
import { TimeSeriesPoint, analyzeTimeSeriesTrends } from '../server/services/trendAnalysisEngine.ts';

let tempDir: string;

before(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'climato-sci-test-'));
  initDatabase(path.join(tempDir, 'science-test.db'));
});

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function buildMonthlySeries(
  startYear: number,
  months: number,
  fn: (idx: number, year: number, month: number) => number | null
): TimeSeriesPoint[] {
  const pts: TimeSeriesPoint[] = [];
  for (let i = 0; i < months; i++) {
    const year = startYear + Math.floor(i / 12);
    const month = (i % 12) + 1;
    pts.push({
      obsDate: `${year}-${String(month).padStart(2, '0')}-01`,
      year,
      month,
      value: fn(i, year, month),
    });
  }
  return pts;
}

/**
 * Builds a minimal valid NetCDF-3 classic binary stream (CDF\x01) for automated ingestion verification.
 */
function buildSyntheticClassicNetcdf3(opts: {
  varName: string;
  units: string;
  lats: number[];
  lons: number[];
  values: number[]; // flat time(1) x lat x lon
}): Buffer {
  const chunks: Buffer[] = [];
  const pushU32 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(v, 0);
    chunks.push(b);
  };
  const pushI32 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(v, 0);
    chunks.push(b);
  };
  const pushName = (name: string) => {
    const raw = Buffer.from(name, 'ascii');
    pushU32(raw.length);
    const padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4);
    raw.copy(padded);
    chunks.push(padded);
  };
  const pushTextAttr = (name: string, val: string) => {
    pushName(name);
    pushU32(2); // NC_CHAR
    const raw = Buffer.from(val, 'ascii');
    pushU32(raw.length);
    const padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4);
    raw.copy(padded);
    chunks.push(padded);
  };
  const padSize = (bytes: number) => Math.ceil(bytes / 4) * 4;

  // Magic + numrecs=1
  chunks.push(Buffer.from('CDF\x01'));
  pushU32(1);

  // Dimensions: time(0=UNLIMITED), lat, lon
  pushU32(10); // NC_DIMENSION
  pushU32(3);
  pushName('time');
  pushU32(0);
  pushName('lat');
  pushU32(opts.lats.length);
  pushName('lon');
  pushU32(opts.lons.length);

  // Global attributes: NONE (0, 0)
  pushU32(0);
  pushU32(0);

  // Variables: lat, lon, time, dataVar
  const latBytes = padSize(opts.lats.length * 4);
  const lonBytes = padSize(opts.lons.length * 4);
  const timeBytes = 4;
  const gridBytes = padSize(opts.values.length * 4);

  // Pre-compute data offsets
  // Build header with placeholder offsets first, then patch offsets cleanly
  const headerStart = Buffer.concat(chunks).length;
  void headerStart;

  const varListOffsetOffsets: number[] = [];
  const pushVarEntry = (
    name: string,
    dimIds: number[],
    attrs: Array<{ k: string; v: string }>,
    vsize: number
  ) => {
    pushName(name);
    pushU32(dimIds.length);
    for (const d of dimIds) pushU32(d);
    if (attrs.length === 0) {
      pushU32(0);
      pushU32(0);
    } else {
      pushU32(12); // NC_ATTRIBUTE
      pushU32(attrs.length);
      for (const a of attrs) pushTextAttr(a.k, a.v);
    }
    pushU32(5); // NC_FLOAT
    pushU32(vsize);
    varListOffsetOffsets.push(chunks.reduce((acc, c) => acc + c.length, 0));
    pushU32(0); // placeholder begin offset
  };

  pushU32(11); // NC_VARIABLE
  pushU32(4);
  pushVarEntry('lat', [1], [{ k: 'units', v: 'degrees_north' }], latBytes);
  pushVarEntry('lon', [2], [{ k: 'units', v: 'degrees_east' }], lonBytes);
  pushVarEntry('time', [0], [{ k: 'units', v: 'days since 2024-01-01' }], timeBytes);
  pushVarEntry(opts.varName, [0, 1, 2], [{ k: 'units', v: opts.units }], gridBytes);

  const dataBegin = chunks.reduce((acc, c) => acc + c.length, 0);
  const latBegin = dataBegin;
  const lonBegin = latBegin + latBytes;
  const timeBegin = lonBegin + lonBytes;
  const gridBegin = timeBegin + timeBytes;

  // Non-record variables (lat, lon)
  const writeFloatArr = (arr: number[], paddedBytes: number) => {
    const b = Buffer.alloc(paddedBytes);
    arr.forEach((v, idx) => b.writeFloatBE(v, idx * 4));
    chunks.push(b);
  };
  writeFloatArr(opts.lats, latBytes);
  writeFloatArr(opts.lons, lonBytes);
  // Record 0: time + grid
  writeFloatArr([15], timeBytes);
  writeFloatArr(opts.values, gridBytes);

  const full = Buffer.concat(chunks);
  full.writeUInt32BE(latBegin, varListOffsetOffsets[0]);
  full.writeUInt32BE(lonBegin, varListOffsetOffsets[1]);
  full.writeUInt32BE(timeBegin, varListOffsetOffsets[2]);
  full.writeUInt32BE(gridBegin, varListOffsetOffsets[3]);
  return full;
}

describe('Scientific Calculations — Mann-Kendall, Theil-Sen, Hamed-Rao & Guardrails', () => {
  it('matches hand-verified Mann-Kendall S, Var(S), Z, and exact Theil-Sen median slope', () => {
    // 10 observations: strictly known values with one backward step (12 -> 11)
    const values = [10, 12, 11, 14, 15, 13, 16, 18, 17, 20];
    const pts: TimeSeriesPoint[] = values.map((v, i) => ({
      obsDate: `20${15 + i}-01-01`,
      year: 2015 + i,
      month: 1,
      value: v,
    }));

    // Brute-force verify S and pairwise slopes independently
    let expectedS = 0;
    const slopes: number[] = [];
    for (let i = 0; i < values.length - 1; i++) {
      for (let j = i + 1; j < values.length; j++) {
        expectedS += Math.sign(values[j] - values[i]);
        slopes.push((values[j] - values[i]) / (j - i));
      }
    }
    slopes.sort((a, b) => a - b);
    const expectedSlope = slopes[(slopes.length - 1) / 2]; // 45 slopes -> index 22
    const n = values.length;
    const expectedVarS = (n * (n - 1) * (2 * n + 5)) / 18;
    const expectedZ = (expectedS - 1) / Math.sqrt(expectedVarS);

    const report = analyzeTimeSeriesTrends(pts, '°C', { expectedSteps: 10 });
    assert.equal(report.mannKendall.sStatistic, expectedS);
    assert.ok(Math.abs((report.mannKendall.varianceS ?? 0) - expectedVarS) < 1e-6);
    assert.ok(Math.abs((report.mannKendall.zScore ?? 0) - expectedZ) < 1e-3);
    assert.ok(Math.abs((report.theilSen.slopePerYear ?? 0) - expectedSlope) < 1e-3);
    assert.ok(
      (report.theilSen.ci95LowerPerYear ?? 999) <= (report.theilSen.ci95UpperPerYear ?? -999),
      '95% CI lower bound must always be <= upper bound even at small N=10'
    );
  });

  it('detects significant increasing trend and recovers exact Theil-Sen slope (+0.15/yr)', () => {
    const pts = buildMonthlySeries(2015, 120, (i) => 20 + i * (0.15 / 12));
    const report = analyzeTimeSeriesTrends(pts, '°C', { expectedSteps: 120 });

    assert.equal(report.status, 'SIGNIFICANT_TREND');
    assert.equal(report.mannKendall.trendDirection, 'INCREASING');
    assert.equal(report.mannKendall.isSignificantAlpha05, true);
    assert.ok((report.mannKendall.pValueTwoSided ?? 1) < 0.001);
    assert.ok(Math.abs((report.theilSen.slopePerYear ?? 0) - 0.15) < 0.001);
    assert.ok(Math.abs((report.theilSen.slopePerDecade ?? 0) - 1.5) < 0.01);
    assert.ok(
      report.theilSen.ci95LowerPerYear !== null &&
        report.theilSen.ci95UpperPerYear !== null &&
        report.theilSen.ci95LowerPerYear <= 0.15 &&
        report.theilSen.ci95UpperPerYear >= 0.15
    );
    assert.equal(report.diagnostics.validObservations, 120);
    assert.equal(report.diagnostics.coveragePct, 100);
  });

  it('detects significant decreasing trend (-0.25/yr)', () => {
    const pts = buildMonthlySeries(2016, 96, (i) => 10 - i * (0.25 / 12));
    const report = analyzeTimeSeriesTrends(pts, 'cm', { expectedSteps: 96 });

    assert.equal(report.status, 'SIGNIFICANT_TREND');
    assert.equal(report.mannKendall.trendDirection, 'DECREASING');
    assert.ok(Math.abs((report.theilSen.slopePerYear ?? 0) + 0.25) < 0.001);
  });

  it('returns NO_SIGNIFICANT_TREND for stationary oscillating series without monotonic drift', () => {
    const pts = buildMonthlySeries(2015, 120, (_i, _yr, month) => 25 + 6 * Math.sin((month / 12) * Math.PI * 2));
    const report = analyzeTimeSeriesTrends(pts, '°C', { expectedSteps: 120 });

    assert.equal(report.status, 'NO_SIGNIFICANT_TREND');
    assert.equal(report.mannKendall.trendDirection, 'NO_TREND');
    assert.ok((report.mannKendall.pValueTwoSided ?? 0) >= 0.05);
  });

  it('applies tie-group variance correction for series with repeated observations', () => {
    const pts = buildMonthlySeries(2020, 24, (i) => Math.floor(i / 4) * 2);
    const report = analyzeTimeSeriesTrends(pts, 'mm', { expectedSteps: 24 });

    assert.equal(report.diagnostics.tieGroupsCount, 6);
    const untiedVarS = (24 * 23 * (2 * 24 + 5)) / 18;
    assert.ok((report.mannKendall.varianceS ?? untiedVarS) < untiedVarS);
  });

  it('suppresses statistical significance when sample count < 10 (INSUFFICIENT_DATA)', () => {
    const pts = buildMonthlySeries(2024, 8, (i) => 20 + i);
    const report = analyzeTimeSeriesTrends(pts, '°C', { expectedSteps: 8 });

    assert.equal(report.status, 'INSUFFICIENT_DATA');
    assert.equal(report.mannKendall.trendDirection, 'UNDETERMINED');
    assert.equal(report.mannKendall.pValueTwoSided, null);
    assert.equal(report.theilSen.slopePerYear, null);
    assert.match(report.insufficientReason || '', /below minimum threshold/);
  });

  it('suppresses statistical significance when temporal coverage < 70%', () => {
    const pts = buildMonthlySeries(2022, 24, (i) => (i % 2 === 0 ? 15 + i * 0.1 : null));
    const report = analyzeTimeSeriesTrends(pts, '°C', { expectedSteps: 24 });

    assert.equal(report.status, 'INSUFFICIENT_DATA');
    assert.equal(report.diagnostics.validObservations, 12);
    assert.equal(report.diagnostics.coveragePct, 50);
    assert.equal(report.mannKendall.pValueTwoSided, null);
    assert.match(report.insufficientReason || '', /below required threshold/);
  });

  it('computes Hamed-Rao modified variance and reduces effective sample size under strong lag-1 autocorrelation', () => {
    let val = 10;
    const pts = buildMonthlySeries(2015, 120, (i) => {
      val = 0.9 * val + 1.0 + 0.02 * i + Math.sin(i * 0.2) * 0.05;
      return val;
    });
    const report = analyzeTimeSeriesTrends(pts, 'cm', { expectedSteps: 120 });

    assert.equal(report.diagnostics.autocorrelationConcern, true);
    assert.ok((report.diagnostics.lag1Autocorrelation ?? 0) > 0.5);
    assert.ok((report.diagnostics.effectiveSampleSize ?? 120) < 120);
    assert.ok((report.mannKendall.modifiedVarianceS ?? 0) > (report.mannKendall.varianceS ?? 0));
  });

  it('computes seasonal DJF/MAM/JJA/SON breakdowns independently when >= 6 years exist', () => {
    const pts = buildMonthlySeries(2015, 96, (i, _yr, month) => 20 + month * 0.5 + i * (0.12 / 12));
    const report = analyzeTimeSeriesTrends(pts, '°C', { expectedSteps: 96 });

    assert.equal(report.seasonalBreakdown.length, 4);
    for (const s of report.seasonalBreakdown) {
      assert.equal(s.status, 'COMPUTED');
      assert.ok(s.validYears >= 7);
      assert.ok(s.theilSenSlopePerYear !== null && s.theilSenSlopePerYear > 0);
    }
  });
});

describe('NASA Earthdata Ingestion, NetCDF3/OPeNDAP Parsers, Geospatial Dual Mode & Strict Validation', () => {
  it('honestly reports BLOCKED_BY_CREDENTIALS when NASA_EARTHDATA_TOKEN is missing', async () => {
    const prev = process.env.NASA_EARTHDATA_TOKEN;
    delete process.env.NASA_EARTHDATA_TOKEN;
    try {
      const merra2 = SCIENTIFIC_DATASETS.find((d) => d.id === 'merra-2')!;
      const region = DEFAULT_STUDY_REGIONS.find((r) => r.id === 'nile-delta-north')!;
      const res = await acquireRealNasaEarthdataSeries({
        dataset: merra2,
        region,
        startDate: '2024-01-01',
        endDate: '2024-06-30',
        skipCmrProbe: true,
      });

      assert.equal(res.status, 'PENDING_CONFIGURATION');
      assert.equal(res.blockerCode, 'BLOCKED_BY_CREDENTIALS');
      assert.equal(res.provenanceType, 'PENDING_CONFIGURATION');
      assert.equal(res.records.length, 0);
    } finally {
      if (prev) process.env.NASA_EARTHDATA_TOKEN = prev;
    }
  });

  it('parses real classic NetCDF-3 gridded binary and OPeNDAP ASCII streams into regional averages', () => {
    const region = DEFAULT_STUDY_REGIONS.find((r) => r.id === 'nile-delta-north')!;
    // nile-delta-north bounds: lat [31.0, 31.65], lon [29.7, 32.3]
    const ncBuf = buildSyntheticClassicNetcdf3({
      varName: 'T2M',
      units: 'K',
      lats: [30.0, 31.2, 31.5, 33.0],
      lons: [29.0, 30.5, 31.5, 34.0],
      // Only (lat=31.2, 31.5) x (lon=30.5, 31.5) are inside region -> values 298.15, 299.15, 300.15, 301.15 -> mean = 299.65 K
      values: [
        280, 280, 280, 280,
        280, 298.15, 299.15, 280,
        280, 300.15, 301.15, 280,
        280, 280, 280, 280,
      ],
    });

    const parsedNc = parseNetCdfClassicGrid(ncBuf, {
      targetVariable: 'T2M',
      region,
      granuleRef: 'TEST_GRANULE.nc',
      fallbackTimeStart: '2024-01-16T00:00:00Z',
    });
    assert.equal(parsedNc.extractedUnit, 'K');
    assert.equal(parsedNc.records.length, 1);
    assert.ok(Math.abs((parsedNc.records[0].rawValue ?? 0) - 299.65) < 0.05);

    const opendapAscii = [
      'Dataset {',
      '  Grid { Array: Float32 T2M[time = 2][lat = 2][lon = 2]; } T2M;',
      '} MERRA2.ascii;',
      '---------------------------------------------',
      'T2M.lat[2] = 31.2, 31.5',
      'T2M.lon[2] = 30.5, 31.5',
      'T2M.T2M[0][0], 295.15, 296.15',
      'T2M.T2M[0][1], 297.15, 298.15',
      'T2M.T2M[1][0], 299.15, 300.15',
      'T2M.T2M[1][1], 301.15, 302.15',
    ].join('\n');

    const parsedAscii = parseOpendapAsciiOrJsonGranule(opendapAscii, {
      targetVariable: 'T2M',
      region,
      granuleRef: 'TEST_OPENDAP',
      fallbackTimeStart: '2024-03-01T00:00:00Z',
    });
    assert.equal(parsedAscii.records.length, 2);
    assert.ok(Math.abs((parsedAscii.records[0].rawValue ?? 0) - 296.65) < 0.01);
  });

  it('completes end-to-end authenticated NASA granule download against local Earthdata/OPeNDAP test server with SHA-256 checksum', async () => {
    const region = DEFAULT_STUDY_REGIONS.find((r) => r.id === 'nile-delta-north')!;
    const ncBuf = buildSyntheticClassicNetcdf3({
      varName: 'T2M',
      units: 'K',
      lats: [31.2, 31.5],
      lons: [30.5, 31.5],
      values: [298.15, 299.15, 300.15, 301.15],
    });

    let authHeaderSeen = '';
    const mockEarthdata = http.createServer((req, res) => {
      authHeaderSeen = String(req.headers.authorization || '');
      if (req.url === '/urs/granule1.nc') {
        res.writeHead(200, { 'Content-Type': 'application/x-netcdf' });
        res.end(ncBuf);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => mockEarthdata.listen(0, '127.0.0.1', () => resolve()));
    const addr = mockEarthdata.address() as { port: number };
    const mockHost = `http://127.0.0.1:${addr.port}`;

    const prevToken = process.env.NASA_EARTHDATA_TOKEN;
    const prevHosts = process.env.NASA_EARTHDATA_ALLOWED_TEST_HOSTS;
    process.env.NASA_EARTHDATA_TOKEN = 'test-edl-bearer-token-2026';
    process.env.NASA_EARTHDATA_ALLOWED_TEST_HOSTS = '127.0.0.1';

    try {
      const merra2 = SCIENTIFIC_DATASETS.find((d) => d.id === 'merra-2')!;
      const result = await acquireRealNasaEarthdataSeries({
        dataset: merra2,
        region,
        startDate: '2024-01-01',
        endDate: '2024-02-28',
        cmrDiscoveryOverride: {
          datasetId: 'merra-2',
          cmrShortName: 'M2TMNXSLV',
          conceptId: 'C1276812863-GES_DISC',
          liveReachable: true,
          httpStatus: 200,
          granuleHits: 1,
          sampleGranuleIds: ['MERRA2_400.tavgM_2d_slv_Nx.202401'],
          granuleLinks: [
            {
              granuleId: 'MERRA2_400.tavgM_2d_slv_Nx.202401',
              timeStart: '2024-01-01T00:00:00Z',
              downloadUrl: `${mockHost}/urs/granule1.nc`,
            },
          ],
          queryUrl: `${mockHost}/cmr`,
          checkedAt: new Date().toISOString(),
        },
      });

      assert.equal(authHeaderSeen, 'Bearer test-edl-bearer-token-2026');
      assert.equal(result.status, 'CONNECTED_LIVE');
      assert.equal(result.provenanceType, 'LIVE_NASA_EARTHDATA');
      assert.equal(result.downloadedGranulesCount, 1);
      assert.ok(result.provenanceChecksum && result.provenanceChecksum.length === 64);
      assert.equal(result.records.length, 1);
      assert.ok(Math.abs((result.records[0].rawValue ?? 0) - 299.65) < 0.05);
    } finally {
      if (prevToken === undefined) delete process.env.NASA_EARTHDATA_TOKEN;
      else process.env.NASA_EARTHDATA_TOKEN = prevToken;
      if (prevHosts === undefined) delete process.env.NASA_EARTHDATA_ALLOWED_TEST_HOSTS;
      else process.env.NASA_EARTHDATA_ALLOWED_TEST_HOSTS = prevHosts;
      await new Promise<void>((resolve) => mockEarthdata.close(() => resolve()));
    }
  });

  it('strictly rejects invalid, empty, duplicate, non-numeric, out-of-bounds, and fake-labeled imports', () => {
    assert.throws(() => parseImportedObservationSeries({ rawText: '', format: 'csv' }), /empty/);
    assert.throws(
      () => parseImportedObservationSeries({ rawText: '2024-01-01', format: 'csv' }),
      /at least 2/
    );
    assert.throws(
      () => parseImportedObservationSeries({ rawText: '2024-01-01,notanumber', format: 'csv' }),
      /Non-numeric/
    );
    assert.throws(
      () => parseImportedObservationSeries({ rawText: 'time,value\nbad-date,24.5', format: 'csv' }),
      /Invalid date/
    );
    assert.throws(
      () => parseImportedObservationSeries({ rawText: '2024-01-01,20\n2024-01-15,22', format: 'csv' }),
      /Duplicate observation timestamp/
    );
    assert.throws(
      () => parseImportedObservationSeries({ rawText: JSON.stringify([{ date: '2024-01-01', value: 20, lat: 120, lon: 31 }]) }),
      /Out-of-bounds WGS84/
    );
    assert.throws(
      () => parseImportedObservationSeries({ rawText: '2024-01-01,20', sourceLabel: 'METHODOLOGICAL_TEST_FIXTURE' }),
      /Synthetic or fixture/
    );
  });

  it('computes honest SCIENTIFIC coordinate profile (INSUFFICIENT_DATA when empty, computed after real import)', async () => {
    const emptySci = computeScientificCoordinateProfile(23.5, 25.5); // Empty Sahara coord with no intersecting region/series
    assert.equal(emptySci.status, 'INSUFFICIENT_DATA');
    assert.equal(emptySci.intersectingStudyRegion, null);
    assert.equal(emptySci.isRealObservation, false);

    // Import 12 months of MERRA-2 into nile-delta-north and verify SCIENTIFIC mode returns real data
    const csvLines = ['time,mean_T2M'];
    for (let m = 1; m <= 12; m++) {
      csvLines.push(`2024-${String(m).padStart(2, '0')}-01,${(293.15 + m).toFixed(2)}`);
    }
    await runScientificPipeline({
      datasetId: 'merra-2',
      regionId: 'nile-delta-north',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      temporalAggregation: 'monthly',
      mode: 'IMPORTED_OBSERVATIONS',
      importedRawText: csvLines.join('\n'),
      importedFormat: 'csv',
      importedAlreadyNormalized: false,
      importedSourceLabel: 'TEST_DELTA_MERRA2_SCIENTIFIC',
    });

    const deltaSci = computeScientificCoordinateProfile(31.40, 30.80, 'merra-2');
    assert.equal(deltaSci.status, 'COMPLETED');
    assert.equal(deltaSci.intersectingStudyRegion?.id, 'nile-delta-north');
    assert.equal(deltaSci.isRealObservation, true);
    assert.equal(deltaSci.datasets.length, 1);
    assert.equal(deltaSci.datasets[0].validObservations, 12);
    assert.ok(deltaSci.datasets[0].latestValue !== null);
  });

  it('parses NASA Giovanni CSV with comment headers, handles fill values, and normalizes Kelvin to Celsius', async () => {
    const csvLines = [
      '# NASA GES DISC Giovanni Export',
      '# Variable: M2TMNXSLV_5_12_4_T2M',
      'time,mean_T2M',
    ];
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const val = m === 6 ? '-9999.9' : (295.15 + m * 0.5).toFixed(2);
      csvLines.push(`2024-${monthStr}-01,${val}`);
    }

    const parsed = parseImportedObservationSeries({
      rawText: csvLines.join('\n'),
      format: 'csv',
      sourceLabel: 'GIOVANNI_MERRA2_TEST',
    });

    assert.equal(parsed.length, 12);
    assert.equal(parsed[5].rawValue, null);
    assert.equal(parsed[5].qualityFlag, 'MISSING_OR_FILL');

    const result = await runScientificPipeline({
      datasetId: 'merra-2',
      regionId: 'greater-cairo',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      temporalAggregation: 'monthly',
      mode: 'IMPORTED_OBSERVATIONS',
      importedRawText: csvLines.join('\n'),
      importedFormat: 'csv',
      importedAlreadyNormalized: false,
      importedSourceLabel: 'GIOVANNI_MERRA2_TEST',
    });

    assert.equal(result.provenanceType, 'IMPORTED_OBSERVATIONS');
    assert.equal(result.isRealObservation, true);
    assert.equal(result.series.length, 12);
    assert.equal(result.series[0].normalizedUnit, '°C');
    assert.equal(result.series[0].normalizedValue, 22.5);
    assert.equal(result.series[5].isMissing, true);
    assert.equal(result.series[5].normalizedValue, null);
    assert.ok(result.trendReport);
    assert.equal(result.trendReport.diagnostics.missingObservations, 1);
  });

  it('normalizes GPM IMERG mm/hr to mm/month using leap-year aware days-in-month', async () => {
    const jsonRecords = Array.from({ length: 12 }, (_, idx) => ({
      date: `2024-${String(idx + 1).padStart(2, '0')}-01`,
      value: 0.1,
    }));

    const result = await runScientificPipeline({
      datasetId: 'gpm-imerg',
      regionId: 'nile-delta-north',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      temporalAggregation: 'monthly',
      mode: 'IMPORTED_OBSERVATIONS',
      importedRawText: JSON.stringify(jsonRecords),
      importedFormat: 'json',
      importedAlreadyNormalized: false,
    });

    assert.equal(result.series[0].normalizedValue, 74.4);
    assert.equal(result.series[1].normalizedValue, 69.6);
  });

  it('flags GRACE-FO ~300 km footprint limitation for Greater Cairo', async () => {
    const result = await runScientificPipeline({
      datasetId: 'grace-fo',
      regionId: 'greater-cairo',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      mode: 'LIVE_NASA_EARTHDATA',
    });

    assert.equal(result.spatialAssessment.footprintExceedsRegion, true);
    assert.match(result.spatialAssessment.scaleWarningEn || '', /300 km/);
  });

  it('computes accurate Haversine distance between Cairo and Alexandria', () => {
    const dist = haversineKm(30.044, 31.235, 31.200, 29.918);
    assert.ok(dist > 175 && dist < 185, `Expected ~180 km, got ${dist}`);
  });

  it('probes live NASA CMR collection API (or reports honest network error if offline)', async () => {
    const merra2 = SCIENTIFIC_DATASETS.find((d) => d.id === 'merra-2')!;
    const delta = DEFAULT_STUDY_REGIONS.find((r) => r.id === 'nile-delta-north')!;
    const probe = await probeNasaCmrCollection(merra2, delta, '2023-01-01', '2024-12-31');

    assert.equal(probe.datasetId, 'merra-2');
    assert.equal(probe.cmrShortName, 'M2TMNXSLV');
    assert.ok(probe.checkedAt);
    if (probe.liveReachable) {
      assert.equal(probe.httpStatus, 200);
      assert.ok((probe.granuleHits ?? 0) > 0);
    } else {
      assert.ok(probe.errorMessage);
    }
  });
});
