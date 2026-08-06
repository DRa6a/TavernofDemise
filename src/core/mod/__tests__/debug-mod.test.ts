// 调试 mod 加载集成测试
//
// 验证：
//  1. public/mods/debug.mod 是合法 JSON
//  2. 包解析器可以跑出 setup 函数（不被语法错误卡住）
//  3. setup(api) 接受一个 mock api：能调 api.ui.register，api.log，api.debug.*
//  4. 渲染函数 ctx.humanPlayer 有手牌时返回的 React 元素含「调试」字样
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadModPackage } from '../package-loader';
import { DefaultModLoader } from '../mod-loader';
import { GamePhase } from '../../../utils/constants';
import type { GameState, Player } from '../../models/types';

function makeState(): GameState {
  const human: Player = {
    id: 'p0',
    name: '玩家',
    isHuman: true,
    hand: [
      { id: 'c1', phase: '天' },
      { id: 'c2', phase: '地' },
    ],
    isDead: false,
    isOutOfRound: false,
    position: 0,
    availableBeasts: [],
    rolledFaces: [],
  };
  return {
    phase: GamePhase.PLAYING,
    players: [human],
    deck: [],
    discardPile: [],
    currentRound: 1,
    activePlayerId: 'p0',
    dice: { availableFaces: [] },
    deadFaces: [],
    history: [],
  };
}

describe('调试 mod (debug.mod)', () => {
  it('应能解析为合法包并暴露 setup/teardown', async () => {
    const raw = readFileSync(join(process.cwd(), 'public/mods/debug.mod'), 'utf-8');
    const res = await loadModPackage({ text: raw });
    expect(res.ok).toBe(true);
    if (!res.ok || !res.mod) return;
    expect(res.mod.id).toBe('debug');
    expect(typeof (res.mod as unknown as { setup?: unknown }).setup).toBe('function');
    expect(typeof (res.mod as unknown as { teardown?: unknown }).teardown).toBe('function');
  });

  it('setup 注册 UI 并构造 debug api 调用，渲染函数可返回 React 元素', async () => {
    const raw = readFileSync(join(process.cwd(), 'public/mods/debug.mod'), 'utf-8');
    const res = await loadModPackage({ text: raw });
    expect(res.ok).toBe(true);
    if (!res.ok || !res.mod) return;

    // 用真实的 DefaultModLoader：基座会构造完整 api
    const loader = new DefaultModLoader();
    // 把 store mock 上去，让 api.debug.* 不至于全部 no-op 报错
    const debugCalls: string[] = [];
    (globalThis as unknown as { __tavernStore?: unknown }).__tavernStore = {
      getState: () => ({
        revealAll: false,
        setRevealAll: (v: boolean) => debugCalls.push(`setRevealAll:${v}`),
        modifyHand: (p: string, op: unknown) => debugCalls.push(`modifyHand:${p}:${JSON.stringify(op).slice(0, 40)}`),
        bumpModRender: () => debugCalls.push('bump'),
      }),
    };

    loader.register(res.mod);
    const mods = loader.getActiveMods();
    expect(mods.some((m) => m.id === 'debug')).toBe(true);

    // 渲染器已注册；手动调一次（绕过 React），用「人类玩家」ctx
    const slot = (loader as unknown as {
      slotRegistrations: Array<{ id: string; fn: (ctx: unknown) => unknown; modId: string }>;
    }).slotRegistrations.find((r) => r.id === 'game:header-extra');
    expect(slot).toBeDefined();
    const rendered = slot!.fn({ state: makeState(), humanPlayer: makeState().players[0], perspective: 'human' });
    // 默认 open=false，应返回包含「调试」字样的元素
    const flat = JSON.stringify(rendered);
    expect(flat).toContain('调试');
  });
});
