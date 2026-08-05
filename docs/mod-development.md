# 模组制作指南

> 本指南面向**模组作者**（Game Master / 玩家），讲解如何为一个《终焉酒馆》异卷编写一个 **单文件** 模组（`.mod.md`），并将其挂载到游戏运行时。

---

## 0. 速览：30 秒看懂

```ts
// 1. 准备一份 .mod.md 文件（YAML frontmatter + JSON 数据）
// 2. 加载：
import { DefaultModLoader, loadModFromString } from '@/core/mod';
import huixiangRaw from './回响.md?raw';

const loader = new DefaultModLoader();
loadModFromString(loader, huixiangRaw, 'docs/回响.md');

// 3. 接入游戏：
new RoundManager({ random, modLoader: loader });
```

加载器会做：
- 解析 frontmatter，得到 `ModManifest`
- 解析 `## 数据` 章节的 `json` 代码块，得到 `ModData { echoes, states, phases, ... }`
- 解析 `ts` 代码块，得到一组**钩子函数**（可选）
- 把上述内容注册到内部 `DefaultEchoRegistry / DefaultPlayerStateRegistry / DefaultPhaseRegistry`
- 在 `RoundManager` 的关键生命周期事件触发钩子

---

## 1. 文件结构

模组是**单文件**（推荐后缀 `.mod.md`），由 4 段组成，按顺序出现：

```markdown
---
mod-id: <string>          # 必填，模组唯一 ID（建议 kebab-case）
mod-name: <string>        # 必填，展示名
version: <semver>         # 必填，例如 1.0.0
author: <string>          # 可选
description: <string>     # 可选，会作为模组说明
depends-on:               # 可选，依赖的其他 mod id
  - other-mod-id
tags:                     # 可选
  - 异卷
  - 回响
priority: <number>        # 可选，数值越大越先应用（默认 0）
---

# 人类可读标题

## 机制
自由文本，写给玩家看的机制说明……

## 规则
自由文本，规则细节……

## 数据
```json
{
  "phases": [ ... ],
  "states": [ ... ],
  "echoes": [ ... ]
}
```

```ts
// 可选：钩子（生命周期）
onGameStart(state) {
  // ...
}
```
```

> **解析器只看**：
> 1. 顶部的 `---` YAML frontmatter
> 2. `## 数据` 章节里的 ` ```json` 代码块（**只能有一个** JSON 块）
> 3. 文件内所有 ` ```ts` 代码块（合并后求值，钩子挂到 `exports`）
>
> 其余章节都是给作者自己写说明用的，**不会被解析**。

---

## 2. Frontmatter 字段

| 字段 | 必填 | 类型 | 说明 |
|:---|:---|:---|:---|
| `mod-id` | ✅ | string | 模组唯一标识，建议使用小写字母+短横线（如 `huixiang`） |
| `mod-name` | ✅ | string | 展示名，会出现在 UI 上 |
| `version` | ✅ | semver | 任意字符串即可，建议 `x.y.z` 形式 |
| `author` | ❌ | string | 作者署名 |
| `description` | ❌ | string | 一句话说明 |
| `depends-on` | ❌ | string[] | 依赖的其他 mod id，解析器目前只做记录，不做强制校验 |
| `tags` | ❌ | string[] | 标签，用于筛选/分类 |
| `priority` | ❌ | number | 数值越大越先注册到加载器（默认 0）。**注意**：数据合并按加载顺序，钩子触发按 `priority` **降序**。 |

**YAML 语法子集**（解析器仅支持）：

- 标量：`key: value`
- 字符串可省略引号；如包含 `:` 或特殊字符，请用 `"…"` 或 `'…'`
- 列表：
  ```yaml
  tags:
    - 异卷
    - 回响
  ```
- 注释：行首 `#` 之后到行尾

---

## 3. `## 数据` 章节

