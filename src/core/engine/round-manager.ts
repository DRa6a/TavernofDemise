import {
  CardPhase,
} from '../models/types';
import type {
  Card,
  DivineBeast,
  GameEvent,
  GameState,
  Player,
  PlayerConfig,
} from '../models/types';
import { DivineBeast as DivineBeastEnum, GamePhase, HAND_SIZE, MAX_PLAYERS, MIN_PLAYERS } from '../../utils/constants';
import { DeckBuilder } from './deck-builder';
import type { RandomProvider } from './random';
import { RuleEngine } from './rule-engine';
import { Shuffler } from './shuffler';

export class RoundManager {
  private state: GameState;
  private ruleEngine: RuleEngine;
  private random: RandomProvider;

  constructor(random: RandomProvider, initialState?: GameState) {
    this.random = random;
    this.ruleEngine = new RuleEngine();
    this.state = initialState ?? this.createInitialState();
  }

  getState(): GameState {
    return this.state;
  }

  private createInitialState(): GameState {
    return {
      phase: GamePhase.WAITING,
      players: [],
      deck: [],
      discardPile: [],
      currentRound: 0,
      activePlayerId: '',
      dice: { availableFaces: Object.values(DivineBeastEnum) },
      deadFaces: [],
      history: [],
    };
  }

  private emit(event: GameEvent): void {
    this.state.history.push(event);
  }

  startGame(configs: PlayerConfig[]): void {
    if (configs.length < MIN_PLAYERS || configs.length > MAX_PLAYERS) {
      throw new Error(`玩家数量必须在 ${MIN_PLAYERS}~${MAX_PLAYERS} 之间`);
    }

    const deck = DeckBuilder.buildStandardDeck();
    const shuffled = this.random.shuffle(deck);

    const allFaces = Object.values(DivineBeastEnum);
    const players: Player[] = configs.map((config, index) => ({
      ...config,
      hand: [],
      isDead: false,
      isOutOfRound: false,
      position: index,
      availableBeasts: [...allFaces],
      rolledFaces: [],
    }));

    this.state = {
      ...this.createInitialState(),
      players,
      deck: shuffled,
      history: [],
    };

    this.emit({ type: 'GAME_STARTED', players });
    this.electFirstPlayer();
  }

  electFirstPlayer(): void {
    if (this.state.players.length === 0) {
      throw new Error('尚未开始游戏');
    }

    const firstIndex = Math.floor(this.random.next() * this.state.players.length);
    const firstPlayer = this.state.players[firstIndex];
    this.state.activePlayerId = firstPlayer.id;
    this.state.phase = GamePhase.DRAWING;

    this.emit({ type: 'FIRST_PLAYER_ELECTED', playerId: firstPlayer.id });
    this.startRound();
  }

  startRound(): void {
    this.state.currentRound += 1;
    this.state.currentSubRound = undefined;
    if (this.state.lastPlay) {
      this.state.discardPile.push(...this.state.lastPlay.cards);
      this.state.lastPlay = undefined;
    }
    this.state.truthPhase = undefined;

    const allFaces = Object.values(DivineBeastEnum);
    this.state.dice = {
      availableFaces: allFaces.filter((face) => !this.state.deadFaces.includes(face)),
    };

    this.state.players.forEach((player) => {
      if (!player.isDead) {
        player.isOutOfRound = false;
        this.state.discardPile.push(...player.hand);
        player.hand = [];
      }
    });

    const alivePlayers = this.state.players.filter((p) => !p.isDead);
    const needed = alivePlayers.length * HAND_SIZE;

    if (this.state.deck.length < needed && this.state.discardPile.length > 0) {
      this.state.deck.push(...this.state.discardPile);
      this.state.discardPile = [];
      this.state.deck = this.random.shuffle(this.state.deck);
    }

    this.emit({ type: 'ROUND_STARTED', round: this.state.currentRound });

    for (const player of alivePlayers) {
      const { drawn, remaining } = new Shuffler(this.random).draw(this.state.deck, HAND_SIZE);
      player.hand.push(...drawn);
      this.state.deck = remaining;
      this.emit({ type: 'CARDS_DRAWN', playerId: player.id, count: drawn.length });
    }

    this.declareTruthPhase();
  }

  declareTruthPhase(): CardPhase {
    const phases = [CardPhase.TIAN, CardPhase.DI, CardPhase.REN];
    const truth = phases[Math.floor(this.random.next() * phases.length)];
    this.state.truthPhase = truth;
    this.state.phase = GamePhase.PLAYING;

    this.emit({ type: 'TRUTH_DECLARED', phase: truth });
    return truth;
  }

  playCards(playerId: string, cardIds: string[]): void {
    if (this.state.phase !== GamePhase.PLAYING) {
      throw new Error('当前不是出牌阶段');
    }
    if (this.state.activePlayerId !== playerId) {
      throw new Error('不是该玩家的回合');
    }

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) throw new Error('玩家不存在');

    if (cardIds.length < 1 || cardIds.length > 3) {
      throw new Error('每次出牌数量必须在 1~3 张之间');
    }

