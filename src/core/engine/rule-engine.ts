import { CardPhase } from '../models/types';
import type { Card, ChallengeResult, DivineBeast, GameState, LifeDeathResult, Player } from '../models/types';
import { DEATH_FACE, MAX_PLAY_CARDS, MIN_PLAY_CARDS } from '../../utils/constants';

export class RuleEngine {
  canPlay(player: Player, cards: Card[], state: GameState): boolean {
    if (state.activePlayerId !== player.id) return false;
    if (cards.length < MIN_PLAY_CARDS || cards.length > MAX_PLAY_CARDS) return false;

    const handIds = new Set(player.hand.map((c) => c.id));
    return cards.every((card) => handIds.has(card.id));
  }

  isPlayFake(cards: Card[], truthPhase: CardPhase): boolean {
    return cards.some((card) => card.phase !== truthPhase && card.phase !== CardPhase.DAO);
  }

  canChallenge(state: GameState): boolean {
    if (!state.lastPlay) return false;
    if (state.lastPlay.isRevealed) return false;
    if (state.activePlayerId === state.lastPlay.playerId) return false;

    const challenger = state.players.find((p) => p.id === state.activePlayerId);
    return challenger ? !challenger.isDead && !challenger.isOutOfRound : false;
  }

  mustChallenge(state: GameState): boolean {
    if (!this.canChallenge(state)) return false;

    // 只剩当前挑战者还有未出的手牌（其他活着的玩家要么已出局，要么本轮已经清空跳过），
    // 那么当前玩家必须开上家，否则游戏无法推进。
    const challenger = state.players.find((p) => p.id === state.activePlayerId);
    if (!challenger) return false;

    const othersCanAct = state.players.some((p) => {
      if (p.id === challenger.id) return false;
      if (p.isDead) return false;
      if (p.isOutOfRound) return false;
      if (p.hand.length === 0) return false;
      return true;
    });

    return !othersCanAct;
  }

  resolveChallenge(state: GameState): ChallengeResult {
    if (!state.lastPlay || !state.truthPhase) {
      throw new Error('无法质疑：缺少上一次出牌或真牌信息');
    }

    const isFake = this.isPlayFake(state.lastPlay.cards, state.truthPhase);
    const challengerWins = isFake;
    return { isFake, challengerWins };
  }

  resolveDice(_player: Player, face: DivineBeast): LifeDeathResult {
    const isDead = face === DEATH_FACE;
    return { face, isDead };
  }

  getNextActivePlayer(state: GameState): string {
    const currentPlayer = state.players.find((p) => p.id === state.activePlayerId);
    if (!currentPlayer) return state.activePlayerId;

    const playerCount = state.players.length;
    let nextIndex = (currentPlayer.position + 1) % playerCount;

    for (let i = 0; i < playerCount; i++) {
      const candidate = state.players.find((p) => p.position === nextIndex);
      if (candidate && !candidate.isDead && !candidate.isOutOfRound) {
        return candidate.id;
      }
      nextIndex = (nextIndex + 1) % playerCount;
    }

    return currentPlayer.id;
  }
}
