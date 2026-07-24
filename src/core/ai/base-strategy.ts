import type { AIStrategy, AIContext } from './types';
import type { RandomProvider } from '../engine/random';
import { CardPhase } from '../models/types';
import type { Card } from '../models/types';

export class BaseStrategy implements AIStrategy {
  name = '基础策略';
  difficulty = 1;
  private random: RandomProvider;

  constructor(random: RandomProvider) {
    this.random = random;
  }

  decidePlay(context: AIContext): Card[] {
    const { player, state } = context;
    if (player.hand.length === 0) return [];

    const truth = state.truthPhase;
    const truthCards = truth ? player.hand.filter((c) => c.phase === truth) : [];
    const daoCards = player.hand.filter((c) => c.phase === CardPhase.DAO);

    let pool: Card[];
    if (truthCards.length > 0) {
      pool = truthCards;
    } else if (daoCards.length > 0) {
      pool = daoCards;
    } else {
      // 没有真牌或道牌时只出 1 张假牌，降低被开风险
      return [this.random.shuffle([...player.hand])[0]];
    }

    const maxPlay = Math.min(3, pool.length);
    const count = Math.floor(this.random.next() * maxPlay) + 1;
    const shuffled = this.random.shuffle([...pool]);
    return shuffled.slice(0, count);
  }

  decideChallenge(context: AIContext): boolean {
    const { player, state } = context;
    if (!state.lastPlay || !state.truthPhase) return false;

    // 只剩自己还有未出的手牌时，必须质疑上家（否则没人会再质疑）
    const othersCanAct = state.players.some((p) => {
      if (p.id === player.id) return false;
      if (p.isDead) return false;
      if (p.isOutOfRound) return false;
      if (p.hand.length === 0) return false;
      return true;
    });
    if (!othersCanAct) return true;

    const truth = state.truthPhase;
    const matchingCards = player.hand.filter(
      (c) => c.phase === truth || c.phase === CardPhase.DAO
    );

    if (matchingCards.length >= 4) return true;
    if (matchingCards.length >= 3 && state.lastPlay.declaredCount >= 2) return true;
    if (state.lastPlay.declaredCount === 3 && matchingCards.length <= 1) return true;

    return this.random.next() < 0.2;
  }
}
