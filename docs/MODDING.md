# 终焉酒馆 · 模组扩展 API

> 本文档面向**模组作者**：基座不预装任何异卷/模组内容（包括 UI），但提供一组稳定的扩展点与可复用模板，方便 mod 通过「注册数据 + 注入 UI」的方式接入。

---

## 0. 设计原则

1. **基座零业务**：基座源代码（`src/components/*`、`src/core/engine/*`、`src/core/ai/*`）中**不**出现「回响 / 激发 / 招灾 / 末命」等任何具体 mod 业务概念；只保留通用名 `abilities / states / phases / cards`。
2. **mod 自解释**：相同的接口可被不同 mod 解释为「回响」「技能」「道具」「灵咒」等任意体系，基座不关心语义。
3. **API + 模板**：基座对外提供三类东西——
   - **API**（`api.ts`）：mod 调用基座能力的入口
   - **数据契约**（`types.ts`）：注册数据的形状
   - **UI 模板**（`AbilityPanel.tsx` + `<ModSlot>`）：可复用组件，由 mod 决定是否使用
4. **注入优于硬编码**：mod 的 UI 通过 `api.ui.register(slotId, renderFn)` 注入到基座预留的「槽」中；mod 不直接修改基座源码。

---

## 1. 快速开始

### 1.1 最小 mod 示例

```jsonc
// public/mods/hello.mod
{
  "format": "tavern-mod",
  "formatVersion": 1,
  "manifest": {
    "id": "hello",
    "name": "你好世界",
    "version": "0.1.0",
    "author": "you",
    "description": "一个什么都不做的 mod，演示最小 API。"
  },
  "info": "# 你好世界\n\n只做两件事：注册一个能力 + 注入一段 UI。\n",
  "data": {
    "abilities": [
      {
        "id": "wave",
        "name": "招手",
        "shortName": "招手",
        "trigger": "any",
        "maxUses": 999,
        "effect": "向所有人挥手"
      }
    ]
  },
  "script": "function setup(api) {\n  api.log('hello mod loaded');\n  api.ui.register('game:header-extra', function (ctx) {\n    return { type: 'span', props: { className: 'mod-hello-badge', children: '[hello]' } };\n  });\n}\n"
}
```

加载并挂载：

```ts
import { DefaultModLoader, loadModFromString } from '@/core/mod';
import helloRaw from './hello.mod?raw';

const loader = new DefaultModLoader();
const result = loadModFromString(loader, helloRaw, 'hello.mod');
if (!result.ok) {
  console.error('加载失败', result.errors);
  return;
}

// 游戏启动时注入
new RoundManager({ random, modLoader: loader });
```

---

## 2. 包格式（.mod）

> 一个 `.mod` 文件 = 一个 JSON 信封，物理分隔「元数据 / 信息 / 数据 / 脚本 / 资源」。

```ts
interface ModPackage {
  format: 'tavern-mod';                 // 必填：包格式标识
  formatVersion: 1;                     // 必填：当前仅支持 1
  manifest: ModManifest;                // 必填：元数据
  info: string;                         // 可选：Markdown 文本说明
  data: ModData;                        // 可选：注册到游戏的结构化数据
  script: string;                       // 可选：JavaScript 源代码（钩子 + setup）
  assets?: ModPackageAsset[];           // 可选：base64 资源
}
```

`ModData` 字段：

| 字段 | 含义 | 由谁解释 |
|:---|:---|:---|
| `abilities` | 能力列表 | mod（基座只做「trigger 匹配 + 暂停游戏」） |
| `states` | 玩家状态 | mod（基座只展示徽章） |
| `phases` | 自定义阶段 | mod（基座只做「插入点 + 阻塞」） |
| `cards` | 自定义卡牌 | 基座（加入牌堆） |
| `custom` | 任意扩展 | mod（自行管理） |

---

## 3. 注入槽（UI Slots）

