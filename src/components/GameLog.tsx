import { useEffect, useRef } from 'react';
import type { GameEvent } from '../core/models/types';

interface GameLogProps {
  events: GameEvent[];
}

function formatEvent(event: GameEvent): string {
  switch (event.type) {
    case 'GAME_STARTED':
      return '游戏开始';
    case 'FIRST_PLAYER_ELECTED':
      return `首回合玩家：${event.playerId}`;
    case 'ROUND_STARTED':
      return `第 ${event.round} 大回合开始`;
    case 'CARDS_DRAWN':
      return `${event.playerId} 抽了 ${event.count} 张牌`;
    case 'TRUTH_DECLARED':
      return `本回合真牌：${event.phase}`;
    case 'CARDS_PLAYED':
      return `${event.playerId} 出了 ${event.declaredCount} 张牌`;
    case 'CHALLENGE_DECISION':
      return `${event.playerId} 选择${event.decision === 'challenge' ? '质疑' : '跳过'}`;
    case 'CARDS_REVEALED':
      return `${event.playerId} 的牌被翻开，${event.isFake ? '是假牌' : '是真牌'}`;
    case 'DICE_ROLLED':
      return `${event.playerId} 掷出 ${event.face}`;
    case 'PLAYER_DIED':
      return `${event.playerId} 出局`;
    case 'PLAYER_OUT_OF_ROUND':
      return `${event.playerId} 本轮清空手牌，跳过剩余回合`;
    case 'NEXT_ACTIVE_PLAYER':
      return `下一位活跃玩家：${event.playerId}`;
    case 'GAME_OVER':
      return `游戏结束，胜者：${event.winnerId}`;
    default:
      return '';
  }
}

export function GameLog({ events }: GameLogProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [events.length]);

  return (
    <div className="game-log">
      <h3>对局记录</h3>
      <ul ref={listRef}>
        {events.map((event, index) => (
          <li key={index}>{formatEvent(event)}</li>
        ))}
      </ul>
    </div>
  );
}
