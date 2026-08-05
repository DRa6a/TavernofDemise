// 模组系统类型定义
// 一个 mod 是一个单文件（推荐 .mod.md），由 mod-loader 解析并注册
import type { Card, GameState, Player } from '../models/types';
import type { RuleEngine } from '../engine/rule-engine';

// ────────────────────────────────────────────────────────────
// 玩家状态（mod 可以注册新状态）
// ────────────────────────────────────────────────────────────

/** 状态效果定义：可叠加在玩家身上的状态 */
export interface PlayerStateEffect {
  id: string;
  name: string;
  description: string;
  /** 是否阻止状态被「忘忧」类回响清除 */
  locked?: boolean;
  /** 持续多久（按大回合 / 玩家回合 / 出牌回合计算） */
  duration: 'forever' | { rounds: number; unit: 'big-round' | 'play-turn' };
  /** 携带状态时是否跳过出牌 */
  skipPlay?: boolean;
  /** 携带状态时是否跳过质疑 */
  skipChallenge?: boolean;
  /** 携带状态时不能查看自己手牌 */
  blind?: boolean;
  /** 携带状态时不能使用回响 */
  muteEchoes?: boolean;
  /** 携带状态时随机禁用 1 个回响 */
  dreamDisorient?: boolean;
  /** 携带状态时出牌数被锁定（与使用本回响者上次出牌数相同） */
  lockPlayCountToLast?: boolean;
  /** 携带状态时与另一玩家同生共死 */
  pairedWith?: string; // playerId
  /** 携带状态时把除天龙外的所有神兽变死亡 */
  allBeastsDead?: boolean;
  /** 携带状态时死亡还能撑过 N 个大回合 */
  lingerRounds?: number;
}

/** 玩家状态注册表：mod 可向其中注册状态 */
export interface PlayerStateRegistry {
  effects: Record<string, PlayerStateEffect>;
  register(effect: PlayerStateEffect): void;
  get(id: string): PlayerStateEffect | undefined;
}

// ────────────────────────────────────────────────────────────
// 阶段（mod 可以注册新阶段）
// ────────────────────────────────────────────────────────────

/** 阶段定义：插入到主循环的特定时机 */
export interface PhaseDefinition {
  id: string;
  name: string;
  /** 插入位置：选举前 / 抽牌前 / 抽牌后 / 出牌前 / 开牌后 / 生死后 */
  insertAt:
    | 'before-election'
    | 'after-draw'
    | 'before-play'
    | 'after-open'
    | 'after-life-death'
    | 'custom';
  /** 是否阻塞主循环直到本阶段完成 */
  blocking: boolean;
  description: string;
}

/** 阶段注册表 */
export interface PhaseRegistry {
  phases: PhaseDefinition[];
  register(phase: PhaseDefinition): void;
  getInsertionPoint(point: PhaseDefinition['insertAt']): PhaseDefinition[];
}

// ────────────────────────────────────────────────────────────
// 回响（mod 可以注册新回响）
// ────────────────────────────────────────────────────────────

/** 回响使用时机 */
export type EchoTrigger =
  | 'play-phase'       // 出牌回合
  | 'open-phase'       // 开牌回合
  | 'small-round'      // 小回合内
  | 'big-round'        // 大回合内
  | 'life-death'       // 生死回合
  | 'before-life-death'// 生死回合前
  | 'after-life-death' // 上一生死回合后，本抽牌回合前
  | 'before-draw'      // 抽牌回合抽牌前
  | 'when-die'         // 有人死亡时
  | 'any';             // 任意时机

/** 回响定义：参与者持有的可消耗技能 */
export interface EchoDefinition {
  id: string;
  name: string;
  /** 4 字以下名称用于「破万法」识别 */
  shortName: string;
  trigger: EchoTrigger;
  maxUses: number;
  /** 回响效果描述（自然语言） */
  effect: string;
  /** 二回响标识：可被「显灵」复制 */
  isShort?: boolean;
}

/** 回响注册表 */
export interface EchoRegistry {
  echoes: Record<string, EchoDefinition>;
  register(echo: EchoDefinition): void;
  get(id: string): EchoDefinition | undefined;
  list(): EchoDefinition[];
}

