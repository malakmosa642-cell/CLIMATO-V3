import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  parseImportedObservationSeries,
  probeNasaCmrCollection,
} from '../server/connectors/nasaEarthdataConnectors.ts';
import { DEFAULT_STUDY_REGIONS, SCIENTIFIC_DATASETS } from '../server/data/scientificCatalog.ts';
import { initDatabase } from '../server/db/database.ts';
import { haversineKm } from '../server/services/geospatialEngine.ts';
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

describe('Scientific Calculations — Mann-Kendall, Theil-Sen, Hamed-Rao & Guardrails', () => {
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
    // High lag-1 persistence random walk with gentle drift
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

describe('NASA Earthdata Parsers, Pipeline Provenance & Geospatial Geometry', () => {
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
    // 295.65 K - 273.15 = 22.5 °C
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

    // Jan 2024: 0.1 * 24 * 31 = 74.4 mm/month
    assert.equal(result.series[0].normalizedValue, 74.4);
    // Feb 2024 (leap year, 29 days): 0.1 * 24 * 29 = 69.6 mm/month
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
