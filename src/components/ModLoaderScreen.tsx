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

/** 基座自带 mod（在 public/mods/ 下，运行时通过 URL 加载） */
const BUILTIN_MODS: Array<{ url: string; label: string; title: string }> = [
  {
    url: '/mods/debug.mod',
    label: '加载调试 mod',
    title: '加载随基座自带的 debug mod（含翻开牌/改手牌等调试能力）',
  },
  {
    url: '/mods/sample.mod',
    label: '加载示例 mod',
    title: '演示：单文件 mod，含 license / repo 字段',
  },
  {
    url: '/mods/echo-demo/manifest.json',
    label: '加载回响示例（多文件）',
    title: '演示：多文件 mod 工程，用 scriptPath 引用 ./script.js（先在同源部署）',
  },
];

export function ModLoaderScreen({ onBack }: ModLoaderScreenProps) {
  const [modStatus, setModStatus] = useState<string | null>(null);
  const [modUrl, setModUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadedMods = useGameStore((s) => s.loadedMods);
  const loadModFromUrl = useGameStore((s) => s.loadModFromUrl);
  const loadModFromText = useGameStore((s) => s.loadModFromText);
  const unloadMod = useGameStore((s) => s.unloadMod);
  const unloadAllMods = useGameStore((s) => s.unloadAllMods);

  function formatResult(label: string, entry: { name: string; version: string; errors: string[] }) {
    if (entry.errors.length === 0) {
      setModStatus(`✓ ${label}：${entry.name} v${entry.version}`);
    } else {
      setModStatus(`✗ ${label} 失败：${entry.errors.join('；')}`);
    }
  }

  async function handleLoadFromUrl(url: string, label: string) {
    setModStatus(null);
    const entry = await loadModFromUrl(url, label);
    formatResult(label, entry);
  }

  async function handleLoadFromUrlInput() {
    const url = modUrl.trim();
    if (!url) return;
    await handleLoadFromUrl(url, url);
    setModUrl('');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result ?? '');
      // baseUrl=null：file input 模式下不能跟随相对路径，若 manifest 用 scriptPath 会报清晰错误
      const entry = await loadModFromText(text, file.name, null);
      formatResult(file.name, entry);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => setModStatus(`✗ 读取文件失败`);
    reader.readAsText(file);
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
        <span className="mod-loader-count">已加载 {loadedMods.length} 个</span>
      </header>

      <p className="mod-loader-hint">
        加载模组可向游戏中注入新能力、状态、机制。模组由 mod 作者维护，基座不预装任何模组。
        请查阅 <code>docs/MODDING.md</code> 了解 API、协议、编辑器配置与多文件工程结构。
      </p>

      {/* 基座自带 mod 一键加载（不需要用户自己找路径） */}
      <div className="mod-buttons">
        {BUILTIN_MODS.map((m) => {
          const isLoaded = loadedMods.some(
            (x) => x.id && m.url.endsWith(`${x.id}.mod`) || m.url.includes(x.id),
          );
          return (
            <button
              key={m.url}
              type="button"
              onClick={() => handleLoadFromUrl(m.url, m.label)}
              className="btn-ghost"
              title={m.title}
              disabled={isLoaded}
            >
              {m.label}
            </button>
          );
        })}
        <ModSlot slot="mod-loader:actions" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary"
        >
          从本地 .mod 加载…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mod,.json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {loadedMods.length > 0 && (
          <button type="button" onClick={handleUnloadAll} className="btn-ghost">
            全部卸载
          </button>
        )}
      </div>

      <div className="mod-loader-project">
        <input
          type="text"
          value={modUrl}
          onChange={(e) => setModUrl(e.target.value)}
          placeholder="从 URL 加载 mod（单文件 .mod 或多文件 mod 工程的 manifest.json）"
          className="mod-loader-project-input"
        />
        <button
          type="button"
          onClick={handleLoadFromUrlInput}
          className="btn-secondary"
          disabled={!modUrl.trim()}
        >
          加载
        </button>
      </div>

      {modStatus && <p className="mod-status">{modStatus}</p>}

      <section className="mod-list-section">
        {loadedMods.length === 0 ? (
          <p className="mod-list-empty">尚未加载任何模组。可以点上方「加载示例 mod」「加载回响示例（多文件）」先试试。</p>
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
