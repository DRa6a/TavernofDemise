import { AIStrategy, AIContext } from './types';
import { RandomProvider } from '../engine/random';
import { Card } from '../models/types';

export class BaseStrategy implements AIStrategy {
  name = '基础策略';
  difficulty = 1;

  constructor(private random: RandomProvider) {}

  decidePlay(context: AIContext): Card[] {
    const { player } = context;
    if (player.hand.length === 0) return [];

    const maxPlay = Math.min(3, player.hand.length);
    const count = Math.floor(this.random.next() * maxPlay) + 1;

    const shuffled = this.random.shuffle([...player.hand]);
    return shuffled.slice(0, count);
  }

  decideChallenge(context: AIContext): boolean {
    const { state } = context;
    if (!state.lastPlay) return false;

    const alivePlayers = state.players.filter((p) => !p.isDead);
    if (alivePlayers.length <= 2) return true;

    return this.random.next() < 0.3;
  }
}
