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
import type { ModLoader, ModHooks } from '../mod/types';

export interface RoundManagerOptions {
  random: RandomProvider;
  initialState?: GameState;
  /** 模组加载器：用于在生命周期触发 mod 钩子 */
  modLoader?: ModLoader | null;
}

export class RoundManager {
  private state: GameState;
  private ruleEngine: RuleEngine;
  private random: RandomProvider;
  private modLoader: ModLoader | null = null;

  constructor(random: RandomProvider, initialState?: GameState);
  constructor(options: RoundManagerOptions);
  constructor(arg: RandomProvider | RoundManagerOptions, initialState?: GameState) {
    if (typeof arg === 'function' || (arg && typeof (arg as RandomProvider).next === 'function' && typeof (arg as RandomProvider).shuffle === 'function')) {
      this.random = arg as RandomProvider;
      this.ruleEngine = new RuleEngine();
      this.state = initialState ?? this.createInitialState();
    } else {
      const opts = arg as RoundManagerOptions;
      this.random = opts.random;
      this.modLoader = opts.modLoader ?? null;
      this.ruleEngine = new RuleEngine();
      this.state = opts.initialState ?? this.createInitialState();
    }
  }

  setModLoader(loader: ModLoader | null): void {
    this.modLoader = loader;
  }

