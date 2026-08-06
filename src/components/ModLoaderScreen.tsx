import { useRef, useState } from 'react';
import { useGameStore } from '../store/game-store';
import { ModSlot } from '../core/mod/ui-slots';

interface ModLoaderScreenProps {
  /** 返回开始界面 */
  onBack: () => void;
}

type LoadedModLicense = string | { name: string; url?: string };

function formatLicense(license: LoadedModLicense): string {
  if (typeof license === 'string') return license;
  return license.name;
}

export function ModLoaderScreen({ onBack }: ModLoaderScreenProps) {
  const [modStatus, setModStatus] = useState<string | null>(null);
  const [projectUrl, setProjectUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadedMods = useGameStore((s) => s.loadedMods);
  const loadModFromString = useGameStore((s) => s.loadModFromString);
  const loadModFromUrl = useGameStore((s) => s.loadModFromUrl);
  const loadModProjectFromUrl = useGameStore((s) => s.loadModProjectFromUrl);
  const unloadMod = useGameStore((s) => s.unloadMod);
  const unloadAllMods = useGameStore((s) => s.unloadAllMods);

  const debugModLoaded = loadedMods.some((m) => m.id === 'debug');

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

  async function handleLoadProject() {
    const url = projectUrl.trim();
    if (!url) return;
    setModStatus(null);
    const entry = await loadModProjectFromUrl(url);
    if (entry && entry.errors.length === 0) {
      setModStatus(`✓ 已加载：${entry.name} v${entry.version}`);
    } else if (entry) {
      setModStatus(`✗ 加载失败：${entry.errors.join('；')}`);
    }
    setProjectUrl('');
  }

  function handleUnload(modId: string) {
    unloadMod(modId);
    setModStatus(null);
  }

  function handleUnloadAll() {
    unloadAllMods();
    setModStatus(null);
  }

  return (
    <div className="mod-loader-screen">
      <header className="mod-loader-header">
        <button type="button" className="btn-text" onClick={onBack}>
          ← 返回
        </button>
        <h1>异卷（模组）</h1>
        <span className="mod-loader-count">
          已加载 {loadedMods.length} 个
        </span>
      </header>

      <p className="mod-loader-hint">
        加载模组可向游戏中注入新能力、状态、机制。模组由 mod 作者维护，基座不预装任何模组。
        请查阅 <code>docs/MODDING.md</code> 了解 API、协议、编辑器配置与多文件工程结构。
      </p>

      {/* 模组自身可通过 mod-loader:actions 槽注入额外的「加载按钮」 */}
      <div className="mod-buttons">
        <ModSlot slot="mod-loader:actions" />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary">
          从本地 .mod 加载…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mod,.json"
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
          <button type="button" onClick={handleUnloadAll} className="btn-ghost">
            全部卸载
          </button>
        )}
      </div>

      <div className="mod-loader-project">
        <input
          type="text"
          value={projectUrl}
          onChange={(e) => setProjectUrl(e.target.value)}
          placeholder="从 URL 加载多文件 mod 工程（manifest URL）"
          className="mod-loader-project-input"
        />
        <button
          type="button"
          onClick={handleLoadProject}
          className="btn-secondary"
          disabled={!projectUrl.trim()}
        >
          加载
        </button>
      </div>

      {modStatus && <p className="mod-status">{modStatus}</p>}

      <section className="mod-list-section">
        {loadedMods.length === 0 ? (
          <p className="mod-list-empty">尚未加载任何模组。可以从本地 .mod 文件加载，或试试「加载调试 mod」。</p>
        ) : (
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
                    <div className="mod-meta">
                      {m.license && (
                        <span className="mod-license" title="开源协议">
                          📄 {formatLicense(m.license as LoadedModLicense)}
                        </span>
                      )}
                      {m.repo && (
                        <a
                          className="mod-repo"
                          href={m.repo}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          🔗 仓库
                        </a>
                      )}
                    </div>
                    <button type="button" className="btn-ghost" onClick={() => handleUnload(m.id)}>
                      卸载
                    </button>
                  </span>
                )}
                <ModSlot slot="mod-loader:mod-list" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

