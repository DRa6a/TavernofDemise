import type { Card as CardType } from '../core/models/types';
import { PHASE_COLORS } from '../utils/constants';

interface CardProps {
  card: CardType;
  selected?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onClick?: () => void;
}

export function Card({ card, selected, disabled, hidden, onClick }: CardProps) {
  if (hidden) {
    return (
      <div className="card card-hidden">
        <span className="card-back">终焉</span>
      </div>
    );
  }

  const phaseColor = PHASE_COLORS[card.phase];

  return (
    <button
      type="button"
      className={`card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      style={{ '--phase-color': phaseColor } as React.CSSProperties}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span className="card-phase">{card.phase}</span>
      {card.zodiac && <span className="card-zodiac">{card.zodiac}</span>}
    </button>
  );
}
