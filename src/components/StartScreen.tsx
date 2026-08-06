import { useState } from 'react';
import type { PlayerConfig } from '../core/models/types';
import { HUMAN_ID, useGameStore } from '../store/game-store';

interface StartScreenProps {
  onStart: (configs: PlayerConfig[]) => void;
  /** 跳转到「模组管理」单独界面 */
  onOpenModLoader: () => void;
}

export function StartScreen({ onStart, onOpenModLoader }: StartScreenProps) {
  const [playerCount, setPlayerCount] = useState(4);
  const loadedMods = useGameStore((s) => s.loadedMods);
  const modErrorCount = loadedMods.filter((m) => m.errors.length > 0).length;

  const configs: PlayerConfig[] = Array.from({ length: playerCount }, (_, i) => ({
    id: i === 0 ? HUMAN_ID : `p${i}`,
    name: i === 0 ? '玩家' : `AI ${i}`,
    isHuman: i === 0,
  }));

  return (
    <div className="start-screen">
      <h1>终焉酒馆</h1>
      <p>一局中式诡谲的卡牌博弈</p>

      <div className="start-options">
        <label>
          玩家人数：
          <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))}>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={() => onStart(configs)}>
          开始游戏
        </button>
        <button type="button" className="btn-secondary" onClick={onOpenModLoader}>
          管理模组…
          {loadedMods.length > 0 && (
            <span className="start-mod-badge">
              {loadedMods.length}
              {modErrorCount > 0 && '*'}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
