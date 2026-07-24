import { describe, expect, it } from 'vitest';
import { RuleEngine } from '../rule-engine';
import type { Card, GameState, Player } from '../../models/types';
import { CardPhase, GamePhase } from '../../../utils/constants';

function createCard(phase: CardPhase, id: string, zodiac?: string): Card {
  return { id, phase, zodiac } as Card;
}

function createPlayer(id: string, hand: Card[] = []): Player {
  return {
    id,
    name: id,
    isHuman: false,
    hand,
    isDead: false,
    isOutOfRound: false,
    position: 0,
  };
}

function createState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: GamePhase.PLAYING,
    players: [],
    deck: [],
    discardPile: [],
    currentRound: 1,
    activePlayerId: 'p1',
    dice: { availableFaces: [] },
    deadFaces: [],
    history: [],
    ...overrides,
  };
}

describe('RuleEngine', () => {
  const engine = new RuleEngine();

  describe('isPlayFake', () => {
    it('仅含真牌与道牌为真', () => {
      const cards = [createCard(CardPhase.TIAN, '1'), createCard(CardPhase.DAO, '2')];
      expect(engine.isPlayFake(cards, CardPhase.TIAN)).toBe(false);
    });

    it('含非真牌且非道牌为假', () => {
      const cards = [createCard(CardPhase.TIAN, '1'), createCard(CardPhase.DI, '2')];
      expect(engine.isPlayFake(cards, CardPhase.TIAN)).toBe(true);
    });
  });

  describe('canPlay', () => {
    it('非活跃玩家不能出牌', () => {
      const player = createPlayer('p1', [createCard(CardPhase.TIAN, '1')]);
      const state = createState({ activePlayerId: 'p2' });
      expect(engine.canPlay(player, [player.hand[0]], state)).toBe(false);
    });

    it('出牌数不在 1~3 之间不合法', () => {
      const player = createPlayer('p1');
      const state = createState();
      expect(engine.canPlay(player, [], state)).toBe(false);
    });

    it('出手牌中不存在的牌不合法', () => {
      const player = createPlayer('p1', [createCard(CardPhase.TIAN, '1')]);
      const state = createState();
      expect(engine.canPlay(player, [createCard(CardPhase.DI, '999')], state)).toBe(false);
    });
  });

  describe('resolveChallenge', () => {
    it('假牌时质疑方获胜', () => {
      const state = createState({
        truthPhase: CardPhase.TIAN,
        lastPlay: {
          playerId: 'p1',
          cards: [createCard(CardPhase.DI, '1')],
          declaredCount: 1,
          isRevealed: false,
        },
      });
      const result = engine.resolveChallenge(state);
      expect(result.isFake).toBe(true);
      expect(result.challengerWins).toBe(true);
    });

    it('真牌时质疑方失败', () => {
      const state = createState({
        truthPhase: CardPhase.TIAN,
        lastPlay: {
          playerId: 'p1',
          cards: [createCard(CardPhase.TIAN, '1')],
          declaredCount: 1,
          isRevealed: false,
        },
      });
      const result = engine.resolveChallenge(state);
      expect(result.isFake).toBe(false);
      expect(result.challengerWins).toBe(false);
    });
  });
});
