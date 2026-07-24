import { GamePhase } from '../utils/constants';
import type { GameState } from '../core/models/types';
import { MAX_PLAY_CARDS, MIN_PLAY_CARDS } from '../utils/constants';

interface ActionPanelProps {
  gameState: GameState;
  selectedCount: number;
  onPlay: () => void;
  onChallenge: () => void;
  onPass: () => void;
}

export function ActionPanel({ gameState, selectedCount, onPlay, onChallenge, onPass }: ActionPanelProps) {
  const humanActive = gameState.activePlayerId === gameState.players.find((p) => p.isHuman)?.id;

  if (gameState.phase === GamePhase.GAME_OVER) {
    const winner = gameState.players.find((p) => p.id === gameState.winnerId);
    return (
      <div className="action-panel">
        <div className="game-over">
          {winner ? `游戏结束，${winner.name} 获胜！` : '游戏结束'}
        </div>
      </div>
    );
  }

  const canPlay = humanActive && gameState.phase === GamePhase.PLAYING && selectedCount >= MIN_PLAY_CARDS && selectedCount <= MAX_PLAY_CARDS;
  const canChallenge = humanActive && gameState.phase === GamePhase.OPENING && gameState.lastPlay && gameState.lastPlay.playerId !== gameState.activePlayerId;
  const me = gameState.players.find((p) => p.isHuman);
  const othersCanAct = gameState.players.some((p) => {
    if (!me || p.id === me.id) return false;
    if (p.isDead) return false;
    if (p.isOutOfRound) return false;
    if (p.hand.length === 0) return false;
    return true;
  });
  const mustChallenge = canChallenge && !othersCanAct;

  return (
    <div className="action-panel">
      {gameState.phase === GamePhase.PLAYING && (
        <button type="button" className="btn-primary" disabled={!canPlay} onClick={onPlay}>
          出牌 ({selectedCount}/{MAX_PLAY_CARDS})
        </button>
      )}
      {gameState.phase === GamePhase.OPENING && (
        <>
          <button type="button" className="btn-danger" disabled={!canChallenge} onClick={onChallenge}>
            质疑
          </button>
          {!mustChallenge && (
            <button type="button" className="btn-secondary" disabled={!canChallenge} onClick={onPass}>
              跳过
            </button>
          )}
        </>
      )}
      {!humanActive && (
        <span className="ai-status">对手思考中…</span>
      )}
    </div>
  );
}
