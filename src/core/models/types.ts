import { CardPhase, DivineBeast, GamePhase, RoundType } from '../../utils/constants';
import type { Zodiac } from '../../utils/constants';

export { CardPhase, DivineBeast, GamePhase, RoundType };
export type { Zodiac };

export interface Card {
  id: string;
  phase: CardPhase;
  zodiac?: Zodiac;
}

export interface Player {
  id: string;
  name: string;
  avatar?: string;
  isHuman: boolean;
  hand: Card[];
  isDead: boolean;
  isOutOfRound: boolean;
  position: number;
  availableBeasts: DivineBeast[];
  rolledFaces: DivineBeast[];
  /** 玩家身上叠加的状态效果 id 列表（mod 扩展用） */
  stateEffectIds?: string[];
  /** 模组为该玩家注入的自定义数据 */
  modData?: Record<string, unknown>;
}

export interface PlayerConfig {
  id: string;
  name: string;
  avatar?: string;
  isHuman: boolean;
}

export interface LastPlay {
  playerId: string;
  cards: Card[];
  declaredCount: number;
  isRevealed: boolean;
}

export interface DivineDice {
  availableFaces: DivineBeast[];
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  currentRound: number;
  currentSubRound?: RoundType;
  activePlayerId: string;
  lastPlay?: LastPlay;
  truthPhase?: CardPhase;
  dice: DivineDice;
  deadFaces: DivineBeast[];
  pendingLifeDeath?: { loserId: string };
  winnerId?: string;
  history: GameEvent[];
}

export type GameEvent =
  | { type: 'GAME_STARTED'; players: Player[] }
  | { type: 'INSPIRE_PHASE_STARTED'; phaseId: string }
  | { type: 'FIRST_PLAYER_ELECTED'; playerId: string }
  | { type: 'ROUND_STARTED'; round: number }
  | { type: 'CARDS_DRAWN'; playerId: string; count: number }
  | { type: 'TRUTH_DECLARED'; phase: CardPhase }
  | { type: 'CARDS_PLAYED'; playerId: string; cards: Card[]; declaredCount: number }
  | { type: 'CHALLENGE_DECISION'; playerId: string; decision: 'challenge' | 'pass' }
  | { type: 'CARDS_REVEALED'; playerId: string; cards: Card[]; isFake: boolean }
  | { type: 'DICE_ROLLED'; playerId: string; face: DivineBeast }
  | { type: 'PLAYER_DIED'; playerId: string }
  | { type: 'PLAYER_OUT_OF_ROUND'; playerId: string }
  | { type: 'NEXT_ACTIVE_PLAYER'; playerId: string }
  | { type: 'GAME_OVER'; winnerId: string };

export interface ChallengeResult {
  isFake: boolean;
  challengerWins: boolean;
}

export interface LifeDeathResult {
  face: DivineBeast;
  isDead: boolean;
}

export interface DeckConfig {
  phases: Record<CardPhase, number>;
  includeZodiac: boolean;
}
