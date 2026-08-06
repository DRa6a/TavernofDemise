// 模组 API：定义 mod 与基座之间的全部交互面
//
// 设计原则：
// 1. **基座零业务**：本文件不引用「回响 / 状态 / 卡牌 / 阶段」以外的任何业务概念。
//    mod 业务语义（什么是「回响」、什么是「状态」）由 mod 自己解释。
// 2. **能力图谱**：mod 通过 `api.abilities / states / phases` 三个图谱注入游戏数据。
// 3. **运行时能力**：mod 通过 `api.player.*` 在 player 上挂载任意 mod 自管理状态。
// 4. **生命周期钩子**：mod 在 script 顶层导出 `onGameStart` 等函数即可被基座调用。
// 5. **UI 注入**：mod 通过 `api.ui.register(slotId, renderFn)` 注入 React 组件。
//    renderFn 接收「游戏上下文」并返回 ReactNode，由基座的 `<ModSlot>` 组件渲染。
// 6. **阶段运行**：mod 通过 `api.runCustomPhase(id, ...)` 让基座把游戏切到对应阶段
//    并等待 mod 调 `api.completeCustomPhase()` 继续。详见 round-manager。

import type { Card, GameState, Player } from '../models/types';
import type {
  AbilityRegistry,
  PhaseRegistry,
  PlayerStateRegistry,
} from './types';

// ────────────────────────────────────────────────────────────
// UI 注入槽
// ────────────────────────────────────────────────────────────

/** 注入槽标识。所有槽都遵循 `域:子域` 命名。 */
export type ModSlotId =
  | 'start-screen:actions'      // StartScreen：模组加载按钮区
  | 'start-screen:mod-list'     // StartScreen：已加载模组列表的自定义行
  | 'game:header-extra'         // Game header 右侧的额外按钮
  | 'player-seat:badges'        // 玩家座位上的状态徽章
  | 'player-seat:abilities'     // 玩家座位上的能力条
  | 'action-area:side'          // 主操作区（出牌/质疑）旁边的扩展位
  | 'table-center:overlay'      // 牌桌中央的覆盖层（用于「激发」等自定义阻塞阶段）
  | 'overlay:pause'             // 全屏暂停覆盖层（如「能力结算后请继续」）
  | 'log:extra-entry';          // 游戏日志的额外条目

/** 注入槽的渲染上下文：把当前需要的最小数据传给 mod 渲染函数。 */
export interface SlotRenderContext {
  state: GameState;
  humanPlayer?: Player;
  /** 当前人类玩家（human）的视角数据 */
  perspective: 'human' | 'all';
  /** mod 调 api.phase 时的回调（由基座注入，详见 ui-slots.ts） */
  phase: PhaseController;
}

/** 自定义阶段控制器：mod 用来开始/结束一个阻塞阶段。 */
export interface PhaseController {
  /** 当前是否处于 mod 的某个自定义阶段 */
  isActive(phaseId: string): boolean;
  /** 主动结束当前自定义阶段（基座会把游戏进程继续） */
  complete(): void;
  /** 触发模组内「重抽」类操作（mod 自己定义具体语义） */
  reroll?(playerId: string, abilityIdToDiscard: string): boolean;
  /** 触发模组内「使用能力」类操作（基座负责暂停游戏） */
  useAbility?(playerId: string, abilityId: string, targetId?: string): { ok: boolean; reason?: string };
}

/** 槽的渲染函数签名：返回 ReactNode（由基座的 React 渲染）。 */
export type SlotRenderFn = (ctx: SlotRenderContext) => unknown;

// ────────────────────────────────────────────────────────────
// 模组运行时 API
// ────────────────────────────────────────────────────────────

/** 玩家维度的能力。基座只负责路由到具体 mod 实现。 */
export interface PlayerApi {
  /** 玩家身上挂某个状态效果 */
  addState(player: Player, stateId: string, rounds?: number): void;
  /** 移除状态 */
  clearState(player: Player, stateId: string): void;
  /** 查询状态 */
  hasState(player: Player, stateId: string): boolean;
  /** 读写 mod 自管理的 player modData */
  getModData<T = unknown>(player: Player, key: string): T | undefined;
  setModData(player: Player, key: string, value: unknown): void;
}

