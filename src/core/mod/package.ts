// 模组包（.mod）格式定义
// 一个 .mod 文件是一个 JSON 信封，包含：
//   - manifest:  元数据（id、name、version 等）
//   - info:      人类可读的说明（Markdown）
//   - data:      注册到游戏的数据（卡牌 / 玩家状态 / 阶段 / 能力 / 自定义）
//   - script:    钩子与辅助函数（JavaScript 源代码字符串）
//   - assets:    可选资源（图标、背景等），UI 自行读取
//
// 选 JSON 而非真 zip/二进制的原因：
//   1. 浏览器/Node 都原生支持，无需新依赖；
//   2. "脚本 / 信息 / 数据" 三段已物理分离，满足可审计性；
//   3. 上层可再包一层 zip 形成 .mod.zip（暂未实现）。

import type { ModData, ModManifest, ModHooks } from './types';

/** 包格式版本号。base loader 仅加载兼容版本。 */
export const MOD_PACKAGE_VERSION = 1 as const;

/** 包格式标识。用于校验文件确实是一个 mod。 */
export const MOD_PACKAGE_MAGIC = 'tavern-mod' as const;

/** 包内资源项（可选，UI 自取） */
export interface ModPackageAsset {
  /** 资源路径，如 "icon.png" / "i18n/zh.json" */
  path: string;
  /** MIME 类型（可空，按扩展名推断） */
  mime?: string;
  /** base64 编码的内容（图片/二进制） */
  data: string;
  /** 纯文本资源可直接用 text 字段 */
  text?: string;
}

/**
 * 模组包：base loader 解析的根对象。
 * 通过 JSON.stringify 后写入 `.mod` 文件。
 *
 * 两种 script 写法（任选其一）：
 * - `script` 字段：把源码作为字符串内嵌进 JSON。简单、便于单文件分发。
 * - `scriptPath` 字段：相对 manifest 的 URL 引用一个 `.js` 文件。
 *   推荐——可以让作者用真 `.ts` / `.js` 文件写脚本（IDE 完整补全），
 *   再用 tsc/esbuild 等构建出 `.js` 后跟 manifest 一起发布。
 *   两者都存在时优先用 `script`。
 */
export interface ModPackage {
  /** 必须为 MOD_PACKAGE_MAGIC，用于快速识别 */
  format: typeof MOD_PACKAGE_MAGIC;
  /** 包格式版本 */
  formatVersion: typeof MOD_PACKAGE_VERSION;
  /** 元数据 */
  manifest: ModManifest;
  /** 人类可读说明（Markdown 文本） */
  info: string;
  /** 注册到游戏的结构化数据 */
  data: ModData;
  /** 钩子与辅助函数源码（JavaScript 字符串），与 scriptPath 二选一 */
  script: string;
  /**
   * 可选：相对 manifest URL 的 script 文件路径（如 "./dist/script.js"）。
   * 仅当从 URL 加载 mod 时有效；浏览器里通过 `<input type="file">` 选文件时
   * 无法跟随路径，所以本地分发请把 `script` 内嵌进来。
   */
  scriptPath?: string;
  /** 可选资源 */
  assets?: ModPackageAsset[];
}

/** 加载结果 */
export interface ModPackageLoadResult {
  package: ModPackage;
  /** 解析得到的钩子（从 script 求值而来） */
  hooks: Partial<ModHooks> & Record<string, unknown>;
  errors: string[];
}