  getModLoader(): ModLoader | null {
    return this.modLoader;
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
      modData: {},
    };
  }

  private emit(event: GameEvent): void {
    this.state.history.push(event);
  }

  /**
   * 触发 mod 钩子。基座在调用前同步 currentState，
   * 让 mod 通过 api.state 拿到的是「当前最新」state。
   */
  private hook(hook: keyof ModHooks, ...args: unknown[]): void {
    if (this.modLoader) {
      this.modLoader.setCurrentState?.(this.state);
      this.modLoader.triggerHook(hook, ...args);
    }
  }

  startGame(configs: PlayerConfig[]): void {
    if (configs.length < MIN_PLAYERS || configs.length > MAX_PLAYERS) {
      throw new Error(`玩家数量必须在 ${MIN_PLAYERS}~${MAX_PLAYERS} 之间`);
    }

    const baseDeck = DeckBuilder.buildStandardDeck();
    const deck = this.modLoader ? this.modLoader.applyDeckPatches(baseDeck) : baseDeck;
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
      stateEffectIds: [],
      modData: {},
    }));

    this.state = {
      ...this.createInitialState(),
      players,
      deck: shuffled,
      history: [],
    };

    this.emit({ type: 'GAME_STARTED', players });
    this.hook('onBeforeGameStart', this.state);
    this.hook('onGameStart', this.state);
    this.beginInspirePhase();
  }

  /**
   * 通用「阻塞阶段」入口：
   * - 如果 mod 注册了 `insertAt = before-election` 且 `blocking = true` 的阶段，
   *   就把 game.phase 切到 INSPIRING 并写入 `modData.customPhase = phase.id`，
   *   等 mod 调 `api.phase.complete()` 继续。
   * - 否则直接进入选举。
   *
   * 本函数**不**硬编码任何 mod 业务语义；mod 自行决定这个阻塞阶段是什么。
   */
  private beginInspirePhase(): void {
    const blocking = this.findBlockingPhase('before-election');
    if (blocking) {
      this.state.phase = GamePhase.INSPIRING;
      if (!this.state.modData) this.state.modData = {};
      (this.state.modData as Record<string, unknown>).customPhase = blocking.id;
      this.emit({ type: 'INSPIRE_PHASE_STARTED', phaseId: blocking.id } as GameEvent);
      return;
    }
    this.electFirstPlayer();
  }

  /**
   * 完成一个 mod 阻塞阶段。mod 调 `api.phase.complete()` 时，
   * 会经由 store 转发到 RoundManager.completeInspirePhase。
   */
  completeInspirePhase(): void {
    if (this.state.phase !== GamePhase.INSPIRING) {
      throw new Error('当前不是激发回合');
    }
    if (this.state.modData) {
      delete (this.state.modData as Record<string, unknown>).customPhase;
    }
    this.electFirstPlayer();
  }

  private findBlockingPhase(point: string): { id: string; name: string } | null {
    if (!this.modLoader) return null;
    const phases = this.modLoader.listPhases();
    const match = phases.find(
      (p) => p.insertAt === point && (p as { blocking?: boolean }).blocking === true,
    );
    return match ? { id: match.id, name: match.name } : null;
  }

  electFirstPlayer(): void {
    if (this.state.players.length === 0) {
      throw new Error('尚未开始游戏');
    }

    this.hook('onBeforeElection', this.state);

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
    this.hook('onBigRoundStart', this.state, this.state.currentRound);
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
    this.hook('onBeforeDraw', this.state);

    for (const player of alivePlayers) {
      const { drawn, remaining } = new Shuffler(this.random).draw(this.state.deck, HAND_SIZE);
      player.hand.push(...drawn);
      this.state.deck = remaining;
      this.emit({ type: 'CARDS_DRAWN', playerId: player.id, count: drawn.length });
    }
    this.hook('onAfterDraw', this.state);

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

    this.hook('onBeforePlay', this.state, player, cardIds);

    // 「哀昏」状态：跳过本回合出牌（由 mod 决定具体状态 id；这里保留 base 的默认行为）
    if (this.hasState(player, 'aihun')) {
      this.clearState(player, 'aihun');
      player.isOutOfRound = true;
      this.emit({ type: 'PLAYER_OUT_OF_ROUND', playerId });
      this.advanceAfterOutOfRound();
      return;
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
    this.hook('onAfterPlay', this.state, player, cards);

    if (player.hand.length === 0) {
      const aliveCount = this.state.players.filter((p) => !p.isDead).length;
      if (aliveCount > 1) {
        player.isOutOfRound = true;
        this.emit({ type: 'PLAYER_OUT_OF_ROUND', playerId });
      }
    }

    this.advanceAfterOutOfRound();
  }

  /** 出牌或被「哀昏」跳过后的统一推进 */
  private advanceAfterOutOfRound(): void {
    const alivePlayers = this.state.players.filter((p) => !p.isDead);
    if (alivePlayers.length > 0 && alivePlayers.every((p) => p.isOutOfRound)) {
      this.hook('onBigRoundEnd', this.state, this.state.currentRound);
      if (this.state.lastPlay) {
        this.state.discardPile.push(...this.state.lastPlay.cards);
        this.state.lastPlay = undefined;
      }
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

    // 「受控」状态：必须质疑（由 mod 决定具体状态 id；这里保留 base 的默认行为）
    if (decision === 'pass' && this.hasState(challenger, 'shoukong')) {
      decision = 'challenge';
    }

    this.emit({ type: 'CHALLENGE_DECISION', playerId: challenger.id, decision });
    this.hook('onBeforeOpen', this.state);

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
        this.hook('onAfterOpen', this.state, result.isFake);
      }

      // mod 标记：自我质疑跳过大回合。mod 在 onBeforeOpen/onAfterOpen 中写入
      if (this.state.modData && (this.state.modData as Record<string, unknown>).skipBigRound) {
        this.state.players.forEach((p) => {
          if (!p.isDead) p.isOutOfRound = true;
        });
        delete (this.state.modData as Record<string, unknown>).skipBigRound;
        this.hook('onBigRoundEnd', this.state, this.state.currentRound);
        if (this.state.lastPlay) {
          this.state.discardPile.push(...this.state.lastPlay.cards);
          this.state.lastPlay = undefined;
        }
        this.startRound();
        return;
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

    this.hook('onBeforeLifeDeath', this.state, loser);

    // mod 标记：强制改面（mod 在 onBeforeLifeDeath 写入 loser.modData.__forcedFace）
    const forced = loser.modData
      ? (loser.modData as Record<string, unknown>).__forcedFace
      : undefined;
    const finalFace =
      face ??
      (forced as DivineBeast | undefined) ??
      loser.availableBeasts[Math.floor(this.random.next() * loser.availableBeasts.length)];

    this.emit({ type: 'DICE_ROLLED', playerId: loserId, face: finalFace });

    const result = this.ruleEngine.resolveDice(loser, finalFace);

    loser.availableBeasts = loser.availableBeasts.filter((f) => f !== finalFace);
    loser.rolledFaces.push(finalFace);

    this.state.pendingLifeDeath = undefined;

    if (result.isDead) {
      loser.isDead = true;
      this.emit({ type: 'PLAYER_DIED', playerId: loserId });
      // mod 可在 onPlayerDied 中通过 api.player 复活（设 isDead = false）+ 挂「末命」
      this.hook('onPlayerDied', this.state, loser);
    }

    this.hook('onAfterLifeDeath', this.state, loser, !result.isDead);

    const alivePlayers = this.state.players.filter((p) => !p.isDead);

    if (alivePlayers.length === 1) {
      this.state.winnerId = alivePlayers[0].id;
      this.state.phase = GamePhase.GAME_OVER;
      this.emit({ type: 'GAME_OVER', winnerId: this.state.winnerId });
      return;
    }

    const survivorId = result.isDead && loser.isDead
      ? this.getOtherAlivePlayer(loserId)
      : loserId;
    if (survivorId) {
      this.state.activePlayerId = survivorId;
      this.emit({ type: 'NEXT_ACTIVE_PLAYER', playerId: survivorId });
    }

    this.state.phase = GamePhase.DRAWING;
    this.hook('onBigRoundEnd', this.state, this.state.currentRound);
    this.startRound();
  }

  // ────────────────────────────────────────────────────────────
  // 模组相关辅助（通用：状态/能力的增删查，所有语义由 mod 自己解释）
  // ────────────────────────────────────────────────────────────

  /** 玩家是否携带指定状态 */
  hasState(player: Player, stateId: string): boolean {
    return (player.stateEffectIds ?? []).includes(stateId);
  }

  /** 移除玩家身上的某个状态 */
  clearState(player: Player, stateId: string): void {
    player.stateEffectIds = (player.stateEffectIds ?? []).filter((s) => s !== stateId);
    if (player.modData) {
      const md = player.modData as Record<string, unknown>;
      const dur = md.stateDurations as Record<string, number> | undefined;
      if (dur) {
        delete dur[stateId];
      }
    }
  }

  /** 给玩家挂状态（mod 友好入口） */
  addState(player: Player, stateId: string, rounds = 1): void {
    if (!player.stateEffectIds?.includes(stateId)) {
      player.stateEffectIds = [...(player.stateEffectIds ?? []), stateId];
    }
    if (!player.modData) player.modData = {};
    const dur = (player.modData as Record<string, unknown>).stateDurations as
      | Record<string, number>
      | undefined;
    (player.modData as Record<string, unknown>).stateDurations = { ...(dur ?? {}), [stateId]: rounds };
  }

  /**
   * 通用「使用能力」入口：基座只负责「调用 mod 的 useAbility + 暂停游戏」，
   * 所有效果（包括扣次数、副作用）都在 mod 脚本中实现。
   * 失败时由 UI 决定弹什么提示。
   */
  useAbility(
    player: Player,
    abilityId: string,
    target?: Player,
  ): { ok: boolean; reason?: string } {
    for (const mod of this.modLoader?.getActiveMods() ?? []) {
      const fn = (mod as unknown as { useAbility?: (p: Player, id: string, t?: Player) => { ok: boolean; reason?: string } })
        .useAbility;
      if (typeof fn === 'function') {
        try {
          return fn(player, abilityId, target);
        } catch (e) {
          return { ok: false, reason: `mod ${mod.id} useAbility 报错：${(e as Error).message}` };
        }
      }
    }
    return { ok: false, reason: 'no_mod_with_useAbility' };
  }

  /** 当前 mod 注册的所有能力（供 UI 列表面板使用） */
  listAbilities() {
    return this.modLoader?.listAbilities() ?? [];
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
