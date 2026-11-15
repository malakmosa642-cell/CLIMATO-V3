import { computeCoordinateRiskProfile, CoordinateRiskProfile } from './geospatialEngine.ts';

export interface CurrentWeatherResponse {
  regionId?: string;
  location: {
    name: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
  coordinates: {
    lat: number;
    lon: number;
  };
  current: {
    temperatureC: number;
    apparentTemperatureC: number | null;
    humidityPct: number;
    windSpeedKmh: number;
    precipitationMm: number;
    dailyPrecipitationMm: number;
    soilMoistureM3M3: number | null;
    soilMoistureKgM2: number | null;
    weatherCode: number;
    conditionEn: string;
    conditionAr: string;
    isDay: boolean;
    observedAt: string;
  };
  climateRisk: CoordinateRiskProfile;
  source: string;
}

const WMO_WEATHER_LABELS: Record<number, { en: string; ar: string }> = {
  0: { en: 'Clear Sky', ar: 'سماء صافية' },
  1: { en: 'Mainly Clear', ar: 'صافية غالباً' },
  2: { en: 'Partly Cloudy', ar: 'غائمة جزئياً' },
  3: { en: 'Overcast', ar: 'غائمة كلياً' },
  45: { en: 'Foggy', ar: 'ضباب' },
  48: { en: 'Depositing Rime Fog', ar: 'ضباب جليدي' },
  51: { en: 'Light Drizzle', ar: 'رذاذ خفيف' },
  53: { en: 'Moderate Drizzle', ar: 'رذاذ متوسط' },
  55: { en: 'Dense Drizzle', ar: 'رذاذ كثيف' },
  61: { en: 'Slight Rain', ar: 'أمطار خفيفة' },
  63: { en: 'Moderate Rain', ar: 'أمطار متوسطة' },
  65: { en: 'Heavy Rain', ar: 'أمطار غزيرة' },
  71: { en: 'Slight Snow', ar: 'ثلوج خفيفة' },
  73: { en: 'Moderate Snow', ar: 'ثلوج متوسطة' },
  75: { en: 'Heavy Snow', ar: 'ثلوج كثيفة' },
  80: { en: 'Slight Rain Showers', ar: 'زخات مطر خفيفة' },
  81: { en: 'Moderate Rain Showers', ar: 'زخات مطر متوسطة' },
  82: { en: 'Violent Rain Showers', ar: 'زخات مطر شديدة' },
  95: { en: 'Thunderstorm', ar: 'عاصفة رعدية' },
  96: { en: 'Thunderstorm with Hail', ar: 'عاصفة رعدية مع برد' },
  99: { en: 'Severe Thunderstorm', ar: 'عاصفة رعدية شديدة' },
};

export function describeWmoWeatherCode(code: number): { en: string; ar: string } {
  if (WMO_WEATHER_LABELS[code]) return WMO_WEATHER_LABELS[code];
  if (code >= 50 && code < 60) return { en: 'Drizzle', ar: 'رذاذ' };
  if (code >= 60 && code < 70) return { en: 'Rain', ar: 'أمطار' };
  if (code >= 70 && code < 80) return { en: 'Snowfall', ar: 'ثلوج' };
  if (code >= 80 && code < 90) return { en: 'Showers', ar: 'زخات مطر' };
  if (code >= 95) return { en: 'Thunderstorm', ar: 'عاصفة رعدية' };
  return { en: 'Atmospheric Observation', ar: 'رصد جوي' };
}

export function parseCoordinateQuery(query: string): { lat: number; lon: number } | null {
  const match = query
    .trim()
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon };
}

export async function geocodeLocation(query: string): Promise<{
  name: string;
  region?: string;
  country?: string;
  timezone?: string;
  lat: number;
  lon: number;
} | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const parsedCoords = parseCoordinateQuery(trimmed);
  if (parsedCoords) {
    return {
      name: `${parsedCoords.lat.toFixed(2)}°, ${parsedCoords.lon.toFixed(2)}°`,
      country: 'WGS84 Coordinate Lock',
      lat: parsedCoords.lat,
      lon: parsedCoords.lon,
    };
  }

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', trimmed);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Geocoding service returned HTTP ${res.status}`);
  }

  const payload = (await res.json()) as {
    results?: Array<{
      name: string;
      admin1?: string;
      country?: string;
      timezone?: string;
      latitude: number;
      longitude: number;
    }>;
  };

  const first = payload.results?.[0];
  if (!first) return null;

  return {
    name: first.name,
    region: first.admin1,
    country: first.country,
    timezone: first.timezone,
    lat: first.latitude,
    lon: first.longitude,
  };
}

