// Mod 加载器：注册 mod，按 priority 排序，应用补丁，触发钩子
import type { Card } from '../models/types';
import type { RuleEngine } from '../engine/rule-engine';
import type {
  EchoRegistry,
  GameMod,
  ModContext,
  ModHooks,
  ModLoader,
  ModManifest,
  PhaseRegistry,
  PlayerStateRegistry,
} from './types';
import {
  DefaultEchoRegistry,
  DefaultPhaseRegistry,
  DefaultPlayerStateRegistry,
} from './registry';
import { parseModFile } from './parser';

export class DefaultModLoader implements ModLoader {
  private mods: GameMod[] = [];
  private logger: (msg: string, ...args: unknown[]) => void;

  constructor(logger?: (msg: string, ...args: unknown[]) => void) {
    this.logger = logger ?? ((msg, ...args) => console.log(`[mod] ${msg}`, ...args));
  }

  register(mod: GameMod): void {
    if (this.mods.find((m) => m.id === mod.id)) {
      this.logger(`重复注册 mod: ${mod.id}，已忽略`);
      return;
    }
    this.mods.push(mod);
    this.mods.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.logger(`注册 mod: ${mod.id} v${mod.version}`);

    // 立即触发 onRegister，让 mod 填充它的数据
    if (mod.onRegister) {
      const ctx = this.buildContext();
      try {
        mod.onRegister(ctx);
      } catch (e) {
        this.logger(`mod ${mod.id} onRegister 报错：${(e as Error).message}`);
      }
    }
  }

  unregister(modId: string): void {
    const idx = this.mods.findIndex((m) => m.id === modId);
    if (idx >= 0) {
      this.mods.splice(idx, 1);
      this.logger(`注销 mod: ${modId}`);
    }
  }

  getActiveMods(): GameMod[] {
    return [...this.mods];
  }

  getById(id: string): GameMod | undefined {
    return this.mods.find((m) => m.id === id);
  }

  // ────────────────────────────────────────────────────────────
  // 批量应用补丁
  // ────────────────────────────────────────────────────────────

  applyDeckPatches(base: Card[]): Card[] {
    return this.mods.reduce((deck, mod) => {
      // 先应用 data.cards 增量
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

  applyEchoPatches(registry: EchoRegistry): EchoRegistry {
    for (const mod of this.mods) {
      if (mod.data?.echoes) {
        for (const e of mod.data.echoes) registry.register(e);
      }
    }
    return registry;
  }

  // ────────────────────────────────────────────────────────────
  // 钩子触发
  // ────────────────────────────────────────────────────────────

  triggerHook(hook: keyof ModHooks, ...args: unknown[]): void {
    for (const mod of this.mods) {
      const fn = mod[hook] as unknown;
      if (typeof fn === 'function') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (fn as (...a: any[]) => void).apply(mod, args as unknown as any[]);
        } catch (e) {
          this.logger(`mod ${mod.id} 钩子 ${String(hook)} 报错：${(e as Error).message}`);
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // 内部工具
  // ────────────────────────────────────────────────────────────

  private buildContext(): ModContext {
    return {
      states: new DefaultPlayerStateRegistry(),
      phases: new DefaultPhaseRegistry(),
      echoes: new DefaultEchoRegistry(),
      log: (msg, ...args) => this.logger(msg, ...args),
    };
  }
}

// ────────────────────────────────────────────────────────────
// 工具：从原始内容加载（解析后注册）
// ────────────────────────────────────────────────────────────

export function loadModFromString(
  loader: ModLoader,
  raw: string,
  source: string = '<inline>',
): { ok: boolean; errors: string[]; mod?: GameMod } {
  const result = parseModFile(raw, source);
  if (result.errors.length > 0 || !result.mod) {
    return { ok: false, errors: result.errors, mod: undefined };
  }
  loader.register(result.mod);
  return { ok: true, errors: [], mod: result.mod };
}

export type { ModManifest };
