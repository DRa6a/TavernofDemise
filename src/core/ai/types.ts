import { Card, GameState, Player } from '../models/types';

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
}
