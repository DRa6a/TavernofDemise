import { useGameStore, HUMAN_ID } from '../store/game-store';
import { StartScreen } from './StartScreen';
import { PlayerSeat } from './PlayerSeat';
import { ActionPanel } from './ActionPanel';
import { GameLog } from './GameLog';

export function Game() {
  const {
    gameState,
    selectedCardIds,
    startGame,
    playCards,
    openPhase,
    toggleCard,
  } = useGameStore();

  if (!gameState) {
    return <StartScreen onStart={startGame} />;
  }

  const humanPlayer = gameState.players.find((p) => p.id === HUMAN_ID);
  const opponents = gameState.players.filter((p) => p.id !== HUMAN_ID);

  return (
    <div className="game">
      <header className="game-header">
        <h1>终焉酒馆</h1>
        <div className="game-meta">
          <span>第 {gameState.currentRound} 回合</span>
          {gameState.truthPhase && <span>真牌：{gameState.truthPhase}</span>}
          <span>阶段：{phaseLabel(gameState.phase)}</span>
        </div>
      </header>

      <main className="game-board">
        <section className="opponents">
          {opponents.map((player) => (
            <PlayerSeat
              key={player.id}
              player={player}
              isActive={player.id === gameState.activePlayerId}
              isHuman={false}
              selectedIds={[]}
              onToggleCard={() => {}}
            />
          ))}
        </section>

        <section className="table-center">
          {gameState.lastPlay && (
            <div className="last-play">
              <span className="last-play-player">{gameState.lastPlay.playerId}</span>
              <span>打出了 {gameState.lastPlay.declaredCount} 张牌</span>
              {gameState.lastPlay.isRevealed && (
                <span className="reveal-result">
                  {gameState.lastPlay.cards.map((c) => c.phase).join(' ')}
                </span>
              )}
            </div>
          )}
          <ActionPanel
            gameState={gameState}
            selectedCount={selectedCardIds.length}
            onPlay={() => playCards(selectedCardIds)}
            onChallenge={() => openPhase('challenge')}
            onPass={() => openPhase('pass')}
          />
        </section>

        <section className="human-area">
          {humanPlayer && (
            <PlayerSeat
              player={humanPlayer}
              isActive={humanPlayer.id === gameState.activePlayerId}
              isHuman={true}
              selectedIds={selectedCardIds}
              onToggleCard={toggleCard}
            />
          )}
        </section>
      </main>

      <aside className="game-sidebar">
        <GameLog events={gameState.history} />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (confirm('确定要重新开始吗？')) {
              useGameStore.setState({ gameState: null, manager: null, selectedCardIds: [] });
            }
          }}
        >
          重新开始
        </button>
      </aside>
    </div>
  );
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    waiting: '等待',
    election: '选举',
    drawing: '抽牌',
    truth: '真牌宣告',
    playing: '出牌',
    opening: '开牌',
    life_death: '生死',
    game_over: '结束',
  };
  return map[phase] ?? phase;
}
