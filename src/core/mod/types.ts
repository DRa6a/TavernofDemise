// 模组系统类型定义
// 一个 mod 是一个压缩包（推荐 .mod），由 mod-loader 解析并注册。
// 包内分为 manifest / info / data / script / assets 五段，详见 package.ts。
//
// 本文件**不**包含任何具体游戏机制（回响/技能/道具 等），
// 只定义 mod 体系的「扩展点」与「数据契约」。具体能力由各 mod 自己定义。
import type { Card, GameState, Player } from '../models/types';
import type { RuleEngine } from '../engine/rule-engine';
import type { ModLogBuffer, ModLogEntry, ModLogLevel, ModLogListener } from './log';

// ────────────────────────────────────────────────────────────
// 玩家状态（mod 可以注册新状态）
// ────────────────────────────────────────────────────────────

/** 状态效果定义：可叠加在玩家身上的状态 */
export interface PlayerStateEffect {
  id: string;
  name: string;
  description: string;
  /** 是否阻止状态被「忘忧」类能力清除 */
  locked?: boolean;
  /** 持续多久（按大回合 / 玩家回合 / 出牌回合计算） */
  duration: 'forever' | { rounds: number; unit: 'big-round' | 'play-turn' };
  /** 携带状态时是否跳过出牌 */
  skipPlay?: boolean;
  /** 携带状态时是否跳过质疑 */
  skipChallenge?: boolean;
  /** 携带状态时不能查看自己手牌 */
  blind?: boolean;
  /** 携带状态时不能使用能力 */
  muteAbilities?: boolean;
  /** 携带状态时随机禁用 1 个能力 */
  dreamDisorient?: boolean;
  /** 携带状态时出牌数被锁定（与上次出牌数相同） */
  lockPlayCountToLast?: boolean;
  /** 携带状态时与另一玩家同生共死 */
  pairedWith?: string; // playerId
  /** 携带状态时把除天龙外的所有神兽变死亡 */
  allBeastsDead?: boolean;
  /** 携带状态时死亡还能撑 N 个大回合 */
  lingerRounds?: number;
}

/** 玩家状态注册表：mod 可向其中注册状态 */
export interface PlayerStateRegistry {
  effects: Record<string, PlayerStateEffect>;
  register(effect: PlayerStateEffect): void;
  get(id: string): PlayerStateEffect | undefined;
  list(): PlayerStateEffect[];
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
  list(): PhaseDefinition[];
}

// ────────────────────────────────────────────────────────────
// 能力（mod 可以注册新能力，泛指玩家可消耗的技能/道具/法术等）
// ────────────────────────────────────────────────────────────

/**
 * 能力使用时机。`any` 表示由 mod 自管理（不在通用 UI 面板里主动出现），
 * `custom` 表示由 mod 在运行时通过 setAvailable()/lockAbility() 控制。
 */
export type AbilityTrigger =
  | 'play-phase'        // 出牌回合
  | 'open-phase'        // 开牌回合
  | 'small-round'       // 小回合内
  | 'big-round'         // 大回合内
  | 'life-death'        // 生死回合
  | 'before-life-death' // 生死回合前
  | 'after-life-death'  // 上一生死回合后，本抽牌回合前
  | 'before-draw'       // 抽牌回合抽牌前
  | 'when-die'          // 有人死亡时（多用于被动触发）
  | 'any'               // 任意时机
  | 'custom';           // 由 mod 自行管理可用性

/**
 * 能力定义：玩家持有的可消耗「招数」/「道具」/「技能」。
 * 这是基座提供的**通用契约**，mod 可基于它实现任何体系
 * （回响、卡牌技能、道具、灵咒等）。
 */
export interface AbilityDefinition {
  id: string;
  name: string;
  /** 简短展示名（2~4 字），部分 mod 可能基于长度做识别 */
  shortName?: string;
  /** 触发时机，决定默认是否在通用面板里亮起 */
  trigger: AbilityTrigger;
  /** 最大使用次数 */
  maxUses: number;
  /** 自然语言描述（用于 tooltip / 日志） */
  effect: string;
  /** 是否需要玩家手动选目标（基座面板据此切到「选目标」模式） */
  requiresTarget?: boolean;
  /** 可选：模组自己的扩展字段，UI 不会读取 */
  meta?: Record<string, unknown>;
}

/** 能力注册表 */
export interface AbilityRegistry {
  abilities: Record<string, AbilityDefinition>;
  register(ability: AbilityDefinition): void;
  get(id: string): AbilityDefinition | undefined;
  list(): AbilityDefinition[];
}

