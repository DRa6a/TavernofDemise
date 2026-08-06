// Mod 加载器：注册 mod，按 priority 排序，应用补丁，触发钩子
// 完全通用：不依赖任何具体 mod 业务概念（回响/技能/道具 等）。
//
// 加载流程：
// 1. 包加载（package-loader）解析 JSON，拿到 ModPackage
// 2. 创建 Default* 注册表，调用 mod 的 setup(api) 注入数据 / UI
// 3. 把 mod 钩子挂到引擎（RoundManager 通过 triggerHook 调用）
import type { Card, GameState, Player } from '../models/types';
import type { RuleEngine } from '../engine/rule-engine';
import type {
  AbilityDefinition,
  AbilityRegistry,
  GameMod,
  ModHooks,
  ModLoader,
  ModManifest,
  PhaseDefinition,
  PhaseRegistry,
  PlayerStateEffect,
  PlayerStateRegistry,
} from './types';
import {
  DefaultAbilityRegistry,
  DefaultPhaseRegistry,
  DefaultPlayerStateRegistry,
} from './registry';
import { loadModPackageFromString } from './package-loader';
import { parseModFile } from './parser';
import type { ModApi, ModScriptExports, PhaseController } from './api';
import { registerSlot, unregisterSlot } from './ui-slots';
import type { ModSlotId, SlotRenderFn } from './api';
import {
  ModLogBuffer,
  silentLogger,
  type ModLogEntry,
  type ModLogLevel,
  type ModLogListener,
} from './log';

export class DefaultModLoader implements ModLoader {
  private mods: GameMod[] = [];
  private stateRegistry: PlayerStateRegistry = new DefaultPlayerStateRegistry();
  private phaseRegistry: PhaseRegistry = new DefaultPhaseRegistry();
  private abilityRegistry: AbilityRegistry = new DefaultAbilityRegistry();
  /** 日志缓冲：默认 silent，调用方通过 setLogSink / setLogLevel 控制输出 */
  private logBuffer: ModLogBuffer = new ModLogBuffer();
  /** 状态为 mod 提供 currentState（每个 hook 前由 RoundManager 注入） */
  private currentState: GameState | null = null;
  /** 每个 mod 注册的 UI 槽渲染函数，用于卸载时清理 */
  private slotRegistrations: Array<{ id: ModSlotId; fn: SlotRenderFn; modId: string }> = [];

  constructor(logger?: (msg: string, ...args: unknown[]) => void) {
    // 向后兼容：旧代码可能传入字符串 logger——把它包成 silent sink（不输出到 console）
    if (logger) {
      this.logBuffer.setLogger((_level, message, args) => logger(message, ...args));
    } else {
      this.logBuffer.setLogger(silentLogger);
    }
  }

  private log(level: ModLogLevel, source: string, message: string, ...args: unknown[]): void {
    const entry: ModLogEntry = {
      ts: Date.now(),
      level,
      source,
      message,
      args: args.map((a) => {
        try {
          return typeof a === 'string' ? a : JSON.stringify(a);
        } catch {
          return String(a);
        }
      }),
    };
    this.logBuffer.push(entry);
  }

  getLogBuffer(): ModLogBuffer {
    return this.logBuffer;
  }

  setLogLevel(level: ModLogLevel): void {
    this.logBuffer.setLevel(level);
  }

  setLogSink(sink: (level: ModLogLevel, message: string, args: unknown[]) => void): void {
    this.logBuffer.setLogger(sink);
  }

  getLogEntries(): ModLogEntry[] {
    return this.logBuffer.getEntries();
  }

  subscribeLog(listener: ModLogListener): () => void {
    return this.logBuffer.subscribe(listener);
  }

  clearLog(): void {
    this.logBuffer.clear();
  }