解析器从 `## 数据`（或 `## Data`）章节抓取**第一个** ` ```json` 代码块，反序列化为 `ModData`：

```ts
interface ModData {
  echoes?: EchoDefinition[];     // 回响
  states?: PlayerStateEffect[];  // 玩家状态
  phases?: PhaseDefinition[];    // 阶段
  cards?: Card[];                // 自定义卡牌（可选）
  custom?: Record<string, unknown>; // 任意扩展
}
```

### 3.1 回响（echoes）

```ts
interface EchoDefinition {
  id: string;        // 必填，唯一
  name: string;      // 必填，显示名
  shortName: string; // 必填，「破万法」识别 4 字以下回响用
  trigger: EchoTrigger; // 必填，使用时机
  maxUses: number;   // 必填，最大使用次数
  isShort?: boolean; // 是否二回响（可被「显灵」复制）
  effect: string;    // 必填，效果描述
}
```

`EchoTrigger` 可选值：

| 值 | 含义 | 触发的钩子 |
|:---|:---|:---|
| `play-phase` | 出牌回合 | `onBeforePlay` / `onAfterPlay` |
| `open-phase` | 开牌回合 | `onBeforeOpen` / `onAfterOpen` |
| `small-round` | 小回合内 | 由作者决定 |
| `big-round` | 大回合内 | `onBigRoundStart` / `onBigRoundEnd` |
| `life-death` | 生死回合 | `onBeforeLifeDeath` / `onAfterLifeDeath` |
| `before-life-death` | 生死回合前 | `onBeforeLifeDeath` |
| `after-life-death` | 上一生死回合后，本抽牌回合前 | `onAfterLifeDeath` |
| `before-draw` | 抽牌回合抽牌前 | `onBeforeDraw` |
| `when-die` | 有人死亡时 | `onPlayerDied` |
| `any` | 任意时机 | （无固定钩子，由回响实现自身触发逻辑） |

### 3.2 玩家状态（states）

```ts
interface PlayerStateEffect {
  id: string;                              // 必填
  name: string;                            // 必填
  description: string;                     // 必填
  duration: 'forever' | { rounds: number; unit: 'big-round' | 'play-turn' };
  locked?: boolean;                        // 「锁定」语义，不可被「忘忧」清除
  skipPlay?: boolean;                      // 跳过出牌
  skipChallenge?: boolean;                 // 跳过质疑
  blind?: boolean;                         // 不能查看手牌
  muteEchoes?: boolean;                    // 不能使用回响
  dreamDisorient?: boolean;                // 随机禁用 1 个回响
  lockPlayCountToLast?: boolean;           // 出牌数被锁定
  pairedWith?: string;                     // 与某玩家同生共死（playerId）
  allBeastsDead?: boolean;                 // 除天龙外所有神兽出局
  lingerRounds?: number;                   // 死亡后还能撑 N 个大回合
}
```

> **运行时如何挂载状态**：把 `effect.id` push 到 `Player.stateEffectIds`：
> ```ts
> player.stateEffectIds?.push('shimang');
> ```

### 3.3 阶段（phases）

```ts
interface PhaseDefinition {
  id: string;                              // 必填
  name: string;                            // 必填
  insertAt:                                // 必填，插入位置
    | 'before-election'
    | 'after-draw'
    | 'before-play'
    | 'after-open'
    | 'after-life-death'
    | 'custom';
  blocking: boolean;                       // 必填，是否阻塞主循环
  description: string;                     // 必填
}
```

> **当前说明**：阶段机制仅做**声明式注册**（用于在 UI/文档中描述流程）；**实际游戏循环**目前由 `RoundManager` 硬编码，阶段插入会作为下一步功能（已留好 hook 点）。
> 作者在编写 `phases` 时，可让 UI/日志读取 `PhaseRegistry` 来提示玩家「现在是激发回合」。

### 3.4 自定义卡牌（cards）

`cards` 字段是可选的 `Card[]`，会通过 `mod-loader.applyDeckPatches` 增量加入游戏牌堆：

```ts
interface Card {
  id: string;
  phase: CardPhase; // '天' | '地' | '人' | '道'
  zodiac?: Zodiac;  // '鼠' | '牛' | … | '猪'
}
```

---

## 4. 钩子（hooks）

在 `.mod.md` 文件中放置 ` ```ts` 代码块，**顶层声明**以下函数即可（解析器会扫描所有 `function name(...)` 与 `var name = ...`，把闭包内的标识符同步到 `exports`）：

