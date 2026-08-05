// AI 基础策略
// 完全通用：基座不写任何 mod 业务概念。
// AI 决定「用不用一个能力」时，按以下规则：
//   1. trigger === 'when-die' 不主动用（死亡时自动触发）
//   2. trigger === 'custom' 不主动用（由 mod 自管）
//   3. 其余按 AbilityDefinition.meta?.aiWeight 数值（默认 5）排序打分
//      mod 可在 data.abilities[i].meta.aiWeight 调整
//   4. 命中概率 = weight / 120 上限 0.6
//   5. 选目标：requiresTarget=true 时随机一个其它存活玩家
//      否则 40% 概率选一个其它存活玩家，60% 不选
import type { AIStrategy, AIContext } from './types';
import type { RandomProvider } from '../engine/random';
import { CardPhase } from '../models/types';
import type { Card, Player } from '../models/types';
import type { AbilityDefinition } from '../mod/types';

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
      (c) => c.phase === truth || c.phase === CardPhase.DAO,
    );

    if (matchingCards.length >= 4) return true;
    if (matchingCards.length >= 3 && state.lastPlay.declaredCount >= 2) return true;
    if (state.lastPlay.declaredCount === 3 && matchingCards.length <= 1) return true;

    return this.random.next() < 0.2;
  }

  /**
   * 决定是否使用一个能力（基座通用实现）。
   * mod 可在 data.abilities[i].meta.aiWeight 调整各项权重。
   */
  decideAbility(
    context: AIContext,
    abilityDefs: AbilityDefinition[],
  ): { abilityId: string; targetId?: string } | null {
    const { player, state } = context;
    // 基座只读 player.modData.abilities（mod 自己管剩余次数与数据形状）
    const owned = ((player.modData?.abilities as Array<{ id: string; remaining: number }>) ?? [])
      .filter((a) => a.remaining > 0);
    if (owned.length === 0) return null;

    const defsById = new Map(abilityDefs.map((d) => [d.id, d]));

    // 找可用能力：filter 出 trigger 在当前 phase 下可用的
    const usable = owned
      .map((a) => defsById.get(a.id))
      .filter((d): d is AbilityDefinition => Boolean(d && isTriggerAvailable(d.trigger, state.phase)));
    if (usable.length === 0) return null;

    // 排序：先按 meta.aiWeight 权重，再随机扰动
    const weight = (d: AbilityDefinition): number => {
      const w = (d.meta?.aiWeight as number | undefined);
      return typeof w === 'number' ? w : 5;
    };
    const sorted = usable
      .map((d) => ({ d, w: weight(d) + this.random.next() * 20 }))
      .sort((a, b) => b.w - a.w);

    // 命中率与权重成正比，最高不超过 0.6
    const top = sorted[0];
    const hitChance = Math.min(0.6, top.w / 120);
    if (this.random.next() > hitChance) return null;

    // 选目标
    const otherAlive = state.players.filter((p) => p.id !== player.id && !p.isDead);
    let target: Player | undefined;
    if (top.d.requiresTarget && otherAlive.length > 0) {
      target = otherAlive[Math.floor(this.random.next() * otherAlive.length)];
    } else if (otherAlive.length > 0 && this.random.next() < 0.4) {
      target = otherAlive[Math.floor(this.random.next() * otherAlive.length)];
    }

    return { abilityId: top.d.id, targetId: target?.id };
  }
}

/**
 * 通用 trigger → 阶段匹配。mod 可在 AbilityDefinition.meta 自定义更复杂的判断。
 */
function isTriggerAvailable(
  trigger: AbilityDefinition['trigger'],
  phase: string,
): boolean {
  if (trigger === 'when-die') return false;
  if (trigger === 'any') return true;
  if (trigger === 'custom') return false;
  switch (trigger) {
    case 'play-phase':
    case 'open-phase':
    case 'small-round':
    case 'big-round':
    case 'after-life-death':
    case 'before-draw':
      return phase === 'playing' || phase === 'opening';
    case 'life-death':
    case 'before-life-death':
      return phase === 'life_death';
    default:
      return false;
  }
}
