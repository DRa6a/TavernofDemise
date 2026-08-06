// 模组系统统一出口
// 基座只暴露「扩展点 + 类型 + 加载器」。任何具体 mod（回响、技能、道具、灵咒…）
// 都由外部 .mod 文件提供，**不在基座源代码中**。
export * from './types';
export * from './registry';
export * from './api';
export * from './mod-loader';
export * from './package';
export * from './package-loader';
export * from './log';
// 旧版 .mod.md 解析器保留为内部兼容入口（不再推荐使用）
export { parseModFile } from './parser';