```ts
onRegister(ctx)                    // mod 注册到加载器时
onBeforeGameStart(state)
onGameStart(state)
onBeforeElection(state)
onBeforeDraw(state)
onAfterDraw(state)
onBeforePlay(state, player, cardIds)
onAfterPlay(state, player, cards)
onBeforeOpen(state)
onAfterOpen(state, isFake)
onBeforeLifeDeath(state, loser)
onAfterLifeDeath(state, loser, survived)
onPlayerDied(state, player)
onPlayerRevived(state, player)
onBigRoundStart(state, round)
onBigRoundEnd(state, round)
```

**支持 3 种写法**：

1. TypeScript 方法简写（推荐，可读性最好）：
   ```ts
   onAfterOpen(state, isFake) {
     // ...
   }
   ```
2. 标准 `function` 声明：
   ```ts
   function onAfterOpen(state, isFake) {
     // ...
   }
   ```
3. 显式 `exports.X = ...`：
   ```ts
   exports.onAfterOpen = function (state, isFake) {
     // ...
   };
   ```

> 实现原理：解析器把所有 `ts` 代码块合并，先把方法简写 `name(args) {` 替换为 `function name(args) {`，再用正则扫描出所有顶层 `function name(...)` 和 `var name = ...` 标识符，最后在 `new Function` 体内追加 `exports[k] = k` 把它们拷出来。

### 4.1 钩子触发顺序

`RoundManager` 在以下时机触发钩子（按 `priority` **降序**遍历所有 mod）：

| 钩子 | 时机 |
|:---|:---|
| `onBeforeGameStart` | `startGame` 玩家初始化完毕、选举首位玩家前 |
| `onGameStart` | 同上之后 |
| `onBeforeElection` | 选举首位玩家前 |
| `onBigRoundStart` | 每个大回合开始 |
| `onBeforeDraw` | 抽牌前 |
| `onAfterDraw` | 抽牌后 |
| `onBeforePlay` | 出牌前 |
| `onAfterPlay` | 出牌后 |
| `onBeforeOpen` | 开牌前 |
| `onAfterOpen` | 开牌后 |
| `onBeforeLifeDeath` | 生死判定前 |
| `onAfterLifeDeath` | 生死判定后 |
| `onPlayerDied` | 玩家死亡时 |
| `onPlayerRevived` | 玩家复活时（需用户自行在 `onAfterLifeDeath` 中触发） |
| `onBigRoundEnd` | 每个大回合结束（开始下一轮前） |

### 4.2 暴露辅助 API

> 任何 **顶层声明**（不以上述钩子名命名）都会作为**辅助函数**挂到 `mod` 对象上，UI 代码可以 `mod.castXxx(...)` 调用。
>
> 例如 `docs/回响.md` 暴露了 `useEcho` / `grantEchoes` / `castZhaozai` / `castZhiai` / `castBaoshan` / `castRumeng` / `castWangyou` / `castTianxingjian` 等。

---

## 5. 完整示例（来自 `docs/回响.md` 的最简骨架）

```markdown
---
mod-id: my-mod
mod-name: 我的第一个模组
version: 0.1.0
author: 张三
priority: 0
---

# 我的第一个模组

## 机制
给玩家每人加一张「幸运牌」……

## 数据

```json
{
  "echoes": [
    {
      "id": "lucky",
      "name": "幸运",
      "shortName": "幸运",
      "trigger": "play-phase",
      "maxUses": 1,
      "effect": "本回合所出之牌自动全部转为真牌相"
    }
  ],
  "states": [
    {
      "id": "blind-fold",
      "name": "蒙眼",
      "description": "无法查看自己的手牌",
      "duration": { "rounds": 1, "unit": "big-round" },
      "blind": true
    }
  ]
}
```
```

