import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_KEY_PREFIX,
  DEFAULT_SCOPES,
  generateApiKey,
  hashApiKey,
  isApiKeyFormat,
  toBase62,
} from '@/lib/auth/api-keys';

const findApiKeyByHash = vi.fn();
const markApiKeyUsed = vi.fn();

vi.mock('@/lib/db/trove-db', () => ({
  TroveDb: {
    findApiKeyByHash: (...args: unknown[]) => findApiKeyByHash(...args),
    markApiKeyUsed: (...args: unknown[]) => markApiKeyUsed(...args),
  },
}));

describe('API Key', () => {
  it('base62 编码稳定', () => {
    expect(toBase62(Buffer.from([0]))).toBe('0');
    expect(toBase62(Buffer.from([61]))).toBe('z');
    expect(toBase62(Buffer.from([62]))).toBe('10');
  });

  it('生成 trv_ 前缀 + 43 位 base62 的明文', () => {
    const { plaintext } = generateApiKey();
    expect(plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(plaintext.length).toBe(API_KEY_PREFIX.length + 43);
    expect(/^[0-9A-Za-z]+$/.test(plaintext.slice(API_KEY_PREFIX.length))).toBe(true);
  });

  it('前缀是明文的前 12 位', () => {
    const { plaintext, prefix } = generateApiKey();
    expect(prefix).toBe(plaintext.slice(0, 12));
  });

  it('同一明文哈希稳定，不同明文哈希不同', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(hashApiKey(a.plaintext)).toBe(a.hash);
    expect(hashApiKey(a.plaintext)).not.toBe(hashApiKey(b.plaintext));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('每次生成都不同', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().plaintext));
    expect(keys.size).toBe(50);
  });

  it('isApiKeyFormat 只认 trv_ 前缀', () => {
    expect(isApiKeyFormat('trv_abc')).toBe(true);
    expect(isApiKeyFormat('abc')).toBe(false);
    expect(isApiKeyFormat('eyJhbGciOi...')).toBe(false);
  });

  it('默认权限集合包含读写', () => {
    expect(DEFAULT_SCOPES).toContain('items:read');
    expect(DEFAULT_SCOPES).toContain('items:write');
    expect(DEFAULT_SCOPES).toContain('notes:write');
    expect(DEFAULT_SCOPES).toContain('stats:read');
  });
});

describe('resolveAuth', () => {
  beforeEach(() => {
    findApiKeyByHash.mockReset();
    markApiKeyUsed.mockReset();
  });

  it('Bearer trv_… 走 API Key 路径并解析出 userId 与 scopes', async () => {
    const { resolveAuth } = await import('@/lib/auth/resolve');

    findApiKeyByHash.mockResolvedValue({
      id: 'key-1',
      user_id: 'user-42',
      scopes: ['items:read', 'items:write'],
    });

    const req = new Request('https://trove.example.com/api/trove/items', {
      headers: { authorization: 'Bearer trv_abcdefghijklmnop' },
    });

    const auth = await resolveAuth(req);
    expect(auth?.userId).toBe('user-42');
    expect(auth?.mode).toBe('api_key');
    expect(auth?.scopes).toEqual(['items:read', 'items:write']);
    expect(findApiKeyByHash).toHaveBeenCalledOnce();
  });

  it('API Key 查不到 → 返回 null（401）', async () => {
    const { resolveAuth } = await import('@/lib/auth/resolve');

    findApiKeyByHash.mockResolvedValue(null);

    const req = new Request('https://trove.example.com/api/trove/items', {
      headers: { authorization: 'Bearer trv_nonexistent' },
    });

    expect(await resolveAuth(req)).toBeNull();
  });

  it('没有任何凭据 → 返回 null', async () => {
    const { resolveAuth } = await import('@/lib/auth/resolve');

    const req = new Request('https://trove.example.com/api/trove/items');
    expect(await resolveAuth(req)).toBeNull();
  });
});