// ────────────────────────────────────────────────────────────
// Mod 数据：注册到游戏中的结构化数据
// ────────────────────────────────────────────────────────────

/**
 * Mod 携带的所有数据。
 * 字段名都使用**通用名词**（abilities / states / phases / cards），
 * 具体语义由 mod 自己解释——例如「abilities」在某 mod 中是回响，
 * 在另一个 mod 中可以是卡牌技能或一次性道具。
 */
export interface ModData {
  /** 能力列表（mod 自解释：回响 / 技能 / 道具 / 法术 等） */
  abilities?: AbilityDefinition[];
  /** 玩家状态效果 */
  states?: PlayerStateEffect[];
  /** 阶段定义 */
  phases?: PhaseDefinition[];
  /** 自定义卡牌 */
  cards?: Card[];
  /** 任意扩展字段（mod 自取） */
  custom?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// 生命周期钩子
// ────────────────────────────────────────────────────────────

/** mod 上下文：在 mod 加载时注入的注册表与工具 */
export interface ModContext {
  states: PlayerStateRegistry;
  phases: PhaseRegistry;
  abilities: AbilityRegistry;
  log(message: string, ...args: unknown[]): void;
  /** mod 调用方提供的扩展点：mod 可往 modData 上写自己的状态 */
  // （不需要在这里加；mod 自己往 player.modData 写即可）
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

/** mod 元数据 */
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

  /**
   * 开源协议。
   * - 字符串：推荐填 [SPDX 标识符](https://spdx.org/licenses/)（如 "MIT"、"GPL-3.0-or-later"、"Apache-2.0"）
   * - 对象：自定义协议（`name` 必填，`url` 可选指向协议全文）
   *
   * 注意：协议字段是 mod 作者的**声明**——基座只把它展示给玩家看，不做任何法律校验。
   */
  license?: string | { name: string; url?: string };
  /** 项目主页 / 仓库地址（展示用，可点击跳转） */
  repo?: string;
  /** 协议全文（可选；不填则建议在 repo 里放一份 LICENSE 文件） */
  licenseText?: string;
}

/** 模组主接口：metadata + 钩子 + 数据 + 补丁 */
export interface GameMod extends ModManifest, ModHooks {
  /** 数据 */
  data?: ModData;
  /** 旧版补丁接口（保持兼容） */
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

  // 供 UI 读取的注册表
  getStateRegistry(): PlayerStateRegistry;
  getPhaseRegistry(): PhaseRegistry;
  getAbilityRegistry(): AbilityRegistry;
  listAbilities(): AbilityDefinition[];
  listStates(): PlayerStateEffect[];
  listPhases(): PhaseDefinition[];

  // 批量应用补丁
  applyDeckPatches(base: Card[]): Card[];
  applyRulePatches(engine: RuleEngine): RuleEngine;
  applyStatePatches(registry: PlayerStateRegistry): PlayerStateRegistry;
  applyPhasePatches(registry: PhaseRegistry): PhaseRegistry;
  applyAbilityPatches(registry: AbilityRegistry): AbilityRegistry;

  // 触发钩子
  triggerHook(hook: keyof ModHooks, ...args: unknown[]): void;
  /** 由 RoundManager 在每次 hook 前调用，注入最新 state（可选） */
  setCurrentState?(state: GameState | null): void;

  // 日志：基座不再强制 console.log，由调用方决定如何消费
  /** 获取日志缓冲（历史条目 + 订阅 API） */
  getLogBuffer(): ModLogBuffer;
  /** 设置日志级别：'silent' | 'error' | 'warn' | 'info' | 'debug' */
  setLogLevel(level: ModLogLevel): void;
  /** 设置日志 sink（默认 silent）。形如 (level, message, args) => void */
  setLogSink?(sink: (level: ModLogLevel, message: string, args: unknown[]) => void): void;
  /** 读取历史日志条目 */
  getLogEntries(): ModLogEntry[];
  /** 订阅实时日志（返回 unsubscribe 函数） */
  subscribeLog(listener: ModLogListener): () => void;
  /** 清空历史 */
  clearLog?(): void;
}

// ────────────────────────────────────────────────────────────
// 向后兼容别名
// ────────────────────────────────────────────────────────────
// 旧版 .mod.md 解析期使用的类型保留为别名，避免破坏外部引用。
// 新代码请使用 AbilityDefinition / AbilityRegistry / AbilityTrigger。

/** @deprecated 使用 AbilityTrigger */
export type EchoTrigger = AbilityTrigger;
/** @deprecated 使用 AbilityDefinition */
export type EchoDefinition = AbilityDefinition;
/** @deprecated 使用 AbilityRegistry */
export type EchoRegistry = AbilityRegistry;
