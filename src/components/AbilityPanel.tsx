// 通用「能力」面板（基座 UI 模板）
//
// 用途：在玩家座位旁渲染「我有哪些能力 / 现在能用哪个 / 点击使用」面板。
//
// 设计原则：
// 1. **基座零业务**：本组件不出现「回响 / 技能 / 道具 / 灵咒」等任何具体 mod 业务术语。
// 2. **可被 mod 完全替换**：mod 可以不渲染本组件，改用 `ui.register('action-area:side', ...)` 注入自己的面板。
// 3. **可被 mod 局部覆盖**：通过 `isAvailable` / `renderChip` 注入自定义判定与外观。
//
// 关联的 mod API：
// - `mod.data.abilities[i]`：定义（id / name / trigger / maxUses / requiresTarget / meta）
// - `player.modData.abilities`：`Array<{ id: string; remaining: number }>`，mod 自己管
//   （基座不维护，因为「剩余次数」是 mod 自己的概念）
//
// 关联的 UI 槽：
// - 默认通过 `action-area:side` 槽接入；也可以直接 `<AbilityPanel ... />` 嵌入
import { useState } from 'react';
import type { Player } from '../core/models/types';
import type { AbilityDefinition, AbilityTrigger } from '../core/mod/types';
import { GamePhase } from '../utils/constants';

interface AbilityPanelProps {
  /** 当前玩家（一般是人类） */
  player: Player;
  /** 所有玩家（用于选目标） */
  allPlayers: Player[];
  /** 当前游戏阶段 */
  phase: GamePhase;
  /** mod 注册的全部能力定义 */
  abilityDefs: AbilityDefinition[];
  /** 使用一个能力：mod 的 useAbility 钩子。返回 {ok, reason} */
  onUseAbility: (player: Player, abilityId: string, target?: Player) => { ok: boolean; reason?: string };
  /** 可选：mod 自定义「该能力当前是否可用」判定，默认按 trigger 决定 */
  isAvailable?: (ability: AbilityDefinition, ctx: { player: Player; phase: GamePhase }) => boolean;
  /** 可选：mod 自定义渲染单个 chip 的内容；返回 null 时使用默认 */
  renderChip?: (ability: AbilityDefinition, owned: { id: string; remaining: number }) => React.ReactNode;
  /** 可选：标题，默认「能力」 */
  title?: string;
  /** 可选：玩家身上「已拥有」的能力列表，默认从 player.modData.abilities 读取 */
  owned?: Array<{ id: string; remaining: number }>;
  /** 可选：选择目标时的回调。默认弹模态框。返回 false 表示使用模态框 */
  renderTargetPicker?: (args: {
    ability: AbilityDefinition;
    players: Player[];
    onPick: (target: Player | undefined) => void;
  }) => React.ReactNode;
}

/**
 * 默认 trigger → 阶段匹配规则。mod 可通过 isAvailable 覆盖。
 * 规则尽量保守——只有非常明确「人类玩家在 X 阶段可主动使用」才亮起。
 */
export function isTriggerOkByDefault(trigger: AbilityTrigger, phase: GamePhase): boolean {
  if (trigger === 'when-die') return false; // 死亡时自动触发
  if (trigger === 'any') return true;
  if (trigger === 'custom') return false; // 由 mod 自行控制
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

export function AbilityPanel({
  player,
  allPlayers,
  phase,
  abilityDefs,
  onUseAbility,
  isAvailable,
  renderChip,
  title = '能力',
  owned: ownedOverride,
  renderTargetPicker,
}: AbilityPanelProps) {
  const [open, setOpen] = useState(false);
  const [targeting, setTargeting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // 基座不预设 owned 字段——这是 mod 自己的数据形状。
  // 模板默认从 player.modData.abilities 读，mod 也能通过 prop 注入。
  const owned =
    ownedOverride ??
    ((player.modData?.abilities as Array<{ id: string; remaining: number }>) ?? []).filter(
      (a) => a.remaining > 0,
    );

  if (owned.length === 0) return null;

  const defsById = new Map(abilityDefs.map((d) => [d.id, d]));
  const ownedDefs = owned
    .map((a) => ({ ...a, def: defsById.get(a.id) }))
    .filter((a) => a.def) as Array<{ id: string; remaining: number; def: AbilityDefinition }>;

  const checkAvailable = (def: AbilityDefinition): boolean =>
    isAvailable ? isAvailable(def, { player, phase }) : isTriggerOkByDefault(def.trigger, phase);

  const usable = ownedDefs.filter((a) => checkAvailable(a.def));
  const unusable = ownedDefs.filter((a) => !checkAvailable(a.def));

  function tryUse(abilityId: string) {
    setFeedback(null);
    const def = defsById.get(abilityId);
    if (def?.requiresTarget && !renderTargetPicker) {
      setTargeting(abilityId);
      return;
    }
    if (def?.requiresTarget && renderTargetPicker) {
      renderTargetPicker({
        ability: def,
        players: allPlayers,
        onPick: (target) => {
          if (!target) {
            setFeedback(null);
            return;
          }
          const result = onUseAbility(player, abilityId, target);
          setFeedback(
            result.ok
              ? `✓ ${def.name ?? abilityId} → ${target.name}`
              : `✗ 失败：${result.reason ?? '未知'}`,
          );
        },
      });
      return;
    }
    const result = onUseAbility(player, abilityId);
    setFeedback(
      result.ok
        ? `✓ 已使用：${def?.name ?? abilityId}`
        : `✗ 失败：${result.reason ?? '未知'}`,
    );
  }

  function pickTarget(target: Player) {
    if (!targeting) return;
    const def = defsById.get(targeting);
    const result = onUseAbility(player, targeting, target);
    setFeedback(
      result.ok
        ? `✓ ${def?.name ?? targeting} → ${target.name}`
        : `✗ 失败：${result.reason ?? '未知'}`,
    );
    setTargeting(null);
  }

  return (
    <div className="ability-panel">
      <button type="button" className="btn-secondary" onClick={() => setOpen((v) => !v)}>
        {title}（{owned.length}）
      </button>
      {open && (
        <div className="ability-panel-body">
          <h3>{title}库存</h3>
          {feedback && <p className="ability-feedback">{feedback}</p>}
          {usable.length > 0 && (
            <div className="ability-group">
              <small>当前阶段可用</small>
              <div className="ability-list">
                {usable.map((a) => (
                  <div
                    key={a.id}
                    className="ability-chip"
                    title={a.def.effect}
                    onClick={() => tryUse(a.id)}
                  >
                    {renderChip ? (
                      renderChip(a.def, a)
                    ) : (
                      <>
                        <strong>{a.def.name}</strong>
                        <small className="ability-count">×{a.remaining}</small>
                        <span className="ability-effect">{a.def.effect}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {unusable.length > 0 && (
            <div className="ability-group muted">
              <small>当前阶段不可用</small>
              <div className="ability-list">
                {unusable.map((a) => (
                  <div key={a.id} className="ability-chip disabled" title={a.def.effect}>
                    {renderChip ? (
                      renderChip(a.def, a)
                    ) : (
                      <>
                        <strong>{a.def.name}</strong>
                        <small className="ability-count">×{a.remaining}</small>
                        <span className="ability-effect">{a.def.effect}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {targeting && !renderTargetPicker && (
        <div className="ability-target-modal" onClick={() => setTargeting(null)}>
          <div className="ability-target-card" onClick={(e) => e.stopPropagation()}>
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
