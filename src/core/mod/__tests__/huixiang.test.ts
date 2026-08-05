// 回响 mod 的集成测试（现在 mod 自身已经迁出 base，但本测试保留以验证
// 「通过 .mod 文件加载 → setup 注入数据 → 引擎读取 → AI 决策 → 玩家使用」全链路）
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModFile } from '../parser';
import { loadModFromString, DefaultModLoader } from '../mod-loader';
import { SeededRandom } from '../../engine/random';
import { RoundManager } from '../../engine/round-manager';
import { BaseStrategy } from '../../ai/base-strategy';

describe('回响模组 (.mod 格式)', () => {
  // 解析 docs/回响.md（兼容旧 .mod.md 解析器）
  const raw = readFileSync(join(process.cwd(), 'docs/回响.md'), 'utf-8');

  it('应能解析 frontmatter', () => {
    const result = parseModFile(raw, 'docs/回响.md');
    expect(result.errors).toEqual([]);
    expect(result.manifest.id).toBe('huixiang');
    expect(result.manifest.version).toBe('3.5.0');
  });

  it('应能解析 34 个能力 / 8 个状态 / 1 个阶段', () => {
    const result = parseModFile(raw, 'docs/回响.md');
    expect(result.mod?.data?.abilities).toHaveLength(34);
    expect(result.mod?.data?.states).toHaveLength(8);
    expect(result.mod?.data?.phases).toHaveLength(1);
  });

  it('应能提取 9 个生命周期钩子', () => {
    const result = parseModFile(raw, 'docs/回响.md');
    const hookNames = [
      'onBeforeGameStart', 'onBeforeElection', 'onBeforePlay', 'onBeforeOpen',
      'onAfterOpen', 'onBeforeLifeDeath', 'onPlayerDied',
      'onBigRoundStart', 'onBigRoundEnd',
    ];
    for (const name of hookNames) {
      expect(typeof (result.mod as unknown as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('应能加载到 ModLoader 并启动游戏', () => {
    const loader = new DefaultModLoader();
    const res = loadModFromString(loader, raw, 'docs/回响.md');
    expect(res.ok).toBe(true);

    const rm = new RoundManager({ random: new SeededRandom(7), modLoader: loader });
    rm.startGame([
      { id: 'p1', name: '玩家1', isHuman: false },
      { id: 'p2', name: '玩家2', isHuman: false },
    ]);
    const state = rm.getState();
    expect(state.players).toHaveLength(2);
    // 由于 mod 注册了 before-election 阻塞阶段，应进入 INSPIRING 阶段
    expect(state.phase).toBe('inspiring');
    // state.modData.customPhase 应当被设置
    expect((state.modData as { customPhase?: string } | undefined)?.customPhase).toBe('inspire');
  });

  it('completeInspirePhase 后每位玩家获得 3 个回响', () => {
    const loader = new DefaultModLoader();
    loadModFromString(loader, raw, 'docs/回响.md');
    const rm = new RoundManager({ random: new SeededRandom(7), modLoader: loader });
    rm.startGame([
      { id: 'p1', name: '玩家1', isHuman: false },
      { id: 'p2', name: '玩家2', isHuman: false },
    ]);
    expect(rm.getState().phase).toBe('inspiring');
    rm.completeInspirePhase();
    const state = rm.getState();
    expect(state.phase).not.toBe('inspiring');
    for (const p of state.players) {
      expect(p.modData?.abilities).toHaveLength(3);
    }
  });

  it('ModLoader 暴露 abilityDefs / stateDefs', () => {
    const loader = new DefaultModLoader();
    loadModFromString(loader, raw, 'docs/回响.md');
    expect(loader.listAbilities()).toHaveLength(34);
    expect(loader.listStates()).toHaveLength(8);
    expect(loader.listPhases()).toHaveLength(1);
    expect(loader.listPhases()[0].insertAt).toBe('before-election');
  });

  it('AI 策略 decideAbility 在 playing 阶段能给可用能力打勾', () => {
    const strategy = new BaseStrategy(new SeededRandom(42));
    const ctx = {
      player: {
        id: 'p2', name: 'p2', isHuman: false, hand: [],
        isDead: false, isOutOfRound: false, position: 1,
        availableBeasts: [], rolledFaces: [],
        modData: { abilities: [{ id: 'tannang', remaining: 2 }, { id: 'chiyan', remaining: 4 }, { id: 'zhaozai', remaining: 3 }] },
        stateEffectIds: [],
      } as any,
      state: {
        phase: 'playing', players: [
          { id: 'p1', isDead: false, hand: [] } as any,
          { id: 'p2', isDead: false, hand: [] } as any,
        ],
        lastPlay: undefined,
      } as any,
    };
    const abilityDefs = [
      { id: 'tannang', name: '探囊', trigger: 'play-phase' as const, maxUses: 2, shortName: '探囊', effect: 'x' },
      { id: 'chiyan', name: '赤炎', trigger: 'play-phase' as const, maxUses: 4, shortName: '赤炎', effect: 'x' },
      { id: 'zhaozai', name: '招灾', trigger: 'small-round' as const, maxUses: 3, shortName: '招灾', effect: 'x' },
    ];
    let anyHit = false;
    for (let i = 0; i < 30; i++) {
      const r = strategy.decideAbility(ctx, abilityDefs);
      if (r !== null) { anyHit = true; break; }
    }
    expect(anyHit).toBe(true);
  });

  it('AI 策略对 when-die 触发器不主动使用', () => {
    const strategy = new BaseStrategy(new SeededRandom(7));
    const ctx = {
      player: {
        id: 'p2', name: 'p2', isHuman: false, hand: [],
        isDead: false, isOutOfRound: false, position: 1,
        availableBeasts: [], rolledFaces: [],
        modData: { abilities: [{ id: 'bumie', remaining: 1 }] },
        stateEffectIds: [],
      } as any,
      state: { phase: 'playing', players: [] } as any,
    };
    const abilityDefs = [
      { id: 'bumie', name: '不灭', trigger: 'when-die' as const, maxUses: 1, shortName: '不灭', effect: 'x' },
    ];
    for (let i = 0; i < 20; i++) {
      expect(strategy.decideAbility(ctx, abilityDefs)).toBeNull();
    }
  });
});
