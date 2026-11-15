import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../server/app.ts';
import { initDatabase } from '../server/db/database.ts';
import {
  describeWmoWeatherCode,
  parseCoordinateQuery,
} from '../server/services/weatherService.ts';

let tempDir: string;
let server: Server;
let baseUrl: string;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'climato-weather-test-'));
  initDatabase(path.join(tempDir, 'weather-test.db'));
  const app = await createApp({ enableVite: false, serveStaticDist: false });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('Hero Weather Service & Endpoint', () => {
  it('parses valid WGS84 coordinate queries and rejects out-of-range coordinates', () => {
    assert.deepEqual(parseCoordinateQuery('31.20, 29.92'), { lat: 31.2, lon: 29.92 });
    assert.deepEqual(parseCoordinateQuery('-23.55 -46.63'), { lat: -23.55, lon: -46.63 });
    assert.equal(parseCoordinateQuery('Cairo'), null);
    assert.equal(parseCoordinateQuery('95.0, 30.0'), null);
    assert.equal(parseCoordinateQuery('30.0, 190.0'), null);
  });

  it('maps WMO weather codes to bilingual EN/AR labels', () => {
    assert.deepEqual(describeWmoWeatherCode(0), { en: 'Clear Sky', ar: 'سماء صافية' });
    assert.deepEqual(describeWmoWeatherCode(95), { en: 'Thunderstorm', ar: 'عاصفة رعدية' });
  });

  it('rejects invalid numeric lat/lon query parameters with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/weather/current?lat=120&lon=31`);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, 'INVALID_COORDINATES');
  });

  it('returns live temperature, humidity, wind speed, precipitation, soil moisture, and climateRisk for Cairo', async () => {
    const res = await fetch(`${baseUrl}/api/weather/current?q=Cairo`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      location: { name: string };
      coordinates: { lat: number; lon: number };
      current: {
        temperatureC: number;
        humidityPct: number;
        windSpeedKmh: number;
        precipitationMm: number;
        dailyPrecipitationMm: number;
        soilMoistureM3M3: number | null;
        soilMoistureKgM2: number | null;
      };
      climateRisk: { compositeRiskScore: number };
    };
    assert.equal(body.location.name, 'Cairo');
    assert.equal(typeof body.current.temperatureC, 'number');
    assert.equal(typeof body.current.humidityPct, 'number');
    assert.equal(typeof body.current.windSpeedKmh, 'number');
    assert.equal(typeof body.current.precipitationMm, 'number');
    assert.equal(typeof body.current.dailyPrecipitationMm, 'number');
    assert.ok(body.current.soilMoistureKgM2 === null || typeof body.current.soilMoistureKgM2 === 'number');
    assert.ok(body.climateRisk.compositeRiskScore >= 0);
  });

  it('resolves Egyptian study regions directly via regionId on /api/weather/current and rejects unknown IDs', async () => {
    const okRes = await fetch(`${baseUrl}/api/weather/current?regionId=nile-delta-north`);
    assert.equal(okRes.status, 200);
    const okBody = (await okRes.json()) as {
      regionId: string;
      location: { name: string };
      current: { temperatureC: number; windSpeedKmh: number };
    };
    assert.equal(okBody.regionId, 'nile-delta-north');
    assert.ok(okBody.location.name.includes('Delta'));
    assert.equal(typeof okBody.current.temperatureC, 'number');
    assert.equal(typeof okBody.current.windSpeedKmh, 'number');

    const badRes = await fetch(`${baseUrl}/api/weather/current?regionId=does-not-exist`);
    assert.equal(badRes.status, 404);
    const badBody = (await badRes.json()) as { error?: { code?: string } };
    assert.equal(badBody.error?.code, 'STUDY_REGION_NOT_FOUND');
  });

  it('rejects unknown study region IDs with HTTP 404 on /api/weather/forecast', async () => {
    const res = await fetch(`${baseUrl}/api/weather/forecast?regionId=unknown-region`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, 'STUDY_REGION_NOT_FOUND');
  });

  it('returns 7-day daily forecast for Core Egyptian study regions', async () => {
    const res = await fetch(`${baseUrl}/api/weather/forecast?regionId=greater-cairo`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      regionId: string;
      days: Array<{
        date: string;
        tempMinC: number;
        tempMaxC: number;
        conditionEn: string;
      }>;
    };
    assert.equal(body.regionId, 'greater-cairo');
    assert.equal(body.days.length, 7);
    assert.equal(typeof body.days[0].tempMinC, 'number');
    assert.equal(typeof body.days[0].tempMaxC, 'number');
    assert.ok(body.days[0].conditionEn.length > 0);
  });
});

