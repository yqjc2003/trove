import { describe, expect, it } from 'vitest';
import configuredAliases from '../../skills/catch-and-linger/data/tag-aliases.json';

import {
  baseNormalize,
  similarityKey,
  resolveTags,
  findNearDuplicates,
} from '../../skills/catch-and-linger/scripts/tag-matching.mjs';

/**
 * Skill 里的标签归一逻辑（skills/catch-and-linger/scripts/tag-matching.mjs）。
 *
 * 这是「新增标签前先查既有标签」那道闸门的核心，必须离线可测。
 * 真实标签空间长这样：学习×137 / java×13 / gis×3 / java并发×11 / springboot×2 …
 */

const EXISTING = [
  { name: '学习', count: 137 },
  { name: 'java', count: 13 },
  { name: '并发', count: 3 },
  { name: 'java并发', count: 11 },
  { name: 'spring boot', count: 7 },
  { name: 'springboot', count: 2 },
  { name: 'gis', count: 3 },
  { name: 'gis数据', count: 1 },
  { name: 'jdk', count: 1 },
  { name: 'jdk8', count: 1 },
  { name: 'idea', count: 2 },
  { name: 'intellij idea', count: 1 },
  { name: 'docker', count: 12 },
  { name: 'dockerfile', count: 1 },
  { name: 'java nio', count: 1 },
  { name: '数据库', count: 2 },
];

const ALIASES = {
  equivalent: [
    { canonical: 'jdk', members: ['jdk', 'jdk8'] },
    { canonical: 'gis', members: ['gis', 'gis数据'] },
    { canonical: 'idea', members: ['idea', 'intellij idea'] },
    { canonical: 'spring boot', members: ['spring boot', 'springboot'] },
    { canonical: '并发', members: ['并发', 'java并发'] },
  ],
  related: [
    { canonical: 'java', members: ['java', 'java nio', 'java并发'] },
    { canonical: 'docker', members: ['docker', 'dockerfile'] },
  ],
  avoid: ['掘金'],
};

const resolveOne = (tag: string) => {
  const [r] = resolveTags([tag], EXISTING, ALIASES);
  return r;
};

describe('tag-matching · 归一', () => {
  it('baseNormalize 与服务端一致：小写、去 #、折叠空白', () => {
    expect(baseNormalize('  #Spring Boot ')).toBe('spring boot');
    expect(baseNormalize('GIS　数据')).toBe('gis 数据');
  });

  it('similarityKey 抹掉分隔符，识别同一个词的不同写法', () => {
    expect(similarityKey('spring boot')).toBe('springboot');
    expect(similarityKey('springboot')).toBe('springboot');
    expect(similarityKey('Spring-Boot')).toBe('springboot');
    expect(similarityKey('intellij idea')).toBe('intellijidea');
  });
});

describe('tag-matching · 解析候选标签', () => {
  it('归一后同词 → 复用既有那个（统一拼写）', () => {
    const r = resolveOne('springboot');
    expect(r.action).toBe('reuse');
    // 既有两条同 key，取用得更多的「spring boot」
    expect(r.resolved).toBe('spring boot');
  });

  it('等价组 → 统一到 canonical，不新造第三种写法', () => {
    expect(resolveOne('jdk8').resolved).toBe('jdk');
    expect(resolveOne('gis数据').resolved).toBe('gis');
    expect(resolveOne('intellij idea').resolved).toBe('idea');
    expect(resolveOne('java并发').resolved).toBe('并发');
  });

  it('同族但不等价 → 只给候选，绝不自动替换', () => {
    // 「jvm」本身还没被用过，但同族的「jvm gc」在 —— 只能提示，不能自动顶替
    const [r] = resolveTags(
      ['jvm'],
      [{ name: 'jvm gc', count: 1 }],
      { equivalent: [], related: [{ canonical: 'jvm', members: ['jvm', 'jvm gc'] }] },
    );
    expect(r.action).toBe('candidate');
    expect(r.candidates.map((c: { name: string }) => c.name)).toContain('jvm gc');
  });

  it('不同概念的同族标签各自独立（dockerfile ≠ docker）', () => {
    const r = resolveOne('dockerfile');
    expect(r.action).toBe('reuse');
    expect(r.resolved).toBe('dockerfile');
    // docker 仍然是候选之一，但不顶替
    expect(r.candidates.map((c) => c.name)).toContain('docker');
  });

  it('上下位关系 → candidate，由调用方判断能否通用', () => {
    const r = resolveOne('向量数据库');
    expect(r.action).toBe('candidate');
    expect(r.resolved).toBe('数据库');
    expect(r.reason).toContain('上位概念');
  });

  it('确实没有相近的 → new', () => {
    const r = resolveOne('向量检索');
    expect(r.action).toBe('new');
    expect(r.resolved).toBeNull();
  });

  it('批量解析会去重（同一个词只查一次）', () => {
    const results = resolveTags(['SpringBoot', 'spring boot', 'SPRINGBOOT'], EXISTING, ALIASES);
    expect(results).toHaveLength(1);
    expect(results[0].resolved).toBe('spring boot');
  });
});