> 基座在固定位置放 `<ModSlot slot="..." />`；mod 通过 `api.ui.register(slotId, fn)` 注入渲染函数，基座会自动叠加。

| 槽 ID | 位置 | 用途 |
|:---|:---|:---|
| `start-screen:actions` | 开始界面的「加载按钮」区 | mod 提供自定义的「从远端 / 拖拽」加载入口 |
| `start-screen:mod-list` | 已加载 mod 列表的每一行 | mod 在每行加自定义操作（开关、配置等） |
| `game:header-extra` | 游戏 header 右侧 | mod 加自定义按钮（菜单、提示、关于） |
| `player-seat:badges` | 玩家座位上 | mod 在每位玩家旁加自定义徽章（不用「状态」机制） |
| `player-seat:abilities` | 玩家座位上 | mod 自定义能力条（默认走基座 `AbilityPanel`） |
| `action-area:side` | 主操作区（出牌/质疑）旁边 | mod 加自定义按钮 / 提示 / 选项 |
| `table-center:overlay` | 牌桌中央覆盖层 | mod 注册的阻塞阶段 UI（如「激发回合」） |
| `overlay:pause` | 全屏暂停覆盖层 | mod 自定义「结算后请继续」样式 |
| `log:extra-entry` | 游戏日志 | mod 在每条日志后追加条目 |

### 3.1 渲染函数签名

```ts
type SlotRenderFn = (ctx: SlotRenderContext) => ReactNode;

interface SlotRenderContext {
  state: GameState;            // 当前游戏状态
  humanPlayer?: Player;        // 当前人类玩家
  perspective: 'human' | 'all';// 视角
  phase: PhaseController;      // mod 控制阻塞阶段
}
```

### 3.2 示例：注入一个「关于」按钮到 header

```ts
function setup(api) {
  api.ui.register('game:header-extra', function (ctx) {
    return {
      type: 'button',
      props: {
        className: 'btn-text',
        onClick: function () { alert('异卷·回响 v3.5'); },
        children: '关于本模组',
      },
    };
  });
}
```

> 注意：`renderFn` **必须返回 React 元素**（或 `null`）。基座把它们放在一个 React Fragment 里叠加渲染。

---

## 4. API 总览

mod 在 `setup(api)` 收到 `api: ModApi`：

```ts
interface ModApi {
  log(message: string, ...args: unknown[]): void;
  log.debug(message, ...args): void;   // debug 级别
  log.warn(message, ...args): void;    // warn 级别
  log.error(message, ...args): void;   // error 级别

  // 三个注册表（mod 主动注册，基座聚合）
  abilities: AbilityRegistry;
  states: PlayerStateRegistry;
  phases: PhaseRegistry;

  // 注册自定义卡牌（与 data.cards 等价，但允许运行时调用）
  registerCards(cards: Card[]): void;

  // 玩家维度 API
  player: {
    addState(player, stateId, rounds?): void;
    clearState(player, stateId): void;
    hasState(player, stateId): boolean;
    getModData<T>(player, key): T | undefined;
    setModData(player, key, value): void;
  };

  // UI 注入
  ui: {
    register(slotId, render): void;
    unregister(slotId, render): void;
  };

  // 阻塞阶段控制
  phase: {
    isActive(phaseId): boolean;
    complete(): void;            // 完成阻塞阶段
    reroll?(playerId, abilityId): boolean;  // 重抽（语义由 mod 解释）
    useAbility?(playerId, abilityId, targetId?): { ok: boolean; reason?: string };
  };

  // 当前游戏状态（基座在每个钩子前自动更新）
  state: GameState | null;
}
```

> `api.log(...)` 走基座的 `ModLogBuffer`，**默认不输出到 console**——所有日志条目进入缓冲，UI 通过「模组日志」面板读取，并可由用户切换级别。`api.log.debug / .warn / .error` 同理。详见 §11。

