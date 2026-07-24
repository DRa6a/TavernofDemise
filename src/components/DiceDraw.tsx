import { useEffect, useMemo, useRef, useState } from 'react';
import type { DivineBeast } from '../core/models/types';

interface DiceDrawProps {
  availableBeasts: DivineBeast[];
  rolledFaces: DivineBeast[];
  resultFace?: DivineBeast;
  loserName: string;
  canDraw: boolean;
  onDraw: (face: DivineBeast) => void;
  onAnimationComplete: () => void;
}

export function DiceDraw({
  availableBeasts,
  rolledFaces,
  resultFace,
  loserName,
  canDraw,
  onDraw,
  onAnimationComplete,
}: DiceDrawProps) {
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const aiStartedRef = useRef(false);
  const prevBeastCountRef = useRef(availableBeasts.length);

  useEffect(() => {
    if (availableBeasts.length !== prevBeastCountRef.current) {
      prevBeastCountRef.current = availableBeasts.length;
      aiStartedRef.current = false;
      setRevealedIndex(null);
    }
  }, [availableBeasts.length]);

  useEffect(() => {
    if (!canDraw || aiStartedRef.current || resultFace) return;
    aiStartedRef.current = true;

    timerRef.current = window.setTimeout(() => {
      const faces = availableBeasts.length > 0 ? availableBeasts : ['天龙' as DivineBeast];
      const face = faces[Math.floor(Math.random() * faces.length)];
      onDraw(face);
    }, 800);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [canDraw, availableBeasts, resultFace, onDraw]);

  useEffect(() => {
    if (!resultFace) return;
    const index = availableBeasts.indexOf(resultFace);
    setRevealedIndex(index >= 0 ? index : 0);

    timerRef.current = window.setTimeout(() => {
      onAnimationComplete();
    }, 1800);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [resultFace, availableBeasts, onAnimationComplete]);

  const displayFaces = useMemo(() => {
    const faces = availableBeasts.length > 0 ? [...availableBeasts] : ['天龙' as DivineBeast];
    return faces.sort(() => Math.random() - 0.5);
  }, [availableBeasts.join(',')]);

  return (
    <div className="dice-draw">
      <div className="dice-title">{loserName} 抽取神兽</div>
      <div className="dice-card-grid">
        {displayFaces.map((face, index) => (
          <button
            key={`${face}-${index}`}
            type="button"
            className={`dice-card ${revealedIndex === index ? 'revealed' : ''} ${resultFace ? 'locked' : ''}`}
            disabled={!canDraw || !!resultFace}
            onClick={() => onDraw(face)}
          >
            <span className="dice-card-face">{face}</span>
            <span className="dice-card-back">?</span>
          </button>
        ))}
      </div>
      {resultFace && (
        <div className="dice-result">
          结果：<span className={resultFace === '天龙' ? 'death' : 'life'}>{resultFace}</span>
        </div>
      )}
      {rolledFaces.length > 0 && (
        <div className="dice-rolled">已抽：{rolledFaces.join(' ')}</div>
      )}
    </div>
  );
}
