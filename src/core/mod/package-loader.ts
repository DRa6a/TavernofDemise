// Mod 包加载器
// 负责：
//   1. 校验 JSON 格式
//   2. 校验 manifest 必填字段
//   3. 在 sandbox 中执行 script 字符串，把钩子与辅助函数挂到 exports
//   4. 把 hooks + package 包装成 GameMod 供 mod-loader 注册
//
// 本文件不依赖任何 mod 业务概念（echo / state / phase 等），完全是通用扩展。

import type { ModPackage, ModPackageLoadResult } from './package';
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

/**
 * 解析一段 JSON 文本为 ModPackage。失败时返回 errors 列表。
 */
export function parseModPackageJson(jsonText: string): ModPackageLoadResult {
  const errors: string[] = [];
  let pkg: ModPackage;
  try {
    const obj = JSON.parse(jsonText) as Partial<ModPackage>;
    pkg = obj as ModPackage;
  } catch (e) {
    return {
      package: undefined as unknown as ModPackage,
      hooks: {},
      errors: [`JSON 解析失败：${(e as Error).message}`],
    };
  }

  // magic + version
  if (pkg.format !== MOD_PACKAGE_MAGIC) {
    errors.push(`format 必须是 "${MOD_PACKAGE_MAGIC}"，当前为 ${JSON.stringify(pkg.format)}`);
  }
  if (pkg.formatVersion !== MOD_PACKAGE_VERSION) {
    errors.push(
      `formatVersion 必须是 ${MOD_PACKAGE_VERSION}，当前为 ${JSON.stringify(pkg.formatVersion)}`,
    );
  }

  // manifest
  const m: Partial<ModManifest> = pkg.manifest ?? {};
  if (!m.id) errors.push('manifest.id 缺失');
  if (!m.name) errors.push('manifest.name 缺失');
  if (!m.version) errors.push('manifest.version 缺失');

  // info / data / script 容错（缺省给空）
  pkg.info = typeof pkg.info === 'string' ? pkg.info : '';
  pkg.data = pkg.data ?? {};
  pkg.script = typeof pkg.script === 'string' ? pkg.script : '';
  pkg.assets = Array.isArray(pkg.assets) ? pkg.assets : [];

  // 执行 script
  const hooks: Record<string, unknown> = {};
  if (pkg.script.trim().length > 0) {
    try {
      Object.assign(hooks, runScript(pkg.script, errors));
    } catch (e) {
      errors.push(`script 执行失败：${(e as Error).message}`);
    }
  }

  return { package: pkg, hooks, errors };
}

function runScript(script: string, errors: string[]): Record<string, unknown> {
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

  // 验证钩子签名
  for (const hookName of KNOWN_HOOKS) {
    if (typeof exports[hookName] !== 'function' && typeof exports[hookName] !== 'undefined') {
      errors.push(`script: ${hookName} 必须为函数，得到 ${typeof exports[hookName]}`);
    }
  }

  return exports;
}

/** 把 parseModPackageJson 的结果组装成 GameMod */
export function buildModFromPackage(result: ModPackageLoadResult): GameMod | null {
  if (result.errors.length > 0) return null;
  const { package: pkg, hooks } = result;
  const m = pkg.manifest;
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    author: m.author,
    description: m.description,
    dependsOn: m.dependsOn,
    tags: m.tags,
    priority: m.priority,
    data: pkg.data,
    ...hooks,
  } as GameMod;
}

/** 一行调用：字符串 → GameMod 或 errors */
export function loadModPackageFromString(
  jsonText: string,
): { ok: true; mod: GameMod; pkg: ModPackage } | { ok: false; errors: string[] } {
  const r = parseModPackageJson(jsonText);
  if (r.errors.length > 0) return { ok: false, errors: r.errors };
  const mod = buildModFromPackage(r);
  if (!mod) return { ok: false, errors: ['组装 GameMod 失败'] };
  return { ok: true, mod, pkg: r.package };
}
