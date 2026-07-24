import type { CardPhase, LastPlay } from '../core/models/types';
import { Card } from './Card';

interface TablePlayProps {
  lastPlay?: LastPlay;
  truthPhase?: CardPhase;
  revealAll?: boolean;
}

export function TablePlay({ lastPlay, truthPhase, revealAll }: TablePlayProps) {
  if (!lastPlay) {
    return <div className="table-play empty">等待出牌</div>;
  }

  const forceReveal = !!revealAll || lastPlay.isRevealed;

  return (
    <div className="table-play">
      <div className="table-play-cards">
        {lastPlay.cards.map((card, index) => (
          <div
            key={card.id}
            className={`table-card-wrapper ${forceReveal ? 'revealed' : ''}`}
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <div className="table-card-inner">
              {/* 翻开前显示牌背；翻开完成后彻底卸载 DOM，避免任何渲染场景下透出 */}
              {!forceReveal && (
                <div className="table-card-back">
                  <Card card={card} hidden />
                </div>
              )}
              <div className="table-card-front">
                <Card card={card} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="table-play-info">
        <span className="table-play-player">{lastPlay.playerId}</span>
        <span>打出 {lastPlay.declaredCount} 张</span>
        {forceReveal && truthPhase && (
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
