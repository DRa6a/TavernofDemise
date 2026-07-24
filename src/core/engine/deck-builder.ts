import type { Card, DeckConfig } from '../models/types';
import { CardPhase, ZODIAC } from '../../utils/constants';

export class DeckBuilder {
  static buildStandardDeck(): Card[] {
    const cards: Card[] = [];
    let id = 0;

    [CardPhase.TIAN, CardPhase.DI, CardPhase.REN].forEach((phase) => {
      ZODIAC.forEach((zodiac) => {
        cards.push({ id: `card-${id++}`, phase, zodiac });
      });
    });

    for (let i = 0; i < 6; i++) {
      cards.push({ id: `card-${id++}`, phase: CardPhase.DAO });
    }

    return cards;
  }

  static buildDeck(config: DeckConfig): Card[] {
    const cards: Card[] = [];
    let id = 0;

    (Object.keys(config.phases) as CardPhase[]).forEach((phase) => {
      const count = config.phases[phase];
      if (phase === CardPhase.DAO || !config.includeZodiac) {
        for (let i = 0; i < count; i++) {
          cards.push({ id: `card-${id++}`, phase });
        }
      } else {
        for (let i = 0; i < count; i++) {
          const zodiac = ZODIAC[i % ZODIAC.length];
          cards.push({ id: `card-${id++}`, phase, zodiac });
        }
      }
    });

    return cards;
  }
}
