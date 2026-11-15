export interface TimeSeriesPoint {
  obsDate: string; // YYYY-MM-DD
  year: number;
  month: number;
  value: number | null;
  uncertainty?: number | null;
  qualityFlag?: string;
}

export interface SeasonalTrendBreakdown {
  season: 'DJF' | 'MAM' | 'JJA' | 'SON';
  labelEn: string;
  labelAr: string;
  sampleCount: number;
  validYears: number;
  status: 'COMPUTED' | 'INSUFFICIENT_DATA';
  mannKendallS: number | null;
  mannKendallZ: number | null;
  pValue: number | null;
  isSignificant05: boolean;
  theilSenSlopePerYear: number | null;
  ci95LowerPerYear: number | null;
  ci95UpperPerYear: number | null;
  note: string;
}

export interface TrendAnalysisReport {
  status: 'SIGNIFICANT_TREND' | 'NO_SIGNIFICANT_TREND' | 'INSUFFICIENT_DATA';
  insufficientReason: string | null;
  diagnostics: {
    totalExpectedSteps: number;
    validObservations: number;
    missingObservations: number;
    coveragePct: number;
    minimumRequiredSamples: number;
    minimumRequiredCoveragePct: number;
    timeSpanYears: number;
    startDate: string | null;
    endDate: string | null;
    tieGroupsCount: number;
    lag1Autocorrelation: number | null;
    effectiveSampleSize: number | null;
    autocorrelationConcern: boolean;
  };
  mannKendall: {
    sStatistic: number | null;
    varianceS: number | null;
    zScore: number | null;
    pValueTwoSided: number | null;
    modifiedVarianceS: number | null;
    modifiedZScore: number | null;
    modifiedPValueTwoSided: number | null;
    isSignificantAlpha05: boolean;
    isSignificantAfterAutocorr05: boolean;
    trendDirection: 'INCREASING' | 'DECREASING' | 'NO_TREND' | 'UNDETERMINED';
  };
  theilSen: {
    slopePerYear: number | null;
    slopePerDecade: number | null;
    interceptAtStart: number | null;
    ci95LowerPerYear: number | null;
    ci95UpperPerYear: number | null;
    pairwiseSlopeCount: number;
    unitPerYear: string;
  };
  summaryStats: {
    mean: number | null;
    median: number | null;
    stdDev: number | null;
    min: number | null;
    max: number | null;
  };
  seasonalBreakdown: SeasonalTrendBreakdown[];
  methodologicalLimitationsEn: string[];
  methodologicalLimitationsAr: string[];
}

const MIN_REQUIRED_SAMPLES = 10;
const MIN_REQUIRED_COVERAGE_PCT = 70;

/**
 * High-precision complementary error function approximation (Abramowitz & Stegun 7.1.26)
 * for two-sided standard normal p-value: p = erfc(|z| / sqrt(2)).
 */
function erfcApprox(x: number): number {
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const res = poly * Math.exp(-absX * absX);
  return x >= 0 ? res : 2 - res;
}

function twoSidedNormalPValue(z: number): number {
  if (!Number.isFinite(z)) return 1;
  const p = erfcApprox(Math.abs(z) / Math.SQRT2);
  return Math.min(1, Math.max(0, Number(p.toFixed(6))));
}

function decimalYear(year: number, month: number): number {
  return year + (month - 0.5) / 12;
}

function computeMedian(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeLag1Autocorrelation(values: number[]): number | null {
  const n = values.length;
  if (n < 6) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - mean;
    den += d * d;
    if (i < n - 1) {
      num += d * (values[i + 1] - mean);
    }
  }
  if (den === 0) return 0;
  return Number((num / den).toFixed(4));
}

