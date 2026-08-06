// 终焉酒馆 · 模组 API 类型声明
//
// 用法（在你的 mod 工程根目录）：
//   1. 复制本文件到 `types/tavern-mod-api.d.ts`（或任意 .d.ts 位置）
//   2. 在 `tsconfig.json` 里确保 `include` 覆盖到这个文件
//   3. 编辑器（VS Code / WebStorm / Cursor 等）就能给出 `api.*` 的完整补全和类型检查
//
// 这个文件是「基座 API 形状的镜像」——基座真正传入 setup 的 `api` 对象运行时
// 完全符合这里的类型，TS 编译/检查期也能用，但运行时不做强制校验。
//
// 如果基座更新了 API（本仓库的 src/core/mod/api.ts），请同步刷新本文件。

// ───────────────────────────────────────────────────────────
// 卡片 / 玩家 / 游戏状态（基座 core/models/types 的镜像）
// ───────────────────────────────────────────────────────────

export type Zodiac = string;
export type DivineBeast = string;
export type CardPhase = '天' | '地' | '人' | '道' | string;

export interface Card {
  id: string;
  phase: CardPhase;
  zodiac?: Zodiac;
  /** mod 自定义字段 */
  [key: string]: unknown;
}

export interface Player {
  id: string;
  name: string;
  isHuman: boolean;
  isDead: boolean;
  isOutOfRound?: boolean;
  hand: Card[];
  position: number;
  availableBeasts: DivineBeast[];
  rolledFaces: DivineBeast[];
  stateEffectIds?: string[];
  /** mod 自管理数据；基座不读，由 mod 自己往里塞 */
  modData?: Record<string, unknown>;
}

export interface GameState {
  phase: string;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  currentRound: number;
  activePlayerId: string;
  dice: { availableFaces: DivineBeast[] };
  deadFaces: DivineBeast[];
  history: Array<{ type: string; [k: string]: unknown }>;
  winnerId?: string;
  modData?: Record<string, unknown>;
}

// ───────────────────────────────────────────────────────────
// 注册表（abilities / states / phases）
// ───────────────────────────────────────────────────────────

export type AbilityTrigger =
  | 'play-phase'
  | 'open-phase'
  | 'small-round'
  | 'big-round'
  | 'life-death'
  | 'before-life-death'
  | 'after-life-death'
  | 'before-draw'
  | 'when-die'
  | 'any'
  | 'custom';

export interface AbilityDefinition {
  id: string;
  name: string;
  shortName?: string;
  trigger: AbilityTrigger;
  maxUses: number;
  effect: string;
  requiresTarget?: boolean;
  meta?: Record<string, unknown>;
}

export interface AbilityRegistry {
  register(ability: AbilityDefinition): void;
  get(id: string): AbilityDefinition | undefined;
  list(): AbilityDefinition[];
}

export type PlayerStateEffect = {
  id: string;
  name: string;
  description: string;
  duration: 'forever' | { rounds: number; unit: 'big-round' | 'play-turn' };
  locked?: boolean;
  skipPlay?: boolean;
  skipChallenge?: boolean;
  blind?: boolean;
  muteAbilities?: boolean;
  dreamDisorient?: boolean;
  lockPlayCountToLast?: boolean;
  pairedWith?: string;
  allBeastsDead?: boolean;
  lingerRounds?: number;
};

export interface PlayerStateRegistry {
  register(effect: PlayerStateEffect): void;
  get(id: string): PlayerStateEffect | undefined;
  list(): PlayerStateEffect[];
}

export type PhaseDefinition = {
  id: string;
  name: string;
  insertAt:
    | 'before-election'
    | 'after-draw'
    | 'before-play'
    | 'after-open'
    | 'after-life-death'
    | 'custom';
  blocking: boolean;
  description: string;
};

export interface PhaseRegistry {
  register(phase: PhaseDefinition): void;
  getInsertionPoint(point: PhaseDefinition['insertAt']): PhaseDefinition[];
  list(): PhaseDefinition[];
}

// ───────────────────────────────────────────────────────────
// UI 注入槽
// ───────────────────────────────────────────────────────────

export type ModSlotId =
  | 'mod-loader:actions'
  | 'mod-loader:mod-list'
  | 'game:header-extra'
  | 'player-seat:badges'
  | 'player-seat:abilities'
  | 'action-area:side'
  | 'table-center:overlay'
  | 'overlay:pause'
  | 'log:extra-entry';

