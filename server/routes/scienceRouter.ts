import { Router } from 'express';
import { db, recordAuditLog } from '../db/database.ts';
import {
  DEFAULT_STUDY_REGIONS,
  RESEARCH_SOURCES,
  SCIENTIFIC_DATASETS,
  ScientificDatasetSpec,
  StudyRegionSpec,
} from '../data/scientificCatalog.ts';
import {
  listScienceConnectorStatuses,
  probeAllResearchSources,
  probeNasaCmrCollection,
} from '../connectors/nasaEarthdataConnectors.ts';
import {
  compareAllRegionsForDataset,
  listStudyRegionsFromDb,
  ProvenanceMode,
  runScientificPipeline,
  TemporalAggregationMode,
} from '../services/scientificPipeline.ts';
import { ApiError, asyncHandler, RequestWithContext } from '../middleware/requestContext.ts';

export const scienceRouter = Router();

// 1. Overview: Regions, 4 Datasets, Connector Readiness, All 12 Research Hub Sources
scienceRouter.get(
  '/overview',
  asyncHandler(async (_req: RequestWithContext, res) => {
    const regions = listStudyRegionsFromDb();
    const connectorStatus = listScienceConnectorStatuses();

    const storedResearchRows = db.prepare('SELECT * FROM research_sources').all() as Array<
      Record<string, unknown>
    >;
    const storedMap = new Map(storedResearchRows.map((r) => [String(r.id), r]));

    const researchSources = RESEARCH_SOURCES.map((src) => {
      const dbRow = storedMap.get(src.id);
      return {
        ...src,
        integrationStatus: dbRow ? String(dbRow.integration_status) : src.initialStatus,
        lastProbeStatus: dbRow?.last_probe_status ?? null,
        lastProbedAt: dbRow?.last_probed_at ?? null,
        probeNote: dbRow?.probe_note ?? null,
      };
    });

    const recentRuns = db
      .prepare('SELECT id, dataset_id, region_id, start_date, end_date, temporal_aggregation, provenance_type, status, query_hash, records_ingested, valid_records, missing_periods, created_at FROM pipeline_runs ORDER BY created_at DESC LIMIT 20')
      .all();

    res.json({
      missionTitle: 'CLIMATO — Egypt Earth System Trend Detective',
      regions,
      datasets: SCIENTIFIC_DATASETS,
      connectorStatus,
      researchSources,
      recentRuns,
    });
  })
);

// 2. Configure Egyptian Study Region coordinates / bounding box
scienceRouter.put(
  '/regions/:id',
  asyncHandler((req: RequestWithContext, res) => {
    const id = String(req.params.id);
    const existing = listStudyRegionsFromDb().find((r) => r.id === id);
    if (!existing) {
      throw new ApiError(404, 'STUDY_REGION_NOT_FOUND', `Unknown study region '${id}'.`);
    }

    const body = req.body ?? {};
    const centerLat = Number(body.centerLat ?? existing.centerLat);
    const centerLon = Number(body.centerLon ?? existing.centerLon);
    const minLat = Number(body.minLat ?? existing.minLat);
    const maxLat = Number(body.maxLat ?? existing.maxLat);
    const minLon = Number(body.minLon ?? existing.minLon);
    const maxLon = Number(body.maxLon ?? existing.maxLon);

    if (
      ![centerLat, centerLon, minLat, maxLat, minLon, maxLon].every(Number.isFinite) ||
      minLat >= maxLat ||
      minLon >= maxLon ||
      minLat < 20 ||
      maxLat > 34 ||
      minLon < 22 ||
      maxLon > 38
    ) {
      throw new ApiError(
        400,
        'INVALID_EGYPT_REGION_BOUNDS',
        'Coordinates must be finite, inside Egypt regional bounds (Lat 20..34°N, Lon 22..38°E), with minLat < maxLat and minLon < maxLon.'
      );
    }

    const approxAreaKm2 = Math.round(
      Math.abs(maxLat - minLat) * 111.32 * Math.abs(maxLon - minLon) * 111.32 * Math.cos((centerLat * Math.PI) / 180)
    );

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE study_regions
      SET name_en = ?, name_ar = ?, center_lat = ?, center_lon = ?,
          min_lat = ?, max_lat = ?, min_lon = ?, max_lon = ?,
          approx_area_km2 = ?, selection_rationale_en = ?, selection_rationale_ar = ?,
          is_default = 0, updated_at = ?
      WHERE id = ?
    `).run(
      String(body.nameEn || existing.nameEn).trim(),
      String(body.nameAr || existing.nameAr).trim(),
      Number(centerLat.toFixed(4)),
      Number(centerLon.toFixed(4)),
      Number(minLat.toFixed(4)),
      Number(maxLat.toFixed(4)),
      Number(minLon.toFixed(4)),
      Number(maxLon.toFixed(4)),
      approxAreaKm2,
      String(body.selectionRationaleEn || existing.selectionRationaleEn).trim(),
      String(body.selectionRationaleAr || existing.selectionRationaleAr).trim(),
      nowIso,
      id
    );

    recordAuditLog({
      requestId: req.requestId || 'science-region-update',
      actor: 'researcher',
      action: 'STUDY_REGION_RECONFIGURED',
      resourceType: 'study_region',
      resourceId: id,
      metadata: { minLat, maxLat, minLon, maxLon, approxAreaKm2 },
    });

    const updated = listStudyRegionsFromDb().find((r) => r.id === id);
    res.json({ updated: true, region: updated });
  })
);

scienceRouter.post(
  '/regions/reset',
  asyncHandler((req: RequestWithContext, res) => {
    const nowIso = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE study_regions
      SET name_en = ?, name_ar = ?, center_lat = ?, center_lon = ?,
          min_lat = ?, max_lat = ?, min_lon = ?, max_lon = ?,
          approx_area_km2 = ?, selection_rationale_en = ?, selection_rationale_ar = ?,
          is_default = 1, updated_at = ?
      WHERE id = ?
    `);
    for (const r of DEFAULT_STUDY_REGIONS) {
      stmt.run(
        r.nameEn,
        r.nameAr,
        r.centerLat,
        r.centerLon,
        r.minLat,
        r.maxLat,
        r.minLon,
        r.maxLon,
        r.approxAreaKm2,
        r.selectionRationaleEn,
        r.selectionRationaleAr,
        nowIso,
        r.id
      );
    }
    recordAuditLog({
      requestId: req.requestId || 'science-region-reset',
      actor: 'researcher',
      action: 'STUDY_REGIONS_RESET',
      resourceType: 'study_region',
      resourceId: 'all',
    });
    res.json({ reset: true, regions: listStudyRegionsFromDb() });
  })
);