### 4.0 写 UI：`api.h`（无 JSX 也能用）

mod 脚本跑在 `new Function` 沙箱里，**没有 JSX 编译**。构造 UI 元素请用 `api.h(type, props, ...children)`，它是 `React.createElement` 的薄包装：

```js
function setup(api) {
  api.ui.register('game:header-extra', function (ctx) {
    return api.h('div', { className: 'my-mod-block' },
      api.h('span', null, 'hello '),
      api.h('strong', null, ctx.humanPlayer?.name ?? '?'),
      api.h('button', {
        type: 'button',
        className: 'btn-text',
        onClick: function () { api.log('clicked'); },
      }, '点我')
    );
  });
}
```

> 习惯 JSX 的开发者可以这样想：`api.h('div', { ... }, a, b)` ≈ `<div {...}>{a}{b}</div>`。

`api.h` 在所有 slot 渲染函数里都能用（通过闭包捕获 `api`）。

### 4.0.1 维护 mod 本地 UI state：闭包 + `api.debug.bumpRender()`

mod 的 render 函数每次都会被基座重跑（游戏 state 变化时），所以**不能用** `useState`。
典型做法：在 `setup` 里用闭包持有 `var open = false`，state 变化时调 `api.debug.bumpRender()`：

```js
function setup(api) {
  var open = false;
  function toggle() { open = !open; api.debug.bumpRender(); }

  api.ui.register('game:header-extra', function () {
    return api.h('div', null,
      api.h('button', { onClick: toggle }, open ? '收起' : '展开'),
      open ? api.h('div', { className: 'panel' }, '内容…') : null
    );
  });
}
```

`api.debug.bumpRender()` 让所有 `<ModSlot>` 重建——mod 不需要把 state 存到游戏 store 里。

### 4.0.2 旁路：直接改 store（`api.debug.*`）

基座提供一个**调试**子命名空间，绕过正常 UI 协议直接读写 store：

| API | 作用 |
|:---|:---|
| `api.debug.setRevealAll(v)` | 翻开/隐藏 所有牌 |
| `api.debug.isRevealAll()` | 当前是否翻开所有牌 |
| `api.debug.modifyHand(p, 'remove')` | 移除玩家最后一张手牌 |
| `api.debug.modifyHand(p, { replaceId, newCard })` | 替换指定 id 的手牌 |
| `api.debug.bumpRender()` | 让所有 mod UI 槽重渲染（详见上） |

> 调试 mod 用完即弃，**不**要让生产 mod 把它当公共 API。
> 参考实现见 [public/mods/debug.mod](../../public/mods/debug.mod)（自带「翻开所有牌 / 减少手牌 / 替换相位」三个开关）。

### 4.1 能力注册表

```ts
interface AbilityDefinition {
  id: string;                   // 必填，全局唯一
  name: string;                 // 必填，展示名
  shortName?: string;           // 可选，2~4 字
  trigger: AbilityTrigger;      // 必填，使用时机
  maxUses: number;              // 必填，最大次数
  effect: string;               // 必填，效果说明（tooltip）
  requiresTarget?: boolean;     // 是否需要选目标
  meta?: Record<string, unknown>;// mod 自取；基座会读 meta.aiWeight
}
```

`AbilityTrigger` 取值：

| 值 | 默认亮起条件 | 含义 |
|:---|:---|:---|
| `play-phase` | playing / opening | 出牌回合 |
| `open-phase` | playing / opening | 开牌回合 |
| `small-round` | playing / opening | 小回合内 |
| `big-round` | playing / opening | 大回合内 |
| `life-death` | life_death | 生死回合 |
| `before-life-death` | life_death | 生死回合前 |
| `after-life-death` | playing / opening | 上一生死回合后 |
| `before-draw` | playing / opening | 抽牌回合前 |
| `when-die` | **不亮起** | 死亡时自动触发（被动） |
| `any` | 总是 | 任意时机 |
| `custom` | **不亮起** | 由 mod 通过 `isAvailable` 自行控制 |

