import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  onDraw,
  onAnimationComplete,
}: DiceDrawProps) {
  const [slots, setSlots] = useState<FaceSlot[]>(() => buildSlots(availableBeasts));
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'drawing' | 'revealing' | 'done'>('idle');

  const aiTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);

  const clearAllTimers = useCallback(() => {
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    if (resultTimerRef.current) window.clearTimeout(resultTimerRef.current);
    aiTimerRef.current = null;
    revealTimerRef.current = null;
    resultTimerRef.current = null;
  }, []);

  // 当可用神兽池变化（轮次切换或人/AI 切换）或 resultFace 被清空时重置整个抽卡流程
  useEffect(() => {
    if (resultFace) return; // 已经有结果时不要重置
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    clearAllTimers();
    setSlots(buildSlots(availableBeasts));
    setRevealedId(null);
    setPhase('idle');
  }, [availableBeasts.join('|'), resultFace, clearAllTimers]);

  // AI 自动抽卡：必须等 canDraw=true 且处于 idle 状态，且不依赖 availableBeasts 引用
  useEffect(() => {
    if (!canDraw) return;
    if (resultFace) return;
    if (phase !== 'idle') return;
    setPhase('drawing');
    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null;
      const face = slots[Math.floor(Math.random() * slots.length)]?.face;
      if (face) onDraw(face);
    }, 900);
    return () => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [canDraw, resultFace, phase, slots, onDraw]);

  // resultFace 出现后翻牌并最终回调
  useEffect(() => {
    if (!resultFace) return;
    setPhase('revealing');
    // 在当前 slots 中按 id 找到对应的 slot；slot 已经 shuffle 过了
    const target = slots.find((s) => s.face === resultFace);
    if (target) {
      // 翻牌前先等 200ms 让"翻牌动作"开始有明显动作
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        setRevealedId(target.id);
      }, 150);
    } else {
      setRevealedId(null);
    }
    resultTimerRef.current = window.setTimeout(() => {
      resultTimerRef.current = null;
      setPhase('done');
      onAnimationComplete();
    }, 1900);
    return () => {
      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      if (resultTimerRef.current) {
        window.clearTimeout(resultTimerRef.current);
        resultTimerRef.current = null;
      }
    };
  }, [resultFace, slots, onAnimationComplete]);

  // 人类点击抽卡：抽出后强制走 resultFace 流程
  const handlePick = useCallback(
    (slot: FaceSlot) => {
      if (!canDraw || resultFace || phase !== 'idle') return;
      setPhase('drawing');
      onDraw(slot.face);
    },
    [canDraw, resultFace, phase, onDraw]
  );

  const drawn = useMemo(() => rolledFaces.join(' '), [rolledFaces]);

  return (
    <div className="dice-draw">
      <div className="dice-title">{loserName} 抽取神兽</div>
      <div className={`dice-card-grid phase-${phase}`}>
        {slots.map((slot) => {
          const isRevealed = revealedId === slot.id && !!resultFace;
          const locked = !!resultFace;
          return (
            <button
              key={slot.id}
              type="button"
              className={`dice-card${isRevealed ? ' revealed' : ''}${locked ? ' locked' : ''}`}
              disabled={locked || !canDraw}
              onClick={() => handlePick(slot)}
            >
              <span className="dice-card-face">{slot.face}</span>
              <span className="dice-card-back">?</span>
            </button>
          );
        })}
      </div>
      {resultFace && (
        <div className={`dice-result ${resultFace === DEATH_FACE ? 'is-death' : 'is-life'} phase-${phase}`}>
          结果：
          <span className="dice-result-text">
            {resultFace}
            {resultFace === DEATH_FACE ? ' · 死亡' : ' · 存活'}
          </span>
        </div>
      )}
      {drawn && (
        <div className="dice-rolled">已抽：{drawn}</div>
      )}
    </div>
  );
}