export async function fetchCurrentWeather(opts: {
  lat: number;
  lon: number;
  name?: string;
  region?: string;
  country?: string;
  timezone?: string;
  regionId?: string;
}): Promise<CurrentWeatherResponse> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(opts.lat));
  url.searchParams.set('longitude', String(opts.lon));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,is_day,weather_code,wind_speed_10m'
  );
  url.searchParams.set('hourly', 'soil_moisture_0_to_7cm');
  url.searchParams.set('daily', 'precipitation_sum');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5500),
  });

  if (!res.ok) {
    throw new Error(`Weather upstream returned HTTP ${res.status}`);
  }

  const payload = (await res.json()) as {
    latitude: number;
    longitude: number;
    timezone?: string;
    current?: {
      time: string;
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature?: number;
      precipitation?: number;
      is_day?: number;
      weather_code?: number;
      wind_speed_10m: number;
    };
    hourly?: {
      time?: string[];
      soil_moisture_0_to_7cm?: Array<number | null>;
    };
    daily?: {
      precipitation_sum?: Array<number | null>;
    };
  };

  if (!payload.current) {
    throw new Error('Weather upstream omitted current observation object');
  }

  const code = Number(payload.current.weather_code ?? 0);
  const condition = describeWmoWeatherCode(code);
  const climateRisk = computeCoordinateRiskProfile(opts.lat, opts.lon);

  // Extract latest non-null topsoil moisture sample (0-7cm volumetric m3/m3 -> 0-10cm GLDAS proxy kg/m2)
  const smSeries = payload.hourly?.soil_moisture_0_to_7cm ?? [];
  const currentHourPrefix = payload.current.time.slice(0, 13);
  const hourlyTimes = payload.hourly?.time ?? [];
  const matchedIdx = hourlyTimes.findIndex((t) => t.startsWith(currentHourPrefix));
  const rawSm =
    matchedIdx >= 0 && typeof smSeries[matchedIdx] === 'number'
      ? smSeries[matchedIdx]
      : smSeries.find((v): v is number => typeof v === 'number' && Number.isFinite(v)) ?? null;

  const soilMoistureM3M3 = rawSm !== null ? Number(rawSm.toFixed(3)) : null;
  const soilMoistureKgM2 = rawSm !== null ? Number((rawSm * 100).toFixed(1)) : null;

  const precipNow = Number(payload.current.precipitation ?? 0);
  const dailyPrecipRaw = payload.daily?.precipitation_sum?.[0];
  const dailyPrecipitationMm =
    typeof dailyPrecipRaw === 'number' && Number.isFinite(dailyPrecipRaw)
      ? Number(dailyPrecipRaw.toFixed(2))
      : Number(precipNow.toFixed(2));

  return {
    regionId: opts.regionId,
    location: {
      name: opts.name || climateRisk.nearestRegisteredAoi?.nameEn || 'Selected Location',
      region: opts.region,
      country: opts.country,
      timezone: opts.timezone || payload.timezone,
    },
    coordinates: {
      lat: Number(opts.lat.toFixed(4)),
      lon: Number(opts.lon.toFixed(4)),
    },
    current: {
      temperatureC: Number(payload.current.temperature_2m),
      apparentTemperatureC:
        payload.current.apparent_temperature !== undefined
          ? Number(payload.current.apparent_temperature)
          : null,
      humidityPct: Number(payload.current.relative_humidity_2m),
      windSpeedKmh: Number(payload.current.wind_speed_10m),
      precipitationMm: Number(precipNow.toFixed(2)),
      dailyPrecipitationMm,
      soilMoistureM3M3,
      soilMoistureKgM2,
      weatherCode: code,
      conditionEn: condition.en,
      conditionAr: condition.ar,
      isDay: payload.current.is_day !== 0,
      observedAt: payload.current.time,
    },
    climateRisk,
    source: 'Open-Meteo Live Atmospheric & Land-Surface Feed',
  };
}

export interface DailyForecastItem {
  date: string;
  weatherCode: number;
  conditionEn: string;
  conditionAr: string;
  tempMinC: number;
  tempMaxC: number;
  precipProbPct: number;
  windMaxKmh: number;
}

export interface WeeklyForecastResponse {
  regionId?: string;
  coordinates: { lat: number; lon: number };
  timezone: string;
  days: DailyForecastItem[];
  source: string;
}

export async function fetchWeeklyForecast(opts: {
  lat: number;
  lon: number;
  regionId?: string;
}): Promise<WeeklyForecastResponse> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(opts.lat));
  url.searchParams.set('longitude', String(opts.lon));
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'
  );
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', 'Africa/Cairo');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5500),
  });

  if (!res.ok) {
    throw new Error(`Forecast upstream returned HTTP ${res.status}`);
  }

  const payload = (await res.json()) as {
    timezone?: string;
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
      wind_speed_10m_max?: number[];
    };
  };

  const times = payload.daily?.time ?? [];
  if (times.length === 0) {
    throw new Error('Forecast upstream returned empty daily array');
  }

  const days: DailyForecastItem[] = times.map((date, idx) => {
    const code = Number(payload.daily?.weather_code?.[idx] ?? 0);
    const cond = describeWmoWeatherCode(code);
    return {
      date,
      weatherCode: code,
      conditionEn: cond.en,
      conditionAr: cond.ar,
      tempMinC: Number(payload.daily?.temperature_2m_min?.[idx] ?? 0),
      tempMaxC: Number(payload.daily?.temperature_2m_max?.[idx] ?? 0),
      precipProbPct: Number(payload.daily?.precipitation_probability_max?.[idx] ?? 0),
      windMaxKmh: Number(payload.daily?.wind_speed_10m_max?.[idx] ?? 0),
    };
  });

  return {
    regionId: opts.regionId,
    coordinates: {
      lat: Number(opts.lat.toFixed(4)),
      lon: Number(opts.lon.toFixed(4)),
    },
    timezone: payload.timezone || 'Africa/Cairo',
    days,
    source: 'Open-Meteo 7-Day Daily Forecast Feed',
  };
}

