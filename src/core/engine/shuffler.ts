import type { Card } from '../models/types';
import type { RandomProvider } from './random';

export class Shuffler {
  private random: RandomProvider;

  constructor(random: RandomProvider) {
    this.random = random;
  }

  shuffle(deck: Card[]): Card[] {
    return this.random.shuffle(deck);
  }

  draw(deck: Card[], count: number): { drawn: Card[]; remaining: Card[] } {
    const drawn = deck.slice(0, count);
    const remaining = deck.slice(count);
    return { drawn, remaining };
  }
}
