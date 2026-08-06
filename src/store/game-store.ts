import { create } from 'zustand';
import { RoundManager } from '../core/engine/round-manager';
import { BaseStrategy } from '../core/ai/base-strategy';
import { SeededRandom } from '../core/engine/random';
import { GamePhase } from '../utils/constants';
import type { Card, DivineBeast, GameState, Player, PlayerConfig } from '../core/models/types';
import { DefaultModLoader, loadModFromString } from '../core/mod/mod-loader';
import { loadModPackageFromUrl } from '../core/mod/package-loader';
import type {
  AbilityDefinition,
  GameMod,
  ModLoader,
  PlayerStateEffect,
} from '../core/mod/types';

interface LoadedMod {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  license?: string | { name: string; url?: string };
  repo?: string;
  errors: string[];
}

interface GameStore {
  manager: RoundManager | null;
  gameState: GameState | null;
  pendingDiceResult?: DivineBeast;
  revealDelay: boolean;
  selectedCardIds: string[];
  aiThinking: boolean;
  revealAll: boolean;

  /** 已加载的 mod 列表（按加载顺序） */
  loadedMods: LoadedMod[];
  /** 共享的 mod 加载器实例 */
  modLoader: ModLoader | null;

  /**
   * mod UI 槽的「重渲染版本号」。任何 mod 通过 `api.debug.bumpRender()` 调一下，
   * 所有 `<ModSlot>` 都会重渲染——用于 mod 自己维护闭包 state 时触发更新。
   */
  modRenderVersion: number;
  /** 让所有 mod UI 槽重新渲染（mod 调 api.debug.bumpRender() 走这里） */
  bumpModRender: () => void;

  startGame: (configs: PlayerConfig[]) => void;
  playCards: (cardIds: string[]) => void;
  openPhase: (decision: 'challenge' | 'pass') => void;
  drawDice: (face: DivineBeast) => void;
  resolveDiceAnimation: () => void;
  modifyHand: (playerId: string, operation: 'remove' | { replaceId: string; newCard: Card }) => void;
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  toggleCard: (cardId: string) => void;
  clearSelection: () => void;
  setRevealAll: (value: boolean) => void;
  runAiLoop: () => void;

  /** 从 URL 加载一个 .mod 文件 */
  loadModFromUrl: (url: string, source?: string) => Promise<LoadedMod | null>;
  /** 从 URL 加载 mod manifest（支持 scriptPath 引用外部脚本） */
  loadModProjectFromUrl: (url: string) => Promise<LoadedMod | null>;
  /** 从字符串加载（通常来自 <input type="file">） */
  loadModFromString: (raw: string, source: string) => LoadedMod;
  /** 卸载指定 mod */
  unloadMod: (modId: string) => void;
  /** 卸载全部 mod */
  unloadAllMods: () => void;

  /**
   * 通用 mod 钩子（由 ModSlot / mod 调用）：
   *  - completeInspirePhase: 完成 mod 注册的阻塞阶段
   *  - rerollAbility: 模组内「重抽」操作（语义由 mod 定义）
   *  - useAbility: 使用一个能力（基座只负责暂停+计费，副作用由 mod 实现）
   *  - resumeAfterAbility: 解除暂停
   */
  completeInspirePhase: () => void;
  rerollAbility: (playerId: string, abilityIdToDiscard: string) => boolean;
  useAbility: (playerId: string, abilityId: string, targetId?: string) => { ok: boolean; reason?: string };
  resumeAfterAbility: () => void;

  /** 当前 mod 注册的能力定义（供 UI 使用） */
  abilityDefs: AbilityDefinition[];
  /** 当前 mod 注册的状态定义（供 UI 使用） */
  stateDefs: PlayerStateEffect[];
  /** 是否处于「使用能力后暂停」状态（由 mod 触发） */
  abilityPause: { playerId: string; abilityId: string; reason: string } | null;
}

const HUMAN_ID = 'p0';

function createManager(modLoader: ModLoader | null = null): RoundManager {
  if (modLoader) {
    return new RoundManager({ random: new SeededRandom(Date.now()), modLoader });
  }
  return new RoundManager(new SeededRandom(Date.now()));
}

