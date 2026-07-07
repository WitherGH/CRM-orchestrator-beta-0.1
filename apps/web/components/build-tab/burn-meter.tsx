import { formatUsd } from './agent-feed';

export type BurnMeterTone = 'calm' | 'over' | 'warming';

export interface BurnMeterView {
  label: string;
  percent: number;
  tone: BurnMeterTone;
}

export interface BurnMeterProps {
  capUsd: number;
  todayUsd: number;
}

export function buildBurnMeterView({ capUsd, todayUsd }: BurnMeterProps): BurnMeterView {
  const percent = capUsd > 0
    ? Math.min(100, Math.round((todayUsd / capUsd) * 100))
    : 0;

  let tone: BurnMeterTone = 'calm';
  if (todayUsd > 0 && todayUsd >= capUsd) {
    tone = 'over';
  } else if (percent >= 80) {
    tone = 'warming';
  }

  return {
    label: `${formatUsd(todayUsd)} / ${formatUsd(capUsd)} today`,
    percent,
    tone,
  };
}

const toneBarClass: Record<BurnMeterTone, string> = {
  calm: 'bg-accent',
  over: 'bg-danger',
  warming: 'bg-warning',
};

const toneTextClass: Record<BurnMeterTone, string> = {
  calm: 'text-ink-secondary',
  over: 'text-danger',
  warming: 'text-warning',
};

export function BurnMeter(props: BurnMeterProps) {
  const view = buildBurnMeterView(props);

  return (
    <a
      aria-label={`Token spend: ${view.label}`}
      className="flex items-center gap-3 rounded-pill border border-line bg-surface px-4 py-1.5 shadow-card"
      href="/insights"
      title="Open cost insights"
    >
      <span className={`font-mono text-sm ${toneTextClass[view.tone]}`}>{view.label}</span>
      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-pill bg-sunken">
        <span
          className={`block h-full rounded-pill ${toneBarClass[view.tone]}`}
          style={{ width: `${view.percent}%` }}
        />
      </span>
    </a>
  );
}
