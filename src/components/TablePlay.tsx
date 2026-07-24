import type { CardPhase, LastPlay } from '../core/models/types';
import { Card } from './Card';

interface TablePlayProps {
  lastPlay?: LastPlay;
  truthPhase?: CardPhase;
}

export function TablePlay({ lastPlay, truthPhase }: TablePlayProps) {
  if (!lastPlay) {
    return <div className="table-play empty">等待出牌</div>;
  }

  return (
    <div className="table-play">
      <div className="table-play-cards">
        {lastPlay.cards.map((card, index) => (
          <div
            key={card.id}
            className={`table-card-wrapper ${lastPlay.isRevealed ? 'revealed' : ''}`}
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <div className="table-card-inner">
              <div className="table-card-back">
                <Card card={card} hidden disabled />
              </div>
              <div className="table-card-front">
                <Card card={card} disabled />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="table-play-info">
        <span className="table-play-player">{lastPlay.playerId}</span>
        <span>打出 {lastPlay.declaredCount} 张</span>
        {lastPlay.isRevealed && truthPhase && (
          <span className="reveal-result">
            {lastPlay.cards.some((c) => c.phase !== truthPhase && c.phase !== '道')
              ? '假牌'
              : '真牌'}
          </span>
        )}
      </div>
    </div>
  );
}
