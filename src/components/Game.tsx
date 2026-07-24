import { useState } from 'react';
import { useGameStore, HUMAN_ID } from '../store/game-store';
import { StartScreen } from './StartScreen';
import { PlayerSeat } from './PlayerSeat';
import { ActionPanel } from './ActionPanel';
import { GameLog } from './GameLog';
import { TablePlay } from './TablePlay';
import { DicePool } from './DicePool';
import { GamePhase } from '../utils/constants';

export function Game() {
  const [logOpen, setLogOpen] = useState(false);
  const {
    gameState,
    pendingDiceResult,
    selectedCardIds,
    startGame,
    playCards,
    openPhase,
    drawDice,
    resolveDiceAnimation,
    toggleCard,
  } = useGameStore();

  if (!gameState) {
    return <StartScreen onStart={startGame} />;
  }

  const humanPlayer = gameState.players.find((p) => p.id === HUMAN_ID);
  const opponents = gameState.players.filter((p) => p.id !== HUMAN_ID);

  const isLifeDeath = gameState.phase === GamePhase.LIFE_DEATH;
  const pendingLoser = isLifeDeath && gameState.pendingLifeDeath
    ? gameState.players.find((p) => p.id === gameState.pendingLifeDeath!.loserId)
    : undefined;

  return (
    <div className="game">
      <header className="game-header">
        <div className="header-left">
          <h1>终焉酒馆</h1>
          <span className="game-meta">
            第 {gameState.currentRound} 回合 · 真牌 {gameState.truthPhase ?? '-'} · {phaseLabel(gameState.phase)}
          </span>
        </div>
        <div className="header-right">
          <button type="button" className="btn-text" onClick={() => setLogOpen((v) => !v)}>
            {logOpen ? '收起记录' : '对局记录'}
          </button>
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              if (confirm('确定要重新开始吗？')) {
                useGameStore.setState({ gameState: null, manager: null, selectedCardIds: [], pendingDiceResult: undefined });
              }
            }}
          >
            重开
          </button>
        </div>
      </header>

      {logOpen && (
        <div className="log-drawer">
          <GameLog events={gameState.history} />
        </div>
      )}

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
          {isLifeDeath && pendingLoser ? (
            <DicePool
              availableBeasts={pendingLoser.availableBeasts}
              rolledFaces={pendingLoser.rolledFaces}
              resultFace={pendingDiceResult}
              loserName={pendingLoser.name}
              canDraw={pendingLoser.isHuman}
              onDraw={drawDice}
              onAnimationComplete={resolveDiceAnimation}
            />
          ) : (
            <>
              <TablePlay lastPlay={gameState.lastPlay} truthPhase={gameState.truthPhase} />
              <ActionPanel
                gameState={gameState}
                selectedCount={selectedCardIds.length}
                onPlay={() => playCards(selectedCardIds)}
                onChallenge={() => openPhase('challenge')}
                onPass={() => openPhase('pass')}
              />
            </>
          )}
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
    </div>
  );
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    waiting: '等待',
    election: '选举',
    drawing: '抽牌',
    truth: '真牌',
    playing: '出牌',
    opening: '开牌',
    life_death: '生死',
    game_over: '结束',
  };
  return map[phase] ?? phase;
}
