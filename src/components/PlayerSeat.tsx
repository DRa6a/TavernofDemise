import type { Player } from '../core/models/types';
import { Hand } from './Hand';

interface PlayerSeatProps {
  player: Player;
  isActive: boolean;
  isHuman: boolean;
  selectedIds: string[];
  onToggleCard: (cardId: string) => void;
}

export function PlayerSeat({ player, isActive, isHuman, selectedIds, onToggleCard }: PlayerSeatProps) {
  return (
    <div className={`player-seat ${isActive ? 'active' : ''} ${player.isDead ? 'dead' : ''} ${player.isOutOfRound ? 'out' : ''}`}>
      <div className="player-info">
        <span className="player-name">
          {player.name} {isHuman && '(你)'}
        </span>
        <span className="player-status">
          {player.isDead ? '已出局' : player.isOutOfRound ? '本轮跳过' : `${player.hand.length} 张`}
        </span>
      </div>
      <Hand
        cards={player.hand}
        selectedIds={isHuman ? selectedIds : []}
        disabled={!isActive || !isHuman}
        hidden={!isHuman}
        onToggle={onToggleCard}
      />
    </div>
  );
}