function computeRankAutocorrelations(values: number[], maxLag: number): number[] {
  const n = values.length;
  // Convert to ranks for Hamed-Rao (1998) modified Mann-Kendall variance
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  const meanRank = (n + 1) / 2;
  let den = 0;
  for (let t = 0; t < n; t++) {
    den += (ranks[t] - meanRank) ** 2;
  }
  if (den === 0) return [];

  const rhos: number[] = [];
  for (let k = 1; k <= maxLag; k++) {
    let num = 0;
    for (let t = 0; t < n - k; t++) {
      num += (ranks[t] - meanRank) * (ranks[t + k] - meanRank);
    }
    rhos.push(num / den);
  }
  return rhos;
}

function runCoreMannKendallTheilSen(
  validPoints: Array<{ tYear: number; value: number }>
): {
  n: number;
  s: number;
  varS: number;
  z: number;
  pValue: number;
  tieGroupsCount: number;
  modifiedVarS: number;
  modifiedZ: number;
  modifiedPValue: number;
  slopePerYear: number;
  interceptAtStart: number;
  ciLower: number | null;
  ciUpper: number | null;
  pairwiseCount: number;
} {
  const n = validPoints.length;

  // 1. Mann-Kendall S statistic
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = validPoints[j].value - validPoints[i].value;
      if (diff > 0) s += 1;
      else if (diff < 0) s -= 1;
    }
  }

  // 2. Tie correction in Var(S)
  const sortedVals = [...validPoints.map((p) => p.value)].sort((a, b) => a - b);
  let tieCorrection = 0;
  let tieGroupsCount = 0;
  let idx = 0;
  while (idx < n) {
    let j = idx;
    while (j + 1 < n && sortedVals[j + 1] === sortedVals[idx]) j++;
    const tp = j - idx + 1;
    if (tp > 1) {
      tieGroupsCount += 1;
      tieCorrection += tp * (tp - 1) * (2 * tp + 5);
    }
    idx = j + 1;
  }

  const varS = Math.max(1e-9, (n * (n - 1) * (2 * n + 5) - tieCorrection) / 18);
  const z = s > 0 ? (s - 1) / Math.sqrt(varS) : s < 0 ? (s + 1) / Math.sqrt(varS) : 0;
  const pValue = twoSidedNormalPValue(z);

  // 3. Hamed & Rao (1998) autocorrelation-modified Var*(S)
  const rawVals = validPoints.map((p) => p.value);
  const maxLag = Math.min(n - 3, 12);
  let essCorrection = 1;
  if (maxLag >= 1 && n >= 10) {
    const rhos = computeRankAutocorrelations(rawVals, maxLag);
    const sigCrit = 1.96 / Math.sqrt(n);
    let sumTerm = 0;
    for (let k = 1; k <= rhos.length; k++) {
      const rhoK = rhos[k - 1];
      if (Math.abs(rhoK) > sigCrit) {
        sumTerm += (n - k) * (n - k - 1) * (n - k - 2) * rhoK;
      }
    }
    const factor = 1 + (2 / (n * (n - 1) * (n - 2))) * sumTerm;
    essCorrection = Math.max(0.25, factor);
  }
  const modifiedVarS = Math.max(1e-9, varS * essCorrection);
  const modifiedZ =
    s > 0 ? (s - 1) / Math.sqrt(modifiedVarS) : s < 0 ? (s + 1) / Math.sqrt(modifiedVarS) : 0;
  const modifiedPValue = twoSidedNormalPValue(modifiedZ);

  // 4. Theil-Sen pairwise slopes per year & non-parametric 95% Confidence Interval
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dt = validPoints[j].tYear - validPoints[i].tYear;
      if (dt > 0) {
        slopes.push((validPoints[j].value - validPoints[i].value) / dt);
      }
    }
  }
  slopes.sort((a, b) => a - b);
  const slopePerYear = computeMedian(slopes);
  const t0 = validPoints[0].tYear;
  const intercepts = validPoints.map((p) => p.value - slopePerYear * (p.tYear - t0)).sort((a, b) => a - b);
  const interceptAtStart = computeMedian(intercepts);

  const N = slopes.length;
  let ciLower: number | null = null;
  let ciUpper: number | null = null;
  if (N >= 3) {
    const cAlpha = 1.95996 * Math.sqrt(varS);
    const m1 = Math.max(0, Math.min(N - 1, Math.floor((N - cAlpha) / 2)));
    const m2 = Math.max(m1, Math.min(N - 1, Math.ceil((N + cAlpha) / 2) - 1));
    ciLower = Number(slopes[m1].toFixed(5));
    ciUpper = Number(slopes[m2].toFixed(5));
  }

  return {
    n,
    s,
    varS: Number(varS.toFixed(4)),
    z: Number(z.toFixed(4)),
    pValue,
    tieGroupsCount,
    modifiedVarS: Number(modifiedVarS.toFixed(4)),
    modifiedZ: Number(modifiedZ.toFixed(4)),
    modifiedPValue,
    slopePerYear: Number(slopePerYear.toFixed(5)),
    interceptAtStart: Number(interceptAtStart.toFixed(4)),
    ciLower,
    ciUpper,
    pairwiseCount: N,
  };
}

