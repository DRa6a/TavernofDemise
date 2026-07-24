import type { Card as CardType } from '../core/models/types';
import { Card } from './Card';

interface HandProps {
  cards: CardType[];
  selectedIds: string[];
  disabled?: boolean;
  hidden?: boolean;
  onToggle: (cardId: string) => void;
}

export function Hand({ cards, selectedIds, disabled, hidden, onToggle }: HandProps) {
  return (
    <div className="hand">
      {cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          selected={selectedIds.includes(card.id)}
          disabled={disabled}
          hidden={hidden}
          onClick={() => onToggle(card.id)}
        />
      ))}
    </div>
  );
}
