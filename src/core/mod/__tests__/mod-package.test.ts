// 验证：协议字段 / scriptPath 字段 / 多文件 mod 工程加载
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadModPackageFromString } from '../package-loader';
import { loadModFromString, DefaultModLoader } from '../mod-loader';

describe('ModPackage 元信息', () => {
  it('sample.mod 应包含 license 与 repo 字段', () => {
    const raw = readFileSync(join(process.cwd(), 'public/mods/sample.mod'), 'utf-8');
    const res = loadModPackageFromString(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pkg.manifest.license).toBe('MIT');
    expect(res.pkg.manifest.repo).toMatch(/^https?:\/\//);
  });

  it('应接受自定义对象形式 license', () => {
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
      script: '',
    });
    const res = loadModPackageFromString(json);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pkg.manifest.license).toEqual({
      name: 'Custom EULA',
      url: 'https://example.com/eula',
    });
  });
});

describe('scriptPath（多文件 mod 工程）', () => {
  it('echo-demo manifest 应能解析，并指向 script.js', () => {
    const raw = readFileSync(
      join(process.cwd(), 'public/mods/echo-demo/manifest.json'),
      'utf-8',
    );
    const res = loadModPackageFromString(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pkg.manifest.id).toBe('echo-demo');
    expect(res.pkg.scriptPath).toBe('./script.js');
    // 内嵌 script 为空，scriptPath 必须存在
    expect(res.pkg.script).toBe('');
  });

  it('echo-demo script.js 加载并 setup 成功', () => {
    const manifestRaw = readFileSync(
      join(process.cwd(), 'public/mods/echo-demo/manifest.json'),
      'utf-8',
    );
    const scriptRaw = readFileSync(
      join(process.cwd(), 'public/mods/echo-demo/script.js'),
      'utf-8',
    );
    // 模拟 base loader：先 parse，再注入 script
    const parsed = loadModPackageFromString(manifestRaw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const combined = { ...parsed.pkg, script: scriptRaw };
    // 通过 mod-loader 的字符串入口走一遍
    const loader = new DefaultModLoader();
    const result = loadModFromString(
      loader,
      JSON.stringify({
        ...combined,
        // 去掉 scriptPath 以避免 fetch 失败（我们已经在内存里提供了 script）
        scriptPath: undefined,
      }),
      'echo-demo',
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    const mods = loader.getActiveMods();
    expect(mods.some((m) => m.id === 'echo-demo')).toBe(true);
  });
});
