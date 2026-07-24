import { useState } from 'react';
import type { PlayerConfig } from '../core/models/types';
import { HUMAN_ID } from '../store/game-store';

interface StartScreenProps {
  onStart: (configs: PlayerConfig[]) => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [playerCount, setPlayerCount] = useState(4);

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
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
            <option value={6}>6</option>
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={() => onStart(configs)}>
          开始游戏
        </button>
      </div>
    </div>
  );
}
