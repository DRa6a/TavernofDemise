// 解析 .mod.md 文件：YAML frontmatter + 章节 + JSON 代码块
// 一个 mod 文件的格式：
//
// ---
// mod-id: xxx
// mod-name: xxx
// ...
// ---
//
// # 标题
//
// ## 机制
// 自由文本描述
//
// ## 数据
// ```json
// { ... }
// ```
//
// ## 规则
// 自由文本描述
//
// 钩子（onGameStart 等）以 TypeScript 代码块形式提供：
// ```ts
// onGameStart(state) { ... }
// ```
import type {
  EchoDefinition,
  GameMod,
  ModData,
  ModLoadResult,
  ModManifest,
  PhaseDefinition,
  PlayerStateEffect,
} from './types';

// ────────────────────────────────────────────────────────────
// 简易 YAML 解析（仅支持 mod manifest 所需子集）
// ────────────────────────────────────────────────────────────

/**
 * 极简 YAML 解析器，支持：
 * - `key: value` 标量
 * - `key:` 后跟缩进列表项 `- item`
 * - `#` 注释
 * - 字符串（无引号或单/双引号）
 * - 数字、布尔、null
 */
function parseYaml(input: string): Record<string, unknown> {
  const lines = input.split(/\r?\n/);
  const root: Record<string, unknown> = {};
  let i = 0;

  function isListItem(s: string): boolean {
    return /^\s*-\s+/.test(s);
  }

  function getIndent(s: string): number {
    const m = /^( *)/.exec(s);
    return m ? m[1].length : 0;
  }

  function parseScalar(raw: string): unknown {
    const s = raw.trim();
    if (s === '' || s === '~' || s === 'null') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    // 去除两端引号
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/#.*$/, '').replace(/\s+$/, '');
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i += 1;
      continue;
    }

    const key = m[1];
    const rest = m[2];
    i += 1;

    if (rest === '') {
      // 可能是列表或嵌套对象；先看后续行
      const childIndent = getIndent(lines[i] ?? '');
      const childItems: unknown[] = [];
      const childObj: Record<string, unknown> = {};
      let isList = false;
      while (i < lines.length) {
        const childRaw = lines[i].replace(/#.*$/, '').replace(/\s+$/, '');
        if (!childRaw.trim()) {
          i += 1;
          continue;
        }
        if (getIndent(childRaw) < childIndent) break;
        if (isListItem(childRaw)) {
          isList = true;
          const item = childRaw.replace(/^\s*-\s+/, '').trim();
          childItems.push(parseScalar(item));
          i += 1;
        } else if (getIndent(childRaw) === childIndent) {
          const cm = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(childRaw);
          if (cm) {
            if (isList) break;
            childObj[cm[1]] = parseScalar(cm[2]);
            i += 1;
          } else {
            break;
          }
        } else {
          i += 1;
        }
      }
      root[key] = isList ? childItems : (Object.keys(childObj).length > 0 ? childObj : '');
    } else {
      root[key] = parseScalar(rest);
    }
  }
  return root;
}

// ────────────────────────────────────────────────────────────
// frontmatter 解析
// ────────────────────────────────────────────────────────────

function extractFrontmatter(raw: string): { manifest: Partial<ModManifest>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { manifest: {}, body: raw };
  const yamlRaw = m[1];
  const body = m[2];
  const parsed = parseYaml(yamlRaw);
  return {
    manifest: {
      id: typeof parsed['mod-id'] === 'string' ? (parsed['mod-id'] as string) : undefined,
      name: typeof parsed['mod-name'] === 'string' ? (parsed['mod-name'] as string) : undefined,
      version: typeof parsed.version === 'string' ? (parsed.version as string) : undefined,
      author: typeof parsed.author === 'string' ? (parsed.author as string) : undefined,
      description: typeof parsed.description === 'string' ? (parsed.description as string) : undefined,
      dependsOn: Array.isArray(parsed['depends-on']) ? (parsed['depends-on'] as string[]) : undefined,
      tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : undefined,
      priority: typeof parsed.priority === 'number' ? (parsed.priority as number) : undefined,
    },
    body,
  };
}

// ────────────────────────────────────────────────────────────
// 章节提取
// ────────────────────────────────────────────────────────────

function extractSection(body: string, heading: string): string | undefined {
  // 匹配 `^## 标题` 之后直到下一个 `## ` 之前
  // 允许标题前有「一、二、」之类的中文编号或空白
  const re = new RegExp(
    `^##\\s*(?:[\\u4e00-\\u9fff]+[、，,\\.]\\s*)?${heading}\\s*\\r?\\n([\\s\\S]*?)(?=^##\\s+|\\Z)`,
    'm',
  );
  const m = re.exec(body);
  return m ? m[1].trim() : undefined;
}

