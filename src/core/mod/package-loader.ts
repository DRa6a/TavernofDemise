// Mod 包加载器
// 负责：
//   1. 校验 JSON 格式
//   2. 校验 manifest 必填字段
//   3. 在 sandbox 中执行 script 字符串，把钩子与辅助函数挂到 exports
//   4. 把 hooks + package 包装成 GameMod 供 mod-loader 注册
//
// 本文件不依赖任何 mod 业务概念（echo / state / phase 等），完全是通用扩展。
//
// 加载入口（统一）：
//   - loadModPackage({ text, baseUrl? })   ← 核心解析器，所有入口走它
//   - loadModPackageFromText(text, baseUrl?) ← 便捷：纯文本（file input 用）
//   - loadModPackageFromUrl(url)            ← 便捷：HTTP 抓 manifest

import type { ModPackage } from './package';
import { MOD_PACKAGE_MAGIC, MOD_PACKAGE_VERSION } from './package';
import type { GameMod, ModHooks, ModManifest } from './types';

const KNOWN_HOOKS: (keyof ModHooks)[] = [
  'onRegister',
  'onBeforeGameStart',
  'onGameStart',
  'onBeforeElection',
  'onBeforeDraw',
  'onAfterDraw',
  'onBeforePlay',
  'onAfterPlay',
  'onBeforeOpen',
  'onAfterOpen',
  'onBeforeLifeDeath',
  'onAfterLifeDeath',
  'onPlayerDied',
  'onPlayerRevived',
  'onBigRoundStart',
  'onBigRoundEnd',
];

export interface LoadModPackageOptions {
  /** 模组 manifest 文本（必填） */
  text: string;
  /**
   * 模组 manifest 的「基址」URL。
   * - 提供时：若 manifest.script 为空且声明了 scriptPath，会按 baseUrl 拼出绝对 URL
   *   去 fetch 外部脚本（多文件 mod 工程的标准加载方式）。
   * - 省略/null：从 <input type="file"> 选文件时，浏览器无法跟随相对路径。
   *   这种情况下若 manifest.script 为空，会返回明确错误提示作者内联 script。
   */
  baseUrl?: string | null;
  /**
   * 自定义抓取器（默认 `fetch`）。测试或离线环境可注入。
   */
  fetchImpl?: typeof fetch;
}

export interface LoadModPackageResult {
  ok: boolean;
  mod?: GameMod;
  pkg?: ModPackage;
  errors: string[];
}

/**
 * 核心入口：解析一份 manifest 文本，得到 GameMod。
 * 所有加载路径（URL、file input、字符串）最终都走这里。
 */