> `when-die` 与 `custom` 默认不在通用 UI 面板里主动亮起；mod 可以在 `isAvailable` 自定义条件（见 §5）。

### 4.2 状态注册表

```ts
interface PlayerStateEffect {
  id: string;
  name: string;
  description: string;
  duration: 'forever' | { rounds: number; unit: 'big-round' | 'play-turn' };
  locked?: boolean;             // 「锁定」语义，不可被「忘忧」类解除
  skipPlay?: boolean;
  skipChallenge?: boolean;
  blind?: boolean;              // 不能看自己手牌（基座已支持）
  muteAbilities?: boolean;
  dreamDisorient?: boolean;
  lockPlayCountToLast?: boolean;
  pairedWith?: string;
  allBeastsDead?: boolean;
  lingerRounds?: number;
}
```

### 4.3 阶段注册表

```ts
interface PhaseDefinition {
  id: string;
  name: string;
  insertAt:
    | 'before-election' | 'after-draw' | 'before-play'
    | 'after-open' | 'after-life-death' | 'custom';
  blocking: boolean;            // 是否阻塞主循环
  description: string;
}
```

> **基座仅消费 `before-election` 的 blocking 阶段**（通过 `state.phase = 'inspiring'` + `modData.customPhase` 暴露给 mod）。其他插入点作为扩展位预留。

---

## 5. UI 模板：AbilityPanel

> 基座提供一个「能力面板」模板（`src/components/AbilityPanel.tsx`），可被 mod **直接使用** 或 **完全替换**（通过 `api.ui.register('action-area:side', ...)` 注入自己的版本）。

```tsx
import { AbilityPanel } from '@/components/AbilityPanel';

// 在你的 UI 注入里：
api.ui.register('action-area:side', function (ctx) {
  return <AbilityPanel
    player={ctx.humanPlayer!}
    allPlayers={ctx.state.players}
    phase={ctx.state.phase}
    abilityDefs={/* 来自 mod 自己维护的列表 */}
    onUseAbility={(p, id, t) => api.phase.useAbility?.(p.id, id, t?.id) ?? { ok: false }}
  />;
});
```

`AbilityPanel` 的可定制点（全部可选）：

- `isAvailable(def, ctx)`：自定义「该能力当前是否可用」
- `renderChip(def, owned)`：自定义单个能力 chip 的渲染
- `renderTargetPicker({ ability, players, onPick })`：自定义目标选择器
- `owned`：自定义「玩家已拥有能力」的形状（默认从 `player.modData.abilities` 读）
- `title`：默认「能力」

---

## 6. 生命周期钩子

> mod 可以在 `script` 顶层声明以下函数（不需要 `setup`），基座会在对应时机调用：

| 钩子 | 时机 | 典型用途 |
|:---|:---|:---|
| `onBeforeGameStart(state)` | startGame 玩家初始化后 | 清理 modData |
| `onGameStart(state)` | 同上之后 | 初始化全局数据 |
| `onBeforeElection(state)` | 选举首位玩家前 | 派发初始能力 / 抽卡 |
| `onBeforeDraw(state)` | 抽牌前 | 修改牌堆、屏蔽视觉 |
| `onAfterDraw(state)` | 抽牌后 | 给特定玩家发牌 |
| `onBeforePlay(state, player, cardIds)` | 出牌前 | 校验 / 拦击 |
| `onAfterPlay(state, player, cards)` | 出牌后 | 记录、副作用 |
| `onBeforeOpen(state)` | 开牌前 | 设置标志位（自我质疑） |
| `onAfterOpen(state, isFake)` | 开牌后 | 应用状态 |
| `onBeforeLifeDeath(state, loser)` | 生死判定前 | 强制改面（天行健） |
| `onAfterLifeDeath(state, loser, survived)` | 生死判定后 | 复活、末命 |
| `onPlayerDied(state, player)` | 玩家死亡时 | 被动技能触发 |
| `onPlayerRevived(state, player)` | 玩家复活时 | 清理「末命」 |
| `onBigRoundStart(state, round)` | 大回合开始 | 递减状态、初始化 |
| `onBigRoundEnd(state, round)` | 大回合结束 | 清理 |