    const handIdSet = new Set(player.hand.map((c) => c.id));
    if (!cardIds.every((id) => handIdSet.has(id))) {
      throw new Error('出牌包含不在手牌中的卡牌');
    }

    const cards: Card[] = [];
    for (const cardId of cardIds) {
      const index = player.hand.findIndex((c) => c.id === cardId);
      const [card] = player.hand.splice(index, 1);
      cards.push(card);
    }

    if (this.state.lastPlay) {
      this.state.discardPile.push(...this.state.lastPlay.cards);
    }

    this.state.lastPlay = {
      playerId,
      cards,
      declaredCount: cards.length,
      isRevealed: false,
    };

    this.emit({ type: 'CARDS_PLAYED', playerId, cards, declaredCount: cards.length });

    if (player.hand.length === 0) {
      const aliveCount = this.state.players.filter((p) => !p.isDead).length;
      if (aliveCount > 1) {
        player.isOutOfRound = true;
        this.emit({ type: 'PLAYER_OUT_OF_ROUND', playerId });
      }
    }

    const alivePlayers = this.state.players.filter((p) => !p.isDead);
    if (alivePlayers.length > 0 && alivePlayers.every((p) => p.isOutOfRound)) {
      this.state.discardPile.push(...this.state.lastPlay!.cards);
      this.state.lastPlay = undefined;
      this.startRound();
      return;
    }

    this.state.activePlayerId = this.ruleEngine.getNextActivePlayer(this.state);
    this.state.phase = GamePhase.OPENING;
  }

  openPhase(decision: 'challenge' | 'pass'): void {
    if (this.state.phase !== GamePhase.OPENING) {
      throw new Error('当前不是开牌阶段');
    }

    const challenger = this.state.players.find((p) => p.id === this.state.activePlayerId);
    if (!challenger) throw new Error('当前玩家不存在');

    this.emit({ type: 'CHALLENGE_DECISION', playerId: challenger.id, decision });

    if (decision === 'challenge') {
      const result = this.ruleEngine.resolveChallenge(this.state);
      if (this.state.lastPlay) {
        this.state.lastPlay.isRevealed = true;
        this.emit({
          type: 'CARDS_REVEALED',
          playerId: this.state.lastPlay.playerId,
          cards: this.state.lastPlay.cards,
          isFake: result.isFake,
        });
      }

      this.state.phase = GamePhase.LIFE_DEATH;
      this.state.pendingLifeDeath = {
        loserId: result.challengerWins ? this.state.lastPlay!.playerId : challenger.id,
      };
    } else {
      if (this.ruleEngine.mustChallenge(this.state)) {
        throw new Error('只剩一名玩家有手牌时必须质疑上家');
      }

      this.state.phase = GamePhase.PLAYING;
    }
  }

  resolveLifeDeath(face?: DivineBeast): void {
    const pending = this.state.pendingLifeDeath;
    if (!pending) {
      throw new Error('当前没有待执行的生死判定');
    }

    const loserId = pending.loserId;
    const loser = this.state.players.find((p) => p.id === loserId);
    if (!loser) throw new Error('受判玩家不存在');

    if (loser.availableBeasts.length === 0) {
      loser.availableBeasts = [DivineBeastEnum.TIAN_LONG];
    }

    const finalFace = face ?? loser.availableBeasts[Math.floor(this.random.next() * loser.availableBeasts.length)];

    this.emit({ type: 'DICE_ROLLED', playerId: loserId, face: finalFace });

    const result = this.ruleEngine.resolveDice(loser, finalFace);

    loser.availableBeasts = loser.availableBeasts.filter((f) => f !== finalFace);
    loser.rolledFaces.push(finalFace);

    this.state.pendingLifeDeath = undefined;

    if (result.isDead) {
      loser.isDead = true;
      this.emit({ type: 'PLAYER_DIED', playerId: loserId });
    }

    const alivePlayers = this.state.players.filter((p) => !p.isDead);

    if (alivePlayers.length === 1) {
      this.state.winnerId = alivePlayers[0].id;
      this.state.phase = GamePhase.GAME_OVER;
      this.emit({ type: 'GAME_OVER', winnerId: this.state.winnerId });
      return;
    }

    const survivorId = result.isDead ? this.getOtherAlivePlayer(loserId) : loserId;
    if (survivorId) {
      this.state.activePlayerId = survivorId;
      this.emit({ type: 'NEXT_ACTIVE_PLAYER', playerId: survivorId });
    }

    this.state.phase = GamePhase.DRAWING;
    this.startRound();
  }

  private getOtherAlivePlayer(excludeId: string): string | undefined {
    const others = this.state.players.filter((p) => !p.isDead && p.id !== excludeId);
    if (others.length === 0) return undefined;

    const exclude = this.state.players.find((p) => p.id === excludeId);
    let nextIndex = ((exclude?.position ?? 0) + 1) % this.state.players.length;

    for (let i = 0; i < this.state.players.length; i++) {
      const candidate = this.state.players.find((p) => p.position === nextIndex);
      if (candidate && !candidate.isDead) {
        return candidate.id;
      }
      nextIndex = (nextIndex + 1) % this.state.players.length;
    }

    return others[0].id;
  }
}
