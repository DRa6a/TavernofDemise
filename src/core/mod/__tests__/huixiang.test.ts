import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModFile } from '../parser';
import { loadModFromString, DefaultModLoader } from '../mod-loader';
import { SeededRandom } from '../../engine/random';
import { RoundManager } from '../../engine/round-manager';
import { BaseStrategy } from '../../ai/base-strategy';

describe('回响模组 (docs/回响.md)', () => {
  const raw = readFileSync(join(process.cwd(), 'docs/回响.md'), 'utf-8');

  it('应能解析 frontmatter', () => {
    const result = parseModFile(raw, 'docs/回响.md');
    expect(result.errors).toEqual([]);
    expect(result.manifest.id).toBe('huixiang');
    expect(result.manifest.version).toBe('3.5.0');
  });

  it('应能解析 34 个回响 / 8 个状态 / 1 个阶段', () => {
    const result = parseModFile(raw, 'docs/回响.md');
    expect(result.mod?.data?.echoes).toHaveLength(34);
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

  it('应能提取辅助 API（useEcho / castZhaozai / castWangyou 等）', () => {
    const result = parseModFile(raw, 'docs/回响.md');
    const m = result.mod as unknown as Record<string, unknown>;
    expect(typeof m.useEcho).toBe('function');
    expect(typeof m.castZhaozai).toBe('function');
    expect(typeof m.castZhiai).toBe('function');
    expect(typeof m.castBaoshan).toBe('function');
    expect(typeof m.castRumeng).toBe('function');
    expect(typeof m.castWangyou).toBe('function');
    expect(typeof m.castTianxingjian).toBe('function');
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
      expect(p.modData?.echoes).toHaveLength(3);
    }
  });

  it('ModLoader 暴露 echoDefs / stateDefs', () => {
    const loader = new DefaultModLoader();
    loadModFromString(loader, raw, 'docs/回响.md');
    expect(loader.listEchoes()).toHaveLength(34);
    expect(loader.listStates()).toHaveLength(8);
    expect(loader.listPhases()).toHaveLength(1);
    expect(loader.listPhases()[0].insertAt).toBe('before-election');
  });

  it('AI 策略 decideEcho 在 playing 阶段能给可用回响打勾', () => {
    const strategy = new BaseStrategy(new SeededRandom(42));
    const ctx = {
      player: {
        id: 'p2', name: 'p2', isHuman: false, hand: [],
        isDead: false, isOutOfRound: false, position: 1,
        availableBeasts: [], rolledFaces: [],
        modData: { echoes: [{ id: 'tannang', remaining: 2 }, { id: 'chiyan', remaining: 4 }, { id: 'zhaozai', remaining: 3 }] },
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
    const echoDefs = [
      { id: 'tannang', name: '探囊', trigger: 'play-phase' as const, maxUses: 2, shortName: '探囊', effect: 'x' },
      { id: 'chiyan', name: '赤炎', trigger: 'play-phase' as const, maxUses: 4, shortName: '赤炎', effect: 'x' },
      { id: 'zhaozai', name: '招灾', trigger: 'small-round' as const, maxUses: 3, shortName: '招灾', effect: 'x' },
    ];
    let anyHit = false;
    for (let i = 0; i < 30; i++) {
      const r = strategy.decideEcho(ctx, echoDefs);
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
        modData: { echoes: [{ id: 'bumie', remaining: 1 }] },
        stateEffectIds: [],
      } as any,
      state: { phase: 'playing', players: [] } as any,
    };
    const echoDefs = [
      { id: 'bumie', name: '不灭', trigger: 'when-die' as const, maxUses: 1, shortName: '不灭', effect: 'x' },
    ];
    for (let i = 0; i < 20; i++) {
      expect(strategy.decideEcho(ctx, echoDefs)).toBeNull();
    }
  });

  it('招灾 / 忘忧 应能正确应用与解除状态', () => {
    const loader = new DefaultModLoader();
    const res = loadModFromString(loader, raw, 'docs/回响.md');
    const mod = res.mod as unknown as Record<string, unknown>;
    const grantEchoes = mod.grantEchoes as (p: any, rng: () => number) => { id: string; remaining: number }[];
    const useEcho = mod.useEcho as (p: any, id: string) => { ok: boolean };
    const castZhaozai = mod.castZhaozai as (caster: any, target: any) => void;
    const castWangyou = mod.castWangyou as (target: any) => boolean;

    const rm = new RoundManager({ random: new SeededRandom(7), modLoader: loader });
    rm.startGame([
      { id: 'p1', name: '玩家1', isHuman: false },
      { id: 'p2', name: '玩家2', isHuman: false },
    ]);
    const [p1, p2] = rm.getState().players;

    // 给 p1 显式派发 zhaozai（避免依赖随机抽取）
    grantEchoes(p1, Math.random);
    p1.modData = { ...(p1.modData ?? {}), echoes: [{ id: 'zhaozai', remaining: 3 }] };

    // 招灾
    const zhaozaiResult = useEcho(p1, 'zhaozai');
    expect(zhaozaiResult.ok).toBe(true);
    castZhaozai(p1, p2);
    expect(p1.stateEffectIds).toContain('eyun');
    expect(p2.stateEffectIds).toContain('eyun');

    // 厄运有锁定标志，「忘忧」解不掉
    const removed = castWangyou(p2);
    expect(removed).toBe(false);
    expect(p2.stateEffectIds).toContain('eyun');
  });
});
