import { describe, expect, it } from 'vitest';
import { RoundManager } from '../round-manager';
import { SeededRandom } from '../random';
import { GamePhase } from '../../../utils/constants';

describe('RoundManager', () => {
  it('应能开始游戏并进入出牌阶段', () => {
    const random = new SeededRandom(42);
    const manager = new RoundManager(random);

    manager.startGame([
      { id: 'p1', name: '玩家1', isHuman: false },
      { id: 'p2', name: '玩家2', isHuman: false },
    ]);

    const state = manager.getState();
    expect(state.phase).toBe(GamePhase.PLAYING);
    expect(state.players).toHaveLength(2);
    expect(state.players.every((p) => p.hand.length === 6)).toBe(true);
    expect(state.truthPhase).toBeDefined();
  });

  it('应完成一次出牌与质疑流程', () => {
    const random = new SeededRandom(42);
    const manager = new RoundManager(random);

    manager.startGame([
      { id: 'p1', name: '玩家1', isHuman: false },
      { id: 'p2', name: '玩家2', isHuman: false },
    ]);

    const activeId = manager.getState().activePlayerId;
    const player = manager.getState().players.find((p) => p.id === activeId)!;
    const cardIds = player.hand.slice(0, 1).map((c) => c.id);

    manager.playCards(activeId, cardIds);
    expect(manager.getState().phase).toBe(GamePhase.OPENING);

    manager.openPhase('challenge');

    expect(manager.getState().phase).toBe(GamePhase.LIFE_DEATH);
    expect(manager.getState().pendingLifeDeath).toBeDefined();

    manager.resolveLifeDeath();

    const state = manager.getState();
    const revealed = state.history.some((e) => e.type === 'CARDS_REVEALED');
    expect(revealed).toBe(true);
    expect([GamePhase.PLAYING, GamePhase.GAME_OVER]).toContain(state.phase);
  });
});
