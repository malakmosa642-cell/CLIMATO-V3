import { useState } from 'react';
import { Language, SampleObservation } from '../types/climate';

interface TimeSeriesChartProps {
  lang: Language;
  observations: SampleObservation[];
  title: string;
}

export function TimeSeriesChart({ lang, observations, title }: TimeSeriesChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (observations.length === 0) {
    return (
      <div className="glass-panel rounded-xl p-5 text-sm text-slate-400">
        {lang === 'ar' ? 'لا توجد قياسات نموذجية متاحة لهذا النطاق.' : 'No sample observations available for this filter.'}
      </div>
    );
  }

  const width = 560;
  const height = 220;
  const padL = 48;
  const padR = 24;
  const padT = 20;
  const padB = 34;

  const vals = observations.map((o) => o.metric_value);
  const baselines = observations.map((o) => o.baseline_value);
  const allVals = [...vals, ...baselines];
  const minVal = Math.min(...allVals) * 0.92;
  const maxVal = Math.max(...allVals) * 1.08 || 1;

  const xPos = (i: number) =>
    observations.length === 1
      ? padL + (width - padL - padR) / 2
      : padL + (i / (observations.length - 1)) * (width - padL - padR);

  const yPos = (v: number) =>
    padT + (1 - (v - minVal) / (maxVal - minVal || 1)) * (height - padT - padB);

  const obsPath = observations
    .map((o, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(o.metric_value).toFixed(1)}`)
    .join(' ');

  const basePath = observations
    .map((o, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(o.baseline_value).toFixed(1)}`)
    .join(' ');

  const hovered = hoverIdx !== null ? observations[hoverIdx] : observations[observations.length - 1];

  return (
    <div className="glass-panel rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-400">
            {lang === 'ar' ? 'مقارنة العينة النموذجية بخط الأساس المرجعي' : 'Sample time-series vs. historical reference baseline'}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#22FF3A] inline-block" />
            {lang === 'ar' ? 'القيمة النموذجية' : 'Sample Value'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-400 border-b border-dashed inline-block" />
            {lang === 'ar' ? 'خط الأساس' : 'Baseline'}
          </span>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-52 overflow-visible" role="img" aria-label={title}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padT + t * (height - padT - padB);
            const labelVal = maxVal - t * (maxVal - minVal);
            return (
              <g key={t}>
                <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(16,185,129,0.14)" strokeWidth="1" />
                <text x={padL - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                  {labelVal.toFixed(1)}
                </text>
              </g>
            );
          })}

          <path d={basePath} fill="none" stroke="#10B981" strokeWidth="1.75" strokeDasharray="5 4" opacity="0.85" />
          <path d={obsPath} fill="none" stroke="#22FF3A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {observations.map((o, i) => {
            const cx = xPos(i);
            const cy = yPos(o.metric_value);
            return (
              <g key={o.id}>
                <text x={cx} y={height - 10} textAnchor="middle" className="fill-slate-400 text-[10px] font-mono">
                  {o.period_label}
                </text>
                <circle
                  cx={cx}
                  cy={cy}
                  r={hoverIdx === i ? 6 : 4}
                  fill="#020403"
                  stroke="#22FF3A"
                  strokeWidth="2"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="pt-2 border-t border-emerald-950/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-300 tabular-nums">
        <span>
          {hovered.period_label} · {hovered.source_name}
        </span>
        <span>
          {hovered.metric_key}: <strong className="text-[#22FF3A]">{hovered.metric_value} {hovered.unit}</strong>
          {' · '}
          {lang === 'ar' ? 'الانحراف' : 'Delta'}:{' '}
          <strong className={hovered.anomaly_delta >= 0 ? 'text-amber-300' : 'text-emerald-300'}>
            {hovered.anomaly_delta > 0 ? `+${hovered.anomaly_delta}` : hovered.anomaly_delta} {hovered.unit}
          </strong>
        </span>
      </div>
    </div>
  );
}

interface RadarExposureProps {
  lang: Language;
  selectedModuleId: string;
}

export function ModuleExposureRadar({ lang, selectedModuleId }: RadarExposureProps) {
  const axes = [
    { id: 'delta-risk', en: 'Coastal', ar: 'السواحل', val: 0.78 },
    { id: 'crop-health', en: 'Agro Vigor', ar: 'المحاصيل', val: 0.65 },
    { id: 'urban-heat', en: 'Thermal', ar: 'الحرارة', val: 0.84 },
    { id: 'air-dust', en: 'Aerosol', ar: 'الهواء', val: 0.61 },
    { id: 'water-monitoring', en: 'Hydrology', ar: 'المياه', val: 0.72 },
    { id: 'esg-reporting', en: 'ESG Pack', ar: 'الاستدامة', val: 0.80 },
  ];

  const cx = 135;
  const cy = 120;
  const maxR = 82;
  const total = axes.length;

  const pointAt = (idx: number, ratio: number) => {
    const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
    return [cx + Math.cos(angle) * maxR * ratio, cy + Math.sin(angle) * maxR * ratio];
  };

  const polygonPoints = axes
    .map((ax, i) => {
      const boost = ax.id === selectedModuleId ? Math.min(ax.val + 0.12, 0.96) : ax.val;
      return pointAt(i, boost).join(',');
    })
    .join(' ');

  return (
    <div className="glass-panel rounded-xl p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">
          {lang === 'ar' ? 'مصفوفة حساسية النطاق (عينة نموذجية)' : 'Multi-Hazard Sensitivity Matrix (Sample)'}
        </h3>
        <p className="text-xs text-slate-400">
          {lang === 'ar' ? 'توزيع التغطية النسبية عبر محاور الرصد الستة' : 'Relative multi-sensor sensitivity across hazard dimensions'}
        </p>
      </div>

      <svg viewBox="0 0 270 240" className="w-full h-56" role="img" aria-label="Multi-hazard radar chart">
        {[0.33, 0.66, 1].map((ring) => (
          <polygon
            key={ring}
            points={axes.map((_, i) => pointAt(i, ring).join(',')).join(' ')}
            fill="none"
            stroke="rgba(16,185,129,0.2)"
            strokeWidth="1"
          />
        ))}
        {axes.map((ax, i) => {
          const [x, y] = pointAt(i, 1);
          const [lx, ly] = pointAt(i, 1.22);
          return (
            <g key={ax.id}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(16,185,129,0.2)" strokeWidth="1" />
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                className={`text-[10px] font-medium ${
                  ax.id === selectedModuleId ? 'fill-[#22FF3A]' : 'fill-slate-400'
                }`}
              >
                {ax[lang]}
              </text>
            </g>
          );
        })}
        <polygon points={polygonPoints} fill="rgba(34, 255, 58, 0.16)" stroke="#22FF3A" strokeWidth="2" />
      </svg>
    </div>
  );
}
