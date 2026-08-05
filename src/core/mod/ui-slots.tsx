// UI 注入槽：基座在固定位置渲染 `<ModSlot slot="..." />`，
// 由当前已加载 mod 的 `ui.register(slotId, renderFn)` 提供的 React 组件负责具体内容。
//
// 本文件**不**包含任何 mod 业务概念，只定义槽位与 React 渲染桥。
//
// 桥接思路：
// - 基座维护一个全局 registry：Map<ModSlotId, Set<RenderFn>>
// - mod 在 setup(api) 中调用 api.ui.register(id, fn) 注入
// - 基座 UI 把 <ModSlot slot="..." /> 放在需要扩展的位置
// - phase controller 转发到 game store（通过全局 getter 拿 store）
import { useMemo, type ReactNode } from 'react';
import type { GameState, Player } from '../models/types';
import { useGameStore, HUMAN_ID } from '../../store/game-store';
import type { ModSlotId, PhaseController, SlotRenderContext, SlotRenderFn } from './api';

// ────────────────────────────────────────────────────────────
// 全局槽注册表
// ────────────────────────────────────────────────────────────

const REGISTRY: Map<ModSlotId, Set<SlotRenderFn>> = new Map();

export function registerSlot(id: ModSlotId, fn: SlotRenderFn): void {
  let set = REGISTRY.get(id);
  if (!set) {
    set = new Set();
    REGISTRY.set(id, set);
  }
  set.add(fn);
}

export function unregisterSlot(id: ModSlotId, fn: SlotRenderFn): void {
  REGISTRY.get(id)?.delete(fn);
}

export function clearAllSlots(): void {
  REGISTRY.clear();
}

function listRenderers(id: ModSlotId): SlotRenderFn[] {
  return Array.from(REGISTRY.get(id) ?? []);
}

// ────────────────────────────────────────────────────────────
// 槽渲染组件
// ────────────────────────────────────────────────────────────

interface ModSlotProps {
  slot: ModSlotId;
  /** 透传给渲染函数的自定义字段（可选） */
  perspective?: 'human' | 'all';
  /** 备选上下文：若不传，则自动从 game store 读取当前状态 */
  state?: GameState;
  humanPlayer?: Player;
}

/**
 * 通用槽渲染组件。基座在需要 mod 注入 UI 的位置放置 `<ModSlot slot="..." />`。
 * 该组件会按渲染顺序叠加所有 mod 注册的渲染函数。
 */
export function ModSlot({
  slot,
  perspective = 'human',
  state: stateOverride,
  humanPlayer: humanOverride,
}: ModSlotProps): ReactNode {
  const gameState = useGameStore((s) => s.gameState);

  const ctx = useMemo<SlotRenderContext>(() => {
    const state = stateOverride ?? gameState;
    if (!state) {
      return {
        state: undefined as unknown as GameState,
        perspective,
        phase: emptyPhaseController(),
      };
    }
    const humanPlayer =
      humanOverride ?? state.players.find((p) => p.id === HUMAN_ID) ?? state.players[0];
    return {
      state,
      humanPlayer,
      perspective,
      phase: makePhaseController(),
    };
  }, [stateOverride, gameState, humanOverride, perspective]);

  const renderers = listRenderers(slot);
  if (renderers.length === 0) return null;

  return (
    <>
      {renderers.map((fn, i) => (
        <SlotRenderer key={i} fn={fn} ctx={ctx} />
      ))}
    </>
  );
}

function SlotRenderer({
  fn,
  ctx,
}: {
  fn: SlotRenderFn;
  ctx: SlotRenderContext;
}) {
  try {
    return fn(ctx) as ReactNode;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[ModSlot] render error', e);
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// PhaseController：桥接 mod → game store
// ────────────────────────────────────────────────────────────

function makePhaseController(): PhaseController {
  return {
    isActive(phaseId: string): boolean {
      const state = useGameStore.getState();
      const custom = (state.gameState?.modData as { customPhase?: string } | undefined)?.customPhase;
      return custom === phaseId;
    },
    complete(): void {
      const store = useGameStore.getState();
      store.resumeAfterAbility?.();
    },
    reroll(playerId, abilityIdToDiscard): boolean {
      const store = useGameStore.getState();
      return store.rerollAbility?.(playerId, abilityIdToDiscard) ?? false;
    },
    useAbility(playerId, abilityId, targetId) {
      const store = useGameStore.getState();
      return store.useAbility?.(playerId, abilityId, targetId) ?? { ok: false, reason: 'no_store' };
    },
  };
}

function emptyPhaseController(): PhaseController {
  return {
    isActive: () => false,
    complete: () => undefined,
    reroll: () => false,
    useAbility: () => ({ ok: false, reason: 'no_state' }),
  };
}
