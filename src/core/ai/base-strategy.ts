import type { AIStrategy, AIContext } from './types';
import type { RandomProvider } from '../engine/random';
import { CardPhase } from '../models/types';
import type { Card, GameState, Player } from '../models/types';
import type { EchoDefinition } from '../mod/types';
import { GamePhase } from '../../utils/constants';

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

  /**
   * AI 决定是否使用一个回响，以及选谁作为目标。
   * 返回 null 表示本回合不用回响。
   * 简单策略：按 echoId 加权（保命类优先），有一定概率使用。
   */
  decideEcho(
    context: AIContext,
    echoDefs: EchoDefinition[],
  ): { echoId: string; targetId?: string } | null {
    const { player, state } = context;
    const owned = ((player.modData?.echoes as Array<{ id: string; remaining: number }>) ?? [])
      .filter((e) => e.remaining > 0);
    if (owned.length === 0) return null;

    const defsById = new Map(echoDefs.map((d) => [d.id, d]));
    const phase = state.phase;

    // 找可用回响
    const usable = owned
      .map((e) => defsById.get(e.id))
      .filter((d): d is EchoDefinition => Boolean(d && isTriggerOk(d.trigger, phase)));
    if (usable.length === 0) return null;

    // 优先级：保命 > 干扰 > 增益
    const weight = (id: string): number => {
      if (['qiangyun', 'bumie', 'jiahuo', 'tizui', 'tianxingjian', 'shengshengbuxi', 'zhiyu'].includes(id)) return 90;
      if (['zhaozai', 'zhiai', 'rumeng', 'shimang', 'powanfa'].includes(id)) return 70;
      if (['wangyou', 'tannang', 'lingshi', 'duxin', 'lingxiu', 'fengzhang'].includes(id)) return 50;
      if (['chiyan', 'lunhuibuzhi', 'huaxing', 'yinni'].includes(id)) return 30;
      if (['jifa', 'xianling', 'dianren', 'yanpin', 'qiaowu', 'baoshan'].includes(id)) return 20;
      if (['huoshui', 'lixi', 'hunqian', 'yueqian', 'duoxinpo', 'shuangshenghua'].includes(id)) return 10;
      return 5;
    };

    // 排序：先按权重，再随机扰动
    const sorted = usable
      .map((d) => ({ d, w: weight(d.id) + this.random.next() * 20 }))
      .sort((a, b) => b.w - a.w);

    // 命中率与权重成正比，最高不超过 0.6
    const top = sorted[0];
    const hitChance = Math.min(0.6, top.w / 120);
    if (this.random.next() > hitChance) return null;

    // 选目标
    const otherAlive = state.players.filter((p) => p.id !== player.id && !p.isDead);
    const needsTarget = TARGET_HINTS[top.d.id] === 'target';
    const selfOnly = SELF_ONLY.has(top.d.id);
    let target: Player | undefined;
    if (needsTarget && otherAlive.length > 0) {
      target = otherAlive[Math.floor(this.random.next() * otherAlive.length)];
    } else if (selfOnly) {
      target = player;
    } else if (otherAlive.length > 0 && this.random.next() < 0.4) {
      target = otherAlive[Math.floor(this.random.next() * otherAlive.length)];
    }

    return { echoId: top.d.id, targetId: target?.id };
  }
}

/** 哪些 echo 需要明确选另一个玩家作为目标 */
const TARGET_HINTS: Record<string, 'target' | 'self' | 'none'> = {
  zhaozai: 'target',
  zhiai: 'target',
  shuangshenghua: 'target',
  tannang: 'target',
  huoshui: 'target',
  yinni: 'target',
  fengzhang: 'target',
  wangyou: 'target',
  rumeng: 'target',
  powanfa: 'target',
  huaxing: 'target',
  qiaowu: 'target',
  yanpin: 'target',
  baoshan: 'none',
  chiyan: 'self',
  duxin: 'target',
  duoxinpo: 'target',
  lixi: 'target',
  lingshi: 'target',
  lingxiu: 'target',
  yueqian: 'target',
  hunqian: 'self',
  zhiyu: 'target',
  shengshengbuxi: 'target',
  jifa: 'target',
  lunhuibuzhi: 'none',
  xianling: 'self',
  jiahuo: 'self',
  tizui: 'self',
  qiangyun: 'self',
  bumie: 'self',
  dianren: 'target',
};

/** 仅对自己生效 */
const SELF_ONLY = new Set(['chiyan', 'hunqian', 'xianling', 'jiahuo', 'tizui', 'qiangyun', 'bumie']);

/** 与 EchoPanel 保持一致 */
function isTriggerOk(trigger: EchoDefinition['trigger'], phase: GamePhase): boolean {
  if (trigger === 'when-die') return false;
  if (trigger === 'any') return true;
  switch (trigger) {
    case 'play-phase':
    case 'open-phase':
    case 'small-round':
    case 'big-round':
    case 'after-life-death':
    case 'before-draw':
      return phase === GamePhase.PLAYING || phase === GamePhase.OPENING;
    case 'life-death':
    case 'before-life-death':
      return phase === GamePhase.LIFE_DEATH;
    default:
      return false;
  }
}