  register(mod: GameMod): void {
    if (this.mods.find((m) => m.id === mod.id)) {
      this.log('warn', 'loader', `重复注册 mod: ${mod.id}，已忽略`);
      return;
    }
    this.mods.push(mod);
    this.mods.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.log('info', 'loader', `注册 mod: ${mod.id} v${mod.version}`);

    // 1) 把 data.* 注册到默认注册表
    if (mod.data?.states) {
      for (const s of mod.data.states) this.stateRegistry.register(s);
    }
    if (mod.data?.phases) {
      for (const p of mod.data.phases) this.phaseRegistry.register(p);
    }
    if (mod.data?.abilities) {
      for (const a of mod.data.abilities) this.abilityRegistry.register(a);
    }

    // 2) 调 mod 的 setup(api)（如果存在），让 mod 通过 API 注入数据/UI
    const exports = mod as ModScriptExports;
    if (typeof exports.setup === 'function') {
      const api = this.buildApi(mod.id);
      try {
        exports.setup(api);
      } catch (e) {
        this.log('error', 'loader', `mod ${mod.id} setup 报错：${(e as Error).message}`);
      }
    }

    // 3) 立即触发 onRegister（兼容旧接口）
    if (mod.onRegister) {
      const ctx = this.buildApi(mod.id);
      try {
        mod.onRegister(ctx);
      } catch (e) {
        this.log('error', 'loader', `mod ${mod.id} onRegister 报错：${(e as Error).message}`);
      }
    }
  }

  unregister(modId: string): void {
    const idx = this.mods.findIndex((m) => m.id === modId);
    if (idx < 0) return;
    const mod = this.mods[idx];
    this.mods.splice(idx, 1);

    // 清理 mod 注册的 UI 槽
    for (let i = this.slotRegistrations.length - 1; i >= 0; i--) {
      const r = this.slotRegistrations[i];
      if (r.modId === modId) {
        unregisterSlot(r.id, r.fn);
        this.slotRegistrations.splice(i, 1);
      }
    }

    // 清理 mod 注册的数据
    if (mod.data?.states) {
      for (const s of mod.data.states) delete this.stateRegistry.effects[s.id];
    }
    if (mod.data?.phases) {
      this.phaseRegistry.phases = this.phaseRegistry.phases.filter(
        (p) => !mod.data!.phases!.some((mp) => mp.id === p.id),
      );
    }
    if (mod.data?.abilities) {
      for (const a of mod.data.abilities) delete this.abilityRegistry.abilities[a.id];
    }

    // 清理 mod 注册的卡牌
    if (mod.data?.cards) {
      // 卡牌合并是从 base + 各 mod.data.cards 累加，卸载时不撤销（简单处理）
    }

    // 调 mod 的 teardown
    const exports = mod as ModScriptExports;
    if (typeof exports.teardown === 'function') {
      try {
        exports.teardown();
      } catch (e) {
        this.log('error', 'loader', `mod ${modId} teardown 报错：${(e as Error).message}`);
      }
    }

    this.log('info', 'loader', `注销 mod: ${modId}`);
  }

  getActiveMods(): GameMod[] {
    return [...this.mods];
  }

  getById(id: string): GameMod | undefined {
    return this.mods.find((m) => m.id === id);
  }

  // ────────────────────────────────────────────────────────────
  // 供 UI 读取的注册表
  // ────────────────────────────────────────────────────────────

  getStateRegistry(): PlayerStateRegistry {
    return this.stateRegistry;
  }

  getPhaseRegistry(): PhaseRegistry {
    return this.phaseRegistry;
  }

  getAbilityRegistry(): AbilityRegistry {
    return this.abilityRegistry;
  }

  listAbilities(): AbilityDefinition[] {
    return this.abilityRegistry.list();
  }

  listStates(): PlayerStateEffect[] {
    return this.stateRegistry.list();
  }

  listPhases(): PhaseDefinition[] {
    return this.phaseRegistry.list();
  }

  // ────────────────────────────────────────────────────────────
  // 批量应用补丁
  // ────────────────────────────────────────────────────────────

  applyDeckPatches(base: Card[]): Card[] {
    return this.mods.reduce((deck, mod) => {
      let next = mod.data?.cards ? [...deck, ...mod.data.cards] : deck;
      if (mod.patchDeck) next = mod.patchDeck(next);
      return next;
    }, base);
  }

  applyRulePatches(engine: RuleEngine): RuleEngine {
    return this.mods.reduce((current, mod) => {
      return mod.patchEngine ? mod.patchEngine(current) : current;
    }, engine);
  }

