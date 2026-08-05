# 模组制作指南（旧版 .mod.md 解析器保留说明）

> ⚠️ **新 mod 请使用 `.mod` JSON 格式**：见 [`MODDING.md`](./MODDING.md)。
>
> 本文档仅保留作为「如何把旧版 .mod.md 源文件迁移到新 .mod 格式」的过渡参考。

---

## 0. 旧版 → 新版：迁移速查

旧版 `.mod.md` 用「YAML frontmatter + 章节 + JSON/TS 代码块」组织内容；新版 `.mod` 用**单一 JSON 信封**组织：

| 旧版 | 新版 |
|:---|:---|
| 文件顶 `---` 之间的 YAML | `manifest` 字段 |
| `## 数据` 章节的 ` ```json` 块 | `data` 字段 |
| 文件内所有 ` ```ts` 块 | `script` 字段（合并为一个字符串） |
| `## 机制` / `## 规则` 等自由文本 | `info` 字段（Markdown 字符串） |
| 解析器自动处理散落的代码 | 整文件一次解析 |

迁移示例（旧版 .mod.md → 新版 .mod）：

```jsonc
{
  "format": "tavern-mod",
  "formatVersion": 1,
  "manifest": {
    "id": "huixiang",
    "name": "异卷·回响",
    "version": "3.5.0",
    "author": "DRa6a,法厄同",
    "description": "引入「回响」机制"
  },
  "info": "# 异卷——回响\n\n（这里放原 .md 的所有自由文本说明）\n",
  "data": {
    "phases": [ /* 原 `## 数据` 里的 phases 块 */ ],
    "states": [ /* 原 states 块 */ ],
    "abilities": [ /* 原 echoes 块（字段名从 echoes 改为 abilities） */ ]
  },
  "script": "/* 原所有 `\\`\\`\\`ts` 块拼接为一个字符串 */"
}
```

> **字段名变更**：`echoes` → `abilities`（统一术语）

---

## 1. 旧版 .mod.md 文件结构（已弃用，仅供阅读历史 mod）

```markdown
---
mod-id: <string>          # 必填
mod-name: <string>        # 必填
version: <semver>         # 必填
author: <string>          # 可选
description: <string>     # 可选
depends-on:               # 可选
  - other-mod-id
tags:                     # 可选
  - 异卷
priority: <number>        # 可选
---

# 人类可读标题

## 机制
自由文本…

## 数据
```json
{
  "phases": [ ... ],
  "states": [ ... ],
  "echoes": [ ... ]
}
```

```ts
// 可选：钩子
onGameStart(state) { ... }
```
```

> 旧解析器仍在 `src/core/mod/parser.ts` 保留，但新 mod 应使用 `package.ts` / `package-loader.ts` 描述的 JSON 格式。

---

## 2. 与新版的差异

| 维度 | 旧版 .mod.md | 新版 .mod |
|:---|:---|:---|
| 格式 | Markdown + YAML + 散落代码块 | 单一 JSON 信封 |
| 校验 | 较宽松（容错解析） | 严格（`format` / `formatVersion` magic） |
| 脚本类型 | 多个 ` ```ts` 块 | 一个 `script` 字符串 |
| 资源 | 不支持 | `assets[]`（base64 内嵌） |
| 推荐 | ❌ 弃用 | ✅ |

---

## 3. 推荐的迁移步骤

1. 打开旧版 `.mod.md`
2. 提取 frontmatter → `manifest`
3. 提取 `## 数据` 的 json 块 → `data`（**`echoes` 改 `abilities`**）
4. 提取所有 ` ```ts` 块 → 拼接到 `script` 字符串
5. 提取自由文本（`## 机制` 等）→ `info`（Markdown）
6. 保存为 `xxx.mod`，加载验证

```ts
// 验证迁移
import { DefaultModLoader, loadModFromString } from '@/core/mod';
import raw from './huixiang.mod?raw';

const loader = new DefaultModLoader();
const result = loadModFromString(loader, raw, 'huixiang.mod');
console.log(result.ok, result.errors);
```

---

## 4. 路线图

- [x] 旧版 .mod.md 解析（`parser.ts`）
- [x] 新版 .mod JSON 加载（`package.ts` / `package-loader.ts`）
- [x] UI 槽注入（`api.ui.register`）
- [x] 通用 AbilityPanel 模板
- [x] MODDING.md API 文档
- [x] 把回响 mod 同步到 docs/回响.md
- [ ] UI 资源随 mod 加载（assets → `<link>`）
- [ ] mod 商店/启用开关
- [ ] 模组热加载（开发模式）

---

## 5. 已迁移 mod 索引

| 文件 | mod-id | 状态 |
|:---|:---|:---|
| [`回响.md`](../回响.md) | `huixiang` | ✅ 数据迁移到 `abilities`，辅助函数改名 `__drawAbilities` / `grantAbilities` |
