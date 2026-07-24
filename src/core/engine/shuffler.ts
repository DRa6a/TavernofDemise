import { Card } from '../models/types';
import { RandomProvider } from './random';

export class Shuffler {
  constructor(private random: RandomProvider) {}

  shuffle(deck: Card[]): Card[] {
    return this.random.shuffle(deck);
  }

  draw(deck: Card[], count: number): { drawn: Card[]; remaining: Card[] } {
    const drawn = deck.slice(0, count);
    const remaining = deck.slice(count);
    return { drawn, remaining };
  }
}
