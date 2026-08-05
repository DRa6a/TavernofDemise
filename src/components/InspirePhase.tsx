import type { Player } from '../core/models/types';
import type { EchoDefinition } from '../core/mod/types';

interface InspirePhaseProps {
  players: Player[];
  echoDefs: EchoDefinition[];
  /** 玩家可对其中 1 个回响执行「重抽」 */
  onReroll: (playerId: string, echoIdToDiscard: string) => void;
  /** 全部玩家都准备就绪后调用，进入选举 */
  onConfirm: () => void;
}

export function InspirePhase({ players, echoDefs, onReroll, onConfirm }: InspirePhaseProps) {
  const defsById = new Map(echoDefs.map((d) => [d.id, d]));

  return (
    <div className="inspire-phase">
      <h2>激发回合</h2>
      <p className="hint">
        每名参与者从回响堆中抽取 3 个回响。
        <br />
        对其中某个回响不满意？点「重抽」可丢弃 1 个重新抽 1 个（仅限 1 次）。
      </p>

      <ul className="inspire-players">
        {players.map((p) => {
          const echoes = ((p.modData?.echoes as Array<{ id: string; remaining: number }>) ?? []);
          return (
            <li key={p.id} className={`inspire-player ${p.isDead ? 'dead' : ''}`}>
              <div className="inspire-player-name">
                {p.name} {p.isHuman ? '(你)' : ''}
              </div>
              <ul className="inspire-echoes">
                {echoes.map((e) => (
                  <li key={e.id}>
                    <span className="echo-chip" title={defsById.get(e.id)?.effect}>
                      {defsById.get(e.id)?.name ?? e.id} <small>×{e.remaining}</small>
                    </span>
                    {!p.isDead && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => onReroll(p.id, e.id)}
                        title="用这个回响换 1 个新的"
                      >
                        重抽
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <button type="button" className="btn-primary" onClick={onConfirm}>
        进入对局
      </button>
    </div>
  );
}
