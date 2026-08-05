import { create } from 'zustand';
import { RoundManager } from '../core/engine/round-manager';
import { BaseStrategy } from '../core/ai/base-strategy';
import { SeededRandom } from '../core/engine/random';
import { GamePhase } from '../utils/constants';
import type { Card, DivineBeast, GameState, Player, PlayerConfig } from '../core/models/types';
import { DefaultModLoader, loadModFromString } from '../core/mod/mod-loader';
import type {
  EchoDefinition,
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

  /** 从 URL 加载一个 .mod.md 文件 */
  loadModFromUrl: (url: string, source?: string) => Promise<LoadedMod | null>;
  /** 从字符串加载（通常来自 <input type="file">） */
  loadModFromString: (raw: string, source: string) => LoadedMod;
  /** 卸载指定 mod */
  unloadMod: (modId: string) => void;
  /** 卸载全部 mod */
  unloadAllMods: () => void;

  /** 完成激发回合（确认每个玩家已查看 / 调整） */
  completeInspirePhase: () => void;
  /** 玩家在激发回合中重抽 1 个回响 */
  rerollEcho: (playerId: string, echoIdToDiscard: string) => void;
  /** 使用一个回响（应用 cast 副作用） */
  useEcho: (playerId: string, echoId: string, targetId?: string) => { ok: boolean; reason?: string };
  /** 玩家使用回响后，回合进程暂停；调用此函数让游戏继续 */
  resumeAfterEcho: () => void;
  /** 当前 mod 注册的回响定义列表 */
  echoDefs: import('../core/mod/types').EchoDefinition[];
  /** 当前 mod 注册的状态定义列表 */
  stateDefs: import('../core/mod/types').PlayerStateEffect[];
  /** 是否处于「使用回响后暂停」状态 */
  echoPause: { playerId: string; echoId: string; reason: string } | null;
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

export const useGameStore = create<GameStore>((set, get) => ({
  manager: null,
  gameState: null,
  pendingDiceResult: undefined,
  revealDelay: false,
  selectedCardIds: [],
  aiThinking: false,
  revealAll: false,
  loadedMods: [],
  modLoader: null,
  echoDefs: [],
  stateDefs: [],
  echoPause: null,

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

  rerollEcho: (playerId, echoIdToDiscard) => {
    const { manager } = get();
    if (!manager) return;
    manager.rerollEcho(playerId, echoIdToDiscard);
    set({ gameState: { ...manager.getState() } });
  },

  useEcho: (playerId, echoId, targetId) => {
    const { manager } = get();
    if (!manager) return { ok: false, reason: 'no_manager' };
    const state = manager.getState();
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, reason: 'no_player' };
    const target = targetId ? state.players.find((p) => p.id === targetId) : undefined;

    // 1) 扣使用次数
    const result = manager.useEcho(player, echoId);
    if (!result.ok) {
      set({ gameState: { ...state } });
      return result;
    }

    // 2) 根据回响 id 执行对应 cast 副作用
    const loader = get().modLoader;
    const mod = loader?.getById('huixiang') as (GameMod & Record<string, unknown>) | undefined;
    const modApi = mod as Record<string, unknown> | undefined;

    try {
      switch (echoId) {
        case 'zhaozai':
          if (target && modApi && typeof modApi.castZhaozai === 'function') {
            (modApi.castZhaozai as (a: Player, b: Player) => void)(player, target);
          }
          break;
        case 'zhiai':
          if (target && modApi && typeof modApi.castZhiai === 'function') {
            (modApi.castZhiai as (t: Player) => void)(target);
          }
          break;
        case 'baoshan':
          if (modApi && typeof modApi.castBaoshan === 'function') {
            (modApi.castBaoshan as (c: Player, s: GameState) => void)(player, state);
          }
          break;
        case 'rumeng':
          if (target && modApi && typeof modApi.castRumeng === 'function') {
            (modApi.castRumeng as (t: Player, r: () => number) => void)(
              target,
              () => Math.random(),
            );
          }
          break;
        case 'wangyou':
          if (target && modApi && typeof modApi.castWangyou === 'function') {
            (modApi.castWangyou as (t: Player) => boolean)(target);
          }
          break;
        case 'tianxingjian':
          if (modApi && typeof modApi.castTianxingjian === 'function') {
            (modApi.castTianxingjian as (p: Player) => void)(player);
          }
          break;
        case 'jifa':
          if (target && modApi && typeof modApi.grantEchoes === 'function') {
            (modApi.grantEchoes as (p: Player, r: () => number) => unknown[])(
              target,
              () => Math.random(),
            );
          }
          break;
        case 'dianren': {
          if (target && target.modData) {
            const arr = ((target.modData as Record<string, unknown>).echoes as Array<{
              id: string;
              remaining: number;
            }>) ?? [];
            if (arr.length > 0) {
              arr.splice(Math.floor(Math.random() * arr.length), 1);
              (target.modData as Record<string, unknown>).echoes = arr;
            }
          }
          break;
        }
        case 'powanfa': {
          if (target && target.modData) {
            const arr = ((target.modData as Record<string, unknown>).echoes as Array<{
              id: string;
              remaining: number;
            }>) ?? [];
            if (arr.length > 0) {
              const pick = arr[Math.floor(Math.random() * arr.length)];
              pick.remaining = Math.max(0, pick.remaining - 1);
            }
          }
          break;
        }
        case 'qiaowu': {
          const deck = state.deck;
          if (player.hand.length > 0 && deck.length > 0) {
            const i = Math.floor(Math.random() * player.hand.length);
            const j = Math.floor(Math.random() * deck.length);
            const tmp = player.hand[i];
            player.hand[i] = deck[j];
            deck[j] = tmp;
          }
          break;
        }
        case 'chiyan': {
          player.hand = [];
          if (state.deck.length > 0) {
            const i = Math.floor(Math.random() * state.deck.length);
            player.hand.push(state.deck[i]);
            state.deck.splice(i, 1);
          }
          break;
        }
        case 'yinni': {
          if (target) {
            if (!target.modData) target.modData = {};
            (target.modData as Record<string, unknown>).__hiddenDao = true;
          }
          break;
        }
        case 'yanpin': {
          if (state.deck.length > 0) {
            const i = Math.floor(Math.random() * state.deck.length);
            const card = state.deck[i];
            state.deck.splice(i, 1);
            (target ?? player).hand.push(card);
          }
          break;
        }
        case 'tannang': {
          const t = target ?? player;
          const pool = t.hand;
          if (pool.length > 0) {
            const i = Math.floor(Math.random() * pool.length);
            const [c] = pool.splice(i, 1);
            player.hand.push(c);
          }
          break;
        }
        case 'huaxing': {
          const t = target ?? player;
          if (t.hand.length > 0) {
            const i = Math.floor(Math.random() * t.hand.length);
            t.hand[i] = { ...t.hand[i], phase: '道' as Card['phase'] };
          }
          break;
        }
        case 'shuangshenghua': {
          if (target) {
            manager.addState(player, 'shuangshenghua', 1);
            manager.addState(target, 'shuangshenghua', 1);
          }
          break;
        }
        case 'lunhuibuzhi': {
          state.players.forEach((p) => {
            if (!p.isDead) {
              state.discardPile.push(...p.hand);
              p.hand = [];
            }
          });
          state.currentRound += 1;
          state.lastPlay = undefined;
          break;
        }
        case 'xianling': {
          if (modApi && typeof modApi.grantEchoes === 'function') {
            (modApi.grantEchoes as (p: Player, r: () => number) => unknown[])(
              player,
              () => Math.random(),
            );
          }
          break;
        }
        case 'jiahuo':
        case 'tizui':
        case 'qiangyun': {
          if (!player.modData) player.modData = {};
          (player.modData as Record<string, unknown>).__shieldLifeDeath = echoId;
          break;
        }
        case 'shengshengbuxi': {
          if (target && target.isDead) {
            target.isDead = false;
            target.stateEffectIds = (target.stateEffectIds ?? []).filter(
              (s) => s !== 'suoding',
            );
            target.availableBeasts = ['天龙', '白羊', '青龙', '白虎', '朱雀', '玄武'];
          }
          break;
        }
        case 'zhiyu': {
          if (target && target.isDead) {
            target.isDead = false;
            target.availableBeasts = ['天龙'];
          }
          break;
        }
        case 'bumie': {
          // 「不灭」：死亡时由 onPlayerDied 自动处理
          break;
        }
        default:
          break;
      }
    } catch (e) {
      // cast 失败不阻塞
    }

    set({ gameState: { ...manager.getState() } });
    // 使用回响后暂停进程
    const reason = (modApi && typeof modApi.useEcho === 'function')
      ? `已使用：${(echoDefs as Array<{ id: string; name: string }>).find((d) => d.id === echoId)?.name ?? echoId}`
      : `已使用：${echoId}`;
    set({
      echoPause: { playerId, echoId, reason },
      aiThinking: false,
    });
    if (player.isHuman) {
      // 人类使用：等待「继续」按钮
      return { ok: true };
    }
    // AI 使用：暂停 1.2 秒后自动继续
    window.setTimeout(() => {
      get().resumeAfterEcho();
    }, 1200);
    return { ok: true };
  },

  resumeAfterEcho: () => {
    set({ echoPause: null });
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
      errors: [],
    };
    set((s) => ({
      modLoader: loader,
      loadedMods: s.loadedMods.some((x) => x.id === m.id)
        ? s.loadedMods
        : [...s.loadedMods, entry],
      echoDefs: loader!.listEchoes(),
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
      echoDefs: modLoader.listEchoes(),
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
    set({ loadedMods: [], echoDefs: [], stateDefs: [] });
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
    if (store.echoPause) {
      if (store.echoPause.playerId === 'p0') {
        set({ aiThinking: false });
        return;
      }
      // AI 玩家使用回响，resumeAfterEcho 会再次调用 runAiLoop
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

      // AI 先决定是否使用回响（pause 期间会被 useEcho 自己恢复）
      const echoDefs = get().echoDefs;
      if (echoDefs.length > 0) {
        const decision = strategy.decideEcho(
          { player: aiPlayer, state: currentState, lastPlay: currentState.lastPlay },
          echoDefs,
        );
        if (decision) {
          // useEcho 会设置 echoPause + 800ms 后自动 resumeAfterEcho → runAiLoop
          get().useEcho(aiPlayer.id, decision.echoId, decision.targetId);
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
        // 走 store 的 openPhase action，保证质疑后也能触发 3 秒翻开动画
        get().openPhase(shouldChallenge ? 'challenge' : 'pass');
        set({ aiThinking: false });
        return;
      }

      set({ aiThinking: false });
    }, 800);
  },
}));

export { HUMAN_ID, getActivePlayer };
