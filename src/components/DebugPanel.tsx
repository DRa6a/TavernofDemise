import { useState } from 'react';
import { useGameStore, HUMAN_ID } from '../store/game-store';
import { CardPhase } from '../utils/constants';
import type { Card } from '../core/models/types';

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const { gameState, modifyHand, revealAll, setRevealAll } = useGameStore();

  if (!gameState) return null;

  const human = gameState.players.find((p) => p.id === HUMAN_ID);
  if (!human) return null;

  const phases: CardPhase[] = ['天', '地', '人', '道'];

  return (
    <div className="debug-panel">
      <button type="button" className="btn-text" onClick={() => setOpen((v) => !v)}>
        {open ? '关闭调试' : '调试'}
      </button>
      {open && (
        <div className="debug-drawer">
          <div className="debug-row">
            <label className="debug-toggle">
              <input
                type="checkbox"
                checked={revealAll}
                onChange={(e) => setRevealAll(e.target.checked)}
              />
              <span>取消隐牌面（翻开所有牌）</span>
            </label>
          </div>
          <div className="debug-row">
            <button
              type="button"
              className="btn-secondary"
              disabled={human.hand.length === 0}
              onClick={() => modifyHand(human.id, 'remove')}
            >
              减少一张手牌
            </button>
          </div>
          <div className="debug-row">
            <span>替换手牌为：</span>
            <div className="debug-card-grid">
              {human.hand.map((card) => (
                <div key={card.id} className="debug-card-group">
                  <span className="debug-card-id">{card.phase}</span>
                  <div className="debug-phase-buttons">
                    {phases.map((phase) => (
                      <button
                        key={phase}
                        type="button"
                        className="btn-text"
                        onClick={() => {
                          const newCard: Card = { ...card, phase };
                          modifyHand(human.id, { replaceId: card.id, newCard });
                        }}
                      >
                        {phase}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
