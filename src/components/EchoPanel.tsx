import { useState } from 'react';
import type { Player } from '../core/models/types';
import type { EchoDefinition } from '../core/mod/types';
import { GamePhase } from '../utils/constants';

interface EchoPanelProps {
  /** 当前玩家（人） */
  player: Player;
  /** 所有玩家（用于「招灾」「致哀」「入梦」等需要选择目标的回响） */
  allPlayers: Player[];
  /** 当前游戏阶段，用于决定哪些回响 trigger 可用 */
  phase: GamePhase;
  /** mod 注册的回响定义 */
  echoDefs: EchoDefinition[];
  /** 使用一个回响（扣次数 + 执行 cast 副作用），返回 {ok, reason} */
  onUseEcho: (player: Player, echoId: string, target?: Player) => { ok: boolean; reason?: string };
}

/** 根据 trigger 字段判断该回响在当前阶段是否亮起。
 *  设计原则：
 *  - `any` / 玩家主动触发的时机：只要还没出 / 开牌就一直可点
 *  - `when-die`：死亡时自动，不在 UI 主动使用
 *  - 其余严格按 trigger 匹配
 */
function isTriggerOk(trigger: EchoDefinition['trigger'], phase: GamePhase): boolean {
  if (trigger === 'when-die') return false;
  if (trigger === 'any') return true;
  switch (trigger) {
    case 'play-phase':
    case 'open-phase':
    case 'small-round':
    case 'big-round':
    case 'after-life-death':
    case 'before-draw':
      return phase === GamePhase.PLAYING || phase === GamePhase.OPENING;
    case 'life-death':
    case 'before-life-death':
      return phase === GamePhase.LIFE_DEATH;
    default:
      return false;
  }
}

/** 哪些回响需要选目标 */
const TARGET_REQUIRED: Record<string, true> = {
  zhaozai: true,
  zhiai: true,
  shuangshenghua: true,
  tannang: true,
  huoshui: true,
  yinni: true,
  fengzhang: true,
  wangyou: true,
  rumeng: true,
  powanfa: true,
  huaxing: true,
  qiaowu: true,
  yanpin: true,
  baoshan: true, // 群体效果但需要在场
  chiyan: true, // 仅对自己
  duxin: true,
  duoxinpo: true,
  lixi: true,
  lingshi: true,
  lingxiu: true,
  yueqian: true,
  hunqian: true,
  zhiyu: true,
  shengshengbuxi: true,
  jifa: true, // 给另外一人 2 个回响
  lunhuibuzhi: true, // 重启大回合
};

export function EchoPanel({ player, allPlayers, phase, echoDefs, onUseEcho }: EchoPanelProps) {
  const [open, setOpen] = useState(false);
  const [targeting, setTargeting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const owned = ((player.modData?.echoes as Array<{ id: string; remaining: number }>) ?? [])
    .filter((e) => e.remaining > 0);

  if (owned.length === 0) return null;

  const defsById = new Map(echoDefs.map((d) => [d.id, d]));
  const ownedDefs = owned
    .map((e) => ({ ...e, def: defsById.get(e.id) }))
    .filter((e) => e.def) as Array<{ id: string; remaining: number; def: EchoDefinition }>;

  const usable = ownedDefs.filter((e) => isTriggerOk(e.def.trigger, phase));
  const unusable = ownedDefs.filter((e) => !isTriggerOk(e.def.trigger, phase));

  function tryUse(echoId: string) {
    setFeedback(null);
    if (TARGET_REQUIRED[echoId]) {
      // 进入「选目标」模式
      setTargeting(echoId);
      return;
    }
    const result = onUseEcho(player, echoId);
    if (result.ok) {
      setFeedback(`✓ 已使用：${defsById.get(echoId)?.name ?? echoId}`);
    } else {
      setFeedback(`✗ 失败：${result.reason ?? '未知'}`);
    }
  }

  function pickTarget(target: Player) {
    if (!targeting) return;
    const result = onUseEcho(player, targeting, target);
    if (result.ok) {
      setFeedback(`✓ 已使用：${defsById.get(targeting)?.name ?? targeting} → ${target.name}`);
    } else {
      setFeedback(`✗ 失败：${result.reason ?? '未知'}`);
    }
    setTargeting(null);
  }

  return (
    <div className="echo-panel">
      <button type="button" className="btn-secondary" onClick={() => setOpen((v) => !v)}>
        回响（{owned.length}）
      </button>
      {open && (
        <div className="echo-panel-body">
          <h3>回响库存</h3>
          {feedback && <p className="echo-feedback">{feedback}</p>}
          {usable.length > 0 && (
            <div className="echo-group">
              <small>当前阶段可用</small>
              <ul>
                {usable.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => tryUse(e.id)}>
                      <strong>{e.def.name}</strong> <small>×{e.remaining}</small>
                    </button>
                    <span className="echo-effect">{e.def.effect}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {unusable.length > 0 && (
            <div className="echo-group muted">
              <small>当前阶段不可用</small>
              <ul>
                {unusable.map((e) => (
                  <li key={e.id}>
                    <span className="echo-disabled">
                      <strong>{e.def.name}</strong> <small>×{e.remaining}</small>
                    </span>
                    <span className="echo-effect">{e.def.effect}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {targeting && (
        <div className="echo-target-modal" onClick={() => setTargeting(null)}>
          <div className="echo-target-card" onClick={(e) => e.stopPropagation()}>
            <h3>选择目标：{defsById.get(targeting)?.name}</h3>
            <ul>
              {allPlayers
                .filter((p) => p.id !== player.id && !p.isDead)
                .map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => pickTarget(p)}>
                      {p.name}
                    </button>
                  </li>
                ))}
            </ul>
            <button type="button" className="btn-ghost" onClick={() => setTargeting(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
