# 终焉酒馆 · 模组开发指南

> 给**模组作者**的完整指南。读完你能用一份 `manifest.json` + 一个真 `.ts` 文件写出带 IDE 补全的 mod。
>
> 适用版本：`formatVersion: 1`（当前唯一支持版本）

---

## 目录

| # | 章节 | 你会学到 |
|:--:|:--|:--|
| 0 | [30 秒上手](#0-30-秒上手) | 复制示例 → 改两行 → 跑起来 |
| 1 | [这是什么 / 不是什么](#1-这是什么--不是什么) | mod 的能力边界 |
| 2 | [三种开发模式](#2-三种开发模式) | 选最合适的一种 |
| 3 | [加载方式](#3-加载方式) | 5 个入口怎么用 |
| 4 | [manifest 字段全解](#4-manifest-字段全解) | 必填、可选、协议 |
| 5 | [data：注册静态数据](#5-data注册静态数据) | abilities / states / phases / cards |
| 6 | [script 与 setup(api)](#6-script-与-setupapi) | 写 mod 代码 |
| 7 | [编辑器配置：拿到完整类型补全](#7-编辑器配置拿到完整类型补全) | TS 工程化 |
| 8 | [生命周期钩子](#8-生命周期钩子) | 介入游戏关键时刻 |
| 9 | [UI 注入槽一览](#9-ui-注入槽一览) | 9 个挂载点 |
| 10 | [选一个开源协议](#10-选一个开源协议) | 协议决策 |
| 11 | [调试与故障排查](#11-调试与故障排查) | 错误速查 + 复现日志 |
| 12 | [打包与发布](#12-打包与发布) | 发到 GitHub Pages |
| 13 | [完整示例：异卷·回响](#13-完整示例异卷回响) | 实战参考 |
| 14 | [API 速查](#14-api-速查) | 复制粘贴用 |

---

## 0. 30 秒上手

> 嫌长直接照搬这段，5 分钟跑通。

```bash
# 1. 复制示例工程
cp -r public/mods/echo-demo  my-mod && cd my-mod

# 2. 改两处信息
$EDITOR manifest.json   # 改 id / name / license
$EDITOR script.ts        # 写 setup(api)

# 3. 编译并起一个 HTTP 服务器
npx tsc
npx http-server -p 8000  # 或 python -m http.server 8000
```

打开基座（通常是 `http://localhost:5173`）→ **管理模组…** → **从 URL 加载** → 贴 `http://localhost:8000/manifest.json` → 完成。

剩下的章节解释每一步**为什么**这样写，以及怎么改、怎么调试。

---

## 1. 这是什么 / 不是什么

**模组（mod）= 一份 JSON 元数据 + 一段 JavaScript 脚本**。基座加载 mod 时会：

1. 读取 `manifest`（id / name / license / 静态数据）
2. 在沙箱里跑 `script` 字段里的 JS
3. JS 通过 `api` 对象向游戏注册能力、状态、UI、生命周期钩子

> **mod 不是浏览器插件**。基座是普通网页，mod 跑在 `new Function` 沙箱里，能做的只有「往游戏状态里加东西、改东西、注入 UI」——碰不到 DOM 全局、碰不到 localStorage 之外的浏览器 API。

能做什么 / 不能做什么：

| 能 | 不能 |
|:--|:--|
| 注册能力 / 玩家状态 / 阶段 / 卡牌 | 修改基座 UI 的核心 DOM |
| 监听 16 个生命周期钩子 | 访问 localStorage / cookies |
| 往 9 个 UI 槽里塞 React 元素 | `fetch` 任意外部 URL（仅允许同源 manifest + scriptPath） |
| 读写当前 `GameState` 副本 | 持续在后台运行（mod 卸载即停） |
| 调用 `api.log.*` 写日志 | 弹原生 `alert`/`confirm`（请用 UI 槽） |

---

## 2. 三种开发模式

基座支持三种 mod 形态，按需选：

| 模式 | 文件 | 编辑器补全 | 加载方式 | 适合 |
|:---|:---|:---:|:---|:---|
| **单文件** | `hello.mod`（JSON） | ❌ | 选文件 / URL | 极简 mod、demo、教学 |
| **多文件工程** | `manifest.json` + `script.ts` | ✅ | 必走 URL | 真工程，多文件、import、ts 类型 |
| **动态 API** | `api.abilities.register(...)` 等 | ✅ | 任意 | 在 script 运行时往 mod 里塞数据 |

> **推荐**：哪怕只写 50 行代码，也用多文件模式——`script.ts` 写代码，IDE 全功能可用。

完整的多文件示例在 [`public/mods/echo-demo/`](../public/mods/echo-demo)，含 `manifest.json` / `script.ts` / `script.js` / `tavern-mod-api.d.ts` / `tsconfig.json` / `README.md`，按 `npx tsc` 就能构建。

---

## 3. 加载方式

打开基座 → **管理模组…** → 看到 5 个入口：

| 入口 | 何时用 |
|:---|:---|
| **加载调试 mod** | 内置 `debug.mod`（翻开牌/改手牌等调试能力） |
| **加载示例 mod** | 内置 `sample.mod`（演示 license / repo 字段） |
| **加载回响示例（多文件）** | 内置 `echo-demo`（演示 `scriptPath` 多文件工程） |
| **从本地 .mod 加载…** | 自己选一个 `.mod` JSON 文件（要求 `script` 内联） |
| **从 URL 加载** | 任意 HTTP 上的 manifest（支持 `scriptPath`） |

### 3.1 关键：baseUrl 决定能否解析 scriptPath

基座的 mod 加载器**只有一个核心入口** [`loadModPackage({text, baseUrl})`](../src/core/mod/package-loader.ts)：

```
loadModPackageFromUrl(url)  ──┐
                              ├──→  loadModPackage({text, baseUrl})  →  GameMod
loadModPackageFromText(t,b) ─┘                ↑
                                          baseUrl=url（URL 加载 → 解析 scriptPath）
                                          baseUrl=null（file input → 不解析，报清晰错误）
```

`baseUrl` 决定能否解析 `scriptPath`：

- ✅ **URL 加载**（自带 mod 按钮 / 「从 URL 加载」）：`baseUrl = manifest URL`，自动按 `scriptPath` 抓外部脚本
- ❌ **本地 file input**（「从本地 .mod 加载…」）：`baseUrl = null`，浏览器无法跟随相对路径——若 manifest 用 `scriptPath` 会报清晰错误并提示改用内联

> 报「mod 既无内联 script、又声明了 scriptPath，但加载时未提供 baseUrl」就是这个原因。改成「从 URL 加载」即可。

---

## 4. manifest 字段全解

```ts
interface ModManifest {
  // ── 必填 ──
  id: string;          // 全 mod 唯一（英文短横线，如 my-cool-mod）
  name: string;        // 展示名（任意 UTF-8）
  version: string;     // 建议 semver，如 1.0.0

  // ── 可选：作者信息 ──
  author?: string;
  description?: string;
  tags?: string[];                          // 分类标签
  repo?: string;                            // 项目主页 / 仓库 URL

  // ── 可选：依赖与优先级 ──
  dependsOn?: string[];                     // 依赖的 mod id
  priority?: number;                        // 默认 0；越大越先执行

  // ── 可选：开源协议 ──
  license?: string | { name: string; url?: string };
  licenseText?: string;                     // 协议全文（不填请放 LICENSE 文件）
}
```

**协议怎么写？** 见 [§10](#10-选一个开源协议)。简版：

| 你希望 | 填什么 |
|:---|:---|
| 别人随便用、改、商用、闭源 | `"license": "MIT"` |
| 改了也得开源 | `"license": "GPL-3.0-or-later"` |
| 商用需保留署名 | `"license": "Apache-2.0"` |
| 自定义协议 | `"license": { "name": "...", "url": "..." }` |

字符串填 [SPDX 标识符](https://spdx.org/licenses/)；对象用于自定义协议（`name` 必填，`url` 可选）。**基座只展示，不做法律校验**——详见 [§10.3](#103--协议不会自动校验)。

---

## 5. data：注册静态数据

`data` 字段全部可选，**不写就什么都不注册**。基座只读这些字段，把它注册到对应注册表里。

### 5.1 能力 `abilities`

基座**通用契约**——可被解释为回响、卡牌技能、道具、法术，mod 自己决定语义。

```jsonc
{
  "data": {
    "abilities": [
      {
        "id": "summon",                  // 全 mod 唯一
        "name": "召唤",                    // 展示名
        "shortName": "召唤",               // 紧凑场景下使用
        "trigger": "play-phase",          // ← 见下表
        "maxUses": 3,                      // 使用次数
        "effect": "从牌堆抽 1 张牌到自己手牌",
        "requiresTarget": false,           // 是否需要选目标
        "meta": { "aiWeight": 10 }         // mod 自取；基座 AI 会读 aiWeight
      }
    ]
  }
}
```

**`trigger` 取值**：

| 值 | 默认亮起条件 | 含义 |
|:---|:---|:---|
| `play-phase` | 出牌回合 | 出牌时可用 |
| `open-phase` | 开牌回合 | 质疑/放行时可用 |
| `small-round` | 小回合内 | 通用 |
| `big-round` | 大回合内 | 通用 |
| `life-death` | 生死相关 | 生死判定阶段可用 |
| `before-life-death` | 生死判定前 | 钩子点 |
| `after-life-death` | 生死判定后 | 钩子点 |
| `before-draw` | 抽牌前 | 钩子点 |
| `when-die` | **不亮起** | 死亡时自动触发（被动） |
| `any` | 总是 | 任意时机 |
| `custom` | **不亮起** | 由 mod 运行时控制 |

### 5.2 玩家状态 `states`

挂在玩家身上的「Buff / Debuff」。

```jsonc
{
  "data": {
    "states": [
      {
        "id": "blind",
        "name": "失明",
        "description": "不能看自己手牌",
        "duration": { "rounds": 2, "unit": "big-round" },
        "blind": true
      }
    ]
  }
}
```

常用可选字段：`locked` / `skipPlay` / `skipChallenge` / `blind` / `muteAbilities` / `dreamDisorient` / `lockPlayCountToLast` / `pairedWith` / `allBeastsDead` / `lingerRounds`。

### 5.3 阶段 `phases`

把自定义时机插入主循环。

```jsonc
{
  "data": {
    "phases": [
      {
        "id": "inspire",
        "name": "激发阶段",
        "insertAt": "before-election",
        "blocking": true,
        "description": "玩家选择回响"
      }
    ]
  }
}
```

> 基座目前**仅消费** `before-election` 的 blocking 阶段；其它插入点作为扩展位预留。

### 5.4 卡牌 `cards` & 自定义 `custom`

```jsonc
{
  "data": {
    "cards": [
      { "id": "extra-1", "phase": "天", "zodiac": "龙" }
    ],
    "custom": {
      "balance": { "dragonDamage": 2 }   // mod 自取，基座不读
    }
  }
}
```

---

## 6. script 与 setup(api)

### 6.1 顶层函数

`script` 字段是一段 JS 字符串，**顶层可以**声明以下函数：

| 名字 | 何时调用 | 用途 |
|:---|:---|:---|
| `setup(api)` | mod 加载时一次 | 注册能力 / 状态 / UI / 钩子 |
| `teardown()` | mod 卸载时 | 清理副作用（UI 槽会自清，其它自行处理） |
| `onGameStart(state)` 等 | 见 [§8](#8-生命周期钩子) | 介入游戏关键时刻 |

最小例子：

```js
function setup(api) {
  api.log('mod loaded');

  // 注册一个能力（也可用 data.abilities 静态声明）
  api.abilities.register({
    id: 'reveal',
    name: '窥视',
    trigger: 'any',
    maxUses: 1,
    effect: '翻开自己所有手牌',
  });

  // 往游戏 header 加一个徽章
  api.ui.register('game:header-extra', () =>
    api.h('span', { className: 'mod-hello-badge' }, '[hello]'),
  );
}
```

### 6.2 写 UI：`api.h(...)`（无 JSX）

mod 脚本跑在 `new Function` 沙箱里，**没有 JSX 编译**。构造 UI 元素请用 `api.h`：

```js
api.h('div', { className: 'my-card' },
  api.h('span', null, '玩家：'),
  api.h('strong', null, ctx.humanPlayer?.name ?? '?'),
  api.h('button', {
    type: 'button',
    className: 'btn-primary',
    onClick: () => api.log('clicked'),
  }, '点我'),
)
```

记忆口诀：`api.h('标签', { 属性 }, 子元素1, 子元素2, ...)` ≈ `<标签 {...属性}>{子1}{子2}</标签>`。

### 6.3 闭包 state + `api.debug.bumpRender()`

mod 的 render 函数每次都重跑（游戏 state 变化时），**不能用** `useState`。典型做法：

```js
function setup(api) {
  let open = false;                       // 闭包持 state
  const toggle = () => { open = !open; api.debug.bumpRender(); };

  api.ui.register('game:header-extra', () => {
    return api.h('div', null,
      api.h('button', { onClick: toggle }, open ? '收起' : '展开'),
      open ? api.h('div', { className: 'panel' }, '内容…') : null,
    );
  });
}
```

> `api.debug.bumpRender()` 只是「版本号 +1」，让所有 mod UI 槽重渲染。基座**不**帮你自动重渲染——因为 mod 自己改了闭包 state，基座不知道。

### 6.4 旁路：直接改 store（`api.debug.*`）

调试期 / 受信任的 mod 用，**生产 mod 不应依赖**：

| API | 作用 |
|:---|:---|
| `api.debug.setRevealAll(v)` | 翻开 / 隐藏所有牌 |
| `api.debug.isRevealAll()` | 当前是否翻开 |
| `api.debug.modifyHand(p, 'remove')` | 移除玩家最后一张手牌 |
| `api.debug.modifyHand(p, { replaceId, newCard })` | 替换手牌 |
| `api.debug.bumpRender()` | 强制 mod UI 槽重渲染 |

参考：[`public/mods/debug.mod`](../public/mods/debug.mod) 是用这组 API 实现的。

### 6.5 日志

```js
api.log('普通信息');           // info
api.log.debug('调试信息');      // debug
api.log.warn('警告');           // warn
api.log.error('错误', err);     // error
```

默认**走浏览器 console**（按 level 路由到 `console.log/warn/error`），并同时写入 `ModLogBuffer`。打开 DevTools 就能看到。

---

## 7. 编辑器配置：拿到完整类型补全

### 7.1 复制类型声明

把 [`public/mods/tavern-mod-api.d.ts`](../public/mods/tavern-mod-api.d.ts) 复制一份到你的 mod 工程根目录（或 `types/` 子目录）。

> 这个文件是基座 API 形状的「类型镜像」——是 TS 编译 / 检查期用的，**不参与运行时**。
> 基座更新 API 时**不会**自动同步到这里，你需要偶尔重新复制一份新版（基座仓库里的 [src/core/mod/api.ts](../src/core/mod/api.ts) 是源）。

### 7.2 最小 `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "lib": ["ES2020", "DOM"]
  },
  "include": ["script.ts", "tavern-mod-api.d.ts"],
  "exclude": []
}
```

### 7.3 写代码

`script.ts`：

```ts
function setup(api: import('./tavern-mod-api').ModApi) {
  api.log.info('hello loaded');   // ← 现在 IDE 给出完整补全

  api.ui.register('game:header-extra', (ctx) => {
    // ctx.state.players[0].hand ... IDE 全部能跳进类型
    return api.h('span', { className: 'mod-hello' }, '[hello]');
  });
}
```

> 习惯 `<reference types="..." />` 也可以：在 `script.ts` 顶部加
> `/// <reference path="./tavern-mod-api.d.ts" />`，
> 这样 `setup(api)` 就不需要 `import` 注解。

### 7.4 构建

```bash
npx tsc
# → 生成 script.js
```

把 `manifest.json` + `script.js` 一起放到 HTTP 静态服务器（`python -m http.server`、GitHub Pages、Vercel 都行），基座就能从 URL 加载。

---

## 8. 生命周期钩子

按 `priority` **降序**调用；同 priority 按加载顺序。

| 钩子 | 时机 |
|:---|:---|
| `onBeforeGameStart(state)` | 玩家初始化后 |
| `onGameStart(state)` | 同上之后 |
| `onBeforeElection(state)` | 选举首位玩家前 |
| `onBeforeDraw(state)` | 抽牌前 |
| `onAfterDraw(state)` | 抽牌后 |
| `onBeforePlay(state, player, cardIds)` | 出牌前 |
| `onAfterPlay(state, player, cards)` | 出牌后 |
| `onBeforeOpen(state)` | 开牌前 |
| `onAfterOpen(state, isFake)` | 开牌后 |
| `onBeforeLifeDeath(state, loser)` | 生死判定前 |
| `onAfterLifeDeath(state, loser, survived)` | 生死判定后 |
| `onPlayerDied(state, player)` | 玩家死亡 |
| `onPlayerRevived(state, player)` | 玩家复活 |
| `onBigRoundStart(state, round)` | 大回合开始 |
| `onBigRoundEnd(state, round)` | 大回合结束 |

> 钩子里能读 `state`；改 `state.players[i].xxx` 会被基座看到。

---

## 9. UI 注入槽一览

| 槽 ID | 位置 | 用途 |
|:---|:---|:---|
| `mod-loader:actions` | 模组管理界面 | mod 提供自定义「加载按钮」 |
| `mod-loader:mod-list` | 模组管理界面 | mod 在每行加自定义操作 |
| `game:header-extra` | 游戏 header 右侧 | mod 加自定义按钮 |
| `player-seat:badges` | 玩家座位 | mod 加状态徽章 |
| `player-seat:abilities` | 玩家座位 | mod 自定义能力条 |
| `action-area:side` | 主操作区旁 | mod 加自定义操作 |
| `table-center:overlay` | 牌桌中央 | mod 注册阻塞阶段 UI |
| `overlay:pause` | 全屏暂停 | mod 自定义「继续」样式 |
| `log:extra-entry` | 游戏日志 | mod 在每条日志后追加 |

**示例**：

```js
api.ui.register('game:header-extra', (ctx) => {
  return api.h('button', {
    type: 'button',
    className: 'btn-text',
    onClick: () => alert('hello'),
  }, '关于本 mod');
});
```

> `renderFn` **必须返回 React 元素**（或 `null`）。

---

## 10. 选一个开源协议

不要随便选——协议决定了**别人对你的 mod 能做什么、不能做什么**。

### 10.1 决策表

| 你希望 | 推荐 |
|:---|:---|
| 别人随便用、改、商用、闭源 | `MIT` |
| 别人随便用、改，但**改了也得开源** | `GPL-3.0-or-later` |
| 别人用、改都行，但**商用得保留你的署名** | `Apache-2.0` |
| 别人不能用、不能改 | `Proprietary`（自定义对象） |
| 别人能改、不能商用 | `AGPL-3.0` 或 `Elastic-2.0` |
| 我只想玩玩 | 不填（玩家会看到「未声明协议」） |

### 10.2 在 mod 里写

字符串形式（推荐用 [SPDX 标识符](https://spdx.org/licenses/)）：

```jsonc
{
  "manifest": {
    "license": "MIT",                            // SPDX 标识符
    "repo": "https://github.com/you/your-mod"    // 协议全文 / 项目主页
  }
}
```

对象形式（自定义协议）：

```jsonc
{
  "manifest": {
    "license": {
      "name": "DRa6a 私有协议 v1",
      "url": "https://example.com/eula"
    }
  }
}
```

### 10.3 ⚠️ 协议不会自动校验

基座**不**做协议合规校验——你写 `"MIT"` 但实际不放 LICENSE 文件，基座不会拦你。这是个**信任系统**。**强烈建议**同时在项目根放一份 `LICENSE` 文件。

### 10.4 推荐模板

- [MIT](https://choosealicense.com/licenses/mit/) · 最常用、最宽松
- [Apache-2.0](https://choosealicense.com/licenses/apache-2.0/) · 加专利授权
- [GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/) · 强 copyleft
- [Unlicense](https://choosealicense.com/licenses/unlicense/) · 彻底放弃版权

---

## 11. 调试与故障排查

### 11.1 错误速查

| 错误 | 原因 | 修法 |
|:---|:---|:---|
| `JSON 解析失败` | `.mod` 顶部有 `//` 注释 | 删掉，纯 JSON |
| `format 必须是 "tavern-mod"` | 漏了 `format` 字段 | 加上 |
| `manifest.id 缺失` | 漏了 `id` | 加上 |
| `mod 既无 script 也无 scriptPath` | 两个都为空 | 加一个 |
| `mod 既无内联 script、又声明了 scriptPath，但加载时未提供 baseUrl` | file input 模式加载了多文件 mod | 改用「从 URL 加载」或把 `script` 内联进 manifest |
| `抓取 script 失败` | manifest URL 找不到 scriptPath 指向的文件 | 检查路径 / 服务器 |
| `抓取 script 失败：Failed to construct 'URL': Invalid base URL` | baseUrl 不是绝对 URL | 用绝对 URL 加载；若是 vite dev 内部问题，重启服务 |
| `Objects are not valid as a React child` | render 用了 `{$$typeof, type, props}` 而不是 `api.h(...)` | 改用 `api.h` |
| UI 不显示 | `api.ui.register` 不在 `setup(api)` 里 | 挪进去 |

### 11.2 热替换

多文件 mod 工程：改 `script.ts` → `npx tsc` → 在模组管理页「全部卸载」→「从 URL 加载」重新加载。**没有热更新**——但一般够快了。

### 11.3 复现日志（高级）

```js
// 调方可在 init 时订阅
const off = loader.subscribeLog((entry) => {
  // entry: { ts, level, source, message, args }
  sendToServer(entry);
});
```

---

## 12. 打包与发布

### 12.1 单文件 mod

把 `hello.mod` 单文件发出去即可——玩家在「模组管理」里用「从本地 .mod 加载…」按钮选文件加载。**注意：单文件必须把 `script` 内联进 manifest，不能用 `scriptPath`（浏览器无法跟随本地相对路径）。**

### 12.2 多文件 mod 工程

把整个 mod 目录放到任意 HTTP 静态服务器，发布 `manifest.json` 的 URL。

最简流程：

```bash
# 在 mod 目录里
npx tsc            # 编译
git init && git add . && git commit -m "initial"
gh repo create     # 或者手动 push 到 GitHub
gh pages enable    # 开启 Pages
```

然后基座从 `https://you.github.io/your-mod/manifest.json` 加载——UI 上的「从 URL 加载」输入框贴这个 URL 即可。

### 12.3 打包成 zip

把 `manifest.json` + `script.js` + `tavern-mod-api.d.ts` 一起 zip；下载后用任意 HTTP 服务器跑起来。**不要**用 `<input type="file">` 选 zip——浏览器**不能**跟相对路径。

---

## 13. 完整示例：异卷·回响

完整源代码：[`docs/回响.md`](./回响.md)。展示：

- 34 个 abilities（含 2 个 trigger 维度）
- 8 个 states（含 `locked` / `dreamDisorient` / `pairedWith` / `allBeastsDead` / `lingerRounds`）
- 1 个 phase（`before-election` blocking）
- 9 个生命周期钩子
- 7 个 UI 注入点

---

## 14. API 速查

```ts
// ── 构造 UI ──
api.h('div', { className: 'x' }, child1, child2);

// ── 写日志 ──
api.log('普通');
api.log.debug('debug');
api.log.warn('warn');
api.log.error('error', e);

// ── 注册数据 ──
api.abilities.register({ id, name, trigger, maxUses, effect, ... });
api.states.register({ id, name, duration, ... });
api.phases.register({ id, name, insertAt, blocking, ... });
api.registerCards([{ id: 'extra-1', phase: '天' }]);

// ── 玩家状态 ──
api.player.addState(player, 'shimang', 1);
api.player.clearState(player, 'shimang');
api.player.hasState(player, 'shimang');
api.player.getModData<MyType>(player, 'abilities');
api.player.setModData(player, 'abilities', value);

// ── UI 注入 ──
api.ui.register('game:header-extra', (ctx) => api.h('span', null, 'hi'));
api.ui.unregister('game:header-extra', fn);

// ── 阻塞阶段 ──
api.phase.isActive('inspire');
api.phase.complete();
api.phase.useAbility?.(playerId, 'tannang', target?.id);

// ── 读当前 state ──
const truth = api.state?.truthPhase;

// ── 强制重渲染 ──
api.debug.bumpRender();

// ── 调试旁路 ──
api.debug.setRevealAll(true);
api.debug.modifyHand(playerId, 'remove');
api.debug.modifyHand(playerId, { replaceId: 'c1', newCard: { id: 'c1', phase: '道' } });
```

---

## 附：版本兼容

- `formatVersion: 1` —— 当前唯一支持版本
- 基座读 mod 时**不**校验 `manifest.version` 与已加载 mod 的兼容性——`manifest.version` 只是展示用
- 协议字段是「信任声明」——基座不校验，玩家请自己看
