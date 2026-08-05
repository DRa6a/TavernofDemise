import { useRef, useState } from 'react';
import type { PlayerConfig } from '../core/models/types';
import { HUMAN_ID, useGameStore } from '../store/game-store';

interface StartScreenProps {
  onStart: (configs: PlayerConfig[]) => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [playerCount, setPlayerCount] = useState(4);
  const [modStatus, setModStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadedMods = useGameStore((s) => s.loadedMods);
  const loadModFromUrl = useGameStore((s) => s.loadModFromUrl);
  const loadModFromString = useGameStore((s) => s.loadModFromString);
  const unloadMod = useGameStore((s) => s.unloadMod);
  const unloadAllMods = useGameStore((s) => s.unloadAllMods);

  const configs: PlayerConfig[] = Array.from({ length: playerCount }, (_, i) => ({
    id: i === 0 ? HUMAN_ID : `p${i}`,
    name: i === 0 ? '玩家' : `AI ${i}`,
    isHuman: i === 0,
  }));

  async function loadBundled() {
    setModStatus('正在加载「异卷·回响」…');
    const entry = await loadModFromUrl('/mods/回响.md', 'docs/回响.md');
    if (entry && entry.errors.length === 0) {
      setModStatus(`✓ 已加载：${entry.name} v${entry.version}`);
    } else {
      setModStatus(`✗ 加载失败：${entry?.errors.join('；') ?? '未知错误'}`);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const entry = loadModFromString(text, file.name);
      if (entry.errors.length === 0) {
        setModStatus(`✓ 已加载：${entry.name} v${entry.version}`);
      } else {
        setModStatus(`✗ 加载失败：${entry.errors.join('；')}`);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => setModStatus(`✗ 读取文件失败`);
    reader.readAsText(file);
  }

  return (
    <div className="start-screen">
      <h1>终焉酒馆</h1>
      <p>一局中式诡谲的卡牌博弈</p>

      <section className="mod-panel">
        <h2>异卷（模组）</h2>
        <p className="hint">加载模组可向游戏中注入新回响、状态、机制。当前随包附带 <code>异卷·回响</code>。</p>
        <div className="mod-buttons">
          <button type="button" onClick={loadBundled} className="btn-secondary">
            加载「异卷·回响」
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">
            从本地 .mod.md 加载…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,text/markdown,text/plain"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {loadedMods.length > 0 && (
            <button type="button" onClick={unloadAllMods} className="btn-ghost">
              全部卸载
            </button>
          )}
        </div>

        {modStatus && <p className="mod-status">{modStatus}</p>}

        {loadedMods.length > 0 && (
          <ul className="mod-list">
            {loadedMods.map((m, i) => (
              <li key={m.id || `${m.name}-${i}`} className={m.errors.length ? 'mod-err' : 'mod-ok'}>
                {m.errors.length ? (
                  <span>
                    <strong>✗ {m.name}</strong>
                    <br />
                    <small>{m.errors.join('；')}</small>
                  </span>
                ) : (
                  <span>
                    <strong>✓ {m.name}</strong> <small>v{m.version}</small>
                    {m.author && <small> · {m.author}</small>}
                    {m.description && <p className="mod-desc">{m.description}</p>}
                    <button type="button" className="btn-ghost" onClick={() => unloadMod(m.id)}>
                      卸载
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