> 钩子**按 priority 降序**调用，相同 priority 按加载顺序。

### 6.1 阻塞阶段协议

mod 在 `data.phases` 中声明 `insertAt: 'before-election'` + `blocking: true` 的阶段，基座会：
1. 把 `state.phase` 切到 `INSPIRING`
2. 写入 `state.modData.customPhase = phase.id`
3. 触发 `INSPIRE_PHASE_STARTED` 事件
4. **等待** mod 在 UI 中调 `api.phase.complete()` 继续

mod 调 `api.phase.complete()` 后：
- 基座清掉 `modData.customPhase`
- 进入 `electFirstPlayer()`

> 推荐在 `setup(api)` 中通过 `api.ui.register('table-center:overlay', ...)` 提供阻塞阶段 UI。

---

## 7. AI 兼容性

基座 AI（`BaseStrategy`）会自动按 `meta.aiWeight`（默认 5）排序决定是否使用 mod 注册的能力：
- 命中率 = `weight / 120`，最高 0.6
- `requiresTarget: true` 时随机选一个其它存活玩家
- `trigger === 'when-die'` / `'custom'` 不主动使用

> mod 想给某项能力更高优先级：在 `data.abilities[i].meta.aiWeight = 30` 即可。

---

## 8. 调试技巧

| 问题 | 排查 |
|:---|:---|
| 加载失败 | 看 `result.errors`，逐条修复（YAML / JSON / 缺字段） |
| 钩子没触发 | 确认 `RoundManager` 构造时传了 `modLoader` |
| 能力不亮起 | `trigger` 是否在 `isTriggerOkByDefault` 默认亮起集合内；或自己提供 `isAvailable` |
| UI 没出现 | `api.ui.register` 是否放在 `setup(api)` 中；`slotId` 是否拼写正确 |
| AI 不用能力 | 调高 `meta.aiWeight`；或确认 `trigger !== 'when-die' && trigger !== 'custom'` |
| 数据没生效 | 用 `loader.getActiveMods()` 检查 mod 是否真的注册 |

---

## 9. 完整示例：异卷·回响

> 完整源代码见 [`docs/回响.md`](../回响.md)。
> 它演示了：
> - 34 个 abilities（基座 + 2 个 trigger 维度）
> - 8 个 states（含 `locked` / `dreamDisorient` / `pairedWith` / `allBeastsDead` / `lingerRounds`）
> - 1 个 phase（`before-election` blocking）
> - 9 个生命周期钩子
> - 7 个 UI 注入点

---

## 10. 基座「不提供」清单

以下能力**基座不提供**，由 mod 自己实现：
- 卡牌视觉/图片（mod 通过 `assets` 自带）
- 多语言（mod 自己用 `i18n` 字段）
- 平衡性调整（如「招灾」是否锁定，由 mod 写状态；基座不参与）
- 死亡/复活的「视觉」动画（基座只提供 `state.modData` 标记，UI 自己决定）
- 跨 mod 通信（通过 `state.modData` / `player.modData` 约定 key）

---

## 11. 模组日志系统（受控的日志输出）

> 基座**不再直接** `console.log` 任何 mod 相关消息。所有日志统一进入一个
> **可被 UI 读取的环形缓冲**（`ModLogBuffer`），由玩家在「模组日志」面板里
> 自行决定是否查看、以及以什么级别查看。

### 11.1 写在 mod 里

`api.log` 是一个既能被当函数调用、又挂了 `.debug / .warn / .error` 子方法的对象：