export interface SlotRenderContext {
  state: GameState;
  humanPlayer?: Player;
  perspective: 'human' | 'all';
  phase: PhaseController;
}

export type SlotRenderFn = (ctx: SlotRenderContext) => unknown;

export interface UiApi {
  register(slotId: ModSlotId, render: SlotRenderFn): void;
  unregister(slotId: ModSlotId, render: SlotRenderFn): void;
}

// ───────────────────────────────────────────────────────────
// Phase controller
// ───────────────────────────────────────────────────────────

export interface PhaseController {
  isActive(phaseId: string): boolean;
  complete(): void;
  reroll?(playerId: string, abilityIdToDiscard: string): boolean;
  useAbility?(
    playerId: string,
    abilityId: string,
    targetId?: string,
  ): { ok: boolean; reason?: string };
}

// ───────────────────────────────────────────────────────────
// 玩家维度 API
// ───────────────────────────────────────────────────────────

export interface PlayerApi {
  addState(player: Player, stateId: string, rounds?: number): void;
  clearState(player: Player, stateId: string): void;
  hasState(player: Player, stateId: string): boolean;
  getModData<T = unknown>(player: Player, key: string): T | undefined;
  setModData(player: Player, key: string, value: unknown): void;
}

// ───────────────────────────────────────────────────────────
// 调试 API（受信任的 mod 用；生产 mod 不应依赖）
// ───────────────────────────────────────────────────────────

export interface DebugApi {
  setRevealAll(value: boolean): void;
  isRevealAll(): boolean;
  modifyHand(
    playerId: string,
    operation: 'remove' | { replaceId: string; newCard: Card },
  ): void;
  bumpRender(): void;
}

// ───────────────────────────────────────────────────────────
// ModApi：setup(api) 收到的根对象
// ───────────────────────────────────────────────────────────

/**
 * `api.h` 的类型签名——React.createElement 的薄包装。mod 脚本里没有 JSX，
 * 构造 UI 元素请走它：`api.h('div', { className: 'x' }, 'hello')`。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CreateElementFn = (type: any, props?: any, ...children: any[]) => unknown;

export interface ModApiLog {
  (message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface ModApi {
  /** 构造 React 元素（详见上文 CreateElementFn） */
  h: CreateElementFn;
  /** 写一条 mod 日志（带 modId 前缀，走浏览器 console + ModLogBuffer） */
  log: ModApiLog;
  /** 调试 API（仅供受信任的 mod 用） */
  debug: DebugApi;

  abilities: AbilityRegistry;
  states: PlayerStateRegistry;
  phases: PhaseRegistry;

  /** 运行时注册自定义卡牌（与 data.cards 等价） */
  registerCards(cards: Card[]): void;

  player: PlayerApi;
  ui: UiApi;
  phase: PhaseController;

  /** 当前 game state（基座在每个 hook 前自动注入） */
  state: GameState | null;
}

// ───────────────────────────────────────────────────────────
// 生命周期钩子签名
// ───────────────────────────────────────────────────────────

export interface ModHooks {
  onRegister?(api: ModApi): void;
  onBeforeGameStart?(state: GameState): void;
  onGameStart?(state: GameState): void;
  onBeforeElection?(state: GameState): void;
  onBeforeDraw?(state: GameState): void;
  onAfterDraw?(state: GameState): void;
  onBeforePlay?(state: GameState, player: Player, cardIds: string[]): void;
  onAfterPlay?(state: GameState, player: Player, cards: Card[]): void;
  onBeforeOpen?(state: GameState): void;
  onAfterOpen?(state: GameState, isFake: boolean): void;
  onBeforeLifeDeath?(state: GameState, loser: Player): void;
  onAfterLifeDeath?(state: GameState, loser: Player, survived: boolean): void;
  onPlayerDied?(state: GameState, player: Player): void;
  onPlayerRevived?(state: GameState, player: Player): void;
  onBigRoundStart?(state: GameState, round: number): void;
  onBigRoundEnd?(state: GameState, round: number): void;
}

// ───────────────────────────────────────────────────────────
// 全局声明：让 setup / 钩子函数能直接写出来
// ───────────────────────────────────────────────────────────

declare global {
  /**
   * setup：mod 加载时执行一次。可选；用于注册能力 / 状态 / 阶段 / UI 注入。
   * 用法：`function setup(api: ModApi) { api.ui.register(...) }`
   */
  function setup(api: ModApi): void;
  /** teardown：mod 卸载时调用。可选。 */
  function teardown(): void;
}

export {};