describe('tag-matching · 输出语言', () => {
  const bilingual = [
    { name: '数据库', count: 20 },
    { name: 'database', count: 2 },
  ];

  it('英文收录不被中文 canonical 覆盖，仍复用已有英文拼写', () => {
    const [result] = resolveTags(['Database'], bilingual, configuredAliases, { locale: 'en-US' });
    expect(result.action).toBe('reuse');
    expect(result.resolved).toBe('database');
    expect(result.candidates.map((tag) => tag.name)).not.toContain('数据库');
  });

  it('只有中文同义词时，允许为英文收录新增英文标签', () => {
    const [result] = resolveTags(['database'], bilingual.slice(0, 1), configuredAliases, { locale: 'en' });
    expect(result.action).toBe('new');
    expect(result.resolved).toBeNull();
  });

  it('中文候选不会复用英文通用主题，技术名称仍可复用', () => {
    const results = resolveTags(['数据库', 'Java'], [
      { name: 'database', count: 20 },
      { name: 'java', count: 5 },
    ], configuredAliases, { locale: 'zh-CN' });
    expect(results[0].action).toBe('new');
    expect(results[1].resolved).toBe('java');
  });

  it('繁体中文候选不强制转成英文标签', () => {
    const [result] = resolveTags(['資料庫'], [{ name: '資料庫', count: 1 }], configuredAliases, { locale: 'zh-TW' });
    expect(result.resolved).toBe('資料庫');
  });

  it('英文模式拒绝中文候选，要求 Agent 先按目标语言选词', () => {
    expect(() => resolveTags(['数据库'], bilingual, configuredAliases, { locale: 'en-US' }))
      .toThrow('INVALID_TAG_LANGUAGE');
  });

  it('不传语言时保留旧匹配行为，非法语言显式报错', () => {
    expect(resolveTags(['database'], bilingual, configuredAliases)[0].resolved).toBe('数据库');
    expect(() => resolveTags(['database'], bilingual, configuredAliases, { locale: 'fr-FR' }))
      .toThrow('UNSUPPORTED_LOCALE');
  });
});

describe('tag-matching · 审计近重复', () => {
  const groups = findNearDuplicates(EXISTING, ALIASES);

  it('找出归一后同词的写法', () => {
    const sameKey = groups.find((g: { kind: string }) => g.kind === 'same-key');
    expect(sameKey?.members.map((m: { name: string }) => m.name).sort()).toEqual([
      'spring boot',
      'springboot',
    ]);
  });

  it('找出等价组', () => {
    const alias = groups.filter((g: { kind: string }) => g.kind === 'alias');
    const gis = alias.find((g: { canonical?: string }) => g.canonical === 'gis');
    expect(gis?.members.map((m: { name: string }) => m.name).sort()).toEqual(['gis', 'gis数据']);
  });

  it('同族组与上下位关系也会被列出来', () => {
    expect(groups.some((g: { kind: string }) => g.kind === 'related')).toBe(true);
  });

  it('长度差 <2 的包含关系不算上下位（避免噪音）', () => {
    const noisy = findNearDuplicates(
      [
        { name: 'ab', count: 1 },
        { name: 'abc', count: 1 },
      ],
      { equivalent: [], related: [] },
    );
    expect(noisy.filter((g: { kind: string }) => g.kind === 'related')).toHaveLength(0);
  });

  it('长度差够大的包含关系算上下位', () => {
    const found = findNearDuplicates(
      [
        { name: 'jvm', count: 1 },
        { name: 'jvmgc', count: 1 },
      ],
      { equivalent: [], related: [] },
    );
    expect(found.filter((g: { kind: string }) => g.kind === 'related')).toHaveLength(1);
  });
});