---

## 6. 加载与挂载

```ts
import { DefaultModLoader, loadModFromString } from '@/core/mod';
import myMod from './my-mod.mod.md?raw';

const loader = new DefaultModLoader();
const result = loadModFromString(loader, myMod, 'my-mod');

if (!result.ok) {
  console.error('模组加载失败：', result.errors);
} else {
  console.log('已注册 mod：', result.mod?.name);
}
```

挂载到 `RoundManager`：

```ts
new RoundManager({ random, modLoader: loader });
```

或者先 `new RoundManager(random)`，再：

```ts
manager.setModLoader(loader);
```

---

## 7. 校验

解析器在以下情况会返回 `errors: string[]`：

- 缺少 `mod-id` / `mod-name` / `version`
- `## 数据` 章节缺失或没有 `json` 代码块
- JSON 解析失败
- `echoes[]` 项缺 `id` / `name` / `shortName` / `maxUses` / `trigger`
- `states[]` 项缺 `id` / `name` / `duration`
- `phases[]` 项缺 `id` / `name` / `insertAt` / `blocking`
- `ts` 代码块执行抛错

**不会**因为错误而抛异常：调用方拿到 `result.mod === undefined`，但 `result.errors` 会列出全部问题，方便修。

---

## 8. 调试技巧

1. **加载失败时优先看 `errors`**：解析器把所有问题一次性列出来，按顺序修即可。
2. **钩子没触发？** 检查两点：
   - 是否调用了 `RoundManager.setModLoader(loader)` 或在构造时传入 `modLoader`？
   - 该钩子是否在当前 `RoundManager` 实现中已被调用？（详见 §4.1）
3. **数据没生效？** 用 `loader.getActiveMods()` 拿到所有 mod，检查 `data.echoes / data.states / data.phases` 是否正确填充。
4. **注册冲突**：相同 `mod-id` 重复注册会被忽略（控制台会打印「重复注册 mod」）。

---

## 9. 进阶：写一个「强运」回响

下面演示如何把游戏内已有的「强运」做成可交互的回响（伪代码）：

1. 在 `## 数据` 中声明：
   ```json
   {
     "echoes": [
       { "id": "qiangyun", "name": "强运", "shortName": "强运",
         "trigger": "life-death", "maxUses": 2,
         "effect": "使神兽无法发现 1 名参与者赌命失败" }
     ]
   }
   ```
2. 在 `ts` 块中写：
   ```ts
   onAfterLifeDeath(state, loser, survived) {
     if (survived) return;
     // 把「强运」挂在 state 上由 UI 询问
     state.players.forEach(p => { (p.modData ??= {}).canUseQiangyun = true; });
   }
   ```
3. UI 层读取 `modData.canUseQiangyun` 弹出按钮，玩家点击后调用核心逻辑。

---

## 10. 路线图

- [x] YAML frontmatter 解析
- [x] JSON 数据 + TS 钩子
- [x] 三大注册表（state / phase / echo）
- [x] 加载器 + 优先级
- [x] 接入 `RoundManager` 核心生命周期
- [ ] UI 端回响面板（ActionPanel 扩展位）
- [ ] `onBeforeElection` / `onAfterDraw` / `onBigRoundStart` 等补全
- [ ] 模组热加载（开发模式）
- [ ] 模组商店/启用开关

---

## 附：当前已实现 mod 索引

| 文件 | mod-id | 简介 |
|:---|:---|:---|
| [docs/回响.md](./回响.md) | `huixiang` | 异卷·回响：引入 34 个回响 + 8 个状态 + 1 个新阶段「激发」 |