export function analyzeTimeSeriesTrends(
  points: TimeSeriesPoint[],
  unit: string,
  options?: { expectedSteps?: number; minSamples?: number; minCoveragePct?: number }
): TrendAnalysisReport {
  const minSamples = options?.minSamples ?? MIN_REQUIRED_SAMPLES;
  const minCoveragePct = options?.minCoveragePct ?? MIN_REQUIRED_COVERAGE_PCT;

  const sorted = [...points].sort((a, b) => a.obsDate.localeCompare(b.obsDate));
  const valid = sorted
    .filter((p) => p.value !== null && Number.isFinite(p.value))
    .map((p) => ({
      ...p,
      value: p.value as number,
      tYear: decimalYear(p.year, p.month),
    }));

  const totalSteps = options?.expectedSteps && options.expectedSteps >= sorted.length
    ? options.expectedSteps
    : sorted.length;
  const missingCount = Math.max(0, totalSteps - valid.length);
  const coveragePct = totalSteps > 0 ? Number(((valid.length / totalSteps) * 100).toFixed(1)) : 0;

  const startDate = valid[0]?.obsDate || sorted[0]?.obsDate || null;
  const endDate = valid[valid.length - 1]?.obsDate || sorted[sorted.length - 1]?.obsDate || null;
  const timeSpanYears =
    valid.length >= 2 ? Number((valid[valid.length - 1].tYear - valid[0].tYear).toFixed(2)) : 0;

  // Summary statistics over valid records only
  const vals = valid.map((p) => p.value);
  const sortedVals = [...vals].sort((a, b) => a - b);
  const mean = vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)) : null;
  const median = vals.length > 0 ? Number(computeMedian(sortedVals).toFixed(4)) : null;
  const stdDev =
    vals.length > 1 && mean !== null
      ? Number(
          Math.sqrt(vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (vals.length - 1)).toFixed(4)
        )
      : null;

  const rho1 = computeLag1Autocorrelation(vals);
  const effectiveSampleSize =
    rho1 !== null && valid.length >= 6 && Math.abs(rho1) < 0.99
      ? Number(Math.max(2, valid.length * ((1 - rho1) / (1 + rho1))).toFixed(1))
      : null;
  const autocorrelationConcern =
    rho1 !== null && valid.length >= 10 && Math.abs(rho1) > 1.96 / Math.sqrt(valid.length);

  // Seasonal aggregation (DJF, MAM, JJA, SON)
  const seasons: Array<{ code: SeasonalTrendBreakdown['season']; months: number[]; en: string; ar: string }> = [
    { code: 'DJF', months: [12, 1, 2], en: 'Winter (DJF)', ar: 'الشتاء (DJF)' },
    { code: 'MAM', months: [3, 4, 5], en: 'Spring (MAM)', ar: 'الربيع (MAM)' },
    { code: 'JJA', months: [6, 7, 8], en: 'Summer (JJA)', ar: 'الصيف (JJA)' },
    { code: 'SON', months: [9, 10, 11], en: 'Autumn (SON)', ar: 'الخريف (SON)' },
  ];

  const seasonalBreakdown: SeasonalTrendBreakdown[] = seasons.map((s) => {
    // Group by hydrological year for DJF (Dec belongs to following year's winter)
    const bySeasonYear = new Map<number, number[]>();
    for (const pt of valid) {
      if (!s.months.includes(pt.month)) continue;
      const seasonYr = s.code === 'DJF' && pt.month === 12 ? pt.year + 1 : pt.year;
      const arr = bySeasonYear.get(seasonYr) || [];
      arr.push(pt.value);
      bySeasonYear.set(seasonYr, arr);
    }

    const annualSeasonPts = Array.from(bySeasonYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([yr, arr]) => ({
        tYear: yr,
        value: arr.reduce((a, b) => a + b, 0) / arr.length,
      }));

    if (annualSeasonPts.length < 6) {
      return {
        season: s.code,
        labelEn: s.en,
        labelAr: s.ar,
        sampleCount: valid.filter((pt) => s.months.includes(pt.month)).length,
        validYears: annualSeasonPts.length,
        status: 'INSUFFICIENT_DATA',
        mannKendallS: null,
        mannKendallZ: null,
        pValue: null,
        isSignificant05: false,
        theilSenSlopePerYear: null,
        ci95LowerPerYear: null,
        ci95UpperPerYear: null,
        note: `Requires at least 6 complete ${s.code} seasons (${annualSeasonPts.length} available).`,
      };
    }

    const res = runCoreMannKendallTheilSen(annualSeasonPts);
    return {
      season: s.code,
      labelEn: s.en,
      labelAr: s.ar,
      sampleCount: valid.filter((pt) => s.months.includes(pt.month)).length,
      validYears: annualSeasonPts.length,
      status: 'COMPUTED',
      mannKendallS: res.s,
      mannKendallZ: res.z,
      pValue: res.pValue,
      isSignificant05: res.pValue < 0.05,
      theilSenSlopePerYear: res.slopePerYear,
      ci95LowerPerYear: res.ciLower,
      ci95UpperPerYear: res.ciUpper,
      note:
        res.pValue < 0.05
          ? `Seasonal p=${res.pValue.toFixed(4)} (< 0.05)`
          : `No statistically significant ${s.code} trend (p=${res.pValue.toFixed(4)})`,
    };
  });

  const limitationsEn = [
    'Mann-Kendall and Theil-Sen are monotonic non-parametric estimators; abrupt step-changes or non-linear regime shifts are not modeled as a single linear slope.',
    'Serial persistence (lag-1 autocorrelation) inflates standard Mann-Kendall significance; Hamed-Rao modified variance is reported alongside classical p-values.',
    'Regional bounding-box averages preserve native sensor footprint limitations and do not represent point-level weather station precision.',
  ];
  const limitationsAr = [
    'اختبار مان-كيندال وميل ثيل-سين يفترضان اتجاهاً رتيباً (صاعداً أو هابطاً) ولا يعزلان التغيرات المفاجئة غير الخطية في معامل واحد.',
    'الارتباط الذاتي التسلسلي (Lag-1) يضخم الدلالة الإحصائية التقليدية؛ لذا يُعرض تباين حامد-راو المعدل جنباً إلى جنب مع قيمة p الأصلية.',
    'المتوسطات المكانية تحافظ على حدود الدقة الفيزيائية للمستشعر الأصلي ولا تعني قياساً نقطياً لمحطة رصد أرضية.',
  ];

  // STRICT SIGNIFICANCE GUARDRAIL: refuse significance when sample count or coverage is insufficient
  if (valid.length < minSamples || coveragePct < minCoveragePct) {
    const reasons: string[] = [];
    if (valid.length < minSamples) {
      reasons.push(`valid sample count (${valid.length}) is below minimum threshold (${minSamples})`);
    }
    if (coveragePct < minCoveragePct) {
      reasons.push(`temporal coverage (${coveragePct}%) is below required threshold (${minCoveragePct}%)`);
    }

    return {
      status: 'INSUFFICIENT_DATA',
      insufficientReason: `Statistical significance suppressed: ${reasons.join(' and ')}.`,
      diagnostics: {
        totalExpectedSteps: totalSteps,
        validObservations: valid.length,
        missingObservations: missingCount,
        coveragePct,
        minimumRequiredSamples: minSamples,
        minimumRequiredCoveragePct: minCoveragePct,
        timeSpanYears,
        startDate,
        endDate,
        tieGroupsCount: 0,
        lag1Autocorrelation: rho1,
        effectiveSampleSize,
        autocorrelationConcern,
      },
      mannKendall: {
        sStatistic: null,
        varianceS: null,
        zScore: null,
        pValueTwoSided: null,
        modifiedVarianceS: null,
        modifiedZScore: null,
        modifiedPValueTwoSided: null,
        isSignificantAlpha05: false,
        isSignificantAfterAutocorr05: false,
        trendDirection: 'UNDETERMINED',
      },
      theilSen: {
        slopePerYear: null,
        slopePerDecade: null,
        interceptAtStart: null,
        ci95LowerPerYear: null,
        ci95UpperPerYear: null,
        pairwiseSlopeCount: 0,
        unitPerYear: `${unit}/yr`,
      },
      summaryStats: {
        mean,
        median,
        stdDev,
        min: sortedVals.length > 0 ? sortedVals[0] : null,
        max: sortedVals.length > 0 ? sortedVals[sortedVals.length - 1] : null,
      },
      seasonalBreakdown,
      methodologicalLimitationsEn: limitationsEn,
      methodologicalLimitationsAr: limitationsAr,
    };
  }

  const core = runCoreMannKendallTheilSen(valid);
  const sigStandard = core.pValue < 0.05;
  const sigModified = core.modifiedPValue < 0.05;
  const effectiveSig = autocorrelationConcern ? sigModified : sigStandard;

  const direction: TrendAnalysisReport['mannKendall']['trendDirection'] = !effectiveSig
    ? 'NO_TREND'
    : core.slopePerYear > 0
    ? 'INCREASING'
    : core.slopePerYear < 0
    ? 'DECREASING'
    : 'NO_TREND';

  return {
    status: effectiveSig ? 'SIGNIFICANT_TREND' : 'NO_SIGNIFICANT_TREND',
    insufficientReason: null,
    diagnostics: {
      totalExpectedSteps: totalSteps,
      validObservations: valid.length,
      missingObservations: missingCount,
      coveragePct,
      minimumRequiredSamples: minSamples,
      minimumRequiredCoveragePct: minCoveragePct,
      timeSpanYears,
      startDate,
      endDate,
      tieGroupsCount: core.tieGroupsCount,
      lag1Autocorrelation: rho1,
      effectiveSampleSize,
      autocorrelationConcern,
    },
    mannKendall: {
      sStatistic: core.s,
      varianceS: core.varS,
      zScore: core.z,
      pValueTwoSided: core.pValue,
      modifiedVarianceS: core.modifiedVarS,
      modifiedZScore: core.modifiedZ,
      modifiedPValueTwoSided: core.modifiedPValue,
      isSignificantAlpha05: sigStandard,
      isSignificantAfterAutocorr05: sigModified,
      trendDirection: direction,
    },
    theilSen: {
      slopePerYear: core.slopePerYear,
      slopePerDecade: Number((core.slopePerYear * 10).toFixed(4)),
      interceptAtStart: core.interceptAtStart,
      ci95LowerPerYear: core.ciLower,
      ci95UpperPerYear: core.ciUpper,
      pairwiseSlopeCount: core.pairwiseCount,
      unitPerYear: `${unit}/yr`,
    },
    summaryStats: {
      mean,
      median,
      stdDev,
      min: sortedVals[0],
      max: sortedVals[sortedVals.length - 1],
    },
    seasonalBreakdown,
    methodologicalLimitationsEn: limitationsEn,
    methodologicalLimitationsAr: limitationsAr,
  };
}