// 3. Live probe of NASA CMR Collections + all 12 Research Hub links
scienceRouter.post(
  '/probe-sources',
  asyncHandler(async (_req: RequestWithContext, res) => {
    const regions = listStudyRegionsFromDb();
    const deltaRegion = regions.find((r) => r.id === 'nile-delta-north') || regions[0];

    const [cmrProbes, researchProbes] = await Promise.all([
      Promise.all(SCIENTIFIC_DATASETS.map((d) => probeNasaCmrCollection(d, deltaRegion, '2015-01-01', '2025-12-31'))),
      probeAllResearchSources(),
    ]);

    const updateResearch = db.prepare(`
      UPDATE research_sources
      SET integration_status = ?, last_probe_status = ?, last_probed_at = ?, probe_note = ?
      WHERE id = ?
    `);
    for (const p of researchProbes) {
      updateResearch.run(p.integrationStatus, p.httpStatus, p.checkedAt, p.note, p.id);
    }

    res.json({
      probedAt: new Date().toISOString(),
      cmrProbes,
      researchProbes,
    });
  })
);

// 4. Execute modular scientific pipeline for one region + dataset
scienceRouter.post(
  '/pipeline/run',
  asyncHandler(async (req: RequestWithContext, res) => {
    const {
      datasetId = 'merra-2',
      regionId = 'nile-delta-north',
      startDate = '2015-01-01',
      endDate = '2024-12-31',
      temporalAggregation = 'monthly',
      mode = 'LIVE_NASA_EARTHDATA',
    } = req.body ?? {};

    const result = await runScientificPipeline({
      datasetId: String(datasetId) as ScientificDatasetSpec['id'],
      regionId: String(regionId) as StudyRegionSpec['id'],
      startDate: String(startDate),
      endDate: String(endDate),
      temporalAggregation: String(temporalAggregation) as TemporalAggregationMode,
      mode: String(mode) as ProvenanceMode,
      requestId: req.requestId,
    });

    res.json(result);
  })
);

// 5. Import real exported NASA Giovanni / AppEEARS CSV or JSON observations
scienceRouter.post(
  '/import',
  asyncHandler(async (req: RequestWithContext, res) => {
    const {
      datasetId,
      regionId,
      startDate = '2003-01-01',
      endDate = '2025-12-31',
      temporalAggregation = 'monthly',
      rawText,
      format = 'csv',
      alreadyNormalized = true,
      sourceLabel = 'NASA_GIOVANNI_EXPORT',
    } = req.body ?? {};

    if (!datasetId || !regionId || !rawText) {
      throw new ApiError(
        400,
        'MISSING_IMPORT_FIELDS',
        'datasetId, regionId, and rawText (CSV or JSON series) are required.'
      );
    }

    const result = await runScientificPipeline({
      datasetId: String(datasetId) as ScientificDatasetSpec['id'],
      regionId: String(regionId) as StudyRegionSpec['id'],
      startDate: String(startDate),
      endDate: String(endDate),
      temporalAggregation: String(temporalAggregation) as TemporalAggregationMode,
      mode: 'IMPORTED_OBSERVATIONS',
      importedRawText: String(rawText),
      importedFormat: format === 'json' ? 'json' : 'csv',
      importedAlreadyNormalized: Boolean(alreadyNormalized),
      importedSourceLabel: String(sourceLabel),
      requestId: req.requestId,
    });

    res.status(201).json(result);
  })
);

// 6. Regional Comparison across Northern Nile Delta, Greater Cairo, and Upper Egypt
scienceRouter.get(
  '/compare',
  asyncHandler(async (req: RequestWithContext, res) => {
    const datasetId = String(req.query.datasetId || 'merra-2') as ScientificDatasetSpec['id'];
    const startDate = String(req.query.startDate || '2015-01-01');
    const endDate = String(req.query.endDate || '2024-12-31');
    const temporalAggregation = String(req.query.temporalAggregation || 'monthly') as TemporalAggregationMode;
    const mode = String(req.query.mode || 'LIVE_NASA_EARTHDATA') as ProvenanceMode;

    const comparison = await compareAllRegionsForDataset({
      datasetId,
      startDate,
      endDate,
      temporalAggregation,
      mode,
      requestId: req.requestId,
    });

    res.json(comparison);
  })
);

// 7. Query stored observations & run history
scienceRouter.get('/runs', (_req, res) => {
  const runs = db.prepare('SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT 30').all();
  res.json({ count: runs.length, runs });
});
