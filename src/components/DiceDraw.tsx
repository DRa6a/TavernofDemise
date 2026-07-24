import { useEffect, useMemo, useRef, useState } from 'react';
import type { DivineBeast } from '../core/models/types';

interface DiceDrawProps {
  availableBeasts: DivineBeast[];
  rolledFaces: DivineBeast[];
  resultFace?: DivineBeast;
  loserName: string;
  canDraw: boolean;
  revealAll?: boolean;
  onDraw: (face: DivineBeast) => void;
  onAnimationComplete: () => void;
}

interface FaceSlot {
  id: string;
  face: DivineBeast;
}

const DEATH_FACE: DivineBeast = '天龙' as DivineBeast;

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildSlots(beasts: DivineBeast[]): FaceSlot[] {
  const pool = beasts.length > 0 ? beasts : [DEATH_FACE];
  return shuffle(pool).map((face, index) => ({ id: `${face}-${index}`, face }));
}

export function DiceDraw({
  availableBeasts,
  rolledFaces,
  resultFace,
  loserName,
  canDraw,
  revealAll,
  onDraw,
  onAnimationComplete,
}: DiceDrawProps) {
  const [slots, setSlots] = useState<FaceSlot[]>(() => buildSlots(availableBeasts));
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const revealTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);

  // 当可用神兽池变化（轮次切换或人/AI 切换）或 resultFace 被清空时重置翻牌状态
  useEffect(() => {
    if (resultFace) return;
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    if (resultTimerRef.current) window.clearTimeout(resultTimerRef.current);
    setSlots(buildSlots(availableBeasts));
    setRevealedId(null);
  }, [availableBeasts.join('|'), resultFace]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (resultTimerRef.current) window.clearTimeout(resultTimerRef.current);
    };
  }, []);

  // resultFace 出现后翻牌并最终回调
  useEffect(() => {
    if (!resultFace) return;

    const target = slots.find((s) => s.face === resultFace);
    if (target) {
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        setRevealedId(target.id);
      }, 150);
    } else {
      setRevealedId(null);
    }

    resultTimerRef.current = window.setTimeout(() => {
      resultTimerRef.current = null;
      onAnimationComplete();
    }, 1800);

    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (resultTimerRef.current) window.clearTimeout(resultTimerRef.current);
      revealTimerRef.current = null;
      resultTimerRef.current = null;
    };
  }, [resultFace, slots, onAnimationComplete]);

  const handlePick = (face: DivineBeast) => {
    if (!canDraw || resultFace) return;
    onDraw(face);
  };

  const forcedRevealAll = !!revealAll;

  const drawn = useMemo(() => rolledFaces.join(' '), [rolledFaces]);
  const isDeath = resultFace === DEATH_FACE;

  return (
    <div className="dice-draw">
      <div className="dice-title">{loserName} 抽取神兽</div>
      <div className="dice-card-grid">
        {slots.map((slot) => {
          const isRevealed = forcedRevealAll || (revealedId === slot.id && !!resultFace);
          const locked = !!resultFace;
          return (
            <button
              key={slot.id}
              type="button"
              className={`dice-card${isRevealed ? ' revealed' : ''}${locked ? ' locked' : ''}`}
              disabled={locked || !canDraw}
              onClick={() => handlePick(slot.face)}
            >
              <span className="dice-card-face">{slot.face}</span>
              <span className="dice-card-back">?</span>
            </button>
          );
        })}
      </div>
      {resultFace && (
        <div className={`dice-result ${isDeath ? 'is-death' : 'is-life'}`}>
          结果：
          <span className="dice-result-text">
            {resultFace}
            {isDeath ? ' · 死亡' : ' · 存活'}
          </span>
        </div>
      )}
      {drawn && (
        <div className="dice-rolled">已抽：{drawn}</div>
      )}
    </div>
  );
}
