import { useRef, useState } from 'react';
import type { PlayerConfig } from '../core/models/types';
import { HUMAN_ID, useGameStore } from '../store/game-store';
import { ModSlot } from '../core/mod/ui-slots';
import { ModLogPanel } from './ModLogPanel';

interface StartScreenProps {
  onStart: (configs: PlayerConfig[]) => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [playerCount, setPlayerCount] = useState(4);
  const [modStatus, setModStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadedMods = useGameStore((s) => s.loadedMods);
  const loadModFromString = useGameStore((s) => s.loadModFromString);
  const loadModFromUrl = useGameStore((s) => s.loadModFromUrl);
  const unloadMod = useGameStore((s) => s.unloadMod);
  const unloadAllMods = useGameStore((s) => s.unloadAllMods);

  const debugModLoaded = loadedMods.some((m) => m.id === 'debug');

  const configs: PlayerConfig[] = Array.from({ length: playerCount }, (_, i) => ({
    id: i === 0 ? HUMAN_ID : `p${i}`,
    name: i === 0 ? '玩家' : `AI ${i}`,
    isHuman: i === 0,
  }));

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

  async function handleLoadDebug() {
    setModStatus(null);
    const entry = await loadModFromUrl('/mods/debug.mod', 'debug.mod');
    if (!entry) {
      setModStatus('✗ 调试 mod 加载失败：网络错误');
      return;
    }
    if (entry.errors.length === 0) {
      setModStatus(`✓ 已加载调试 mod：${entry.name} v${entry.version}`);
    } else {
      setModStatus(`✗ 调试 mod 加载失败：${entry.errors.join('；')}`);
    }
  }

  return (
    <div className="start-screen">
      <h1>终焉酒馆</h1>
      <p>一局中式诡谲的卡牌博弈</p>

      <section className="mod-panel">
        <h2>异卷（模组）</h2>
        <p className="hint">
          加载模组可向游戏中注入新能力、状态、机制。模组由 mod 作者维护，基座不预装任何模组。
          请查阅 <code>docs/MODDING.md</code> 了解 API 与插槽。
        </p>

        {/* 模组自身可通过 start-screen:actions 槽注入额外的「加载按钮」 */}
        <div className="mod-buttons">
          <ModSlot slot="start-screen:actions" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">
            从本地 .mod 加载…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mod,.json,.md,text/markdown,text/plain,application/json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {!debugModLoaded && (
            <button
              type="button"
              onClick={handleLoadDebug}
              className="btn-ghost"
              title="加载随基座自带的 debug mod（含翻开牌/改手牌等调试能力）"
            >
              加载调试 mod
            </button>
          )}
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
                <ModSlot slot="start-screen:mod-list" />
              </li>
            ))}
          </ul>
        )}

        <div className="mod-log-startscreen">
          <ModLogPanel />
        </div>
      </section>

      <div className="start-options">
        <label>
          玩家人数：
          <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))}>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={() => onStart(configs)}>
          开始游戏
        </button>
      </div>
    </div>
  );
}