// ────────────────────────────────────────────────────────────
// Mod 数据：注册到游戏中的结构化数据
// ────────────────────────────────────────────────────────────

/** Mod 携带的所有数据 */
export interface ModData {
  /** 回响字典 */
  echoes?: EchoDefinition[];
  /** 玩家状态效果 */
  states?: PlayerStateEffect[];
  /** 阶段定义 */
  phases?: PhaseDefinition[];
  /** 自定义卡牌 */
  cards?: Card[];
  /** 任意扩展字段 */
  custom?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// 生命周期钩子
// ────────────────────────────────────────────────────────────

/** mod 上下文：在 mod 加载时注入的注册表与工具 */
export interface ModContext {
  states: PlayerStateRegistry;
  phases: PhaseRegistry;
  echoes: EchoRegistry;
  log(message: string, ...args: unknown[]): void;
}

/** mod 钩子：游戏生命周期事件 */
export interface ModHooks {
  /** mod 被注册到加载器时调用 */
  onRegister?(ctx: ModContext): void;

  /** 游戏启动前（数据初始化） */
  onBeforeGameStart?(state: GameState): void;
  /** 游戏启动后 */
  onGameStart?(state: GameState): void;

  /** 选举前 */
  onBeforeElection?(state: GameState): void;
  /** 抽牌前 */
  onBeforeDraw?(state: GameState): void;
  /** 抽牌后 */
  onAfterDraw?(state: GameState): void;

  /** 出牌前（玩家即将出牌） */
  onBeforePlay?(state: GameState, player: Player, cardIds: string[]): void;
  /** 出牌后 */
  onAfterPlay?(state: GameState, player: Player, cards: Card[]): void;

  /** 开牌前（即将揭晓真假） */
  onBeforeOpen?(state: GameState): void;
  /** 开牌后 */
  onAfterOpen?(state: GameState, isFake: boolean): void;

  /** 生死判定前 */
  onBeforeLifeDeath?(state: GameState, loser: Player): void;
  /** 生死判定后 */
  onAfterLifeDeath?(state: GameState, loser: Player, survived: boolean): void;

  /** 玩家死亡时 */
  onPlayerDied?(state: GameState, player: Player): void;
  /** 玩家复活时 */
  onPlayerRevived?(state: GameState, player: Player): void;

  /** 大回合开始 */
  onBigRoundStart?(state: GameState, round: number): void;
  /** 大回合结束 */
  onBigRoundEnd?(state: GameState, round: number): void;
}

// ────────────────────────────────────────────────────────────
// GameMod：模组的最终形态
// ────────────────────────────────────────────────────────────

/** mod 元数据（来自 frontmatter） */
export interface ModManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  /** 依赖的其他 mod id */
  dependsOn?: string[];
  /** 标签（用于筛选/分类） */
  tags?: string[];
  /** 优先级（数值越大越先应用，负数表示更后） */
  priority?: number;
}

/** 模组主接口：metadata + 钩子 + 数据 + 补丁 */
export interface GameMod extends ModManifest, ModHooks {
  // 数据
  data?: ModData;

  // 旧版补丁接口（保持兼容）
  patchDeck?(base: Card[]): Card[];
  patchEngine?(engine: RuleEngine): RuleEngine;
}

// ────────────────────────────────────────────────────────────
// 加载器接口
// ────────────────────────────────────────────────────────────

export interface ModLoadResult {
  manifest: ModManifest;
  raw: string;        // 原始文件内容
  source: string;     // 文件路径或 URL
  errors: string[];   // 解析/校验错误
  mod?: GameMod;      // 解析成功时存在
}

export interface ModLoader {
  register(mod: GameMod): void;
  unregister(modId: string): void;
  getActiveMods(): GameMod[];
  getById(id: string): GameMod | undefined;

  // 批量应用补丁
  applyDeckPatches(base: Card[]): Card[];
  applyRulePatches(engine: RuleEngine): RuleEngine;
  applyStatePatches(registry: PlayerStateRegistry): PlayerStateRegistry;
  applyPhasePatches(registry: PhaseRegistry): PhaseRegistry;
  applyEchoPatches(registry: EchoRegistry): EchoRegistry;

  // 触发钩子
  triggerHook(hook: keyof ModHooks, ...args: unknown[]): void;
}
