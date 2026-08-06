// 模组日志面板
//
// 提供：
// 1. 日志级别切换（silent / error / warn / info / debug）
// 2. 历史日志列表（最多展示缓冲里全部条目，从 store 拿）
// 3. 清空按钮
//
// 通过 store 的 modLogLevel / modLogEntries / setModLogLevel / clearModLog
// 与 ModLoader 的 ModLogBuffer 通信——基座不再直接 console.log，UI 是日志的「消费者」。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/game-store';
import type { ModLogEntry, ModLogLevel } from '../core/mod/log';

const LEVELS: ModLogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];

const LEVEL_LABEL: Record<ModLogLevel, string> = {
  silent: '静默',
  error: '错误',
  warn: '警告',
  info: '信息',
  debug: '调试',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function formatEntry(entry: ModLogEntry): string {
  const tail = entry.args.length > 0 ? ` ${entry.args.join(' ')}` : '';
  return entry.args.length > 0 || entry.message.includes(' ') || entry.message.length > 0
    ? `${entry.message}${tail}`
    : entry.message;
}

export function ModLogPanel() {
  const [open, setOpen] = useState(false);
  const entries = useGameStore((s) => s.modLogEntries);
  const level = useGameStore((s) => s.modLogLevel);
  const setModLogLevel = useGameStore((s) => s.setModLogLevel);
  const clearModLog = useGameStore((s) => s.clearModLog);
  const listRef = useRef<HTMLUListElement>(null);

  // 实时滚动到底部
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries.length, open]);

  const count = entries.length;
  const summary = useMemo(() => {
    const byLevel: Record<ModLogLevel, number> = {
      silent: 0, error: 0, warn: 0, info: 0, debug: 0,
    };
    for (const e of entries) byLevel[e.level] += 1;
    return byLevel;
  }, [entries]);

  return (
    <div className="mod-log-panel">
      <button
        type="button"
        className="btn-text"
        onClick={() => setOpen((v) => !v)}
        title="模组加载器日志"
      >
        模组日志{count > 0 ? ` (${count})` : ''}
      </button>
      {open && (
        <div className="mod-log-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="mod-log-toolbar">
            <label className="mod-log-level">
              <span>级别</span>
              <select
                value={level}
                onChange={(e) => setModLogLevel(e.target.value as ModLogLevel)}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]} ({l})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-text"
              onClick={clearModLog}
              disabled={count === 0}
            >
              清空
            </button>
          </div>
          <div className="mod-log-summary">
            <span className="lvl-error">E {summary.error}</span>
            <span className="lvl-warn">W {summary.warn}</span>
            <span className="lvl-info">I {summary.info}</span>
            <span className="lvl-debug">D {summary.debug}</span>
          </div>
          {count === 0 ? (
            <div className="mod-log-empty">暂无日志</div>
          ) : (
            <ul className="mod-log-list" ref={listRef}>
              {entries.map((e, i) => (
                <li key={i} className={`mod-log-entry lvl-${e.level}`}>
                  <span className="mod-log-time">{formatTime(e.ts)}</span>
                  <span className="mod-log-source">{e.source}</span>
                  <span className="mod-log-msg">{formatEntry(e)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
