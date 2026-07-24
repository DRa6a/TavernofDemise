import type { Player } from '../core/models/types';
import { Hand } from './Hand';

interface PlayerSeatProps {
  player: Player;
  isActive: boolean;
  isHuman: boolean;
  selectedIds: string[];
  revealAll: boolean;
  onToggleCard: (cardId: string) => void;
}

export function PlayerSeat({
  player,
  isActive,
  isHuman,
  selectedIds,
  revealAll,
  onToggleCard,
}: PlayerSeatProps) {
  return (
    <div
      className={`player-seat ${isActive ? 'active' : ''} ${player.isDead ? 'dead' : ''} ${
        player.isOutOfRound ? 'out' : ''
      }`}
    >
      <div className="player-info">
        <span className="player-name">
          {player.name} {isHuman && '(你)'}
        </span>
        <span className="player-status">
          {player.isDead ? '已出局' : player.isOutOfRound ? '本轮跳过' : `${player.hand.length} 张`}
        </span>
      </div>
      {player.rolledFaces.length > 0 && (
        <div className="rolled-faces">
          {player.rolledFaces.map((face, index) => (
            <span key={`${face}-${index}`} className="rolled-face">
              {face}
            </span>
          ))}
        </div>
      )}
      {isHuman && (
        <Hand
          cards={player.hand}
          selectedIds={selectedIds}
          disabled={!isActive}
          hidden={false}
          onToggle={onToggleCard}
        />
      )}
      {!isHuman && revealAll && player.hand.length > 0 && (
        <Hand
          cards={player.hand}
          selectedIds={[]}
          disabled
          hidden={false}
          onToggle={() => {}}
        />
      )}
    </div>
  );
}
