# 终焉酒馆 · 模组开发指南

> 本指南面向**模组作者**。读完这份文档你能：
> 1. 用一份 `manifest.json` + 一个 `.ts`/`.js` 文件写出**有 IDE 补全**的 mod；
> 2. 知道怎么注册能力 / 状态 / 阶段、怎么注入 UI、怎么响应游戏事件；
> 3. 选一个合适的开源协议，附在 mod 里。
>
> 如果你只想「点一下就玩」，不需要看这份文档——基座会自带 `debug.mod` 演示调试能力，`sample.mod` / `echo-demo` 演示 API。

---

## 目录

1. [五分钟上手](#1-五分钟上手)
2. [两种开发模式：单文件 vs 多文件工程](#2-两种开发模式单文件-vs-多文件工程)
3. [编辑器配置：拿到完整类型补全](#3-编辑器配置拿到完整类型补全)
4. [manifest 字段全解](#4-manifest-字段全解)
5. [data：注册能力 / 状态 / 阶段 / 卡牌](#5-data注册能力--状态--阶段--卡牌)
6. [script 与 setup(api)：脚本怎么写](#6-script-与-setupapi脚本怎么写)
7. [UI 注入槽一览](#7-ui-注入槽一览)
8. [常用代码片段](#8-常用代码片段)
9. [生命周期钩子](#9-生命周期钩子)
10. [选一个开源协议](#10-选一个开源协议)
11. [调试：日志、错误、reload](#11-调试日志错误reload)
12. [完整示例：异卷·回响](#12-完整示例异卷回响)
13. [打包与发布](#13-打包与发布)
14. [API 速查](#14-api-速查)

---

## 1. 五分钟上手

### 1.1 最小 mod

新建文件 `hello.mod`（一个 JSON 文件）：

```jsonc
{
  "format": "tavern-mod",
  "formatVersion": 1,
  "manifest": {
    "id": "hello",
    "name": "你好世界",
    "version": "0.1.0",
    "author": "你",
    "description": "第一份 mod：在 header 显示一个 [hello] 徽章。",
    "license": "MIT"
  },
  "info": "# 你好世界\n\n这份 mod 不改任何游戏规则——只演示最小 API。\n",
  "data": {
    "abilities": []
  },
  "script": "function setup(api) {\n  api.log('hello mod loaded');\n  api.ui.register('game:header-extra', function (ctx) {\n    return api.h('span', { className: 'mod-hello-badge' }, '[hello]');\n  });\n}\n"
}
```

### 1.2 加载

打开基座 →「管理模组…」→「从本地 .mod 加载…」→ 选 `hello.mod`。成功后：

- 「已加载」列表里多出一行
- 进对局后，游戏 header 右侧出现一个 `[hello]` 徽章
- 浏览器 DevTools Console 看到 `[mod:info] hello mod loaded`

### 1.3 卸载

模组管理页里点行末的「卸载」即可——它注册的 UI 槽会自动清理。

---

## 2. 两种开发模式：单文件 vs 多文件工程

基座支持两种 mod 形态，按需选：

| 维度 | 单文件 `.mod` | 多文件 mod 工程 |
|:---|:---|:---|
| 结构 | 整个 mod 在**一个** JSON 文件里，`script` 是字符串 | `manifest.json`（或 `.mod`）+ 真实 `.ts`/`.js` 文件 |
| 编辑器补全 | ❌ `script` 字段是 JSON 字符串，IDE 当作无类型数据 | ✅ 用 `tavern-mod-api.d.ts` 拿到 `setup(api)` 完整类型 |
| 适合 | 极简 mod / 一次性示例 / 教学 | 真正的工程（多文件、import、ts 类型） |
| 分发 | 单文件即可（`script` 内嵌） | 需要 HTTP 服务器或打包成 zip |

**推荐**：哪怕只写 50 行代码，也用多文件模式——`script.ts` 写代码，IDE 全功能可用；构建产物 `script.js` 跟 `manifest.json` 一起放。

完整的多文件示例在 `public/mods/echo-demo/`，含 `manifest.json` / `script.ts` / `script.js` / `tsconfig.json` / `README.md`，按 `npx tsc` 就能构建。

---

## 3. 编辑器配置：拿到完整类型补全

### 3.1 复制类型声明

把 [`public/mods/tavern-mod-api.d.ts`](../public/mods/tavern-mod-api.d.ts) 复制一份到你的 mod 工程根目录（或 `types/` 子目录）。

> 这个文件是基座 API 形状的「类型镜像」——是 TS 编译/检查期用的，
> 不参与运行时。基座更新 API 时**不会**自动同步到这里，你需要偶尔
> 重新复制一份新版（基座仓库里的 [src/core/mod/api.ts](../src/core/mod/api.ts) 是源）。

### 3.2 最小 `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./",
    "rootDir": "./",
    "lib": ["ES2020", "DOM"]
  },
  "include": ["script.ts", "types/tavern-mod-api.d.ts"]
}
```

### 3.3 写代码

`script.ts`：

```ts
function setup(api: import('./types/tavern-mod-api').ModApi) {
  api.log.info('hello loaded');   // ← 现在 IDE 给出完整补全

  api.ui.register('game:header-extra', (ctx) => {
    // ctx.state.players[0].hand ... IDE 全部能跳进类型
    return api.h('span', { className: 'mod-hello' }, '[hello]');
  });
}
```

> 习惯 `<reference types="..." />` 也可以：在 `script.ts` 顶部加
> `/// <reference path="./types/tavern-mod-api.d.ts" />`，
> 这样 `setup(api)` 就不需要 `import` 注解。

### 3.4 构建产物

```bash
npx tsc
# → 生成 script.js
```

把 `manifest.json` + `script.js` 一起放到 HTTP 静态服务器（`python -m http.server`、GitHub Pages、Vercel 都行），基座就能从 URL 加载。

---

## 4. manifest 字段全解

```ts
interface ModManifest {
  id: string;                                     // 必填：全 mod 唯一
  name: string;                                   // 必填：展示名
  version: string;                                // 必填：建议 semver
  author?: string;                                // 可选
  description?: string;                           // 可选
  dependsOn?: string[];                           // 可选：依赖的 mod id
  tags?: string[];                                // 可选：分类
  priority?: number;                              // 可选：默认 0；越大越先执行

  license?: string | { name: string; url?: string };  // 可选：开源协议
  repo?: string;                                  // 可选：项目主页 / 仓库 URL
  licenseText?: string;                           // 可选：协议全文（不填请放 LICENSE 文件）
}
```

### 4.1 怎么选协议？

详见 [§10 选一个开源协议](#10-选一个开源协议)。最常见的几个：

| 你的情况 | 推荐协议 |
|:---|:---|
| 想让任何人都能用、随便改、商用也行 | `MIT` |
| 别人可以改，但改了也得开源 | `GPL-3.0-or-later` |
| 别人可以改，但最好说明改了哪里 | `Apache-2.0` |
| 只想让朋友玩玩，别的都不许 | `Proprietary` 或自定义对象 |
| 不在乎 | 不填（玩家会看到「未声明协议」） |

**字符串**填 [SPDX 标识符](https://spdx.org/licenses/)（机器友好）。**对象**用于自定义协议（`name` 必填，`url` 可选指向协议全文）。基座只展示，不做法律校验。

### 4.2 协议不会自动校验

基座**不**做协议合规校验——你写 `"MIT"` 但实际不放 LICENSE 文件，基座不会拦你。这是个**信任系统**。

---

## 5. data：注册能力 / 状态 / 阶段 / 卡牌

`data` 字段全部可选，**不写就什么都不注册**。填了哪些就注册哪些。

### 5.1 能力 `abilities`

基座**通用契约**——可被解释为回响、卡牌技能、道具、法术，mod 自己决定语义。

```jsonc
{
  "data": {
    "abilities": [
      {
        "id": "summon",
        "name": "召唤",
        "shortName": "召唤",
        "trigger": "play-phase",      // 见下表
        "maxUses": 3,
        "effect": "从牌堆抽 1 张牌到自己手牌",
        "requiresTarget": false,
        "meta": { "aiWeight": 10 }   // mod 自取；基座 AI 会读 aiWeight
      }
    ]
  }
}
```

`trigger` 取值：

| 值 | 默认亮起条件 | 含义 |
|:---|:---|:---|
| `play-phase` | 出牌回合 | 出牌时可用 |
| `open-phase` | 开牌回合 | 质疑/放行时可用 |
| `small-round` / `big-round` | 小/大回合内 | 通用 |
| `life-death` / `before-life-death` / `after-life-death` | 生死相关 |  |
| `before-draw` | 抽牌前 |  |
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

可选字段：`locked` / `skipPlay` / `skipChallenge` / `blind` / `muteAbilities` / `dreamDisorient` / `lockPlayCountToLast` / `pairedWith` / `allBeastsDead` / `lingerRounds`。

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

> 基座仅消费 `before-election` 的 blocking 阶段；其它插入点作为扩展位预留。

### 5.4 卡牌 `cards`

加入牌堆的自定义卡牌（基座会与内置牌堆合并）。

```jsonc
{
  "data": {
    "cards": [
      { "id": "extra-1", "phase": "天", "zodiac": "龙" }
    ]
  }
}
```

### 5.5 任意扩展 `custom`

```jsonc
{ "data": { "custom": { "balance": { "dragonDamage": 2 } } } }
```

基座不读，mod 自己管理。

---

## 6. script 与 setup(api)：脚本怎么写

### 6.1 顶层函数

`script` 字段是一段 JS 字符串，**顶层可以**声明以下函数：

| 名字 | 何时调用 | 用途 |
|:---|:---|:---|
| `setup(api)` | mod 加载时一次 | 注册能力 / 状态 / UI |
| `teardown()` | mod 卸载时 | 清理副作用（UI 槽会自清，其它自行处理） |
| `onGameStart(state)` 等钩子 | 见 [§9](#9-生命周期钩子) |  |

```js
function setup(api) {
  // 推荐：用 .log 子方法而非 console
  api.log('mod loaded');
  api.log.debug('extra detail', someValue);
  api.log.warn('数值越界', n);
  api.log.error('钩子炸了', e);
}

function onGameStart(state) {
  // 钩子里也能写 api.log，但请用 .debug 避免刷屏
  api.debug.setRevealAll(false);   // 调试期可用
}
```

### 6.2 写 UI：`api.h(...)`（无 JSX 也能用）

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

可以理解成 `api.h('div', { ... }, a, b)` ≈ `<div {...}>{a}{b}</div>`。

### 6.3 闭包 state + `api.debug.bumpRender()`

mod 的 render 函数每次都重跑（游戏 state 变化时），**不能用** `useState`。
典型做法：

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

### 6.4 旁路：直接改 store（`api.debug.*`）

调试期/受信任的 mod 用，**生产 mod 不应依赖**：

| API | 作用 |
|:---|:---|
| `api.debug.setRevealAll(v)` | 翻开/隐藏所有牌 |
| `api.debug.isRevealAll()` | 当前是否翻开 |
| `api.debug.modifyHand(p, 'remove')` | 移除玩家最后一张手牌 |
| `api.debug.modifyHand(p, { replaceId, newCard })` | 替换手牌 |
| `api.debug.bumpRender()` | 强制 mod UI 槽重渲染（详见上） |

参考：[`public/mods/debug.mod`](../public/mods/debug.mod) 是用这组 API 实现的。

---

## 7. UI 注入槽一览

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

注入示例：

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

## 8. 常用代码片段

### 8.1 玩家出牌前拦截

```js
function onBeforePlay(state, player, cardIds) {
  if (player.modData?.noPlay) {
    api.log.warn('玩家被禁止出牌', player.id);
    // 改 state 或 throw
  }
}
```

### 8.2 给玩家发牌

```js
function onAfterDraw(state) {
  const p = state.players.find(x => x.isHuman);
  if (!p) return;
  p.hand.push({ id: 'gift-1', phase: '道' });
}
```

### 8.3 注册「用一次」的能力

```js
api.abilities.register({
  id: 'reveal',
  name: '窥视',
  trigger: 'any',
  maxUses: 1,
  effect: '翻开自己所有手牌',
});
```

### 8.4 在 mod 列表里加一个开关

```js
api.ui.register('mod-loader:mod-list', () => {
  return api.h('button', {
    type: 'button',
    className: 'btn-ghost',
    onClick: () => { /* ... */ },
  }, '配置');
});
```

---

## 9. 生命周期钩子

按 `priority` 降序调用；同 priority 按加载顺序。

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

```jsonc
{
  "manifest": {
    "license": "MIT",                                  // 字符串：SPDX 标识符
    "repo": "https://github.com/you/your-mod"          // 协议全文放这里
  }
}
```

或者自定义：

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

### 10.3 别忘了放 LICENSE 文件

**基座不替你做协议合规校验**。你在 `manifest.license` 写 `"MIT"` 但
项目里不放 LICENSE 文件——玩家看到的是「MIT」，但他/她实际上没法知道
你到底放弃了什么权利。**强烈建议**同时在项目根放一份 `LICENSE` 文件。

### 10.4 推荐模板

如果你想直接用现成 LICENSE 文件，常见的几份：

- MIT：[choosealicense.com/licenses/mit](https://choosealicense.com/licenses/mit/)
- Apache-2.0：[choosealicense.com/licenses/apache-2.0](https://choosealicense.com/licenses/apache-2.0/)
- GPL-3.0：[choosealicense.com/licenses/gpl-3.0](https://choosealicense.com/licenses/gpl-3.0/)
- Unlicense（彻底放弃）：[choosealicense.com/licenses/unlicense](https://choosealicense.com/licenses/unlicense/)

---

## 11. 调试：日志、错误、reload

### 11.1 日志

```js
api.log('普通信息');           // info
api.log.debug('调试信息');      // debug
api.log.warn('警告');           // warn
api.log.error('错误', err);     // error
```

默认**走浏览器 console**（按 level 路由到 `console.log/warn/error`），并同时写入 `ModLogBuffer`。打开 DevTools 就能看到。

### 11.2 常见错误

| 错误 | 原因 | 修法 |
|:---|:---|:---|
| `JSON 解析失败` | `.mod` 顶部有 `//` 注释 | 删掉，纯 JSON |
| `format 必须是 "tavern-mod"` | 漏了 `format` 字段 | 加上 |
| `manifest.id 缺失` | 漏了 `id` | 加上 |
| `Objects are not valid as a React child` | render 用了 `{$$typeof, type, props}` 而不是 `api.h(...)` | 改用 `api.h` |
| UI 不显示 | `api.ui.register` 不在 `setup(api)` 里 | 挪进去 |

### 11.3 热替换

多文件 mod 工程：改 `script.ts` → `npx tsc` → 在模组管理页「全部卸载」→「从 URL 加载」重新加载。**没有热更新**——但一般够快了。

### 11.4 复现日志

```js
// 调方可在 init 时订阅
const off = loader.subscribeLog((entry) => {
  // entry: { ts, level, source, message, args }
  sendToServer(entry);
});
```

---

## 12. 完整示例：异卷·回响

完整源代码：[`docs/回响.md`](./回响.md)。展示：

- 34 个 abilities（含 2 个 trigger 维度）
- 8 个 states（含 `locked` / `dreamDisorient` / `pairedWith` / `allBeastsDead` / `lingerRounds`）
- 1 个 phase（`before-election` blocking）
- 9 个生命周期钩子
- 7 个 UI 注入点

---

## 13. 打包与发布

### 13.1 单文件 mod

把 `hello.mod` 单文件发出去即可——玩家在「模组管理」里选文件加载。

### 13.2 多文件 mod

把整个 mod 目录放到任意 HTTP 静态服务器，发布 `manifest.json` 的 URL。

最简流程：

```bash
# 在 mod 目录里
npx tsc            # 编译
git init && git add . && git commit -m "initial"
gh repo create     # 或者手动 push 到 GitHub
gh pages enable    # 开启 Pages
```

然后基座从 `https://you.github.io/your-mod/manifest.json` 加载。

### 13.3 打包成 zip

把 `manifest.json` + `script.js` + `types/` 一起 zip；下载后用任意 HTTP 服务器跑起来。不要用 `<input type="file">` 选 zip——浏览器**不能**跟相对路径。

---

## 14. API 速查

```ts
// 构造 UI
api.h('div', { className: 'x' }, child1, child2);

// 写日志
api.log('普通');
api.log.debug('debug');
api.log.warn('warn');
api.log.error('error', e);

// 注册数据
api.abilities.register({ id, name, trigger, maxUses, effect, ... });
api.states.register({ id, name, duration, ... });
api.phases.register({ id, name, insertAt, blocking, ... });
api.registerCards([{ id: 'extra-1', phase: '天' }]);

// 玩家状态
api.player.addState(player, 'shimang', 1);
api.player.clearState(player, 'shimang');
api.player.hasState(player, 'shimang');
api.player.getModData<MyType>(player, 'abilities');
api.player.setModData(player, 'abilities', value);

// UI 注入
api.ui.register('game:header-extra', (ctx) => api.h('span', null, 'hi'));
api.ui.unregister('game:header-extra', fn);

// 阻塞阶段
api.phase.isActive('inspire');
api.phase.complete();
api.phase.useAbility?.(playerId, 'tannang', target?.id);

// 读当前 state
const truth = api.state?.truthPhase;

// 强制重渲染
api.debug.bumpRender();

// 调试旁路
api.debug.setRevealAll(true);
api.debug.modifyHand(playerId, 'remove');
api.debug.modifyHand(playerId, { replaceId: 'c1', newCard: { id: 'c1', phase: '道' } });
```

---

## 附：版本兼容

- `formatVersion: 1` —— 当前唯一支持版本
- 基座读 mod 时**不**校验 manifest.version 与已加载 mod 的兼容性——`manifest.version` 只是展示用
- 协议字段是「信任声明」——基座不校验，玩家请自己看
