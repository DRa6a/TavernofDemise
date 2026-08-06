"use strict";
// 真 .ts 文件：IDE 会用 tavern-mod-api.d.ts 给出 `api` 的完整类型。
// 这个文件是脚本的「源码」；构建产物 script.js 跟 manifest.json 一起发布。
function setup(api) {
    api.log('echo-demo loaded');
    api.ui.register('game:header-extra', function (ctx) {
        return api.h('span', { className: 'mod-echo-badge' }, '[echo-demo]');
    });
}
function onGameStart(state) {
    /* 注释、跳转、查找引用……IDE 全功能都可用 */
}
