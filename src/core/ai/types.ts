import type { Card, GameState, Player } from '../models/types';
import type { EchoDefinition } from '../mod/types';

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
  /** 决定是否使用一个回响（mod 扩展）。返回 null = 本回合不用。 */
  decideEcho(
    context: AIContext,
    echoDefs: EchoDefinition[],
  ): { echoId: string; targetId?: string } | null;
}