function getActivePlayer(state: GameState): Player | undefined {
  return state.players.find((p) => p.id === state.activePlayerId);
}

export const useGameStore = create<GameStore>((set, get) => {
  // 把 store 挂到 globalThis，让 mod（脱离 React 上下文）也能调到 store 方法
  // （PhaseController 转发到这里）
  // 必须在 set/get 回调里再写一遍，因为 useGameStore.getState() 还没就绪
  return {
    manager: null,
    gameState: null,
    pendingDiceResult: undefined,
    revealDelay: false,
    selectedCardIds: [],
    aiThinking: false,
    revealAll: false,
    loadedMods: [],
    modLoader: null,
    modRenderVersion: 0,
    abilityDefs: [],
    stateDefs: [],
    abilityPause: null,

    bumpModRender: () => {
      set((s) => ({ modRenderVersion: s.modRenderVersion + 1 }));
    },

    startGame: (configs) => {
      const { modLoader } = get();
      const manager = createManager(modLoader);
      manager.startGame(configs);
      set({
        manager,
        gameState: { ...manager.getState() },
        pendingDiceResult: undefined,
        revealDelay: false,
        selectedCardIds: [],
      });
      get().runAiLoop();
    },

    completeInspirePhase: () => {
      const { manager } = get();
      if (!manager) return;
      manager.completeInspirePhase();
      set({ gameState: { ...manager.getState() } });
      get().runAiLoop();
    },

    rerollAbility: (playerId, abilityIdToDiscard) => {
      const { manager } = get();
      if (!manager) return false;
      // 委托给第一个声明了「重抽」语义的 mod（按 priority 顺序）
      const mods = manager.getModLoader()?.getActiveMods() ?? [];
      for (const mod of mods) {
        const fn = (mod as unknown as { rerollAbility?: (p: Player, a: string, rng: () => number) => boolean })
          .rerollAbility;
        if (typeof fn === 'function') {
          return fn(
            manager.getState().players.find((p) => p.id === playerId)!,
            abilityIdToDiscard,
            () => Math.random(),
          );
        }
      }
      return false;
    },

    /**
     * 通用：使用一个能力。
     * 1) 调 mod 暴露的 useAbility（mod 自管扣次数与副作用）
     * 2) 暂停游戏进程，等玩家点「继续」
     *
     * 基座不写任何具体能力的 case 分支——所有逻辑都在 mod 的 script 中。
     */
    useAbility: (playerId, abilityId, targetId) => {
      const { manager } = get();
      if (!manager) return { ok: false, reason: 'no_manager' };
      const state = manager.getState();
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return { ok: false, reason: 'no_player' };
      const target = targetId ? state.players.find((p) => p.id === targetId) : undefined;

      // 1) 让 mod 处理「使用」（扣次数 + 副作用）
      const result = manager.useAbility(player, abilityId, target);
      set({ gameState: { ...manager.getState() } });
      if (!result.ok) {
        return result;
      }

      // 2) 暂停进程
      const defs = get().abilityDefs;
      const reason = `已使用：${defs.find((d) => d.id === abilityId)?.name ?? abilityId}`;
      set({
        abilityPause: { playerId, abilityId, reason },
        aiThinking: false,
      });
      if (player.isHuman) {
        return { ok: true };
      }
      // AI 使用：1.2 秒后自动继续
      window.setTimeout(() => {
        get().resumeAfterAbility();
      }, 1200);
      return { ok: true };
    },

    resumeAfterAbility: () => {
      set({ abilityPause: null });
      get().runAiLoop();
    },

    loadModFromUrl: async (url, source) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const entry = get().loadModFromString(text, source ?? url);
        return entry;
      } catch (e) {
        const failed: LoadedMod = {
          id: '',
          name: url,
          version: '',
          errors: [`加载失败：${(e as Error).message}`],
        };
        set((s) => ({ loadedMods: [...s.loadedMods, failed] }));
        return failed;
      }
    },

    /**
     * 从 URL 加载「多文件 mod 工程」：先抓 manifest，再按 scriptPath
     * 抓外部脚本。这种工程结构允许作者用真 `.ts`/`.js` 写代码、享受 IDE 补全。
     */
    loadModProjectFromUrl: async (url) => {
      try {
        const res = await loadModPackageFromUrl(url);
        if (!res.ok) {
          const failed: LoadedMod = {
            id: '',
            name: url,
            version: '',
            errors: res.errors,
          };
          set((s) => ({ loadedMods: [...s.loadedMods, failed] }));
          return failed;
        }
        let loader = get().modLoader;
        if (!loader) loader = new DefaultModLoader();
        loader.register(res.mod);
        const m: GameMod = res.mod;
        const entry: LoadedMod = {
          id: m.id,
          name: m.name,
          version: m.version,
          author: m.author,
          description: m.description,
          license: m.license,
          repo: m.repo,
          errors: [],
        };
        set((s) => ({
          modLoader: loader,
          loadedMods: s.loadedMods.some((x) => x.id === m.id)
            ? s.loadedMods
            : [...s.loadedMods, entry],
          abilityDefs: loader!.listAbilities(),
          stateDefs: loader!.listStates(),
        }));
        return entry;
      } catch (e) {
        const failed: LoadedMod = {
          id: '',
          name: url,
          version: '',
          errors: [`加载失败：${(e as Error).message}`],
        };
        set((s) => ({ loadedMods: [...s.loadedMods, failed] }));
        return failed;
      }
    },

    loadModFromString: (raw, source) => {
      let loader = get().modLoader;
      if (!loader) {
        loader = new DefaultModLoader();
      }
      const res = loadModFromString(loader, raw, source);

      if (!res.ok || !res.mod) {
        const failed: LoadedMod = {
          id: '',
          name: source,
          version: '',
          errors: res.errors,
        };
        set((s) => ({
          modLoader: loader,
          loadedMods: [...s.loadedMods, failed],
        }));
        return failed;
      }
      const m: GameMod = res.mod;
      const entry: LoadedMod = {
        id: m.id,
        name: m.name,
        version: m.version,
        author: m.author,
        description: m.description,
        license: m.license,
        repo: m.repo,
        errors: [],
      };
      set((s) => ({
        modLoader: loader,
        loadedMods: s.loadedMods.some((x) => x.id === m.id)
          ? s.loadedMods
          : [...s.loadedMods, entry],
        abilityDefs: loader!.listAbilities(),
        stateDefs: loader!.listStates(),
      }));
      return entry;
    },

    unloadMod: (modId) => {
      const { modLoader } = get();
      if (!modLoader) return;
      modLoader.unregister(modId);
      set((s) => ({
        loadedMods: s.loadedMods.filter((m) => m.id !== modId),
        abilityDefs: modLoader.listAbilities(),
        stateDefs: modLoader.listStates(),
      }));
    },

    unloadAllMods: () => {
      const { modLoader } = get();
      if (modLoader) {
        for (const m of get().loadedMods) {
          if (m.id) modLoader.unregister(m.id);
        }
      }
      set({ loadedMods: [], abilityDefs: [], stateDefs: [] });
    },

    playCards: (cardIds) => {
      const { manager } = get();
      if (!manager) return;
      manager.playCards(manager.getState().activePlayerId, cardIds);
      set({ gameState: { ...manager.getState() }, selectedCardIds: [] });
      get().runAiLoop();
    },

    openPhase: (decision) => {
      const { manager } = get();
      if (!manager) return;
      manager.openPhase(decision);

      if (decision === 'challenge') {
        set({ gameState: { ...manager.getState() }, pendingDiceResult: undefined, revealDelay: true });
        window.setTimeout(() => {
          set({ revealDelay: false });
          get().runAiLoop();
        }, 3000);
        return;
      }

      set({ gameState: { ...manager.getState() }, pendingDiceResult: undefined, revealDelay: false });
      get().runAiLoop();
    },

    drawDice: (face) => {
      set({ pendingDiceResult: face });
    },

    resolveDiceAnimation: () => {
      const { manager, pendingDiceResult } = get();
      if (!manager || !pendingDiceResult) return;
      manager.resolveLifeDeath(pendingDiceResult);
      set({ gameState: { ...manager.getState() }, pendingDiceResult: undefined, revealDelay: false });
      get().runAiLoop();
    },

    modifyHand: (playerId, operation) => {
      const { manager } = get();
      if (!manager) return;
      const state = manager.getState();
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return;

      if (operation === 'remove') {
        if (player.hand.length > 0) player.hand.pop();
      } else {
        const index = player.hand.findIndex((c) => c.id === operation.replaceId);
        if (index >= 0) {
          player.hand[index] = operation.newCard;
        }
      }

      set({ gameState: { ...state } });
    },

    selectCard: (cardId) => {
      set((state) => ({
        selectedCardIds: [...state.selectedCardIds, cardId],
      }));
    },

    deselectCard: (cardId) => {
      set((state) => ({
        selectedCardIds: state.selectedCardIds.filter((id) => id !== cardId),
      }));
    },

    toggleCard: (cardId) => {
      set((state) => ({
        selectedCardIds: state.selectedCardIds.includes(cardId)
          ? state.selectedCardIds.filter((id) => id !== cardId)
          : [...state.selectedCardIds, cardId],
      }));
    },

    clearSelection: () => set({ selectedCardIds: [] }),

    setRevealAll: (value) => set({ revealAll: value }),

    runAiLoop: () => {
      const store = get();
      if (!store.manager || !store.gameState) return;

      // 暂停中：等待玩家点「继续」
      if (store.abilityPause) {
        if (store.abilityPause.playerId === 'p0') {
          set({ aiThinking: false });
          return;
        }
        return;
      }

      const state = store.gameState;
      if (state.phase === GamePhase.GAME_OVER) return;

      if (state.phase === GamePhase.LIFE_DEATH) {
        if (store.revealDelay) return;

        const pending = state.pendingLifeDeath;
        if (!pending) return;

        const loser = state.players.find((p) => p.id === pending.loserId);
        if (!loser || loser.isHuman) return;

        set({ aiThinking: true });
        window.setTimeout(() => {
          const faces = loser.availableBeasts;
          const face = faces.length > 0 ? faces[Math.floor(Math.random() * faces.length)] : '天龙' as DivineBeast;
          store.drawDice(face);
        }, 600);
        return;
      }

      const player = getActivePlayer(state);
      if (!player || player.isHuman || player.isDead || player.isOutOfRound) {
        set({ aiThinking: false });
        return;
      }

      set({ aiThinking: true });

      window.setTimeout(() => {
        const { manager } = get();
        if (!manager) {
          set({ aiThinking: false });
          return;
        }

        const currentState = manager.getState();
        const aiPlayer = getActivePlayer(currentState);
        if (!aiPlayer || aiPlayer.isHuman || aiPlayer.isDead || aiPlayer.isOutOfRound) {
          set({ aiThinking: false });
          return;
        }

        const random = new SeededRandom(Date.now());
        const strategy = new BaseStrategy(random);

        // AI 先决定是否使用能力
        const abilityDefs = get().abilityDefs;
        if (abilityDefs.length > 0) {
          const decision = strategy.decideAbility(
            { player: aiPlayer, state: currentState, lastPlay: currentState.lastPlay },
            abilityDefs,
          );
          if (decision) {
            // useAbility 会设置 abilityPause + 1.2s 后自动 resumeAfterAbility → runAiLoop
            get().useAbility(aiPlayer.id, decision.abilityId, decision.targetId);
            return;
          }
        }

        if (currentState.phase === GamePhase.PLAYING) {
          const cards = strategy.decidePlay({ player: aiPlayer, state: currentState, lastPlay: currentState.lastPlay });
          manager.playCards(aiPlayer.id, cards.map((c) => c.id));
          set({ gameState: { ...manager.getState() }, aiThinking: false });
          get().runAiLoop();
          return;
        }

        if (currentState.phase === GamePhase.OPENING) {
          const shouldChallenge = strategy.decideChallenge({
            player: aiPlayer,
            state: currentState,
            lastPlay: currentState.lastPlay,
          });
          get().openPhase(shouldChallenge ? 'challenge' : 'pass');
          set({ aiThinking: false });
          return;
        }

        set({ aiThinking: false });
      }, 800);
    },
  };
});

// 让 mod（在 React 上下文之外）也能拿到 store
(globalThis as unknown as { __tavernStore?: typeof useGameStore }).__tavernStore = useGameStore;

export { HUMAN_ID, getActivePlayer };
