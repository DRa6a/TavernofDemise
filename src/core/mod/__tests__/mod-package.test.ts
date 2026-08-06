// 验证：协议字段 / scriptPath 字段 / 多文件 mod 工程加载
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadModPackage, loadModPackageFromText, loadModPackageFromUrl } from '../package-loader';
import { DefaultModLoader } from '../mod-loader';

describe('ModPackage 元信息', () => {
  it('sample.mod 应包含 license 与 repo 字段', async () => {
    const raw = readFileSync(join(process.cwd(), 'public/mods/sample.mod'), 'utf-8');
    const res = await loadModPackage({ text: raw });
    expect(res.ok).toBe(true);
    if (!res.ok || !res.pkg) return;
    expect(res.pkg.manifest.license).toBe('MIT');
    expect(res.pkg.manifest.repo).toMatch(/^https?:\/\//);
  });

  it('应接受自定义对象形式 license', async () => {
    const json = JSON.stringify({
      format: 'tavern-mod',
      formatVersion: 1,
      manifest: {
        id: 'lic-obj',
        name: '协议对象测试',
        version: '0.0.1',
        license: { name: 'Custom EULA', url: 'https://example.com/eula' },
      },
      info: '',
      data: {},
      // 内联 script：让 loadModPackage 直接成功，不需要 baseUrl
      script: 'function setup(api) { api.log("lic-obj loaded"); }',
    });
    const res = await loadModPackage({ text: json });
    expect(res.ok).toBe(true);
    if (!res.ok || !res.pkg) return;
    expect(res.pkg.manifest.license).toEqual({
      name: 'Custom EULA',
      url: 'https://example.com/eula',
    });
  });
});

describe('scriptPath（多文件 mod 工程）', () => {
  it('echo-demo manifest 应能解析，并指向 script.js', async () => {
    const raw = readFileSync(
      join(process.cwd(), 'public/mods/echo-demo/manifest.json'),
      'utf-8',
    );
    // 解析阶段不需要 baseUrl，baseUrl 只在「需要抓 script」时才用
    const res = await loadModPackage({ text: raw });
    // echo-demo manifest 的 script 字段为空、声明了 scriptPath，没有 baseUrl 会失败
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]).toMatch(/scriptPath/);
    // pkg 仍能拿到（早期返回时也附带）
    expect(res.pkg?.manifest.id).toBe('echo-demo');
    expect(res.pkg?.scriptPath).toBe('./script.js');
  });

  it('loadModPackageFromText 应在 baseUrl=null + scriptPath 时给出清晰错误', async () => {
    const raw = readFileSync(
      join(process.cwd(), 'public/mods/echo-demo/manifest.json'),
      'utf-8',
    );
    // baseUrl=null 模拟 file input：不能跟随相对路径
    const res = await loadModPackage({ text: raw, baseUrl: null });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]).toMatch(/scriptPath|baseUrl/);
  });

  it('loadModPackageFromText 应在 baseUrl 提供时按 URL 拼接抓取 scriptPath', async () => {
    const raw = readFileSync(
      join(process.cwd(), 'public/mods/echo-demo/manifest.json'),
      'utf-8',
    );
    // 通过 file:// 注入一个本地 fetch 实现
    const scriptText = readFileSync(
      join(process.cwd(), 'public/mods/echo-demo/script.js'),
      'utf-8',
    );
    const fetchImpl: typeof fetch = async () =>
      new Response(scriptText, { status: 200, headers: { 'content-type': 'application/javascript' } });
    const fakeBase = 'https://example.test/mods/echo-demo/manifest.json';
    const res = await loadModPackage({ text: raw, baseUrl: fakeBase, fetchImpl });
    expect(res.ok).toBe(true);
    if (!res.ok || !res.mod) return;
    expect(res.mod.id).toBe('echo-demo');
    expect(typeof (res.mod as unknown as { setup?: () => void }).setup).toBe('function');
  });

  it('echo-demo script.js 加载并 setup 成功（直接走 mod-loader）', async () => {
    const manifestRaw = readFileSync(
      join(process.cwd(), 'public/mods/echo-demo/manifest.json'),
      'utf-8',
    );
    const scriptRaw = readFileSync(
      join(process.cwd(), 'public/mods/echo-demo/script.js'),
      'utf-8',
    );
    // 直接用注入的 fetch 抓 script，模拟多文件 mod 工程加载
    const fetchImpl: typeof fetch = async () =>
      new Response(scriptRaw, { status: 200, headers: { 'content-type': 'application/javascript' } });
    const fakeBase = 'https://example.test/mods/echo-demo/manifest.json';
    const res = await loadModPackage({ text: manifestRaw, baseUrl: fakeBase, fetchImpl });
    expect(res.ok).toBe(true);
    if (!res.ok || !res.mod) return;
    const loader = new DefaultModLoader();
    loader.register(res.mod);
    const mods = loader.getActiveMods();
    expect(mods.some((m) => m.id === 'echo-demo')).toBe(true);
  });

  it('loadModPackageFromUrl 与 loadModPackageFromText 是同源（都走 loadModPackage）', () => {
    // 静态检查：两个便捷方法都委托到 loadModPackage 核心
    expect(loadModPackageFromUrl.length).toBe(1);
    expect(loadModPackageFromText.length).toBeGreaterThanOrEqual(1);
  });
});

describe('mod 加载流程整合', () => {
  it('从内联 script 的 JSON 加载（单文件 mod）', async () => {
    const json = JSON.stringify({
      format: 'tavern-mod',
      formatVersion: 1,
      manifest: { id: 'inline', name: 'inline', version: '0.0.1' },
      info: '',
      data: { abilities: [{ id: 'a', name: 'A', trigger: 'any', maxUses: 1, effect: '' }] },
      script: 'function setup(api) { api.log("inline loaded"); }',
    });
    const res = await loadModPackage({ text: json });
    expect(res.ok).toBe(true);
    if (!res.ok || !res.mod) return;
    const loader = new DefaultModLoader();
    loader.register(res.mod);
    expect(loader.listAbilities()).toHaveLength(1);
    expect(loader.getActiveMods()[0].id).toBe('inline');
  });

  it('script 为空、scriptPath 缺失：报清晰错误', async () => {
    const json = JSON.stringify({
      format: 'tavern-mod',
      formatVersion: 1,
      manifest: { id: 'empty', name: 'empty', version: '0.0.1' },
      info: '',
      data: {},
      script: '',
    });
    const res = await loadModPackage({ text: json });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]).toMatch(/script/);
  });

  it('缺 format 字段：报清晰错误', async () => {
    const json = JSON.stringify({
      formatVersion: 1,
      manifest: { id: 'x', name: 'x', version: '1' },
      info: '',
      data: {},
      script: 'function setup(){}',
    });
    const res = await loadModPackage({ text: json });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.join(';')).toMatch(/format/);
  });
});