```ts
api.log('玩家使用了招灾');           // info 级别
api.log.debug('调试信息', someValue); // debug 级别
api.log.warn('数值越界', n);         // warn 级别
api.log.error('onBeforePlay 抛错', e); // error 级别
```

无论用哪一种，mod 都只是把「一条日志条目」**塞进** ModLogBuffer。
是否真正输出到 console 取决于 UI 端的级别设置（见下）。

### 11.2 日志级别

| 级别 | 含义 | 何时会输出 |
|:---|:---|:---|
| `silent` | 静默 | 永远不输出（缓冲仍然记录，但不会进入 console sink） |
| `error` | 错误 | 只有 error |
| `warn` | 警告 | error + warn |
| `info` | 信息（默认） | error + warn + info |
| `debug` | 调试 | 全部 |

### 11.3 谁来消费

基座默认提供一个 **silent sink**——什么都不做。调用方（一般是 UI / 启动脚本）
通过 `ModLoader` 的 API 决定如何消费：

```ts
// 1) 拉历史
const entries = loader.getLogEntries();   // ModLogEntry[]

// 2) 订阅实时
const off = loader.subscribeLog((entry) => {
  // entry: { ts, level, source, message, args }
  console.log(`[${entry.source}] ${entry.message}`);
});

// 3) 切换级别
loader.setLogLevel('debug');   // 'silent' | 'error' | 'warn' | 'info' | 'debug'

// 4) 替换 sink：把日志打到 console（带 level 路由）
loader.setLogSink(createConsoleLogger('info'));
//   createConsoleLogger: error→console.error, warn→console.warn, 其它→console.log

// 5) 清空
loader.clearLog();
```

基座的 `DefaultModLoader` 已经实现了上述 API（见 `ModLoader` 接口）。

### 11.4 UI 面板

游戏内 / 开始界面的右上角都带一个「模组日志 (n)」按钮：
- 点击展开抽屉，显示当前缓冲里的全部条目（带时间、来源、消息）
- 顶部下拉切换级别（默认 `info`）
- 「清空」按钮可清空缓冲
- 实时滚动到底部

缓冲最多保留 200 条；超出时按 FIFO 丢弃最早条目。

### 11.5 设计要点

1. **基座不强加 console 行为**：基座源码里不写 `console.log`；由 UI / 调用方注入 sink。
2. **级别只控制 sink，不影响缓冲**：UI 把级别调到 `silent` 时，缓冲仍然记录，**只是不再打到 console**——方便后期「复现」问题。
3. **订阅是 fire-and-forget**：订阅者抛错不影响其它订阅者；ModLogBuffer 会捕获并吞掉。
4. **历史可回放**：通过 `getLogEntries()` 拿到的是**当前缓冲的快照**（不是引用），订阅适用于实时增量。

---

## 附：API 速查表

```ts
// 注册数据
api.abilities.register({ id, name, trigger, maxUses, effect, ... });
api.states.register({ id, name, duration, ... });
api.phases.register({ id, name, insertAt, blocking, ... });

// 玩家状态
api.player.addState(player, 'shimang', 1);
api.player.clearState(player, 'shimang');
api.player.hasState(player, 'shimang');

// 自定义数据
api.player.setModData(player, 'abilities', [{ id, remaining }]);
const list = api.player.getModData<...>(player, 'abilities');

// UI 注入
api.ui.register('game:header-extra', (ctx) => <MyButton />);
api.ui.unregister('game:header-extra', myFn);

// 阻塞阶段
api.phase.isActive('inspire');
api.phase.complete();
api.phase.useAbility?.(player.id, 'tannang', target?.id);

// 读当前 state
const truth = api.state?.truthPhase;

// 受控日志（不直接 console.log；详见 §11）
api.log('普通信息');
api.log.debug('调试信息');
api.log.warn('警告');
api.log.error('错误');
```
