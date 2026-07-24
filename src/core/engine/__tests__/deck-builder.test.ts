import { describe, expect, it } from 'vitest';
import { DeckBuilder } from '../deck-builder';
import { CardPhase } from '../../../utils/constants';

describe('DeckBuilder', () => {
  it('应生成 42 张标准牌', () => {
    const deck = DeckBuilder.buildStandardDeck();
    expect(deck).toHaveLength(42);
  });

  it('天、地、人各 12 张，道 6 张', () => {
    const deck = DeckBuilder.buildStandardDeck();
    const countByPhase = deck.reduce((acc, card) => {
      acc[card.phase] = (acc[card.phase] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    expect(countByPhase[CardPhase.TIAN]).toBe(12);
    expect(countByPhase[CardPhase.DI]).toBe(12);
    expect(countByPhase[CardPhase.REN]).toBe(12);
    expect(countByPhase[CardPhase.DAO]).toBe(6);
  });

  it('天、地、人牌均带生肖，道牌无生肖', () => {
    const deck = DeckBuilder.buildStandardDeck();
    const nonDao = deck.filter((c) => c.phase !== CardPhase.DAO);
    const dao = deck.filter((c) => c.phase === CardPhase.DAO);

    expect(nonDao.every((c) => c.zodiac)).toBe(true);
    expect(dao.every((c) => !c.zodiac)).toBe(true);
  });
});