function extractCodeBlocks(text: string, lang?: string): Array<{ lang: string; code: string }> {
  const re = lang
    ? new RegExp(`\`\`\`${lang}\\s*\\n([\\s\\S]*?)\\n\`\`\``, 'g')
    : /```(\w*)\s*\n([\s\S]*?)\n```/g;
  const blocks: Array<{ lang: string; code: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (lang) {
      blocks.push({ lang, code: m[1] });
    } else {
      blocks.push({ lang: m[1] ?? '', code: m[2] });
    }
  }
  return blocks;
}

// ────────────────────────────────────────────────────────────
// 主解析函数
// ────────────────────────────────────────────────────────────

/**
 * 解析单个 mod 文件的原始内容，生成 GameMod。
 * 失败时返回 ModLoadResult（含 errors），不抛异常。
 */
export function parseModFile(raw: string, source: string = '<inline>'): ModLoadResult {
  const errors: string[] = [];
  const { manifest: mf, body } = extractFrontmatter(raw);

  // 校验必填字段
  if (!mf.id) errors.push('缺少 mod-id');
  if (!mf.name) errors.push('缺少 mod-name');
  if (!mf.version) errors.push('缺少 version');

  // 提取数据章节
  const dataSection = extractSection(body, '数据') ?? extractSection(body, 'Data');
  // 「规则」与「机制」章节作为自由文本说明保留在 manifest.description 或原始 body 中，
  // 当前解析器不消费它们，但保留章节以方便作者按规范书写。

  // 从 data 章节解析 JSON
  // 支持：1) 单个 json 块包含完整 ModData；2) 多个 json 块各自为 phases / states / echoes 等子集
  let data: ModData | undefined;
  if (dataSection) {
    const blocks = extractCodeBlocks(dataSection, 'json');
    if (blocks.length === 0) {
      errors.push('「数据」章节未发现 ```json 代码块');
    } else {
      // 先尝试合并解析（最常见的写法）
      const merged = blocks.map((b) => b.code).join('\n');
      let parsed: ModData | null = null;
      try {
        parsed = JSON.parse(merged) as ModData;
      } catch {
        // 合并失败则尝试逐块解析并合并字段
        const acc: ModData = {};
        let anyOk = false;
        let lastErr: string | undefined;
        for (const b of blocks) {
          try {
            const obj = JSON.parse(b.code) as ModData;
            anyOk = true;
            if (obj.echoes) acc.echoes = (acc.echoes ?? []).concat(obj.echoes);
            if (obj.states) acc.states = (acc.states ?? []).concat(obj.states);
            if (obj.phases) acc.phases = (acc.phases ?? []).concat(obj.phases);
            if (obj.cards) acc.cards = (acc.cards ?? []).concat(obj.cards);
            if (obj.custom) acc.custom = { ...(acc.custom ?? {}), ...obj.custom };
          } catch (e) {
            lastErr = (e as Error).message;
          }
        }
        if (anyOk) {
          parsed = acc;
        } else {
          errors.push(`「数据」章节 JSON 解析失败：${lastErr ?? '未知错误'}`);
        }
      }
      data = parsed ?? undefined;
    }
  }

  // 从 TypeScript 代码块提取钩子（可选）
  // 支持 TypeScript 方法简写（`onFoo(state) { ... }`）与显式赋值
  // (`exports.onFoo = function(state) { ... }`)，通过预转换保证可被 `new Function` 求值
  const tsBlocks = extractCodeBlocks(body, 'ts');
  const tsContext: {
    onBeforeGameStart?: (state: unknown) => void;
    onGameStart?: (state: unknown) => void;
    onBeforeElection?: (state: unknown) => void;
    onBeforeDraw?: (state: unknown) => void;
    onAfterDraw?: (state: unknown) => void;
    onBeforePlay?: (state: unknown, p: unknown, ids: string[]) => void;
    onAfterPlay?: (state: unknown, p: unknown, cards: unknown[]) => void;
    onBeforeOpen?: (state: unknown) => void;
    onAfterOpen?: (state: unknown, isFake: boolean) => void;
    onBeforeLifeDeath?: (state: unknown, loser: unknown) => void;
    onAfterLifeDeath?: (state: unknown, loser: unknown, survived: boolean) => void;
    onPlayerDied?: (state: unknown, p: unknown) => void;
    onPlayerRevived?: (state: unknown, p: unknown) => void;
    onBigRoundStart?: (state: unknown, round: number) => void;
    onBigRoundEnd?: (state: unknown, round: number) => void;
    [k: string]: unknown;
  } = {};

  if (tsBlocks.length > 0 && typeof Function === 'function') {
    try {
      // 将所有 ts 代码块合并到一个 sandbox 中执行
      const code = tsBlocks.map((b) => b.code).join('\n\n');
      // 预转换：把 TypeScript 方法简写 `name(args) { body }` 转为 `function name(args) { body }`
      const knownHooks = [
        'onBeforeGameStart', 'onGameStart', 'onBeforeElection', 'onBeforeDraw', 'onAfterDraw',
        'onBeforePlay', 'onAfterPlay', 'onBeforeOpen', 'onAfterOpen',
        'onBeforeLifeDeath', 'onAfterLifeDeath', 'onPlayerDied', 'onPlayerRevived',
        'onBigRoundStart', 'onBigRoundEnd',
      ];
      const transformed = code.replace(
        new RegExp(`(^|\\n)\\s*(${knownHooks.join('|')})\\s*\\(([^)]*)\\)\\s*\\{`, 'g'),
        (_m, prefix, name, args) => `${prefix}function ${name}(${args}) {`,
      );
      // 抓取所有顶层 `function name(...)` 和 `var name = ...` 的标识符
      const names = new Set<string>();
      const fnDeclRe = /(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = fnDeclRe.exec(transformed)) !== null) {
        names.add(m[1]);
      }
      const varDeclRe = /(?:^|\n)\s*var\s+([A-Za-z_$][\w$]*)\s*=/g;
      while ((m = varDeclRe.exec(transformed)) !== null) {
        names.add(m[1]);
      }
      // 在末尾把所有顶层声明拷到 exports
      const tail = Array.from(names)
        .map((k) => `try { exports[${JSON.stringify(k)}] = ${k}; } catch (_) {}`)
        .join('\n');
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const factory = new Function('exports', 'state', 'player', 'cards', transformed + '\n' + tail);
      const exports: Record<string, unknown> = {};
      factory(exports, undefined, undefined, undefined);
      const knownSet = new Set(knownHooks);
      for (const k of knownHooks) {
        if (typeof exports[k] === 'function') {
          (tsContext as Record<string, unknown>)[k] = exports[k];
        }
      }
      // 同时把其它导出（如辅助 API、工具函数）也带回 mod 对象
      for (const [k, v] of Object.entries(exports)) {
        if (knownSet.has(k)) continue;
        (tsContext as Record<string, unknown>)[k] = v;
      }
    } catch (e) {
      errors.push(`TS 钩子代码块解析失败：${(e as Error).message}`);
    }
  }

  if (errors.length > 0) {
    return {
      manifest: mf as ModManifest,
      raw,
      source,
      errors,
    };
  }

  // 验证 data 内部 schema
  if (data) {
    if (data.echoes) {
      for (const e of data.echoes) {
        validateEcho(e, errors);
      }
    }
    if (data.states) {
      for (const s of data.states) {
        validateState(s, errors);
      }
    }
    if (data.phases) {
      for (const p of data.phases) {
        validatePhase(p, errors);
      }
    }
  }

  if (errors.length > 0) {
    return { manifest: mf as ModManifest, raw, source, errors };
  }

  const mod: GameMod = {
    id: mf.id!,
    name: mf.name!,
    version: mf.version!,
    author: mf.author,
    description: mf.description,
    dependsOn: mf.dependsOn,
    tags: mf.tags,
    priority: mf.priority,
    data,
    ...tsContext,
  };

  return { manifest: mf as ModManifest, raw, source, errors: [], mod };
}

