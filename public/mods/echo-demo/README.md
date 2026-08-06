# echo-demo · 多文件 mod 工程示例

展示「**真 .ts 文件 + scriptPath**」开发模式：

- `manifest.json` —— 元数据 + 数据 + `scriptPath` 引用 `script.js`
- `script.ts` —— 你写代码的地方，IDE 走 `tavern-mod-api.d.ts` 给完整补全
- `script.js` —— `tsc` 编译产物，基座加载时由 manifest URL 拉取
- `tavern-mod-api.d.ts` —— 从 [public/mods/tavern-mod-api.d.ts](../../tavern-mod-api.d.ts) 复制过来

## 构建

```bash
# 在本目录执行（tsconfig.json 自带）
npx tsc
```

## 加载

把整个 `echo-demo` 目录放到任意 HTTP 静态服务器（GitHub Pages、Vercel、本地 `python -m http.server` 都可以），然后在基座「模组管理」页的「从 URL 加载多文件 mod 工程」输入框里贴 `manifest.json` 的 URL，例如：

```
http://localhost:8000/echo-demo/manifest.json
```

基座会先抓 manifest，再按 `scriptPath` 抓 `script.js`，然后像普通 mod 一样运行。