/** 模组可以使用的 UI 注入入口。 */
export interface UiApi {
  /** 注册一个 UI 槽的渲染函数。基座会在对应位置渲染其返回值。 */
  register(slotId: ModSlotId, render: SlotRenderFn): void;
  /** 取消注册 */
  unregister(slotId: ModSlotId, render: SlotRenderFn): void;
}

/**
 * 调试 / 内部能力 API。基座不预装任何使用此 API 的 mod；它由 mod 自己决定是否暴露。
 * 典型用途：开发期 / 调试期 mod（翻开所有牌、改手牌等）。
 *
 * 重要：基座不读 `revealAll` 等字段——这些是「直接修改 store」类的旁路，仅供
 * 受信任的 mod 使用。**不**应该让生产 mod 把它当公共 API。
 */
export interface DebugApi {
  /** 设置「翻开所有牌」开关（绕过基座隐牌逻辑） */
  setRevealAll(value: boolean): void;
  /** 当前是否处于「翻开所有牌」模式 */
  isRevealAll(): boolean;
  /**
   * 修改手牌：
   * - `'remove'` 移除最后一张
   * - `{ replaceId, newCard }` 替换指定 id
   */
  modifyHand(
    playerId: string,
    operation: 'remove' | { replaceId: string; newCard: Card },
  ): void;
  /**
   * 让基座重新渲染所有 mod UI 槽。mod 可在内部 state 变化时调用，
   * 配合闭包持有 local state（典型：抽屉的 open 标志）。
   */
  bumpRender(): void;
}

/**
 * 模组上下文：在 mod 加载与游戏运行期间被注入的「mod 全部能用的能力」。
 *
 * - `h`：轻量 React.createElement 包装，供 mod 脚本（无 JSX）构造 UI
 * - `log`：mod 自己的日志（带 modId 前缀）
 * - `debug`：受控的调试能力（默认不建议在生产 mod 用）
 * - `abilities / states / phases`：mod 注册游戏数据
 * - `player.*`：读写玩家身上的 mod 维度数据
 * - `ui`：注入 React UI
 * - `phase`：控制自定义阻塞阶段
 */
export interface ModApi {
  /**
   * 轻量 React.createElement 包装。mod 脚本（运行在 `new Function` 沙箱里，
   * 没有 JSX 编译）通过 `api.h('div', { className: 'x' }, child1, child2)` 构造 UI。
   */
  h: typeof h;

  /**
   * 写一条 mod 日志。走统一 ModLogBuffer，输出由 loader.setLogLevel / setLogSink 控制。
   * 同时挂有 .debug / .warn / .error 子方法供 mod 选择子级别。
   */
  log: {
    (message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
  };

  /** 受控的调试能力（见 DebugApi）。基座不调用，由 mod 自取。 */
  debug: DebugApi;

  abilities: AbilityRegistry;
  states: PlayerStateRegistry;
  phases: PhaseRegistry;

  /** 注册自定义卡牌（基座会在 startGame 时合并到牌堆） */
  registerCards(cards: Card[]): void;

  player: PlayerApi;
  ui: UiApi;
  phase: PhaseController;

  /** 读取当前 game state（基座会在每个 hook 之前注入最新状态） */
  state: GameState | null;
}

/**
 * `api.h` 的实现签名。包成独立类型便于在 ModApi 上引用。
 * 等价于 React.createElement，但放宽类型以匹配 React 自己的复杂重载。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CreateElementFn = (type: any, props?: any, ...children: any[]) => unknown;

// 真正的 h 函数在 mod-loader 里实现（依赖 react.createElement）。
// 这里仅占位、不会运行——只是为了让 TypeScript 满意 ModApi.h 的类型。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const h: CreateElementFn;

// ────────────────────────────────────────────────────────────
// 入口：基座在加载 mod 时调用
// ────────────────────────────────────────────────────────────

/**
 * mod 脚本暴露的根对象。基座会调用 `mod.setup(api)`（如果存在），
 * 然后把 mod 的钩子挂到引擎上。
 */
export interface ModScriptExports {
  /** 可选：mod 加载时执行一次，用于注册能力 / 状态 / 阶段 / UI 注入 */
  setup?(api: ModApi): void;
  /** 清理函数（mod 卸载时调用） */
  teardown?(): void;
  // 其余字段由 ModHooks 提供（onGameStart / onBeforePlay ...）
}
