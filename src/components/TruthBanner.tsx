import { PHASE_COLORS } from '../utils/constants';
import type { CardPhase } from '../core/models/types';

interface TruthBannerProps {
  truthPhase?: CardPhase;
}

export function TruthBanner({ truthPhase }: TruthBannerProps) {
  if (!truthPhase) return null;

  return (
    <div
      className="truth-banner"
      style={{ '--phase-color': PHASE_COLORS[truthPhase] } as React.CSSProperties}
    >
      <span className="truth-label">本回合真牌</span>
      <span className="truth-phase">{truthPhase}</span>
    </div>
  );
}
