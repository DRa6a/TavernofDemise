import type { Player } from '../core/models/types';
import type { AbilityDefinition, PlayerStateEffect } from '../core/mod/types';
import { Hand } from './Hand';

interface PlayerSeatProps {
  player: Player;
  isActive: boolean;
  isHuman: boolean;
  selectedIds: string[];
  revealAll: boolean;
  onToggleCard: (cardId: string) => void;
  /** 当前 mod 注册的能力（用于显示名称） */
  abilityDefs?: AbilityDefinition[];
  /** 当前 mod 注册的状态（用于显示名称） */
  stateDefs?: PlayerStateEffect[];
}

export function PlayerSeat({
  player,
  isActive,
  isHuman,
  selectedIds,
  revealAll,
  onToggleCard,
  abilityDefs = [],
  stateDefs = [],
}: PlayerSeatProps) {
  // 基座只读 player.modData.abilities（mod 自己管剩余次数）
  const owned = ((player.modData?.abilities as Array<{ id: string; remaining: number }>) ?? []).filter(
    (a) => a.remaining > 0,
  );
  const stateIds = player.stateEffectIds ?? [];

  function abilityName(id: string): string {
    return abilityDefs.find((a) => a.id === id)?.name ?? id;
  }
  function stateName(id: string): string {
    return stateDefs.find((s) => s.id === id)?.name ?? id;
  }

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

      {/* 状态徽章 */}
      {stateIds.length > 0 && (
        <div className="state-badges">
          {stateIds.map((sid) => (
            <span key={sid} className="state-badge" title={stateName(sid)}>
              {stateName(sid)}
            </span>
          ))}
        </div>
      )}

      {/* 能力列表（自己和 revealAll 时可看对手的） */}
      {(isHuman || revealAll) && owned.length > 0 && (
        <div className="ability-list">
          {owned.map((a) => (
            <span key={a.id} className="ability-chip disabled" title={abilityName(a.id)}>
              {abilityName(a.id)} <small>×{a.remaining}</small>
            </span>
          ))}
        </div>
      )}

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