export async function loadModPackage(
  opts: LoadModPackageOptions,
): Promise<LoadModPackageResult> {
  const errors: string[] = [];

  // 1) 解析 manifest
  let pkg: ModPackage;
  try {
    const obj = JSON.parse(opts.text) as Partial<ModPackage>;
    pkg = obj as ModPackage;
  } catch (e) {
    return { ok: false, errors: [`JSON 解析失败：${(e as Error).message}`] };
  }

  // 2) 校验 magic / version / 必填 manifest 字段
  if (pkg.format !== MOD_PACKAGE_MAGIC) {
    errors.push(`format 必须是 "${MOD_PACKAGE_MAGIC}"，当前为 ${JSON.stringify(pkg.format)}`);
  }
  if (pkg.formatVersion !== MOD_PACKAGE_VERSION) {
    errors.push(
      `formatVersion 必须是 ${MOD_PACKAGE_VERSION}，当前为 ${JSON.stringify(pkg.formatVersion)}`,
    );
  }
  const m: Partial<ModManifest> = pkg.manifest ?? {};
  if (!m.id) errors.push('manifest.id 缺失');
  if (!m.name) errors.push('manifest.name 缺失');
  if (!m.version) errors.push('manifest.version 缺失');

  if (errors.length > 0) {
    return { ok: false, pkg, errors };
  }

  // 3) 容错补全可选字段
  pkg.info = typeof pkg.info === 'string' ? pkg.info : '';
  pkg.data = pkg.data ?? {};
  pkg.script = typeof pkg.script === 'string' ? pkg.script : '';
  pkg.assets = Array.isArray(pkg.assets) ? pkg.assets : [];

  // 4) 决定最终 script 来源
  let script = pkg.script;
  const scriptPath = typeof pkg.scriptPath === 'string' ? pkg.scriptPath.trim() : '';

  if ((!script || script.trim() === '') && scriptPath) {
    if (!opts.baseUrl) {
      errors.push(
        'mod 既无内联 script、又声明了 scriptPath，但加载时未提供 baseUrl。' +
          '浏览器无法跟随本地文件相对路径——请把 script 内联进 manifest，或通过 HTTP URL 加载。',
      );
      return { ok: false, pkg, errors };
    }
    try {
      const scriptUrl = new URL(scriptPath, opts.baseUrl).toString();
      const fetchFn = opts.fetchImpl ?? fetch;
      const res = await fetchFn(scriptUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      script = await res.text();
    } catch (e) {
      return {
        ok: false,
        pkg,
        errors: [`抓取 script 失败（${scriptPath}）：${(e as Error).message}`],
      };
    }
  }

  if (!script || script.trim() === '') {
    return {
      ok: false,
      pkg,
      errors: ['mod 既无 script 也无 scriptPath（或两者都为空）'],
    };
  }

  // 5) 在 sandbox 中执行 script，挂到 exports
  const hooks: Record<string, unknown> = {};
  try {
    Object.assign(hooks, runScript(script));
  } catch (e) {
    return { ok: false, pkg, errors: [`script 执行失败：${(e as Error).message}`] };
  }

  // 6) 校验钩子签名
  for (const hookName of KNOWN_HOOKS) {
    if (typeof hooks[hookName] !== 'function' && typeof hooks[hookName] !== 'undefined') {
      errors.push(`script: ${hookName} 必须为函数，得到 ${typeof hooks[hookName]}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, pkg, errors };
  }

  // 7) 组装 GameMod
  const mod: GameMod = {
    id: m.id!,
    name: m.name!,
    version: m.version!,
    author: m.author,
    description: m.description,
    dependsOn: m.dependsOn,
    tags: m.tags,
    priority: m.priority,
    data: pkg.data,
    ...hooks,
  } as GameMod;

  return { ok: true, mod, pkg, errors: [] };
}

/** 便捷：纯文本入口（file input 用） */
export function loadModPackageFromText(
  text: string,
  baseUrl?: string | null,
): Promise<LoadModPackageResult> {
  return loadModPackage({ text, baseUrl: baseUrl ?? null });
}

/**
 * 便捷：URL 入口（HTTP/HTTPS 静态服务器用）。
 * 先抓 manifest，再以 manifest URL 为 baseUrl 解析 scriptPath。
 */
export async function loadModPackageFromUrl(manifestUrl: string): Promise<LoadModPackageResult> {
  let text: string;
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (e) {
    return { ok: false, errors: [`抓取 manifest 失败：${(e as Error).message}`] };
  }
  return loadModPackage({ text, baseUrl: manifestUrl });
}

function runScript(script: string): Record<string, unknown> {
  // 预转换：把 TypeScript 方法简写 `name(args) {` 转为 `function name(args) {`
  const knownPattern = KNOWN_HOOKS.join('|');
  const transformed = script.replace(
    new RegExp(`(^|\\n)\\s*(${knownPattern})\\s*\\(([^)]*)\\)\\s*\\{`, 'g'),
    (_m, prefix, name, args) => `${prefix}function ${name}(${args}) {`,
  );

  // 扫描顶层声明
  const names = new Set<string>();
  const fnDeclRe = /(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const varDeclRe = /(?:^|\n)\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = fnDeclRe.exec(transformed)) !== null) names.add(m[1]);
  while ((m = varDeclRe.exec(transformed)) !== null) names.add(m[1]);

  // 把顶层声明拷到 exports
  const tail = Array.from(names)
    .map((k) => `try { exports[${JSON.stringify(k)}] = ${k}; } catch (_) {}`)
    .join('\n');

  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function('exports', transformed + '\n' + tail);
  const exports: Record<string, unknown> = {};
  factory(exports);

  return exports;
}
