import type { Card, GameState, Player } from '../models/types';
import type { AbilityDefinition } from '../mod/types';

export interface AIContext {
  player: Player;
  state: GameState;
  lastPlay?: {
    playerId: string;
    cards: Card[];
    declaredCount: number;
  };
}

export interface AIStrategy {
  name: string;
  difficulty: number;

  decidePlay(context: AIContext): Card[];
  decideChallenge(context: AIContext): boolean;
  /**
   * 决定是否使用一个能力。
   * 返回 null = 本回合不用。
   * 基座默认实现：按 trigger 决定可用性，按 AbilityDefinition.meta?.aiWeight 打分。
   * mod 可通过传入自定义 strategy 覆盖。
   */
  decideAbility(
    context: AIContext,
    abilityDefs: AbilityDefinition[],
  ): { abilityId: string; targetId?: string } | null;
}
