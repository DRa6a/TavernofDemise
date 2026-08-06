{
  "format": "tavern-mod",
  "formatVersion": 1,
  "manifest": {
    "id": "sample",
    "name": "示例模组",
    "version": "0.1.0",
    "author": "base",
    "description": "最小化的 mod 模板，演示 setup + 数据注册 + UI 注入。"
  },
  "info": "# 示例模组\n\n展示 mod API 的最小集。\n",
  "data": {
    "abilities": [
      {
        "id": "demo",
        "name": "示例",
        "shortName": "示例",
        "trigger": "play-phase",
        "maxUses": 1,
        "effect": "演示能力（不产生实际效果）"
      }
    ],
    "states": [
      {
        "id": "demo-state",
        "name": "示例状态",
        "description": "演示状态",
        "duration": { "rounds": 1, "unit": "big-round" }
      }
    ]
  },
  "script": "function setup(api) {\n  api.log('sample mod loaded');\n  api.ui.register('game:header-extra', function (ctx) {\n    return api.h('span', { className: 'mod-sample-badge' }, '[sample]');\n  });\n}\n\nfunction onGameStart(state) {\n  /* 进入游戏时的初始化逻辑 */\n}\n"
}