  applyStatePatches(registry: PlayerStateRegistry): PlayerStateRegistry {
    for (const mod of this.mods) {
      if (mod.data?.states) {
        for (const s of mod.data.states) registry.register(s);
      }
    }
    return registry;
  }

  applyPhasePatches(registry: PhaseRegistry): PhaseRegistry {
    for (const mod of this.mods) {
      if (mod.data?.phases) {
        for (const p of mod.data.phases) registry.register(p);
      }
    }
    return registry;
  }

  applyAbilityPatches(registry: AbilityRegistry): AbilityRegistry {
    for (const mod of this.mods) {
      if (mod.data?.abilities) {
        for (const a of mod.data.abilities) registry.register(a);
      }
    }
    return registry;
  }

  // ────────────────────────────────────────────────────────────
  // 钩子触发
  // ────────────────────────────────────────────────────────────

  /**
   * 触发某个钩子。RoundManager 在每次调用前都会更新 currentState，
   * 这样 mod 通过 api.state 拿到的就是「当前」state。
   */
  triggerHook(hook: keyof ModHooks, ...args: unknown[]): void {
    const state = this.currentState;
    // 更新 mod 的 api.state（如果有 mod 在 setup 时把它存了起来）
    this.updateModStates(state);
    for (const mod of this.mods) {
      const fn = mod[hook] as unknown;
      if (typeof fn === 'function') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (fn as (...a: any[]) => void).apply(mod, args as unknown as any[]);
        } catch (e) {
          this.log('error', `mod:${mod.id}`, `钩子 ${String(hook)} 报错：${(e as Error).message}`);
        }
      }
    }
  }

  /** 由 RoundManager 在每个 hook 前调用，注入最新 state */
  setCurrentState(state: GameState | null): void {
    this.currentState = state;
    this.updateModStates(state);
  }

  private updateModStates(state: GameState | null): void {
    if (state === null) return;
    // 让 mod 通过 api.state 拿到的总是当前 state
    for (const mod of this.mods) {
      const api = (mod as unknown as { __api?: ModApi }).__api;
      if (api) api.state = state;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 内部：构造 ModApi
  // ────────────────────────────────────────────────────────────

  private buildApi(modId: string): ModApi {
    const modId_ = modId;
    // mod 的 log(): 走统一缓冲（带 source 标签），由 setLogSink/setLogLevel 控制输出
    // 同时挂有 .debug / .warn / .error 子方法（mod 可写 api.log.debug(...)）
    const modLogger: ModApi['log'] = Object.assign(
      (msg: string, ...args: unknown[]) => {
        this.log('info', `mod:${modId_}`, msg, ...args);
      },
      {
        debug: (msg: string, ...args: unknown[]) => {
          this.log('debug', `mod:${modId_}`, msg, ...args);
        },
        warn: (msg: string, ...args: unknown[]) => {
          this.log('warn', `mod:${modId_}`, msg, ...args);
        },
        error: (msg: string, ...args: unknown[]) => {
          this.log('error', `mod:${modId_}`, msg, ...args);
        },
      },
    );

    // PhaseController 转发到 game store（通过全局 getter 拿 store）
    const phaseCtrl: PhaseController = {
      isActive: (phaseId: string) => {
        // 在没有 React 上下文时（如 RoundManager 中）通过全局 store getter
        const g = (globalThis as unknown as { __tavernStore?: { getState: () => { gameState: GameState | null } } })
          .__tavernStore;
        const state = g?.getState().gameState;
        if (!state) return false;
        return (state.modData as { customPhase?: string } | undefined)?.customPhase === phaseId;
      },
      complete: () => {
        const g = (globalThis as unknown as {
          __tavernStore?: { getState: () => { resumeAfterAbility?: () => void } };
        }).__tavernStore;
        g?.getState().resumeAfterAbility?.();
      },
      reroll: (playerId, abilityId) => {
        const g = (globalThis as unknown as {
          __tavernStore?: { getState: () => { rerollAbility?: (p: string, a: string) => boolean } };
        }).__tavernStore;
        return g?.getState().rerollAbility?.(playerId, abilityId) ?? false;
      },
      useAbility: (playerId, abilityId, targetId) => {
        const g = (globalThis as unknown as {
          __tavernStore?: {
            getState: () => { useAbility?: (p: string, a: string, t?: string) => { ok: boolean; reason?: string } };
          };
        }).__tavernStore;
        return (
          g?.getState().useAbility?.(playerId, abilityId, targetId) ?? {
            ok: false,
            reason: 'no_store',
          }
        );
      },
    };

    const api: ModApi = {
      log: modLogger,
      abilities: this.abilityRegistry,
      states: this.stateRegistry,
      phases: this.phaseRegistry,
      registerCards: (cards: Card[]) => {
        // 记录 mod 注入的卡牌（与 data.cards 合并）
        const mod = this.getById(modId_);
        if (mod) {
          mod.data = { ...(mod.data ?? {}), cards: [...(mod.data?.cards ?? []), ...cards] };
        }
      },
      player: {
        addState: (player: Player, stateId: string, rounds = 1) => {
          if (!player.stateEffectIds?.includes(stateId)) {
            player.stateEffectIds = [...(player.stateEffectIds ?? []), stateId];
          }
          if (!player.modData) player.modData = {};
          const dur = (player.modData as Record<string, unknown>).stateDurations as
            | Record<string, number>
            | undefined;
          (player.modData as Record<string, unknown>).stateDurations = {
            ...(dur ?? {}),
            [stateId]: rounds,
          };
        },
        clearState: (player: Player, stateId: string) => {
          player.stateEffectIds = (player.stateEffectIds ?? []).filter((s) => s !== stateId);
          if (player.modData) {
            const md = player.modData as Record<string, unknown>;
            const dur = md.stateDurations as Record<string, number> | undefined;
            if (dur) {
              delete dur[stateId];
            }
          }
        },
        hasState: (player: Player, stateId: string) => {
          return (player.stateEffectIds ?? []).includes(stateId);
        },
        getModData: <T = unknown>(player: Player, key: string): T | undefined => {
          const data = (player.modData ?? {}) as Record<string, unknown>;
          return data[key] as T | undefined;
        },
        setModData: (player: Player, key: string, value: unknown) => {
          if (!player.modData) player.modData = {};
          (player.modData as Record<string, unknown>)[key] = value;
        },
      },
      ui: {
        register: (id: ModSlotId, fn: SlotRenderFn) => {
          registerSlot(id, fn);
          this.slotRegistrations.push({ id, fn, modId: modId_ });
        },
        unregister: (id: ModSlotId, fn: SlotRenderFn) => {
          unregisterSlot(id, fn);
          this.slotRegistrations = this.slotRegistrations.filter(
            (r) => !(r.id === id && r.fn === fn && r.modId === modId_),
          );
        },
      },
      phase: phaseCtrl,
      state: this.currentState,
    };

    // 把 api 挂到 mod 上，方便 updateModStates 找到
    (this.getById(modId_) as unknown as { __api?: ModApi }).__api = api;
    return api;
  }
}

// ────────────────────────────────────────────────────────────
// 工具
// ────────────────────────────────────────────────────────────

/**
 * 一行加载：从字符串（.mod JSON 文件 或 .mod.md 文件）解析并注册。
 * 推荐用法——所有 mod 都应走这条路径。
 *
 * 自动识别：
 * - 内容以 `---` 开头 → 旧版 .mod.md 解析器
 * - 否则按 .mod JSON 包处理
 */
export function loadModFromString(
  loader: ModLoader,
  raw: string,
  _source: string = '<inline>',
): { ok: boolean; errors: string[]; mod?: GameMod } {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('---')) {
    // 旧版 .mod.md：通过 parseModFile 解析
    const result = parseModFile(raw, _source);
    if (result.errors.length > 0 || !result.mod) {
      return { ok: false, errors: result.errors, mod: undefined };
    }
    loader.register(result.mod);
    return { ok: true, errors: [], mod: result.mod };
  }
  // 新版 .mod JSON
  const res = loadModPackageFromString(raw);
  if (!res.ok) {
    return { ok: false, errors: res.errors, mod: undefined };
  }
  loader.register(res.mod);
  return { ok: true, errors: [], mod: res.mod };
}

export type { ModManifest };
