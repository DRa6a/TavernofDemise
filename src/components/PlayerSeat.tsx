import type { Player } from '../core/models/types';
import type { EchoDefinition, PlayerStateEffect } from '../core/mod/types';
import { Hand } from './Hand';

interface PlayerSeatProps {
  player: Player;
  isActive: boolean;
  isHuman: boolean;
  selectedIds: string[];
  revealAll: boolean;
  onToggleCard: (cardId: string) => void;
  /** 当前 mod 注册的回响（用于显示名称） */
  echoDefs?: EchoDefinition[];
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
  echoDefs = [],
  stateDefs = [],
}: PlayerSeatProps) {
  const echoes = ((player.modData?.echoes as Array<{ id: string; remaining: number }>) ?? [])
    .filter((e) => e.remaining > 0);
  const stateIds = player.stateEffectIds ?? [];

  function echoName(id: string): string {
    return echoDefs.find((e) => e.id === id)?.name ?? id;
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

      {/* 回响列表（自己和 revealAll 时可看对手的） */}
      {(isHuman || revealAll) && echoes.length > 0 && (
        <div className="echo-list">
          {echoes.map((e) => (
            <span key={e.id} className="echo-chip" title={echoName(e.id)}>
              {echoName(e.id)} <small>×{e.remaining}</small>
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
