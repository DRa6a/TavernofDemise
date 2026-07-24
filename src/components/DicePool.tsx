import { useEffect, useRef, useState } from 'react';
import type { DivineBeast } from '../core/models/types';

interface DicePoolProps {
  availableFaces: DivineBeast[];
  resultFace?: DivineBeast;
  loserName: string;
  canDraw: boolean;
  onDraw: () => void;
  onAnimationComplete: () => void;
}

export function DicePool({
  availableFaces,
  resultFace,
  loserName,
  canDraw,
  onDraw,
  onAnimationComplete,
}: DicePoolProps) {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const timerRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (!resultFace || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    const resultIndex = availableFaces.indexOf(resultFace);
    const safeIndex = resultIndex >= 0 ? resultIndex : 0;
    let step = 0;
    const totalSteps = 20 + safeIndex;
    let delay = 60;

    const run = () => {
      setHighlightIndex((prev) => (prev + 1) % availableFaces.length);
      step += 1;

      if (step >= totalSteps) {
        setHighlightIndex(safeIndex);
        setShowResult(true);
        timerRef.current = window.setTimeout(() => {
          onAnimationComplete();
        }, 800);
        return;
      }

      delay = Math.min(delay * 1.12, 220);
      timerRef.current = window.setTimeout(run, delay);
    };

    timerRef.current = window.setTimeout(run, delay);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [resultFace, availableFaces, onAnimationComplete]);

  return (
    <div className="dice-pool">
      <div className="dice-title">{loserName} 面临生死判定</div>
      <div className="dice-faces">
        {availableFaces.map((face, index) => (
          <div
            key={face}
            className={`dice-face ${index === highlightIndex ? 'highlight' : ''} ${showResult && face === resultFace ? 'final' : ''}`}
          >
            {face}
          </div>
        ))}
      </div>
      {!resultFace && (
        <button type="button" className="btn-primary dice-draw-btn" disabled={!canDraw} onClick={onDraw}>
          {canDraw ? '抽取神兽' : '等待抽取'}
        </button>
      )}
      {showResult && resultFace && (
        <div className="dice-result">
          结果：<span className={resultFace === '天龙' ? 'death' : 'life'}>{resultFace}</span>
        </div>
      )}
    </div>
  );
}
