import { useEffect, useState } from 'react';
import { useGameStore, HUMAN_ID } from '../store/game-store';
import { StartScreen } from './StartScreen';
import { PlayerSeat } from './PlayerSeat';
import { ActionPanel } from './ActionPanel';
import { GameLog } from './GameLog';
import { TablePlay } from './TablePlay';
import { DiceDraw } from './DiceDraw';
import { TruthBanner } from './TruthBanner';
import { DebugPanel } from './DebugPanel';
import { GameOverOverlay } from './GameOverOverlay';
import { DeathOverlay } from './DeathOverlay';
import { ModSlot } from '../core/mod/ui-slots';
import { GamePhase } from '../utils/constants';

export function Game() {
  const [logOpen, setLogOpen] = useState(false);
  const [deathOverlay, setDeathOverlay] = useState<{ show: boolean; name: string } | null>(null);
  const [gameOverOverlay, setGameOverOverlay] = useState<{ show: boolean; name: string } | null>(null);
  const {
    gameState,
    pendingDiceResult,
    revealDelay,
    selectedCardIds,
    revealAll,
    startGame,
    playCards,
    openPhase,
    drawDice,
    resolveDiceAnimation,
    toggleCard,
    abilityDefs,
    stateDefs,
    abilityPause,
    resumeAfterAbility,
  } = useGameStore();

  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === GamePhase.GAME_OVER && gameState.winnerId) {
      const winner = gameState.players.find((p) => p.id === gameState.winnerId);
      if (winner) {
        setGameOverOverlay({ show: true, name: winner.name });
      }
    }
  }, [gameState?.phase, gameState?.winnerId, gameState?.players]);

  useEffect(() => {
    if (!gameState) return;
    const lastEvent = gameState.history[gameState.history.length - 1];
    if (lastEvent?.type === 'PLAYER_DIED') {
      const player = gameState.players.find((p) => p.id === lastEvent.playerId);
      if (player) {
        setDeathOverlay({ show: true, name: player.name });
        const timer = window.setTimeout(() => setDeathOverlay(null), 2200);
        return () => window.clearTimeout(timer);
      }
    }
    return undefined;
  }, [gameState?.history.length, gameState?.history, gameState?.players]);

  if (!gameState) {
    return <StartScreen onStart={startGame} />;
  }

  const humanPlayer = gameState.players.find((p) => p.id === HUMAN_ID);
  const opponents = gameState.players.filter((p) => p.id !== HUMAN_ID);

  const isLifeDeath = gameState.phase === GamePhase.LIFE_DEATH;
  const isInspiring = gameState.phase === GamePhase.INSPIRING;
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
          <ModSlot slot="game:header-extra" />
          <DebugPanel />
          <button type="button" className="btn-text" onClick={() => setLogOpen((v) => !v)}>
            {logOpen ? '收起记录' : '对局记录'}
          </button>
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              if (confirm('确定要重新开始吗？')) {
                useGameStore.setState({ gameState: null, manager: null, selectedCardIds: [], pendingDiceResult: undefined, revealDelay: false });
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
              revealAll={revealAll}
              onToggleCard={() => {}}
              abilityDefs={abilityDefs}
              stateDefs={stateDefs}
            />
          ))}
        </section>

        {!(isLifeDeath && !revealDelay) && <TruthBanner truthPhase={gameState.truthPhase} />}

        <section className="table-center">
          {isInspiring ? (
            // mod 通过「table-center:overlay」槽注入的激发阶段 UI
            // 该槽的渲染函数应当自带「进入对局」按钮（调 completeInspirePhase）
            <ModSlot slot="table-center:overlay" />
          ) : revealDelay ? (
            <TablePlay lastPlay={gameState.lastPlay} truthPhase={gameState.truthPhase} revealAll={revealAll} />
          ) : isLifeDeath && pendingLoser ? (
            <DiceDraw
              availableBeasts={pendingLoser.availableBeasts}
              rolledFaces={pendingLoser.rolledFaces}
              resultFace={pendingDiceResult}
              loserName={pendingLoser.name}
              canDraw={pendingLoser.isHuman}
              revealAll={revealAll}
              onDraw={drawDice}
              onAnimationComplete={resolveDiceAnimation}
            />
          ) : (
            <>
              <TablePlay lastPlay={gameState.lastPlay} truthPhase={gameState.truthPhase} revealAll={revealAll} />
              <ActionPanel
                gameState={gameState}
                selectedCount={selectedCardIds.length}
                onPlay={() => playCards(selectedCardIds)}
                onChallenge={() => openPhase('challenge')}
                onPass={() => openPhase('pass')}
              />
              {/* mod 通过「action-area:side」槽注入的能力面板/操作 */}
              <ModSlot slot="action-area:side" />
            </>
          )}
        </section>

        <section className="human-area">
          {humanPlayer && (
            <PlayerSeat
              key={humanPlayer.id}
              player={humanPlayer}
              isActive={humanPlayer.id === gameState.activePlayerId}
              isHuman={true}
              selectedIds={selectedCardIds}
              revealAll={revealAll}
              onToggleCard={toggleCard}
              abilityDefs={abilityDefs}
              stateDefs={stateDefs}
            />
          )}
        </section>
      </main>

      {gameOverOverlay?.show && <GameOverOverlay winnerName={gameOverOverlay.name} />}
      {deathOverlay?.show && <DeathOverlay playerName={deathOverlay.name} />}
      {abilityPause && <AbilityPauseOverlay info={abilityPause} onResume={resumeAfterAbility} />}
    </div>
  );
}

interface AbilityPauseOverlayProps {
  info: { playerId: string; abilityId: string; reason: string };
  onResume: () => void;
}

function AbilityPauseOverlay({ info, onResume }: AbilityPauseOverlayProps) {
  const isHuman = info.playerId === 'p0';
  return (
    <div className="ability-pause-overlay" onClick={isHuman ? onResume : undefined}>
      <div className="ability-pause-card" onClick={(e) => e.stopPropagation()}>
        <h3>⏸  进程暂停</h3>
        <p className="ability-pause-reason">{info.reason}</p>
        <p className="hint">
          {isHuman
            ? '能力已生效。点「继续」让游戏推进。'
            : 'AI 正在结算中…'}
        </p>
        {isHuman && (
          <button type="button" className="btn-primary" onClick={onResume}>
            继续
          </button>
        )}
      </div>
    </div>
  );
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    waiting: '等待',
    inspiring: '激发',
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