function validateEcho(e: Partial<EchoDefinition>, errors: string[]): void {
  if (!e.id) errors.push(`回响缺少 id`);
  if (!e.name) errors.push(`回响 ${e.id ?? '(?)'} 缺少 name`);
  if (!e.shortName) errors.push(`回响 ${e.id ?? '(?)'} 缺少 shortName`);
  if (typeof e.maxUses !== 'number') errors.push(`回响 ${e.id ?? '(?)'} 缺少 maxUses`);
  if (!e.trigger) errors.push(`回响 ${e.id ?? '(?)'} 缺少 trigger`);
}

function validateState(s: Partial<PlayerStateEffect>, errors: string[]): void {
  if (!s.id) errors.push(`状态缺少 id`);
  if (!s.name) errors.push(`状态 ${s.id ?? '(?)'} 缺少 name`);
  if (!s.duration) errors.push(`状态 ${s.id ?? '(?)'} 缺少 duration`);
}

function validatePhase(p: Partial<PhaseDefinition>, errors: string[]): void {
  if (!p.id) errors.push(`阶段缺少 id`);
  if (!p.name) errors.push(`阶段 ${p.id ?? '(?)'} 缺少 name`);
  if (!p.insertAt) errors.push(`阶段 ${p.id ?? '(?)'} 缺少 insertAt`);
  if (typeof p.blocking !== 'boolean') errors.push(`阶段 ${p.id ?? '(?)'} 缺少 blocking`);
}
